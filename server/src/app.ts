import cors from 'cors'
import express from 'express'
import { getAllGenerationTasks } from './store/generationStore.js'
import { getStoredImageFilename, readStoredImage } from './storage/localImageStorage.js'
import { requireAuth, type AuthenticatedRequest } from './middleware/requireAuth.js'
import { authRouter } from './routes/auth.js'
import { generationsRouter } from './routes/generations.js'

const app = express()

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())
app.use('/api/auth', authRouter)

app.get('/api/images/:filename', requireAuth, async (request: AuthenticatedRequest<{ filename: string }>, response) => {
  const userId = request.authUser?.sub
  const isOwnedImage = userId !== undefined && getAllGenerationTasks().some((task) =>
    task.userId === userId
    && task.result?.images.some((image) => getStoredImageFilename(image.url) === request.params.filename),
  )

  if (!isOwnedImage) {
    response.status(404).json({
      success: false,
      message: 'Stored image not found',
    })
    return
  }

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

export { app }
