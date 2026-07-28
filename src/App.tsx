import { useEffect, useState } from 'react'
import './App.css'
import { GenerationForm } from './components/GenerationForm'
import { Header } from './components/Header'
import { ResultPreview } from './components/ResultPreview'
import type {
  GenerationApiErrorResponse,
  GenerationApiSuccessResponse,
  GenerationRequestPayload,
  GenerationStyle,
  GenerationTask,
} from './types/generationApi'
import type { GenerationFormData } from './types/generation'
import type { HealthCheckResponse, ServiceStatus } from './types/health'

const initialFormData: GenerationFormData = {
  prompt: '',
  negativePrompt: '',
  aspectRatio: '1:1',
  imageCount: 1,
  seed: '',
  stylePreset: '写实摄影',
}

const styleMapping: Record<GenerationFormData['stylePreset'], GenerationStyle> = {
  '写实摄影': 'realistic',
  '二次元': 'anime',
  '赛博朋克': 'cyberpunk',
  '水彩插画': 'watercolor',
}

function App() {
  const [formData, setFormData] = useState(initialFormData)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationTask, setGenerationTask] = useState<GenerationTask | null>(null)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>('checking')

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch('http://localhost:3001/api/health')
        const data = (await response.json()) as HealthCheckResponse

        setServiceStatus(response.ok && data.success ? 'online' : 'offline')
      } catch {
        setServiceStatus('offline')
      }
    }

    void checkHealth()
  }, [])

  const handleSubmit = async () => {
    if (isGenerating) {
      return
    }

    setIsGenerating(true)
    setGenerationTask(null)
    setGenerationError(null)

    const seed = formData.seed.trim()
    const requestPayload: GenerationRequestPayload = {
      prompt: formData.prompt,
      negativePrompt: formData.negativePrompt,
      aspectRatio: formData.aspectRatio,
      count: formData.imageCount,
      style: styleMapping[formData.stylePreset],
      ...(seed === '' ? {} : { seed: Number(seed) }),
    }

    try {
      const response = await fetch('http://localhost:3001/api/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      })
      const data = (await response.json()) as
        | GenerationApiSuccessResponse
        | GenerationApiErrorResponse

      if (response.status === 202 && data.success) {
        setGenerationTask(data.data)
        return
      }

      const errorData = data as GenerationApiErrorResponse
      setGenerationError(
        errorData.errors?.[0]?.message ?? errorData.message ?? '提交生成任务失败',
      )
    } catch {
      setGenerationError('无法连接图片生成服务，请稍后重试')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="app-shell">
      <Header serviceStatus={serviceStatus} />
      <main className="workspace">
        <GenerationForm
          formData={formData}
          onChange={setFormData}
          onSubmit={handleSubmit}
          isGenerating={isGenerating}
        />
        <ResultPreview
          isGenerating={isGenerating}
          task={generationTask}
          error={generationError}
        />
      </main>
    </div>
  )
}

export default App
