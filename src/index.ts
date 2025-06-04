import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { authRoutes } from './routes/auth.routes'
import { walletRoutes } from './routes/wallet.routes'

const PORT = process.env.PORT || 3001

const app = new Elysia()
  .use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  }))
  .get('/', () => ({
    message: 'Crypto Exchange API - Phase 2',
    version: '2.0.0',
    features: [
      'User Authentication & 2FA',
      'Wallet System (Solana & Ethereum)',
      'Deposit Address Generation',
      'Balance Management',
      'Transaction History'
    ],
    endpoints: {
      auth: '/auth/*',
      wallet: '/wallet/*',
      health: '/health'
    }
  }))
  .get('/health', () => ({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '2.0.0',
    features: {
      phase1: 'Authentication & 2FA',
      phase2: 'Wallet System (Solana & Ethereum)'
    }
  }))
  .use(authRoutes)
  .use(walletRoutes)
  .onError(({ error, code }) => {
    console.error('Error:', error)
    
    if (code === 'VALIDATION') {
      return {
        success: false,
        message: 'Validation error',
        errors: error.message
      }
    }

    return {
      success: false,
      message: 'Internal server error'
    }
  })

console.log(`🚀 Crypto Exchange API running on port ${PORT}`)
console.log(`📚 API Documentation: http://localhost:${PORT}`)
console.log(`❤️  Health Check: http://localhost:${PORT}/health`)
console.log(`💰 Phase 2: Wallet System Active`)
console.log(`   - Solana wallet generation`)
console.log(`   - Ethereum wallet generation`)
console.log(`   - Deposit address management`)
console.log(`   - Balance tracking`)

app.listen(PORT) 