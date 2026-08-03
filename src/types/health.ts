export interface HealthCheckResponse {
  success: boolean
  message: string
}

/** 公共导航栏展示的后端连通性状态。 */
export type ServiceStatus = 'checking' | 'connected' | 'disconnected'
