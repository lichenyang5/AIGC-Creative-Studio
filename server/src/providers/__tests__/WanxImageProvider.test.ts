import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WanxImageProvider } from '../WanxImageProvider.js'
import { ProviderError, type GenerateImageInput } from '../types.js'

const testApiKey = 'test-dashscope-api-key'
const testBaseUrl = 'https://example.test/api/v1'
const pollingIntervalMs = 10_000
const timeoutMs = 120_000

const originalEnvironment = {
  apiKey: process.env.DASHSCOPE_API_KEY,
  model: process.env.DASHSCOPE_MODEL,
  baseUrl: process.env.DASHSCOPE_BASE_URL,
}

const defaultInput: GenerateImageInput = {
  prompt: '测试图片',
  aspectRatio: '1:1',
  count: 1,
  style: 'realistic',
}

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })

const restoreEnvironmentValue = (key: string, value: string | undefined): void => {
  if (value === undefined) {
    delete process.env[key]
    return
  }

  process.env[key] = value
}

const expectProviderError = async (promise: Promise<unknown>): Promise<ProviderError> => {
  try {
    await promise
  } catch (error: unknown) {
    if (error instanceof ProviderError) {
      return error
    }

    throw error
  }

  throw new Error('Expected the provider to reject')
}

type PromiseOutcome<Value> =
  | { ok: true; value: Value }
  | { ok: false; error: unknown }

const captureOutcome = <Value>(promise: Promise<Value>): Promise<PromiseOutcome<Value>> =>
  promise.then(
    (value) => ({ ok: true, value }),
    (error: unknown) => ({ ok: false, error }),
  )

const createFetchMock = (): ReturnType<typeof vi.fn<typeof fetch>> => vi.fn<typeof fetch>()

describe('WanxImageProvider', () => {
  beforeEach(() => {
    process.env.DASHSCOPE_API_KEY = testApiKey
    process.env.DASHSCOPE_MODEL = 'wanx2.0-t2i-turbo'
    process.env.DASHSCOPE_BASE_URL = testBaseUrl
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    restoreEnvironmentValue('DASHSCOPE_API_KEY', originalEnvironment.apiKey)
    restoreEnvironmentValue('DASHSCOPE_MODEL', originalEnvironment.model)
    restoreEnvironmentValue('DASHSCOPE_BASE_URL', originalEnvironment.baseUrl)
  })

  it('rejects without an API key before calling fetch', () => {
    const fetchMock = createFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    delete process.env.DASHSCOPE_API_KEY

    expect(() => new WanxImageProvider()).toThrow(ProviderError)
    expect(() => new WanxImageProvider()).toThrow(/API key/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('creates a task, polls it, and returns generated images', async () => {
    vi.useFakeTimers()
    const fetchMock = createFetchMock()
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          output: { task_status: 'PENDING', task_id: 'external-task-001' },
          request_id: 'request-001',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          output: { task_id: 'external-task-001', task_status: 'RUNNING' },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          output: {
            task_id: 'external-task-001',
            task_status: 'SUCCEEDED',
            results: [{ url: 'https://example.test/generated/image-1.png' }],
          },
          usage: { image_count: 1 },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = new WanxImageProvider().generate(defaultInput)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(pollingIntervalMs)
    await vi.advanceTimersByTimeAsync(pollingIntervalMs)

    await expect(resultPromise).resolves.toMatchObject({
      provider: 'dashscope',
      model: 'wanx2.0-t2i-turbo',
      images: [{ url: 'https://example.test/generated/image-1.png' }],
    })
    const result = await resultPromise
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(fetchMock).toHaveBeenCalledTimes(3)

    const [createUrl, createOptions] = fetchMock.mock.calls[0]
    expect(String(createUrl)).toBe(
      'https://example.test/api/v1/services/aigc/text2image/image-synthesis',
    )
    expect(createOptions?.method).toBe('POST')
    const headers = new Headers(createOptions?.headers)
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('X-DashScope-Async')).toBe('enable')
    expect(headers.get('Authorization')).toBe(`Bearer ${testApiKey}`)

    const [firstQueryUrl] = fetchMock.mock.calls[1]
    const [secondQueryUrl] = fetchMock.mock.calls[2]
    expect(String(firstQueryUrl)).toBe('https://example.test/api/v1/tasks/external-task-001')
    expect(String(secondQueryUrl)).toBe('https://example.test/api/v1/tasks/external-task-001')
  })

  it('maps generation input to the Wanx create-task request body', async () => {
    vi.useFakeTimers()
    const fetchMock = createFetchMock()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ output: { task_id: 'external-task-002' } }))
      .mockResolvedValueOnce(
        jsonResponse({
          output: {
            task_status: 'SUCCEEDED',
            results: [{ url: 'https://example.test/generated/image-2.png' }],
          },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = new WanxImageProvider().generate({
      prompt: '一只坐在窗边的猫',
      negativePrompt: '模糊',
      aspectRatio: '16:9',
      count: 1,
      seed: 12345,
      style: 'anime',
    })
    await vi.advanceTimersByTimeAsync(0)

    const [, options] = fetchMock.mock.calls[0]
    expect(options?.body).toBeTypeOf('string')
    const body = JSON.parse(String(options?.body)) as {
      model: string
      input: { prompt: string; negative_prompt?: string }
      parameters: {
        size: string
        n: number
        seed?: number
        prompt_extend: boolean
        watermark: boolean
      }
    }
    expect(body.model).toBe('wanx2.0-t2i-turbo')
    expect(body.input.prompt).toContain('一只坐在窗边的猫')
    expect(body.input.prompt).toContain('二次元')
    expect(body.input.negative_prompt).toBe('模糊')
    expect(body.parameters).toMatchObject({
      size: '1280*720',
      n: 1,
      seed: 12345,
      prompt_extend: true,
      watermark: false,
    })

    await vi.advanceTimersByTimeAsync(pollingIntervalMs)
    await expect(resultPromise).resolves.toBeDefined()
  })

  it('maps a failed external task to a non-retryable provider error', async () => {
    vi.useFakeTimers()
    const fetchMock = createFetchMock()
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ output: { task_id: 'external-task-failed' } }))
      .mockResolvedValueOnce(
        jsonResponse({
          output: {
            task_id: 'external-task-failed',
            task_status: 'FAILED',
            code: 'DataInspectionFailed',
            message: 'Input data may contain inappropriate content.',
          },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = new WanxImageProvider().generate(defaultInput)
    const outcomePromise = captureOutcome(resultPromise)
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(pollingIntervalMs)

    const outcome = await outcomePromise
    expect(outcome.ok).toBe(false)
    if (outcome.ok) {
      throw new Error('Expected the provider to reject')
    }
    if (!(outcome.error instanceof ProviderError)) {
      throw outcome.error
    }

    const error = outcome.error
    expect(error.code).toBe('DataInspectionFailed')
    expect(error.retryable).toBe(false)
    expect(error.message).not.toContain(testApiKey)
  })

  it('marks a throttled create request as retryable and does not poll', async () => {
    const fetchMock = createFetchMock()
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ code: 'Throttling', message: 'Too many requests' }, 429),
    )
    vi.stubGlobal('fetch', fetchMock)

    const error = await expectProviderError(new WanxImageProvider().generate(defaultInput))
    expect(error.code).toBe('Throttling')
    expect(error.retryable).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('marks an unauthorized create request as non-retryable and does not poll', async () => {
    const fetchMock = createFetchMock()
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ code: 'InvalidApiKey', message: 'Invalid API key' }, 401),
    )
    vi.stubGlobal('fetch', fetchMock)

    const error = await expectProviderError(new WanxImageProvider().generate(defaultInput))
    expect(error.retryable).toBe(false)
    expect(error.message).not.toContain(testApiKey)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('times out after the configured polling window without real waiting', async () => {
    vi.useFakeTimers()
    const fetchMock = createFetchMock()
    fetchMock.mockResolvedValueOnce(jsonResponse({ output: { task_id: 'external-task-timeout' } }))
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        jsonResponse({
          output: { task_id: 'external-task-timeout', task_status: 'PENDING' },
        }),
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const resultPromise = new WanxImageProvider().generate(defaultInput)
    const outcomePromise = captureOutcome(resultPromise)
    await vi.advanceTimersByTimeAsync(0)
    for (let elapsed = 0; elapsed < timeoutMs; elapsed += pollingIntervalMs) {
      await vi.advanceTimersByTimeAsync(pollingIntervalMs)
    }

    const outcome = await outcomePromise
    expect(outcome.ok).toBe(false)
    if (outcome.ok) {
      throw new Error('Expected the provider to reject')
    }
    if (!(outcome.error instanceof ProviderError)) {
      throw outcome.error
    }

    const error = outcome.error
    expect(error.code).toBe('DASHSCOPE_TASK_TIMEOUT')
    expect(error.message).toMatch(/timed out/i)
    expect(error.retryable).toBe(true)
  })
})
