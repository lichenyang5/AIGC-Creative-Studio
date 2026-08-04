import { randomUUID } from 'node:crypto'
import { access, readdir } from 'node:fs/promises'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.ENABLE_REAL_GENERATION = 'false'
  process.env.JWT_SECRET = 'generation-read-test-secret-at-least-32-characters'
})

const repositoryMocks = vi.hoisted(() => ({
  deleteGenerationTaskFromPostgres: vi.fn(async () => undefined),
  findGenerationTaskForUser: vi.fn(async () => undefined),
  getGenerationSummaryForUser: vi.fn(async () => ({
    totalTasks: 0,
    succeededTasks: 0,
    failedTasks: 0,
    pendingTasks: 0,
    processingTasks: 0,
    imageCount: 0,
  })),
  isStoredImageOwnedByUser: vi.fn(async () => false),
  listGenerationTasksForUser: vi.fn(async () => []),
  saveGenerationTaskToPostgres: vi.fn(async () => undefined),
}))

vi.mock('../repositories/postgresGenerationRepository.js', () => repositoryMocks)

import { app } from '../app.js'
import { createAuthToken } from '../auth/token.js'

interface QueryError {
  field: string
  message: string
}

interface QueryErrorResponse {
  success: false
  message: 'Invalid query parameters'
  errors: QueryError[]
}

interface TestResponse {
  status: number
  headers: { 'content-type'?: string }
  body: unknown
}

const imagesDirectory = new URL('../../storage/images', import.meta.url)
const missingTaskId = randomUUID()
let originalImageFilenames: string[] = []
let imagesDirectoryExisted = false

const assertQueryError = (response: TestResponse): QueryErrorResponse => {
  expect(response.status).toBe(400)
  expect(response.headers['content-type']).toContain('application/json')
  const body = response.body as QueryErrorResponse
  expect(body.success).toBe(false)
  expect(body.message).toBe('Invalid query parameters')
  expect(Array.isArray(body.errors)).toBe(true)
  return body
}

const expectErrorFields = (body: QueryErrorResponse, fields: string[]) => {
  const returnedFields = body.errors.map((error) => error.field)
  for (const field of fields) expect(returnedFields).toContain(field)
}

describe('generation read endpoints', () => {
  const authorization = `Bearer ${createAuthToken({
    sub: '00000000-0000-4000-8000-000000000002',
    email: 'reader@example.test',
  })}`

  beforeAll(async () => {
    try {
      originalImageFilenames = (await readdir(imagesDirectory)).sort()
      imagesDirectoryExisted = true
    } catch {
      originalImageFilenames = []
      imagesDirectoryExisted = false
    }
  })

  afterAll(async () => {
    if (imagesDirectoryExisted) {
      await expect(readdir(imagesDirectory)).resolves.toEqual(originalImageFilenames)
    } else {
      await expect(access(imagesDirectory)).rejects.toMatchObject({ code: 'ENOENT' })
    }
  })

  it.each([
    ['limit=0', 'limit'],
    ['limit=51', 'limit'],
    ['limit=abc', 'limit'],
    ['offset=-1', 'offset'],
    ['offset=1.5', 'offset'],
    ['status=unknown', 'status'],
  ])('rejects invalid query parameter %s', async (query, field) => {
    const response = await request(app).get(`/api/generations?${query}`).set('Authorization', authorization)
    expectErrorFields(assertQueryError(response), [field])
  })

  it('returns every invalid field in a combined query', async () => {
    const response = await request(app).get(
      '/api/generations?status=unknown&limit=100&offset=-1',
    ).set('Authorization', authorization)
    expectErrorFields(assertQueryError(response), ['status', 'limit', 'offset'])
  })

  it('returns the default history response without modifying data', async () => {
    const response = await request(app).get('/api/generations').set('Authorization', authorization)
    const body = response.body as {
      success: boolean
      data: { items: unknown[]; total: number; limit: number; offset: number; hasMore: boolean }
    }

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data.items)).toBe(true)
    expect(Number.isInteger(body.data.total)).toBe(true)
    expect(body.data.total).toBeGreaterThanOrEqual(0)
    expect(body.data.limit).toBe(20)
    expect(body.data.offset).toBe(0)
    expect(typeof body.data.hasMore).toBe('boolean')
  })

  it('returns 404 for a missing task and its image resources', async () => {
    const taskResponse = await request(app).get(`/api/generations/${missingTaskId}`).set('Authorization', authorization)
    expect(taskResponse.status).toBe(404)
    expect((taskResponse.body as { success: boolean }).success).toBe(false)
    expect((taskResponse.body as { message: string }).message).toMatch(/not found/i)

    const downloadResponse = await request(app).get(
      `/api/generations/${missingTaskId}/images/0/download`,
    ).set('Authorization', authorization)
    expect(downloadResponse.status).toBe(404)
    expect((downloadResponse.body as { success: boolean }).success).toBe(false)

    const deleteResponse = await request(app).delete(`/api/generations/${missingTaskId}/images/0`).set('Authorization', authorization)
    expect(deleteResponse.status).toBe(404)
    expect((deleteResponse.body as { success: boolean }).success).toBe(false)
  })
})
