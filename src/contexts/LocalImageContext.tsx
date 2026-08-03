import { useCallback, useEffect, useRef, useState } from 'react'
import type { PropsWithChildren } from 'react'
import type { LocalImportedImage } from '../types/localImage'
import { LocalImageContext, type LocalImageType } from './localImageStore'

const createTaskId = (): string => `local-${crypto.randomUUID()}`

export function LocalImageProvider({ children }: PropsWithChildren) {
  const [importedImages, setImportedImages] = useState<LocalImportedImage[]>([])
  const importedImagesRef = useRef<LocalImportedImage[]>([])

  useEffect(() => {
    importedImagesRef.current = importedImages
  }, [importedImages])

  useEffect(
    () => () => {
      importedImagesRef.current.forEach((image) => {
        URL.revokeObjectURL(image.url)
      })
    },
    [],
  )

  const addImportedImage = useCallback((file: File, type: LocalImageType): LocalImportedImage => {
    const image: LocalImportedImage = {
      taskId: createTaskId(),
      url: URL.createObjectURL(file),
      name: file.name,
      type,
      size: file.size,
      createdAt: new Date().toISOString(),
    }

    setImportedImages((currentImages) => [...currentImages, image])
    return image
  }, [])

  const getImportedImage = useCallback(
    (taskId: string): LocalImportedImage | undefined =>
      importedImages.find((image) => image.taskId === taskId),
    [importedImages],
  )

  return (
    <LocalImageContext.Provider
      value={{ importedImages, addImportedImage, getImportedImage }}
    >
      {children}
    </LocalImageContext.Provider>
  )
}
