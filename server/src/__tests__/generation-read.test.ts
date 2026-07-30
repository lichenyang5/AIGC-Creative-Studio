import { randomUUID } from 'node:crypto'
import { access, readFile, readdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.ENABLE_REAL_GENERATION = 'false'
})

import { app } from '../app.js'

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

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const generationsFilePath = resolve(currentDirectory, '../../data/generations.json')
const imagesDirectory = resolve(currentDirectory, '../../storage/images')
const missingTaskId = randomUUID()
let originalGenerations: Buffer | null = null
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
  beforeAll(async () => {
    try {
      originalGenerations = await readFile(generationsFilePath)
    } catch {
      originalGenerations = null
    }
    try {
      originalImageFilenames = (await readdir(imagesDirectory)).sort()
      imagesDirectoryExisted = true
    } catch {
      originalImageFilenames = []
      imagesDirectoryExisted = false
    }
  })

  afterAll(async () => {
    if (originalGenerations === null) {
      await expect(access(generationsFilePath)).rejects.toMatchObject({ code: 'ENOENT' })
    } else {
      await expect(readFile(generationsFilePath)).resolves.toEqual(originalGenerations)
    }
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
    const response = await request(app).get(`/api/generations?${query}`)
    expectErrorFields(assertQueryError(response), [field])
  })

  it('returns every invalid field in a combined query', async () => {
    const response = await request(app).get(
      '/api/generations?status=unknown&limit=100&offset=-1',
    )
    expectErrorFields(assertQueryError(response), ['status', 'limit', 'offset'])
  })

  it('returns the default history response without modifying data', async () => {
    const response = await request(app).get('/api/generations')
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
    const taskResponse = await request(app).get(`/api/generations/${missingTaskId}`)
    expect(taskResponse.status).toBe(404)
    expect((taskResponse.body as { success: boolean }).success).toBe(false)
    expect((taskResponse.body as { message: string }).message).toMatch(/not found/i)

    const downloadResponse = await request(app).get(
      `/api/generations/${missingTaskId}/images/0/download`,
    )
    expect(downloadResponse.status).toBe(404)
    expect((downloadResponse.body as { success: boolean }).success).toBe(false)

    const deleteResponse = await request(app).delete(
      `/api/generations/${missingTaskId}/images/0`,
    )
    expect(deleteResponse.status).toBe(404)
    expect((deleteResponse.body as { success: boolean }).success).toBe(false)
  })
})
