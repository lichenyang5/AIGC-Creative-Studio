import type { GenerationTask } from '../types/generation.js'

const generationTasks = new Map<string, GenerationTask>()

export const saveGenerationTask = (task: GenerationTask): void => {
  generationTasks.set(task.taskId, task)
}

export const getGenerationTask = (
  taskId: string,
): GenerationTask | undefined => generationTasks.get(taskId)
