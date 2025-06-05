import { prisma } from '../config/database'
import type { 
  CreateAssetConfig, 
  CreateTradingPair, 
  CreateOrder, 
  UpdateOrder,
  BalanceOperation,
  InternalTransfer,
  ApiResponse,
  PaginatedResponse,
  AssetConfig,
  TradingPair,
  Order,
  LedgerEntry
} from '../types/ledger'
import type { Prisma, OrderStatus, LedgerEntryType } from '@prisma/client'
import { orderBookService } from './orderbook.service'

export class LedgerService {
  // Asset Configuration Management
  async createAssetConfig(data: CreateAssetConfig): Promise<AssetConfig> {
    const existingAsset = await prisma.assetConfig.findUnique({
      where: { symbol: data.symbol }
    })

    if (existingAsset) {
      throw new Error(`Asset ${data.symbol} already exists`)
    }

    const asset = await prisma.assetConfig.create({
      data: {
        symbol: data.symbol,
        name: data.name,
        decimals: data.decimals,
        chain: data.chain,
        contractAddress: data.contractAddress,
        minDeposit: data.minDeposit || '0',
        minWithdrawal: data.minWithdrawal || '0',
        withdrawalFee: data.withdrawalFee || '0'
      }
    })
    return asset
  }

  async getAssetConfigs(activeOnly = true): Promise<AssetConfig[]> {
    return await prisma.assetConfig.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { symbol: 'asc' }
    })
  }

  async getAssetConfig(symbol: string): Promise<AssetConfig | null> {
    return await prisma.assetConfig.findUnique({
      where: { symbol }
    })
  }

  // Trading Pair Management
  async createTradingPair(data: CreateTradingPair): Promise<TradingPair> {
    const symbol = `${data.baseAsset}/${data.quoteAsset}`
    
    const existingPair = await prisma.tradingPair.findUnique({
      where: { symbol }
    })

    if (existingPair) {
      throw new Error(`Trading pair ${symbol} already exists`)
    }

    // Verify both assets exist in AssetConfig
    const [baseAsset, quoteAsset] = await Promise.all([
      prisma.assetConfig.findUnique({ where: { symbol: data.baseAsset } }),
      prisma.assetConfig.findUnique({ where: { symbol: data.quoteAsset } })
    ])

    if (!baseAsset) {
      throw new Error(`Base asset ${data.baseAsset} not found`)
    }
    if (!quoteAsset) {
      throw new Error(`Quote asset ${data.quoteAsset} not found`)
    }

    return await prisma.tradingPair.create({
      data: {
        ...data,
        symbol
      }
    })
  }

  async getTradingPairs(activeOnly = true): Promise<TradingPair[]> {
    return await prisma.tradingPair.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      include: {
        baseAssetConfig: true,
        quoteAssetConfig: true
      },
      orderBy: { symbol: 'asc' }
    })
  }

  async getTradingPair(symbol: string): Promise<TradingPair | null> {
    return await prisma.tradingPair.findUnique({
      where: { symbol },
      include: {
        baseAssetConfig: true,
        quoteAssetConfig: true
      }
    })
  }

  // Balance Operations
  async getUserBalance(userId: string, asset: string, chain: string) {
    return await prisma.balance.findUnique({
      where: {
        userId_asset_chain: {
          userId,
          asset,
          chain
        }
      }
    })
  }

  async getUserBalances(userId: string) {
    return await prisma.balance.findMany({
      where: { userId },
      orderBy: [{ asset: 'asc' }, { chain: 'asc' }]
    })
  }

  async executeBalanceOperation(operation: BalanceOperation): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Get current balance or create if doesn't exist
      let balance = await tx.balance.findFirst({
        where: {
          userId: operation.userId,
          asset: operation.asset
        }
      })

      if (!balance) {
        // Get asset config to determine chain
        const assetConfig = await tx.assetConfig.findUnique({
          where: { symbol: operation.asset }
        })

        if (!assetConfig) {
          throw new Error(`Asset ${operation.asset} not found`)
        }

        balance = await tx.balance.create({
          data: {
            userId: operation.userId,
            asset: operation.asset,
            chain: assetConfig.chain,
            available: '0',
            locked: '0',
            total: '0'
          }
        })
      }

      const currentAvailable = parseFloat(balance.available)
      const currentLocked = parseFloat(balance.locked)
      const currentTotal = parseFloat(balance.total)
      const operationAmount = parseFloat(operation.amount)

      let newAvailable = currentAvailable
      let newLocked = currentLocked
      let newTotal = currentTotal

      // Execute the operation
      switch (operation.operation) {
        case 'add':
          newAvailable += operationAmount
          newTotal += operationAmount
          break
        case 'subtract':
          if (currentAvailable < operationAmount) {
            throw new Error(`Insufficient available balance. Available: ${currentAvailable}, Required: ${operationAmount}`)
          }
          newAvailable -= operationAmount
          newTotal -= operationAmount
          break
        case 'lock':
          if (currentAvailable < operationAmount) {
            throw new Error(`Insufficient available balance to lock. Available: ${currentAvailable}, Required: ${operationAmount}`)
          }
          newAvailable -= operationAmount
          newLocked += operationAmount
          break
        case 'unlock':
          if (currentLocked < operationAmount) {
            throw new Error(`Insufficient locked balance to unlock. Locked: ${currentLocked}, Required: ${operationAmount}`)
          }
          newLocked -= operationAmount
          newAvailable += operationAmount
          break
      }

      // Update balance
      await tx.balance.update({
        where: { id: balance.id },
        data: {
          available: newAvailable.toString(),
          locked: newLocked.toString(),
          total: newTotal.toString()
        }
      })

      // Create ledger entry
      await tx.ledgerEntry.create({
        data: {
          userId: operation.userId,
          orderId: operation.orderId,
          entryType: operation.operation === 'add' || operation.operation === 'subtract' 
            ? (operation.operation === 'add' ? 'deposit' : 'withdrawal')
            : operation.operation,
          asset: operation.asset,
          amount: operation.operation === 'subtract' ? `-${operation.amount}` : operation.amount,
          balanceBefore: balance.available,
          balanceAfter: newAvailable.toString(),
          description: operation.description || `Balance ${operation.operation}: ${operation.amount} ${operation.asset}`
        }
      })
    })
  }

  // Order Management
  async createOrder(userId: string, orderData: CreateOrder): Promise<Order> {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Verify trading pair exists and is active
      const tradingPair = await tx.tradingPair.findUnique({
        where: { symbol: orderData.tradingPair },
        include: {
          baseAssetConfig: true,
          quoteAssetConfig: true
        }
      })

      if (!tradingPair || !tradingPair.isActive) {
        throw new Error(`Trading pair ${orderData.tradingPair} not found or inactive`)
      }

      // Validate order size
      const orderAmount = parseFloat(orderData.amount)
      const minOrderSize = parseFloat(tradingPair.minOrderSize)
      const maxOrderSize = parseFloat(tradingPair.maxOrderSize)

      if (orderAmount < minOrderSize) {
        throw new Error(`Order amount ${orderAmount} below minimum ${minOrderSize}`)
      }
      if (orderAmount > maxOrderSize) {
        throw new Error(`Order amount ${orderAmount} above maximum ${maxOrderSize}`)
      }

      // Calculate required balance and asset to lock
      let requiredAmount: number
      let assetToLock: string

      if (orderData.side === 'buy') {
        // For buy orders, lock quote asset (e.g., USDC for SOL/USDC)
        assetToLock = tradingPair.quoteAsset
        if (orderData.orderType === 'market') {
          // For market orders, we'll use a high estimate since we don't know the exact price
          // In a real system, you'd get the current market price from the order book
          throw new Error('Market orders not yet implemented')
        } else {
          requiredAmount = orderAmount * parseFloat(orderData.price!)
        }
      } else {
        // For sell orders, lock base asset (e.g., SOL for SOL/USDC)
        assetToLock = tradingPair.baseAsset
        requiredAmount = orderAmount
      }

      // Check user balance and lock funds
      await this.executeBalanceOperation({
        userId,
        asset: assetToLock,
        amount: requiredAmount.toString(),
        operation: 'lock',
        description: `Lock for ${orderData.side} order ${orderData.tradingPair}`
      })

      // Create the order
      const order = await tx.order.create({
        data: {
          userId,
          tradingPair: orderData.tradingPair,
          orderType: orderData.orderType,
          side: orderData.side,
          amount: orderData.amount,
          price: orderData.price,
          stopPrice: orderData.stopPrice,
          remaining: orderData.amount,
          timeInForce: orderData.timeInForce,
          clientOrderId: orderData.clientOrderId,
          lockedAmount: requiredAmount.toString(),
          lockedAsset: assetToLock
        }
      })

      // Add to Redis order book
      await orderBookService.addOrderToBook(order)

      return order
    })
  }

  async cancelOrder(userId: string, orderId: string): Promise<Order> {
    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const order = await tx.order.findFirst({
        where: {
          id: orderId,
          userId,
          status: { in: ['pending', 'partial'] }
        }
      })

      if (!order) {
        throw new Error('Order not found or cannot be cancelled')
      }

      // Unlock the locked funds
      await this.executeBalanceOperation({
        userId,
        asset: order.lockedAsset,
        amount: order.lockedAmount,
        operation: 'unlock',
        orderId: order.id,
        description: `Unlock funds from cancelled order ${order.id}`
      })

      // Update order status
      const updatedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'cancelled',
          cancelledAt: new Date()
        }
      })

      // Remove from Redis order book
      await orderBookService.removeOrderFromBook(orderId)

      return updatedOrder
    })
  }

  async getUserOrders(
    userId: string, 
    options: {
      status?: OrderStatus
      tradingPair?: string
      page?: number
      pageSize?: number
    } = {}
  ): Promise<PaginatedResponse<Order>> {
    const { status, tradingPair, page = 1, pageSize = 50 } = options
    const skip = (page - 1) * pageSize

    const where = {
      userId,
      ...(status && { status }),
      ...(tradingPair && { tradingPair })
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          fills: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize
      }),
      prisma.order.count({ where })
    ])

    return {
      items: orders,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    }
  }

  async getOrder(userId: string, orderId: string): Promise<Order | null> {
    return await prisma.order.findFirst({
      where: {
        id: orderId,
        userId
      },
      include: {
        fills: true,
        ledgerEntries: true
      }
    })
  }

  // Internal Transfer
  async internalTransfer(transfer: InternalTransfer): Promise<void> {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Verify both users exist
      const [fromUser, toUser] = await Promise.all([
        tx.user.findUnique({ where: { id: transfer.fromUserId } }),
        tx.user.findUnique({ where: { id: transfer.toUserId } })
      ])

      if (!fromUser || !toUser) {
        throw new Error('One or both users not found')
      }

      const amount = parseFloat(transfer.amount)
      if (amount <= 0) {
        throw new Error('Transfer amount must be positive')
      }

      // Subtract from sender
      await this.executeBalanceOperation({
        userId: transfer.fromUserId,
        asset: transfer.asset,
        amount: transfer.amount,
        operation: 'subtract',
        description: transfer.description || `Internal transfer to ${toUser.email}`
      })

      // Add to receiver
      await this.executeBalanceOperation({
        userId: transfer.toUserId,
        asset: transfer.asset,
        amount: transfer.amount,
        operation: 'add',
        description: transfer.description || `Internal transfer from ${fromUser.email}`
      })
    })
  }

  // Ledger Queries
  async getUserLedgerEntries(
    userId: string,
    options: {
      asset?: string
      entryType?: LedgerEntryType
      page?: number
      pageSize?: number
    } = {}
  ): Promise<PaginatedResponse<LedgerEntry>> {
    const { asset, entryType, page = 1, pageSize = 50 } = options
    const skip = (page - 1) * pageSize

    const where = {
      userId,
      ...(asset && { asset }),
      ...(entryType && { entryType })
    }

    const [entries, total] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where,
        include: {
          order: true,
          transaction: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize
      }),
      prisma.ledgerEntry.count({ where })
    ])

    return {
      items: entries,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    }
  }

  // System Administration
  async initializeSystemAssets(): Promise<void> {
    const systemAssets = [
      {
        symbol: 'SOL',
        name: 'Solana',
        decimals: 9,
        chain: 'solana',
        contractAddress: null,
        minDeposit: '0.001',
        minWithdrawal: '0.001',
        withdrawalFee: '0.001'
      },
      {
        symbol: 'ETH',
        name: 'Ethereum',
        decimals: 18,
        chain: 'ethereum',
        contractAddress: null,
        minDeposit: '0.0001',
        minWithdrawal: '0.0001',
        withdrawalFee: '0.001'
      },
      {
        symbol: 'USDC',
        name: 'USD Coin',
        decimals: 6,
        chain: 'solana',
        contractAddress: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        minDeposit: '1',
        minWithdrawal: '1',
        withdrawalFee: '1'
      }
    ]

    for (const asset of systemAssets) {
      await prisma.assetConfig.upsert({
        where: { symbol: asset.symbol },
        update: asset,
        create: asset
      })
    }

    // Create default trading pairs
    const tradingPairs = [
      {
        baseAsset: 'SOL',
        quoteAsset: 'USDC',
        minOrderSize: '0.1',
        maxOrderSize: '1000',
        priceStep: '0.01',
        sizeStep: '0.1',
        makerFee: '0.001',
        takerFee: '0.001'
      },
      {
        baseAsset: 'ETH',
        quoteAsset: 'USDC',
        minOrderSize: '0.01',
        maxOrderSize: '100',
        priceStep: '0.01',
        sizeStep: '0.01',
        makerFee: '0.001',
        takerFee: '0.001'
      }
    ]

    for (const pair of tradingPairs) {
      const symbol = `${pair.baseAsset}/${pair.quoteAsset}`
      await prisma.tradingPair.upsert({
        where: { symbol },
        update: pair,
        create: { ...pair, symbol }
      })
    }
  }
}

export const ledgerService = new LedgerService() 