# 从图片创作到本地可复现的 AIGC 全栈闭环：AIGC Creative Studio 实践复盘

> 一个可本地运行的 AIGC 图片创作工作台：React 负责创作与 Canvas 编辑，Express 负责任务与鉴权，PostgreSQL 管理用户和图片元数据，Docker Compose 让新电脑可以快速恢复开发环境。

近一段时间，我把一个 Vite 默认页面逐步扩展成了 **AIGC Creative Studio**。它不是要替代成熟的图片生成平台，而是一个用于理解 AIGC 全栈链路、积累作品集案例的本地项目。

项目的目标很明确：用户输入 Prompt，创建真实的生图任务；生成完成后进入自己的图片库；图片可以下载、再编辑、保存编辑作品；不同账号之间的图片和任务彼此隔离；换一台电脑时，可以用 Docker 快速启动数据库并重新跑通完整流程。

本文不会只罗列功能，而是复盘这个项目中几个更值得讨论的工程问题：AIGC 任务为什么不能只用 `setTimeout` 模拟、图片索引为什么需要持久化、Canvas 编辑结果如何进入作品库，以及本地开发环境如何做到可复现。

## 一、项目最终做成了什么

当前项目由前端、后端、本地文件存储、浏览器 IndexedDB 和 PostgreSQL 共同组成。

```text
浏览器（React）
  ├─ 图片创作：Prompt / 比例 / 风格 / Seed
  ├─ 生成库：AI 生成、本地导入、编辑作品
  ├─ 图片编辑器：Canvas 2D 效果与导出
  └─ 登录态与 API 调用
          │
          ▼
Express API
  ├─ JWT + HttpOnly Cookie 认证
  ├─ 生成任务创建、查询、下载、删除、保存编辑图
  ├─ WanxImageProvider 抽象与 DashScope 接入
  └─ 本地图片访问授权
          │                 │
          ▼                 ▼
 PostgreSQL            server/storage/images
 用户、任务、图片元数据      服务端生成/编辑图片二进制
```

主要能力包括：

- 注册、登录、退出，以及按用户隔离的图片库；
- Prompt、负向 Prompt、比例、数量、Seed、风格预设；
- DashScope Wanx 异步图片生成和前端轮询；
- 生成库中的查看、下载、删除、再次编辑、复用历史参数；
- 本地图片导入，并通过 IndexedDB 在刷新后恢复素材；
- Canvas 黑白、灰度渐变、雨滴、色彩涟漪等效果；
- PNG 导出、编辑作品回存生成库，以及色彩涟漪的 WebM 导出；
- Vitest、React Testing Library、Supertest 与 GitHub Actions CI。

## 二、先把“生成一张图”当成任务，而不是一次普通请求

很多 Demo 的第一版会这样写：点击按钮，等待两秒，然后给页面一张图片。这个方式很适合先验证界面，却不适合后续扩展。

真实图片生成通常是异步任务：提交请求后拿到外部任务 ID，再轮询外部平台状态，最后获得结果。因此本项目的 API 也使用任务模型：

```text
POST /api/generations
  → 立即返回本地 taskId + pending

后台调用 Provider
  → processing
  → succeeded / failed

GET /api/generations/:taskId
  → 前端按需刷新或自动轮询最新状态
```

前端只把 `pending` 和 `processing` 当作需要继续轮询的状态；一旦变为 `succeeded` 或 `failed`，就停止后续轮询。组件卸载、重新创建任务、路由切换时也会清理旧的 `setTimeout`，避免出现多个轮询同时请求同一任务。

这带来了一个很实际的收益：用户从“图片创作”切换到“生成库”再返回时，不会因为页面组件重新挂载而丢掉当前任务。前端会把活动任务的必要信息暂存在会话级状态中，返回后继续查询后端状态；真正的任务事实仍在后端数据库中。

## 三、Provider 要先抽象，再接具体平台

接入真实生图平台前，项目先定义了一个很小的 Provider 接口：

```ts
export interface ImageGenerationProvider {
  readonly name: string
  generate(input: GenerateImageInput): Promise<GenerateImageResult>
}
```

这样做并不是为了“过度设计”，而是为了隔离三类变化：

1. 前端参数与平台参数之间的映射；
2. 外部平台的异步任务协议；
3. 错误码、重试属性和安全错误信息。

例如，前端只关心 `1:1`、`4:3`、`3:4`、`16:9`。Wanx Provider 内部再把它们转换成平台支持的尺寸。这里曾经出现过一个典型问题：前端比例看起来正确，但传给模型的像素尺寸不在平台允许列表中，最终只能拿到 `InvalidParameter`。

修复方式不是让前端知道更多平台细节，而是把合法尺寸映射收敛在 Provider：

```ts
const sizeByAspectRatio = {
  '1:1': '1024*1024',
  '4:3': '1152*864',
  '3:4': '864*1152',
  '16:9': '1280*720',
} as const
```

这也是 AIGC 项目里一个重要的边界：**业务 API 不应该直接泄露供应商协议**。以后即使换模型或接入第二家 Provider，创作页和任务接口也不必跟着重写。

## 四、生成成功后，为什么还要把临时 URL 下载到本地

外部平台给出的图片链接往往有有效期。若直接把它写进数据库，图片库过一段时间很可能就显示失败。

因此，本项目在 Provider 返回成功后立即完成两件事：

1. 使用 Node.js 原生 `fetch` 下载 Provider 返回的图片；
2. 将二进制保存到 `server/storage/images/`，再把数据库中的 URL 替换为本地 `/api/images/{filename}`。

这样，PostgreSQL 保存的是任务、图片元数据、来源关系和稳定顺序；文件系统保存图片二进制。两者各司其职。

下载接口并不接受前端传入任意 URL，而是只根据 `taskId + imageIndex` 找到已有图片。服务端会校验当前登录用户是否拥有该图片，再读取受限目录中的文件。这避免了让下载接口变成 SSRF 或任意文件读取入口。

## 五、从“所有人看同一个库”到用户数据隔离

只有任务表还不够。只要加入登录，最容易被忽略的问题就是：用户 A 能否通过猜测 taskId 访问用户 B 的图片？

项目的数据库关系如下：

```text
users
  └─ generation_tasks
       └─ images
            └─ source_image_id（编辑作品可追溯原图）
```

每个任务和图片都有 `user_id`。后端在查询任务、列表、下载图片、保存编辑图、删除图片时，都以“当前认证用户 + 资源 ID”作为条件，而不是先查到资源再在内存里判断。

例如图片静态访问不是直接暴露一个公共目录，而是：

```ts
const isOwnedImage = await isStoredImageOwnedByUser(filename, userId)

if (!isOwnedImage) {
  response.status(404).json({ success: false, message: 'Stored image not found' })
  return
}
```

对无权限资源返回 404 而不是暴露资源存在性，也让 API 行为更一致。

认证层使用 bcryptjs 保存密码哈希，并使用 JWT 维持登录态。前端请求同时开启 `credentials: 'include'`，图片 `<img>` 标签则能依赖 HttpOnly Cookie 获取受保护的本地图片。API Key、数据库连接串和 JWT 密钥都只放在本机 `.env`，不会提交到 Git。

## 六、为什么 PostgreSQL 不应该只是“启动时加载一次到 Map”

项目早期为了快速实现任务查询，使用了内存 `Map` 保存任务。后来即使接入 PostgreSQL，也曾出现“服务启动时全量加载到 Map，之后从 Map 查询”的过渡形态。

这在单机 Demo 中能工作，但数据库实际上只是备份：

- 服务重启前后的状态依赖加载时机；
- 查询链路没有真正验证数据库条件；
- 多进程时会出现不同内存副本；
- 图片访问授权也可能被内存状态影响。

现在的调整是：**PostgreSQL 是任务读取和授权的直接来源**。服务启动不再恢复全量任务；列表、详情、下载、编辑和删除都由 Repository 查询数据库。

此外，读取任务和图片不能拆成两个无关联的查询。假设第一次查到任务状态仍为 `processing`，第二次查图片时后台正好已经写入生成结果，接口就可能返回“处理中却带图片”的混合快照。

Repository 因此用 `REPEATABLE READ READ ONLY` 事务包住任务与图片查询：

```ts
await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')

const taskResult = await client.query(/* 查询任务 */)
const imageResult = await client.query(/* 查询这些任务的图片 */)

await client.query('COMMIT')
```

这不是为了追求数据库术语，而是让一次 API 响应对应一个确定的数据视图。

## 七、图片 `imageIndex` 也是需要持久化的业务数据

编辑、下载路由都通过 `imageIndex` 定位图片。起初我按 `created_at, id` 排序读取图片；但一批原图可能拥有相同的创建时间，而 UUID 排序并不表达用户可见顺序。更严重的是，编辑作品还会引用 `sourceImageIndex`，排序变化就会让来源指向错误的图片。

最终在 `images` 表中增加了 `position` 字段：

```sql
position INTEGER NOT NULL DEFAULT 0
```

保存任务结果时按数组下标写入 `position`，读取时按 `position ASC` 排序。这样“第 0 张图”在创建、下载、编辑、删除和恢复时都有稳定含义。

这个细节很容易被忽略，但它体现了一个通用原则：**只要前端把数组下标当成资源标识，顺序就不能只依赖偶然的数据库返回顺序。**

## 八、Canvas 编辑：原图、效果和导出如何保持一致

编辑器完全使用 Canvas 2D API，而不是 CSS Filter。核心原因是：CSS Filter 只影响显示，导出时很难自然得到同一份像素结果；Canvas 则可以让预览、PNG 导出、保存到生成库使用同一帧画面。

编辑器的基础约束有三条：

1. 图片加载后保存原始 `ImageData`；
2. 每次调节都从原始像素重新计算，避免累计失真；
3. 导出始终调用当前 Canvas 的 `toBlob('image/png')`。

以黑白效果为例，灰度值使用亮度加权：

```text
gray = 0.299 × red + 0.587 × green + 0.114 × blue
```

再根据强度混合彩色与灰度值：

```text
result = original × (1 - intensity) + gray × intensity
```

灰度渐变同样基于原始像素计算：左侧完全灰度，右侧保持彩色，中间使用 smoothstep 做平滑插值。它的分界线是 HTML 覆盖层，只用于交互提示，绝不会进入导出的图片。

色彩涟漪效果则使用两份离屏 Canvas：一份彩色原图、一份完整灰度图。动画帧先绘制灰度底图，再用圆形裁剪区域绘制彩色画布，于是涟漪覆盖范围内逐步“唤醒”颜色。PNG 导出记录当前静态帧；WebM 导出则使用 `canvas.captureStream(30)` 与 `MediaRecorder` 录制同一套动画流程。

## 九、本地导入和服务端生成，是两条不同的数据链路

项目同时支持服务端生成图片和用户从电脑导入图片，但两者的存储策略不同：

| 类型 | 保存位置 | 刷新后 | 是否上传服务端 |
| --- | --- | --- |
| AI 生成图片 | 服务端文件 + PostgreSQL 元数据 | 保留 | 是 |
| 本地导入素材 | 浏览器 IndexedDB | 保留 | 否 |
| 本地编辑作品 | 浏览器 IndexedDB 或保存到生成库 | 取决于保存方式 | 可选 |

本地导入时，IndexedDB 只保存原始 Blob 和元数据，不保存 Object URL，也不转 Base64。页面展示时再由 Blob 创建临时 Object URL；组件卸载、列表刷新、删除素材时都要释放对应 URL。

这样做的原因很简单：Object URL 是当前浏览器会话的临时引用，持久化它没有意义，还可能造成内存泄漏。编辑器路由传递的是稳定的素材 ID，例如 `/editor/imported/:assetId`，刷新编辑器页面后仍能从 IndexedDB 找回 Blob。

## 十、让项目在新电脑上快速跑起来：Docker Compose + schema.sql

个人项目最常见的问题不是“代码不能写”，而是几周后换电脑或重装环境后无法启动。

这个项目把 PostgreSQL 17 的本地开发配置放在 `docker-compose.yml` 中，表结构放在 `server/sql/schema.sql` 中。数据库数据不提交 Git，环境变量模板可以提交，真实 `.env` 不能提交。

新电脑上的最短启动流程是：

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

随后在两个终端分别运行前端和后端即可。由于 `schema.sql` 使用了可重复执行的 `CREATE ... IF NOT EXISTS` 与 `ALTER ... IF NOT EXISTS`，它既可以初始化空数据库，也可以补齐项目迭代中新增的字段。

这里要特别强调：`DASHSCOPE_API_KEY` 和 `JWT_SECRET` 必须由每台电脑自己的 `server/.env` 提供。即使是学习项目，也不应该把真实 API Key 提交到公开仓库。

## 十一、测试不调用真实生图服务

AIGC 项目很容易把测试写成“依赖真实账号和网络”的脚本，这样 CI 就失去意义。

本项目的测试原则是：

- Provider 单元测试用 `vi.stubGlobal('fetch', ...)` Mock 外部 HTTP；
- 轮询和超时使用 fake timers，不真的等待 10 秒或 120 秒；
- Express 测试用 Supertest 直接请求导出的 `app`，不监听 3001 端口；
- 前端服务状态、失败原因等交互用 React Testing Library 验证用户最终可见内容；
- 读取相关测试 Mock PostgreSQL Repository，不依赖开发者本机数据库是否启动。

目前仓库同时保留前端和后端测试命令，并用 GitHub Actions 执行 lint、test、build。CI 环境禁用真实生成，并使用占位 API Key 和 `example.test` 地址，避免意外请求云端。

## 十二、这个项目还没有做什么

一个学习项目最重要的不是功能越多越好，而是明确边界。当前版本仍然不具备：

- 云端对象存储与 CDN；
- 分布式任务队列、Redis、消息队列；
- 多实例编辑/删除的乐观锁或数据库 CAS；
- 第三方 OAuth 登录、支付计费、团队协作；
- 生产级部署、监控、审计和灾备；
- 用户上传到服务端后的统一资源管理。

例如，当前单机开发中会对同一任务的编辑和删除进行进程内串行化；如果将来部署多个后端实例，则需要进一步引入乐观锁版本号或把“锁定任务—修改图片—持久化”收敛为同一个数据库事务。

## 结语

完成一个 AIGC 项目，难点并不只在“调用一次模型 API”。真正能形成全栈闭环的部分包括：把生成建模为任务、让图片结果可持久化、处理用户资源隔离、保证 Canvas 预览与导出一致、维护稳定的图片顺序，以及让新电脑能在没有历史数据的情况下重新跑起来。

**AIGC Creative Studio** 仍是一个本地学习项目，但它已经覆盖了一个实用的开发路径：从前端交互原型，走到 Provider 接入、用户体系、数据库建模、文件存储、编辑器和自动化验证。后续如果继续演进，我会优先补 PostgreSQL 集成测试与多实例并发控制，而不是盲目叠加新的滤镜或页面。

项目 README 中包含完整的本地运行说明，可作为复现入口。
