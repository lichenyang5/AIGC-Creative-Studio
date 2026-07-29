import dotenv from 'dotenv'
import { app } from './app.js'
import { loadGenerationTasks } from './repositories/generationRepository.js'
import { restoreGenerationTasks } from './store/generationStore.js'

dotenv.config()

const port = Number(process.env.PORT) || 3001

const startServer = async () => {
  const tasks = await loadGenerationTasks()
  restoreGenerationTasks(tasks)

  app.listen(port, () => {
    console.log(`AIGC Creative Studio API is listening on port ${port}`)
  })
}

void startServer()
