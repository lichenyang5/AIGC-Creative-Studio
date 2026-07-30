import { access, readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.ENABLE_REAL_GENERATION = 'false'
})

import { app } from '../app.js'

interface ValidationError {
  field: string
  message: string
}

interface ValidationErrorResponse {
  success: false
  message: 'Invalid generation request'
  errors: ValidationError[]
}

interface TestResponse {
  status: number
  headers: {
    'content-type'?: string
  }
  body: unknown
}

const currentDirectory = dirname(fileURLToPath(import.meta.url))
const generationsFilePath = resolve(currentDirectory, '../../data/generations.json')
let originalGenerationsContents: string | null = null

const assertValidationResponse = (
  response: TestResponse,
): ValidationErrorResponse => {
  expect(response.status).toBe(400)
  expect(response.headers['content-type']).toContain('application/json')

  const body = response.body as ValidationErrorResponse
  expect(body.success).toBe(false)
  expect(body.message).toBe('Invalid generation request')
  expect(Array.isArray(body.errors)).toBe(true)

  for (const error of body.errors) {
    expect(error).toEqual(
      expect.objectContaining({
        field: expect.any(String),
        message: expect.any(String),
      }),
    )
  }

  return body
}

const expectErrorFields = (body: ValidationErrorResponse, fields: string[]) => {
  const returnedFields = body.errors.map((error) => error.field)

  for (const field of fields) {
    expect(returnedFields).toContain(field)
  }
}

describe('POST /api/generations validation', () => {
  beforeAll(async () => {
    try {
      originalGenerationsContents = await readFile(generationsFilePath, 'utf8')
    } catch {
      originalGenerationsContents = null
    }
  })

  afterAll(async () => {
    if (originalGenerationsContents === null) {
      await expect(access(generationsFilePath)).rejects.toMatchObject({
        code: 'ENOENT',
      })
      return
    }

    await expect(readFile(generationsFilePath, 'utf8')).resolves.toBe(
      originalGenerationsContents,
    )
  })

  it('rejects an empty prompt', async () => {
    const response = await request(app).post('/api/generations').send({
      prompt: '',
      aspectRatio: '1:1',
      count: 1,
      style: 'realistic',
    })

    expectErrorFields(assertValidationResponse(response), ['prompt'])
  })

  it('rejects a whitespace-only prompt', async () => {
    const response = await request(app).post('/api/generations').send({
      prompt: '   ',
      aspectRatio: '1:1',
      count: 1,
      style: 'realistic',
    })

    expectErrorFields(assertValidationResponse(response), ['prompt'])
  })

  it('rejects an invalid aspect ratio', async () => {
    const response = await request(app).post('/api/generations').send({
      prompt: '测试图片',
      aspectRatio: '2:1',
      count: 1,
      style: 'realistic',
    })

    expectErrorFields(assertValidationResponse(response), ['aspectRatio'])
  })

  it('rejects an invalid count', async () => {
    const response = await request(app).post('/api/generations').send({
      prompt: '测试图片',
      aspectRatio: '1:1',
      count: 3,
      style: 'realistic',
    })

    expectErrorFields(assertValidationResponse(response), ['count'])
  })

  it('rejects an invalid style', async () => {
    const response = await request(app).post('/api/generations').send({
      prompt: '测试图片',
      aspectRatio: '1:1',
      count: 1,
      style: 'unknown',
    })

    expectErrorFields(assertValidationResponse(response), ['style'])
  })

  it('rejects a fractional seed', async () => {
    const response = await request(app).post('/api/generations').send({
      prompt: '测试图片',
      aspectRatio: '1:1',
      count: 1,
      style: 'realistic',
      seed: 1.5,
    })

    expectErrorFields(assertValidationResponse(response), ['seed'])
  })

  it('rejects a negative seed', async () => {
    const response = await request(app).post('/api/generations').send({
      prompt: '测试图片',
      aspectRatio: '1:1',
      count: 1,
      style: 'realistic',
      seed: -1,
    })

    expectErrorFields(assertValidationResponse(response), ['seed'])
  })

  it('returns every invalid field in a combined invalid request', async () => {
    const response = await request(app).post('/api/generations').send({
      prompt: '',
      aspectRatio: '2:1',
      count: 3,
      style: 'unknown',
    })

    const body = assertValidationResponse(response)
    expectErrorFields(body, ['prompt', 'aspectRatio', 'count', 'style'])
  })
})
