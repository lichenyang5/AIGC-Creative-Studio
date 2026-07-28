import { useEffect, useRef, useState } from 'react'

interface ImageCanvasProps {
  imageUrl: string
  alt: string
  blackWhiteIntensity: number
  onImageLoad: () => void
}

export function ImageCanvas({
  imageUrl,
  alt,
  blackWhiteIntensity,
  onImageLoad,
}: ImageCanvasProps) {
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
      setIsLoading(false)
    }
    image.onerror = () => {
      if (isActive) {
        setLoadError('图片加载失败，请返回生成库后重试')
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
  }, [imageUrl, onImageLoad])

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

    const intensity = Math.min(Math.max(blackWhiteIntensity, 0), 100) / 100
    if (intensity === 0) {
      context.putImageData(originalImageData, 0, 0)
      return
    }

    const processedImageData = context.createImageData(originalImageData)
    const source = originalImageData.data
    const target = processedImageData.data

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
  }, [blackWhiteIntensity, imageUrl, imageVersion])

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
}
