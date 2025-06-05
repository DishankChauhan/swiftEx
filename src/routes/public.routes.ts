import { Elysia } from 'elysia'
import { marketMakerService } from '../services/market-maker.service'
import { orderBookService } from '../services/orderbook.service'

export const publicRoutes = new Elysia({ prefix: '/public' })
  
  // Get current Binance prices (public)
  .get('/prices', async () => {
    try {
      const prices = {
        'SOL/USDC': marketMakerService.getBinancePrice('SOL/USDC'),
        'ETH/USDC': marketMakerService.getBinancePrice('ETH/USDC')
      };
      
      return {
        success: true,
        data: prices
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get prices'
      };
    }
  })

  // Get order book (public)
  .get('/orderbook/:pair', async ({ params }) => {
    try {
      const { pair } = params;
      const orderBook = await orderBookService.getOrderBook(pair);
      
      return {
        success: true,
        data: orderBook
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get order book'
      };
    }
  })

  // Get market ticker (public)
  .get('/ticker/:pair', async ({ params }) => {
    try {
      const { pair } = params;
      const orderBook = await orderBookService.getOrderBook(pair);
      const currentPrice = marketMakerService.getBinancePrice(pair);
      
      // Calculate 24h stats (simplified)
      const ticker = {
        pair,
        price: currentPrice,
        bids: orderBook.bids.length,
        asks: orderBook.asks.length,
        bestBid: orderBook.bids[0]?.price || null,
        bestAsk: orderBook.asks[0]?.price || null,
        spread: orderBook.bids[0] && orderBook.asks[0] ? 
          (parseFloat(orderBook.asks[0].price) - parseFloat(orderBook.bids[0].price)) : 0,
        timestamp: new Date().toISOString()
      };
      
      return {
        success: true,
        data: ticker
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get ticker'
      };
    }
  })

  // Get market maker statistics (public)
  .get('/market-maker/stats', async () => {
    try {
      const config = Object.fromEntries(marketMakerService.getConfig());
      const prices = {
        'SOL/USDC': marketMakerService.getBinancePrice('SOL/USDC'),
        'ETH/USDC': marketMakerService.getBinancePrice('ETH/USDC')
      };
      
      return {
        success: true,
        data: {
          config,
          prices,
          status: 'active',
          lastUpdate: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get market maker stats'
      };
    }
  }); 