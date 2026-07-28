import { useState } from 'react'
import type { GenerationTask } from '../types/generationApi'

interface ResultPreviewProps {
  isGenerating: boolean
  task: GenerationTask | null
  error: string | null
  isRefreshingTask: boolean
  refreshError: string | null
  onRefreshTask: () => Promise<void>
}

const taskStatusText: Record<GenerationTask['status'], string> = {
  pending: '等待处理',
  processing: '生成中',
  succeeded: '生成完成',
  failed: '生成失败',
}

const formatCreatedAt = (createdAt: string): string => {
  if (!createdAt) {
    return '等待刷新'
  }

  return new Date(createdAt).toLocaleString('zh-CN')
}

export function ResultPreview({
  isGenerating,
  task,
  error,
  isRefreshingTask,
  refreshError,
  onRefreshTask,
}: ResultPreviewProps) {
  const [downloadingImageIndex, setDownloadingImageIndex] = useState<number | null>(null)
  const [imageDownloadError, setImageDownloadError] = useState<string | null>(null)

  const downloadImage = async (taskId: string, imageIndex: number) => {
    if (downloadingImageIndex !== null) {
      return
    }

    setDownloadingImageIndex(imageIndex)
    setImageDownloadError(null)

    try {
      const response = await fetch(
        `http://localhost:3001/api/generations/${taskId}/images/${imageIndex}/download`,
      )

      if (!response.ok) {
        throw new Error('Image download failed')
      }

      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const downloadLink = document.createElement('a')
      downloadLink.href = objectUrl
      downloadLink.download = `aigc-${taskId}-${imageIndex}.png`
      document.body.append(downloadLink)
      downloadLink.click()
      downloadLink.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
    } catch {
      setImageDownloadError('下载图片失败，请稍后重试')
    } finally {
      setDownloadingImageIndex(null)
    }
  }

  return (
    <section className="panel preview-panel" aria-labelledby="preview-title">
      <div className="panel-heading">
        <h2 id="preview-title">创作结果</h2>
        <p>生成的图片将在此区域呈现</p>
      </div>

      <div className="preview-stage">
        {isGenerating ? (
          <div className="loading-state" role="status" aria-live="polite">
            <span className="loading-spinner" aria-hidden="true" />
            <h3>正在提交任务</h3>
            <p>正在将你的创作参数发送到服务端</p>
          </div>
        ) : task ? (
          <div className="task-state" role="status">
            <span className="task-state-icon" aria-hidden="true">✓</span>
            <h3>任务已创建</h3>
            <dl className="task-details">
              <div>
                <dt>Task ID</dt>
                <dd>{task.taskId}</dd>
              </div>
              <div>
                <dt>状态</dt>
                <dd className="task-status">{taskStatusText[task.status]}</dd>
              </div>
              <div>
                <dt>创建时间</dt>
                <dd>{formatCreatedAt(task.createdAt)}</dd>
              </div>
            </dl>
            <button
              className="refresh-task-button"
              type="button"
              onClick={() => void onRefreshTask()}
              disabled={isRefreshingTask}
            >
              {isRefreshingTask ? '查询中...' : '刷新状态'}
            </button>
            {refreshError && (
              <p className="refresh-error" role="alert">
                {refreshError}
              </p>
            )}

            {task.status === 'succeeded' && task.result?.images.length ? (
              <div className="generated-images" aria-label="生成图片">
                {task.result.images.map((image, index) => (
                  <article className="generated-image-card" key={image.url}>
                    <img
                      src={image.url}
                      alt={`生成任务 ${task.taskId} 的第 ${index + 1} 张图片`}
                    />
                    <div className="generated-image-actions">
                      <button
                        type="button"
                        className="image-action-button"
                        onClick={() => void downloadImage(task.taskId, index)}
                        disabled={downloadingImageIndex !== null}
                      >
                        {downloadingImageIndex === index ? '下载中...' : '下载'}
                      </button>
                      <button
                        type="button"
                        className="image-action-button"
                        onClick={() =>
                          window.open(image.url, '_blank', 'noopener,noreferrer')
                        }
                      >
                        新窗口查看
                      </button>
                    </div>
                  </article>
                ))}
                {imageDownloadError && (
                  <p className="image-download-error" role="alert">
                    {imageDownloadError}
                  </p>
                )}
              </div>
            ) : null}
          </div>
        ) : error ? (
          <div className="error-state" role="alert">
            <span className="error-state-icon" aria-hidden="true">!</span>
            <h3>提交失败</h3>
            <p>{error}</p>
          </div>
        ) : (
          <div className="empty-state">
            <div className="placeholder-icon" aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none">
                <rect
                  x="8"
                  y="10"
                  width="32"
                  height="28"
                  rx="4"
                  stroke="currentColor"
                  strokeWidth="2.5"
                />
                <circle cx="18" cy="20" r="3" fill="currentColor" />
                <path
                  d="M11.5 34l8.5-8 5.5 5 4.5-4 6.5 7"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <h3>生成结果将在这里展示</h3>
            <p>填写左侧参数并开始创作</p>
          </div>
        )}
      </div>
    </section>
  )
}
