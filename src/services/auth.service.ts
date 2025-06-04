import bcrypt from 'bcryptjs'
import { authenticator } from 'otplib'
import QRCode from 'qrcode'
import { prisma } from '../config/database'
import { 
  RegisterRequest, 
  LoginRequest, 
  Setup2FARequest, 
  Verify2FARequest,
  Disable2FARequest,
  AuthResponse,
  JWTPayload,
  RefreshTokenPayload
} from '../types/auth'
import { generateTokens, verifyRefreshToken } from '../utils/jwt'

export class AuthService {
  // Register new user
  async register(data: RegisterRequest): Promise<AuthResponse> {
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
          passwordHash
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
  async login(data: LoginRequest): Promise<AuthResponse> {
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
      const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash)
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
  async setup2FA(userId: string): Promise<AuthResponse> {
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
        data: { twoFASecret: secret }
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
  async enable2FA(userId: string, data: Setup2FARequest): Promise<AuthResponse> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId }
      })

      if (!user || !user.twoFASecret) {
        return {
          success: false,
          message: '2FA setup not initiated'
        }
      }

      // Verify token
      const isValid = authenticator.verify({
        token: data.token,
        secret: user.twoFASecret
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
      console.error('2FA enable error:', error)
      return {
        success: false,
        message: '2FA enable failed'
      }
    }
  }

  // Login with 2FA
  async loginWith2FA(data: Verify2FARequest): Promise<AuthResponse> {
    try {
      // Find user
      const user = await prisma.user.findUnique({
        where: { email: data.email }
      })

      if (!user || !user.is2FAEnabled || !user.twoFASecret) {
        return {
          success: false,
          message: 'Invalid request'
        }
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash)
      if (!isPasswordValid) {
        return {
          success: false,
          message: 'Invalid credentials'
        }
      }

      // Verify 2FA token
      const isTokenValid = authenticator.verify({
        token: data.token,
        secret: user.twoFASecret
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
  async disable2FA(userId: string, data: Disable2FARequest): Promise<AuthResponse> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId }
      })

      if (!user || !user.is2FAEnabled || !user.twoFASecret) {
        return {
          success: false,
          message: '2FA is not enabled'
        }
      }

      // Verify token
      const isValid = authenticator.verify({
        token: data.token,
        secret: user.twoFASecret
      })

      if (!isValid) {
        return {
          success: false,
          message: 'Invalid 2FA token'
        }
      }

      // Disable 2FA
      await prisma.user.update({
        where: { id: userId },
        data: {
          is2FAEnabled: false,
          twoFASecret: null
        }
      })

      return {
        success: true,
        message: '2FA disabled successfully'
      }
    } catch (error) {
      console.error('2FA disable error:', error)
      return {
        success: false,
        message: '2FA disable failed'
      }
    }
  }

  // Refresh token
  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    try {
      // Verify refresh token
      const payload = await verifyRefreshToken(refreshToken) as RefreshTokenPayload

      // Find session
      const session = await prisma.session.findUnique({
        where: { refreshToken },
        include: { user: true }
      })

      if (!session || session.expiresAt < new Date()) {
        return {
          success: false,
          message: 'Invalid or expired refresh token'
        }
      }

      // Generate new tokens
      const tokens = await generateTokens({
        userId: payload.userId,
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
        message: 'Token refreshed successfully',
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken
        }
      }
    } catch (error) {
      console.error('Token refresh error:', error)
      return {
        success: false,
        message: 'Token refresh failed'
      }
    }
  }

  // Logout
  async logout(refreshToken: string): Promise<AuthResponse> {
    try {
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