/** 本地临时图片上下文的类型与消费 Hook，Object URL 生命周期由 Provider 管理。 */
import { createContext, useContext } from 'react'
import type { LocalImportedImage } from '../types/localImage'

export type LocalImageType = LocalImportedImage['type']

export interface LocalImageContextValue {
  importedImages: LocalImportedImage[]
  addImportedImage: (file: File, type: LocalImageType) => LocalImportedImage
  getImportedImage: (taskId: string) => LocalImportedImage | undefined
}

export const LocalImageContext = createContext<LocalImageContextValue | null>(null)

export function useLocalImages(): LocalImageContextValue {
  const context = useContext(LocalImageContext)

  if (!context) {
    throw new Error('useLocalImages must be used within LocalImageProvider')
  }

  return context
}
