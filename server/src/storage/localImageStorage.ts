import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { GeneratedImage } from '../providers/types.js'
import type { GenerationImage } from '../types/generation.js'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const imagesDirectory = resolve(currentDirectory, '../../storage/images')

export class LocalImageStorageError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'LocalImageStorageError'
    this.code = code
  }
}

const createFilename = (taskId: string, imageIndex: number): string =>
  `${taskId}-${imageIndex}.png`

const getSafeImagePath = (filename: string): string | null => {
  if (filename !== basename(filename) || !filename.endsWith('.png')) {
    return null
  }

  const imagePath = resolve(imagesDirectory, filename)
  return imagePath.startsWith(`${imagesDirectory}${sep}`) ? imagePath : null
}

export const saveGeneratedImages = async (
  taskId: string,
  images: GeneratedImage[],
): Promise<GenerationImage[]> => {
  await mkdir(imagesDirectory, { recursive: true })

  return Promise.all(
    images.map(async (image, imageIndex) => {
      let upstreamResponse: Response

      try {
        upstreamResponse = await fetch(image.url)
      } catch {
        throw new LocalImageStorageError(
          'LOCAL_IMAGE_DOWNLOAD_FAILED',
          'Unable to download generated image',
        )
      }

      if (!upstreamResponse.ok) {
        throw new LocalImageStorageError(
          'LOCAL_IMAGE_DOWNLOAD_FAILED',
          'Unable to download generated image',
        )
      }

      const filename = createFilename(taskId, imageIndex)
      const imagePath = getSafeImagePath(filename)

      if (!imagePath) {
        throw new LocalImageStorageError(
          'LOCAL_IMAGE_PATH_INVALID',
          'Unable to save generated image',
        )
      }

      try {
        await writeFile(imagePath, Buffer.from(await upstreamResponse.arrayBuffer()))
      } catch {
        throw new LocalImageStorageError(
          'LOCAL_IMAGE_WRITE_FAILED',
          'Unable to save generated image',
        )
      }

      return {
        url: `/api/images/${filename}`,
        kind: 'generated',
        ...(image.width === undefined ? {} : { width: image.width }),
        ...(image.height === undefined ? {} : { height: image.height }),
      }
    }),
  )
}

export const saveEditedImage = async (
  taskId: string,
  editId: string,
  imageData: Buffer,
): Promise<string> => {
  await mkdir(imagesDirectory, { recursive: true })

  const filename = `${taskId}-edit-${editId}.png`
  const imagePath = getSafeImagePath(filename)

  if (!imagePath) {
    throw new LocalImageStorageError(
      'LOCAL_IMAGE_PATH_INVALID',
      'Unable to save edited image',
    )
  }

  try {
    await writeFile(imagePath, imageData)
    return filename
  } catch {
    throw new LocalImageStorageError(
      'LOCAL_IMAGE_WRITE_FAILED',
      'Unable to save edited image',
    )
  }
}

export const deleteStoredImage = async (filename: string): Promise<void> => {
  const imagePath = getSafeImagePath(filename)

  if (!imagePath) {
    return
  }

  try {
    await unlink(imagePath)
  } catch {
    // The file may not have been created or may already be cleaned up.
  }
}

export const readStoredImage = async (filename: string): Promise<Buffer | null> => {
  const imagePath = getSafeImagePath(filename)

  if (!imagePath) {
    return null
  }

  try {
    return await readFile(imagePath)
  } catch {
    return null
  }
}

export const getStoredImageFilename = (imageUrl: string): string | null => {
  const localImagePath = '/api/images/'

  if (!imageUrl.startsWith(localImagePath)) {
    return null
  }

  const filename = imageUrl.slice(localImagePath.length)
  return getSafeImagePath(filename) ? filename : null
}
