import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { loadGenerationTasks } from './repositories/generationRepository.js'
import { generationsRouter } from './routes/generations.js'
import { readStoredImage } from './storage/localImageStorage.js'
import { restoreGenerationTasks } from './store/generationStore.js'

dotenv.config()

const app = express()
const port = Number(process.env.PORT) || 3001

app.use(cors())
app.use(express.json())

app.get('/api/images/:filename', async (request, response) => {
  const image = await readStoredImage(request.params.filename)

  if (!image) {
    response.status(404).json({
      success: false,
      message: 'Stored image not found',
    })
    return
  }

  response
    .status(200)
    .set('Cache-Control', 'no-store')
    .type('png')
    .send(image)
})

app.use('/api/generations', generationsRouter)

app.get('/api/health', (_request, response) => {
  response.json({
    success: true,
    message: 'AIGC Creative Studio API is running',
  })
})

const startServer = async () => {
  const tasks = await loadGenerationTasks()
  restoreGenerationTasks(tasks)

  app.listen(port, () => {
    console.log(`AIGC Creative Studio API is listening on port ${port}`)
  })
}

void startServer()
