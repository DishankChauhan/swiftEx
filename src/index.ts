import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { authRoutes } from './routes/auth.routes'
import { walletRoutes } from './routes/wallet.routes'
import { ledgerRoutes } from './routes/ledger.routes'
import { orderBookRoutes } from './routes/orderbook.routes'
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
  .get('/health', () => ({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '4.0.0', // Phase 4: Matching Engine + Orderbook
    services: {
      database: 'connected',
      redis: 'connected',
      websocket: 'active'
    },
    features: [
      'Authentication & 2FA',
      'Multi-chain Wallet System', 
      'Internal Ledger System',
      'Matching Engine & Order Book'
    ]
  }))
  
  // WebSocket endpoint for real-time data
  .ws('/ws', {
    open(ws) {
      const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      webSocketService.addConnection(connectionId, (message) => {
        ws.send(message)
      })
      
      // Store connection ID in WebSocket context
      ;(ws as any).connectionId = connectionId
    },
    
    message(ws, message) {
      const connectionId = (ws as any).connectionId
      if (connectionId && typeof message === 'string') {
        webSocketService.handleMessage(connectionId, message)
      }
    },
    
    close(ws) {
      const connectionId = (ws as any).connectionId
      if (connectionId) {
        webSocketService.removeConnection(connectionId)
      }
    }
  })
  
  // API Routes
  .use(authRoutes)
  .use(walletRoutes)
  .use(ledgerRoutes)
  .use(orderBookRoutes)
  
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
  
  // Global error handler
  .onError(({ error, code }) => {
    console.error('Server error:', error)
    
    return {
      success: false,
      error: 'Internal server error',
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
  console.log('✨ Phase 4: Matching Engine + Order Book (Redis) - Active!')
  console.log('\n🎯 Available Features:')
  console.log('   • User Authentication & 2FA')
  console.log('   • Multi-chain HD Wallets (Solana + Ethereum)')
  console.log('   • Internal Ledger System')
  console.log('   • Real-time Order Book & Matching Engine')
  console.log('   • WebSocket Real-time Updates')
  console.log('   • Redis-powered High Performance')
  console.log('\n📚 API Documentation:')
  console.log(`   Health: GET ${port}/health`)
  console.log(`   Order Book: GET ${port}/orderbook/:pair`)
  console.log(`   WebSocket: ws://localhost:${port}/ws`)
}) 