import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ImageCanvas } from '../components/ImageCanvas'
import { createApiUrl } from '../config/api'
import type {
  GenerationStyle,
  GenerationTask,
  GenerationTaskQueryErrorResponse,
  GenerationTaskQuerySuccessResponse,
} from '../types/generationApi'

const styleText: Record<GenerationStyle, string> = {
  realistic: '写实摄影',
  anime: '二次元',
  cyberpunk: '赛博朋克',
  watercolor: '水彩插画',
}

const isValidImageIndex = (value: string | undefined): value is string =>
  value !== undefined && /^(0|[1-9]\d*)$/.test(value)

const formatCreatedAt = (createdAt: string): string =>
  new Date(createdAt).toLocaleString('zh-CN')

export function EditorPage() {
  const { taskId, imageIndex: imageIndexParam } = useParams()
  const [task, setTask] = useState<GenerationTask | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const imageIndex = isValidImageIndex(imageIndexParam) ? Number(imageIndexParam) : null

  useEffect(() => {
    let isActive = true

    const loadTask = async () => {
      if (!taskId || imageIndex === null) {
        if (isActive) {
          setError('找不到需要编辑的图片')
          setIsLoading(false)
        }
        return
      }

      try {
        const response = await fetch(createApiUrl(`/api/generations/${taskId}`))
        const data = (await response.json()) as
          | GenerationTaskQuerySuccessResponse
          | GenerationTaskQueryErrorResponse

        if (!response.ok || !data.success) {
          throw new Error('message' in data ? data.message : '加载生成任务失败')
        }

        if (data.data.status !== 'succeeded' || !data.data.result?.images[imageIndex]) {
          throw new Error('找不到需要编辑的图片')
        }

        if (isActive) {
          setTask(data.data)
        }
      } catch (cause: unknown) {
        if (isActive) {
          setError(
            cause instanceof Error ? cause.message : '加载生成任务失败，请稍后重试',
          )
        }
      } finally {
        if (isActive) {
          setIsLoading(false)
        }
      }
    }

    void loadTask()

    return () => {
      isActive = false
    }
  }, [imageIndex, taskId])

  if (isLoading) {
    return (
      <main className="editor-page">
        <div className="editor-state" role="status">正在加载图片...</div>
      </main>
    )
  }

  if (error || !task || imageIndex === null) {
    return (
      <main className="editor-page">
        <div className="editor-state editor-error" role="alert">
          <p>{error ?? '找不到需要编辑的图片'}</p>
          <Link className="library-create-link" to="/library">返回生成库</Link>
        </div>
      </main>
    )
  }

  const image = task.result?.images[imageIndex]
  if (!image) {
    return (
      <main className="editor-page">
        <div className="editor-state editor-error" role="alert">
          <p>找不到需要编辑的图片</p>
          <Link className="library-create-link" to="/library">返回生成库</Link>
        </div>
      </main>
    )
  }

  const imageUrl = image.url.startsWith('/') ? createApiUrl(image.url) : image.url

  return (
    <main className="editor-page">
      <div className="editor-heading">
        <div>
          <h2>图片编辑器</h2>
          <p>当前阶段仅提供原图预览</p>
        </div>
        <Link className="library-create-link" to="/library">返回生成库</Link>
      </div>

      <div className="editor-layout">
        <aside className="editor-tools" aria-label="编辑工具">
          <h3>编辑工具</h3>
          <button type="button" disabled>黑白</button>
          <button type="button" disabled>雨滴</button>
          <button type="button" disabled>灰度渐变</button>
        </aside>

        <section className="editor-canvas-panel" aria-label="图片画布">
          <ImageCanvas
            imageUrl={imageUrl}
            alt={`生成任务 ${task.taskId} 的第 ${imageIndex + 1} 张图片`}
          />
        </section>

        <aside className="editor-info" aria-label="图片信息">
          <h3>图片信息</h3>
          <dl>
            <div>
              <dt>原始 Prompt</dt>
              <dd>{task.request.prompt}</dd>
            </div>
            <div>
              <dt>风格</dt>
              <dd>{styleText[task.request.style]}</dd>
            </div>
            <div>
              <dt>图片比例</dt>
              <dd>{task.request.aspectRatio}</dd>
            </div>
            <div>
              <dt>生成时间</dt>
              <dd>{formatCreatedAt(task.createdAt)}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </main>
  )
}
