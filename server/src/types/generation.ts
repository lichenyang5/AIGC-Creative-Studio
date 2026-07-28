export const aspectRatios = ['1:1', '4:3', '3:4', '16:9'] as const
export const generationCounts = [1, 2, 4] as const
export const generationStyles = [
  'realistic',
  'anime',
  'cyberpunk',
  'watercolor',
] as const

export type AspectRatio = (typeof aspectRatios)[number]
export type GenerationCount = (typeof generationCounts)[number]
export type GenerationStyle = (typeof generationStyles)[number]

export interface GenerationRequest {
  prompt: string
  negativePrompt?: string
  aspectRatio: AspectRatio
  count: GenerationCount
  seed?: number
  style: GenerationStyle
}

export interface GenerationValidationError {
  field: keyof GenerationRequest
  message: string
}

export interface GenerationAcceptedResponse {
  success: true
  message: 'Generation request accepted'
  data: {
    taskId: string
    status: 'pending'
    request: GenerationRequest
  }
}

export interface GenerationValidationErrorResponse {
  success: false
  message: 'Invalid generation request'
  errors: GenerationValidationError[]
}
