import type { GenerateImageInput, GenerateImageResult } from './types.js'

export interface ImageGenerationProvider {
  readonly name: string
  generate(input: GenerateImageInput): Promise<GenerateImageResult>
}
