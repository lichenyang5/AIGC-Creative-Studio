import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import type { GenerationTask } from '../types/generation.js'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const dataDirectory = resolve(currentDirectory, '../../data')
const generationsFilePath = resolve(dataDirectory, 'generations.json')

const isGenerationTaskList = (value: unknown): value is GenerationTask[] =>
  Array.isArray(value)

export const loadGenerationTasks = async (): Promise<GenerationTask[]> => {
  try {
    await mkdir(dataDirectory, { recursive: true })
    const fileContents = await readFile(generationsFilePath, 'utf8')
    const parsed: unknown = JSON.parse(fileContents)

    return isGenerationTaskList(parsed) ? parsed : []
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      await writeFile(generationsFilePath, '[]', 'utf8')
      return []
    }

    console.error('Unable to load persisted generation tasks')
    return []
  }
}

export const saveGenerationTasks = async (
  tasks: GenerationTask[],
): Promise<void> => {
  await mkdir(dataDirectory, { recursive: true })

  const temporaryFilePath = `${generationsFilePath}.${randomUUID()}.tmp`
  await writeFile(temporaryFilePath, JSON.stringify(tasks, null, 2), 'utf8')
  await rename(temporaryFilePath, generationsFilePath)
}
