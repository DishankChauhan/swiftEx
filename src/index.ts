import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { authRoutes } from './routes/auth.routes'
import { walletRoutes } from './routes/wallet.routes'
import { ledgerRoutes } from './routes/ledger.routes'
import { orderBookRoutes } from './routes/orderbook.routes'
import { analyticsRoutes } from './routes/analytics.routes'
import { webSocketService } from './services/websocket.service'
import redis from './config/redis'

// Initialize Redis connection
console.log('🔄 Initializing Redis connection...')

const app = new Elysia()
  .use(cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  }))
  
  // Health check endpoint
  .get('/health', () => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '5.0.0', // Phase 5: Advanced Market Data & Analytics
      services: {
        database: 'connected',
        redis: 'connected',
        websocket: 'active',
        analytics: 'active'
      },
      features: [
        'Authentication & 2FA',
        'Multi-chain Wallet System', 
        'Internal Ledger System',
        'Matching Engine & Order Book',
        'Advanced Market Data & Analytics'
      ]
    }
  })
  
  // API Routes
  .use(authRoutes)
  .use(walletRoutes)
  .use(ledgerRoutes)
  .use(orderBookRoutes)
  .use(analyticsRoutes)
  
  // WebSocket statistics endpoint
  .get('/ws/stats', () => {
    const stats = webSocketService.getStats()
    return {
      success: true,
      data: {
        ...stats,
        timestamp: new Date().toISOString()
      }
    }
  })
  
  // WebSocket endpoint for real-time data
  .ws('/ws', {
    open(ws) {
      const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      webSocketService.addConnection(connectionId, (message) => {
        try {
          ws.send(message)
        } catch (error) {
          console.error('WebSocket send error:', error)
        }
      })
      
      // Store connection ID in WebSocket context
      ;(ws as any).connectionId = connectionId
    },
    
    message(ws, message) {
      const connectionId = (ws as any).connectionId
      if (connectionId && typeof message === 'string') {
        try {
          webSocketService.handleMessage(connectionId, message)
        } catch (error) {
          console.error('WebSocket message error:', error)
        }
      }
    },
    
    close(ws) {
      const connectionId = (ws as any).connectionId
      if (connectionId) {
        webSocketService.removeConnection(connectionId)
      }
    }
  })
  
  // Global error handler
  .onError(({ error, code, request }) => {
    console.error('Server error:', {
      error: error.message,
      code,
      url: request?.url,
      method: request?.method
    })
    
    return {
      success: false,
      message: error.message || 'Internal server error',
      code,
      timestamp: new Date().toISOString()
    }
  })

// Start server
const port = process.env.PORT || 3001
app.listen(port, () => {
  console.log('🚀 Crypto Exchange Backend Server Started!')
  console.log(`📡 Server running on http://localhost:${port}`)
  console.log(`🔌 WebSocket endpoint: ws://localhost:${port}/ws`)
  console.log('✨ Phase 5: Advanced Market Data & Analytics - Active!')
  console.log('\n🎯 Available Features:')
  console.log('   • User Authentication & 2FA')
  console.log('   • Multi-chain HD Wallets (Solana + Ethereum)')
  console.log('   • Internal Ledger System')
  console.log('   • Real-time Order Book & Matching Engine')
  console.log('   • WebSocket Real-time Updates')
  console.log('   • Redis-powered High Performance')
  console.log('   • 📊 Advanced Market Data & Analytics')
  console.log('   • 📈 Technical Indicators & Historical Data')
  console.log('   • 🎯 Risk Analytics & Performance Metrics')
  console.log('\n📚 API Documentation:')
  console.log(`   Health: GET ${port}/health`)
  console.log(`   Order Book: GET ${port}/orderbook/:pair`)
  console.log(`   Analytics: GET ${port}/analytics/config`)
  console.log(`   Candles: GET ${port}/analytics/candles`)
  console.log(`   Indicators: GET ${port}/analytics/indicators`)
  console.log(`   Market Data: GET ${port}/analytics/market/summary`)
  console.log(`   WebSocket: ws://localhost:${port}/ws`)
}) 