import type { GenerationTask } from '../types/generation.js'

const generationTasks = new Map<string, GenerationTask>()

export const saveGenerationTask = (task: GenerationTask): void => {
  generationTasks.set(task.taskId, task)
}

export const getGenerationTask = (
  taskId: string,
): GenerationTask | undefined => generationTasks.get(taskId)

export const getAllGenerationTasks = (): GenerationTask[] =>
  Array.from(generationTasks.values())

export const restoreGenerationTasks = (tasks: GenerationTask[]): void => {
  generationTasks.clear()

  for (const task of tasks) {
    generationTasks.set(task.taskId, task)
  }
}

export const updateGenerationTask = (
  taskId: string,
  update: (task: GenerationTask) => GenerationTask,
): GenerationTask | undefined => {
  const currentTask = generationTasks.get(taskId)

  if (!currentTask) {
    return undefined
  }

  const updatedTask = update(currentTask)
  generationTasks.set(taskId, updatedTask)
  return updatedTask
}

export const deleteGenerationTask = (taskId: string): boolean =>
  generationTasks.delete(taskId)
