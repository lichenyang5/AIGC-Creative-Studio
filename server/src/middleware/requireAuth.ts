import type { NextFunction, Request, Response } from 'express'
import { verifyAuthToken, type AuthTokenPayload } from '../auth/token.js'

export interface AuthenticatedRequest extends Request {
  authUser?: AuthTokenPayload
}

export const requireAuth = (
  request: AuthenticatedRequest,
  response: Response,
  next: NextFunction,
): void => {
  const authorization = request.header('authorization')
  const token = authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : null
  const authUser = token ? verifyAuthToken(token) : null

  if (!authUser) {
    response.status(401).json({ success: false, message: 'Authentication is required' })
    return
  }

  request.authUser = authUser
  next()
}
