import jwt from 'jsonwebtoken'

export interface AuthTokenPayload {
  sub: string
  email: string
}

const getJwtSecret = (): string => {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters')
  }

  return secret
}

export const createAuthToken = (payload: AuthTokenPayload): string =>
  jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' })

export const verifyAuthToken = (token: string): AuthTokenPayload | null => {
  try {
    const decoded = jwt.verify(token, getJwtSecret())
    if (
      typeof decoded === 'object' &&
      decoded !== null &&
      typeof decoded.sub === 'string' &&
      typeof decoded.email === 'string'
    ) {
      return { sub: decoded.sub, email: decoded.email }
    }
  } catch {
    return null
  }

  return null
}
