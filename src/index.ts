import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { authRoutes } from './routes/auth.routes'
import { walletRoutes } from './routes/wallet.routes'
import { ledgerRoutes } from './routes/ledger.routes'
import { orderBookRoutes } from './routes/orderbook.routes'
import { analyticsRoutes } from './routes/analytics.routes'
import { externalWalletRoutes, marketMakerRoutes } from './routes/external-wallet.routes'
import { publicRoutes } from './routes/public.routes'
import { webSocketService } from './services/websocket.service'
import redis from './config/redis'
import { marketMakerService } from './services/market-maker.service'

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
      version: '6.0.0', // Phase 6: External Wallets & Market Making
      services: {
        database: 'connected',
        redis: 'connected',
        websocket: 'active',
        analytics: 'active',
        marketMaker: 'active',
        externalWallets: 'active'
      },
      features: [
        'Authentication & 2FA',
        'Multi-chain Wallet System', 
        'Internal Ledger System',
        'Matching Engine & Order Book',
        'Advanced Market Data & Analytics',
        'External Wallet Connectivity',
        'Market Maker Bot with Binance Feeds'
      ]
    }
  })
  
  // WebSocket endpoint for real-time data (NO AUTHENTICATION REQUIRED)
  .ws('/ws', {
    open(ws) {
      const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      console.log(`🔌 WebSocket client connected: ${connectionId}`)
      
      webSocketService.addConnection(connectionId, (message) => {
        try {
          ws.send(message)
        } catch (error) {
          console.error('WebSocket send error:', error)
        }
      })
      
      // Store connection ID in WebSocket context
      ;(ws as any).connectionId = connectionId
      
      // Send welcome message
      try {
        ws.send(JSON.stringify({
          type: 'welcome',
          data: { message: 'Connected to SwiftEx WebSocket' },
          timestamp: new Date().toISOString()
        }))
      } catch (error) {
        console.error('Welcome message send error:', error)
      }
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
        console.log(`🔌 WebSocket client disconnected: ${connectionId}`)
        webSocketService.removeConnection(connectionId)
      }
    }
  })
  
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
  
  // Public API Routes (no authentication required)
  .use(publicRoutes)
  
  // Authenticated API Routes
  .use(authRoutes)
  .use(walletRoutes)
  .use(ledgerRoutes)
  .use(orderBookRoutes)
  .use(analyticsRoutes)
  .use(externalWalletRoutes)
  .use(marketMakerRoutes)
  
  // Global error handler
  .onError((context) => {
    const { error, code, request } = context;
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
const server = app.listen(port, () => {
  console.log('🚀 Crypto Exchange Backend Server Started!')
  console.log(`📡 Server running on http://localhost:${port}`)
  console.log(`🔌 WebSocket endpoint: ws://localhost:${port}/ws`)
  console.log('✨ Phase 6: External Wallets & Market Making - Active!')
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
  console.log('   • 🔗 External Wallet Connectivity (Phantom/MetaMask)')
  console.log('   • 🤖 Market Maker Bot with Binance Price Feeds')
  console.log('\n📚 API Documentation:')
  console.log(`   Health: GET ${port}/health`)
  console.log(`   Order Book: GET ${port}/orderbook/:pair`)
  console.log(`   Analytics: GET ${port}/analytics/config`)
  console.log(`   Market Maker: GET ${port}/api/market-maker/prices`)
  console.log(`   External Wallets: POST ${port}/api/external-wallet/connect`)
  console.log(`   WebSocket: ws://localhost:${port}/ws`)
  console.log('\n💡 Press Ctrl+C to stop the server')
})

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('\n📝 Received SIGINT (Ctrl+C). Shutting down gracefully...')
  
  try {
    // Stop market maker service
    console.log('🤖 Stopping Market Maker Service...')
    marketMakerService.stop()
    
    // Close WebSocket connections
    console.log('🔌 Closing WebSocket connections...')
    webSocketService.closeAllConnections()
    
    // Close Redis connection
    console.log('📦 Closing Redis connection...')
    await redis.quit()
    
    // Stop the server
    console.log('🛑 Stopping server...')
    server.stop()
    
    console.log('✅ Server shut down successfully')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error during shutdown:', error)
    process.exit(1)
  }
})

process.on('SIGTERM', async () => {
  console.log('\n📝 Received SIGTERM. Shutting down gracefully...')
  
  try {
    // Stop market maker service
    console.log('🤖 Stopping Market Maker Service...')
    marketMakerService.stop()
    
    // Close WebSocket connections
    console.log('🔌 Closing WebSocket connections...')
    webSocketService.closeAllConnections()
    
    // Close Redis connection
    console.log('📦 Closing Redis connection...')
    await redis.quit()
    
    // Stop the server
    console.log('🛑 Stopping server...')
    server.stop()
    
    console.log('✅ Server shut down successfully')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error during shutdown:', error)
    process.exit(1)
  }
}) 