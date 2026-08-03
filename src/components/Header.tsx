/** 顶部导航：显示当前路由、服务状态和用户会话入口。 */
import { NavLink } from 'react-router-dom'
import { useAuth } from '../contexts/authStore'
import type { ServiceStatus } from '../types/health'

interface HeaderProps {
  serviceStatus: ServiceStatus
}

const serviceStatusText: Record<ServiceStatus, string> = {
  checking: '服务检测中',
  connected: '服务正常',
  disconnected: '服务未连接',
}

export function Header({ serviceStatus }: HeaderProps) {
  const { user, logout } = useAuth()
  return (
    <header className="app-header">
      <div className="header-content">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 3.5l1.45 4.05L17.5 9l-4.05 1.45L12 14.5l-1.45-4.05L6.5 9l4.05-1.45L12 3.5zM18.5 14l.75 2.25L21.5 17l-2.25.75L18.5 20l-.75-2.25L15.5 17l2.25-.75L18.5 14zM5.5 13l.65 1.85L8 15.5l-1.85.65L5.5 18l-.65-1.85L3 15.5l1.85-.65L5.5 13z"
                fill="currentColor"
              />
            </svg>
          </span>
          <div className="brand-copy">
            <h1>AIGC Creative Studio</h1>
            <p>AI 图片创作工作台</p>
          </div>
        </div>

        <nav className="header-navigation" aria-label="主导航">
          <NavLink
            className={({ isActive }) =>
              `header-nav-link${isActive ? ' is-active' : ''}`
            }
            to="/create"
          >
            图片创作
          </NavLink>
          <NavLink
            className={({ isActive }) =>
              `header-nav-link${isActive ? ' is-active' : ''}`
            }
            to="/library"
          >
            生成库
          </NavLink>
        </nav>

        <div className="header-actions">
          {user && (
            <div className="header-user-controls">
              <span className="header-user-name">{user.displayName}</span>
              <button className="header-logout-button" type="button" onClick={logout}>
                退出
              </button>
            </div>
          )}
          <p className={`service-status is-${serviceStatus}`} role="status">
            <span className="service-status-dot" aria-hidden="true" />
            {serviceStatusText[serviceStatus]}
          </p>
        </div>
      </div>
    </header>
  )
}
