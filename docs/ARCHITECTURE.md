# 项目结构与维护约定

## 前端

```text
src/
├─ pages/        # 路由页面：创作、生成库、编辑器、登录
├─ components/   # 可复用 UI 与展示组件
├─ contexts/     # 认证和当前会话级本地图片状态
├─ services/     # IndexedDB 等浏览器存储访问
├─ config/       # API 地址、请求头等基础配置
├─ types/        # 前端领域模型、接口响应与路由状态类型
└─ test/         # Vitest 全局测试配置
```

页面负责路由级数据加载和页面状态；组件负责可复用交互；服务层不能依赖 React；类型文件不包含副作用。

## 后端

```text
server/src/
├─ routes/        # HTTP 路由、参数校验和响应协议
├─ repositories/  # PostgreSQL 数据读写
├─ storage/       # 本地图片文件的安全读写
├─ providers/     # 第三方图片生成平台抽象与实现
├─ auth/          # Token 创建与校验
├─ middleware/    # 身份认证等 Express 中间件
├─ database/      # PostgreSQL 连接池
└─ types/         # 后端领域类型
```

路由层不拼接 SQL；Repository 不接触 Express 请求对象；Storage 只处理受限目录中的文件；Provider 不依赖路由和数据库。

## 注释原则

- 注释模块职责、业务约束、安全边界和非直观算法，不解释显而易见的 TypeScript 语法。
- 公开函数、关键类型与异步资源生命周期需要有可维护的说明。
- 修改逻辑时同步更新相邻注释；失效注释比没有注释更危险。
