import { Elysia, t } from 'elysia'
import { orderBookService } from '../services/orderbook.service'
import { matchingService } from '../services/matching.service'
import { authMiddleware } from '../middleware/auth'

export const orderBookRoutes = new Elysia({ prefix: '/orderbook' })
  
  // Helper function to convert URL-safe trading pair to standard format
  .derive(() => {
    return {
      formatTradingPair: (urlPair: string) => {
        // Convert SOLUSDC to SOL/USDC, ETHUSDC to ETH/USDC
        if (urlPair === 'SOLUSDC') return 'SOL/USDC'
        if (urlPair === 'ETHUSDC') return 'ETH/USDC'
        return urlPair
      }
    }
  })
  
  // Get order book snapshot
  .get('/:tradingPair', async ({ params: { tradingPair }, query, formatTradingPair }) => {
    try {
      const actualPair = formatTradingPair(tradingPair)
      const depth = parseInt(query.depth as string) || 20
      const orderBook = await orderBookService.getOrderBook(actualPair, depth)
      
      return {
        success: true,
        data: orderBook
      }
    } catch (error) {
      return {
        success: false,
        error: 'Failed to fetch order book',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }, {
    params: t.Object({
      tradingPair: t.String()
    }),
    query: t.Object({
      depth: t.Optional(t.String())
    })
  })

  // Get best bid and ask prices
  .get('/:tradingPair/ticker', async ({ params: { tradingPair }, formatTradingPair }) => {
    try {
      const actualPair = formatTradingPair(tradingPair)
      const [prices, stats] = await Promise.all([
        orderBookService.getBestPrices(actualPair),
        orderBookService.getOrderBookStats(actualPair)
      ])
      
      return {
        success: true,
        data: {
          tradingPair: actualPair,
          bestBid: prices.bestBid,
          bestAsk: prices.bestAsk,
          spread: stats.spread,
          midPrice: stats.midPrice,
          bidCount: stats.bidCount,
          askCount: stats.askCount,
          timestamp: new Date().toISOString()
        }
      }
    } catch (error) {
      return {
        success: false,
        error: 'Failed to fetch ticker data',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }, {
    params: t.Object({
      tradingPair: t.String()
    })
  })

  // Get order book statistics
  .get('/:tradingPair/stats', async ({ params: { tradingPair }, formatTradingPair }) => {
    try {
      const actualPair = formatTradingPair(tradingPair)
      const stats = await orderBookService.getOrderBookStats(actualPair)
      
      return {
        success: true,
        data: {
          tradingPair: actualPair,
          ...stats,
          timestamp: new Date().toISOString()
        }
      }
    } catch (error) {
      return {
        success: false,
        error: 'Failed to fetch order book stats',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }, {
    params: t.Object({
      tradingPair: t.String()
    })
  })

  // Get matching engine configuration
  .get('/:tradingPair/config', async ({ params: { tradingPair }, formatTradingPair }) => {
    try {
      const actualPair = formatTradingPair(tradingPair)
      const config = await matchingService.getMatchingConfig(actualPair)
      
      if (!config) {
        return {
          success: false,
          error: 'Trading pair not found'
        }
      }
      
      return {
        success: true,
        data: config
      }
    } catch (error) {
      return {
        success: false,
        error: 'Failed to fetch matching config',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }, {
    params: t.Object({
      tradingPair: t.String()
    })
  })

  // Admin: Clear order book (requires authentication)
  .delete('/:tradingPair/clear', async ({ params: { tradingPair }, headers, formatTradingPair }) => {
    try {
      const auth = await authMiddleware({ headers })
      const actualPair = formatTradingPair(tradingPair)
      await matchingService.clearTradingPair(actualPair)
      
      return {
        success: true,
        message: `Order book cleared for ${actualPair}`
      }
    } catch (error) {
      return {
        success: false,
        error: 'Failed to clear order book',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }, {
    params: t.Object({
      tradingPair: t.String()
    })
  })

  // Process new order (replace the old ledger order endpoint)
  .post('/order', async ({ body, headers }: { body: any, headers: any }) => {
    try {
      const auth = await authMiddleware({ headers })
      const orderData = {
        tradingPair: body.tradingPair,
        side: body.side,
        amount: body.amount,
        orderType: body.type as 'market' | 'limit',
        timeInForce: 'GTC' as const,
        price: body.price
      }
      
      const result = await matchingService.processOrder(auth.user.id, orderData)
      
      return {
        success: true,
        data: result
      }
    } catch (error) {
      return {
        success: false,
        error: 'Failed to process order',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }, {
    body: t.Object({
      tradingPair: t.String(),
      side: t.Union([t.Literal('buy'), t.Literal('sell')]),
      type: t.Union([t.Literal('market'), t.Literal('limit')]),
      amount: t.String(),
      price: t.Optional(t.String())
    })
  })

  // Cancel order
  .delete('/order/:orderId', async ({ params: { orderId }, headers }) => {
    try {
      const auth = await authMiddleware({ headers })
      const order = await matchingService.cancelOrder(auth.user.id, orderId)
      
      return {
        success: true,
        data: order,
        message: 'Order cancelled successfully'
      }
    } catch (error) {
      return {
        success: false,
        error: 'Failed to cancel order',
        details: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }, {
    params: t.Object({
      orderId: t.String()
    })
  }) 