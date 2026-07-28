import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import { WanxImageProvider } from '../providers/WanxImageProvider.js'
import { ProviderError, type GenerateImageInput } from '../providers/types.js'
import { saveGenerationTasks } from '../repositories/generationRepository.js'
import {
  getStoredImageFilename,
  LocalImageStorageError,
  readStoredImage,
  saveGeneratedImages,
} from '../storage/localImageStorage.js'
import {
  getAllGenerationTasks,
  getGenerationTask,
  saveGenerationTask,
  updateGenerationTask,
} from '../store/generationStore.js'
import {
  aspectRatios,
  generationCounts,
  generationStyles,
  type AspectRatio,
  type GenerationAcceptedResponse,
  type GenerationCount,
  type GenerationRequest,
  type GenerationStyle,
  type GenerationTask,
  type GenerationTaskNotFoundResponse,
  type GenerationTaskResponse,
  type GenerationValidationError,
  type GenerationValidationErrorResponse,
} from '../types/generation.js'

const generationsRouter = Router()

type GenerationTaskError = NonNullable<GenerationTask['error']>

const persistGenerationTasks = async (): Promise<void> => {
  try {
    await saveGenerationTasks(getAllGenerationTasks())
  } catch {
    console.error('Unable to persist generation task metadata')
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const includesValue = <Value extends string | number>(
  values: readonly Value[],
  value: unknown,
): value is Value => values.includes(value as Value)

const validateGenerationRequest = (
  body: unknown,
): GenerationValidationError[] => {
  if (!isRecord(body)) {
    return [{ field: 'prompt', message: 'Prompt is required' }]
  }

  const errors: GenerationValidationError[] = []
  const prompt = body.prompt
  const negativePrompt = body.negativePrompt
  const aspectRatio = body.aspectRatio
  const count = body.count
  const seed = body.seed
  const style = body.style

  if (typeof prompt !== 'string' || prompt.trim().length === 0) {
    errors.push({ field: 'prompt', message: 'Prompt is required' })
  } else if (prompt.trim().length > 1000) {
    errors.push({ field: 'prompt', message: 'Prompt must be at most 1000 characters' })
  }

  if (negativePrompt !== undefined) {
    if (typeof negativePrompt !== 'string') {
      errors.push({
        field: 'negativePrompt',
        message: 'Negative prompt must be a string',
      })
    } else if (negativePrompt.length > 1000) {
      errors.push({
        field: 'negativePrompt',
        message: 'Negative prompt must be at most 1000 characters',
      })
    }
  }

  if (!includesValue(aspectRatios, aspectRatio)) {
    errors.push({
      field: 'aspectRatio',
      message: 'Aspect ratio must be one of: 1:1, 4:3, 3:4, 16:9',
    })
  }

  if (!includesValue(generationCounts, count)) {
    errors.push({ field: 'count', message: 'Count must be one of: 1, 2, 4' })
  }

  if (
    seed !== undefined &&
    (typeof seed !== 'number' ||
      !Number.isInteger(seed) ||
      seed < 0 ||
      seed > 2147483647)
  ) {
    errors.push({
      field: 'seed',
      message: 'Seed must be an integer between 0 and 2147483647',
    })
  }

  if (!includesValue(generationStyles, style)) {
    errors.push({
      field: 'style',
      message: 'Style must be one of: realistic, anime, cyberpunk, watercolor',
    })
  }

  return errors
}

const getSafeProviderError = (cause: unknown): GenerationTaskError => {
  if (cause instanceof LocalImageStorageError) {
    return {
      code: cause.code,
      message: cause.message,
      retryable: true,
    }
  }

  if (cause instanceof ProviderError) {
    return {
      code: cause.code,
      message: 'Image generation provider failed',
      retryable: cause.retryable,
    }
  }

  return {
    code: 'IMAGE_GENERATION_FAILED',
    message: 'Image generation provider failed',
    retryable: false,
  }
}

const runImageGeneration = async (
  taskId: string,
  request: GenerationRequest,
): Promise<void> => {
  if (process.env.ENABLE_REAL_GENERATION !== 'true') {
    updateGenerationTask(taskId, (task) => ({
      ...task,
      status: 'failed',
      completedAt: new Date().toISOString(),
      error: {
        code: 'REAL_GENERATION_DISABLED',
        message: 'Real image generation is disabled',
        retryable: false,
      },
    }))
    await persistGenerationTasks()
    return
  }

  const processingTask = updateGenerationTask(taskId, (task) => ({
    ...task,
    status: 'processing',
  }))

  if (!processingTask) {
    return
  }

  await persistGenerationTasks()

  try {
    const provider = new WanxImageProvider()
    const providerInput: GenerateImageInput = {
      ...request,
      count: 1,
    }
    const result = await provider.generate(providerInput)
    const images = await saveGeneratedImages(taskId, result.images)

    updateGenerationTask(taskId, (task) => ({
      ...task,
      status: 'succeeded',
      completedAt: new Date().toISOString(),
      result: {
        images,
      },
    }))
    await persistGenerationTasks()
  } catch (cause: unknown) {
    const error = getSafeProviderError(cause)

    updateGenerationTask(taskId, (task) => ({
      ...task,
      status: 'failed',
      completedAt: new Date().toISOString(),
      error,
    }))
    await persistGenerationTasks()
  }
}

generationsRouter.post('/', async (request, response) => {
  const body: unknown = request.body
  const errors = validateGenerationRequest(body)

  if (errors.length > 0 || !isRecord(body)) {
    const errorResponse: GenerationValidationErrorResponse = {
      success: false,
      message: 'Invalid generation request',
      errors,
    }

    response.status(400).json(errorResponse)
    return
  }

  const generationRequest: GenerationRequest = {
    prompt: (body.prompt as string).trim(),
    ...(body.negativePrompt === undefined
      ? {}
      : { negativePrompt: body.negativePrompt as string }),
    aspectRatio: body.aspectRatio as AspectRatio,
    count: body.count as GenerationCount,
    ...(body.seed === undefined ? {} : { seed: body.seed as number }),
    style: body.style as GenerationStyle,
  }

  const acceptedResponse: GenerationAcceptedResponse = {
    success: true,
    message: 'Generation request accepted',
    data: {
      taskId: randomUUID(),
      status: 'pending',
      request: generationRequest,
    },
  }

  const generationTask: GenerationTask = {
    ...acceptedResponse.data,
    createdAt: new Date().toISOString(),
  }

  saveGenerationTask(generationTask)
  await persistGenerationTasks()

  response.status(202).json(acceptedResponse)
  void runImageGeneration(generationTask.taskId, generationRequest)
})

generationsRouter.get('/:taskId/images/:imageIndex/download', async (request, response) => {
  const { taskId, imageIndex } = request.params

  if (!/^(0|[1-9]\d*)$/.test(imageIndex)) {
    response.status(400).json({
      success: false,
      message: 'Image index must be a non-negative integer',
    })
    return
  }

  const index = Number(imageIndex)
  if (!Number.isSafeInteger(index)) {
    response.status(400).json({
      success: false,
      message: 'Image index must be a non-negative integer',
    })
    return
  }

  const generationTask = getGenerationTask(taskId)

  if (!generationTask) {
    response.status(404).json({
      success: false,
      message: 'Generation task not found',
    })
    return
  }

  if (generationTask.status !== 'succeeded') {
    response.status(409).json({
      success: false,
      message: 'Generation task has not succeeded',
    })
    return
  }

  const image = generationTask.result?.images[index]
  if (!image) {
    response.status(404).json({
      success: false,
      message: 'Generated image not found',
    })
    return
  }

  const filename = getStoredImageFilename(image.url)

  if (!filename) {
    response.status(404).json({
      success: false,
      message: 'Generated image not found',
    })
    return
  }

  const imageBuffer = await readStoredImage(filename)

  if (!imageBuffer) {
    response.status(404).json({
      success: false,
      message: 'Generated image not found',
    })
    return
  }

  response
    .status(200)
    .set({
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="aigc-${taskId}-${index}.png"`,
      'Cache-Control': 'no-store',
    })
    .send(imageBuffer)
})

generationsRouter.get('/:taskId', (request, response) => {
  const generationTask = getGenerationTask(request.params.taskId)

  if (!generationTask) {
    const notFoundResponse: GenerationTaskNotFoundResponse = {
      success: false,
      message: 'Generation task not found',
    }

    response.status(404).json(notFoundResponse)
    return
  }

  const taskResponse: GenerationTaskResponse = {
    success: true,
    data: generationTask,
  }

  response.status(200).json(taskResponse)
})

export { generationsRouter }
