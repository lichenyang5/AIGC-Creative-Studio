/** API 身份认证中间件：支持 Bearer Token 与 HttpOnly Cookie，并把已验证用户写入请求对象。 */
import type { NextFunction, Request, Response } from 'express'
import { verifyAuthToken, type AuthTokenPayload } from '../auth/token.js'

export interface AuthenticatedRequest<
  Params extends Record<string, string> = Record<string, string>,
> extends Request<Params> {
  authUser?: AuthTokenPayload
}

const getTokenFromCookie = (request: Request): string | null => {
  const cookieHeader = request.header('cookie')
  if (!cookieHeader) return null

  const tokenPart = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('aigc_access_token='))

  return tokenPart ? decodeURIComponent(tokenPart.slice('aigc_access_token='.length)) : null
}

export const requireAuth = (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): void => {
  const authorization = request.header('authorization')
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : getTokenFromCookie(request)
  const authUser = token ? verifyAuthToken(token) : null

  if (!authUser) {
    response.status(401).json({ success: false, message: 'Authentication is required' })
    return
  }

  request.authUser = authUser
  next()
}
