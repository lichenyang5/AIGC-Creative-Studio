import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LocalImageProvider } from '../../contexts/LocalImageContext'
import { saveImportedAsset } from '../../services/localArtworkStorage'
import { LibraryPage } from '../LibraryPage'

const importedAssets = vi.hoisted(() => [] as Array<{ id: string; originalFileName: string }>)

vi.mock('../../services/localArtworkStorage', () => ({
  getLocalArtworks: vi.fn(async () => []),
  getImportedAssets: vi.fn(async () => importedAssets),
  saveImportedAsset: vi.fn(async (asset: { id: string; originalFileName: string }) => {
    importedAssets.unshift(asset)
  }),
}))

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
  })

const createFetchMock = (): ReturnType<typeof vi.fn<typeof fetch>> =>
  vi.fn<typeof fetch>((input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'

    if (
      method === 'GET' &&
      url.endsWith('/api/generations?limit=20&offset=0')
    ) {
      return Promise.resolve(
        jsonResponse({
          success: true,
          data: { items: [], total: 0, limit: 20, offset: 0, hasMore: false },
        }),
      )
    }

    throw new Error(`Unexpected fetch: ${method} ${url}`)
  })

const renderLibraryPage = (): void => {
  render(
    <LocalImageProvider>
      <MemoryRouter initialEntries={['/library']}>
        <Routes>
          <Route path="/library" element={<LibraryPage />} />
        </Routes>
      </MemoryRouter>
    </LocalImageProvider>,
  )
}

afterEach(() => {
  cleanup()
  importedAssets.length = 0
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('LibraryPage local image import', () => {
  it('rejects a file with an unsupported type', async () => {
    vi.stubGlobal('fetch', createFetchMock())
    const user = userEvent.setup({ applyAccept: false })
    renderLibraryPage()

    await user.upload(
      screen.getByLabelText('导入本地图片'),
      new File(['not an image'], 'notes.txt', { type: 'text/plain' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '仅支持 PNG、JPEG 或 WebP 格式的图片',
    )
  })

  it('rejects an image larger than 10MB', async () => {
    vi.stubGlobal('fetch', createFetchMock())
    const user = userEvent.setup()
    renderLibraryPage()
    const oversizedImage = new File(
      [new Uint8Array(10 * 1024 * 1024 + 1)],
      'large.png',
      { type: 'image/png' },
    )

    await user.upload(screen.getByLabelText('导入本地图片'), oversizedImage)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '图片大小不能超过 10MB',
    )
  })

  it('creates a temporary local card with an editor entry', async () => {
    vi.stubGlobal('fetch', createFetchMock())
    vi.stubGlobal('URL', {
      createObjectURL: () => 'blob:local-import-preview',
      revokeObjectURL: () => undefined,
    })
    const user = userEvent.setup()
    renderLibraryPage()

    await user.upload(
      screen.getByLabelText('导入本地图片'),
      new File(['image data'], 'local-image.png', { type: 'image/png' }),
    )

    expect(await screen.findAllByText('导入素材')).not.toHaveLength(0)
    expect(screen.getByText('local-image.png')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '进入编辑' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/editor\/imported\//),
    )
    expect(screen.queryByRole('button', { name: '复用参数' })).not.toBeInTheDocument()
  })

  it('shows the storage failure returned while importing', async () => {
    vi.stubGlobal('fetch', createFetchMock())
    vi.mocked(saveImportedAsset).mockRejectedValueOnce(new Error('浏览器存储空间不足'))
    const user = userEvent.setup()
    renderLibraryPage()

    await user.upload(
      screen.getByLabelText('导入本地图片'),
      new File(['image data'], 'local-image.png', { type: 'image/png' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent('浏览器存储空间不足')
  })
})
