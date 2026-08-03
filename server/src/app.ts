import cors from 'cors'
import express from 'express'
import { authRouter } from './routes/auth.js'
import { generationsRouter } from './routes/generations.js'
import { readStoredImage } from './storage/localImageStorage.js'

const app = express()

app.use(cors())
app.use(express.json())
app.use('/api/auth', authRouter)

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

export { app }
