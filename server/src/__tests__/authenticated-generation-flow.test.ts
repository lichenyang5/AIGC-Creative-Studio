import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.ENABLE_REAL_GENERATION = 'false'
  process.env.JWT_SECRET = 'authenticated-generation-flow-test-secret-at-least-32-characters'
})

interface DatabaseUserRow {
  id: string
  email: string
  display_name: string
  password_hash: string
}

const databaseMocks = vi.hoisted(() => ({
  queryDatabase: vi.fn(),
}))

const activityRepositoryMocks = vi.hoisted(() => ({
  listRecentActivitiesForUser: vi.fn(async () => []),
  recordUserActivity: vi.fn<(input: unknown) => Promise<void>>(),
}))

const repositoryMocks = vi.hoisted(() => ({
  deleteGenerationTaskFromPostgres: vi.fn(async () => undefined),
  failInterruptedProcessingTasks: vi.fn(async () => 0),
  findGenerationTaskForUser: vi.fn(),
  getGenerationSummaryForUser: vi.fn(async () => ({
    totalTasks: 0,
    succeededTasks: 0,
    failedTasks: 0,
    pendingTasks: 0,
    processingTasks: 0,
    imageCount: 0,
  })),
  isStoredImageOwnedByUser: vi.fn(async () => false),
  listGenerationTasksForUser: vi.fn(),
  saveGenerationTaskToPostgres: vi.fn<(task: unknown) => Promise<void>>(),
}))

vi.mock('../database/database.js', () => databaseMocks)
vi.mock('../repositories/activityRepository.js', () => activityRepositoryMocks)
vi.mock('../repositories/postgresGenerationRepository.js', () => repositoryMocks)

import { app } from '../app.js'
import type { GenerationTask } from '../types/generation.js'

const users: DatabaseUserRow[] = []
const tasks: GenerationTask[] = []

const createUserQueryResult = (rows: DatabaseUserRow[]) => ({ rows })

const isGenerationTask = (value: unknown): value is GenerationTask =>
  typeof value === 'object'
  && value !== null
  && 'taskId' in value
  && typeof value.taskId === 'string'
  && 'status' in value
  && typeof value.status === 'string'

describe('authenticated generation flow', () => {
  beforeEach(() => {
    users.length = 0
    tasks.length = 0

    databaseMocks.queryDatabase.mockImplementation(async (text: string, values: unknown[] = []) => {
      if (text.startsWith('INSERT INTO users')) {
        const [id, email, displayName, passwordHash] = values
        users.push({
          id: String(id),
          email: String(email),
          display_name: String(displayName),
          password_hash: String(passwordHash),
        })
        return createUserQueryResult([])
      }

      if (text.startsWith('SELECT id, email, display_name, password_hash FROM users')) {
        const email = String(values[0])
        return createUserQueryResult(users.filter((user) => user.email === email))
      }

      if (text.startsWith('SELECT id, email, display_name FROM users')) {
        const userId = String(values[0])
        return createUserQueryResult(users.filter((user) => user.id === userId))
      }

      throw new Error(`Unexpected database query: ${text}`)
    })

    repositoryMocks.saveGenerationTaskToPostgres.mockImplementation(async (task: unknown) => {
      if (!isGenerationTask(task)) {
        throw new Error('Expected a generation task to be persisted')
      }

      const taskIndex = tasks.findIndex((item) => item.taskId === task.taskId)
      if (taskIndex === -1) {
        tasks.push(task)
      } else {
        tasks[taskIndex] = task
      }
    })
    repositoryMocks.findGenerationTaskForUser.mockImplementation(
      async (taskId: string, userId: string) =>
        tasks.find((task) => task.taskId === taskId && task.userId === userId),
    )
    repositoryMocks.listGenerationTasksForUser.mockImplementation(
      async (userId: string) => tasks.filter((task) => task.userId === userId),
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('registers, logs in, creates a task, and prevents another user from reading it', async () => {
    const firstUser = request.agent(app)
    const secondUser = request.agent(app)

    const firstRegistration = await firstUser.post('/api/auth/register').send({
      email: 'first-flow@example.test',
      displayName: '第一位用户',
      password: 'safe-password-123',
    })
    expect(firstRegistration.status).toBe(201)

    const firstLogin = await firstUser.post('/api/auth/login').send({
      email: 'first-flow@example.test',
      password: 'safe-password-123',
    })
    expect(firstLogin.status).toBe(200)
    expect(firstLogin.headers['set-cookie']).toBeDefined()

    const createTaskResponse = await firstUser.post('/api/generations').send({
      prompt: '一座雨夜未来城市',
      aspectRatio: '1:1',
      count: 1,
      style: 'cyberpunk',
    })
    expect(createTaskResponse.status).toBe(202)
    expect(createTaskResponse.body.data).toMatchObject({ status: 'pending' })
    expect(activityRepositoryMocks.recordUserActivity).toHaveBeenCalledWith(expect.objectContaining({
      action: 'generation_created',
      userId: firstRegistration.body.data.user.id,
    }))

    const taskId = String(createTaskResponse.body.data.taskId)
    const taskDetailResponse = await firstUser.get(`/api/generations/${taskId}`)
    expect(taskDetailResponse.status).toBe(200)
    expect(taskDetailResponse.body.data).toMatchObject({
      taskId,
      request: { prompt: '一座雨夜未来城市' },
    })
    expect(taskDetailResponse.body.data).not.toHaveProperty('userId')

    const secondRegistration = await secondUser.post('/api/auth/register').send({
      email: 'second-flow@example.test',
      displayName: '第二位用户',
      password: 'safe-password-456',
    })
    expect(secondRegistration.status).toBe(201)

    const forbiddenTaskResponse = await secondUser.get(`/api/generations/${taskId}`)
    expect(forbiddenTaskResponse.status).toBe(404)
    expect(forbiddenTaskResponse.body).toMatchObject({
      success: false,
      message: 'Generation task not found',
    })
  })
})
