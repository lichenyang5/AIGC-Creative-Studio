import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  BrowserRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
} from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { Header } from './components/Header.tsx'
import { createApiUrl } from './config/api.ts'
import { EditorPage } from './pages/EditorPage.tsx'
import { LibraryPage } from './pages/LibraryPage.tsx'
import type { HealthCheckResponse, ServiceStatus } from './types/health.ts'

function AppLayout() {
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/create" replace />} />
        <Route element={<AppLayout />}>
          <Route path="/create" element={<App />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/editor/:taskId/:imageIndex" element={<EditorPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/create" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
