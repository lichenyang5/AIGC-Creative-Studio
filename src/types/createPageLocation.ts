/** 路由 state 的运行时校验：历史参数只存在于本次导航，不能假定外部 state 一定可信。 */
import {
  aspectRatios,
  imageCounts,
  stylePresets,
  type GenerationFormData,
} from './generation'
import type { GenerationRequestPayload, GenerationStyle } from './generationApi'

export interface CreatePageLocationState {
  reusedGenerationRequest?: GenerationRequestPayload
}

const stylePresetByGenerationStyle: Record<GenerationStyle, GenerationFormData['stylePreset']> = {
  realistic: '写实摄影',
  anime: '二次元',
  cyberpunk: '赛博朋克',
  watercolor: '水彩插画',
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isGenerationStyle = (value: unknown): value is GenerationStyle =>
  value === 'realistic' || value === 'anime' || value === 'cyberpunk' || value === 'watercolor'

export const getReusedGenerationFormData = (
  state: unknown,
  defaults: GenerationFormData,
): GenerationFormData | null => {
  if (!isRecord(state) || !isRecord(state.reusedGenerationRequest)) return null

  const request = state.reusedGenerationRequest
  if (
    typeof request.prompt !== 'string' ||
    typeof request.aspectRatio !== 'string' ||
    !aspectRatios.includes(request.aspectRatio as GenerationFormData['aspectRatio']) ||
    typeof request.count !== 'number' ||
    !imageCounts.includes(request.count as GenerationFormData['imageCount']) ||
    !isGenerationStyle(request.style)
  ) {
    return null
  }

  return {
    prompt: request.prompt,
    negativePrompt: typeof request.negativePrompt === 'string'
      ? request.negativePrompt
      : defaults.negativePrompt,
    aspectRatio: request.aspectRatio as GenerationFormData['aspectRatio'],
    imageCount: request.count as GenerationFormData['imageCount'],
    seed: typeof request.seed === 'number' &&
      Number.isInteger(request.seed) &&
      request.seed >= 0 &&
      request.seed <= 2147483647
      ? String(request.seed)
      : defaults.seed,
    stylePreset: stylePresetByGenerationStyle[request.style],
  }
}

export const isCreatePageLocationState = (value: unknown): value is CreatePageLocationState =>
  getReusedGenerationFormData(value, {
    prompt: '',
    negativePrompt: '',
    aspectRatio: '1:1',
    imageCount: 1,
    seed: '',
    stylePreset: stylePresets[0],
  }) !== null
