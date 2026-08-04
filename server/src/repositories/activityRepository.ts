/** 操作日志 Repository：按用户写入与读取最近活动，不承担图片或任务业务修改。 */
import { randomUUID } from 'node:crypto'
import { getDatabasePool } from '../database/database.js'
import type { ActivityAction, UserActivity } from '../types/activity.js'

interface UserActivityRow {
  id: string
  action: ActivityAction
  generation_task_id: string | null
  resource_label: string | null
  created_at: Date
}

interface RecordUserActivityInput {
  userId: string
  action: ActivityAction
  taskId?: string
  resourceLabel?: string
}

/** 写入一条已完成用户操作的安全摘要；调用方决定日志失败是否影响主业务。 */
export const recordUserActivity = async ({
  userId,
  action,
  taskId,
  resourceLabel,
}: RecordUserActivityInput): Promise<void> => {
  await getDatabasePool().query(
    `INSERT INTO activity_logs (id, user_id, action, generation_task_id, resource_label)
     VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), userId, action, taskId ?? null, resourceLabel ?? null],
  )
}

/** 仅读取当前用户最近活动，限制条数以避免个人中心成为完整审计列表接口。 */
export const listRecentActivitiesForUser = async (
  userId: string,
  limit: number,
): Promise<UserActivity[]> => {
  const result = await getDatabasePool().query<UserActivityRow>(
    `SELECT id, action, generation_task_id, resource_label, created_at
     FROM activity_logs
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [userId, limit],
  )

  return result.rows.map((activity) => ({
    id: activity.id,
    action: activity.action,
    ...(activity.generation_task_id === null ? {} : { taskId: activity.generation_task_id }),
    ...(activity.resource_label === null ? {} : { resourceLabel: activity.resource_label }),
    createdAt: activity.created_at.toISOString(),
  }))
}
