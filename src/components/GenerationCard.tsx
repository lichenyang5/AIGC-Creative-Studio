import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { createApiUrl } from '../config/api'
import {
  type GeneratedImage,
  type GenerationStyle,
  type GenerationTask,
} from '../types/generationApi'

interface GenerationCardProps {
  task: GenerationTask
  image: GeneratedImage
  imageIndex: number
  onDeleted: (taskId: string, imageIndex: number, taskDeleted: boolean) => void
}

const styleText: Record<GenerationStyle, string> = {
  realistic: '写实摄影',
  anime: '二次元',
  cyberpunk: '赛博朋克',
  watercolor: '水彩插画',
}

const formatCreatedAt = (createdAt: string): string =>
  new Date(createdAt).toLocaleString('zh-CN')

export function GenerationCard({
  task,
  image,
  imageIndex,
  onDeleted,
}: GenerationCardProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [hasImageError, setHasImageError] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!isDeleteDialogOpen) return
    const triggerElement = triggerRef.current
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    confirmButtonRef.current?.focus()
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isDeleting) setIsDeleteDialogOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
      triggerElement?.focus()
    }
  }, [isDeleteDialogOpen, isDeleting])

  const handleDelete = async () => {
    if (isDeleting) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const response = await fetch(createApiUrl(`/api/generations/${task.taskId}/images/${imageIndex}`), { method: 'DELETE' })
      const data = (await response.json()) as { success: boolean; message: string; data?: { taskDeleted: boolean } }
      if (!response.ok || !data.success || !data.data) throw new Error(data.message)
      onDeleted(task.taskId, imageIndex, data.data.taskDeleted)
      setIsDeleteDialogOpen(false)
    } catch (cause: unknown) {
      setDeleteError(cause instanceof Error ? cause.message : '删除作品失败')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDownload = async () => {
    if (isDownloading) {
      return
    }

    setIsDownloading(true)
    setDownloadError(null)

    try {
      const response = await fetch(
        createApiUrl(
          `/api/generations/${task.taskId}/images/${imageIndex}/download`,
        ),
      )

      if (!response.ok) {
        throw new Error('Image download failed')
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const downloadLink = document.createElement('a')
      downloadLink.href = objectUrl
      downloadLink.download = `aigc-${task.taskId}-${imageIndex}.png`
      document.body.append(downloadLink)
      downloadLink.click()
      downloadLink.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
    } catch {
      setDownloadError('下载图片失败，请稍后重试')
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <article className="library-card">
      <div className="library-image-wrap">
        <span className="image-kind-label">
          {image.kind === 'edited' ? '编辑作品' : 'AI 生成'}
        </span>
        {hasImageError ? (
          <div className="library-image-placeholder" role="img" aria-label="图片加载失败">
            图片加载失败
          </div>
        ) : (
          <img
            src={image.url.startsWith('/') ? createApiUrl(image.url) : image.url}
            alt={`生成任务 ${task.taskId} 的第 ${imageIndex + 1} 张图片`}
            onError={() => setHasImageError(true)}
          />
        )}
      </div>

      <div className="library-card-content">
        <p className="library-prompt">{task.request.prompt}</p>
        <dl className="library-metadata">
          <div>
            <dt>风格</dt>
            <dd>{styleText[task.request.style]}</dd>
          </div>
          <div>
            <dt>比例</dt>
            <dd>{task.request.aspectRatio}</dd>
          </div>
          <div>
            <dt>生成时间</dt>
            <dd>{formatCreatedAt(task.createdAt)}</dd>
          </div>
        </dl>

        <div className="library-card-actions">
          <Link
            className="image-action-button image-action-link"
            to={`/editor/${task.taskId}/${imageIndex}`}
          >
            编辑
          </Link>
          <button
            type="button"
            className="image-action-button"
            onClick={() => void handleDownload()}
            disabled={isDownloading}
          >
            {isDownloading ? '下载中...' : '下载'}
          </button>
          <button ref={triggerRef} type="button" className="delete-image-button" onClick={() => setIsDeleteDialogOpen(true)}>删除</button>
          <button
            type="button"
            className="image-action-button"
            onClick={() =>
              window.open(
                image.url.startsWith('/') ? createApiUrl(image.url) : image.url,
                '_blank',
                'noopener,noreferrer',
              )
            }
          >
            新窗口查看
          </button>
        </div>

        {downloadError && (
          <p className="library-card-error" role="alert">
            {downloadError}
          </p>
        )}
      </div>
      {isDeleteDialogOpen && (
        <div className="delete-dialog-backdrop" onClick={() => !isDeleting && setIsDeleteDialogOpen(false)}>
          <section className="delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="delete-dialog-title">删除这张作品？</h3>
            <p>删除后将无法恢复，本地图片文件也会被移除。</p>
            {deleteError && <p className="library-card-error" role="alert">{deleteError}</p>}
            <div className="delete-dialog-actions">
              <button type="button" className="image-action-button" disabled={isDeleting} onClick={() => setIsDeleteDialogOpen(false)}>取消</button>
              <button ref={confirmButtonRef} type="button" className="delete-confirm-button" disabled={isDeleting} onClick={() => void handleDelete()}>{isDeleting ? '删除中...' : '确认删除'}</button>
            </div>
          </section>
        </div>
      )}
    </article>
  )
}
