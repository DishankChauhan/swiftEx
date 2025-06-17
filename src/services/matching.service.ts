import { prisma } from '../config/database'
import { ledgerService } from './ledger.service'
import { orderBookService } from './orderbook.service'
import type { Prisma } from '@prisma/client'

export class MatchingService {
  /**
   * Process a new order through the matching engine
   */
  async processOrder(userId: string, orderData: any): Promise<any> {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      try {
        // 1. Create the order in database first (with balance locking)
        const order = await ledgerService.createOrder(userId, orderData)

        // 2. Handle market orders vs limit orders differently
        if (orderData.orderType === 'market') {
          return await this.processMarketOrder(order, tx)
        } else {
          return await this.processLimitOrder(order, tx)
        }

      } catch (error) {
        // If anything fails, the transaction will rollback
        throw error
      }
    })
  }

  /**
   * Process a market order - execute immediately at best available prices
   */
  private async processMarketOrder(order: any, tx: Prisma.TransactionClient): Promise<any> {
    // Market orders execute immediately against the order book
    const matches = await orderBookService.findMarketMatches(order)

    if (!matches || matches.length === 0) {
      // No matches available, reject the market order
      throw new Error('No liquidity available for market order')
    }

    // Process all available matches
    const processedMatches = await this.executeMatches(order, matches, tx)

    // Calculate final state
    const totalFilled = processedMatches.reduce(
      (sum, match) => sum + parseFloat(match.amount), 
      0
    )
    const remaining = parseFloat(order.remaining) - totalFilled

    // Market orders are either filled or partially filled, never pending
    let status: 'filled' | 'partial' = remaining <= 0 ? 'filled' : 'partial'

    // Update the order in database
    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        filled: totalFilled.toString(),
        remaining: remaining.toString(),
        status: status,
        filledAt: new Date(),
        averagePrice: processedMatches.length > 0 
          ? this.calculateAveragePrice(processedMatches).toString()
          : null
      }
    })

    // Market orders never go to the order book
    // If partially filled, unlock the remaining locked balance
    if (remaining > 0) {
      await this.unlockRemainingMarketOrderBalance(order, remaining, tx)
    }

    return {
      orderId: order.id,
      status,
      filled: totalFilled.toString(),
      remaining: remaining.toString(),
      averagePrice: processedMatches.length > 0 
        ? this.calculateAveragePrice(processedMatches).toString()
        : undefined,
      matches: processedMatches
    }
  }

  /**
   * Process a limit order - normal order book behavior
   */
  private async processLimitOrder(order: any, tx: Prisma.TransactionClient): Promise<any> {
    // Find matches in the order book
    const matches = await orderBookService.findMatches(order)

    // Process matches and update orders
    const processedMatches = await this.executeMatches(order, matches, tx)

    // Calculate remaining amount after matches
    const totalFilled = processedMatches.reduce(
      (sum, match) => sum + parseFloat(match.amount), 
      0
    )
    const remaining = parseFloat(order.remaining) - totalFilled

    // Update order status and filled amounts
    let status: 'filled' | 'partial' | 'pending' = 'pending'
    if (remaining <= 0) {
      status = 'filled'
    } else if (totalFilled > 0) {
      status = 'partial'
    }

    const updatedOrder = await tx.order.update({
      where: { id: order.id },
      data: {
        filled: totalFilled.toString(),
        remaining: remaining.toString(),
        status: status,
        filledAt: status === 'filled' ? new Date() : null,
        averagePrice: processedMatches.length > 0 
          ? this.calculateAveragePrice(processedMatches).toString()
          : null
      }
    })

    // Add remaining order to order book if not fully filled
    if (remaining > 0) {
      await orderBookService.addOrderToBook({
        ...updatedOrder,
        createdAt: updatedOrder.createdAt,
        updatedAt: updatedOrder.updatedAt,
        filledAt: updatedOrder.filledAt,
        cancelledAt: updatedOrder.cancelledAt
      })
    }

    return {
      orderId: order.id,
      status,
      filled: totalFilled.toString(),
      remaining: remaining.toString(),
      averagePrice: processedMatches.length > 0 
        ? this.calculateAveragePrice(processedMatches).toString()
        : undefined,
      matches: processedMatches
    }
  }

  /**
   * Unlock remaining balance for partially filled market orders
   */
  private async unlockRemainingMarketOrderBalance(
    order: any, 
    remaining: number, 
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const [baseAsset, quoteAsset] = order.tradingPair.split('/')
    
    if (order.side === 'buy') {
      // For buy market orders, we need to estimate how much USDC to unlock
      // This is tricky since we don't know the exact cost of remaining amount
      // We'll use a conservative approach and unlock based on locked amount ratio
      const filledRatio = (parseFloat(order.amount) - remaining) / parseFloat(order.amount)
      const totalLocked = parseFloat(order.lockedAmount)
      const shouldRemainLocked = totalLocked * filledRatio
      const toUnlock = totalLocked - shouldRemainLocked
      
      if (toUnlock > 0) {
        await ledgerService.executeBalanceOperation({
          userId: order.userId,
          asset: quoteAsset,
          amount: toUnlock.toString(),
          operation: 'unlock',
          orderId: order.id,
          description: `Unlock remaining ${quoteAsset} from partially filled market buy order`
        })
      }
    } else {
      // For sell market orders, unlock the remaining base asset amount
      await ledgerService.executeBalanceOperation({
        userId: order.userId,
        asset: baseAsset,
        amount: remaining.toString(),
        operation: 'unlock',
        orderId: order.id,
        description: `Unlock remaining ${baseAsset} from partially filled market sell order`
      })
    }
  }

  /**
   * Execute order matches and update balances
   */
  private async executeMatches(
    takerOrder: any,
    matches: any[],
    tx: Prisma.TransactionClient
  ): Promise<any[]> {
    const processedMatches: any[] = []

    for (const match of matches) {
      try {
        // Get maker order details
        const makerOrder = await tx.order.findUnique({
          where: { id: match.counterOrderId }
        })

        if (!makerOrder) continue

        // Update maker order
        const makerFilled = parseFloat(makerOrder.filled) + parseFloat(match.amount)
        const makerRemaining = parseFloat(makerOrder.remaining) - parseFloat(match.amount)
        
        let makerStatus = makerOrder.status
        if (makerRemaining <= 0) {
          makerStatus = 'filled'
          // Remove from order book if fully filled
          await orderBookService.removeOrderFromBook(makerOrder.id)
        } else {
          makerStatus = 'partial'
          // Update amount in order book
          await orderBookService.updateOrderInBook(makerOrder.id, makerRemaining.toString())
        }

        await tx.order.update({
          where: { id: makerOrder.id },
          data: {
            filled: makerFilled.toString(),
            remaining: makerRemaining.toString(),
            status: makerStatus,
            filledAt: makerStatus === 'filled' ? new Date() : makerOrder.filledAt
          }
        })

        // Create order fills for both orders
        await Promise.all([
          // Maker fill
          tx.orderFill.create({
            data: {
              orderId: makerOrder.id,
              amount: match.amount,
              price: match.price,
              fee: this.calculateMakerFee(match.amount, match.price).toString(),
              feeAsset: takerOrder.side === 'buy' ? takerOrder.tradingPair.split('/')[1] : takerOrder.tradingPair.split('/')[0],
              isMaker: true
            }
          }),
          // Taker fill
          tx.orderFill.create({
            data: {
              orderId: takerOrder.id,
              amount: match.amount,
              price: match.price,
              fee: match.fee,
              feeAsset: match.feeAsset,
              isMaker: false
            }
          })
        ])

        // Update balances for both users
        await this.updateBalancesForTrade(takerOrder, makerOrder, match, tx)

        processedMatches.push(match)

      } catch (error) {
        console.error('Error executing match:', error)
        // Continue with other matches, but log the error
      }
    }

    return processedMatches
  }

  /**
   * Update balances for a completed trade
   */
  private async updateBalancesForTrade(
    takerOrder: any,
    makerOrder: any,
    match: any,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const [baseAsset, quoteAsset] = takerOrder.tradingPair.split('/')
    const tradeAmount = parseFloat(match.amount)
    const tradePrice = parseFloat(match.price)
    const quoteAmount = tradeAmount * tradePrice

    if (takerOrder.side === 'buy') {
      // Taker is buying (base asset), maker is selling
      // Taker: unlock USDC (locked), add SOL (available)
      // Maker: unlock SOL (locked), add USDC (available)

      // Taker gets base asset, pays quote asset
      await Promise.all([
        // Unlock taker's quote asset (already locked)
        ledgerService.executeBalanceOperation({
          userId: takerOrder.userId,
          asset: quoteAsset,
          amount: quoteAmount.toString(),
          operation: 'unlock',
          orderId: takerOrder.id,
          description: `Trade execution: bought ${tradeAmount} ${baseAsset}`
        }),
        // Add base asset to taker
        ledgerService.executeBalanceOperation({
          userId: takerOrder.userId,
          asset: baseAsset,
          amount: tradeAmount.toString(),
          operation: 'add',
          orderId: takerOrder.id,
          description: `Trade execution: bought ${tradeAmount} ${baseAsset}`
        }),
        // Unlock maker's base asset (already locked)
        ledgerService.executeBalanceOperation({
          userId: makerOrder.userId,
          asset: baseAsset,
          amount: tradeAmount.toString(),
          operation: 'unlock',
          orderId: makerOrder.id,
          description: `Trade execution: sold ${tradeAmount} ${baseAsset}`
        }),
        // Add quote asset to maker
        ledgerService.executeBalanceOperation({
          userId: makerOrder.userId,
          asset: quoteAsset,
          amount: quoteAmount.toString(),
          operation: 'add',
          orderId: makerOrder.id,
          description: `Trade execution: sold ${tradeAmount} ${baseAsset}`
        })
      ])
    } else {
      // Taker is selling (base asset), maker is buying
      // Taker: unlock SOL (locked), add USDC (available)
      // Maker: unlock USDC (locked), add SOL (available)

      // Taker gets quote asset, pays base asset
      await Promise.all([
        // Unlock taker's base asset (already locked)
        ledgerService.executeBalanceOperation({
          userId: takerOrder.userId,
          asset: baseAsset,
          amount: tradeAmount.toString(),
          operation: 'unlock',
          orderId: takerOrder.id,
          description: `Trade execution: sold ${tradeAmount} ${baseAsset}`
        }),
        // Add quote asset to taker
        ledgerService.executeBalanceOperation({
          userId: takerOrder.userId,
          asset: quoteAsset,
          amount: quoteAmount.toString(),
          operation: 'add',
          orderId: takerOrder.id,
          description: `Trade execution: sold ${tradeAmount} ${baseAsset}`
        }),
        // Unlock maker's quote asset (already locked)
        ledgerService.executeBalanceOperation({
          userId: makerOrder.userId,
          asset: quoteAsset,
          amount: quoteAmount.toString(),
          operation: 'unlock',
          orderId: makerOrder.id,
          description: `Trade execution: bought ${tradeAmount} ${baseAsset}`
        }),
        // Add base asset to maker
        ledgerService.executeBalanceOperation({
          userId: makerOrder.userId,
          asset: baseAsset,
          amount: tradeAmount.toString(),
          operation: 'add',
          orderId: makerOrder.id,
          description: `Trade execution: bought ${tradeAmount} ${baseAsset}`
        })
      ])
    }

    // Handle fees (deduct from received assets)
    const takerFee = parseFloat(match.fee)
    const makerFee = this.calculateMakerFee(match.amount, match.price)

    if (takerFee > 0) {
      const takerFeeAsset = takerOrder.side === 'buy' ? baseAsset : quoteAsset
      await ledgerService.executeBalanceOperation({
        userId: takerOrder.userId,
        asset: takerFeeAsset,
        amount: takerFee.toString(),
        operation: 'subtract',
        orderId: takerOrder.id,
        description: `Taker fee for trade`
      })
    }

    if (makerFee > 0) {
      const makerFeeAsset = makerOrder.side === 'buy' ? baseAsset : quoteAsset
      await ledgerService.executeBalanceOperation({
        userId: makerOrder.userId,
        asset: makerFeeAsset,
        amount: makerFee.toString(),
        operation: 'subtract',
        orderId: makerOrder.id,
        description: `Maker fee for trade`
      })
    }
  }

  /**
   * Cancel an order and remove from order book
   */
  async cancelOrder(userId: string, orderId: string): Promise<any> {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // First cancel in database (this unlocks funds)
      const cancelledOrder = await ledgerService.cancelOrder(userId, orderId)

      // Then remove from order book
      await orderBookService.removeOrderFromBook(orderId)

      return cancelledOrder
    })
  }

  /**
   * Calculate average execution price for matches
   */
  private calculateAveragePrice(matches: any[]): number {
    if (matches.length === 0) return 0

    const totalValue = matches.reduce(
      (sum, match) => sum + (parseFloat(match.amount) * parseFloat(match.price)), 
      0
    )
    const totalAmount = matches.reduce(
      (sum, match) => sum + parseFloat(match.amount), 
      0
    )

    return totalValue / totalAmount
  }

  /**
   * Calculate maker fee (0.1%)
   */
  private calculateMakerFee(amount: string, price: string): number {
    return parseFloat(amount) * parseFloat(price) * 0.001
  }

  /**
   * Get matching engine configuration for a trading pair
   */
  async getMatchingConfig(tradingPair: string): Promise<any | null> {
    const pair = await prisma.tradingPair.findUnique({
      where: { symbol: tradingPair },
      include: {
        baseAssetConfig: true,
        quoteAssetConfig: true
      }
    })

    if (!pair) return null

    return {
      tradingPair: pair.symbol,
      baseAsset: pair.baseAsset,
      quoteAsset: pair.quoteAsset,
      minOrderSize: pair.minOrderSize,
      maxOrderSize: pair.maxOrderSize,
      priceStep: pair.priceStep,
      sizeStep: pair.sizeStep,
      makerFee: pair.makerFee,
      takerFee: pair.takerFee
    }
  }

  /**
   * Clear all orders from a trading pair (admin function)
   */
  async clearTradingPair(tradingPair: string): Promise<void> {
    await Promise.all([
      // Clear order book in Redis
      orderBookService.clearOrderBook(tradingPair),
      
      // Cancel all pending orders in database
      prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const pendingOrders = await tx.order.findMany({
          where: {
            tradingPair,
            status: { in: ['pending', 'partial'] }
          }
        })

        for (const order of pendingOrders) {
          await ledgerService.cancelOrder(order.userId, order.id)
        }
      })
    ])
  }
}

export const matchingService = new MatchingService() 