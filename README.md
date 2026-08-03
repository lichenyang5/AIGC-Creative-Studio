# AIGC Creative Studio

一个用于学习 AIGC 全栈开发流程的图片创作工作台。项目覆盖从提示词提交、异步图片生成、任务状态轮询、图片管理与 Canvas 编辑，到用户登录、PostgreSQL 持久化和本地 Docker 开发环境的完整链路。

本项目面向本地学习、作品集展示和全栈面试案例，不包含生产环境部署方案。

## 功能概览

- 用户注册、登录、退出，以及按用户隔离的生成库
- Prompt、负向 Prompt、图片比例、数量、Seed、风格预设
- 万相（DashScope Wanx）异步图片生成任务与状态轮询
- 生成库：查看、下载、再次编辑、复用历史生成参数、删除作品
- 本地图片导入与 IndexedDB 本地作品管理
- Canvas 图片编辑：黑白、灰度渐变、静态/动态雨滴、色彩涟漪
- 导出 PNG、保存编辑作品到生成库，以及色彩涟漪 WebM 预览导出
- Express + PostgreSQL 持久化生成任务、图片元数据和用户关系
- 本地图片文件保存与基于登录用户的访问控制
- 前后端 Vitest 自动化测试与 GitHub Actions CI

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | Vite、React、TypeScript、React Router、Canvas 2D API |
| 后端 | Node.js、Express、TypeScript |
| 数据库 | PostgreSQL 17、`pg` |
| 认证 | bcryptjs、JWT、HttpOnly Cookie |
| 图片生成 | DashScope Wanx Provider（可通过环境变量关闭） |
| 测试 | Vitest、React Testing Library、Supertest |
| 本地数据库 | Docker Compose（可选） |

## 项目结构

```text
.
├─ src/                    # Vite + React 前端
├─ server/
│  ├─ src/                 # Express API、认证、任务与 PostgreSQL Repository
│  ├─ sql/schema.sql       # 数据库表结构与可重复执行的字段升级
│  ├─ storage/images/      # 本地生成图片文件（不提交 Git）
│  └─ .env.example         # 后端环境变量模板
├─ docker-compose.yml      # 本地 PostgreSQL 17
└─ .env.example            # 前端 API 地址模板
```

## 快速启动（推荐：Docker PostgreSQL）

### 1. 前置条件

- Node.js 20 或更高版本
- Docker Desktop（仅用于本地 PostgreSQL）
- DashScope API Key（只有测试真实图片生成时才需要）

### 2. 克隆并安装依赖

```powershell
git clone <你的仓库地址>
Set-Location aigc-creative-studio

npm ci
Set-Location server
npm ci
Set-Location ..
```

### 3. 启动 PostgreSQL

```powershell
docker compose up -d postgres
docker compose ps
```

默认本地开发数据库配置如下：

| 配置项 | 值 |
| --- | --- |
| 主机 | `localhost` |
| 端口 | `5432` |
| 数据库 | `aigc_studio` |
| 用户 | `aigc` |
| 密码 | `aigc_dev_password` |

这是仓库内用于本地学习的开发密码，不能用于生产环境。Docker 的命名 Volume 会保存当前电脑上的数据库数据；它不会被提交到 Git，也不会自动同步到其他电脑。

### 4. 创建本机环境变量文件

```powershell
Copy-Item .\.env.example .\.env
Copy-Item .\server\.env.example .\server\.env
```

在 `server/.env` 中至少确认以下配置：

```env
DATABASE_URL=postgresql://aigc:aigc_dev_password@localhost:5432/aigc_studio
JWT_SECRET=请替换为至少32位的本机随机字符串

# 需要真实生图时填写；否则设置为 false 即可完成登录、数据库和页面流程验证。
ENABLE_REAL_GENERATION=true
DASHSCOPE_API_KEY=你的DashScope_API_Key
```

前端的 `.env` 保持默认值即可：

```env
VITE_API_BASE_URL=http://localhost:3001
```

> 不要提交 `.env` 或 `server/.env`。特别是 `DASHSCOPE_API_KEY` 与 `JWT_SECRET`，即使是个人项目也不应公开到 GitHub。

### 5. 初始化或升级数据库表结构

首次启动和拉取表结构更新后，均可重复执行：

```powershell
Get-Content .\server\sql\schema.sql |
  docker compose exec -T postgres psql -U aigc -d aigc_studio
```

`schema.sql` 使用 `CREATE ... IF NOT EXISTS` 和 `ALTER ... IF NOT EXISTS`，可用于空数据库初始化，也会补齐项目后续新增的字段，例如图片稳定排序所需的 `position` 字段。

### 6. 启动前后端

终端一：

```powershell
Set-Location .\server
npm run dev
```

终端二：

```powershell
Set-Location <项目根目录>
npm run dev
```

打开 Vite 输出的本地地址，注册一个新账号后即可使用。

## 不使用 Docker

也可以使用本机直接安装的 PostgreSQL 16 或 17。创建数据库和用户后，将 `server/.env` 中的 `DATABASE_URL` 改为实际连接串，再执行：

```powershell
& 'C:\Program Files\PostgreSQL\17\bin\psql.exe' `
  -h localhost `
  -p 5432 `
  -U aigc `
  -d aigc_studio `
  -f '.\server\sql\schema.sql'
```

## 常用命令

| 位置 | 命令 | 用途 |
| --- | --- | --- |
| 根目录 | `npm run dev` | 启动前端开发服务器 |
| 根目录 | `npm run lint` | 运行 ESLint（包含前后端源码） |
| 根目录 | `npm test` | 运行前端测试 |
| 根目录 | `npm run build` | 构建前端 |
| `server/` | `npm run dev` | 启动 Express 开发服务器 |
| `server/` | `npm test` | 运行后端测试 |
| `server/` | `npm run build` | 编译后端 TypeScript |
| 根目录 | `docker compose up -d postgres` | 启动本地数据库 |
| 根目录 | `docker compose down` | 停止数据库容器，保留数据 Volume |

## 数据与安全边界

- PostgreSQL 保存用户、生成任务和图片元数据；任务查询直接以数据库为来源。
- 生成图片二进制保存在 `server/storage/images/`，该目录不提交 Git。
- 浏览器导入的本地素材与编辑作品使用 IndexedDB，刷新后可恢复，但不会上传到服务端。
- Docker Volume 和数据库数据不提交 Git。新电脑只需重新启动 Docker、执行 `schema.sql`、注册账号即可运行完整流程。
- 真实生图依赖 DashScope API Key；未配置或将 `ENABLE_REAL_GENERATION=false` 时，其他本地业务流程仍可验证。

## 当前范围

项目当前聚焦单机本地开发与学习闭环。尚未实现云端对象存储、生产级部署、多实例任务队列、第三方 OAuth 登录、支付计费和团队协作等生产化能力。
