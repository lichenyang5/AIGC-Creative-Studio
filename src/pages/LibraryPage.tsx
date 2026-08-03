import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { GenerationCard } from '../components/GenerationCard'
import { LocalImageCard } from '../components/LocalImageCard'
import { LocalArtworkCard } from '../components/LocalArtworkCard'
import { createApiUrl, createAuthHeaders } from '../config/api'
import { getImportedAssets, getLocalArtworks, saveImportedAsset } from '../services/localArtworkStorage'
import {
  type GenerationListErrorResponse,
  type GenerationListResponse,
  type GenerationTask,
} from '../types/generationApi'
import type { LocalArtwork } from '../types/localArtwork'
import type { ImportedAsset, ImportedAssetMimeType } from '../types/importedAsset'

const acceptedImageTypes = ['image/png', 'image/jpeg', 'image/webp'] as const
const maxImageSizeBytes = 10 * 1024 * 1024

const isAcceptedImageType = (
  type: string,
): type is ImportedAssetMimeType =>
  type === 'image/png' || type === 'image/jpeg' || type === 'image/webp'

export function LibraryPage() {
  const [tasks, setTasks] = useState<GenerationTask[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [importedAssets, setImportedAssets] = useState<ImportedAsset[]>([])
  const [localArtworks, setLocalArtworks] = useState<LocalArtwork[]>([])
  const [isLocalArtworksLoading, setIsLocalArtworksLoading] = useState(true)
  const [localArtworksError, setLocalArtworksError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadImportedAssets = useCallback(async () => {
    try {
      setImportedAssets(await getImportedAssets())
    } catch (cause: unknown) {
      setImportError(cause instanceof Error ? cause.message : '导入图片读取失败，请稍后重试')
    }
  }, [])

  const loadLocalArtworks = useCallback(async () => {
    setIsLocalArtworksLoading(true)
    setLocalArtworksError(null)
    try {
      setLocalArtworks(await getLocalArtworks())
    } catch (cause: unknown) {
      setLocalArtworksError(
        cause instanceof Error ? cause.message : '本地作品读取失败，请稍后重试',
      )
    } finally {
      setIsLocalArtworksLoading(false)
    }
  }, [])

  useEffect(() => {
    const loadAfterMount = window.setTimeout(() => {
      void loadLocalArtworks()
    }, 0)

    return () => window.clearTimeout(loadAfterMount)
  }, [loadLocalArtworks])

  useEffect(() => {
    const loadAfterMount = window.setTimeout(() => {
      void loadImportedAssets()
    }, 0)

    return () => window.clearTimeout(loadAfterMount)
  }, [loadImportedAssets])

  useEffect(() => {
    let isActive = true

    const loadTasks = async () => {
      try {
        const response = await fetch(
          createApiUrl('/api/generations?limit=20&offset=0'),
          { headers: createAuthHeaders() },
        )
        const data = (await response.json()) as
          | GenerationListResponse
          | GenerationListErrorResponse

        if (!response.ok || !data.success) {
          throw new Error('message' in data ? data.message : '加载生成库失败')
        }

        if (isActive) {
          setTasks(data.data.items)
        }
      } catch {
        if (isActive) {
          setLoadError('加载生成库失败，请稍后重试')
        }
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    void loadTasks()

    return () => {
      isActive = false
    }
  }, [])

  const imageCards = tasks.flatMap((task) =>
    (task.result?.images ?? []).map((image, imageIndex) => ({
      task,
      image,
      imageIndex,
    })),
  )
  const tasksWithoutImages = tasks.filter((task) => (task.result?.images.length ?? 0) === 0)

  const handleImageDeleted = (
    taskId: string,
    imageIndex: number | undefined,
    taskDeleted: boolean,
  ) => {
    setTasks((currentTasks) =>
      currentTasks.flatMap((task) => {
        if (task.taskId !== taskId) return [task]
        if (taskDeleted) return []
        if (imageIndex === undefined) return [task]
        return [{ ...task, result: { images: (task.result?.images ?? []).filter((_, index) => index !== imageIndex) } }]
      }),
    )
    setDeleteMessage('作品已删除')
  }

  const handleImportImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    if (!isAcceptedImageType(file.type)) {
      setImportError('仅支持 PNG、JPEG 或 WebP 格式的图片')
      return
    }

    if (file.size > maxImageSizeBytes) {
      setImportError('图片大小不能超过 10MB')
      return
    }

    if (isImporting) return

    setIsImporting(true)
    setImportError(null)
    try {
      const createdAt = new Date().toISOString()
      const asset: ImportedAsset = {
        id: crypto.randomUUID(),
        type: 'imported-asset',
        name: file.name,
        originalFileName: file.name,
        blob: file,
        mimeType: file.type,
        size: file.size,
        createdAt,
      }
      await saveImportedAsset(asset)
      setImportedAssets((current) => [asset, ...current.filter((item) => item.id !== asset.id)])
      setDeleteMessage('图片已导入')
    } catch (cause: unknown) {
      setImportError(cause instanceof Error ? cause.message : '导入图片失败，请稍后重试')
    } finally {
      setIsImporting(false)
    }
  }

  const handleLocalArtworkDeleted = (id: string) => {
    setLocalArtworks((current) => current.filter((artwork) => artwork.id !== id))
    setDeleteMessage('作品已删除')
  }

  const handleImportedAssetDeleted = (id: string) => {
    setImportedAssets((current) => current.filter((asset) => asset.id !== id))
    setDeleteMessage('图片已删除')
  }

  return (
    <main className="library-page">
        <div className="library-heading">
          <div>
            <h2>生成库</h2>
            <p>查看已完成的图片创作作品</p>
          </div>
          <button
            className="library-import-button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
          >
            {isImporting ? '导入中...' : '导入图片'}
          </button>
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            aria-label="导入本地图片"
            accept={acceptedImageTypes.join(',')}
            onChange={handleImportImage}
          />
          <Link className="library-create-link" to="/create">
            开始创作
          </Link>
        </div>

        <p className="library-session-note">导入素材和编辑作品仅保存在当前浏览器中</p>
        {importError && (
          <p className="library-import-error" role="alert">
            {importError}
          </p>
        )}

        {isLoading ? (
          <div className="library-state" role="status">
            <span className="loading-spinner" aria-hidden="true" />
            <p>正在加载生成作品...</p>
          </div>
        ) : loadError ? (
          <div className="library-state library-error" role="alert">
            <p>{loadError}</p>
          </div>
        ) : imageCards.length === 0 && tasksWithoutImages.length === 0 && importedAssets.length === 0 ? (
          <div className="library-state library-empty">
            <div className="placeholder-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none">
                <rect x="8" y="10" width="32" height="28" rx="4" stroke="currentColor" strokeWidth="2.5" />
                <circle cx="18" cy="20" r="3" fill="currentColor" />
                <path d="M11.5 34l8.5-8 5.5 5 4.5-4 6.5 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h3>还没有生成作品，去创作第一张图片吧</h3>
            <Link className="library-create-link" to="/create">
              开始创作
            </Link>
          </div>
        ) : (
          <>
          {deleteMessage && <p className="library-delete-message" role="status">{deleteMessage}</p>}
          <section className="library-grid" aria-label="已生成的图片">
            {importedAssets.map((asset) => (
              <LocalImageCard key={asset.id} asset={asset} onDeleted={handleImportedAssetDeleted} />
            ))}
            {imageCards.map(({ task, image, imageIndex }) => (
              <GenerationCard
                key={`${task.taskId}-${imageIndex}`}
                task={task}
                image={image}
                imageIndex={imageIndex}
                onDeleted={handleImageDeleted}
              />
            ))}
            {tasksWithoutImages.map((task) => (
              <GenerationCard
                key={task.taskId}
                task={task}
                onDeleted={handleImageDeleted}
              />
            ))}
          </section>
          </>
        )}

        <section className="local-artworks-section" aria-labelledby="local-artworks-heading">
          <div className="local-artworks-heading">
            <div>
              <h3 id="local-artworks-heading">本地作品</h3>
              <p>编辑后的 PNG 仅保存在当前浏览器中</p>
            </div>
            <button type="button" className="local-artworks-retry" onClick={() => void loadLocalArtworks()} disabled={isLocalArtworksLoading}>
              {isLocalArtworksLoading ? '加载中...' : '重新加载'}
            </button>
          </div>
          {isLocalArtworksLoading ? (
            <div className="library-state" role="status"><p>正在加载本地作品...</p></div>
          ) : localArtworksError ? (
            <div className="library-state library-error" role="status">
              <p>{localArtworksError}</p>
              <button type="button" onClick={() => void loadLocalArtworks()}>重试</button>
            </div>
          ) : localArtworks.length === 0 ? (
            <div className="local-artworks-empty">还没有保存的本地作品</div>
          ) : (
            <div className="library-grid" aria-label="本地作品">
              {localArtworks.map((artwork) => (
                <LocalArtworkCard key={artwork.id} artwork={artwork} onDeleted={handleLocalArtworkDeleted} />
              ))}
            </div>
          )}
        </section>
    </main>
  )
}
