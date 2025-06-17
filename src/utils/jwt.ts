import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key'
const JWT_EXPIRY = process.env.JWT_EXPIRY || '15m'
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d'

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

/**
 * Generate access and refresh tokens
 */
export async function generateTokens(payload: any): Promise<TokenPair> {
  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY })
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRY })
  
  return {
    accessToken,
    refreshToken
  }
}

/**
 * Verify access token
 */
export function verifyAccessToken(token: string): any | null {
  try {
    return jwt.verify(token, JWT_SECRET) as any
  } catch (error) {
    return null
  }
}

/**
 * Verify refresh token
 */
export function verifyRefreshToken(token: string): any | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as any
  } catch (error) {
    return null
  }
} 