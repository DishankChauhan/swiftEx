import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { authenticator } from 'otplib'
import QRCode from 'qrcode'
import { prisma } from '../config/database'
import { generateTokens, verifyRefreshToken } from '../utils/jwt'


export class AuthService {
  // Register new user
  async register(data: any): Promise<any> {
    try {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: data.email }
      })

      if (existingUser) {
        return {
          success: false,
          message: 'User with this email already exists'
        }
      }

      // Hash password
      const passwordHash = await bcrypt.hash(data.password, 12)

      // Create user
      const user = await prisma.user.create({
        data: {
          email: data.email,
          password: passwordHash
        }
      })

      // Generate tokens
      const tokens = await generateTokens({
        userId: user.id,
        email: user.email
      })

      // Create session
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      await prisma.session.create({
        data: {
          userId: user.id,
          token: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt
        }
      })

      return {
        success: true,
        message: 'User registered successfully',
        data: {
          user: {
            id: user.id,
            email: user.email,
            is2FAEnabled: user.is2FAEnabled,
            kycStatus: user.kycStatus
          },
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken
        }
      }
    } catch (error) {
      console.error('Registration error:', error)
      return {
        success: false,
        message: 'Registration failed'
      }
    }
  }

  // Login user
  async login(data: any): Promise<any> {
    try {
      // Find user
      const user = await prisma.user.findUnique({
        where: { email: data.email }
      })

      if (!user) {
        return {
          success: false,
          message: 'Invalid credentials'
        }
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(data.password, user.password)
      if (!isPasswordValid) {
        return {
          success: false,
          message: 'Invalid credentials'
        }
      }

      // If 2FA is enabled, don't issue tokens yet
      if (user.is2FAEnabled) {
        return {
          success: false,
          message: '2FA verification required'
        }
      }

      // Generate tokens
      const tokens = await generateTokens({
        userId: user.id,
        email: user.email
      })

      // Clean up old sessions and create new one
      await prisma.session.deleteMany({
        where: { userId: user.id }
      })

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      await prisma.session.create({
        data: {
          userId: user.id,
          token: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt
        }
      })

      return {
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user.id,
            email: user.email,
            is2FAEnabled: user.is2FAEnabled,
            kycStatus: user.kycStatus
          },
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken
        }
      }
    } catch (error) {
      console.error('Login error:', error)
      return {
        success: false,
        message: 'Login failed'
      }
    }
  }

  // Setup 2FA
  async setup2FA(userId: string): Promise<any> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId }
      })

      if (!user) {
        return {
          success: false,
          message: 'User not found'
        }
      }

      if (user.is2FAEnabled) {
        return {
          success: false,
          message: '2FA is already enabled'
        }
      }

      // Generate secret
      const secret = authenticator.generateSecret()
      const serviceName = 'CryptoExchange'
      const accountName = user.email
      
      // Generate QR code URL
      const otpauth = authenticator.keyuri(accountName, serviceName, secret)
      const qrCodeUrl = await QRCode.toDataURL(otpauth)

      // Save secret temporarily (will be confirmed when user verifies)
      await prisma.user.update({
        where: { id: userId },
        data: { secret2FA: secret }
      })

      return {
        success: true,
        message: 'Scan QR code with your authenticator app',
        data: {
          qrCodeUrl
        }
      }
    } catch (error) {
      console.error('2FA setup error:', error)
      return {
        success: false,
        message: '2FA setup failed'
      }
    }
  }

  // Enable 2FA after verification
  async enable2FA(userId: string, data: any): Promise<any> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId }
      })

      if (!user) {
        return {
          success: false,
          message: 'User not found'
        }
      }

      if (user.is2FAEnabled) {
        return {
          success: false,
          message: '2FA is already enabled'
        }
      }

      if (!user.secret2FA) {
        return {
          success: false,
          message: 'Please setup 2FA first'
        }
      }

      // Verify token
      const isValid = authenticator.verify({
        token: data.token,
        secret: user.secret2FA
      })

      if (!isValid) {
        return {
          success: false,
          message: 'Invalid 2FA token'
        }
      }

      // Enable 2FA
      await prisma.user.update({
        where: { id: userId },
        data: { is2FAEnabled: true }
      })

      return {
        success: true,
        message: '2FA enabled successfully'
      }
    } catch (error) {
      console.error('Enable 2FA error:', error)
      return {
        success: false,
        message: 'Failed to enable 2FA'
      }
    }
  }

  // Login with 2FA
  async loginWith2FA(data: any): Promise<any> {
    try {
      // Find user
      const user = await prisma.user.findUnique({
        where: { email: data.email }
      })

      if (!user) {
        return {
          success: false,
          message: 'Invalid credentials'
        }
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(data.password, user.password)
      if (!isPasswordValid) {
        return {
          success: false,
          message: 'Invalid credentials'
        }
      }

      if (!user.is2FAEnabled || !user.secret2FA) {
        return {
          success: false,
          message: '2FA is not enabled for this account'
        }
      }

      // Verify 2FA token
      const isTokenValid = authenticator.verify({
        token: data.token,
        secret: user.secret2FA
      })

      if (!isTokenValid) {
        return {
          success: false,
          message: 'Invalid 2FA token'
        }
      }

      // Generate tokens
      const tokens = await generateTokens({
        userId: user.id,
        email: user.email
      })

      // Clean up old sessions and create new one
      await prisma.session.deleteMany({
        where: { userId: user.id }
      })

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      await prisma.session.create({
        data: {
          userId: user.id,
          token: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt
        }
      })

      return {
        success: true,
        message: 'Login successful',
        data: {
          user: {
            id: user.id,
            email: user.email,
            is2FAEnabled: user.is2FAEnabled,
            kycStatus: user.kycStatus
          },
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken
        }
      }
    } catch (error) {
      console.error('2FA login error:', error)
      return {
        success: false,
        message: 'Login failed'
      }
    }
  }

  // Disable 2FA
  async disable2FA(userId: string, data: any): Promise<any> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId }
      })

      if (!user) {
        return {
          success: false,
          message: 'User not found'
        }
      }

      if (!user.is2FAEnabled) {
        return {
          success: false,
          message: '2FA is not enabled'
        }
      }

      // Verify current password
      const isPasswordValid = await bcrypt.compare(data.password, user.password)
      if (!isPasswordValid) {
        return {
          success: false,
          message: 'Invalid password'
        }
      }

      // Verify 2FA token
      if (user.secret2FA) {
        const isTokenValid = authenticator.verify({
          token: data.token,
          secret: user.secret2FA
        })

        if (!isTokenValid) {
          return {
            success: false,
            message: 'Invalid 2FA token'
          }
        }
      }

      // Disable 2FA
      await prisma.user.update({
        where: { id: userId },
        data: {
          is2FAEnabled: false,
          secret2FA: null
        }
      })

      return {
        success: true,
        message: '2FA disabled successfully'
      }
    } catch (error) {
      console.error('Disable 2FA error:', error)
      return {
        success: false,
        message: 'Failed to disable 2FA'
      }
    }
  }

  // Refresh tokens
  async refreshToken(refreshToken: string): Promise<any> {
    try {
      // Verify refresh token
      const payload = verifyRefreshToken(refreshToken) as any

      // Find session
      const session = await prisma.session.findFirst({
        where: {
          refreshToken,
          userId: payload.userId,
          expiresAt: { gt: new Date() }
        },
        include: { user: true }
      })

      if (!session) {
        return {
          success: false,
          message: 'Invalid refresh token'
        }
      }

      // Generate new tokens
      const tokens = await generateTokens({
        userId: session.user.id,
        email: session.user.email
      })

      // Update session
      await prisma.session.update({
        where: { id: session.id },
        data: {
          token: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        }
      })

      return {
        success: true,
        message: 'Tokens refreshed successfully',
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken
        }
      }
    } catch (error) {
      console.error('Refresh token error:', error)
      return {
        success: false,
        message: 'Token refresh failed'
      }
    }
  }

  // Logout
  async logout(refreshToken: string): Promise<any> {
    try {
      // Find and delete session
      await prisma.session.deleteMany({
        where: { refreshToken }
      })

      return {
        success: true,
        message: 'Logged out successfully'
      }
    } catch (error) {
      console.error('Logout error:', error)
      return {
        success: false,
        message: 'Logout failed'
      }
    }
  }
} 