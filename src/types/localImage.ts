/** 仅用于当前 React 会话的本地图片引用，刷新后应从 IndexedDB 重新创建 Object URL。 */
export interface LocalImportedImage {
  taskId: string
  url: string
  name: string
  type: 'image/png' | 'image/jpeg' | 'image/webp'
  size: number
  createdAt: string
}
