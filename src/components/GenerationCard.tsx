import { useState } from 'react'
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
}: GenerationCardProps) {
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [hasImageError, setHasImageError] = useState(false)

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
          <button
            type="button"
            className="image-action-button"
            onClick={() => void handleDownload()}
            disabled={isDownloading}
          >
            {isDownloading ? '下载中...' : '下载'}
          </button>
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
    </article>
  )
}
