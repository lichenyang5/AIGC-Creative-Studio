import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from '../AppLayout'

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })

const renderAppLayout = (): void => {
  render(
    <MemoryRouter initialEntries={['/create']}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/create" element={<main>创作页面</main>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Header service status', () => {
  it('shows the connected status after a successful health check', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        success: true,
        message: 'AIGC Creative Studio API is running',
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderAppLayout()

    expect(screen.getByText('服务检测中')).toBeInTheDocument()
    await screen.findByText('服务正常')
    expect(screen.queryByText('服务未连接')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalled()

    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toMatch(/\/api\/health$/)
  })

  it('shows the disconnected status when the health check fails', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)

    renderAppLayout()

    await screen.findByText('服务未连接')
    expect(screen.getByRole('link', { name: '图片创作' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '生成库' })).toBeInTheDocument()
  })
})
