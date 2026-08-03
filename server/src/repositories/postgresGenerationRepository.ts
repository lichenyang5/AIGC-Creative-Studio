/** 生成任务 Repository：使用同一只读事务快照查询任务和图片，position 保证 imageIndex 稳定。 */
import { randomUUID } from 'node:crypto'
import { getDatabasePool } from '../database/database.js'
import { getStoredImageFilename } from '../storage/localImageStorage.js'
import type {
  GenerationImage,
  GenerationStatus,
  GenerationStyle,
  GenerationTask,
} from '../types/generation.js'

interface GenerationTaskRow {
  id: string
  user_id: string
  status: GenerationStatus
  prompt: string
  negative_prompt: string | null
  aspect_ratio: GenerationTask['request']['aspectRatio']
  image_count: GenerationTask['request']['count']
  seed: number | null
  style: GenerationStyle
  error_code: string | null
  error_message: string | null
  created_at: Date
  completed_at: Date | null
}

interface GenerationImageRow {
  id: string
  generation_task_id: string
  storage_key: string
  kind: 'generated' | 'edited' | 'imported'
  position: number
  created_at: Date
  source_image_id: string | null
}

interface TaskOwnerRow {
  user_id: string
}

const upsertTask = `
  INSERT INTO generation_tasks (
    id, user_id, status, prompt, negative_prompt, aspect_ratio, image_count,
    seed, style, error_code, error_message, created_at, completed_at
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status,
    prompt = EXCLUDED.prompt,
    negative_prompt = EXCLUDED.negative_prompt,
    aspect_ratio = EXCLUDED.aspect_ratio,
    image_count = EXCLUDED.image_count,
    seed = EXCLUDED.seed,
    style = EXCLUDED.style,
    error_code = EXCLUDED.error_code,
    error_message = EXCLUDED.error_message,
    completed_at = EXCLUDED.completed_at
`

export const saveGenerationTaskToPostgres = async (task: GenerationTask): Promise<void> => {
  if (!task.userId) {
    throw new Error('Generation task owner is required for PostgreSQL persistence')
  }

  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('BEGIN')
    const existingTask = await client.query<TaskOwnerRow>(
      'SELECT user_id FROM generation_tasks WHERE id = $1 FOR UPDATE',
      [task.taskId],
    )
    const existingOwner = existingTask.rows[0]?.user_id
    if (existingOwner !== undefined && existingOwner !== task.userId) {
      throw new Error('Generation task belongs to a different user')
    }

    await client.query(upsertTask, [
      task.taskId,
      task.userId,
      task.status,
      task.request.prompt,
      task.request.negativePrompt ?? null,
      task.request.aspectRatio,
      task.request.count,
      task.request.seed ?? null,
      task.request.style,
      task.error?.code ?? null,
      task.error?.message ?? null,
      task.createdAt,
      task.completedAt ?? null,
    ])

    await client.query(
      'DELETE FROM images WHERE generation_task_id = $1 AND user_id = $2',
      [task.taskId, task.userId],
    )

    const images = task.result?.images ?? []
    const imageIds = images.map(() => randomUUID())

    for (const [index, image] of images.entries()) {
      const storageKey = getStoredImageFilename(image.url)
      if (!storageKey) continue

      const sourceImageId = image.sourceImageIndex === undefined
        ? null
        : imageIds[image.sourceImageIndex] ?? null

      await client.query(
        `INSERT INTO images (
          id, user_id, generation_task_id, kind, storage_key, mime_type,
          source_image_id, position, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          imageIds[index],
          task.userId,
          task.taskId,
          image.kind ?? 'generated',
          storageKey,
          'image/png',
          sourceImageId,
          index,
          image.createdAt ?? task.completedAt ?? task.createdAt,
        ],
      )
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

const toGenerationTasks = (
  tasks: GenerationTaskRow[],
  storedImageRows: GenerationImageRow[],
): GenerationTask[] => {
  const imagesByTaskId = new Map<string, GenerationImageRow[]>()
  for (const image of storedImageRows) {
    const taskImages = imagesByTaskId.get(image.generation_task_id) ?? []
    taskImages.push(image)
    imagesByTaskId.set(image.generation_task_id, taskImages)
  }

  return tasks.map((task) => {
    const storedImages = imagesByTaskId.get(task.id) ?? []
    const indexByImageId = new Map(storedImages.map((image, index) => [image.id, index]))
    const images: GenerationImage[] = storedImages.map((image) => ({
      url: `/api/images/${image.storage_key}`,
      kind: image.kind === 'edited' ? 'edited' : 'generated',
      createdAt: image.created_at.toISOString(),
      ...(image.source_image_id === null || indexByImageId.get(image.source_image_id) === undefined
        ? {}
        : { sourceImageIndex: indexByImageId.get(image.source_image_id) }),
    }))

    return {
      taskId: task.id,
      userId: task.user_id,
      status: task.status,
      request: {
        prompt: task.prompt,
        ...(task.negative_prompt === null ? {} : { negativePrompt: task.negative_prompt }),
        aspectRatio: task.aspect_ratio,
        count: task.image_count,
        ...(task.seed === null ? {} : { seed: task.seed }),
        style: task.style,
      },
      createdAt: task.created_at.toISOString(),
      ...(task.completed_at === null ? {} : { completedAt: task.completed_at.toISOString() }),
      ...(images.length === 0 ? {} : { result: { images } }),
      ...(task.error_code === null && task.error_message === null
        ? {}
        : {
            error: {
              code: task.error_code ?? 'IMAGE_GENERATION_FAILED',
              message: task.error_message ?? 'Image generation failed',
              retryable: false,
            },
          }),
    }
  })
}

const queryGenerationTasks = async (
  whereClause: string,
  values: unknown[],
): Promise<GenerationTask[]> => {
  const client = await getDatabasePool().connect()
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const taskResult = await client.query<GenerationTaskRow>(
      `SELECT id, user_id, status, prompt, negative_prompt, aspect_ratio, image_count,
        seed, style, error_code, error_message, created_at, completed_at
       FROM generation_tasks
       WHERE ${whereClause}
       ORDER BY created_at DESC`,
      values,
    )
    if (taskResult.rows.length === 0) {
      await client.query('COMMIT')
      return []
    }

    const imageResult = await client.query<GenerationImageRow>(
      `SELECT id, generation_task_id, storage_key, kind, position, created_at, source_image_id
       FROM images
       WHERE generation_task_id = ANY($1::uuid[])
       ORDER BY position ASC`,
      [taskResult.rows.map((task) => task.id)],
    )
    await client.query('COMMIT')
    return toGenerationTasks(taskResult.rows, imageResult.rows)
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

export const listGenerationTasksForUser = async (
  userId: string,
  status?: GenerationStatus,
): Promise<GenerationTask[]> => queryGenerationTasks(
  status === undefined ? 'user_id = $1' : 'user_id = $1 AND status = $2',
  status === undefined ? [userId] : [userId, status],
)

export const findGenerationTaskForUser = async (
  taskId: string,
  userId: string,
): Promise<GenerationTask | undefined> => {
  const tasks = await queryGenerationTasks('id = $1 AND user_id = $2', [taskId, userId])
  return tasks[0]
}

export const isStoredImageOwnedByUser = async (
  storageKey: string,
  userId: string,
): Promise<boolean> => {
  const result = await getDatabasePool().query(
    'SELECT 1 FROM images WHERE storage_key = $1 AND user_id = $2 LIMIT 1',
    [storageKey, userId],
  )
  return result.rowCount === 1
}

export const deleteGenerationTaskFromPostgres = async (
  taskId: string,
  userId: string,
): Promise<void> => {
  const client = await getDatabasePool().connect()

  try {
    await client.query('BEGIN')
    await client.query(
      `DELETE FROM images
       WHERE generation_task_id = $1 AND user_id = $2`,
      [taskId, userId],
    )
    const result = await client.query(
      'DELETE FROM generation_tasks WHERE id = $1 AND user_id = $2',
      [taskId, userId],
    )

    if (result.rowCount !== 1) {
      throw new Error('Generation task was not found for the current user')
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
