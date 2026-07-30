import { randomUUID } from 'node:crypto'
import express, { Router } from 'express'
import { WanxImageProvider } from '../providers/WanxImageProvider.js'
import { ProviderError, type GenerateImageInput } from '../providers/types.js'
import { saveGenerationTasks } from '../repositories/generationRepository.js'
import {
  getStoredImageFilename,
  deleteStoredImage,
  LocalImageStorageError,
  readStoredImage,
  saveEditedImage,
  saveGeneratedImages,
} from '../storage/localImageStorage.js'
import {
  getAllGenerationTasks,
  deleteGenerationTask,
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
  type GenerationListQuery,
  type GenerationListQueryValidationError,
  type GenerationListQueryValidationErrorResponse,
  type GenerationListResponse,
  type GenerationRequest,
  type GenerationStatus,
  type GenerationStyle,
  type GenerationImage,
  type GenerationTask,
  type GenerationTaskNotFoundResponse,
  type GenerationTaskResponse,
  type GenerationValidationError,
  type GenerationValidationErrorResponse,
  generationStatuses,
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

const parseGenerationListQuery = (
  query: Record<string, unknown>,
): { query?: GenerationListQuery; errors: GenerationListQueryValidationError[] } => {
  const errors: GenerationListQueryValidationError[] = []
  const status = query.status
  const limit = query.limit
  const offset = query.offset
  let parsedStatus: GenerationStatus | undefined

  if (status !== undefined) {
    if (includesValue(generationStatuses, status)) {
      parsedStatus = status
    } else {
      errors.push({
        field: 'status',
        message: 'Status must be one of: succeeded, failed, pending, processing',
      })
    }
  }

  const parsedLimit =
    limit === undefined
      ? 20
      : typeof limit === 'string' && /^\d+$/.test(limit)
        ? Number(limit)
        : NaN
  if (!Number.isSafeInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
    errors.push({
      field: 'limit',
      message: 'Limit must be an integer between 1 and 50',
    })
  }

  const parsedOffset =
    offset === undefined
      ? 0
      : typeof offset === 'string' && /^\d+$/.test(offset)
        ? Number(offset)
        : NaN
  if (!Number.isSafeInteger(parsedOffset) || parsedOffset < 0) {
    errors.push({
      field: 'offset',
      message: 'Offset must be a non-negative integer',
    })
  }

  if (errors.length > 0) {
    return { errors }
  }

  return {
    query: {
      ...(parsedStatus === undefined ? {} : { status: parsedStatus }),
      limit: parsedLimit,
      offset: parsedOffset,
    },
    errors,
  }
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

generationsRouter.get('/', (request, response) => {
  const { query, errors } = parseGenerationListQuery(request.query)

  if (!query) {
    const errorResponse: GenerationListQueryValidationErrorResponse = {
      success: false,
      message: 'Invalid query parameters',
      errors,
    }

    response.status(400).json(errorResponse)
    return
  }

  const filteredTasks = getAllGenerationTasks()
    .filter((task) => query.status === undefined || task.status === query.status)
    .sort((firstTask, secondTask) =>
      secondTask.createdAt.localeCompare(firstTask.createdAt),
    )
  const total = filteredTasks.length
  const items = filteredTasks.slice(query.offset, query.offset + query.limit)

  const listResponse: GenerationListResponse = {
    success: true,
    data: {
      items,
      total,
      limit: query.limit,
      offset: query.offset,
      hasMore: query.offset + items.length < total,
    },
  }

  response.status(200).json(listResponse)
})

generationsRouter.post(
  '/:taskId/images/:imageIndex/edits',
  express.raw({ type: 'image/png', limit: '15mb' }),
  async (request, response) => {
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

    const existingImages = generationTask.result?.images
    if (!existingImages) {
      response.status(409).json({
        success: false,
        message: 'Generation task has no images',
      })
      return
    }

    const sourceImage = existingImages[index]
    const sourceFilename = sourceImage
      ? getStoredImageFilename(sourceImage.url)
      : null
    if (!sourceImage || !sourceFilename || !(await readStoredImage(sourceFilename))) {
      response.status(404).json({
        success: false,
        message: 'Generated image not found',
      })
      return
    }

    if (!request.is('image/png')) {
      response.status(415).json({
        success: false,
        message: 'Content-Type must be image/png',
      })
      return
    }

    const requestBody: unknown = request.body
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    if (
      !Buffer.isBuffer(requestBody) ||
      requestBody.length === 0 ||
      requestBody.length < pngSignature.length ||
      !requestBody.subarray(0, pngSignature.length).equals(pngSignature)
    ) {
      response.status(400).json({
        success: false,
        message: 'Request body must contain a valid PNG image',
      })
      return
    }

    const editId = randomUUID()
    const savedImageIndex = existingImages.length
    let filename: string | null = null

    try {
      filename = await saveEditedImage(taskId, editId, requestBody)
      const createdAt = new Date().toISOString()
      const editedImage: GenerationImage = {
        url: `/api/images/${filename}`,
        kind: 'edited',
        createdAt,
        sourceImageIndex: index,
      }
      const updatedTask: GenerationTask = {
        ...generationTask,
        result: {
          images: [...existingImages, editedImage],
        },
      }
      const updatedTasks = getAllGenerationTasks().map((task) =>
        task.taskId === taskId ? updatedTask : task,
      )

      await saveGenerationTasks(updatedTasks)
      saveGenerationTask(updatedTask)

      response.status(201).json({
        success: true,
        message: 'Edited image saved',
        data: {
          taskId,
          imageIndex: savedImageIndex,
          image: editedImage,
        },
      })
    } catch {
      if (filename) {
        await deleteStoredImage(filename)
      }

      response.status(500).json({
        success: false,
        message: 'Unable to save edited image',
      })
    }
  },
)

generationsRouter.delete('/:taskId/images/:imageIndex', async (request, response) => {
  const { taskId, imageIndex } = request.params
  if (!/^(0|[1-9]\d*)$/.test(imageIndex)) {
    response.status(404).json({ success: false, message: 'Generated image not found' })
    return
  }
  const index = Number(imageIndex)
  const task = getGenerationTask(taskId)
  if (!task) {
    response.status(404).json({ success: false, message: 'Generation task not found' })
    return
  }
  const image = task.result?.images[index]
  if (!image) {
    response.status(404).json({ success: false, message: 'Generated image not found' })
    return
  }
  const filename = getStoredImageFilename(image.url)
  if (!filename) {
    response.status(404).json({ success: false, message: 'Generated image not found' })
    return
  }

  const remainingImages = task.result?.images.filter((_, currentIndex) => currentIndex !== index) ?? []
  const taskDeleted = remainingImages.length === 0
  const updatedTasks = getAllGenerationTasks().filter((currentTask) => currentTask.taskId !== taskId)
  if (!taskDeleted) {
    updatedTasks.push({ ...task, result: { images: remainingImages } })
  }

  try {
    await saveGenerationTasks(updatedTasks)
    await deleteStoredImage(filename)
    if (taskDeleted) {
      deleteGenerationTask(taskId)
    } else {
      saveGenerationTask({ ...task, result: { images: remainingImages } })
    }
    response.status(200).json({
      success: true,
      message: 'Image deleted',
      data: { taskId, deletedImageIndex: index, taskDeleted },
    })
  } catch {
    response.status(500).json({ success: false, message: 'Unable to delete image' })
  }
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
