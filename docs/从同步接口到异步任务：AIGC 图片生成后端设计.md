# 从同步接口到异步任务：AIGC 图片生成后端设计

> 适合发布在掘金的 AIGC 后端实践文章。本文以 AIGC Creative Studio 的 Express + TypeScript 实现为例，讲清楚为什么图片生成不能简单地“请求一次接口、立刻返回一张图片”。

## 一、问题：为什么不能把生图接口当成普通 CRUD

普通查询接口的典型路径是：浏览器发请求，服务端查询数据库，立即返回结果。但真实图片生成通常会经历排队、模型执行、内容审核、图片写入和临时链接过期等阶段，耗时可能从几秒到几十秒。

如果让 `POST /api/generations` 一直阻塞等待 Provider 返回，会带来几个问题：

- 浏览器、反向代理和网关都可能超时；
- 用户无法离开页面再回来查看进度；
- 失败后没有可查询的任务记录；
- 服务重启后无法从请求上下文恢复状态；
- 很难接入不同的图片生成平台。

因此，本项目采用“先创建本地任务，再后台执行”的异步任务模型。

## 二、接口契约：创建任务与查询任务分离

创建接口只负责校验参数、创建一条本地任务并立即返回：

```http
POST /api/generations
Content-Type: application/json

{
  "prompt": "雨后的赛博朋克街道",
  "negativePrompt": "模糊，低质量",
  "aspectRatio": "16:9",
  "count": 1,
  "style": "cyberpunk"
}
```

服务端返回 `202 Accepted`，而不是伪装成“图片已经生成完成”的 `200`：

```json
{
  "success": true,
  "message": "Generation request accepted",
  "data": {
    "taskId": "uuid",
    "status": "pending"
  }
}
```

前端后续通过 `GET /api/generations/:taskId` 获取最新状态。状态机保持简单且可解释：

```text
pending → processing → succeeded
                     ↘ failed
```

其中 `pending` 表示任务记录已成功落库，`processing` 表示后台调用 Provider 已开始，`succeeded` 表示图片已成功转存到本地并且元数据已持久化，`failed` 则保存可安全展示给用户的错误信息。

## 三、严格校验：在调用模型前拒绝无效请求

模型服务昂贵且受限流约束，参数校验必须发生在调用 Provider 之前。当前项目校验：

| 字段 | 规则 |
| --- | --- |
| `prompt` | 必填，去空白后非空，最长 1000 字符 |
| `negativePrompt` | 可选，最长 1000 字符 |
| `aspectRatio` | `1:1`、`4:3`、`3:4`、`16:9` |
| `count` | `1`、`2`、`4` |
| `seed` | 可选整数，范围 `0~2147483647` |
| `style` | `realistic`、`anime`、`cyberpunk`、`watercolor` |

一个经常被忽略的细节是：校验器不应只返回第一个错误。前端需要一次性高亮多个无效字段，因此接口以数组形式返回全部发现的问题：

```json
{
  "success": false,
  "message": "Invalid generation request",
  "errors": [
    { "field": "prompt", "message": "Prompt is required" },
    { "field": "style", "message": "Style is invalid" }
  ]
}
```

## 四、Provider 抽象：业务流程不绑死某个模型平台

路由层不应直接耦合某一个云平台。项目用一个窄接口描述模型能力：

```ts
interface ImageGenerationProvider {
  readonly name: string
  generate(input: GenerateImageInput): Promise<GenerateImageResult>
}
```

路由只关心输入、输出和失败；`WanxImageProvider` 负责 DashScope 的请求头、尺寸映射、创建外部任务、10 秒轮询和超时处理。这样以后接入其他 Provider 时，生成任务、数据库表和前端轮询协议都不必重写。

尺寸映射尤其需要以 Provider 的真实允许值为准。业务层的 `4:3` 不是随意拼成 `1024*768`，当前 Wanx 模型实际使用 `1152*864`；`3:4` 使用 `864*1152`。这也是一个很典型的面试点：**抽象业务比例，但在 Provider 适配层做平台特定映射。**

## 五、后台执行的正确顺序

当前项目的后台任务核心流程是：

```text
创建数据库任务(pending)
  → 后台开始执行(processing)
  → Provider 返回临时图片 URL
  → 服务端下载这些 URL 指向的图片二进制
  → 保存至 server/storage/images
  → 用 /api/images/{filename} 替换临时 URL
  → 将 succeeded、images、completedAt 写回 PostgreSQL
```

这里“先下载、后标记成功”非常关键。若先将任务置为成功，随后下载临时图片失败，数据库中会留下无法访问的成功记录。当前实现把“本地图片文件存在”和“任务成功”作为同一条可观察结果。

首次真实调用还会强制 `count = 1`，即使前端传了更多数量。这是学习项目中控制成本和排查 Provider 参数问题的保护措施；后续要支持多图，应在配额、并发和存储容量设计完成后放开。

## 六、失败并不是异常：它也应成为任务结果

Provider 失败时，不把完整外部响应、Authorization 头或 API Key 写进任务。服务端转换为安全结构：

```json
{
  "status": "failed",
  "completedAt": "2026-08-04T02:55:32.163Z",
  "error": {
    "code": "InvalidParameter",
    "message": "The size does not match the allowed size",
    "retryable": false
  }
}
```

前端据此展示失败原因和“重新生成”入口，而不是把它一律说成“网络错误”。对 `429` 和网络类错误可标记 `retryable: true`；对内容安全校验、无效参数和鉴权错误则不建议自动重试。

## 七、前端轮询：为什么用递归 setTimeout，而不是永久 setInterval

图片创作页在 `pending` / `processing` 时每秒查询一次任务。使用 `setTimeout` 递归而不是 `setInterval` 的好处是：上一轮请求结束后才安排下一轮，避免慢网络下多次查询并行堆积。

轮询 Effect 需要以 `taskId`、`status` 这类稳定基本值为依赖，并在以下时机清理旧计时器：

- 组件卸载；
- 用户创建另一条任务；
- 路由切换；
- 状态进入 `succeeded` 或 `failed`；
- 查询失败。

这既避免“页面切走仍在请求”，也不会出现两条轮询同时更新同一张任务卡片。

## 八、从 Demo 到生产的下一步

当前后台执行使用进程内异步调用，适合单机学习和演示。生产场景还应逐步补充：

1. 将任务投入 Redis、RabbitMQ 或云队列，使用独立 Worker；
2. 引入幂等键，处理用户重复提交；
3. 设置 Provider 限流、指数退避和重试上限；
4. 将本地文件存储迁移到对象存储；
5. 增加任务审计、指标、追踪 ID 与告警；
6. 对成功、失败、超时做更细粒度的统计。

## 结语

AIGC 后端的核心不只是“调用一次模型 API”，而是把长耗时、不稳定、可能失败的外部调用转换为可查询、可恢复、可授权的本地任务。把任务创建、Provider 适配、图片转存、状态查询和失败信息串起来，才是一条完整的生成链路。
