const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()
const apiBaseUrl = (configuredApiBaseUrl || 'http://localhost:3001').replace(/\/+$/, '')

export function createApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${apiBaseUrl}${normalizedPath}`
}
