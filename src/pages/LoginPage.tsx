/** 登录与注册入口：根据当前模式调用共享认证上下文，不直接处理令牌存储。 */
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/authStore'

export function LoginPage() {
  const { user, login, register } = useAuth()
  const navigate = useNavigate()
  const [isRegistering, setIsRegistering] = useState(false)
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  if (user) return <Navigate to="/create" replace />
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setIsSubmitting(true); setError(null)
    try { if (isRegistering) await register(email, displayName, password); else await login(email, password); navigate('/create', { replace: true }) }
    catch (cause: unknown) { setError(cause instanceof Error ? cause.message : '账号操作失败') }
    finally { setIsSubmitting(false) }
  }
  return <main className="auth-page"><form className="auth-card" onSubmit={submit}><h2>{isRegistering ? '创建本地账号' : '登录 AIGC Creative Studio'}</h2>
    {isRegistering && <label>昵称<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required /></label>}
    <label>邮箱<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
    <label>密码<input type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
    {error && <p role="alert" className="auth-error">{error}</p>}
    <button type="submit" disabled={isSubmitting}>{isSubmitting ? '处理中...' : isRegistering ? '注册并登录' : '登录'}</button>
    <button type="button" className="auth-switch" onClick={() => setIsRegistering((value) => !value)}>{isRegistering ? '已有账号？去登录' : '没有账号？创建本地账号'}</button>
  </form></main>
}
