import type {
  AspectRatio,
  GenerationCount,
  GenerationStyle,
} from '../types/generation.js'

export interface GenerateImageInput {
  prompt: string
  negativePrompt?: string
  aspectRatio: AspectRatio
  count: GenerationCount
  seed?: number
  style: GenerationStyle
}

export interface GeneratedImage {
  url: string
  width?: number
  height?: number
}

export interface GenerateImageResult {
  images: GeneratedImage[]
  provider: string
  model: string
  durationMs?: number
}

export interface ProviderError {
  code: string
  message: string
  retryable: boolean
  cause?: unknown
}
