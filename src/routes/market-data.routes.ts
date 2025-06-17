import { Elysia, t } from 'elysia'
import { marketDataService } from '../services/market-data.service'

export const marketDataRoutes = new Elysia({ prefix: '/api/market-data' })
  // Rate limiting can be added via global middleware in main app

  // Get candlestick data for charts
  .get('/candles/:tradingPair', async ({ params, query }) => {
    try {
      const { tradingPair } = params
      // Decode URL-encoded trading pair (e.g., SOL%2FUSDC -> SOL/USDC)
      const decodedTradingPair = decodeURIComponent(tradingPair)
      
      const { 
        interval = '1h', 
        limit = 500, 
        startTime, 
        endTime 
      } = query

      const candles = await marketDataService.getCandles(
        decodedTradingPair,
        interval,
        parseInt(limit.toString()),
        startTime ? new Date(startTime.toString()) : undefined,
        endTime ? new Date(endTime.toString()) : undefined
      )

      return {
        success: true,
        data: {
          symbol: decodedTradingPair,
          interval,
          candles
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get candlestick data'
      }
    }
  }, {
    params: t.Object({
      tradingPair: t.String()
    }),
    query: t.Object({
      interval: t.Optional(t.String()),
      limit: t.Optional(t.Union([t.String(), t.Number()])),
      startTime: t.Optional(t.String()),
      endTime: t.Optional(t.String())
    })
  })

  // Get 24h ticker statistics
  .get('/ticker/:tradingPair', async ({ params }) => {
    try {
      const { tradingPair } = params
      // Decode URL-encoded trading pair
      const decodedTradingPair = decodeURIComponent(tradingPair)
      
      const ticker = await marketDataService.get24hTicker(decodedTradingPair)

      if (!ticker) {
        return {
          success: false,
          error: 'No trading data found for this pair'
        }
      }

      return {
        success: true,
        data: ticker
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get ticker data'
      }
    }
  }, {
    params: t.Object({
      tradingPair: t.String()
    })
  })

  // Get all tickers
  .get('/ticker', async () => {
    try {
      const tradingPairs = ['SOL/USDC', 'ETH/USDC', 'BTC/USDC'] // Get from config
      
      const tickers = await Promise.all(
        tradingPairs.map(async (pair) => {
          try {
            return await marketDataService.get24hTicker(pair)
          } catch (error) {
            console.error(`Failed to get ticker for ${pair}:`, error)
            return null
          }
        })
      )

      return {
        success: true,
        data: tickers.filter(ticker => ticker !== null)
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get tickers'
      }
    }
  })

  // Get recent trades
  .get('/trades/:tradingPair', async ({ params, query }) => {
    try {
      const { tradingPair } = params
      // Decode URL-encoded trading pair
      const decodedTradingPair = decodeURIComponent(tradingPair)
      
      const { limit = 100 } = query

      const trades = await marketDataService.getRecentTrades(
        decodedTradingPair,
        parseInt(limit.toString())
      )

      return {
        success: true,
        data: {
          symbol: decodedTradingPair,
          trades
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get recent trades'
      }
    }
  }, {
    params: t.Object({
      tradingPair: t.String()
    }),
    query: t.Object({
      limit: t.Optional(t.Union([t.String(), t.Number()]))
    })
  })

  // Get trading pairs info
  .get('/pairs', async () => {
    try {
      // This could be fetched from database in real implementation
      const tradingPairs = [
        {
          symbol: 'SOL/USDC',
          baseAsset: 'SOL',
          quoteAsset: 'USDC',
          status: 'trading',
          baseAssetPrecision: 8,
          quoteAssetPrecision: 8,
          minTradeAmount: '0.01',
          maxTradeAmount: '100000',
          minPrice: '0.01',
          maxPrice: '100000',
          tickSize: '0.01'
        },
        {
          symbol: 'ETH/USDC',
          baseAsset: 'ETH',
          quoteAsset: 'USDC',
          status: 'trading',
          baseAssetPrecision: 8,
          quoteAssetPrecision: 8,
          minTradeAmount: '0.001',
          maxTradeAmount: '10000',
          minPrice: '0.01',
          maxPrice: '100000',
          tickSize: '0.01'
        }
      ]

      return {
        success: true,
        data: tradingPairs
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get trading pairs'
      }
    }
  })

  // Health check for market data service
  .get('/health', async () => {
    try {
      // Quick check if TimescaleDB is responsive
      await marketDataService.getRecentTrades('SOL/USDC', 1)
      
      return {
        success: true,
        status: 'healthy',
        service: 'market-data',
        timestamp: new Date().toISOString()
      }
    } catch (error) {
      return {
        success: false,
        status: 'unhealthy',
        service: 'market-data',
        error: error instanceof Error ? error.message : 'Health check failed',
        timestamp: new Date().toISOString()
      }
    }
  }) 