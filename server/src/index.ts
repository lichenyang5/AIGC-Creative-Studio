import dotenv from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from './app.js'
import { loadGenerationTasks } from './repositories/generationRepository.js'
import { restoreGenerationTasks } from './store/generationStore.js'

const currentDirectory = dirname(fileURLToPath(import.meta.url))

// Resolve from this file so `node server/dist/index.js` and `npm run dev`
// consistently load server/.env instead of relying on the caller's cwd.
dotenv.config({ path: resolve(currentDirectory, '../.env') })

const port = Number(process.env.PORT) || 3001

const startServer = async () => {
  const tasks = await loadGenerationTasks()
  restoreGenerationTasks(tasks)

  app.listen(port, () => {
    console.log(`AIGC Creative Studio API is listening on port ${port}`)
  })
}

void startServer()
