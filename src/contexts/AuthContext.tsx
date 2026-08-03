/** 认证会话 Provider：只保存当前用户展示信息，令牌由 HttpOnly Cookie 与会话存储协同处理。 */
import { useCallback, useMemo, useState, type PropsWithChildren } from 'react'
import { createApiUrl } from '../config/api'
import { AuthContext, type AuthUser, type AuthContextValue } from './authStore'

interface AuthResponse {
  success: true
  data: {
    user: AuthUser
    token: string
  }
}

const sessionKey = 'aigc-auth-session'
const activeGenerationSessionKey = 'aigc-active-generation-session'

const isAuthResponse = (value: unknown): value is AuthResponse => {
  if (
    typeof value !== 'object'
    || value === null
    || !('success' in value)
    || value.success !== true
    || !('data' in value)
  ) {
    return false
  }

  const { data } = value

  return typeof data === 'object'
    && data !== null
    && 'token' in data
    && typeof data.token === 'string'
    && 'user' in data
    && typeof data.user === 'object'
    && data.user !== null
    && 'id' in data.user
    && typeof data.user.id === 'string'
    && 'email' in data.user
    && typeof data.user.email === 'string'
    && 'displayName' in data.user
    && typeof data.user.displayName === 'string'
}

const getAuthErrorMessage = (value: unknown, status: number): string => {
  if (
    typeof value === 'object'
    && value !== null
    && 'message' in value
    && typeof value.message === 'string'
  ) {
    return value.message
  }

  return `账号请求失败（HTTP ${status}）`
}

const readSession = (): { user: AuthUser; token: string } | null => {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(sessionKey) ?? 'null')
    if (typeof value === 'object' && value !== null && 'user' in value && 'token' in value) {
      const { user, token } = value as { user: AuthUser; token: string }
      return typeof token === 'string' && typeof user?.id === 'string' ? { user, token } : null
    }
  } catch {
    // Ignore invalid browser session data.
  }

  return null
}

export function AuthProvider({ children }: PropsWithChildren) {
  const initialSession = readSession()
  const [session, setSession] = useState<{ user: AuthUser; token: string } | null>(initialSession)

  const authenticate = useCallback(async (path: string, body: Record<string, string>) => {
    const response = await fetch(createApiUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'include',
    })
    const data: unknown = await response.json().catch(() => null)

    if (!response.ok || !isAuthResponse(data)) {
      throw new Error(getAuthErrorMessage(data, response.status))
    }

    const nextSession = data.data
    sessionStorage.setItem(sessionKey, JSON.stringify(nextSession))
    setSession(nextSession)
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    token: session?.token ?? null,
    login: (email, password) => authenticate('/api/auth/login', { email, password }),
    register: (email, displayName, password) => authenticate('/api/auth/register', { email, displayName, password }),
    logout: () => {
      void fetch(createApiUrl('/api/auth/logout'), {
        method: 'POST',
        credentials: 'include',
      })
      sessionStorage.removeItem(sessionKey)
      sessionStorage.removeItem(activeGenerationSessionKey)
      setSession(null)
    },
  }), [authenticate, session])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
