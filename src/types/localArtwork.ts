/** 浏览器本地编辑作品模型：与原始导入素材独立保存，删除源素材不会级联删除作品。 */
import type { ImageEditMode } from '../components/ImageCanvas'

export type LocalArtworkSourceType = 'generated' | 'imported'

export interface LocalArtwork {
  id: string
  name: string
  blob: Blob
  mimeType: 'image/png'
  createdAt: string
  sourceType: LocalArtworkSourceType
  sourceTaskId?: string
  sourceImageIndex?: number
  effectMode: ImageEditMode
}
