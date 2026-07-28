import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent } from 'react'

interface ImageCanvasProps {
  imageUrl: string
  alt: string
  mode: ImageEditMode
  blackWhiteIntensity: number
  gradientPosition: number
  gradientWidth: number
  rainAmount: number
  rainLength: number
  rainAngle: number
  rainOpacity: number
  rainSeed: string
  onGradientPositionChange: (position: number) => void
  onImageLoad: () => void
  onLoadStateChange: (isReady: boolean) => void
}

export interface ImageCanvasHandle {
  exportImage: () => Promise<Blob>
}

export type ImageEditMode = 'original' | 'grayscale' | 'gradient' | 'rain'

type GradientOverlayStyle = CSSProperties & {
  '--gradient-position': string
}

const clampPercentage = (value: number): number => Math.min(Math.max(value, 0), 100)

interface RainDrop {
  x: number
  y: number
  lengthFactor: number
  widthFactor: number
  opacityFactor: number
}

const createSeededRandom = (seed: string): (() => number) => {
  let state = 2166136261

  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index)
    state = Math.imul(state, 16777619)
  }

  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const createRainDrops = (seed: string, amount: number): RainDrop[] => {
  const random = createSeededRandom(seed)
  const drops: RainDrop[] = []

  for (let index = 0; index < amount; index += 1) {
    drops.push({
      x: random(),
      y: random(),
      lengthFactor: 0.7 + random() * 0.6,
      widthFactor: 0.75 + random() * 0.5,
      opacityFactor: 0.7 + random() * 0.5,
    })
  }

  return drops
}

export const ImageCanvas = forwardRef<ImageCanvasHandle, ImageCanvasProps>(
  function ImageCanvas({
  imageUrl,
  alt,
  mode,
  blackWhiteIntensity,
  gradientPosition,
  gradientWidth,
  rainAmount,
  rainLength,
  rainAngle,
  rainOpacity,
  rainSeed,
  onGradientPositionChange,
  onImageLoad,
  onLoadStateChange,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const originalImageDataRef = useRef<ImageData | null>(null)
  const rainDropsRef = useRef<RainDrop[]>([])
  const dragPointerIdRef = useRef<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [imageVersion, setImageVersion] = useState(0)

  useEffect(() => {
    let isActive = true
    const image = new Image()

    imageRef.current = image
    originalImageDataRef.current = null
    onLoadStateChange(false)
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      if (!isActive || !canvasRef.current) {
        return
      }

      const canvas = canvasRef.current
      const context = canvas.getContext('2d')

      if (!context) {
        setLoadError('无法初始化画布')
        setIsLoading(false)
        return
      }

      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      context.clearRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      originalImageDataRef.current = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      )
      rainDropsRef.current = createRainDrops(
        `${rainSeed}:${canvas.width}x${canvas.height}`,
        200,
      )
      setImageVersion((current) => current + 1)
      onImageLoad()
      onLoadStateChange(true)
      setIsLoading(false)
    }
    image.onerror = () => {
      if (isActive) {
        setLoadError('图片加载失败，请返回生成库后重试')
        onLoadStateChange(false)
        setIsLoading(false)
      }
    }

    setIsLoading(true)
    setLoadError(null)
    image.src = imageUrl

    return () => {
      isActive = false
      image.onload = null
      image.onerror = null
      if (imageRef.current === image) {
        imageRef.current = null
      }
      originalImageDataRef.current = null
      rainDropsRef.current = []
    }
  }, [imageUrl, onImageLoad, onLoadStateChange, rainSeed])

  useEffect(
    () => () => {
      dragPointerIdRef.current = null
    },
    [],
  )

  useEffect(() => {
    const canvas = canvasRef.current
    const originalImageData = originalImageDataRef.current

    if (!canvas || !originalImageData) {
      return
    }

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    if (mode === 'original') {
      context.putImageData(originalImageData, 0, 0)
      return
    }

    if (mode === 'rain') {
      const imageScale = Math.max(
        0.7,
        Math.min(1.8, Math.max(canvas.width, canvas.height) / 1024),
      )
      const lineLength = Math.max(1, rainLength * imageScale)
      const angle = (Math.min(Math.max(rainAngle, -45), 45) * Math.PI) / 180
      const horizontalOffset = Math.sin(angle)
      const verticalOffset = Math.cos(angle)
      const opacity = Math.min(Math.max(rainOpacity, 10), 80) / 100
      const amount = Math.min(Math.max(Math.round(rainAmount), 10), 200)

      context.putImageData(originalImageData, 0, 0)
      context.save()
      context.globalCompositeOperation = 'source-over'
      context.lineCap = 'round'
      context.strokeStyle = '#d9efff'

      for (let index = 0; index < amount; index += 1) {
        const drop = rainDropsRef.current[index]
        if (!drop) {
          break
        }

        const startX = drop.x * canvas.width
        const startY = drop.y * canvas.height
        const currentLength = lineLength * drop.lengthFactor

        context.globalAlpha = opacity * drop.opacityFactor
        context.lineWidth = Math.max(1, imageScale * drop.widthFactor)
        context.beginPath()
        context.moveTo(startX, startY)
        context.lineTo(
          startX + horizontalOffset * currentLength,
          startY + verticalOffset * currentLength,
        )
        context.stroke()
      }

      context.restore()
      return
    }

    const processedImageData = context.createImageData(originalImageData)
    const source = originalImageData.data
    const target = processedImageData.data

    if (mode === 'grayscale') {
      const intensity = Math.min(Math.max(blackWhiteIntensity, 0), 100) / 100

      for (let index = 0; index < source.length; index += 4) {
        const gray =
          0.299 * source[index] +
          0.587 * source[index + 1] +
          0.114 * source[index + 2]

        target[index] = source[index] * (1 - intensity) + gray * intensity
        target[index + 1] = source[index + 1] * (1 - intensity) + gray * intensity
        target[index + 2] = source[index + 2] * (1 - intensity) + gray * intensity
        target[index + 3] = source[index + 3]
      }

      context.putImageData(processedImageData, 0, 0)
      return
    }

    const imageWidth = originalImageData.width
    const imageHeight = originalImageData.height
    const center = (Math.min(Math.max(gradientPosition, 0), 100) / 100) * imageWidth
    const transitionWidth =
      (Math.min(Math.max(gradientWidth, 0), 50) / 100) * imageWidth
    const start = center - transitionWidth / 2
    const end = center + transitionWidth / 2
    const colorMixByColumn = new Float32Array(imageWidth)

    for (let x = 0; x < imageWidth; x += 1) {
      if (transitionWidth === 0) {
        colorMixByColumn[x] = x < center ? 0 : 1
        continue
      }

      const t = Math.min(Math.max((x - start) / (end - start), 0), 1)
      colorMixByColumn[x] = t * t * (3 - 2 * t)
    }

    for (let y = 0; y < imageHeight; y += 1) {
      for (let x = 0; x < imageWidth; x += 1) {
        const index = (y * imageWidth + x) * 4
        const colorMix = colorMixByColumn[x]
        const gray =
          0.299 * source[index] +
          0.587 * source[index + 1] +
          0.114 * source[index + 2]

        target[index] = gray * (1 - colorMix) + source[index] * colorMix
        target[index + 1] = gray * (1 - colorMix) + source[index + 1] * colorMix
        target[index + 2] = gray * (1 - colorMix) + source[index + 2] * colorMix
        target[index + 3] = source[index + 3]
      }
    }

    context.putImageData(processedImageData, 0, 0)
  }, [
    blackWhiteIntensity,
    gradientPosition,
    gradientWidth,
    imageUrl,
    imageVersion,
    mode,
    rainAmount,
    rainAngle,
    rainLength,
    rainOpacity,
  ])

  useImperativeHandle(
    ref,
    () => ({
      exportImage: () =>
        new Promise<Blob>((resolve, reject) => {
          const canvas = canvasRef.current

          if (!canvas || isLoading || loadError) {
            reject(new Error('Canvas is not ready'))
            return
          }

          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob)
              return
            }

            reject(new Error('Canvas export failed'))
          }, 'image/png')
        }),
    }),
    [isLoading, loadError],
  )

  const updateGradientPositionFromPointer = (clientX: number): void => {
    const canvas = canvasRef.current

    if (!canvas) {
      return
    }

    const bounds = canvas.getBoundingClientRect()
    if (bounds.width === 0) {
      return
    }

    const position = ((clientX - bounds.left) / bounds.width) * 100
    onGradientPositionChange(Math.round(clampPercentage(position)))
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (mode !== 'gradient') {
      return
    }

    dragPointerIdRef.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    updateGradientPositionFromPointer(event.clientX)
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (dragPointerIdRef.current !== event.pointerId) {
      return
    }

    event.preventDefault()
    updateGradientPositionFromPointer(event.clientX)
  }

  const finishPointerDrag = (event: PointerEvent<HTMLDivElement>): void => {
    if (dragPointerIdRef.current !== event.pointerId) {
      return
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragPointerIdRef.current = null
  }

  const handleGradientHandleKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
  ): void => {
    const step = event.shiftKey ? 5 : 1
    let nextPosition: number | null = null

    if (event.key === 'ArrowLeft') {
      nextPosition = gradientPosition - step
    }
    if (event.key === 'ArrowRight') {
      nextPosition = gradientPosition + step
    }

    if (nextPosition !== null) {
      event.preventDefault()
      onGradientPositionChange(clampPercentage(nextPosition))
    }
  }

  const gradientOverlayStyle: GradientOverlayStyle = {
    '--gradient-position': `${gradientPosition}%`,
  }
  const isGradientOverlayVisible =
    mode === 'gradient' && !isLoading && !loadError

  return (
    <div className="image-canvas-stage">
      {isLoading && <p className="canvas-message" role="status">正在加载图片...</p>}
      {loadError && <p className="canvas-message canvas-error" role="alert">{loadError}</p>}
      <div
        className={
          isGradientOverlayVisible
            ? 'image-canvas-wrap is-gradient-mode'
            : 'image-canvas-wrap'
        }
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerDrag}
        onPointerCancel={finishPointerDrag}
      >
        <canvas
          ref={canvasRef}
          className={isLoading || loadError ? 'image-canvas is-hidden' : 'image-canvas'}
          aria-label={alt}
        />
        {isGradientOverlayVisible && (
          <div className="gradient-overlay" style={gradientOverlayStyle}>
            <div className="gradient-divider" aria-hidden="true" />
            <div
              className="gradient-handle"
              role="slider"
              tabIndex={0}
              aria-label="灰度渐变位置"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(gradientPosition)}
              onKeyDown={handleGradientHandleKeyDown}
            />
          </div>
        )}
      </div>
    </div>
  )
  },
)
