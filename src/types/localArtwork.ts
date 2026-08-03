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
