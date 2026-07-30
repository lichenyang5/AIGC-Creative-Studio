import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { createApiUrl } from '../config/api'
import type { HealthCheckResponse, ServiceStatus } from '../types/health'
import { Header } from './Header'

export function AppLayout() {
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus>('checking')

  useEffect(() => {
    let isMounted = true

    const checkHealth = async () => {
      if (isMounted) {
        setServiceStatus('checking')
      }

      try {
        const response = await fetch(createApiUrl('/api/health'))
        const data = (await response.json()) as HealthCheckResponse

        if (isMounted) {
          setServiceStatus(response.ok && data.success ? 'connected' : 'disconnected')
        }
      } catch {
        if (isMounted) {
          setServiceStatus('disconnected')
        }
      }
    }

    const handleWindowFocus = () => {
      void checkHealth()
    }

    void checkHealth()
    window.addEventListener('focus', handleWindowFocus)

    return () => {
      isMounted = false
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [])

  return (
    <div className="app-shell">
      <Header serviceStatus={serviceStatus} />
      <Outlet />
    </div>
  )
}
