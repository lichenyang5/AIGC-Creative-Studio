export const aspectRatios = ['1:1', '4:3', '3:4', '16:9'] as const
export const imageCounts = [1, 2, 4] as const
export const stylePresets = [
  '写实摄影',
  '二次元',
  '赛博朋克',
  '水彩插画',
] as const

export type AspectRatio = (typeof aspectRatios)[number]
export type ImageCount = (typeof imageCounts)[number]
export type StylePreset = (typeof stylePresets)[number]

export interface GenerationFormData {
  prompt: string
  negativePrompt: string
  aspectRatio: AspectRatio
  imageCount: ImageCount
  seed: string
  stylePreset: StylePreset
}
