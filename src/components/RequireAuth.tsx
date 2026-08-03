/** 路由守卫：未登录时保留原目标地址，登录成功后可返回原页面。 */
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/authStore'
export function RequireAuth() {
  const { user } = useAuth(); const location = useLocation()
  return user ? <Outlet /> : <Navigate to="/login" replace state={{ from: location.pathname }} />
}
