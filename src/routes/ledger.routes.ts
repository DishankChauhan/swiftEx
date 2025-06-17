import { Elysia, t } from 'elysia'
import { ledgerService } from '../services/ledger.service'
import { authMiddleware } from '../middleware/auth'

export const ledgerRoutes = new Elysia({ prefix: '/ledger' })
  // Asset Configuration Routes (Admin only for now)
  .post('/assets', async ({ body }: { body: any }) => {
    try {
      const asset = await ledgerService.createAssetConfig(body)
      
      return {
        success: true,
        message: 'Asset configuration created successfully',
        data: asset
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to create asset configuration',
        error: error.message
      }
    }
  }, {
    body: t.Object({
      symbol: t.String(),
      name: t.String(),
      decimals: t.Number(),
      chain: t.Union([t.Literal('solana'), t.Literal('ethereum')]),
      contractAddress: t.Optional(t.String()),
      minDeposit: t.Optional(t.String()),
      minWithdrawal: t.Optional(t.String()),
      withdrawalFee: t.Optional(t.String())
    })
  })

  .get('/assets', async () => {
    try {
      const assets = await ledgerService.getAssetConfigs()
      
      return {
        success: true,
        message: 'Asset configurations retrieved successfully',
        data: { assets }
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to retrieve asset configurations',
        error: error.message
      }
    }
  })

  .get('/assets/:symbol', async ({ params }: { params: any }) => {
    try {
      const asset = await ledgerService.getAssetConfig(params.symbol)
      
      if (!asset) {
        return {
          success: false,
          message: 'Asset configuration not found'
        }
      }
      
      return {
        success: true,
        message: 'Asset configuration retrieved successfully',
        data: asset
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to retrieve asset configuration',
        error: error.message
      }
    }
  })

  // Trading Pair Routes
  .post('/trading-pairs', async ({ body }: { body: any }) => {
    try {
      const tradingPair = await ledgerService.createTradingPair(body)
      
      return {
        success: true,
        message: 'Trading pair created successfully',
        data: tradingPair
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to create trading pair',
        error: error.message
      }
    }
  }, {
    body: t.Object({
      baseAsset: t.String(),
      quoteAsset: t.String(),
      minOrderSize: t.String(),
      maxOrderSize: t.String(),
      priceStep: t.String(),
      sizeStep: t.String(),
      makerFee: t.Optional(t.String()),
      takerFee: t.Optional(t.String())
    })
  })

  .get('/trading-pairs', async () => {
    try {
      const tradingPairs = await ledgerService.getTradingPairs()
      
      return {
        success: true,
        message: 'Trading pairs retrieved successfully',
        data: { tradingPairs }
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to retrieve trading pairs',
        error: error.message
      }
    }
  })

  .get('/trading-pairs/:symbol', async ({ params }: { params: any }) => {
    try {
      const tradingPair = await ledgerService.getTradingPair(params.symbol)
      
      if (!tradingPair) {
        return {
          success: false,
          message: 'Trading pair not found'
        }
      }
      
      return {
        success: true,
        message: 'Trading pair retrieved successfully',
        data: tradingPair
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to retrieve trading pair',
        error: error.message
      }
    }
  })

  // Order Management Routes (Protected)
  .post('/orders', async ({ body, headers }: { body: any; headers: any }) => {
    try {
      const auth = await authMiddleware({ headers })
      const order = await ledgerService.createOrder(auth.user.id, body)
      
      return {
        success: true,
        message: 'Order created successfully',
        data: order
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to create order',
        error: error.message
      }
    }
  }, {
    body: t.Object({
      tradingPair: t.String(),
      orderType: t.Union([t.Literal('market'), t.Literal('limit'), t.Literal('stop')]),
      side: t.Union([t.Literal('buy'), t.Literal('sell')]),
      amount: t.String(),
      price: t.Optional(t.String()),
      stopPrice: t.Optional(t.String()),
      timeInForce: t.Optional(t.Union([t.Literal('GTC'), t.Literal('IOC'), t.Literal('FOK')])),
      clientOrderId: t.Optional(t.String())
    })
  })

  .get('/orders', async ({ query, headers }: { query: any; headers: any }) => {
    try {
      const auth = await authMiddleware({ headers })
      const options = {
        status: query.status,
        tradingPair: query.tradingPair,
        page: query.page ? parseInt(query.page as string) : 1,
        pageSize: query.pageSize ? parseInt(query.pageSize as string) : 50
      }
      
      const result = await ledgerService.getUserOrders(auth.user.id, options)
      
      return {
        success: true,
        message: 'Orders retrieved successfully',
        data: result
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to retrieve orders',
        error: error.message
      }
    }
  })

  .get('/orders/:orderId', async ({ params, headers }: { params: any; headers: any }) => {
    try {
      const auth = await authMiddleware({ headers })
      const order = await ledgerService.getOrder(auth.user.id, params.orderId)
      
      if (!order) {
        return {
          success: false,
          message: 'Order not found'
        }
      }
      
      return {
        success: true,
        message: 'Order retrieved successfully',
        data: order
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to retrieve order',
        error: error.message
      }
    }
  })

  .delete('/orders/:orderId', async ({ params, headers }: { params: any; headers: any }) => {
    try {
      const auth = await authMiddleware({ headers })
      const order = await ledgerService.cancelOrder(auth.user.id, params.orderId)
      
      return {
        success: true,
        message: 'Order cancelled successfully',
        data: order
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to cancel order',
        error: error.message
      }
    }
  })

  // Balance Operations Routes (Protected)
  .get('/balances', async ({ headers }: { headers: any }) => {
    try {
      const auth = await authMiddleware({ headers })
      const balances = await ledgerService.getUserBalances(auth.user.id)
      
      return {
        success: true,
        message: 'Balances retrieved successfully',
        data: { balances }
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to retrieve balances',
        error: error.message
      }
    }
  })

  .get('/balances/:asset/:chain', async ({ params, headers }: { params: any; headers: any }) => {
    try {
      const auth = await authMiddleware({ headers })
      const balance = await ledgerService.getUserBalance(auth.user.id, params.asset, params.chain)
      
      if (!balance) {
        return {
          success: false,
          message: 'Balance not found'
        }
      }
      
      return {
        success: true,
        message: 'Balance retrieved successfully',
        data: balance
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to retrieve balance',
        error: error.message
      }
    }
  })

  // Internal Transfer Routes (Protected)
  .post('/transfer', async ({ body, headers }: { body: any; headers: any }) => {
    try {
      const auth = await authMiddleware({ headers })
      const transferData = { ...body, fromUserId: auth.user.id }
      
      await ledgerService.internalTransfer(transferData)
      
      return {
        success: true,
        message: 'Internal transfer completed successfully'
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to complete internal transfer',
        error: error.message
      }
    }
  }, {
    body: t.Object({
      toUserId: t.String(),
      asset: t.String(),
      amount: t.String(),
      description: t.Optional(t.String())
    })
  })

  // Ledger History Routes (Protected)
  .get('/history', async ({ query, headers }: { query: any; headers: any }) => {
    try {
      const auth = await authMiddleware({ headers })
      const options = {
        asset: query.asset,
        entryType: query.entryType,
        page: query.page ? parseInt(query.page as string) : 1,
        pageSize: query.pageSize ? parseInt(query.pageSize as string) : 50
      }
      
      const result = await ledgerService.getUserLedgerEntries(auth.user.id, options)
      
      return {
        success: true,
        message: 'Ledger history retrieved successfully',
        data: result
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to retrieve ledger history',
        error: error.message
      }
    }
  })

  // System Initialization Route (Admin only for now)
  .post('/init', async () => {
    try {
      await ledgerService.initializeSystemAssets()
      
      return {
        success: true,
        message: 'System assets and trading pairs initialized successfully'
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to initialize system assets',
        error: error.message
      }
    }
  })

  // Manual Balance Operations (Admin only for now)
  .post('/balance/operation', async ({ body }: { body: any }) => {
    try {
      const { userId, asset, amount, operation, description } = body
      
      await ledgerService.executeBalanceOperation({
        userId,
        asset,
        amount,
        operation,
        description
      })
      
      return {
        success: true,
        message: 'Balance operation completed successfully'
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message || 'Failed to execute balance operation',
        error: error.message
      }
    }
  }, {
    body: t.Object({
      userId: t.String(),
      asset: t.String(), 
      amount: t.String(),
      operation: t.Union([t.Literal('credit'), t.Literal('debit')]),
      description: t.Optional(t.String())
    })
  })