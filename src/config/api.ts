/** 前端唯一的后端地址入口，避免路由页面把相对 URL 解析为 /create/api/...。 */
const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
const apiBaseUrl = (configuredApiBaseUrl || 'http://localhost:3001').replace(/\/+$/, '')
const authSessionKey = 'aigc-auth-session'

export function createApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${apiBaseUrl}${normalizedPath}`
}

export function createAuthHeaders(headers: HeadersInit = {}): HeadersInit {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(authSessionKey) ?? 'null')
    if (
      typeof value === 'object'
      && value !== null
      && 'token' in value
      && typeof value.token === 'string'
      && value.token.length > 0
    ) {
      return { ...headers, Authorization: `Bearer ${value.token}` }
    }
  } catch {
    // A malformed session is handled by the protected route on the next render.
  }

  return headers
}
