/** Canvas 编辑核心：所有效果从原始像素或离屏画布重绘，保证预览、PNG 导出和保存结果一致。 */
import {
  forwardRef,
  useCallback,
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
  rainSpeed: number
  isRainPlaying: boolean
  colorRippleRange: number
  colorRippleSpeed: number
  colorRipplePlayId: number
  isColorRipplePaused: boolean
  rainSeed: string
  onGradientPositionChange: (position: number) => void
  onColorRipplePointChange: (hasPoint: boolean) => void
  onColorRippleStateChange: (state: ColorRippleState) => void
  onImageLoad: () => void
  onLoadStateChange: (isReady: boolean) => void
}

export interface ImageCanvasHandle {
  exportImage: () => Promise<Blob>
  exportColorRippleVideo: () => Promise<Blob>
}

export type ImageEditMode = 'original' | 'grayscale' | 'gradient' | 'rain' | 'colorRipple'
export type ColorRippleState = 'ready' | 'dropping' | 'rippling' | 'completed' | 'paused'

type GradientOverlayStyle = CSSProperties & {
  '--gradient-position': string
}

type RippleMarkerStyle = CSSProperties & {
  '--ripple-x': string
  '--ripple-y': string
}

const clampPercentage = (value: number): number => Math.min(Math.max(value, 0), 100)

interface RainDrop {
  x: number
  y: number
  length: number
  speed: number
  opacity: number
  drift: number
}

interface ColorRippleData {
  x: number
  y: number
  phase: ColorRippleState
  radius: number
  maxRadius: number
  dropY: number
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

const createRainDrops = (
  random: () => number,
  width: number,
  height: number,
  amount: number,
): RainDrop[] => {
  const drops: RainDrop[] = []

  for (let index = 0; index < amount; index += 1) {
    drops.push({
      x: random() * width,
      y: random() * height,
      length: 0.7 + random() * 0.6,
      speed: 0.7 + random() * 0.6,
      opacity: 0.7 + random() * 0.5,
      drift: -0.25 + random() * 0.5,
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
  rainSpeed,
  isRainPlaying,
  colorRippleRange,
  colorRippleSpeed,
  colorRipplePlayId,
  isColorRipplePaused,
  rainSeed,
  onGradientPositionChange,
  onColorRipplePointChange,
  onColorRippleStateChange,
  onImageLoad,
  onLoadStateChange,
}, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const originalImageDataRef = useRef<ImageData | null>(null)
  const rainDropsRef = useRef<RainDrop[]>([])
  const rainRandomRef = useRef<(() => number) | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const lastFrameTimeRef = useRef<number | null>(null)
  const rainConfigRef = useRef({
    amount: rainAmount,
    length: rainLength,
    angle: rainAngle,
    opacity: rainOpacity,
    speed: rainSpeed,
  })
  const colorCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const grayscaleCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const colorRippleRef = useRef<ColorRippleData | null>(null)
  const colorRippleFrameRef = useRef<number | null>(null)
  const colorRippleLastTimeRef = useRef<number | null>(null)
  const recordingCleanupRef = useRef<(() => void) | null>(null)
  const dragPointerIdRef = useRef<number | null>(null)
  const colorRippleStateChangeRef = useRef(onColorRippleStateChange)
  const colorRippleSpeedRef = useRef(colorRippleSpeed)
  const colorRippleRangeRef = useRef(colorRippleRange)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [imageVersion, setImageVersion] = useState(0)
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState !== 'hidden',
  )

  rainConfigRef.current = {
    amount: rainAmount,
    length: rainLength,
    angle: rainAngle,
    opacity: rainOpacity,
    speed: rainSpeed,
  }
  colorRippleSpeedRef.current = colorRippleSpeed
  colorRippleRangeRef.current = colorRippleRange

  useEffect(() => {
    colorRippleStateChangeRef.current = onColorRippleStateChange
  }, [onColorRippleStateChange])

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
      const colorCanvas = document.createElement('canvas')
      const grayscaleCanvas = document.createElement('canvas')
      colorCanvas.width = canvas.width
      colorCanvas.height = canvas.height
      grayscaleCanvas.width = canvas.width
      grayscaleCanvas.height = canvas.height
      const colorContext = colorCanvas.getContext('2d')
      const grayscaleContext = grayscaleCanvas.getContext('2d')
      if (colorContext && grayscaleContext) {
        colorContext.putImageData(originalImageDataRef.current, 0, 0)
        const grayscaleData = grayscaleContext.createImageData(originalImageDataRef.current)
        const source = originalImageDataRef.current.data
        const target = grayscaleData.data
        for (let index = 0; index < source.length; index += 4) {
          const gray = 0.299 * source[index] + 0.587 * source[index + 1] + 0.114 * source[index + 2]
          target[index] = gray
          target[index + 1] = gray
          target[index + 2] = gray
          target[index + 3] = source[index + 3]
        }
        grayscaleContext.putImageData(grayscaleData, 0, 0)
        colorCanvasRef.current = colorCanvas
        grayscaleCanvasRef.current = grayscaleCanvas
        colorRippleRef.current = {
          x: canvas.width / 2,
          y: canvas.height / 2,
          phase: 'ready',
          radius: 0,
          maxRadius: 0,
          dropY: -30,
        }
        onColorRipplePointChange(true)
        onColorRippleStateChange('ready')
      }
      rainDropsRef.current = []
      rainRandomRef.current = null
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
      rainRandomRef.current = null
      colorCanvasRef.current = null
      grayscaleCanvasRef.current = null
      colorRippleRef.current = null
    }
  }, [imageUrl, onColorRipplePointChange, onColorRippleStateChange, onImageLoad, onLoadStateChange])

  useEffect(
    () => () => {
      dragPointerIdRef.current = null
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      if (colorRippleFrameRef.current !== null) {
        window.cancelAnimationFrame(colorRippleFrameRef.current)
        colorRippleFrameRef.current = null
      }
      recordingCleanupRef.current?.()
    },
    [],
  )

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsDocumentVisible(document.visibilityState !== 'hidden')
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  const cancelRainAnimation = useCallback((): void => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    lastFrameTimeRef.current = null
  }, [])

  const cancelColorRippleAnimation = useCallback((): void => {
    if (colorRippleFrameRef.current !== null) {
      window.cancelAnimationFrame(colorRippleFrameRef.current)
      colorRippleFrameRef.current = null
    }
    colorRippleLastTimeRef.current = null
  }, [])

  const notifyColorRippleState = useCallback((state: ColorRippleState): void => {
    colorRippleStateChangeRef.current(state)
  }, [])

  const drawColorRippleFrame = useCallback((deltaTime: number): void => {
    const canvas = canvasRef.current
    const colorCanvas = colorCanvasRef.current
    const grayscaleCanvas = grayscaleCanvasRef.current
    const ripple = colorRippleRef.current
    if (!canvas || !colorCanvas || !grayscaleCanvas || !ripple) return
    const context = canvas.getContext('2d')
    if (!context) return

    context.drawImage(grayscaleCanvas, 0, 0)
    const speed = Math.min(Math.max(colorRippleSpeedRef.current, 1), 10)
    if (ripple.phase === 'dropping') {
      ripple.dropY += speed * 90 * deltaTime
      context.save()
      context.strokeStyle = 'rgba(215, 239, 255, 0.78)'
      context.lineWidth = Math.max(1, canvas.width / 900)
      context.beginPath()
      context.moveTo(ripple.x, ripple.dropY - 24)
      context.lineTo(ripple.x, ripple.dropY)
      context.stroke()
      context.restore()
      if (ripple.dropY >= ripple.y) {
        ripple.phase = 'rippling'
        ripple.radius = 0
        notifyColorRippleState('rippling')
      }
      return
    }

    if (ripple.phase === 'rippling' || ripple.phase === 'completed') {
      if (ripple.phase === 'rippling') {
        ripple.radius = Math.min(ripple.radius + speed * 120 * deltaTime, ripple.maxRadius)
      }
      context.save()
      context.beginPath()
      context.arc(ripple.x, ripple.y, ripple.radius, 0, Math.PI * 2)
      context.clip()
      context.drawImage(colorCanvas, 0, 0)
      context.restore()

      if (ripple.phase === 'rippling') {
        context.save()
        const progress = ripple.maxRadius === 0 ? 1 : ripple.radius / ripple.maxRadius
        context.strokeStyle = `rgba(210, 238, 255, ${0.55 * (1 - progress)})`
        context.lineWidth = Math.max(1, canvas.width / 1100)
        for (let ring = 0; ring < 3; ring += 1) {
          const ringRadius = Math.max(0, ripple.radius - ring * 12)
          context.beginPath()
          context.arc(ripple.x, ripple.y, ringRadius, 0, Math.PI * 2)
          context.stroke()
        }
        context.restore()
        if (ripple.radius >= ripple.maxRadius) {
          ripple.phase = 'completed'
          notifyColorRippleState('completed')
        }
      }
    }
  }, [notifyColorRippleState])

  const drawRainFrame = useCallback((deltaTime: number): void => {
    const canvas = canvasRef.current
    const originalImageData = originalImageDataRef.current
    const random = rainRandomRef.current

    if (!canvas || !originalImageData || !random) {
      return
    }

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    const config = rainConfigRef.current
    const imageScale = Math.max(
      0.7,
      Math.min(1.8, Math.max(canvas.width, canvas.height) / 1024),
    )
    const lineLength = Math.max(1, config.length * imageScale)
    const angle = (Math.min(Math.max(config.angle, -45), 45) * Math.PI) / 180
    const horizontalDirection = Math.sin(angle)
    const verticalDirection = Math.cos(angle)
    const baseSpeed = Math.min(Math.max(config.speed, 1), 10) * 45 * imageScale
    const opacity = Math.min(Math.max(config.opacity, 10), 80) / 100
    const amount = Math.min(Math.max(Math.round(config.amount), 10), 200)

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

      const currentLength = lineLength * drop.length

      if (deltaTime > 0) {
        const currentSpeed = baseSpeed * drop.speed
        drop.x +=
          (horizontalDirection + drop.drift * 0.08) * currentSpeed * deltaTime
        drop.y += verticalDirection * currentSpeed * deltaTime

        if (drop.y > canvas.height + currentLength) {
          drop.x = random() * canvas.width
          drop.y = -currentLength
        }
      }

      context.globalAlpha = opacity * drop.opacity
      context.lineWidth = Math.max(1, imageScale * 0.9)
      context.beginPath()
      context.moveTo(drop.x, drop.y)
      context.lineTo(
        drop.x + horizontalDirection * currentLength,
        drop.y + verticalDirection * currentLength,
      )
      context.stroke()
    }

    context.restore()
  }, [])

  useEffect(() => {
    if (mode !== 'rain') {
      cancelRainAnimation()
      rainDropsRef.current = []
      rainRandomRef.current = null
      return
    }

    const canvas = canvasRef.current
    if (!canvas || !originalImageDataRef.current) {
      return
    }

    const random = createSeededRandom(`${rainSeed}:${canvas.width}x${canvas.height}`)
    rainRandomRef.current = random
    rainDropsRef.current = createRainDrops(random, canvas.width, canvas.height, 200)
    lastFrameTimeRef.current = null
    drawRainFrame(0)
  }, [cancelRainAnimation, drawRainFrame, imageVersion, mode, rainSeed])

  useEffect(() => {
    if (
      mode !== 'rain' ||
      !isRainPlaying ||
      !isDocumentVisible ||
      isLoading ||
      loadError
    ) {
      cancelRainAnimation()
      return
    }

    const renderFrame = (timestamp: number): void => {
      const previousTime = lastFrameTimeRef.current
      const deltaTime =
        previousTime === null ? 0 : Math.min((timestamp - previousTime) / 1000, 0.05)

      lastFrameTimeRef.current = timestamp
      drawRainFrame(deltaTime)
      animationFrameRef.current = window.requestAnimationFrame(renderFrame)
    }

    cancelRainAnimation()
    drawRainFrame(0)
    animationFrameRef.current = window.requestAnimationFrame(renderFrame)

    return cancelRainAnimation
  }, [
    imageVersion,
    isDocumentVisible,
    isLoading,
    isRainPlaying,
    loadError,
    mode,
    cancelRainAnimation,
    drawRainFrame,
  ])

  useEffect(() => {
    if (mode === 'rain' && originalImageDataRef.current) {
      drawRainFrame(0)
    }
  }, [drawRainFrame, mode, rainAmount, rainAngle, rainLength, rainOpacity, rainSpeed])

  useEffect(() => {
    if (mode !== 'colorRipple') {
      cancelColorRippleAnimation()
      return
    }
    const ripple = colorRippleRef.current
    if (!ripple) return
    ripple.phase = 'ready'
    ripple.radius = 0
    ripple.dropY = -30
    drawColorRippleFrame(0)
    notifyColorRippleState('ready')
  }, [cancelColorRippleAnimation, drawColorRippleFrame, imageVersion, mode, notifyColorRippleState])

  useEffect(() => {
    if (mode !== 'colorRipple' || colorRipplePlayId === 0) return
    const ripple = colorRippleRef.current
    const canvas = canvasRef.current
    if (!ripple || !canvas) return
    cancelColorRippleAnimation()
    const maxCornerDistance = Math.max(
      Math.hypot(ripple.x, ripple.y),
      Math.hypot(canvas.width - ripple.x, ripple.y),
      Math.hypot(ripple.x, canvas.height - ripple.y),
      Math.hypot(canvas.width - ripple.x, canvas.height - ripple.y),
    )
    ripple.maxRadius =
      maxCornerDistance *
      (Math.min(Math.max(colorRippleRangeRef.current, 20), 100) / 100)
    ripple.radius = 0
    ripple.dropY = -30
    ripple.phase = 'dropping'
    notifyColorRippleState('dropping')
  }, [cancelColorRippleAnimation, colorRipplePlayId, mode, notifyColorRippleState])

  useEffect(() => {
    if (mode !== 'colorRipple' || !isDocumentVisible) {
      cancelColorRippleAnimation()
      return
    }
    if (isColorRipplePaused) {
      cancelColorRippleAnimation()
      notifyColorRippleState('paused')
      return
    }
    const ripple = colorRippleRef.current
    if (!ripple || (ripple.phase !== 'dropping' && ripple.phase !== 'rippling')) return
    notifyColorRippleState(ripple.phase)
    const renderFrame = (timestamp: number): void => {
      const previous = colorRippleLastTimeRef.current
      const deltaTime = previous === null ? 0 : Math.min((timestamp - previous) / 1000, 0.05)
      colorRippleLastTimeRef.current = timestamp
      drawColorRippleFrame(deltaTime)
      const current = colorRippleRef.current
      if (current?.phase === 'dropping' || current?.phase === 'rippling') {
        colorRippleFrameRef.current = window.requestAnimationFrame(renderFrame)
      } else {
        colorRippleFrameRef.current = null
      }
    }
    colorRippleFrameRef.current = window.requestAnimationFrame(renderFrame)
    return cancelColorRippleAnimation
  }, [
    cancelColorRippleAnimation,
    colorRipplePlayId,
    drawColorRippleFrame,
    isColorRipplePaused,
    isDocumentVisible,
    mode,
    notifyColorRippleState,
  ])

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
      return
    }

    if (mode === 'colorRipple') {
      drawColorRippleFrame(0)
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
    drawColorRippleFrame,
  ])

  const exportColorRippleVideo = useCallback((): Promise<Blob> =>
    new Promise<Blob>((resolve, reject) => {
      const canvas = canvasRef.current
      const ripple = colorRippleRef.current
      if (
        mode !== 'colorRipple' ||
        !canvas ||
        !ripple ||
        typeof canvas.captureStream !== 'function' ||
        typeof MediaRecorder === 'undefined'
      ) {
        reject(new Error('Dynamic export is not supported'))
        return
      }

      const mimeType = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm',
      ].find((type) => MediaRecorder.isTypeSupported(type))
      if (!mimeType) {
        reject(new Error('Dynamic export is not supported'))
        return
      }

      cancelColorRippleAnimation()
      const stream = canvas.captureStream(30)
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: canvas.width * canvas.height > 1280 * 720 ? 8_000_000 : 4_000_000,
      })
      const chunks: Blob[] = []
      let timeoutId: number | null = null
      let finalFrameTimer: number | null = null
      let stopped = false

      const cleanup = (): void => {
        cancelColorRippleAnimation()
        stream.getTracks().forEach((track) => track.stop())
        if (timeoutId !== null) window.clearTimeout(timeoutId)
        if (finalFrameTimer !== null) window.clearTimeout(finalFrameTimer)
        recordingCleanupRef.current = null
      }
      const stopRecorder = (): void => {
        if (stopped) return
        stopped = true
        if (recorder.state !== 'inactive') recorder.stop()
      }

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onerror = () => {
        cleanup()
        reject(new Error('Dynamic export failed'))
      }
      recorder.onstop = () => {
        const video = new Blob(chunks, { type: mimeType })
        cleanup()
        if (video.size === 0) {
          reject(new Error('No video data'))
          return
        }
        resolve(video)
      }

      recordingCleanupRef.current = () => {
        stopRecorder()
        cleanup()
      }
      timeoutId = window.setTimeout(() => {
        stopRecorder()
      }, 15_000)

      recorder.start()
      ripple.phase = 'dropping'
      ripple.radius = 0
      ripple.dropY = -30
      const maxCornerDistance = Math.max(
        Math.hypot(ripple.x, ripple.y),
        Math.hypot(canvas.width - ripple.x, ripple.y),
        Math.hypot(ripple.x, canvas.height - ripple.y),
        Math.hypot(canvas.width - ripple.x, canvas.height - ripple.y),
      )
      ripple.maxRadius =
        maxCornerDistance *
        (Math.min(Math.max(colorRippleRangeRef.current, 20), 100) / 100)
      drawColorRippleFrame(0)
      notifyColorRippleState('dropping')

      const recordFrame = (timestamp: number): void => {
        const previous = colorRippleLastTimeRef.current
        const deltaTime = previous === null ? 0 : Math.min((timestamp - previous) / 1000, 0.05)
        colorRippleLastTimeRef.current = timestamp
        drawColorRippleFrame(deltaTime)
        if (ripple.phase === 'completed') {
          finalFrameTimer = window.setTimeout(stopRecorder, 800)
          return
        }
        colorRippleFrameRef.current = window.requestAnimationFrame(recordFrame)
      }
      colorRippleFrameRef.current = window.requestAnimationFrame(recordFrame)
    }), [
      cancelColorRippleAnimation,
      drawColorRippleFrame,
      mode,
      notifyColorRippleState,
    ])

  const exportImage = useCallback(
    (): Promise<Blob> =>
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
    [isLoading, loadError],
  )

  useImperativeHandle(
    ref,
    () => ({
      exportImage,
      exportColorRippleVideo,
    }),
    [exportColorRippleVideo, exportImage],
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

  const handlePointerDown = (event: PointerEvent<HTMLElement>): void => {
    if (mode === 'colorRipple') {
      const canvas = canvasRef.current
      const ripple = colorRippleRef.current
      if (!canvas || !ripple || ripple.phase === 'dropping' || ripple.phase === 'rippling') {
        return
      }
      const bounds = canvas.getBoundingClientRect()
      ripple.x = Math.min(Math.max(((event.clientX - bounds.left) / bounds.width) * canvas.width, 0), canvas.width)
      ripple.y = Math.min(Math.max(((event.clientY - bounds.top) / bounds.height) * canvas.height, 0), canvas.height)
      ripple.radius = 0
      ripple.phase = 'ready'
      onColorRipplePointChange(true)
      notifyColorRippleState('ready')
      drawColorRippleFrame(0)
      event.stopPropagation()
      return
    }

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
  const colorRipple = colorRippleRef.current
  const isColorRippleMarkerVisible =
    mode === 'colorRipple' && !isLoading && !loadError && colorRipple !== null
  const rippleMarkerStyle: RippleMarkerStyle | undefined = colorRipple
    ? {
        '--ripple-x': `${(colorRipple.x / (canvasRef.current?.width || 1)) * 100}%`,
        '--ripple-y': `${(colorRipple.y / (canvasRef.current?.height || 1)) * 100}%`,
        left: 'var(--ripple-x)',
      }
    : undefined

  return (
    <div className="image-canvas-stage">
      {isLoading && <p className="canvas-message" role="status">正在加载图片...</p>}
      {loadError && <p className="canvas-message canvas-error" role="alert">{loadError}</p>}
      <div
        className={
          isGradientOverlayVisible
            ? 'image-canvas-wrap is-gradient-mode'
            : isColorRippleMarkerVisible
              ? 'image-canvas-wrap is-color-ripple-mode'
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
          onPointerDown={handlePointerDown}
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
        {isColorRippleMarkerVisible && rippleMarkerStyle && (
          <div
            className="color-ripple-marker"
            style={rippleMarkerStyle}
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  )
  },
)
