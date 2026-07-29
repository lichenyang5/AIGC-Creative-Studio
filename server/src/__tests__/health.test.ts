import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.ENABLE_REAL_GENERATION = 'false'
})

import { app } from '../app.js'

describe('GET /api/health', () => {
  it('returns the API health response', async () => {
    const response = await request(app).get('/api/health')

    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toContain('application/json')
    expect(response.body.success).toBe(true)
    expect(response.body.message).toBe('AIGC Creative Studio API is running')
  })
})
