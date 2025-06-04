import redis from '../config/redis'
import {
  OrderBookSnapshot,
  OrderBookLevel,
  OrderBookUpdate,
  PriceLevel,
  REDIS_KEYS,
  OrderProcessingResult,
  OrderMatch
} from '../types/matching'
import { prisma } from '../config/database'
import type { Order } from '../types/ledger'

export class OrderBookService {
  /**
   * Add order to order book in Redis
   * Uses sorted sets for efficient price-time priority
   */
  async addOrderToBook(order: Order): Promise<void> {
    const key = order.side === 'buy' 
      ? REDIS_KEYS.orderBookBids(order.tradingPair)
      : REDIS_KEYS.orderBookAsks(order.tradingPair)

    // For bids: higher price = higher score (descending order)
    // For asks: lower price = higher score (ascending order)
    const score = order.side === 'buy' 
      ? parseFloat(order.price!) * 1000000 + (999999999 - new Date(order.createdAt).getTime())
      : parseFloat(order.price!) * 1000000 + new Date(order.createdAt).getTime()

    const orderData = {
      price: order.price!,
      amount: order.remaining,
      orderId: order.id,
      userId: order.userId,
      timestamp: order.createdAt.toISOString()
    }

    // Add to sorted set and store order data
    await Promise.all([
      redis.zAdd(key, { score, value: order.id }),
      redis.hSet(REDIS_KEYS.order(order.id), orderData),
      redis.sAdd(REDIS_KEYS.userOrders(order.userId), order.id)
    ])
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
  }

  /**
   * Update order amount in order book
   */
  async updateOrderInBook(orderId: string, newAmount: string): Promise<void> {
    const orderKey = REDIS_KEYS.order(orderId)
    await redis.hSet(orderKey, 'amount', newAmount)
  }

  /**
   * Get order book snapshot
   */
  async getOrderBook(tradingPair: string, depth: number = 20): Promise<OrderBookSnapshot> {
    const bidsKey = REDIS_KEYS.orderBookBids(tradingPair)
    const asksKey = REDIS_KEYS.orderBookAsks(tradingPair)

    // Get top bids (highest prices first) and asks (lowest prices first)
    const [bidOrderIds, askOrderIds] = await Promise.all([
      redis.zRange(bidsKey, 0, depth - 1, { REV: true }), // Reverse for highest first
      redis.zRange(asksKey, 0, depth - 1) // Normal for lowest first
    ])

    // Get order details for bids and asks
    const [bidOrders, askOrders] = await Promise.all([
      this.getOrderLevels(bidOrderIds),
      this.getOrderLevels(askOrderIds)
    ])

    // Aggregate by price level
    const bids = this.aggregateOrderLevels(bidOrders)
    const asks = this.aggregateOrderLevels(askOrders)

    // Get sequence number
    const sequence = await this.getNextSequence(tradingPair)

    return {
      tradingPair,
      bids,
      asks,
      lastUpdated: new Date().toISOString(),
      sequence
    }
  }

  /**
   * Get order details from Redis
   */
  private async getOrderLevels(orderIds: string[]): Promise<PriceLevel[]> {
    if (orderIds.length === 0) return []

    const orders: PriceLevel[] = []
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
  private aggregateOrderLevels(orders: PriceLevel[]): OrderBookLevel[] {
    const priceMap = new Map<string, { amount: number; count: number }>()
    
    for (const order of orders) {
      const existing = priceMap.get(order.price) || { amount: 0, count: 0 }
      existing.amount += parseFloat(order.amount)
      existing.count += 1
      priceMap.set(order.price, existing)
    }

    const levels: OrderBookLevel[] = []
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
  async getBestPrices(tradingPair: string): Promise<{ bestBid?: string; bestAsk?: string }> {
    const bidsKey = REDIS_KEYS.orderBookBids(tradingPair)
    const asksKey = REDIS_KEYS.orderBookAsks(tradingPair)

    const [bestBidIds, bestAskIds] = await Promise.all([
      redis.zRange(bidsKey, 0, 0, { REV: true }), // Highest bid
      redis.zRange(asksKey, 0, 0) // Lowest ask
    ])

    let bestBid: string | undefined
    let bestAsk: string | undefined

    if (bestBidIds.length > 0) {
      const bidData = await redis.hGet(REDIS_KEYS.order(bestBidIds[0]), 'price')
      bestBid = bidData || undefined
    }

    if (bestAskIds.length > 0) {
      const askData = await redis.hGet(REDIS_KEYS.order(bestAskIds[0]), 'price')
      bestAsk = askData || undefined
    }

    return { bestBid, bestAsk }
  }

  /**
   * Find matching orders for a new order
   */
  async findMatches(
    newOrder: Order,
    maxMatches: number = 100
  ): Promise<OrderMatch[]> {
    const matches: OrderMatch[] = []
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
  async processMatches(matches: OrderMatch[]): Promise<void> {
    if (matches.length === 0) return

    // Process each match
    for (const match of matches) {
      await this.executeMatch(match)
    }
  }

  /**
   * Execute a single match
   */
  private async executeMatch(match: OrderMatch): Promise<void> {
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
  private async recordTrade(match: OrderMatch): Promise<void> {
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
}

export const orderBookService = new OrderBookService() 