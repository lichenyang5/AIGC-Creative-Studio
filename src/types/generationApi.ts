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
