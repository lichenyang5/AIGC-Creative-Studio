import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../../contexts/AuthContext'
import { ProfilePage } from '../ProfilePage'

const sessionKey = 'aigc-auth-session'

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const renderProfilePage = (): void => {
  render(
    <AuthProvider><MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
      </Routes>
    </MemoryRouter></AuthProvider>,
  )
}

beforeEach(() => {
  sessionStorage.setItem(sessionKey, JSON.stringify({
    user: { id: 'profile-user-id', email: 'profile@example.test', displayName: '个人中心测试用户' },
    token: 'profile-test-token',
  }))
})

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('ProfilePage', () => {
  it('loads and displays only the current user summary returned by the API', async () => {
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      expect(String(input)).toMatch(/\/api\/generations\/summary$/)
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer profile-test-token' })
      return Promise.resolve(jsonResponse({
        success: true,
        data: {
          totalTasks: 8,
          succeededTasks: 5,
          failedTasks: 1,
          pendingTasks: 1,
          processingTasks: 1,
          imageCount: 6,
        },
      }))
    })
    vi.stubGlobal('fetch', fetchMock)

    renderProfilePage()

    expect(await screen.findByText('个人中心测试用户')).toBeInTheDocument()
    expect(screen.getByText('生成任务')).toBeInTheDocument()
    expect(screen.getByText('图片作品')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('等待处理 1 个，生成中 1 个。')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows a clear error when the summary API fails', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>(() => Promise.resolve(jsonResponse({
      success: false,
      message: 'Unable to load generation summary',
    }, 500))))

    renderProfilePage()

    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load generation summary')
  })
})
