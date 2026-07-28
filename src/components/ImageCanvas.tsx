import { useEffect, useRef, useState } from 'react'

interface ImageCanvasProps {
  imageUrl: string
  alt: string
}

export function ImageCanvas({ imageUrl, alt }: ImageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true
    const image = new Image()

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
    }
  }, [imageUrl])

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
