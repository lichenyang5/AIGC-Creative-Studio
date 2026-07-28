import { randomUUID } from 'node:crypto'
import { Router } from 'express'
import {
  aspectRatios,
  generationCounts,
  generationStyles,
  type AspectRatio,
  type GenerationAcceptedResponse,
  type GenerationCount,
  type GenerationRequest,
  type GenerationStyle,
  type GenerationValidationError,
  type GenerationValidationErrorResponse,
} from '../types/generation.js'

const generationsRouter = Router()

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

generationsRouter.post('/', (request, response) => {
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

  response.status(202).json(acceptedResponse)
})

export { generationsRouter }
