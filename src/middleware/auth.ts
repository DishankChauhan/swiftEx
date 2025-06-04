import { verifyAccessToken } from '../utils/jwt'
import { prisma } from '../config/database'

export async function authMiddleware(context: { headers: Record<string, string | undefined> }) {
  const authorization = context.headers.authorization

  if (!authorization || !authorization.startsWith('Bearer ')) {
    throw new Error('Authorization token required')
  }

  const token = authorization.substring(7) // Remove 'Bearer ' prefix

  try {
    // Verify token
    const payload = await verifyAccessToken(token)
    if (!payload) {
      throw new Error('Invalid or expired token')
    }

    // Check if user exists and session is valid
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: {
        sessions: {
          where: {
            token: token,
            expiresAt: {
              gte: new Date()
            }
          }
        }
      }
    })

    if (!user || user.sessions.length === 0) {
      throw new Error('Invalid session')
    }

    // Return user data
    return {
      user: {
        id: user.id,
        email: user.email,
        is2FAEnabled: user.is2FAEnabled,
        kycStatus: user.kycStatus
      }
    }
  } catch (error) {
    throw new Error('Authentication failed')
  }
} 