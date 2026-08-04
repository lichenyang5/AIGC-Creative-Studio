import dotenv from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from './app.js'
import { failInterruptedProcessingTasks } from './repositories/postgresGenerationRepository.js'

/** 服务进程入口：只负责读取本机环境变量并监听端口，Express 配置位于 app.ts，便于测试直接导入。 */
const currentDirectory = dirname(fileURLToPath(import.meta.url))

// Resolve from this file so `node server/dist/index.js` and `npm run dev`
// consistently load server/.env instead of relying on the caller's cwd.
dotenv.config({ path: resolve(currentDirectory, '../.env') })

const port = Number(process.env.PORT) || 3001

const reconcileInterruptedGenerationTasks = async (): Promise<void> => {
  try {
    const recoveredTaskCount = await failInterruptedProcessingTasks()
    if (recoveredTaskCount > 0) {
      console.warn(`Marked ${recoveredTaskCount} interrupted generation task(s) as failed`)
    }
  } catch {
    // Do not prevent the health endpoint and login flow from starting when the
    // database is temporarily unavailable. The failure contains no secrets.
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
