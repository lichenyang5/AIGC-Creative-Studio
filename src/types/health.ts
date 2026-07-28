export interface HealthCheckResponse {
  success: boolean
  message: string
}

export type ServiceStatus = 'checking' | 'connected' | 'disconnected'
