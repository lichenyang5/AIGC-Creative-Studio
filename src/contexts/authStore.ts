/** 认证上下文的无副作用定义与消费 Hook，Provider 实现在 AuthContext.tsx。 */
import { createContext, useContext } from 'react'

export interface AuthUser { id: string; email: string; displayName: string }
export interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, displayName: string, password: string) => Promise<void>
  logout: () => void
}
export const AuthContext = createContext<AuthContextValue | null>(null)
export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
