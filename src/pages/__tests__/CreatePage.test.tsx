import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import CreatePage from '../CreatePage'
import { AppLayout } from '../../components/AppLayout'
import { AuthProvider } from '../../contexts/AuthContext'

interface TaskFailure {
  code?: string
  message?: string
}

const taskId = 'frontend-test-task'

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })

const createTaskResponse = () =>
  jsonResponse(
    {
      success: true,
      message: 'Generation request accepted',
      data: {
        taskId,
        status: 'pending',
        request: {
          prompt: '测试生成失败',
          negativePrompt: '',
          aspectRatio: '1:1',
          count: 1,
          style: 'realistic',
        },
        createdAt: '2026-07-30T00:00:00.000Z',
      },
    },
    202,
  )

const failedTaskResponse = (error?: TaskFailure): Response =>
  jsonResponse({
    success: true,
    data: {
      taskId,
      status: 'failed',
      request: {
        prompt: '测试生成失败',
        negativePrompt: '',
        aspectRatio: '1:1',
        count: 1,
        style: 'realistic',
      },
      createdAt: '2026-07-30T00:00:00.000Z',
      completedAt: '2026-07-30T00:00:01.000Z',
      ...(error === undefined ? {} : { error }),
    },
  })

const createFetchMock = (failure?: TaskFailure): ReturnType<typeof vi.fn<typeof fetch>> =>
  vi.fn<typeof fetch>((input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'

    if (method === 'GET' && url.endsWith('/api/health')) {
      return Promise.resolve(
        jsonResponse({
          success: true,
          message: 'AIGC Creative Studio API is running',
        }),
      )
    }

    if (method === 'POST' && url.endsWith('/api/generations')) {
      return Promise.resolve(createTaskResponse())
    }

    if (method === 'GET' && url.endsWith(`/api/generations/${taskId}`)) {
      return Promise.resolve(failedTaskResponse(failure))
    }

    throw new Error(`Unexpected fetch: ${method} ${url}`)
  })

const renderCreatePage = (locationState?: unknown): void => {
  render(
    <AuthProvider><MemoryRouter initialEntries={[{ pathname: '/create', state: locationState }]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/create" element={<CreatePage />} />
        </Route>
      </Routes>
    </MemoryRouter></AuthProvider>,
  )
}

const submitAndRefreshForFailure = async (
  user: ReturnType<typeof userEvent.setup>,
): Promise<void> => {
  await user.type(screen.getByLabelText('Prompt'), '测试生成失败')
  await user.click(screen.getByRole('button', { name: '开始生成' }))
  await user.click(await screen.findByRole('button', { name: /刷新状态/ }))
}

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('CreatePage generation failures', () => {
  it('restores the active task after returning to the creation page', async () => {
    sessionStorage.setItem('aigc-active-generation-session', JSON.stringify({
      taskId,
      formData: {
        prompt: '测试生成失败',
        negativePrompt: '',
        aspectRatio: '1:1',
        imageCount: 1,
        seed: '',
        stylePreset: '写实摄影',
      },
    }))
    const fetchMock = createFetchMock()
    vi.stubGlobal('fetch', fetchMock)

    renderCreatePage()

    expect(await screen.findByText(taskId)).toBeInTheDocument()
  })

  it('loads valid reused generation parameters without submitting a task', async () => {
    const fetchMock = createFetchMock()
    vi.stubGlobal('fetch', fetchMock)

    renderCreatePage({
      reusedGenerationRequest: {
        prompt: '复用的未来城市',
        negativePrompt: '模糊',
        aspectRatio: '16:9',
        count: 2,
        seed: 12345,
        style: 'cyberpunk',
      },
    })

    expect(await screen.findByText('已载入历史生成参数，可调整后重新生成')).toBeInTheDocument()
    expect(screen.getByLabelText('Prompt')).toHaveValue('复用的未来城市')
    expect(screen.getByLabelText(/Negative Prompt/)).toHaveValue('模糊')
    expect(screen.getByLabelText('Seed')).toHaveValue(12345)
    expect(screen.getByLabelText('风格预设')).toHaveValue('赛博朋克')
    expect(screen.getByLabelText('16:9')).toBeChecked()
    expect(screen.getByLabelText('2')).toBeChecked()
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/generations$/),
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('shows the backend task failure reason', async () => {
    const fetchMock = createFetchMock({
      code: 'DataInspectionFailed',
      message: '提示词未通过内容安全检查',
    })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    renderCreatePage()
    await submitAndRefreshForFailure(user)

    expect(await screen.findByRole('heading', { name: '生成失败' })).toBeInTheDocument()
    expect(screen.getByText('提示词未通过内容安全检查')).toBeInTheDocument()
    expect(screen.getByText('DataInspectionFailed')).toBeInTheDocument()
    expect(screen.queryByText('无法连接图片生成服务')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始生成' })).toBeEnabled()
  })

  it('shows the existing fallback message when no backend failure detail is provided', async () => {
    const fetchMock = createFetchMock()
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    renderCreatePage()
    await submitAndRefreshForFailure(user)

    expect(await screen.findByRole('heading', { name: '生成失败' })).toBeInTheDocument()
    expect(screen.getByText('图片生成失败，请稍后重试')).toBeInTheDocument()
  })
})
