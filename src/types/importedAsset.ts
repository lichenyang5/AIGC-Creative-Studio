export type ImportedAssetMimeType = 'image/png' | 'image/jpeg' | 'image/webp'

export interface ImportedAsset {
  id: string
  type: 'imported-asset'
  name: string
  originalFileName: string
  blob: Blob
  mimeType: ImportedAssetMimeType
  size: number
  createdAt: string
}
