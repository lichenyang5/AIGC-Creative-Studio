/** 前后端生成接口协议：页面只能依赖这些公开字段，内部 userId 不会返回浏览器。 */
import type { AspectRatio } from './generation'

export type GenerationStyle =
  | 'realistic'
  | 'anime'
  | 'cyberpunk'
  | 'watercolor'

export type GenerationTaskStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'

export interface GenerationRequestPayload {
  prompt: string
  negativePrompt?: string
  aspectRatio: AspectRatio
  count: 1 | 2 | 4
  seed?: number
  style: GenerationStyle
}

export interface GeneratedImage {
  url: string
  width?: number
  height?: number
  kind?: 'generated' | 'edited'
  createdAt?: string
  sourceImageIndex?: number
}

export interface GenerationTask {
  taskId: string
  status: GenerationTaskStatus
  request: GenerationRequestPayload
  createdAt: string
  completedAt?: string
  result?: {
    images: GeneratedImage[]
  }
  error?: {
    code?: string
    message?: string
  }
}

export type GenerationCreationTask = Omit<GenerationTask, 'createdAt'>

export interface GenerationApiSuccessResponse {
  success: true
  message: 'Generation request accepted'
  data: GenerationCreationTask
}

export interface GenerationApiValidationError {
  field: string
  message: string
}

export interface GenerationApiErrorResponse {
  success: false
  message: string
  errors?: GenerationApiValidationError[]
}

export interface GenerationTaskQuerySuccessResponse {
  success: true
  data: GenerationTask
}

export interface GenerationTaskQueryErrorResponse {
  success: false
  message: string
}

export interface GenerationListResponse {
  success: true
  data: {
    items: GenerationTask[]
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

export interface GenerationListErrorResponse {
  success: false
  message: string
}

export interface GenerationSummary {
  totalTasks: number
  succeededTasks: number
  failedTasks: number
  pendingTasks: number
  processingTasks: number
  imageCount: number
}

export interface GenerationSummaryResponse {
  success: true
  data: GenerationSummary
}

export interface GenerationSummaryErrorResponse {
  success: false
  message: string
}

export interface GenerationEditSaveSuccessResponse {
  success: true
  message: 'Edited image saved'
  data: {
    taskId: string
    imageIndex: number
    image: GeneratedImage
  }
}

export interface GenerationEditSaveErrorResponse {
  success: false
  message: string
}
