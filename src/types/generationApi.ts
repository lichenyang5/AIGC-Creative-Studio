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
}

export interface GenerationApiSuccessResponse {
  success: true
  message: 'Generation request accepted'
  data: GenerationTask
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
