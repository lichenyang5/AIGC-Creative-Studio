import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ImageCanvas,
  type ImageCanvasHandle,
  type ImageEditMode,
} from '../components/ImageCanvas'
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
  const [editMode, setEditMode] = useState<ImageEditMode>('original')
  const [blackWhiteIntensity, setBlackWhiteIntensity] = useState(0)
  const [gradientPosition, setGradientPosition] = useState(50)
  const [gradientWidth, setGradientWidth] = useState(15)
  const [rainAmount, setRainAmount] = useState(80)
  const [rainLength, setRainLength] = useState(25)
  const [rainAngle, setRainAngle] = useState(-15)
  const [rainOpacity, setRainOpacity] = useState(40)
  const [isCanvasReady, setIsCanvasReady] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const imageCanvasRef = useRef<ImageCanvasHandle>(null)
  const imageIndex = isValidImageIndex(imageIndexParam) ? Number(imageIndexParam) : null

  const handleImageLoad = useCallback(() => {
    setEditMode('original')
    setBlackWhiteIntensity(0)
    setGradientPosition(50)
    setGradientWidth(15)
    setRainAmount(80)
    setRainLength(25)
    setRainAngle(-15)
    setRainOpacity(40)
  }, [])

  const handleCanvasLoadStateChange = useCallback((isReady: boolean) => {
    setIsCanvasReady(isReady)
  }, [])

  const handleGradientPositionChange = useCallback((position: number) => {
    setGradientPosition(position)
  }, [])

  useEffect(() => {
    setEditMode('original')
    setBlackWhiteIntensity(0)
    setGradientPosition(50)
    setGradientWidth(15)
    setRainAmount(80)
    setRainLength(25)
    setRainAngle(-15)
    setRainOpacity(40)
    setIsCanvasReady(false)
    setExportMessage(null)
  }, [taskId, imageIndexParam])

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

  const handleExport = async () => {
    if (isExporting || !isCanvasReady || !imageCanvasRef.current) {
      return
    }

    setIsExporting(true)
    setExportMessage(null)

    try {
      const blob = await imageCanvasRef.current.exportImage()
      const objectUrl = URL.createObjectURL(blob)
      const downloadLink = document.createElement('a')
      downloadLink.href = objectUrl
      downloadLink.download = `aigc-edited-${task.taskId}-${imageIndex}.png`
      document.body.append(downloadLink)
      downloadLink.click()
      downloadLink.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
      setExportMessage('图片已导出')
    } catch {
      setExportMessage('图片导出失败，请重试')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <main className="editor-page">
      <div className="editor-heading">
        <div>
          <h2>图片编辑器</h2>
          <p>当前阶段仅提供原图预览</p>
        </div>
        <div className="editor-actions">
          <button
            className="export-image-button"
            type="button"
            onClick={() => void handleExport()}
            disabled={!isCanvasReady || isExporting}
          >
            {isExporting ? '导出中...' : '导出图片'}
          </button>
          <Link className="library-create-link" to="/library">返回生成库</Link>
          {exportMessage && (
            <p className="export-message" role="status">{exportMessage}</p>
          )}
        </div>
      </div>

      <div className="editor-layout">
        <aside className="editor-tools" aria-label="编辑工具">
          <h3>编辑工具</h3>
          <button
            type="button"
            className={editMode === 'grayscale' ? 'is-active' : ''}
            onClick={() => {
              setEditMode('grayscale')
              setBlackWhiteIntensity(100)
            }}
          >
            黑白
          </button>
          {editMode === 'grayscale' && (
            <section className="filter-adjustments" aria-label="黑白强度调整">
              <label htmlFor="black-white-intensity">
                强度 <output>{blackWhiteIntensity}%</output>
              </label>
              <input
                id="black-white-intensity"
                type="range"
                min="0"
                max="100"
                value={blackWhiteIntensity}
                onChange={(event) => setBlackWhiteIntensity(Number(event.target.value))}
              />
            </section>
          )}
          <button
            type="button"
            className={editMode === 'rain' ? 'is-active' : ''}
            onClick={() => setEditMode('rain')}
          >
            雨滴
          </button>
          {editMode === 'rain' && (
            <section className="filter-adjustments" aria-label="雨滴效果调整">
              <label htmlFor="rain-amount">
                雨量 <output>{rainAmount}</output>
              </label>
              <input
                id="rain-amount"
                type="range"
                min="10"
                max="200"
                value={rainAmount}
                onChange={(event) => setRainAmount(Number(event.target.value))}
              />
              <label htmlFor="rain-length">
                雨滴长度 <output>{rainLength}</output>
              </label>
              <input
                id="rain-length"
                type="range"
                min="5"
                max="60"
                value={rainLength}
                onChange={(event) => setRainLength(Number(event.target.value))}
              />
              <label htmlFor="rain-angle">
                倾斜角度 <output>{rainAngle}°</output>
              </label>
              <input
                id="rain-angle"
                type="range"
                min="-45"
                max="45"
                value={rainAngle}
                onChange={(event) => setRainAngle(Number(event.target.value))}
              />
              <label htmlFor="rain-opacity">
                透明度 <output>{rainOpacity}%</output>
              </label>
              <input
                id="rain-opacity"
                type="range"
                min="10"
                max="80"
                value={rainOpacity}
                onChange={(event) => setRainOpacity(Number(event.target.value))}
              />
            </section>
          )}
          <button
            type="button"
            className={editMode === 'gradient' ? 'is-active' : ''}
            onClick={() => {
              setEditMode('gradient')
            }}
          >
            灰度渐变
          </button>
          {editMode === 'gradient' && (
            <section className="filter-adjustments" aria-label="灰度渐变调整">
              <label htmlFor="gradient-position">
                渐变位置 <output>{gradientPosition}%</output>
              </label>
              <input
                id="gradient-position"
                type="range"
                min="0"
                max="100"
                value={gradientPosition}
                onChange={(event) => setGradientPosition(Number(event.target.value))}
              />
              <label htmlFor="gradient-width">
                过渡宽度 <output>{gradientWidth}%</output>
              </label>
              <input
                id="gradient-width"
                type="range"
                min="0"
                max="50"
                value={gradientWidth}
                onChange={(event) => setGradientWidth(Number(event.target.value))}
              />
            </section>
          )}
          <button
            type="button"
            className="restore-image-button"
            onClick={() => setEditMode('original')}
            disabled={editMode === 'original'}
          >
            恢复原图
          </button>
        </aside>

        <section className="editor-canvas-panel" aria-label="图片画布">
          <ImageCanvas
            ref={imageCanvasRef}
            imageUrl={imageUrl}
            alt={`生成任务 ${task.taskId} 的第 ${imageIndex + 1} 张图片`}
            mode={editMode}
            blackWhiteIntensity={blackWhiteIntensity}
            gradientPosition={gradientPosition}
            gradientWidth={gradientWidth}
            rainAmount={rainAmount}
            rainLength={rainLength}
            rainAngle={rainAngle}
            rainOpacity={rainOpacity}
            rainSeed={`${task.taskId}-${imageIndex}`}
            onGradientPositionChange={handleGradientPositionChange}
            onImageLoad={handleImageLoad}
            onLoadStateChange={handleCanvasLoadStateChange}
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
