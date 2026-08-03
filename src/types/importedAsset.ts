/** IndexedDB 导入素材模型：只保存原始 Blob 与元数据，不保存短生命周期 Object URL。 */
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
