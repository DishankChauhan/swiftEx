import { z } from 'zod'

// Asset Configuration Types
export const AssetConfigSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  name: z.string(),
  decimals: z.number(),
  chain: z.string(),
  contractAddress: z.string().nullable(),
  isActive: z.boolean(),
  minDeposit: z.string(),
  minWithdrawal: z.string(),
  withdrawalFee: z.string(),
  createdAt: z.date(),
  updatedAt: z.date()
})

export const CreateAssetConfigSchema = z.object({
  symbol: z.string().min(1).max(10),
  name: z.string().min(1).max(100),
  decimals: z.number().min(0).max(18),
  chain: z.enum(['solana', 'ethereum']),
  contractAddress: z.string().optional(),
  minDeposit: z.string().default('0'),
  minWithdrawal: z.string().default('0'),
  withdrawalFee: z.string().default('0')
})

// Trading Pair Types
export const TradingPairSchema = z.object({
  id: z.string(),
  symbol: z.string(),
  baseAsset: z.string(),
  quoteAsset: z.string(),
  isActive: z.boolean(),
  minOrderSize: z.string(),
  maxOrderSize: z.string(),
  priceStep: z.string(),
  sizeStep: z.string(),
  makerFee: z.string(),
  takerFee: z.string(),
  createdAt: z.date(),
  updatedAt: z.date()
})

export const CreateTradingPairSchema = z.object({
  baseAsset: z.string(),
  quoteAsset: z.string(),
  minOrderSize: z.string(),
  maxOrderSize: z.string(),
  priceStep: z.string(),
  sizeStep: z.string(),
  makerFee: z.string().default('0.001'),
  takerFee: z.string().default('0.001')
})

// Order Types
export const OrderSchema = z.object({
  id: z.string(),
  userId: z.string(),
  tradingPair: z.string(),
  orderType: z.enum(['market', 'limit', 'stop']),
  side: z.enum(['buy', 'sell']),
  amount: z.string(),
  price: z.string().nullable(),
  stopPrice: z.string().nullable(),
  status: z.enum(['pending', 'partial', 'filled', 'cancelled', 'rejected']),
  filled: z.string(),
  remaining: z.string(),
  averagePrice: z.string().nullable(),
  timeInForce: z.enum(['GTC', 'IOC', 'FOK']),
  clientOrderId: z.string().nullable(),
  lockedAmount: z.string(),
  lockedAsset: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  filledAt: z.date().nullable(),
  cancelledAt: z.date().nullable()
})

export const CreateOrderSchema = z.object({
  tradingPair: z.string(),
  orderType: z.enum(['market', 'limit', 'stop']),
  side: z.enum(['buy', 'sell']),
  amount: z.string().refine((val) => {
    const num = parseFloat(val)
    return !isNaN(num) && num > 0
  }, 'Amount must be a positive number'),
  price: z.string().optional().refine((val) => {
    if (!val) return true
    const num = parseFloat(val)
    return !isNaN(num) && num > 0
  }, 'Price must be a positive number'),
  stopPrice: z.string().optional(),
  timeInForce: z.enum(['GTC', 'IOC', 'FOK']).default('GTC'),
  clientOrderId: z.string().optional()
})

export const UpdateOrderSchema = z.object({
  price: z.string().optional(),
  amount: z.string().optional(),
  stopPrice: z.string().optional()
})

// Order Fill Types
export const OrderFillSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  amount: z.string(),
  price: z.string(),
  fee: z.string(),
  feeAsset: z.string(),
  isMaker: z.boolean(),
  createdAt: z.date()
})

// Ledger Entry Types
export const LedgerEntrySchema = z.object({
  id: z.string(),
  userId: z.string(),
  orderId: z.string().nullable(),
  transactionId: z.string().nullable(),
  entryType: z.enum(['deposit', 'withdrawal', 'trade', 'fee', 'lock', 'unlock']),
  asset: z.string(),
  amount: z.string(),
  balanceBefore: z.string(),
  balanceAfter: z.string(),
  description: z.string().nullable(),
  metadata: z.any().nullable(),
  createdAt: z.date()
})

export const CreateLedgerEntrySchema = z.object({
  userId: z.string(),
  orderId: z.string().optional(),
  transactionId: z.string().optional(),
  entryType: z.enum(['deposit', 'withdrawal', 'trade', 'fee', 'lock', 'unlock']),
  asset: z.string(),
  amount: z.string(),
  description: z.string().optional(),
  metadata: z.any().optional()
})

// Balance Operation Types
export const BalanceOperationSchema = z.object({
  userId: z.string(),
  asset: z.string(),
  amount: z.string(),
  operation: z.enum(['lock', 'unlock', 'add', 'subtract']),
  orderId: z.string().optional(),
  description: z.string().optional()
})

// Internal Transfer Types
export const InternalTransferSchema = z.object({
  fromUserId: z.string(),
  toUserId: z.string(),
  asset: z.string(),
  amount: z.string(),
  description: z.string().optional()
})

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean
  message: string
  data?: T
  error?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

// Type Exports
export type AssetConfig = z.infer<typeof AssetConfigSchema>
export type CreateAssetConfig = z.infer<typeof CreateAssetConfigSchema>
export type TradingPair = z.infer<typeof TradingPairSchema>
export type CreateTradingPair = z.infer<typeof CreateTradingPairSchema>
export type Order = z.infer<typeof OrderSchema>
export type CreateOrder = z.infer<typeof CreateOrderSchema>
export type UpdateOrder = z.infer<typeof UpdateOrderSchema>
export type OrderFill = z.infer<typeof OrderFillSchema>
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>
export type CreateLedgerEntry = z.infer<typeof CreateLedgerEntrySchema>
export type BalanceOperation = z.infer<typeof BalanceOperationSchema>
export type InternalTransfer = z.infer<typeof InternalTransferSchema>

// Order Book Types
export interface OrderBookLevel {
  price: string
  amount: string
  total: string
}

export interface OrderBook {
  tradingPair: string
  bids: OrderBookLevel[]
  asks: OrderBookLevel[]
  lastUpdated: string
}

// Trading Statistics
export interface TradingStats {
  tradingPair: string
  lastPrice: string
  priceChange: string
  priceChangePercent: string
  volume24h: string
  high24h: string
  low24h: string
  openPrice: string
}