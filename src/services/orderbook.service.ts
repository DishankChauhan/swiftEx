import redis from '../config/redis'
import { prisma } from '../config/database'
import { webSocketService } from './websocket.service'

// Define Redis keys
const REDIS_KEYS = {
  orderBookBids: (tradingPair: string) => `orderbook:${tradingPair.replace('/', '')}:bids`,
  orderBookAsks: (tradingPair: string) => `orderbook:${tradingPair.replace('/', '')}:asks`,
  order: (orderId: string) => `order:${orderId}`,
  userOrders: (userId: string) => `user:${userId}:orders`,
  sequence: (tradingPair: string) => `sequence:${tradingPair.replace('/', '')}`
}

export class OrderBookService {
  /**
   * Add order to order book in Redis
   * Uses sorted sets for efficient price-time priority
   */
  async addOrderToBook(order: any): Promise<void> {
    const price = parseFloat(order.price!)
    const score = order.side === 'buy' ? -price : price // Negative for bids to sort DESC

    const key = order.side === 'buy'
      ? REDIS_KEYS.orderBookBids(order.tradingPair)
      : REDIS_KEYS.orderBookAsks(order.tradingPair)

    const orderData = {
      orderId: order.id,
      userId: order.userId,
      price: order.price!,
      amount: order.remaining,
      side: order.side,
      timestamp: order.createdAt.toISOString()
    }

    await Promise.all([
      redis.zAdd(key, { score, value: order.id }),
      redis.hSet(REDIS_KEYS.order(order.id), orderData),
      redis.sAdd(REDIS_KEYS.userOrders(order.userId), order.id)
    ])

    // Broadcast order book update to WebSocket subscribers
    await this.broadcastOrderBookUpdate(order.tradingPair)
  }

  /**
   * Remove order from order book
   */
  async removeOrderFromBook(orderId: string): Promise<void> {
    const orderData = await redis.hGetAll(REDIS_KEYS.order(orderId))
    if (!orderData.orderId) return

    // Get order details from database to determine which book to remove from
    const order = await prisma.order.findUnique({ where: { id: orderId } })
    if (!order) return

    const key = order.side === 'buy'
      ? REDIS_KEYS.orderBookBids(order.tradingPair)
      : REDIS_KEYS.orderBookAsks(order.tradingPair)

    await Promise.all([
      redis.zRem(key, orderId),
      redis.del(REDIS_KEYS.order(orderId)),
      redis.sRem(REDIS_KEYS.userOrders(order.userId), orderId)
    ])

    // Broadcast order book update to WebSocket subscribers
    await this.broadcastOrderBookUpdate(order.tradingPair)
  }

  /**
   * Update order amount in order book
   */
  async updateOrderInBook(orderId: string, newAmount: string): Promise<void> {
    const orderKey = REDIS_KEYS.order(orderId)
    const orderData = await redis.hGetAll(orderKey)
    
    await redis.hSet(orderKey, 'amount', newAmount)

    // If we have the trading pair info, broadcast update
    if (orderData.orderId) {
      const order = await prisma.order.findUnique({ where: { id: orderId } })
      if (order) {
        await this.broadcastOrderBookUpdate(order.tradingPair)
      }
    }
  }

  /**
   * Get order book snapshot
   */
  async getOrderBook(tradingPair: string, depth: number = 20): Promise<any> {
    try {
      const orderBookKey = `orderbook:${tradingPair.replace('/', '')}`
      
      // Get bids and asks from Redis sorted sets
      const [bidOrderIds, askOrderIds] = await Promise.all([
        redis.zRange(`${orderBookKey}:bids`, 0, depth - 1, { REV: true }),
        redis.zRange(`${orderBookKey}:asks`, 0, depth - 1)
      ])

      // Get order details for bids and asks
      const [bidOrders, askOrders] = await Promise.all([
        this.getOrderLevels(bidOrderIds),
        this.getOrderLevels(askOrderIds)
      ])

      // Aggregate orders by price level
      const bids = this.aggregateOrderLevels(bidOrders)
      const asks = this.aggregateOrderLevels(askOrders)

      // Calculate spread
      let spread = { absolute: '0', percentage: '0' }
      if (bids.length > 0 && asks.length > 0) {
        const bestBid = parseFloat(bids[0].price)
        const bestAsk = parseFloat(asks[0].price)
        const absoluteSpread = bestAsk - bestBid
        const percentageSpread = (absoluteSpread / bestBid) * 100
        
        spread = {
          absolute: absoluteSpread.toString(),
          percentage: percentageSpread.toString()
        }
      }

      return {
        tradingPair,
        timestamp: Date.now(),
        bids,
        asks,
        spread
      }
    } catch (error) {
      console.error('Error fetching order book:', error)
      throw new Error('Failed to fetch order book')
    }
  }

  /**
   * Get order details from Redis
   */
  private async getOrderLevels(orderIds: string[]): Promise<any[]> {
    if (orderIds.length === 0) return []

    const orders: any[] = []
    for (const orderId of orderIds) {
      const orderData = await redis.hGetAll(REDIS_KEYS.order(orderId))
      if (orderData.orderId) {
        orders.push({
          price: orderData.price,
          amount: orderData.amount,
          orderId: orderData.orderId,
          userId: orderData.userId,
          timestamp: orderData.timestamp
        })
      }
    }
    return orders
  }

  /**
   * Aggregate orders by price level
   */
  private aggregateOrderLevels(orders: any[]): any[] {
    const priceMap = new Map<string, { amount: number; count: number }>()
    
    for (const order of orders) {
      const existing = priceMap.get(order.price) || { amount: 0, count: 0 }
      existing.amount += parseFloat(order.amount)
      existing.count += 1
      priceMap.set(order.price, existing)
    }

    const levels: any[] = []
    let runningTotal = 0

    for (const [price, { amount, count }] of priceMap) {
      runningTotal += amount
      levels.push({
        price,
        amount: amount.toString(),
        total: runningTotal.toString(),
        count
      })
    }

    return levels
  }

  /**
   * Get best bid and ask prices
   */
  async getBestPrices(tradingPair: string): Promise<{ bestBid: string | null, bestAsk: string | null }> {
    try {
      const orderBookKey = `orderbook:${tradingPair.replace('/', '')}`
      
      const [bestBidResult, bestAskResult] = await Promise.all([
        redis.zRange(`${orderBookKey}:bids`, 0, 0, { REV: true }),
        redis.zRange(`${orderBookKey}:asks`, 0, 0)
      ])

      const bestBid = bestBidResult.length > 1 ? bestBidResult[1] : null
      const bestAsk = bestAskResult.length > 1 ? bestAskResult[1] : null

      return { bestBid, bestAsk }
    } catch (error) {
      console.error('Error getting best prices:', error)
      return { bestBid: null, bestAsk: null }
    }
  }

  /**
   * Find matching orders for a new order
   */
  async findMatches(
    newOrder: any,
    maxMatches: number = 100
  ): Promise<any[]> {
    const matches: any[] = []
    let remainingAmount = parseFloat(newOrder.remaining)

    // Determine which side of the book to check
    const isNewOrderBuy = newOrder.side === 'buy'
    const bookKey = isNewOrderBuy 
      ? REDIS_KEYS.orderBookAsks(newOrder.tradingPair) // Buy order matches with asks
      : REDIS_KEYS.orderBookBids(newOrder.tradingPair) // Sell order matches with bids

    // Get orders from the book that can match
    const candidateOrderIds = isNewOrderBuy
      ? await redis.zRange(bookKey, 0, maxMatches - 1) // Lowest asks first
      : await redis.zRange(bookKey, 0, maxMatches - 1, { REV: true }) // Highest bids first

    for (const candidateOrderId of candidateOrderIds) {
      if (remainingAmount <= 0) break

      const candidateOrderData = await redis.hGetAll(REDIS_KEYS.order(candidateOrderId))
      if (!candidateOrderData.orderId) continue

      const candidatePrice = parseFloat(candidateOrderData.price)
      const newOrderPrice = parseFloat(newOrder.price!)

      // Check if prices can match
      const canMatch = isNewOrderBuy 
        ? newOrderPrice >= candidatePrice // Buy order price >= ask price
        : newOrderPrice <= candidatePrice // Sell order price <= bid price

      if (!canMatch) break // No more matches possible due to price ordering

      // Calculate match amount
      const candidateAmount = parseFloat(candidateOrderData.amount)
      const matchAmount = Math.min(remainingAmount, candidateAmount)

      // Execute price is the maker's price (price-time priority)
      const executePrice = candidatePrice

      // Calculate fees (simplified - should be based on trading pair config)
      const makerFee = (matchAmount * executePrice * 0.001).toString() // 0.1% maker fee
      const takerFee = (matchAmount * executePrice * 0.001).toString() // 0.1% taker fee

      matches.push({
        orderId: newOrder.id,
        counterOrderId: candidateOrderId,
        amount: matchAmount.toString(),
        price: executePrice.toString(),
        fee: takerFee,
        feeAsset: isNewOrderBuy ? newOrder.tradingPair.split('/')[0] : newOrder.tradingPair.split('/')[1],
        isMaker: false, // New order is always taker
        userId: newOrder.userId,
        timestamp: new Date().toISOString()
      })

      remainingAmount -= matchAmount
    }

    return matches
  }

  /**
   * Process order matches and update balances
   */
  async processMatches(matches: any[]): Promise<void> {
    if (matches.length === 0) return

    // Process each match
    for (const match of matches) {
      await this.executeMatch(match)
    }
  }

  /**
   * Execute a single match
   */
  private async executeMatch(match: any): Promise<void> {
    // Update maker order amount
    const makerOrderData = await redis.hGetAll(REDIS_KEYS.order(match.counterOrderId))
    if (makerOrderData.orderId) {
      const newAmount = parseFloat(makerOrderData.amount) - parseFloat(match.amount)
      
      if (newAmount <= 0) {
        // Remove completely filled order
        await this.removeOrderFromBook(match.counterOrderId)
      } else {
        // Update partially filled order
        await this.updateOrderInBook(match.counterOrderId, newAmount.toString())
      }
    }

    // Store the trade for history and market data
    await this.recordTrade(match)
  }

  /**
   * Record a trade for market data and history
   */
  private async recordTrade(match: any): Promise<void> {
    // This would typically store in a trades list for market data
    // For now, we'll just increment sequence
    const order = await prisma.order.findUnique({ where: { id: match.orderId } })
    if (order) {
      await this.getNextSequence(order.tradingPair)
    }
  }

  /**
   * Get and increment sequence number for ordering events
   */
  private async getNextSequence(tradingPair: string): Promise<number> {
    return await redis.incr(REDIS_KEYS.sequence(tradingPair))
  }

  /**
   * Clear order book for a trading pair (for testing/admin)
   */
  async clearOrderBook(tradingPair: string): Promise<void> {
    await Promise.all([
      redis.del(REDIS_KEYS.orderBookBids(tradingPair)),
      redis.del(REDIS_KEYS.orderBookAsks(tradingPair)),
      redis.del(REDIS_KEYS.sequence(tradingPair))
    ])
  }

  /**
   * Get order book statistics
   */
  async getOrderBookStats(tradingPair: string): Promise<{
    bidCount: number
    askCount: number
    spread?: string
    midPrice?: string
  }> {
    const [bidCount, askCount, prices] = await Promise.all([
      redis.zCard(REDIS_KEYS.orderBookBids(tradingPair)),
      redis.zCard(REDIS_KEYS.orderBookAsks(tradingPair)),
      this.getBestPrices(tradingPair)
    ])

    let spread: string | undefined
    let midPrice: string | undefined

    if (prices.bestBid && prices.bestAsk) {
      const bid = parseFloat(prices.bestBid)
      const ask = parseFloat(prices.bestAsk)
      spread = (ask - bid).toString()
      midPrice = ((bid + ask) / 2).toString()
    }

    return {
      bidCount,
      askCount,
      spread,
      midPrice
    }
  }

  /**
   * Broadcast order book update via WebSocket
   */
  private async broadcastOrderBookUpdate(tradingPair: string): Promise<void> {
    try {
      // Get updated order book
      const orderBook = await this.getOrderBook(tradingPair, 20)
      
      // Broadcast to WebSocket subscribers
      await webSocketService.broadcastOrderBookUpdate(tradingPair, orderBook)
      
      console.log(`📡 Broadcasted order book update for ${tradingPair}`)
    } catch (error) {
      console.error(`Failed to broadcast order book update for ${tradingPair}:`, error)
    }
  }

  /**
   * Find matches for market orders - matches all available liquidity
   */
  async findMarketMatches(
    newOrder: any,
    maxMatches: number = 100
  ): Promise<any[]> {
    const matches: any[] = []
    const isNewOrderBuy = newOrder.side === 'buy'
    
    // Get appropriate order book side
    const orderBookKey = isNewOrderBuy 
      ? REDIS_KEYS.orderBookAsks(newOrder.tradingPair) // Buy orders match against asks
      : REDIS_KEYS.orderBookBids(newOrder.tradingPair) // Sell orders match against bids

    // Get all orders from the order book (sorted by price-time priority)
    const candidateOrderIds = await redis.zRange(orderBookKey, 0, maxMatches - 1)
    
    let remainingAmount = parseFloat(newOrder.amount)

    for (const candidateOrderId of candidateOrderIds) {
      if (remainingAmount <= 0 || matches.length >= maxMatches) break

      const candidateOrderData = await redis.hGetAll(REDIS_KEYS.order(candidateOrderId))
      if (!candidateOrderData.orderId) continue

      const candidatePrice = parseFloat(candidateOrderData.price)
      
      // For market orders, we accept ANY price (no price checking)
      // Calculate match amount
      const candidateAmount = parseFloat(candidateOrderData.amount)
      const matchAmount = Math.min(remainingAmount, candidateAmount)

      // Execute price is the maker's price (price-time priority)
      const executePrice = candidatePrice

      // Calculate fees
      const makerFee = (matchAmount * executePrice * 0.001).toString() // 0.1% maker fee
      const takerFee = (matchAmount * executePrice * 0.001).toString() // 0.1% taker fee

      matches.push({
        orderId: newOrder.id,
        counterOrderId: candidateOrderId,
        amount: matchAmount.toString(),
        price: executePrice.toString(),
        fee: takerFee,
        feeAsset: isNewOrderBuy ? newOrder.tradingPair.split('/')[0] : newOrder.tradingPair.split('/')[1],
        isMaker: false, // New order is always taker
        userId: newOrder.userId,
        timestamp: new Date().toISOString()
      })

      remainingAmount -= matchAmount
    }

    return matches
  }
}

export const orderBookService = new OrderBookService() 