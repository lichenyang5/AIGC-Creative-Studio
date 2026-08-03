import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/authStore'
export function RequireAuth() {
  const { user } = useAuth(); const location = useLocation()
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: location.pathname }} />
}
