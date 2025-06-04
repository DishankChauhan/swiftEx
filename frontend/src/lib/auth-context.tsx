'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { authApi, User } from './api'

interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<{ success: boolean; requires2FA?: boolean; message?: string }>
  loginWith2FA: (email: string, password: string, token: string) => Promise<{ success: boolean; message?: string }>
  register: (email: string, password: string) => Promise<{ success: boolean; message?: string }>
  logout: () => void
  setup2FA: () => Promise<{ success: boolean; qrCodeUrl?: string; message?: string }>
  enable2FA: (token: string) => Promise<{ success: boolean; message?: string }>
  disable2FA: (token: string) => Promise<{ success: boolean; message?: string }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const isAuthenticated = !!user

  useEffect(() => {
    checkAuthStatus()
  }, [])

  const checkAuthStatus = async () => {
    try {
      const token = localStorage.getItem('accessToken')
      if (!token) {
        setIsLoading(false)
        return
      }

      const response = await authApi.getProfile()
      if (response.data.success && response.data.data?.user) {
        setUser(response.data.data.user)
      } else {
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
      }
    } catch (error) {
      console.error('Auth check failed:', error)
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
    } finally {
      setIsLoading(false)
    }
  }

  const login = async (email: string, password: string) => {
    try {
      const response = await authApi.login(email, password)
      
      if (response.data.success && response.data.data) {
        const { user, accessToken, refreshToken } = response.data.data
        localStorage.setItem('accessToken', accessToken)
        localStorage.setItem('refreshToken', refreshToken)
        setUser(user)
        return { success: true }
      } else if (response.data.message === '2FA verification required') {
        return { success: false, requires2FA: true, message: response.data.message }
      } else {
        return { success: false, message: response.data.message }
      }
    } catch (error: any) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Login failed' 
      }
    }
  }

  const loginWith2FA = async (email: string, password: string, token: string) => {
    try {
      const response = await authApi.loginWith2FA(email, password, token)
      
      if (response.data.success && response.data.data) {
        const { user, accessToken, refreshToken } = response.data.data
        localStorage.setItem('accessToken', accessToken)
        localStorage.setItem('refreshToken', refreshToken)
        setUser(user)
        return { success: true }
      } else {
        return { success: false, message: response.data.message }
      }
    } catch (error: any) {
      return { 
        success: false, 
        message: error.response?.data?.message || '2FA verification failed' 
      }
    }
  }

  const register = async (email: string, password: string) => {
    try {
      const response = await authApi.register(email, password)
      
      if (response.data.success && response.data.data) {
        const { user, accessToken, refreshToken } = response.data.data
        localStorage.setItem('accessToken', accessToken)
        localStorage.setItem('refreshToken', refreshToken)
        setUser(user)
        return { success: true }
      } else {
        return { success: false, message: response.data.message }
      }
    } catch (error: any) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Registration failed' 
      }
    }
  }

  const logout = () => {
    const refreshToken = localStorage.getItem('refreshToken')
    if (refreshToken) {
      authApi.logout(refreshToken).catch(console.error)
    }
    
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    setUser(null)
  }

  const setup2FA = async () => {
    try {
      const response = await authApi.setup2FA()
      
      if (response.data.success) {
        return { 
          success: true, 
          qrCodeUrl: response.data.data?.qrCodeUrl,
          message: response.data.message 
        }
      } else {
        return { success: false, message: response.data.message }
      }
    } catch (error: any) {
      return { 
        success: false, 
        message: error.response?.data?.message || '2FA setup failed' 
      }
    }
  }

  const enable2FA = async (token: string) => {
    try {
      const response = await authApi.enable2FA(token)
      
      if (response.data.success) {
        // Update user to reflect 2FA is now enabled
        setUser(prev => prev ? { ...prev, is2FAEnabled: true } : null)
        return { success: true, message: response.data.message }
      } else {
        return { success: false, message: response.data.message }
      }
    } catch (error: any) {
      return { 
        success: false, 
        message: error.response?.data?.message || '2FA enable failed' 
      }
    }
  }

  const disable2FA = async (token: string) => {
    try {
      const response = await authApi.disable2FA(token)
      
      if (response.data.success) {
        // Update user to reflect 2FA is now disabled
        setUser(prev => prev ? { ...prev, is2FAEnabled: false } : null)
        return { success: true, message: response.data.message }
      } else {
        return { success: false, message: response.data.message }
      }
    } catch (error: any) {
      return { 
        success: false, 
        message: error.response?.data?.message || '2FA disable failed' 
      }
    }
  }

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated,
    login,
    loginWith2FA,
    register,
    logout,
    setup2FA,
    enable2FA,
    disable2FA,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
} 