import { prisma } from '../config/database'
import { ledgerService } from './ledger.service'
import { orderBookService } from './orderbook.service'
import {
  OrderProcessingResult,
  OrderMatch,
  MatchingEngineConfig
} from '../types/matching'
import type { CreateOrder, Order } from '../types/ledger'
import type { Prisma } from '@prisma/client'

export class MatchingService {
  /**
   * Process a new order through the matching engine
   */
  async processOrder(userId: string, orderData: CreateOrder): Promise<OrderProcessingResult> {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      try {
        // 1. Create the order in database first (with balance locking)
        const order = await ledgerService.createOrder(userId, orderData)

        // 2. Find matches in the order book
        const matches = await orderBookService.findMatches(order)

        // 3. Process matches and update orders
        const processedMatches = await this.executeMatches(order, matches, tx)

        // 4. Calculate remaining amount after matches
        const totalFilled = processedMatches.reduce(
          (sum, match) => sum + parseFloat(match.amount), 
          0
        )
        const remaining = parseFloat(order.remaining) - totalFilled

        // 5. Update order status and filled amounts
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

        // 6. Add remaining order to order book if not fully filled
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

      } catch (error) {
        // If anything fails, the transaction will rollback
        throw error
      }
    })
  }

  /**
   * Execute order matches and update balances
   */
  private async executeMatches(
    takerOrder: Order,
    matches: OrderMatch[],
    tx: Prisma.TransactionClient
  ): Promise<OrderMatch[]> {
    const processedMatches: OrderMatch[] = []

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
    takerOrder: Order,
    makerOrder: Order,
    match: OrderMatch,
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
  async cancelOrder(userId: string, orderId: string): Promise<Order> {
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
  private calculateAveragePrice(matches: OrderMatch[]): number {
    let totalValue = 0
    let totalAmount = 0

    for (const match of matches) {
      const amount = parseFloat(match.amount)
      const price = parseFloat(match.price)
      totalValue += amount * price
      totalAmount += amount
    }

    return totalAmount > 0 ? totalValue / totalAmount : 0
  }

  /**
   * Calculate maker fee (typically lower than taker fee)
   */
  private calculateMakerFee(amount: string, price: string): number {
    const tradeValue = parseFloat(amount) * parseFloat(price)
    return tradeValue * 0.0005 // 0.05% maker fee (half of taker fee)
  }

  /**
   * Get matching engine configuration for a trading pair
   */
  async getMatchingConfig(tradingPair: string): Promise<MatchingEngineConfig | null> {
    const pair = await prisma.tradingPair.findUnique({
      where: { symbol: tradingPair }
    })

    if (!pair) return null

    return {
      tradingPair: pair.symbol,
      priceStep: pair.priceStep,
      sizeStep: pair.sizeStep,
      makerFee: pair.makerFee,
      takerFee: pair.takerFee,
      minOrderSize: pair.minOrderSize,
      maxOrderSize: pair.maxOrderSize
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