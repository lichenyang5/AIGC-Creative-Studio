import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.ENABLE_REAL_GENERATION = 'false'
  process.env.JWT_SECRET = 'generation-ownership-test-secret-at-least-32-characters'
})

const repositoryMocks = vi.hoisted(() => ({
  deleteGenerationTaskFromPostgres: vi.fn(async () => undefined),
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
  saveGenerationTaskToPostgres: vi.fn(async () => undefined),
}))

vi.mock('../repositories/postgresGenerationRepository.js', () => repositoryMocks)

import { app } from '../app.js'
import { createAuthToken } from '../auth/token.js'
import type { GenerationTask } from '../types/generation.js'

const firstUserId = '00000000-0000-4000-8000-000000000011'
const secondUserId = '00000000-0000-4000-8000-000000000022'
const firstAuthorization = `Bearer ${createAuthToken({ sub: firstUserId, email: 'first@example.test' })}`
const secondAuthorization = `Bearer ${createAuthToken({ sub: secondUserId, email: 'second@example.test' })}`

const createTask = (taskId: string, userId: string): GenerationTask => ({
  taskId,
  userId,
  status: 'succeeded',
  request: {
    prompt: `task ${taskId}`,
    aspectRatio: '1:1',
    count: 1,
    style: 'realistic',
  },
  createdAt: '2026-08-03T00:00:00.000Z',
  result: { images: [] },
})

describe('generation ownership', () => {
  beforeEach(() => {
    const tasks = [
      createTask('00000000-0000-4000-8000-000000000101', firstUserId),
      createTask('00000000-0000-4000-8000-000000000202', secondUserId),
    ]
    repositoryMocks.listGenerationTasksForUser.mockImplementation(async (userId: string) =>
      tasks.filter((task) => task.userId === userId),
    )
    repositoryMocks.findGenerationTaskForUser.mockImplementation(
      async (taskId: string, userId: string) =>
        tasks.find((task) => task.taskId === taskId && task.userId === userId),
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('lists only the authenticated user’s tasks', async () => {
    const response = await request(app)
      .get('/api/generations')
      .set('Authorization', firstAuthorization)

    expect(response.status).toBe(200)
    expect(response.body.data.items).toHaveLength(1)
    expect(response.body.data.items[0]).toMatchObject({
      taskId: '00000000-0000-4000-8000-000000000101',
    })
    expect(response.body.data.items[0]).not.toHaveProperty('userId')
  })

  it('does not expose another user’s task detail', async () => {
    const response = await request(app)
      .get('/api/generations/00000000-0000-4000-8000-000000000101')
      .set('Authorization', secondAuthorization)

    expect(response.status).toBe(404)
    expect(response.body).toMatchObject({
      success: false,
      message: 'Generation task not found',
    })
  })

  it('requires authentication before serving a stored image', async () => {
    const response = await request(app).get('/api/images/not-an-accessible-image.png')

    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({
      success: false,
      message: 'Authentication is required',
    })
  })
})
