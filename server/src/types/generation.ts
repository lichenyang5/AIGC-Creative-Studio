export const aspectRatios = ['1:1', '4:3', '3:4', '16:9'] as const
export const generationCounts = [1, 2, 4] as const
export const generationStyles = [
  'realistic',
  'anime',
  'cyberpunk',
  'watercolor',
] as const
export const generationStatuses = [
  'pending',
  'processing',
  'succeeded',
  'failed',
] as const

export type AspectRatio = (typeof aspectRatios)[number]
export type GenerationCount = (typeof generationCounts)[number]
export type GenerationStyle = (typeof generationStyles)[number]
export type GenerationStatus = (typeof generationStatuses)[number]

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

export interface GenerationImage {
  url: string
  width?: number
  height?: number
  kind?: 'generated' | 'edited'
  createdAt?: string
  sourceImageIndex?: number
}

export interface GenerationTask {
  taskId: string
  /** Internal owner identity. It is intentionally omitted from API responses. */
  userId?: string
  status: GenerationStatus
  request: GenerationRequest
  createdAt: string
  completedAt?: string
  result?: {
    images: GenerationImage[]
  }
  error?: {
    code: string
    message: string
    retryable: boolean
  }
}

export interface GenerationAcceptedResponse {
  success: true
  message: 'Generation request accepted'
  data: {
    taskId: string
    status: GenerationStatus
    request: GenerationRequest
  }
}

export interface GenerationValidationErrorResponse {
  success: false
  message: 'Invalid generation request'
  errors: GenerationValidationError[]
}

export interface GenerationTaskResponse {
  success: true
  data: GenerationTask
}

export interface GenerationTaskNotFoundResponse {
  success: false
  message: 'Generation task not found'
}

export interface GenerationListQuery {
  status?: GenerationStatus
  limit: number
  offset: number
}

export interface GenerationListQueryValidationError {
  field: keyof GenerationListQuery
  message: string
}

export interface GenerationListQueryValidationErrorResponse {
  success: false
  message: 'Invalid query parameters'
  errors: GenerationListQueryValidationError[]
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
