import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'

interface ImageCanvasProps {
  imageUrl: string
  alt: string
  mode: ImageEditMode
  blackWhiteIntensity: number
  gradientPosition: number
  gradientWidth: number
  onImageLoad: () => void
  onLoadStateChange: (isReady: boolean) => void
}

export interface ImageCanvasHandle {
  exportImage: () => Promise<Blob>
}

export type ImageEditMode = 'original' | 'grayscale' | 'gradient'

export const ImageCanvas = forwardRef<ImageCanvasHandle, ImageCanvasProps>(
  function ImageCanvas({
  imageUrl,
  alt,
  mode,
  blackWhiteIntensity,
  gradientPosition,
  gradientWidth,
  onImageLoad,
  onLoadStateChange,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const originalImageDataRef = useRef<ImageData | null>(null)
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
    }
  }, [imageUrl, onImageLoad, onLoadStateChange])

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

  return (
    <div className="image-canvas-stage">
      {isLoading && <p className="canvas-message" role="status">正在加载图片...</p>}
      {loadError && <p className="canvas-message canvas-error" role="alert">{loadError}</p>}
      <canvas
        ref={canvasRef}
        className={isLoading || loadError ? 'image-canvas is-hidden' : 'image-canvas'}
        aria-label={alt}
      />
    </div>
  )
  },
)
