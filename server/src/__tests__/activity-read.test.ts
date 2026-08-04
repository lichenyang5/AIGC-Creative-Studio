import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  process.env.JWT_SECRET = 'activity-read-test-secret-at-least-32-characters'
})

const activityRepositoryMocks = vi.hoisted(() => ({
  listRecentActivitiesForUser: vi.fn(),
  recordUserActivity: vi.fn<(input: unknown) => Promise<void>>(),
}))

vi.mock('../repositories/activityRepository.js', () => activityRepositoryMocks)

import { app } from '../app.js'
import { createAuthToken } from '../auth/token.js'

const userId = '00000000-0000-4000-8000-000000000077'
const authorization = `Bearer ${createAuthToken({ sub: userId, email: 'activity@example.test' })}`

afterEach(() => {
  vi.clearAllMocks()
})

describe('recent activities', () => {
  it('returns only the authenticated user recent activity records', async () => {
    activityRepositoryMocks.listRecentActivitiesForUser.mockResolvedValueOnce([
      {
        id: '00000000-0000-4000-8000-000000000088',
        action: 'image_edited_saved',
        taskId: '00000000-0000-4000-8000-000000000099',
        resourceLabel: '保存编辑作品（图片 2）',
        createdAt: '2026-08-04T12:00:00.000Z',
      },
    ])

    const response = await request(app)
      .get('/api/activity-logs')
      .set('Authorization', authorization)

    expect(response.status).toBe(200)
    expect(activityRepositoryMocks.listRecentActivitiesForUser).toHaveBeenCalledWith(userId, 8)
    expect(response.body).toEqual({
      success: true,
      data: {
        items: [
          {
            id: '00000000-0000-4000-8000-000000000088',
            action: 'image_edited_saved',
            taskId: '00000000-0000-4000-8000-000000000099',
            resourceLabel: '保存编辑作品（图片 2）',
            createdAt: '2026-08-04T12:00:00.000Z',
          },
        ],
      },
    })
  })
})
