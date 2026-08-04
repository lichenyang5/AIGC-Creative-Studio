/** 个人中心最近活动的前端接口类型，只消费后端公开的安全操作摘要。 */
export type ActivityAction =
  | 'generation_created'
  | 'image_edited_saved'
  | 'image_deleted'
  | 'generation_deleted'

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
