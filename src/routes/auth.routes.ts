import { Elysia, t } from 'elysia'
import { AuthService } from '../services/auth.service'
import { verifyAccessToken } from '../utils/jwt'
import { prisma } from '../config/database'

const authService = new AuthService()

// Auth guard function
async function authGuard({ headers }: any) {
  const authorization = headers.authorization

  if (!authorization || !authorization.startsWith('Bearer ')) {
    throw new Error('Authorization token required')
  }

  const token = authorization.substring(7)

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

  return {
    id: user.id,
    email: user.email,
    is2FAEnabled: user.is2FAEnabled,
    kycStatus: user.kycStatus
  }
}

export const authRoutes = new Elysia({ prefix: '/auth' })
  // Public routes
  .post('/register', async ({ body }) => {
    return await authService.register(body)
  }, {
    body: t.Object({
      email: t.String(),
      password: t.String()
    })
  })
  
  .post('/login', async ({ body }) => {
    return await authService.login(body)
  }, {
    body: t.Object({
      email: t.String(),
      password: t.String()
    })
  })

  .post('/login/2fa', async ({ body }) => {
    return await authService.loginWith2FA(body)
  }, {
    body: t.Object({
      email: t.String(),
      password: t.String(),
      token: t.String()
    })
  })

  .post('/refresh', async ({ body }) => {
    const { refreshToken } = body as { refreshToken: string }
    if (!refreshToken) {
      return {
        success: false,
        message: 'Refresh token required'
      }
    }
    return await authService.refreshToken(refreshToken)
  }, {
    body: t.Object({
      refreshToken: t.String()
    })
  })

  .post('/logout', async ({ body }) => {
    const { refreshToken } = body as { refreshToken: string }
    if (!refreshToken) {
      return {
        success: false,
        message: 'Refresh token required'
      }
    }
    return await authService.logout(refreshToken)
  }, {
    body: t.Object({
      refreshToken: t.String()
    })
  })

  // Protected routes
  .get('/profile', async (context) => {
    try {
      const user = await authGuard(context)
      return {
        success: true,
        message: 'Profile retrieved successfully',
        data: { user }
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Authentication failed'
      }
    }
  })

  // Alias for /profile to match frontend expectations
  .get('/me', async (context) => {
    try {
      const user = await authGuard(context)
      return {
        success: true,
        message: 'User data retrieved successfully',
        data: user
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Authentication failed'
      }
    }
  })

  .post('/2fa/setup', async (context) => {
    try {
      const user = await authGuard(context)
      return await authService.setup2FA(user.id)
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Authentication failed'
      }
    }
  })

  .post('/2fa/enable', async (context) => {
    try {
      const user = await authGuard(context)
      return await authService.enable2FA(user.id, context.body)
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Authentication failed'
      }
    }
  }, {
    body: t.Object({
      token: t.String()
    })
  })

  .post('/2fa/disable', async (context) => {
    try {
      const user = await authGuard(context)
      return await authService.disable2FA(user.id, context.body)
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Authentication failed'
      }
    }
  }, {
    body: t.Object({
      password: t.String(),
      token: t.String()
    })
  }) 