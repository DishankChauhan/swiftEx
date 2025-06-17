import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { swagger } from '@elysiajs/swagger'
import { html } from '@elysiajs/html'

// Import configurations
import './config/database'
import { initTimescaleDB } from './config/timescale'

// Import routes
import { authRoutes } from './routes/auth.routes'
import { orderBookRoutes } from './routes/orderbook.routes'
import { ledgerRoutes } from './routes/ledger.routes'
import { walletRoutes } from './routes/wallet.routes'
import { externalWalletRoutes } from './routes/external-wallet.routes'
import { marketDataRoutes } from './routes/market-data.routes'
import { publicRoutes } from './routes/public.routes'
import { analyticsRoutes } from './routes/analytics.routes'

// Import services
import { webSocketService } from './services/websocket.service'
import { analyticsService } from './services/analytics.service'
import { marketMakerService } from './services/market-maker.service'

const app = new Elysia()
  .use(cors({
    origin: true,
    credentials: true
  }))
  .use(swagger({
    documentation: {
      info: {
        title: 'SwiftEx API',
        version: '6.0.0',
        description: 'Professional Crypto Exchange API'
      },
      servers: [
        {
          url: 'http://localhost:3001',
          description: 'Development server'
        }
      ],
      tags: [
        { name: 'Auth', description: 'Authentication endpoints' },
        { name: 'User', description: 'User management' },
        { name: 'OrderBook', description: 'Order book operations' },
        { name: 'Ledger', description: 'Trading and balance management' },
        { name: 'Wallet', description: 'Wallet operations' },
        { name: 'Market Data', description: 'Market data and analytics' }
      ]
    },
    path: '/docs'
  }))
  .use(html())

  // Health check endpoint
  .get('/health', () => {
    return {
      status: 'healthy',
      version: '6.0.0',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        timescaledb: 'connected',
        redis: 'connected',
        websockets: webSocketService.getStats(),
        analytics: 'available',
        marketMaker: 'available'
      },
      features: {
        trading: true,
        orderMatching: true,
        websockets: true,
        analytics: true,
        marketMaker: true,
        multiChainWallets: true,
        timeSeries: true,
        rateLimiting: true
      }
    }
  })

  // WebSocket endpoint for real-time data
  .ws('/ws', {
    open(ws) {
      const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      console.log(`🔌 WebSocket client ${connectionId} connected`)
      
      webSocketService.addConnection(connectionId, (message) => {
        try {
          ws.send(message)
        } catch (error) {
          console.error('WebSocket send error:', error)
        }
      })
      
      // Store connection ID for later use
      ;(ws as any).connectionId = connectionId
      
      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connection',
        data: { 
          status: 'connected', 
          connectionId,
          server: 'SwiftEx Exchange',
          timestamp: new Date().toISOString()
        }
      }))
      
      // Send initial market data
      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'ticker',
          data: {
            symbol: 'SOL/USDC',
            price: '147.84',
            change24h: '+2.45',
            volume24h: '1500000'
          },
          timestamp: new Date().toISOString()
        }))
      }, 1000)
    },
    message(ws, message) {
      const connectionId = (ws as any).connectionId
      console.log(`📨 WebSocket ${connectionId} received:`, message)
      
      if (connectionId && typeof message === 'string') {
        try {
          webSocketService.handleMessage(connectionId, message)
        } catch (error) {
          console.error('WebSocket message error:', error)
          ws.send(JSON.stringify({
            type: 'error',
            data: { message: 'Invalid message format' },
            timestamp: new Date().toISOString()
          }))
        }
      }
    },
    close(ws) {
      const connectionId = (ws as any).connectionId
      if (connectionId) {
        webSocketService.removeConnection(connectionId)
        console.log(`🔌 WebSocket ${connectionId} disconnected`)
      }
    }
  })

  // API Routes
  .use(authRoutes)
  .use(orderBookRoutes)
  .use(ledgerRoutes)
  .use(walletRoutes)
  .use(externalWalletRoutes)
  .use(marketDataRoutes)
  .use(publicRoutes)
  .use(analyticsRoutes)

  // WebSocket stats endpoint
  .get('/ws/stats', () => webSocketService.getStats())

// Initialize services
async function initializeServices() {
  try {
    console.log('🚀 Initializing SwiftEx Exchange...')
    
    // Initialize TimescaleDB
    await initTimescaleDB()
    
    console.log('✅ All services initialized successfully')
  } catch (error) {
    console.error('❌ Failed to initialize services:', error)
    process.exit(1)
  }
}

// Start server
const port = process.env.PORT || 3001

if (import.meta.env?.NODE_ENV !== 'test') {
  console.log(`🔥 SwiftEx Exchange running on http://localhost:${port}`)
  console.log(`📖 API Documentation: http://localhost:${port}/docs`)
  
  // Initialize services first
  initializeServices()
  
  // Start the server with Elysia's listen method for proper WebSocket support
  app.listen(port, () => {
    console.log(`🚀 Server is running on port ${port}`)
  })
  
  // Graceful shutdown handling
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`)
    
    try {
      // Close WebSocket connections
      console.log('🔄 Closing WebSocket connections...')
      webSocketService.closeAllConnections()
      
      // Stop background services
      console.log('🔄 Stopping background services...')
      
      // Stop market maker service
      marketMakerService.stop()
      
      // Stop external wallet monitoring
      const { externalWalletService } = await import('./services/external-wallet.service')
      externalWalletService.stopDepositMonitoring()
      
      console.log('✅ All services stopped successfully')
      process.exit(0)
    } catch (error) {
      console.error('❌ Error during shutdown:', error)
      process.exit(1)
    }
  }
  
  // Handle shutdown signals
  process.on('SIGINT', () => gracefulShutdown('SIGINT'))
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
  process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2')) // For nodemon compatibility
}

// Export for testing only
export default import.meta.env?.NODE_ENV === 'test' ? app : {}; 