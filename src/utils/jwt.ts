import jwt from 'jsonwebtoken'
import { JWTPayload, RefreshTokenPayload } from '../types/auth'

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-jwt-secret'
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'fallback-refresh-secret'

// Access token expires in 15 minutes
const ACCESS_TOKEN_EXPIRY = '15m'
// Refresh token expires in 7 days
const REFRESH_TOKEN_EXPIRY = '7d'

export async function generateTokens(payload: Omit<JWTPayload, 'iat' | 'exp'>) {
  // Generate access token
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY })

  // Generate refresh token
  const refreshToken = jwt.sign({ userId: payload.userId }, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY })

  return {
    accessToken,
    refreshToken
  }
}

export async function verifyAccessToken(token: string): Promise<JWTPayload | null> {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JWTPayload
    return payload
  } catch (error) {
    console.error('Access token verification failed:', error)
    return null
  }
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload | null> {
  try {
    const payload = jwt.verify(token, REFRESH_TOKEN_SECRET) as RefreshTokenPayload
    return payload
  } catch (error) {
    console.error('Refresh token verification failed:', error)
    return null
  }
} 