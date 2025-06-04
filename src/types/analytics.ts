import { z } from 'zod'

// Time intervals for historical data
export const timeIntervals = ['1m', '5m', '15m', '1h', '4h', '1d', '1w'] as const
export type TimeInterval = typeof timeIntervals[number]

// Analytics periods (longer periods for analytics)
export const analyticsPeriods = ['1h', '4h', '1d', '7d', '30d'] as const
export type AnalyticsPeriod = typeof analyticsPeriods[number]

// OHLCV Candle data
export interface CandleData {
  timestamp: number
  open: string
  high: string
  low: string
  close: string
  volume: string
  trades: number
}

// Technical indicators
export interface TechnicalIndicators {
  sma_20?: string
  sma_50?: string
  ema_12?: string
  ema_26?: string
  rsi?: string
  macd?: {
    line: string
    signal: string
    histogram: string
  }
  bollinger_bands?: {
    upper: string
    middle: string
    lower: string
  }
  volume_sma?: string
}

// Market depth analytics
export interface MarketDepthAnalytics {
  tradingPair: string
  timestamp: number
  bidDepth: {
    levels: number
    totalVolume: string
    totalValue: string
    averageSize: string
    weightedPrice: string
  }
  askDepth: {
    levels: number
    totalVolume: string
    totalValue: string
    averageSize: string
    weightedPrice: string
  }
  spread: {
    absolute: string
    percentage: string
    midPrice: string
  }
  imbalance: {
    ratio: string // bid volume / ask volume
    percentage: string
  }
}

// Liquidity metrics
export interface LiquidityMetrics {
  tradingPair: string
  period: TimeInterval
  timestamp: number
  
  // Volume metrics
  volume24h: string
  volumeChange24h: string
  tradeCount24h: number
  
  // Price metrics
  price: string
  priceChange24h: string
  priceChangePercentage24h: string
  high24h: string
  low24h: string
  
  // Market depth
  bidAskSpread: string
  bidAskSpreadPercentage: string
  marketDepth1Percent: string // Volume within 1% of mid price
  marketDepth5Percent: string // Volume within 5% of mid price
  
  // Liquidity scores
  liquidityScore: number // 0-100 composite score
  volatility24h: string
  
  // Active trading metrics
  activeOrders: number
  averageOrderSize: string
  medianOrderSize: string
}

// Performance analytics
export interface PerformanceAnalytics {
  tradingPair: string
  period: TimeInterval
  timestamp: number
  
  // Returns
  returns1h: string
  returns24h: string
  returns7d: string
  returns30d: string
  
  // Volatility
  volatility1h: string
  volatility24h: string
  volatility7d: string
  volatility30d: string
  
  // Volume weighted metrics
  vwap24h: string
  vwapDeviation: string
  
  // Momentum indicators
  momentum1h: string
  momentum24h: string
  
  // Market efficiency
  efficiency: number // 0-100 score
  slippage1Percent: string
  slippage5Percent: string
}

// Risk analytics
export interface RiskAnalytics {
  tradingPair: string
  timestamp: number
  
  // Value at Risk
  var_95: string // 95% confidence 1-day VaR
  var_99: string // 99% confidence 1-day VaR
  
  // Volatility measures
  historicalVolatility: string
  impliedVolatility?: string
  
  // Correlation (with other pairs)
  correlations: Record<string, string>
  
  // Drawdown metrics
  maxDrawdown7d: string
  maxDrawdown30d: string
  
  // Stress metrics
  largestMoveUp24h: string
  largestMoveDown24h: string
  
  // Liquidity risk
  liquidityRisk: number // 0-100 score
  concentrationRisk: number // 0-100 score
}

// Market summary
export interface MarketSummary {
  timestamp: number
  totalPairs: number
  activePairs: number
  totalVolume24h: string
  totalTrades24h: number
  
  // Top performers
  topGainers: Array<{
    tradingPair: string
    priceChangePercentage: string
    volume24h: string
  }>
  
  topLosers: Array<{
    tradingPair: string
    priceChangePercentage: string
    volume24h: string
  }>
  
  topVolume: Array<{
    tradingPair: string
    volume24h: string
    trades24h: number
  }>
  
  // Market health indicators
  averageSpread: string
  totalLiquidity: string
  marketHealthScore: number // 0-100
}

// Request/Response schemas
export const CandleQuerySchema = z.object({
  tradingPair: z.string(),
  interval: z.enum(timeIntervals),
  limit: z.number().min(1).max(1000).default(100),
  startTime: z.number().optional(),
  endTime: z.number().optional()
})

export const MarketDepthQuerySchema = z.object({
  tradingPair: z.string(),
  limit: z.number().min(1).max(100).default(20)
})

export const AnalyticsQuerySchema = z.object({
  tradingPair: z.string().optional(),
  period: z.enum(analyticsPeriods).default('1d'),
  startTime: z.number().optional(),
  endTime: z.number().optional()
})

export const TechnicalIndicatorQuerySchema = z.object({
  tradingPair: z.string(),
  interval: z.enum(timeIntervals),
  indicators: z.array(z.enum(['sma_20', 'sma_50', 'ema_12', 'ema_26', 'rsi', 'macd', 'bollinger_bands'])).default(['sma_20', 'rsi']),
  limit: z.number().min(1).max(500).default(100)
})

// Request types
export type CandleQueryRequest = z.infer<typeof CandleQuerySchema>
export type MarketDepthQueryRequest = z.infer<typeof MarketDepthQuerySchema>
export type AnalyticsQueryRequest = z.infer<typeof AnalyticsQuerySchema>
export type TechnicalIndicatorQueryRequest = z.infer<typeof TechnicalIndicatorQuerySchema>

// Analytics service configuration
export interface AnalyticsConfig {
  enableHistoricalData: boolean
  enableTechnicalIndicators: boolean
  enableRiskAnalytics: boolean
  enableMarketDepthAnalytics: boolean
  
  // Data retention
  candleRetentionDays: number
  analyticsRetentionDays: number
  
  // Update frequencies
  realTimeUpdateMs: number
  historicalUpdateMs: number
  riskUpdateMs: number
  
  // Performance settings
  maxConcurrentCalculations: number
  batchSize: number
}

// Market data snapshot for caching
export interface MarketDataSnapshot {
  tradingPair: string
  timestamp: number
  price: string
  volume24h: string
  priceChange24h: string
  
  // Quick metrics
  bid: string
  ask: string
  spread: string
  lastTrade: {
    price: string
    amount: string
    timestamp: number
  }
  
  // Cached analytics
  liquidity?: LiquidityMetrics
  performance?: PerformanceAnalytics
  risk?: RiskAnalytics
  depth?: MarketDepthAnalytics
} 