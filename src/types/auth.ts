import { z } from 'zod'

// Request validation schemas
export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

export const setup2FASchema = z.object({
  token: z.string().length(6),
})

export const verify2FASchema = z.object({
  email: z.string().email(),
  password: z.string(),
  token: z.string().length(6),
})

export const disable2FASchema = z.object({
  token: z.string().length(6),
})

// Type exports
export type RegisterRequest = z.infer<typeof registerSchema>
export type LoginRequest = z.infer<typeof loginSchema>
export type Setup2FARequest = z.infer<typeof setup2FASchema>
export type Verify2FARequest = z.infer<typeof verify2FASchema>
export type Disable2FARequest = z.infer<typeof disable2FASchema>

// Response types
export interface AuthResponse {
  success: boolean
  message: string
  data?: {
    user?: {
      id: string
      email: string
      is2FAEnabled: boolean
      kycStatus: string
    }
    accessToken?: string
    refreshToken?: string
    qrCodeUrl?: string
  }
}

// JWT payload types
export interface JWTPayload {
  userId: string
  email: string
  iat?: number
  exp?: number
}

export interface RefreshTokenPayload {
  userId: string
  sessionId: string
  iat?: number
  exp?: number
} 