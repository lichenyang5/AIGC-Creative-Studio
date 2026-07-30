import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ImageCanvas,
  type ImageCanvasHandle,
  type ImageEditMode,
  type ColorRippleState,
} from '../components/ImageCanvas'
import { createApiUrl } from '../config/api'
import type {
  GenerationStyle,
  GenerationEditSaveErrorResponse,
  GenerationEditSaveSuccessResponse,
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

const shouldPlayRainByDefault = (): boolean =>
  typeof window === 'undefined' ||
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches

interface EditorSessionProps {
  taskId: string | undefined
  imageIndexParam: string | undefined
}

export function EditorPage() {
  const { taskId, imageIndex: imageIndexParam } = useParams()

  return (
    <EditorSession
      key={`${taskId ?? ''}:${imageIndexParam ?? ''}`}
      taskId={taskId}
      imageIndexParam={imageIndexParam}
    />
  )
}

function EditorSession({ taskId, imageIndexParam }: EditorSessionProps) {
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
  const [rainSpeed, setRainSpeed] = useState(5)
  const [isRainPlaying, setIsRainPlaying] = useState(
    shouldPlayRainByDefault,
  )
  const [colorRippleRange, setColorRippleRange] = useState(70)
  const [colorRippleSpeed, setColorRippleSpeed] = useState(5)
  const [colorRippleState, setColorRippleState] = useState<ColorRippleState>('ready')
  const [colorRipplePlayId, setColorRipplePlayId] = useState(0)
  const [isColorRipplePaused, setIsColorRipplePaused] = useState(false)
  const [hasColorRipplePoint, setHasColorRipplePoint] = useState(false)
  const [isDynamicExporting, setIsDynamicExporting] = useState(false)
  const [dynamicExportMessage, setDynamicExportMessage] = useState<string | null>(null)
  const [, setColorRipplePointVersion] = useState(0)
  const [isCanvasReady, setIsCanvasReady] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [isSaveError, setIsSaveError] = useState(false)
  const [hasSavedEdit, setHasSavedEdit] = useState(false)
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
    setRainSpeed(5)
    setIsRainPlaying(shouldPlayRainByDefault())
    setColorRippleRange(70)
    setColorRippleSpeed(5)
    setColorRippleState('ready')
    setColorRipplePlayId(0)
    setIsColorRipplePaused(false)
    setHasColorRipplePoint(false)
    setSaveMessage(null)
    setIsSaveError(false)
    setHasSavedEdit(false)
  }, [])

  const handleCanvasLoadStateChange = useCallback((isReady: boolean) => {
    setIsCanvasReady(isReady)
  }, [])

  const handleGradientPositionChange = useCallback((position: number) => {
    setGradientPosition(position)
  }, [])

  const handleColorRipplePointChange = useCallback((hasPoint: boolean) => {
    setHasColorRipplePoint(hasPoint)
    setColorRipplePointVersion((value) => value + 1)
  }, [])

  const handleColorRippleStateChange = useCallback((state: ColorRippleState) => {
    setColorRippleState(state)
  }, [])

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

  const handleSaveToLibrary = async () => {
    if (isSaving || !isCanvasReady || !imageCanvasRef.current) {
      return
    }

    setIsSaving(true)
    setSaveMessage(null)
    setIsSaveError(false)

    try {
      const blob = await imageCanvasRef.current.exportImage()
      const response = await fetch(
        createApiUrl(`/api/generations/${task.taskId}/images/${imageIndex}/edits`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'image/png' },
          body: blob,
        },
      )
      const data = (await response.json()) as
        | GenerationEditSaveSuccessResponse
        | GenerationEditSaveErrorResponse

      if (response.status === 201 && data.success) {
        setSaveMessage('已保存到生成库')
        setHasSavedEdit(true)
        return
      }

      setSaveMessage('message' in data ? data.message : '保存编辑图片失败')
      setIsSaveError(true)
    } catch {
      setSaveMessage('保存编辑图片失败，请稍后重试')
      setIsSaveError(true)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDynamicExport = async () => {
    if (isDynamicExporting || !isCanvasReady || !imageCanvasRef.current) return
    setIsDynamicExporting(true)
    setDynamicExportMessage(null)
    try {
      const video = await imageCanvasRef.current.exportColorRippleVideo()
      const objectUrl = URL.createObjectURL(video)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `aigc-color-ripple-${task.taskId}-${imageIndex}.webm`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0)
      setDynamicExportMessage('动态效果已导出')
    } catch (cause: unknown) {
      setDynamicExportMessage(
        cause instanceof Error && cause.message === 'No video data'
          ? '未生成有效的视频文件'
          : cause instanceof Error && cause.message === 'Dynamic export is not supported'
            ? '当前浏览器不支持动态效果导出，请使用最新版 Chrome 或 Edge'
            : '动态效果导出超时，请降低动画时长后重试',
      )
    } finally {
      setIsDynamicExporting(false)
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
            className="save-image-button"
            type="button"
            onClick={() => void handleSaveToLibrary()}
            disabled={!isCanvasReady || isSaving}
          >
            {isSaving ? '保存中...' : '保存到生成库'}
          </button>
          <button
            className="export-image-button"
            type="button"
            onClick={() => void handleExport()}
            disabled={!isCanvasReady || isExporting}
          >
            {isExporting ? '导出中...' : '导出图片'}
          </button>
          <Link className="library-create-link" to="/library">返回生成库</Link>
          {hasSavedEdit && (
            <Link className="view-library-link" to="/library">查看生成库</Link>
          )}
          {exportMessage && (
            <p className="export-message" role="status">{exportMessage}</p>
          )}
          {saveMessage && (
            <p
              className={isSaveError ? 'save-message is-error' : 'save-message'}
              role={isSaveError ? 'alert' : 'status'}
            >
              {saveMessage}
            </p>
          )}
        </div>
      </div>

      <div className="editor-layout">
        <aside className="editor-tools" aria-label="编辑工具">
          <h3>编辑工具</h3>
          <button
            type="button"
            className={editMode === 'grayscale' ? 'is-active' : ''}
            disabled={isDynamicExporting}
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
            disabled={isDynamicExporting}
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
              <label htmlFor="rain-speed">
                雨滴速度 <output>{rainSpeed}</output>
              </label>
              <input
                id="rain-speed"
                type="range"
                min="1"
                max="10"
                value={rainSpeed}
                onChange={(event) => setRainSpeed(Number(event.target.value))}
              />
              <button
                type="button"
                className="rain-play-button"
                onClick={() => setIsRainPlaying((current) => !current)}
              >
                {isRainPlaying ? '暂停雨滴' : '播放雨滴'}
              </button>
            </section>
          )}
          <button
            type="button"
            className={editMode === 'gradient' ? 'is-active' : ''}
            disabled={isDynamicExporting}
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
            className={editMode === 'colorRipple' ? 'is-active' : ''}
            disabled={isDynamicExporting}
            onClick={() => setEditMode('colorRipple')}
          >
            色彩涟漪
          </button>
          {editMode === 'colorRipple' && (
            <section className="filter-adjustments" aria-label="色彩涟漪调整">
              <p className="ripple-tip">点击图片设置雨滴落点，播放后涟漪将逐渐唤醒原图色彩。</p>
              <p className="ripple-status">落点：{hasColorRipplePoint ? '已设置' : '等待设置'} · {colorRippleState}</p>
              <label htmlFor="ripple-range">扩散范围 <output>{colorRippleRange}%</output></label>
              <input id="ripple-range" type="range" min="20" max="100" value={colorRippleRange} disabled={isDynamicExporting} onChange={(event) => setColorRippleRange(Number(event.target.value))} />
              <label htmlFor="ripple-speed">动画速度 <output>{colorRippleSpeed}</output></label>
              <input id="ripple-speed" type="range" min="1" max="10" value={colorRippleSpeed} disabled={isDynamicExporting} onChange={(event) => setColorRippleSpeed(Number(event.target.value))} />
              <button type="button" className="rain-play-button" onClick={() => { setIsColorRipplePaused(false); setColorRipplePlayId((value) => value + 1) }}>播放效果</button>
              <button type="button" className="rain-play-button" onClick={() => setIsColorRipplePaused((value) => !value)} disabled={colorRippleState !== 'dropping' && colorRippleState !== 'rippling'}>{isColorRipplePaused ? '继续播放' : '暂停效果'}</button>
              <button type="button" className="rain-play-button" onClick={() => { setIsColorRipplePaused(false); setColorRipplePlayId((value) => value + 1) }}>重新播放</button>
              <button type="button" className="dynamic-export-button" onClick={() => void handleDynamicExport()} disabled={!isCanvasReady || isDynamicExporting}> {isDynamicExporting ? '正在录制...' : '导出动态效果'} </button>
              <p className="dynamic-export-note">导出雨滴与涟漪动画为 WebM 视频</p>
              {dynamicExportMessage && <p className="dynamic-export-message" role="status">{dynamicExportMessage}</p>}
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
            rainSpeed={rainSpeed}
            isRainPlaying={isRainPlaying}
            colorRippleRange={colorRippleRange}
            colorRippleSpeed={colorRippleSpeed}
            colorRipplePlayId={colorRipplePlayId}
            isColorRipplePaused={isColorRipplePaused}
            rainSeed={`${task.taskId}-${imageIndex}`}
            onGradientPositionChange={handleGradientPositionChange}
            onColorRipplePointChange={handleColorRipplePointChange}
            onColorRippleStateChange={handleColorRippleStateChange}
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
