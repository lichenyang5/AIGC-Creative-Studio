/** 平台适配器契约：路由和任务逻辑只依赖此接口，不依赖某一家云厂商 SDK。 */
import type { GenerateImageInput, GenerateImageResult } from './types.js'

export interface ImageGenerationProvider {
  readonly name: string
  generate(input: GenerateImageInput): Promise<GenerateImageResult>
}
