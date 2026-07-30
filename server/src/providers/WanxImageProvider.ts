import type { ImageGenerationProvider } from './ImageGenerationProvider.js'
import {
  ProviderError,
  type GeneratedImage,
  type GenerateImageInput,
  type GenerateImageResult,
} from './types.js'

const defaultModel = 'wanx2.0-t2i-turbo'
const defaultBaseUrl = 'https://dashscope.aliyuncs.com/api/v1'
const pollingIntervalMs = 10_000
const timeoutMs = 120_000

const aspectRatioSizes: Record<GenerateImageInput['aspectRatio'], string> = {
  '1:1': '1024*1024',
  '4:3': '1024*768',
  '3:4': '768*1024',
  '16:9': '1280*720',
}

const stylePrompts: Record<GenerateImageInput['style'], string> = {
  realistic: '写实摄影风格',
  anime: '二次元插画风格',
  cyberpunk: '赛博朋克风格',
  watercolor: '水彩插画风格',
}

interface WanxApiErrorResponse {
  code?: string | number
  message?: string
}

interface WanxCreateTaskResponse extends WanxApiErrorResponse {
  output?: {
    task_id?: string
  }
}

interface WanxTaskResult {
  url?: string
  width?: number
  height?: number
}

interface WanxTaskQueryResponse extends WanxApiErrorResponse {
  output?: {
    task_status?: string
    code?: string | number
    message?: string
    results?: WanxTaskResult[]
  }
}

const wait = (duration: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, duration)
  })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const getApiErrorMessage = (value: unknown, fallback: string): string => {
  if (isRecord(value) && typeof value.message === 'string') {
    return value.message
  }

  return fallback
}

export class WanxImageProvider implements ImageGenerationProvider {
  readonly name = 'dashscope'

  private readonly apiKey: string
  private readonly model: string
  private readonly baseUrl: string

  constructor() {
    const apiKey = process.env.DASHSCOPE_API_KEY?.trim()

    if (!apiKey) {
      throw new ProviderError({
        code: 'DASHSCOPE_API_KEY_MISSING',
        message: 'DashScope API key is not configured',
        retryable: false,
      })
    }

    this.apiKey = apiKey
    this.model = process.env.DASHSCOPE_MODEL?.trim() || defaultModel
    this.baseUrl = (process.env.DASHSCOPE_BASE_URL?.trim() || defaultBaseUrl).replace(
      /\/+$/,
      '',
    )
  }

  async generate(input: GenerateImageInput): Promise<GenerateImageResult> {
    const startedAt = Date.now()
    const taskId = await this.createTask(input)
    const images = await this.waitForResult(taskId)

    return {
      images,
      provider: this.name,
      model: this.model,
      durationMs: Date.now() - startedAt,
    }
  }

  private async createTask(input: GenerateImageInput): Promise<string> {
    const prompt = `${input.prompt}，${stylePrompts[input.style]}`
    const response = await this.request<WanxCreateTaskResponse>(
      '/services/aigc/text2image/image-synthesis',
      {
        method: 'POST',
        body: JSON.stringify({
          model: this.model,
          input: {
            prompt,
            ...(input.negativePrompt === undefined
              ? {}
              : { negative_prompt: input.negativePrompt }),
          },
          parameters: {
            size: aspectRatioSizes[input.aspectRatio],
            n: input.count,
            prompt_extend: true,
            watermark: false,
            ...(input.seed === undefined ? {} : { seed: input.seed }),
          },
        }),
      },
    )

    if (response.code !== undefined) {
      throw new ProviderError({
        code: String(response.code),
        message: response.message ?? 'DashScope rejected the image request',
        retryable: false,
      })
    }

    const taskId = response.output?.task_id
    if (!taskId) {
      throw new ProviderError({
        code: 'DASHSCOPE_INVALID_CREATE_RESPONSE',
        message: 'DashScope did not return a task ID',
        retryable: false,
      })
    }

    return taskId
  }

  private async waitForResult(taskId: string): Promise<GeneratedImage[]> {
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      await wait(pollingIntervalMs)

      const response = await this.request<WanxTaskQueryResponse>(`/tasks/${taskId}`)

      if (response.code !== undefined) {
        throw new ProviderError({
          code: String(response.code),
          message: response.message ?? 'DashScope task query failed',
          retryable: false,
        })
      }

      const status = response.output?.task_status

      if (status === 'PENDING' || status === 'RUNNING') {
        continue
      }

      if (status === 'SUCCEEDED') {
        return (response.output?.results ?? [])
          .filter((result): result is WanxTaskResult & { url: string } =>
            typeof result.url === 'string',
          )
          .map(({ url, width, height }) => ({
            url,
            ...(width === undefined ? {} : { width }),
            ...(height === undefined ? {} : { height }),
          }))
      }

      if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
        throw new ProviderError({
          code: String(response.output?.code ?? `DASHSCOPE_TASK_${status}`),
          message:
            response.output?.message ??
            response.message ??
            `DashScope task ${status.toLowerCase()}`,
          retryable: false,
        })
      }

      throw new ProviderError({
        code: 'DASHSCOPE_UNKNOWN_TASK_STATUS',
        message: response.message ?? 'DashScope returned an unknown task status',
        retryable: false,
      })
    }

    throw new ProviderError({
      code: 'DASHSCOPE_TASK_TIMEOUT',
      message: 'DashScope image generation timed out',
      retryable: true,
    })
  }

  private async request<ResponseBody>(
    path: string,
    init: RequestInit = {},
  ): Promise<ResponseBody> {
    let response: Response
    const headers = new Headers(init.headers)
    headers.set('Authorization', `Bearer ${this.apiKey}`)
    headers.set('Content-Type', 'application/json')
    headers.set('X-DashScope-Async', 'enable')

    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers,
      })
    } catch (cause: unknown) {
      throw new ProviderError({
        code: 'DASHSCOPE_NETWORK_ERROR',
        message: 'Unable to reach DashScope',
        retryable: true,
        cause,
      })
    }

    let payload: unknown

    try {
      payload = await response.json()
    } catch (cause: unknown) {
      throw new ProviderError({
        code: 'DASHSCOPE_INVALID_JSON',
        message: 'DashScope returned an invalid JSON response',
        retryable: response.status === 429,
        cause,
      })
    }

    if (!response.ok) {
      const errorResponse = payload as WanxApiErrorResponse
      throw new ProviderError({
        code: String(errorResponse.code ?? `HTTP_${response.status}`),
        message: getApiErrorMessage(payload, 'DashScope request failed'),
        retryable: response.status === 429,
      })
    }

    return payload as ResponseBody
  }
}
