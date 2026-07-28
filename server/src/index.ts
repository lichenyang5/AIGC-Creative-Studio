import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { generationsRouter } from './routes/generations.js'

dotenv.config()

const app = express()
const port = Number(process.env.PORT) || 3001

app.use(cors())
app.use(express.json())

app.use('/api/generations', generationsRouter)

app.get('/api/health', (_request, response) => {
  response.json({
    success: true,
    message: 'AIGC Creative Studio API is running',
  })
})

app.listen(port, () => {
  console.log(`AIGC Creative Studio API is listening on port ${port}`)
})
