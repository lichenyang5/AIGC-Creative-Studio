import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { LocalArtworkCard } from '../LocalArtworkCard'
import { deleteLocalArtwork } from '../../services/localArtworkStorage'
import type { LocalArtwork } from '../../types/localArtwork'

vi.mock('../../services/localArtworkStorage', () => ({
  deleteLocalArtwork: vi.fn(),
}))

const artwork: LocalArtwork = {
  id: 'local-artwork-001',
  name: '编辑作品 2026-07-30',
  blob: new Blob(['png'], { type: 'image/png' }),
  mimeType: 'image/png',
  createdAt: '2026-07-30T00:00:00.000Z',
  sourceType: 'generated',
  sourceTaskId: 'task-001',
  sourceImageIndex: 0,
  effectMode: 'grayscale',
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('LocalArtworkCard', () => {
  it('asks for confirmation and removes the local artwork in place', async () => {
    const deleteMock = vi.mocked(deleteLocalArtwork)
    deleteMock.mockResolvedValue(undefined)
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:local-artwork'),
      revokeObjectURL: vi.fn(),
    })
    const onDeleted = vi.fn()
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <LocalArtworkCard artwork={artwork} onDeleted={onDeleted} />
      </MemoryRouter>,
    )

    expect(screen.getByText('本地作品')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '复用参数' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: '进入编辑' })).toHaveAttribute(
      'href',
      '/editor/local-artwork-local-artwork-001/0',
    )

    await user.click(screen.getByRole('button', { name: '删除' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认删除' }))

    expect(deleteMock).toHaveBeenCalledWith('local-artwork-001')
    expect(onDeleted).toHaveBeenCalledWith('local-artwork-001')
  })
})
