import dotenv from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from './app.js'

/** 服务进程入口：只负责读取本机环境变量并监听端口，Express 配置位于 app.ts，便于测试直接导入。 */
const currentDirectory = dirname(fileURLToPath(import.meta.url))

// Resolve from this file so `node server/dist/index.js` and `npm run dev`
// consistently load server/.env instead of relying on the caller's cwd.
dotenv.config({ path: resolve(currentDirectory, '../.env') })

const port = Number(process.env.PORT) || 3001

const startServer = () => {
  app.listen(port, () => {
    console.log(`AIGC Creative Studio API is listening on port ${port}`)
  })
}

startServer()
