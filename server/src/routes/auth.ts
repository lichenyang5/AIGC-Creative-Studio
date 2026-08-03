/** 认证路由：注册与登录只返回安全的用户展示信息，认证令牌通过 HttpOnly Cookie 交给浏览器。 */
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { Router, type Response } from 'express'
import { createAuthToken } from '../auth/token.js'
import { queryDatabase } from '../database/database.js'
import { requireAuth, type AuthenticatedRequest } from '../middleware/requireAuth.js'

const authRouter = Router()

const authCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
}

interface UserRow {
  id: string
  email: string
  display_name: string
  password_hash: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

const toUserResponse = (user: Pick<UserRow, 'id' | 'email' | 'display_name'>) => ({
  id: user.id,
  email: user.email,
  displayName: user.display_name,
})

const isAuthConfigurationError = (cause: unknown): boolean =>
  cause instanceof Error && cause.message.startsWith('JWT_SECRET must be configured')

const sendAuthServiceError = (response: Response, cause: unknown, fallbackMessage: string): void => {
  if (isAuthConfigurationError(cause)) {
    response.status(503).json({ success: false, message: 'Authentication service is not configured' })
    return
  }

  response.status(500).json({ success: false, message: fallbackMessage })
}

authRouter.post('/register', async (request, response) => {
  const body: unknown = request.body
  if (!isRecord(body)) {
    response.status(400).json({ success: false, message: 'Invalid registration request' })
    return
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!isValidEmail(email) || displayName.length < 1 || displayName.length > 100 || password.length < 8 || password.length > 72) {
    response.status(400).json({ success: false, message: 'Invalid registration request' })
    return
  }

  try {
    const userId = randomUUID()
    // Validate local token configuration before creating a durable user.
    const token = createAuthToken({ sub: userId, email })
    const passwordHash = await bcrypt.hash(password, 12)
    const user: UserRow = {
      id: userId,
      email,
      display_name: displayName,
      password_hash: passwordHash,
    }
    await queryDatabase(
      'INSERT INTO users (id, email, display_name, password_hash) VALUES ($1, $2, $3, $4)',
      [user.id, user.email, user.display_name, user.password_hash],
    )
    response
      .cookie('aigc_access_token', token, authCookieOptions)
      .status(201)
      .json({ success: true, data: { user: toUserResponse(user), token } })
  } catch (cause: unknown) {
    if (isRecord(cause) && cause.code === '23505') {
      response.status(409).json({ success: false, message: 'Email is already registered' })
      return
    }
    sendAuthServiceError(response, cause, 'Unable to register user')
  }
})

authRouter.post('/login', async (request, response) => {
  const body: unknown = request.body
  const email = isRecord(body) && typeof body.email === 'string'
    ? body.email.trim().toLowerCase()
    : ''
  const password = isRecord(body) && typeof body.password === 'string' ? body.password : ''
  if (!isValidEmail(email) || password.length === 0) {
    response.status(400).json({ success: false, message: 'Invalid login request' })
    return
  }

  try {
    const result = await queryDatabase<UserRow>(
      'SELECT id, email, display_name, password_hash FROM users WHERE email = $1',
      [email],
    )
    const user = result.rows[0]
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      response.status(401).json({ success: false, message: 'Invalid email or password' })
      return
    }
    const token = createAuthToken({ sub: user.id, email: user.email })
    response
      .cookie('aigc_access_token', token, authCookieOptions)
      .status(200)
      .json({ success: true, data: { user: toUserResponse(user), token } })
  } catch (cause: unknown) {
    sendAuthServiceError(response, cause, 'Unable to log in')
  }
})

authRouter.post('/logout', (_request, response) => {
  response.clearCookie('aigc_access_token', { path: '/' }).status(204).end()
})

authRouter.get('/me', requireAuth, async (request: AuthenticatedRequest, response) => {
  const authUser = request.authUser
  if (!authUser) {
    response.status(401).json({ success: false, message: 'Authentication is required' })
    return
  }

  try {
    const result = await queryDatabase<Pick<UserRow, 'id' | 'email' | 'display_name'>>(
      'SELECT id, email, display_name FROM users WHERE id = $1',
      [authUser.sub],
    )
    const user = result.rows[0]
    if (!user) {
      response.status(401).json({ success: false, message: 'Authentication is required' })
      return
    }
    response.status(200).json({ success: true, data: { user: toUserResponse(user) } })
  } catch {
    response.status(500).json({ success: false, message: 'Unable to load current user' })
  }
})

export { authRouter }
