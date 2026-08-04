import dotenv from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from './app.js'
import { failInterruptedProcessingTasks } from './repositories/postgresGenerationRepository.js'

/** 服务进程入口：只负责读取本机环境变量并监听端口，Express 配置位于 app.ts，便于测试直接导入。 */
const currentDirectory = dirname(fileURLToPath(import.meta.url))

// 以当前文件为基准解析路径，确保 `node server/dist/index.js` 与 `npm run dev`
// 都稳定加载 server/.env，而不依赖调用命令时所在的工作目录。
dotenv.config({ path: resolve(currentDirectory, '../.env') })

const port = Number(process.env.PORT) || 3001

const reconcileInterruptedGenerationTasks = async (): Promise<void> => {
  try {
    const recoveredTaskCount = await failInterruptedProcessingTasks()
    if (recoveredTaskCount > 0) {
      console.warn(`Marked ${recoveredTaskCount} interrupted generation task(s) as failed`)
    }
  } catch {
    // 数据库暂时不可用时，不阻止健康检查和登录流程启动；日志不包含连接串或密钥。
    console.error('Unable to reconcile interrupted generation tasks at startup')
  }
}

const startServer = async (): Promise<void> => {
  await reconcileInterruptedGenerationTasks()
  app.listen(port, () => {
    console.log(`AIGC Creative Studio API is listening on port ${port}`)
  })
}

void startServer()
