/** 图片生成 Provider 的平台无关输入、输出和安全错误模型。 */
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

export interface ProviderErrorOptions {
  code: string
  message: string
  retryable: boolean
  cause?: unknown
}

export class ProviderError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly cause?: unknown

  constructor({ code, message, retryable, cause }: ProviderErrorOptions) {
    super(message)
    this.name = 'ProviderError'
    this.code = code
    this.retryable = retryable
    this.cause = cause
  }
}
