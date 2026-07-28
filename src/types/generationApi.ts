import type { AspectRatio } from './generation'

export type GenerationStyle =
  | 'realistic'
  | 'anime'
  | 'cyberpunk'
  | 'watercolor'

export interface GenerationRequestPayload {
  prompt: string
  negativePrompt?: string
  aspectRatio: AspectRatio
  count: 1 | 2 | 4
  seed?: number
  style: GenerationStyle
}

export interface GenerationTask {
  taskId: string
  status: 'pending'
  request: GenerationRequestPayload
  createdAt: string
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
