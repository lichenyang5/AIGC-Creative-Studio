/** 用户可见的操作日志领域模型：只记录安全动作摘要，不写入 Prompt、密钥或文件绝对路径。 */
export const activityActions = [
  'generation_created',
  'image_edited_saved',
  'image_deleted',
  'generation_deleted',
] as const

export type ActivityAction = (typeof activityActions)[number]

export interface UserActivity {
  id: string
  action: ActivityAction
  taskId?: string
  resourceLabel?: string
  createdAt: string
}

export interface ActivityListResponse {
  success: true
  data: {
    items: UserActivity[]
  }
}
