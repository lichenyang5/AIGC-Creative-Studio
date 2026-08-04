/** 最近活动接口：仅返回当前登录用户的安全操作摘要。 */
import { Router } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/requireAuth.js'
import { listRecentActivitiesForUser } from '../repositories/activityRepository.js'
import type { ActivityListResponse } from '../types/activity.js'

const activityRouter = Router()

activityRouter.use(requireAuth)

activityRouter.get('/', async (request: AuthenticatedRequest, response) => {
  const userId = request.authUser?.sub
  if (!userId) {
    response.status(401).json({ success: false, message: 'Authentication is required' })
    return
  }

  try {
    const activityResponse: ActivityListResponse = {
      success: true,
      data: { items: await listRecentActivitiesForUser(userId, 8) },
    }
    response.status(200).json(activityResponse)
  } catch {
    response.status(500).json({ success: false, message: 'Unable to load recent activities' })
  }
})

export { activityRouter }
