export interface LocalImportedImage {
  taskId: string
  url: string
  name: string
  type: 'image/png' | 'image/jpeg' | 'image/webp'
  size: number
  createdAt: string
}
