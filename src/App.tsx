import { useCallback, useEffect, useRef, useState } from 'react'
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
  GenerationTaskQueryErrorResponse,
  GenerationTaskQuerySuccessResponse,
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
  二次元: 'anime',
  赛博朋克: 'cyberpunk',
  水彩插画: 'watercolor',
}

const isTerminalStatus = (status: GenerationTask['status']): boolean =>
  status === 'succeeded' || status === 'failed'

function App() {
  const [formData, setFormData] = useState(initialFormData)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationTask, setGenerationTask] = useState<GenerationTask | null>(null)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [isManualRefresh, setIsManualRefresh] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>('checking')
  const isTaskQueryingRef = useRef(false)
  const stoppedPollingTaskIdRef = useRef<string | null>(null)

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

  const requestTaskStatus = useCallback(
    async (
      taskId: string,
      isManualRequest = false,
    ): Promise<GenerationTask | 'busy' | null> => {
      if (isTaskQueryingRef.current) {
        return 'busy'
      }

      isTaskQueryingRef.current = true
      if (isManualRequest) {
        setIsManualRefresh(true)
      }
      setRefreshError(null)

      try {
        const response = await fetch(
          `http://localhost:3001/api/generations/${taskId}`,
        )
        const data = (await response.json()) as
          | GenerationTaskQuerySuccessResponse
          | GenerationTaskQueryErrorResponse

        if (response.ok && data.success) {
          setGenerationTask(data.data)
          return data.data
        }

        stoppedPollingTaskIdRef.current = taskId
        setRefreshError('message' in data ? data.message : '查询任务状态失败')
        return null
      } catch {
        stoppedPollingTaskIdRef.current = taskId
        setRefreshError('无法连接任务查询服务，请稍后重试')
        return null
      } finally {
        isTaskQueryingRef.current = false
        if (isManualRequest) {
          setIsManualRefresh(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    if (!generationTask || isTerminalStatus(generationTask.status)) {
      return
    }

    const taskId = generationTask.taskId
    let isActive = true
    let timerId: number | undefined

    const scheduleNextPoll = () => {
      timerId = window.setTimeout(() => {
        void pollTask()
      }, 1000)
    }

    const pollTask = async () => {
      if (!isActive || stoppedPollingTaskIdRef.current === taskId) {
        return
      }

      const result = await requestTaskStatus(taskId)

      if (!isActive || stoppedPollingTaskIdRef.current === taskId) {
        return
      }

      if (result === 'busy') {
        scheduleNextPoll()
        return
      }

      if (!result || isTerminalStatus(result.status)) {
        return
      }

      scheduleNextPoll()
    }

    scheduleNextPoll()

    return () => {
      isActive = false
      if (timerId !== undefined) {
        window.clearTimeout(timerId)
      }
    }
  }, [generationTask?.taskId, generationTask?.status, requestTaskStatus])

  const handleSubmit = async () => {
    if (isGenerating) {
      return
    }

    setIsGenerating(true)
    setGenerationTask(null)
    setGenerationError(null)
    setRefreshError(null)
    stoppedPollingTaskIdRef.current = null

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
        setGenerationTask({ ...data.data, createdAt: '' })
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

  const handleRefreshTask = async () => {
    if (!generationTask) {
      return
    }

    await requestTaskStatus(generationTask.taskId, true)
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
          isManualRefresh={isManualRefresh}
          refreshError={refreshError}
          onRefreshTask={handleRefreshTask}
          onRetryGeneration={() => void handleSubmit()}
        />
      </main>
    </div>
  )
}

export default App
