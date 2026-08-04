# AIGC 图片库鉴权与资源安全：从登录到文件访问

> 图片生成项目里，最容易被低估的不是登录页，而是“某个 URL 是否能被不该看到的人直接打开”。本文结合 AIGC Creative Studio，拆解用户登录、任务归属和本地图片访问的完整安全链路。

## 一、威胁模型：知道 taskId 不等于有权限访问

本地学习项目也应该先建立最小威胁模型。假设用户 A 和用户 B 都已登录：

- A 不能通过猜测 UUID 查询 B 的生成任务；
- A 不能直接访问 B 图片对应的 `/api/images/filename.png`；
- A 不能用下载、编辑保存、删除接口操作 B 的资源；
- 前端不能因为拿到一个图片 URL 就绕开服务端授权。

因此，鉴权不能只放在“创建任务”接口，读取、下载、编辑和删除都必须继续校验资源归属。

## 二、账号与会话：密码哈希 + JWT

注册时服务端对密码做 bcryptjs 哈希，数据库只保存 `password_hash`。登录时调用 bcrypt 的比较函数，不做明文密码比对。

认证成功后，服务端签发包含用户 ID 和邮箱的 JWT。当前项目同时支持两种读取方式：

1. **HttpOnly Cookie**：浏览器正常访问时自动携带，前端脚本不能直接读取，适合同站点 Web 应用；
2. **Authorization: Bearer**：便于调试工具、未来移动端或 API 客户端使用。

路由中间件 `requireAuth` 负责读取、验证令牌并把当前用户挂到请求上下文。路由不信任客户端传入的 `userId`，而是只使用中间件确认的身份。

## 三、CORS 与 Cookie：为什么“图片能打开”会影响 Canvas 编辑

前后端开发时，Vite 在一个端口、Express 在另一个端口。要使用 HttpOnly Cookie，服务端 CORS 不能用 `Access-Control-Allow-Origin: *`，而应允许实际 Origin 并开启 credentials。

前端的 `fetch` 请求使用 `credentials: 'include'`。一个非常隐蔽的坑出现在 Canvas：

```ts
const image = new Image()
image.crossOrigin = 'use-credentials'
image.src = protectedImageUrl
```

若使用 `anonymous`，浏览器不会携带用于受保护图片的 Cookie，图片请求将得到 `401`，最终 Canvas 只能显示“图片加载失败”。使用 `use-credentials` 后，浏览器会在服务端 CORS 正确配置的前提下携带身份信息，同时 Canvas 仍可安全读取像素并导出。

这也是面试里很有价值的一点：**Canvas 跨域问题不仅是 CORS 头问题，还包括请求是否携带会话凭据。**

## 四、受保护的图片地址为什么不能直接 static 托管

最初实现图片预览时，很多人会写：

```ts
app.use('/api/images', express.static(imagesDirectory))
```

这会把目录中的所有图片直接暴露出来。只要知道文件名，任何人都能访问，根本没有机会判断图片属于谁。

当前项目使用显式路由读取图片：

```text
GET /api/images/:filename
  → requireAuth
  → 校验 filename 格式
  → 在数据库中确认该 filename 属于当前用户
  → 从限定 storage/images 目录读取二进制
  → 返回图片流
```

这样可以在读取磁盘前完成授权，也避免让 Express 静态中间件绕开数据库关系。

## 五、资源所有权查询：把 user_id 放在 SQL 条件里

安全检查最好由数据库完成，而非“先读任务，再在 JavaScript 里比对”。所有权查询本质上是：

```sql
select i.filename
from images i
join generation_tasks t on t.id = i.generation_task_id
where i.filename = $1
  and t.user_id = $2;
```

把 `user_id` 放入同一条查询条件，能避免漏掉一次应用层判断，也减少“读出不属于我的记录再忘记拦截”的风险。下载、保存编辑结果、删除图片等接口都先以任务 ID 和当前用户 ID 查任务；查不到统一按“不存在或无权限”处理，不向攻击者泄露资源真实存在性。

## 六、文件系统安全：客户端永远不能指定路径

本地文件存储有两个高风险输入：`filename` 和 `imageIndex`。

正确策略是：

1. 客户端只传任务 ID 和图片索引；
2. 服务端从数据库中找出该任务对应的 filename；
3. 使用 `path.basename`、允许字符集和目录前缀校验；
4. 仅在 `server/storage/images` 内读取、写入或删除；
5. 不接受 URL、绝对路径、`../` 路径或客户端给出的目标文件名。

下载原图时，后端不接收“要下载的远程 URL”，而是只允许下载该任务 `result.images` 已经对应的本地文件。这能同时避免 SSRF 和目录穿越。

## 七、编辑 PNG 上传：Content-Type 不够

保存 Canvas 编辑结果时，路由级别使用 `express.raw({ type: 'image/png', limit: '15mb' })` 接收二进制。仅检查 `Content-Type: image/png` 不足以确保文件真的是 PNG，还会检查文件头：

```text
89 50 4E 47 0D 0A 1A 0A
```

通过后服务端用 `crypto.randomUUID()` 生成文件名，保存到固定目录，并向原任务追加一条 `kind: edited` 的图片记录。用户不能覆盖原图，也不能控制服务器文件名。

需要说明的是，文件头校验是轻量保护，并不能替代生产级恶意文件扫描、图片解码验证和对象存储安全策略。

## 八、错误信息：既要可用，也不能泄密

前端需要知道“尺寸不支持”还是“内容安全未通过”，但不应看到：

- API Key；
- Authorization 请求头；
- Provider 完整原始响应；
- 数据库连接串；
- 堆栈和服务器绝对路径。

因此对外接口返回经过收敛的 `code`、`message`、`retryable`。日志可以保留足以排查问题的任务 ID 与错误类别，但同样不记录密钥。

## 九、面试追问与回答框架

**问：图片 URL 为什么还要鉴权？**  
答：URL 是定位符，不是权限。静态托管会绕过业务所有权判断，因此要先通过数据库验证当前用户拥有该文件再读取。

**问：HttpOnly Cookie 有什么好处？**  
答：JavaScript 无法直接读取它，可降低 XSS 窃取 Token 的风险；但仍要配合 `SameSite`、HTTPS、CSRF 策略和严格 CORS。

**问：文件名路径穿越怎么防？**  
答：不信任客户端路径，只从数据库取 filename，校验文件名，再确认解析路径仍在限定根目录下。

**问：为什么 Canvas 导出会被跨域限制？**  
答：若图片来源未满足 CORS，Canvas 会被标记为 tainted，无法读取像素或导出；受 Cookie 保护的图片还必须用 `use-credentials` 并让服务端允许凭据。

## 结语

一套图片库的安全链路应当贯穿注册、登录、任务创建、任务查询、图片预览、下载、编辑和删除。只保护登录接口远远不够；资源真正被读取和修改的地方，才是需要持续验证所有权的地方。
