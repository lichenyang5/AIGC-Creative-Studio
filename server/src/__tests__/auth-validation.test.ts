import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { app } from '../app.js'

describe('authentication request validation', () => {
  it('rejects invalid registration before querying the database', async () => {
    const response = await request(app).post('/api/auth/register').send({
      email: 'not-an-email',
      displayName: '',
      password: 'short',
    })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ success: false, message: 'Invalid registration request' })
  })

  it('rejects invalid login before querying the database', async () => {
    const response = await request(app).post('/api/auth/login').send({
      email: 'not-an-email',
      password: '',
    })

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({ success: false, message: 'Invalid login request' })
  })

  it('requires an access token for the current-user endpoint', async () => {
    const response = await request(app).get('/api/auth/me')

    expect(response.status).toBe(401)
    expect(response.body).toMatchObject({ success: false, message: 'Authentication is required' })
  })
})
