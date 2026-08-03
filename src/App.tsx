import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import './App.css'
import { GenerationForm } from './components/GenerationForm'
import { ResultPreview } from './components/ResultPreview'
import { createApiUrl, createAuthHeaders } from './config/api'
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
import { getReusedGenerationFormData } from './types/createPageLocation'

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

const activeGenerationSessionKey = 'aigc-active-generation-session'

interface ActiveGenerationSession {
  taskId: string
  formData: GenerationFormData
}

const isGenerationFormData = (value: unknown): value is GenerationFormData => {
  if (typeof value !== 'object' || value === null) return false

  const candidate = value as Record<string, unknown>
  return typeof candidate.prompt === 'string'
    && typeof candidate.negativePrompt === 'string'
    && (candidate.aspectRatio === '1:1' || candidate.aspectRatio === '4:3' || candidate.aspectRatio === '3:4' || candidate.aspectRatio === '16:9')
    && (candidate.imageCount === 1 || candidate.imageCount === 2 || candidate.imageCount === 4)
    && typeof candidate.seed === 'string'
    && (candidate.stylePreset === '写实摄影' || candidate.stylePreset === '二次元' || candidate.stylePreset === '赛博朋克' || candidate.stylePreset === '水彩插画')
}

const readActiveGenerationSession = (): ActiveGenerationSession | null => {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(activeGenerationSessionKey) ?? 'null')
    if (
      typeof value === 'object'
      && value !== null
      && 'taskId' in value
      && typeof value.taskId === 'string'
      && 'formData' in value
      && isGenerationFormData(value.formData)
    ) {
      return { taskId: value.taskId, formData: value.formData }
    }
  } catch {
    // Ignore malformed browser session data.
  }

  return null
}

const saveActiveGenerationSession = (session: ActiveGenerationSession): void => {
  sessionStorage.setItem(activeGenerationSessionKey, JSON.stringify(session))
}

const clearActiveGenerationSession = (): void => {
  sessionStorage.removeItem(activeGenerationSessionKey)
}

const toGenerationRequestPayload = (
  formData: GenerationFormData,
): GenerationRequestPayload => {
  const seed = formData.seed.trim()

  return {
    prompt: formData.prompt,
    negativePrompt: formData.negativePrompt,
    aspectRatio: formData.aspectRatio,
    count: formData.imageCount,
    style: styleMapping[formData.stylePreset],
    ...(seed === '' ? {} : { seed: Number(seed) }),
  }
}

const isTerminalStatus = (status: GenerationTask['status']): boolean =>
  status === 'succeeded' || status === 'failed'

function App() {
  const location = useLocation()
  const reusedFormData = getReusedGenerationFormData(location.state, initialFormData)
  const activeGenerationSession = reusedFormData === null
    ? readActiveGenerationSession()
    : null
  const initialPageFormData = reusedFormData ?? activeGenerationSession?.formData ?? initialFormData
  const [formData, setFormData] = useState(
    () => initialPageFormData,
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationTask, setGenerationTask] = useState<GenerationTask | null>(() =>
    activeGenerationSession
      ? {
          taskId: activeGenerationSession.taskId,
          status: 'pending',
          request: toGenerationRequestPayload(activeGenerationSession.formData),
          createdAt: '',
        }
      : null,
  )
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [isManualRefresh, setIsManualRefresh] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const isTaskQueryingRef = useRef(false)
  const stoppedPollingTaskIdRef = useRef<string | null>(null)
  const generationTaskId = generationTask?.taskId
  const generationTaskStatus = generationTask?.status

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
          createApiUrl(`/api/generations/${taskId}`),
          { headers: createAuthHeaders() },
        )
        const data = (await response.json()) as
          | GenerationTaskQuerySuccessResponse
          | GenerationTaskQueryErrorResponse

        if (response.ok && data.success) {
          setGenerationTask((currentTask) =>
            currentTask === null || currentTask.taskId === data.data.taskId
              ? data.data
              : currentTask,
          )
          return data.data
        }

        stoppedPollingTaskIdRef.current = taskId
        if (response.status === 404) {
          clearActiveGenerationSession()
        }
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
    if (
      !generationTaskId ||
      !generationTaskStatus ||
      isTerminalStatus(generationTaskStatus)
    ) {
      return
    }

    const taskId = generationTaskId
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
  }, [generationTaskId, generationTaskStatus, requestTaskStatus])

  const handleSubmit = async () => {
    if (isGenerating) {
      return
    }

    setIsGenerating(true)
    setGenerationTask(null)
    setGenerationError(null)
    setRefreshError(null)
    clearActiveGenerationSession()
    stoppedPollingTaskIdRef.current = null

    const requestPayload = toGenerationRequestPayload(formData)

    try {
      const response = await fetch(createApiUrl('/api/generations'), {
        method: 'POST',
        headers: createAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(requestPayload),
      })
      let data: GenerationApiSuccessResponse | GenerationApiErrorResponse

      try {
        data = (await response.json()) as
          | GenerationApiSuccessResponse
          | GenerationApiErrorResponse
      } catch {
        setGenerationError(`生成请求失败（HTTP ${response.status}）`)
        return
      }

      if (response.status === 202 && data.success) {
        setGenerationTask({ ...data.data, createdAt: '' })
        saveActiveGenerationSession({ taskId: data.data.taskId, formData })
        return
      }

      const errorData = data as GenerationApiErrorResponse
      const errorMessage =
        errorData.errors?.[0]?.message ?? errorData.message ?? '提交生成任务失败'
      setGenerationError(
        `生成请求失败（HTTP ${response.status}）：${errorMessage}`,
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
    <main className="workspace">
      <GenerationForm
        formData={formData}
        onChange={setFormData}
        onSubmit={handleSubmit}
        isGenerating={isGenerating}
        reusedParametersLoaded={reusedFormData !== null}
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
  )
}

export default App
