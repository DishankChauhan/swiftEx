import axios from 'axios'

// API Configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// Create axios instance with default config
export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor to handle token refresh
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        const refreshToken = localStorage.getItem('refreshToken')
        if (refreshToken) {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
            refreshToken,
          })

          const { accessToken, refreshToken: newRefreshToken } = response.data.data
          localStorage.setItem('accessToken', accessToken)
          localStorage.setItem('refreshToken', newRefreshToken)

          // Retry original request
          return apiClient(originalRequest)
        }
      } catch (refreshError) {
        // Refresh failed, logout user
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        window.location.href = '/auth/login'
      }
    }

    return Promise.reject(error)
  }
)

// API Types
export interface User {
  id: string
  email: string
  is2FAEnabled: boolean
  kycStatus: string
}

export interface AuthResponse {
  success: boolean
  message: string
  data?: {
    user: User
    accessToken: string
    refreshToken: string
    qrCodeUrl?: string
  }
}

export interface Balance {
  asset: string
  chain: string
  available: string
  locked: string
  total: string
}

export interface Order {
  id: string
  tradingPair: string
  orderType: string
  side: 'buy' | 'sell'
  amount: string
  price?: string
  filled: string
  remaining: string
  status: string
  createdAt: string
  updatedAt: string
}

export interface OrderBookLevel {
  price: string
  amount: string
  total?: string
}

export interface OrderBook {
  tradingPair: string
  bids: OrderBookLevel[]
  asks: OrderBookLevel[]
  lastUpdated: string
}

export interface CandleData {
  timestamp: number
  open: string
  high: string
  low: string
  close: string
  volume: string
}

export interface ConnectedWallet {
  id: string
  address: string
  chain: 'solana' | 'ethereum'
  verified: boolean
  connectedAt: string
}

// Authentication API
export const authApi = {
  register: (email: string, password: string) =>
    apiClient.post<AuthResponse>('/auth/register', { email, password }),

  login: (email: string, password: string) =>
    apiClient.post<AuthResponse>('/auth/login', { email, password }),

  loginWith2FA: (email: string, password: string, token: string) =>
    apiClient.post<AuthResponse>('/auth/login/2fa', { email, password, token }),

  setup2FA: () =>
    apiClient.post<AuthResponse>('/auth/2fa/setup'),

  enable2FA: (token: string) =>
    apiClient.post<AuthResponse>('/auth/2fa/enable', { token }),

  disable2FA: (token: string) =>
    apiClient.post<AuthResponse>('/auth/2fa/disable', { token }),

  getProfile: () =>
    apiClient.get<AuthResponse>('/auth/profile'),

  logout: (refreshToken: string) =>
    apiClient.post('/auth/logout', { refreshToken }),
}

// Wallet API
export const walletApi = {
  generateDepositAddress: (chain: string) =>
    apiClient.post('/wallet/deposit/address', { chain }),

  getDepositAddresses: () =>
    apiClient.get('/wallet/deposit/addresses'),

  getBalances: () =>
    apiClient.get<{ success: boolean; data: { balances: Balance[] } }>('/wallet/balances'),

  getLiveBalance: (chain: string, address: string) =>
    apiClient.get(`/wallet/balance/live/${chain}/${address}`),
}

// External Wallet API
export const externalWalletApi = {
  generateChallenge: (address: string) =>
    apiClient.post<{ success: boolean; data: { message: string } }>('/api/external-wallet/challenge', { address }),

  connectWallet: (address: string, chain: 'solana' | 'ethereum', signature: string) =>
    apiClient.post<{ success: boolean; data: ConnectedWallet }>('/api/external-wallet/connect', {
      address,
      chain,
      signature
    }),

  getConnectedWallets: () =>
    apiClient.get<{ success: boolean; data: ConnectedWallet[] }>('/api/external-wallet/connected'),

  disconnectWallet: (address: string) =>
    apiClient.delete<{ success: boolean; message: string }>('/api/external-wallet/disconnect', {
      data: { address }
    }),

  getDepositAddress: (chain: 'solana' | 'ethereum') =>
    apiClient.get<{ success: boolean; data: { address: string; chain: string } }>(`/api/external-wallet/deposit-address/${chain}`),

  monitorDeposit: (chain: 'solana' | 'ethereum', userAddress: string, expectedAmount?: number) =>
    apiClient.post<{ success: boolean; data: { monitorId: string } }>('/api/external-wallet/monitor-deposit', {
      chain,
      userAddress,
      expectedAmount
    }),
}

// Trading API
export const tradingApi = {
  getOrderBook: (tradingPair: string) => {
    // Convert SOL/USDC to SOLUSDC for URL safety
    const urlSafePair = tradingPair.replace('/', '')
    return apiClient.get<{ success: boolean; data: OrderBook }>(`/orderbook/${urlSafePair}`)
  },

  createOrder: (orderData: {
    tradingPair: string
    orderType: 'limit' | 'market'
    side: 'buy' | 'sell'
    amount: string
    price?: string
  }) => {
    // Convert orderType to type for backend compatibility
    const backendOrderData = {
      tradingPair: orderData.tradingPair,
      side: orderData.side,
      type: orderData.orderType,  // Convert orderType to type
      amount: orderData.amount,
      ...(orderData.price && { price: orderData.price })
    }
    return apiClient.post<{ success: boolean; data: { order: Order } }>('/orderbook/order', backendOrderData)
  },

  getOrders: (tradingPair?: string, status?: string) =>
    apiClient.get<{ success: boolean; data: { orders: Order[] } }>('/ledger/orders', {
      params: { tradingPair, status }
    }),

  cancelOrder: (orderId: string) =>
    apiClient.delete(`/ledger/order/${orderId}`),

  getOrderHistory: (tradingPair?: string, limit?: number) =>
    apiClient.get<{ success: boolean; data: { orders: Order[] } }>('/ledger/orders', {
      params: { tradingPair, limit }
    }),
}

// Analytics API
export const analyticsApi = {
  getCandles: (tradingPair: string, interval: string, limit?: number) =>
    apiClient.get<{ success: boolean; data: { candles: CandleData[] } }>('/analytics/candles', {
      params: { tradingPair, interval, limit }
    }),

  getTechnicalIndicators: (tradingPair: string, interval: string, indicators: string[]) =>
    apiClient.get('/analytics/indicators', {
      params: { tradingPair, interval, indicators: indicators.join(',') }
    }),

  getMarketSummary: () =>
    apiClient.get('/analytics/market/summary'),

  getTradingPairs: () =>
    apiClient.get<{ success: boolean; data: { pairs: any[]; count: number } }>('/analytics/pairs'),
}

// WebSocket API
export class WebSocketClient {
  private ws: WebSocket | null = null
  private url: string
  private reconnectInterval: number = 5000
  private listeners: Map<string, Function[]> = new Map()

  constructor(url: string = 'ws://localhost:3001/ws') {
    this.url = url
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => {
        console.log('✅ WebSocket connected to SwiftEx')
        this.emit('connected', true)
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log('📦 WebSocket message received:', data)
          this.emit('message', data)
          
          // Emit specific event types
          if (data.type) {
            this.emit(data.type, data)
          }
        } catch (error) {
          console.error('WebSocket message parse error:', error)
        }
      }

      this.ws.onclose = (event) => {
        console.log('🔌 WebSocket disconnected:', event.code, event.reason)
        this.emit('disconnected', true)
        this.reconnect()
      }

      this.ws.onerror = (event) => {
        console.error('❌ WebSocket error:', event)
        this.emit('error', event)
      }
    } catch (error) {
      console.error('WebSocket connection error:', error)
      this.reconnect()
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('📤 Sending WebSocket message:', message)
      this.ws.send(JSON.stringify(message))
    } else {
      console.warn('WebSocket not connected, cannot send message:', message)
    }
  }

  subscribe(channel: string) {
    this.send({ 
      type: 'subscribe', 
      data: { channels: [channel] }
    })
  }

  unsubscribe(channel: string) {
    this.send({ 
      type: 'unsubscribe', 
      data: { channels: [channel] }
    })
  }

  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(callback)
  }

  off(event: string, callback: Function) {
    const listeners = this.listeners.get(event)
    if (listeners) {
      const index = listeners.indexOf(callback)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }

  private emit(event: string, data: any) {
    const listeners = this.listeners.get(event)
    if (listeners) {
      listeners.forEach(callback => callback(data))
    }
  }

  private reconnect() {
    setTimeout(() => {
      console.log('Attempting to reconnect WebSocket...')
      this.connect()
    }, this.reconnectInterval)
  }
}

export const wsClient = new WebSocketClient() 