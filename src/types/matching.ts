import { z } from 'zod'

// Order Book Types
export interface OrderBookLevel {
  price: string
  amount: string
  total: string
  count: number
}

export interface OrderBookSnapshot {
  tradingPair: string
  bids: OrderBookLevel[]
  asks: OrderBookLevel[]
  lastUpdated: string
  sequence: number
}

export interface OrderBookUpdate {
  tradingPair: string
  side: 'bid' | 'ask'
  price: string
  amount: string
  sequence: number
  timestamp: string
}

// Matching Engine Types
export interface MatchResult {
  makerOrder: string
  takerOrder: string
  amount: string
  price: string
  makerFee: string
  takerFee: string
  makerUserId: string
  takerUserId: string
  timestamp: string
}

export interface OrderMatch {
  orderId: string
  counterOrderId: string
  amount: string
  price: string
  fee: string
  feeAsset: string
  isMaker: boolean
  userId: string
  timestamp: string
}

// Market Data Types
export interface Ticker {
  tradingPair: string
  lastPrice: string
  priceChange: string
  priceChangePercent: string
  volume24h: string
  high24h: string
  low24h: string
  openPrice: string
  timestamp: string
}

export interface Trade {
  id: string
  tradingPair: string
  amount: string
  price: string
  timestamp: string
  side: 'buy' | 'sell' // Taker side
  sequence: number
}

export interface Candle {
  tradingPair: string
  interval: string // '1m', '5m', '15m', '1h', '4h', '1d'
  openTime: number
  closeTime: number
  open: string
  high: string
  low: string
  close: string
  volume: string
  trades: number
}

// WebSocket Message Types
export interface WebSocketMessage {
  type: 'subscribe' | 'unsubscribe' | 'orderbook' | 'trade' | 'ticker' | 'error'
  channel?: string
  data?: any
  timestamp?: string
}

export interface SubscriptionMessage {
  type: 'subscribe' | 'unsubscribe'
  channels: string[]
}

export interface OrderBookMessage {
  type: 'orderbook'
  data: OrderBookSnapshot | OrderBookUpdate
}

export interface TradeMessage {
  type: 'trade'
  data: Trade
}

export interface TickerMessage {
  type: 'ticker'
  data: Ticker
}

// Redis Keys for Order Book Management
export const REDIS_KEYS = {
  // Order book sorted sets: orderbook:{pair}:{side}
  orderBookBids: (pair: string) => `orderbook:${pair}:bids`,
  orderBookAsks: (pair: string) => `orderbook:${pair}:asks`,
  
  // Order lookup: order:{orderId}
  order: (orderId: string) => `order:${orderId}`,
  
  // User orders: user_orders:{userId}
  userOrders: (userId: string) => `user_orders:${userId}`,
  
  // Market data
  ticker: (pair: string) => `ticker:${pair}`,
  trades: (pair: string) => `trades:${pair}`,
  candles: (pair: string, interval: string) => `candles:${pair}:${interval}`,
  
  // WebSocket subscriptions
  subscribers: (channel: string) => `subscribers:${channel}`,
  
  // Sequence numbers for event ordering
  sequence: (pair: string) => `sequence:${pair}`
} as const

// Order Book Price Level
export interface PriceLevel {
  price: string
  amount: string
  orderId: string
  userId: string
  timestamp: string
}

// Matching Engine Configuration
export interface MatchingEngineConfig {
  tradingPair: string
  priceStep: string
  sizeStep: string
  makerFee: string
  takerFee: string
  minOrderSize: string
  maxOrderSize: string
}

// Order Processing Result
export interface OrderProcessingResult {
  orderId: string
  status: 'filled' | 'partial' | 'pending' | 'rejected'
  filled: string
  remaining: string
  averagePrice?: string
  matches: OrderMatch[]
  rejectionReason?: string
}

// Market Statistics
export interface MarketStats {
  tradingPair: string
  lastPrice: string
  priceChange24h: string
  priceChangePercent24h: string
  volume24h: string
  high24h: string
  low24h: string
  vwap24h: string // Volume weighted average price
  totalTrades24h: number
  timestamp: string
}

// Order Book Depth
export interface OrderBookDepth {
  tradingPair: string
  bids: Array<[string, string]> // [price, amount]
  asks: Array<[string, string]> // [price, amount]
  timestamp: string
}

// Schema Validations
export const SubscriptionSchema = z.object({
  type: z.enum(['subscribe', 'unsubscribe']),
  channels: z.array(z.string()).min(1)
})

export const WebSocketMessageSchema = z.object({
  type: z.enum(['subscribe', 'unsubscribe', 'orderbook', 'trade', 'ticker', 'error']),
  channel: z.string().optional(),
  data: z.any().optional(),
  timestamp: z.string().optional()
})

// Type exports
export type SubscriptionData = z.infer<typeof SubscriptionSchema>
export type WebSocketMessageData = z.infer<typeof WebSocketMessageSchema>

// Channel names for WebSocket subscriptions
export const CHANNELS = {
  orderBook: (pair: string) => `orderbook@${pair}`,
  trade: (pair: string) => `trade@${pair}`,
  ticker: (pair: string) => `ticker@${pair}`,
  allTickers: 'ticker@all',
  userOrders: (userId: string) => `orders@${userId}`
} as const 