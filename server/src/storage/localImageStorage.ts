/** 服务端图片文件存储：客户端路径不可直达 fs，所有文件名都先经过目录边界校验。 */
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

/** 为 Provider 下载的原图生成确定性文件名，便于任务与本地文件建立一一对应。 */
const createFilename = (taskId: string, imageIndex: number): string =>
  `${taskId}-${imageIndex}.png`

/**
 * 将受控文件名解析到图片目录。basename、后缀和 resolve 后前缀三重校验共同阻断目录穿越。
 */
const getSafeImagePath = (filename: string): string | null => {
  if (filename !== basename(filename) || !filename.endsWith('.png')) {
    return null
  }

  const imagePath = resolve(imagesDirectory, filename)
  return imagePath.startsWith(`${imagesDirectory}${sep}`) ? imagePath : null
}

/**
 * 下载 Provider 已返回的临时 URL 并写入本地。调用方只传入 Provider 结果，
 * 不接受客户端任意 URL；成功后返回供数据库持久化的本地 API 地址。
 */
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

/** 将已校验 PNG 二进制保存为不可覆盖的编辑作品文件名。 */
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

/** 删除受控目录中的单个文件；文件已不存在时保持幂等，方便元数据清理后的补偿操作。 */
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

/** 读取已通过路由授权的本地图片；非法路径或不存在文件均返回 null，不暴露文件系统细节。 */
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

/** 从数据库中的本地 API URL 反解析安全文件名，外部 URL 绝不会被当作可读文件。 */
export const getStoredImageFilename = (imageUrl: string): string | null => {
  const localImagePath = '/api/images/'

  if (!imageUrl.startsWith(localImagePath)) {
    return null
  }

  const filename = imageUrl.slice(localImagePath.length)
  return getSafeImagePath(filename) ? filename : null
}
