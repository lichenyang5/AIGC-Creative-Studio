export interface HealthCheckResponse {
  success: boolean
  message: string
}

export type ServiceStatus = 'checking' | 'online' | 'offline'
