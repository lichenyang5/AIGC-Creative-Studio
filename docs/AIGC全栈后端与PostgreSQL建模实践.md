# 从图片生成任务到用户隔离：AIGC Creative Studio 后端与 PostgreSQL 建模实践

> 一篇面向全栈工程师面试与技术复盘的实践文章：使用 Express + TypeScript + PostgreSQL 搭建 AIGC 图片创作后端，处理任务状态、用户认证、图片文件存储、编辑作品回存，以及本地 Docker 可复现开发环境。

很多 AIGC 项目的第一版都很快：前端填一个 Prompt，后端调一次模型接口，把 URL 返回给页面。真正继续做下去时，问题才会出现：生成需要几十秒怎么办？链接过期怎么办？用户 A 能否访问用户 B 的图片？编辑后的图片存在哪里？重启服务后任务是否还在？新电脑如何快速启动开发环境？

本文基于 **AIGC Creative Studio** 的真实代码展开。项目不是生产级 SaaS，而是一个用于学习完整 AIGC 全栈链路、也能作为面试案例讲解的本地项目。文章会明确区分“当前已实现的能力”和“生产环境仍应补齐的能力”。

## 一、项目的后端目标与边界

后端要解决的不是“返回一张图片”，而是维护以下闭环：

```text
用户登录
  ↓
提交生成参数
  ↓
创建本地任务（pending）并立即返回 taskId
  ↓
后台调用图片 Provider，更新 processing / succeeded / failed
  ↓
下载 Provider 临时图片，保存到本地文件系统
  ↓
任务和图片元数据写入 PostgreSQL
  ↓
用户在生成库查询、下载、编辑或删除自己的图片
```

当前后端技术选型：

| 目标 | 实现 |
| --- | --- |
| HTTP API | Express + TypeScript |
| 数据库 | PostgreSQL 17 + `pg` |
| 密码 | bcryptjs 哈希 |
| 登录态 | JWT + HttpOnly Cookie，同时兼容 Bearer Token |
| 真实生图 | Provider 接口 + DashScope Wanx 实现 |
| 图片二进制 | `server/storage/images/` |
| 元数据 | PostgreSQL `users`、`generation_tasks`、`images` |
| 本地环境 | Docker Compose PostgreSQL |

这里有一个重要边界：浏览器直接导入的本地素材目前保存于 IndexedDB，不上传服务端；服务端 `images` 表管理的是 AI 生成图片以及保存回生成库的编辑 PNG。

## 二、不要让 index.ts 同时承担应用配置和端口监听

后端入口拆为两个文件：

```text
server/src/app.ts    创建 Express app，注册中间件和路由
server/src/index.ts  加载 .env，读取 PORT，调用 app.listen()
```

这样拆分的价值是测试。Supertest 可以直接请求导出的 `app`，无需占用 3001 端口：

```ts
import request from 'supertest'
import { app } from '../app.js'

const response = await request(app).get('/api/health')
```

`app.ts` 负责装配：

```ts
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())
app.use('/api/auth', authRouter)
app.use('/api/generations', generationsRouter)
```

图片读取没有直接暴露 `express.static`，而是走受保护接口：

```text
GET /api/images/:filename
```

它先验证登录用户，再检查该文件是否属于该用户，最后才从受限目录读取二进制。这避免了“知道文件名就能看图”的资源越权问题。

## 三、数据库连接：连接池、环境变量与快速失败

数据库连接集中在 `server/src/database/database.ts`：

```ts
let databasePool: Pool | null = null

export const getDatabasePool = (): Pool => {
  if (!databasePool) {
    databasePool = new Pool({ connectionString: getDatabaseUrl() })
  }

  return databasePool
}
```

这里使用延迟初始化连接池，而不是每次请求创建一个 PostgreSQL 客户端。`DATABASE_URL` 缺失时会立即抛错，而不是让业务路由在运行中出现难以定位的空连接错误。

本地 Docker 开发配置：

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: aigc
      POSTGRES_PASSWORD: aigc_dev_password
      POSTGRES_DB: aigc_studio
    ports:
      - "5432:5432"
```

后端本机 `.env` 使用：

```env
DATABASE_URL=postgresql://aigc:aigc_dev_password@localhost:5432/aigc_studio
PORT=3001
JWT_SECRET=至少32位的本机随机字符串
```

面试时可以主动说明：仓库中的 Docker 密码仅用于本地学习；真实数据库连接串、JWT 密钥和 DashScope API Key 都在 `.env` 中，并被 `.gitignore` 排除，不能提交到 Git。

## 四、三张表如何关联

当前 Schema 的核心是三张表：`users`、`generation_tasks`、`images`。

```text
users (1)
  └── generation_tasks (N)
         └── images (N)
                └── source_image_id → images.id（编辑作品的来源）
```

### 1. users：认证主体

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- `id` 是内部用户主键；
- `email` 有唯一约束，避免重复注册；
- `password_hash` 保存 bcrypt 哈希，绝不保存明文密码；
- 创建、更新时间使用 `TIMESTAMPTZ`，减少时区歧义。

### 2. generation_tasks：一次生成请求，而不是一张图片

```sql
CREATE TABLE generation_tasks (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (
    status IN ('pending', 'processing', 'succeeded', 'failed')
  ),
  prompt TEXT NOT NULL,
  negative_prompt TEXT,
  aspect_ratio VARCHAR(5) NOT NULL,
  image_count SMALLINT NOT NULL,
  seed INTEGER,
  style VARCHAR(20) NOT NULL,
  error_code VARCHAR(100),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

为什么任务表不直接把图片 URL 写成一个字符串？因为“生成请求”和“生成结果”并不是一对一：一次任务可能多图，也可能失败、取消或后续增加编辑作品。任务表保存请求参数、状态和错误；图片表保存每个图片实体。

`user_id` 外键采用 `ON DELETE CASCADE`，删除用户时可级联删除其任务。项目还建立了：

```sql
CREATE INDEX generation_tasks_user_created_at_index
  ON generation_tasks (user_id, created_at DESC);
```

它对应生成库最常见的访问模式：按当前用户读取最新任务。

### 3. images：图片元数据、来源关系和稳定顺序

```sql
CREATE TABLE images (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generation_task_id UUID REFERENCES generation_tasks(id) ON DELETE SET NULL,
  kind VARCHAR(20) NOT NULL CHECK (
    kind IN ('generated', 'edited', 'imported')
  ),
  storage_key TEXT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  source_image_id UUID REFERENCES images(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

字段设计中有三个值得讲的点：

1. `storage_key` 不是外部临时 URL，而是服务端本地文件名；API 对外构造 `/api/images/{storage_key}`；
2. `source_image_id` 是图片自关联。编辑作品可追溯到原图，但原图被删除后使用 `SET NULL`，不强制删除编辑作品；
3. `position` 表示同一任务中的稳定显示顺序。

第三点非常容易忽略。前端下载和编辑使用 `imageIndex`。如果仅按 `created_at, id` 排序，批量生成的图片可能有相同时间，而 UUID 排序又是随机的，下一次读取时“第 0 张图”可能变了。项目因此在写入时按数组下标保存 `position`，读取时 `ORDER BY position ASC`，并创建唯一索引：

```sql
CREATE UNIQUE INDEX images_generation_task_position_index
  ON images (generation_task_id, position);
```

## 五、任务状态机：先返回 taskId，再后台执行

创建任务接口是：

```text
POST /api/generations
```

请求校验完成后，服务端先创建 `pending` 任务并返回 HTTP 202：

```json
{
  "success": true,
  "message": "Generation request accepted",
  "data": {
    "taskId": "UUID",
    "status": "pending",
    "request": {}
  }
}
```

然后后台状态按以下路径推进：

```text
pending → processing → succeeded
                     ↘ failed
```

这比让 HTTP 请求一直等待 Provider 返回更合理：浏览器不会被长请求阻塞；用户可以切换页面；前端只需轮询 `GET /api/generations/:taskId` 即可获取最新状态。

当前项目通过 `ImageGenerationProvider` 进行平台隔离：

```ts
interface ImageGenerationProvider {
  readonly name: string
  generate(input: GenerateImageInput): Promise<GenerateImageResult>
}
```

Wanx Provider 处理比例到实际尺寸映射、异步任务查询、超时、网络错误和安全错误转换。业务路由并不需要知道 DashScope 的具体 HTTP 协议。

首次真实调用还会强制按 1 张图片处理，避免前端传入多图时产生不可控成本。这是一种很适合学习项目和云模型接入初期的成本保护策略。

## 六、Provider 成功后，为什么还要下载图片

Provider 返回的图片 URL 往往是临时地址。若直接写入数据库，过期后历史图片库会失效。

因此 Provider 成功后的流程是：

```text
外部临时 URL
  → Node.js 原生 fetch 下载二进制
  → 写入 server/storage/images/{taskId}-{index}.png
  → 图片表保存 storage_key
  → 对外暴露受认证保护的 /api/images/{filename}
```

本地存储模块会严格校验文件名：只接受 `.png`，要求文件名等于 `basename(filename)`，并确认 `resolve` 后路径仍在 `storage/images` 目录下。这样下载、删除和读取接口都不能被客户端传入的路径穿越攻击利用。

值得注意的是：服务端不会接受客户端传入任意图片 URL 再去 fetch。编辑、下载和删除都只通过已保存的任务与图片索引定位资源，从源头避免 SSRF 风险。

## 七、登录态与资源授权

认证流程分为三步：

1. 注册或登录时，用 bcrypt 比较或生成密码哈希；
2. 使用 `JWT_SECRET` 创建包含 `sub`（用户 ID）和邮箱的 JWT；
3. 将 token 放入 HttpOnly Cookie，并在 JSON 响应中返回 token 以兼容 Bearer 请求。

认证中间件优先读取：

```text
Authorization: Bearer <token>
```

没有 Bearer Token 时，再解析 Cookie 中的 `aigc_access_token`。验证成功后把用户信息挂到 `request.authUser`。

任务查询的核心不是“先按 taskId 查出来再判断”，而是在 Repository 查询条件中带上 `user_id`：

```sql
WHERE id = $1 AND user_id = $2
```

因此即使用户猜到另一个 taskId，也只能得到 404。图片访问同样通过：

```sql
SELECT 1 FROM images WHERE storage_key = $1 AND user_id = $2 LIMIT 1
```

确认归属后才读文件。这样数据库授权与文件授权保持同一条用户边界。

前端编辑器加载受保护图片时也有一个容易踩坑的细节：图片 API 和 Vite 开发服务器通常端口不同。Canvas 使用 `new Image()` 加载时必须设置：

```ts
image.crossOrigin = 'use-credentials'
```

`anonymous` 不会携带 Cookie，会导致受保护的 `/api/images/...` 返回 401，最终 Canvas 只会触发 `onerror`。后端 CORS 需要允许 credentials，登录 Cookie 也要按本地/生产环境正确设置 `sameSite` 和 `secure`。

## 八、Repository：为什么读取需要一致性快照

生成任务和图片分别存于两张表。若先查任务、再查图片，后台恰好在两次查询之间完成生成，就可能出现“状态还是 processing，但结果中已有图片”的混合响应。

当前 Repository 将两次读取放进 PostgreSQL 的只读一致性事务：

```ts
await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')

const taskResult = await client.query(/* generation_tasks */)
const imageResult = await client.query(/* images */)

await client.query('COMMIT')
```

这让一次 API 响应对应同一数据库快照。任务与图片的写入也使用事务：先锁定已有任务并检查 owner，再 upsert 任务记录，更新图片元数据，最后提交或回滚。

## 九、图片编辑作品如何回存

编辑器导出当前 Canvas 为 PNG Blob。保存到生成库时，前端向后端发送：

```text
POST /api/generations/:taskId/images/:imageIndex/edits
Content-Type: image/png
Body: PNG 二进制
```

后端校验顺序包括：

- 当前用户是否拥有任务；
- 任务是否已经 `succeeded`；
- 图片索引是否为非负整数且确实存在；
- Content-Type 是否为 `image/png`；
- 请求体是否为空、是否符合 PNG 文件头。

PNG 文件头是：

```text
89 50 4E 47 0D 0A 1A 0A
```

通过后使用 `crypto.randomUUID()` 生成编辑文件名，保存本地文件，并将 `kind='edited'`、`source_image_id`、`position` 等元数据写回数据库。原图并不会被覆盖。

## 十、如何在新电脑快速复现

项目不提交数据库实际数据和图片文件，只提交代码、`docker-compose.yml`、`schema.sql` 和 `.env.example`。新电脑启动流程：

```powershell
git clone <repository>
Set-Location aigc-creative-studio

npm ci
Set-Location server
npm ci
Set-Location ..

docker compose up -d postgres
Copy-Item .\.env.example .\.env
Copy-Item .\server\.env.example .\server\.env

Get-Content .\server\sql\schema.sql |
  docker compose exec -T postgres psql -U aigc -d aigc_studio
```

之后分别启动 `server` 和前端，重新注册账号即可。`schema.sql` 使用 `CREATE ... IF NOT EXISTS` 与必要的 `ALTER ... IF NOT EXISTS`，既能创建空数据库，也能补齐例如 `images.position` 这样的后续字段。

## 十一、面试全栈工程师时，建议主动讲清的点

### 1. 为什么不用“同步调用模型并直接返回图片”？

回答重点：生图是长耗时异步任务。先返回 taskId 可以降低 HTTP 超时风险，让前端切页后继续轮询，也便于后续替换为队列、SSE 或 WebSocket。

### 2. 为什么任务和图片要分表？

回答重点：任务表示请求生命周期，图片表示结果实体。一对多建模支持多图、失败记录、编辑作品、自关联来源和后续扩展。

### 3. 为什么图片要有 position？

回答重点：前端编辑和下载使用 imageIndex；数据库默认返回顺序不可靠，UUID 和同一时间戳都不能表达用户看到的顺序。position 将 UI 数组下标变成持久化业务约束。

### 4. 如何避免用户越权访问图片？

回答重点：每次任务和图片查询都带 `user_id` 条件；图片文件不是公开静态目录，读取前先检查数据库归属；无权限返回 404。

### 5. 如何避免 Provider 临时链接过期？

回答重点：成功后立即由服务端下载图片，保存本地文件，数据库只保存内部 storage key，对外通过受保护 API 访问。

### 6. Canvas 特效如何保证能导出？

回答重点：不只做 CSS 显示效果。所有滤镜和动画都以 Canvas 像素为结果源，PNG 通过 `toBlob`，WebM 通过 `captureStream`，因此预览和导出一致。

### 7. 如何测试而不消耗真实模型额度？

回答重点：Provider 测试 Mock 全局 fetch；轮询和超时使用 fake timers；Supertest 直接请求 app；CI 使用占位 Key、禁用真实生成、不会请求外部模型平台。

## 十二、当前实现的真实局限，以及下一步演进

面试中不要把本地项目包装成生产系统。当前版本仍有明确边界：

- 图片保存在本地文件系统，未接对象存储和 CDN；
- Provider 调用由当前 Node 进程后台执行，未接 Redis、消息队列或分布式任务系统；
- 同一任务的编辑/删除在单 Node 进程内串行化，多实例部署仍应使用乐观锁、版本号 CAS 或数据库级事务变更；
- 数据库测试目前主要 Mock Repository，生产前应增加独立 PostgreSQL 集成测试；
- 登录是账号密码模式，未接 OAuth、验证码、限流、审计与密码找回；
- Docker Compose 密码仅适用于本地开发，生产必须使用密钥管理和隔离网络。

比较合理的下一步不是立即增加更多页面，而是：补 PostgreSQL 集成测试、为任务引入版本控制、将图片文件迁移到对象存储、将生图调用迁移到持久化任务队列。

## 结语

一个 AIGC 全栈项目的难点，往往不在于发出一次模型请求，而在于把任务、结果、权限、文件、编辑和本地开发环境连接成稳定闭环。

在 AIGC Creative Studio 中，我把这条链路拆成了可解释的层次：Express 路由负责协议和授权、Provider 负责外部平台差异、Repository 负责 PostgreSQL 一致性、Storage 负责文件安全、Canvas 负责编辑结果一致性。对学习项目而言，这比堆砌更多效果更有价值；对全栈面试而言，这些取舍也比“我调用过某个模型 API”更能体现工程能力。
