/** 生成任务 HTTP 路由：输入校验、当前用户授权和响应协议；SQL 与文件操作分别委托给下层模块。 */
import { randomUUID } from 'node:crypto'
import express, { Router } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/requireAuth.js'
import { WanxImageProvider } from '../providers/WanxImageProvider.js'
import { ProviderError, type GenerateImageInput } from '../providers/types.js'
import { recordUserActivity } from '../repositories/activityRepository.js'
import {
  deleteGenerationTaskFromPostgres,
  findGenerationTaskForUser,
  getGenerationSummaryForUser,
  listGenerationTasksForUser,
  saveGenerationTaskToPostgres,
} from '../repositories/postgresGenerationRepository.js'
import {
  getStoredImageFilename,
  deleteStoredImage,
  LocalImageStorageError,
  readStoredImage,
  saveEditedImage,
  saveGeneratedImages,
} from '../storage/localImageStorage.js'
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
  type GenerationSummaryResponse,
  type GenerationTask,
  type GenerationTaskNotFoundResponse,
  type GenerationTaskResponse,
  type GenerationValidationError,
  type GenerationValidationErrorResponse,
  generationStatuses,
} from '../types/generation.js'

const generationsRouter = Router()

// Every task endpoint is scoped to the authenticated user. The health endpoint
// and local image serving remain outside this router.
generationsRouter.use(requireAuth)

type GenerationTaskError = NonNullable<GenerationTask['error']>

const taskMutationQueues = new Map<string, Promise<void>>()

const mutateGenerationTask = async <Result>(
  taskId: string,
  mutation: () => Promise<Result>,
): Promise<Result> => {
  const previousMutation = taskMutationQueues.get(taskId) ?? Promise.resolve()
  let releaseMutation: (() => void) | undefined
  const currentMutation = new Promise<void>((resolve) => {
    releaseMutation = resolve
  })
  const queuedMutation = previousMutation.then(() => currentMutation)
  taskMutationQueues.set(taskId, queuedMutation)

  await previousMutation
  try {
    return await mutation()
  } finally {
    releaseMutation?.()
    if (taskMutationQueues.get(taskId) === queuedMutation) {
      taskMutationQueues.delete(taskId)
    }
  }
}

const persistGenerationTask = async (task: GenerationTask): Promise<boolean> => {
  try {
    await saveGenerationTaskToPostgres(task)
    return true
  } catch {
    console.error('Unable to persist generation task to PostgreSQL')
    return false
  }
}

/** 日志仅用于展示最近活动；记录失败不能回滚已经成功完成的主业务操作。 */
const recordUserActivitySafely = async (
  userId: string,
  action: 'generation_created' | 'image_edited_saved' | 'image_deleted' | 'generation_deleted',
  taskId: string | undefined,
  resourceLabel: string,
): Promise<void> => {
  try {
    await recordUserActivity({ userId, action, taskId, resourceLabel })
  } catch {
    console.error('Unable to record user activity')
  }
}

const getOwnedGenerationTask = async (
  taskId: string,
  userId: string,
): Promise<GenerationTask | undefined> => findGenerationTaskForUser(taskId, userId)

const toGenerationTaskResponse = (task: GenerationTask): Omit<GenerationTask, 'userId'> => {
  return {
    taskId: task.taskId,
    status: task.status,
    request: task.request,
    createdAt: task.createdAt,
    ...(task.completedAt === undefined ? {} : { completedAt: task.completedAt }),
    ...(task.result === undefined ? {} : { result: task.result }),
    ...(task.error === undefined ? {} : { error: task.error }),
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
      message: cause.message.slice(0, 300) || 'Image generation provider failed',
      retryable: cause.retryable,
    }
  }

  return {
    code: 'IMAGE_GENERATION_FAILED',
    message: 'Image generation provider failed',
    retryable: false,
  }
}

const runImageGeneration = async (initialTask: GenerationTask): Promise<void> => {
  const taskId = initialTask.taskId
  const request = initialTask.request
  if (process.env.ENABLE_REAL_GENERATION !== 'true') {
    await persistGenerationTask({
      ...initialTask,
      status: 'failed',
      completedAt: new Date().toISOString(),
      error: {
        code: 'REAL_GENERATION_DISABLED',
        message: 'Real image generation is disabled',
        retryable: false,
      },
    })
    return
  }

  const processingTask: GenerationTask = {
    ...initialTask,
    status: 'processing',
  }
  await persistGenerationTask(processingTask)

  try {
    const provider = new WanxImageProvider()
    const providerInput: GenerateImageInput = {
      ...request,
      count: 1,
    }
    const result = await provider.generate(providerInput)
    const images = await saveGeneratedImages(taskId, result.images)

    await persistGenerationTask({
      ...processingTask,
      status: 'succeeded',
      completedAt: new Date().toISOString(),
      result: {
        images,
      },
    })
  } catch (cause: unknown) {
    const error = getSafeProviderError(cause)

    await persistGenerationTask({
      ...processingTask,
      status: 'failed',
      completedAt: new Date().toISOString(),
      error,
    })
  }
}

generationsRouter.post('/', async (request: AuthenticatedRequest, response) => {
  const userId = request.authUser?.sub
  if (!userId) {
    response.status(401).json({ success: false, message: 'Authentication is required' })
    return
  }

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
    userId,
    createdAt: new Date().toISOString(),
  }

  const persisted = await persistGenerationTask(generationTask)

  if (!persisted) {
    response.status(503).json({
      success: false,
      message: 'Unable to create generation task',
    })
    return
  }

  await recordUserActivitySafely(
    userId,
    'generation_created',
    generationTask.taskId,
    `生成任务 ${generationTask.taskId.slice(0, 8)}`,
  )

  response.status(202).json(acceptedResponse)
  void runImageGeneration(generationTask)
})

generationsRouter.get('/', async (request: AuthenticatedRequest, response) => {
  const userId = request.authUser?.sub
  if (!userId) {
    response.status(401).json({ success: false, message: 'Authentication is required' })
    return
  }

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

  const filteredTasks = await listGenerationTasksForUser(userId, query.status)
  const total = filteredTasks.length
  const items = filteredTasks.slice(query.offset, query.offset + query.limit)

  const listResponse: GenerationListResponse = {
    success: true,
    data: {
      items: items.map(toGenerationTaskResponse),
      total,
      limit: query.limit,
      offset: query.offset,
      hasMore: query.offset + items.length < total,
    },
  }

  response.status(200).json(listResponse)
})

/** 返回当前用户的任务与图片计数，供个人中心展示，不泄露其他用户数据。 */
generationsRouter.get('/summary', async (request: AuthenticatedRequest, response) => {
  const userId = request.authUser?.sub
  if (!userId) {
    response.status(401).json({ success: false, message: 'Authentication is required' })
    return
  }

  try {
    const summaryResponse: GenerationSummaryResponse = {
      success: true,
      data: await getGenerationSummaryForUser(userId),
    }
    response.status(200).json(summaryResponse)
  } catch {
    response.status(500).json({ success: false, message: 'Unable to load generation summary' })
  }
})

generationsRouter.post(
  '/:taskId/images/:imageIndex/edits',
  express.raw({ type: 'image/png', limit: '15mb' }),
  async (request: AuthenticatedRequest<{ taskId: string; imageIndex: string }>, response) => {
    const { taskId, imageIndex } = request.params
    const userId = request.authUser?.sub

    if (!userId) {
      response.status(401).json({ success: false, message: 'Authentication is required' })
      return
    }

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

    await mutateGenerationTask(taskId, async () => {
      const generationTask = await getOwnedGenerationTask(taskId, userId)
      if (!generationTask) {
        response.status(404).json({ success: false, message: 'Generation task not found' })
        return
      }
      if (generationTask.status !== 'succeeded') {
        response.status(409).json({ success: false, message: 'Generation task has not succeeded' })
        return
      }

      const existingImages = generationTask.result?.images
      if (!existingImages) {
        response.status(409).json({ success: false, message: 'Generation task has no images' })
        return
      }

      const sourceImage = existingImages[index]
      const sourceFilename = sourceImage ? getStoredImageFilename(sourceImage.url) : null
      if (!sourceImage || !sourceFilename || !(await readStoredImage(sourceFilename))) {
        response.status(404).json({ success: false, message: 'Generated image not found' })
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
          result: { images: [...existingImages, editedImage] },
        }
        if (!(await persistGenerationTask(updatedTask))) {
          throw new Error('Unable to persist edited image metadata')
        }

        await recordUserActivitySafely(
          userId,
          'image_edited_saved',
          taskId,
          `保存编辑作品（图片 ${savedImageIndex + 1}）`,
        )

        response.status(201).json({
          success: true,
          message: 'Edited image saved',
          data: { taskId, imageIndex: savedImageIndex, image: editedImage },
        })
      } catch {
        if (filename) await deleteStoredImage(filename)
        response.status(500).json({ success: false, message: 'Unable to save edited image' })
      }
    })
  },
)

generationsRouter.delete('/:taskId/images/:imageIndex', async (request: AuthenticatedRequest<{ taskId: string; imageIndex: string }>, response) => {
  const { taskId, imageIndex } = request.params
  const userId = request.authUser?.sub
  if (!userId) {
    response.status(401).json({ success: false, message: 'Authentication is required' })
    return
  }
  if (!/^(0|[1-9]\d*)$/.test(imageIndex)) {
    response.status(404).json({ success: false, message: 'Generated image not found' })
    return
  }
  const index = Number(imageIndex)
  await mutateGenerationTask(taskId, async () => {
    const task = await getOwnedGenerationTask(taskId, userId)
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

    const remainingImages = (task.result?.images ?? [])
      .filter((_, currentIndex) => currentIndex !== index)
      .map((currentImage) => {
        const sourceImageIndex = currentImage.sourceImageIndex
        if (sourceImageIndex === undefined || sourceImageIndex < index) return currentImage
        if (sourceImageIndex === index) {
          const imageWithoutDeletedSource = { ...currentImage }
          delete imageWithoutDeletedSource.sourceImageIndex
          return imageWithoutDeletedSource
        }
        return { ...currentImage, sourceImageIndex: sourceImageIndex - 1 }
      })
    const taskDeleted = remainingImages.length === 0
    try {
      if (taskDeleted) {
        await deleteGenerationTaskFromPostgres(taskId, userId)
      } else {
        const updatedTask: GenerationTask = { ...task, result: { images: remainingImages } }
        if (!(await persistGenerationTask(updatedTask))) {
          throw new Error('Unable to persist generation task metadata')
        }
      }

      await deleteStoredImage(filename)
      await recordUserActivitySafely(
        userId,
        'image_deleted',
        taskId,
        `删除图片 ${index + 1}`,
      )
      response.status(200).json({
        success: true,
        message: 'Image deleted',
        data: { taskId, deletedImageIndex: index, taskDeleted },
      })
    } catch {
      response.status(500).json({ success: false, message: 'Unable to delete image' })
    }
  })
})

generationsRouter.delete('/:taskId', async (request: AuthenticatedRequest<{ taskId: string }>, response) => {
  const userId = request.authUser?.sub
  if (!userId) {
    response.status(401).json({ success: false, message: 'Authentication is required' })
    return
  }

  const task = await getOwnedGenerationTask(request.params.taskId, userId)
  if (!task) {
    response.status(404).json({ success: false, message: 'Generation task not found' })
    return
  }

  if (task.status !== 'failed') {
    response.status(409).json({
      success: false,
      message: 'Only failed generation tasks can be deleted without removing images',
    })
    return
  }

  try {
    await deleteGenerationTaskFromPostgres(task.taskId, userId)
    await recordUserActivitySafely(
      userId,
      'generation_deleted',
      undefined,
      `删除失败任务 ${task.taskId.slice(0, 8)}`,
    )
    response.status(200).json({
      success: true,
      message: 'Generation task deleted',
      data: { taskId: task.taskId, taskDeleted: true },
    })
  } catch {
    response.status(500).json({ success: false, message: 'Unable to delete generation task' })
  }
})

generationsRouter.get('/:taskId/images/:imageIndex/download', async (request: AuthenticatedRequest<{ taskId: string; imageIndex: string }>, response) => {
  const { taskId, imageIndex } = request.params
  const userId = request.authUser?.sub
  if (!userId) {
    response.status(401).json({ success: false, message: 'Authentication is required' })
    return
  }

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

  const generationTask = await getOwnedGenerationTask(taskId, userId)

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

generationsRouter.get('/:taskId', async (request: AuthenticatedRequest<{ taskId: string }>, response) => {
  const userId = request.authUser?.sub
  if (!userId) {
    response.status(401).json({ success: false, message: 'Authentication is required' })
    return
  }

  const generationTask = await getOwnedGenerationTask(request.params.taskId, userId)

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
    data: toGenerationTaskResponse(generationTask),
  }

  response.status(200).json(taskResponse)
})

export { generationsRouter }
