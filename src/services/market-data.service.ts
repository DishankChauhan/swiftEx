import { timescaleDB } from '../config/timescale'

export interface CandleData {
  time: Date
  tradingPair: string
  intervalType: string
  open: string
  high: string
  low: string
  close: string
  volume: string
  quoteVolume: string
  tradeCount: number
}

export interface TradeData {
  time: Date
  tradingPair: string
  tradeId: string
  orderId: string
  side: 'buy' | 'sell'
  amount: string
  price: string
  fee: string
  feeAsset: string
  makerUserId?: string
  takerUserId?: string
}

export class MarketDataService {
  private candleIntervals = ['1m', '5m', '15m', '1h', '4h', '1d']
  
  /**
   * Record a trade in TimescaleDB
   */
  async recordTrade(trade: TradeData): Promise<void> {
    try {
      await timescaleDB.query(
        `INSERT INTO trades (
          time, trading_pair, trade_id, order_id, side, amount, price, 
          fee, fee_asset, maker_user_id, taker_user_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          trade.time,
          trade.tradingPair,
          trade.tradeId,
          trade.orderId,
          trade.side,
          trade.amount,
          trade.price,
          trade.fee,
          trade.feeAsset,
          trade.makerUserId,
          trade.takerUserId
        ]
      )
      
      // Generate candlestick data for all intervals
      await this.generateCandlesticks(trade.tradingPair, trade.time)
      
      console.log(`📊 Trade recorded: ${trade.amount} ${trade.tradingPair} at ${trade.price}`)
    } catch (error) {
      console.error('Failed to record trade:', error)
      throw error
    }
  }

  /**
   * Generate candlestick data for all time intervals
   */
  private async generateCandlesticks(tradingPair: string, tradeTime: Date): Promise<void> {
    try {
      for (const interval of this.candleIntervals) {
        await this.generateCandleForInterval(tradingPair, interval, tradeTime)
      }
    } catch (error) {
      console.error('Failed to generate candlesticks:', error)
    }
  }

  /**
   * Generate candlestick for specific interval
   */
  private async generateCandleForInterval(
    tradingPair: string, 
    interval: string, 
    tradeTime: Date
  ): Promise<void> {
    try {
      const timeWindow = this.getTimeWindow(interval, tradeTime)
      
      // Get OHLCV data for the time window
      const result = await timescaleDB.query(
        `SELECT 
          FIRST(price, time) as open,
          MAX(price) as high,
          MIN(price) as low,
          LAST(price, time) as close,
          SUM(amount) as volume,
          SUM(CAST(amount AS DECIMAL) * CAST(price AS DECIMAL)) as quote_volume,
          COUNT(*) as trade_count
        FROM trades 
        WHERE trading_pair = $1 
          AND time >= $2 
          AND time < $3`,
        [tradingPair, timeWindow.start, timeWindow.end]
      )

      if (result.rows.length > 0) {
        const ohlcv = result.rows[0]
        
        // Upsert candlestick data
        await timescaleDB.query(
          `INSERT INTO candles (
            time, trading_pair, interval_type, open, high, low, close, 
            volume, quote_volume, trade_count
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (time, trading_pair, interval_type) 
          DO UPDATE SET
            open = EXCLUDED.open,
            high = EXCLUDED.high,
            low = EXCLUDED.low,
            close = EXCLUDED.close,
            volume = EXCLUDED.volume,
            quote_volume = EXCLUDED.quote_volume,
            trade_count = EXCLUDED.trade_count`,
          [
            timeWindow.start,
            tradingPair,
            interval,
            ohlcv.open,
            ohlcv.high,
            ohlcv.low,
            ohlcv.close,
            ohlcv.volume,
            ohlcv.quote_volume,
            ohlcv.trade_count
          ]
        )
      }
    } catch (error) {
      console.error(`Failed to generate ${interval} candle:`, error)
    }
  }

  /**
   * Get time window for interval
   */
  private getTimeWindow(interval: string, tradeTime: Date): { start: Date; end: Date } {
    const time = new Date(tradeTime)
    let start: Date
    let end: Date

    switch (interval) {
      case '1m':
        start = new Date(time.getFullYear(), time.getMonth(), time.getDate(), time.getHours(), time.getMinutes())
        end = new Date(start.getTime() + 60 * 1000)
        break
      case '5m':
        const minutes5 = Math.floor(time.getMinutes() / 5) * 5
        start = new Date(time.getFullYear(), time.getMonth(), time.getDate(), time.getHours(), minutes5)
        end = new Date(start.getTime() + 5 * 60 * 1000)
        break
      case '15m':
        const minutes15 = Math.floor(time.getMinutes() / 15) * 15
        start = new Date(time.getFullYear(), time.getMonth(), time.getDate(), time.getHours(), minutes15)
        end = new Date(start.getTime() + 15 * 60 * 1000)
        break
      case '1h':
        start = new Date(time.getFullYear(), time.getMonth(), time.getDate(), time.getHours())
        end = new Date(start.getTime() + 60 * 60 * 1000)
        break
      case '4h':
        const hours4 = Math.floor(time.getHours() / 4) * 4
        start = new Date(time.getFullYear(), time.getMonth(), time.getDate(), hours4)
        end = new Date(start.getTime() + 4 * 60 * 60 * 1000)
        break
      case '1d':
        start = new Date(time.getFullYear(), time.getMonth(), time.getDate())
        end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
        break
      default:
        throw new Error(`Unsupported interval: ${interval}`)
    }

    return { start, end }
  }

  /**
   * Get candlestick data for charts
   */
  async getCandles(
    tradingPair: string,
    interval: string,
    limit: number = 500,
    startTime?: Date,
    endTime?: Date
  ): Promise<CandleData[]> {
    try {
      let query = `
        SELECT time, trading_pair, interval_type, open, high, low, close, 
               volume, quote_volume, trade_count
        FROM candles 
        WHERE trading_pair = $1 AND interval_type = $2
      `
      const params: any[] = [tradingPair, interval]
      let paramIndex = 3

      if (startTime) {
        query += ` AND time >= $${paramIndex}`
        params.push(startTime)
        paramIndex++
      }

      if (endTime) {
        query += ` AND time <= $${paramIndex}`
        params.push(endTime)
        paramIndex++
      }

      query += ` ORDER BY time DESC LIMIT $${paramIndex}`
      params.push(limit)

      const result = await timescaleDB.query(query, params)

      return result.rows.map(row => ({
        time: row.time,
        tradingPair: row.trading_pair,
        intervalType: row.interval_type,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
        quoteVolume: row.quote_volume,
        tradeCount: row.trade_count
      }))
    } catch (error) {
      console.error('Failed to get candles:', error)
      throw error
    }
  }

  /**
   * Get 24h ticker statistics
   */
  async get24hTicker(tradingPair: string): Promise<any> {
    try {
      const now = new Date()
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)

      const result = await timescaleDB.query(
        `SELECT 
          LAST(price, time) as last_price,
          FIRST(price, time) as first_price,
          MAX(price) as high_24h,
          MIN(price) as low_24h,
          SUM(amount) as volume_24h,
          SUM(CAST(amount AS DECIMAL) * CAST(price AS DECIMAL)) as quote_volume_24h,
          COUNT(*) as trade_count_24h
        FROM trades 
        WHERE trading_pair = $1 AND time >= $2`,
        [tradingPair, yesterday]
      )

      if (result.rows.length > 0) {
        const ticker = result.rows[0]
        const priceChange = parseFloat(ticker.last_price) - parseFloat(ticker.first_price)
        const priceChangePercent = (priceChange / parseFloat(ticker.first_price)) * 100

        return {
          tradingPair,
          lastPrice: ticker.last_price,
          priceChange24h: priceChange.toString(),
          priceChangePercent24h: priceChangePercent.toFixed(4),
          high24h: ticker.high_24h,
          low24h: ticker.low_24h,
          volume24h: ticker.volume_24h,
          quoteVolume24h: ticker.quote_volume_24h,
          tradeCount24h: ticker.trade_count_24h,
          timestamp: now.toISOString()
        }
      }

      return null
    } catch (error) {
      console.error('Failed to get 24h ticker:', error)
      throw error
    }
  }

  /**
   * Get recent trades
   */
  async getRecentTrades(tradingPair: string, limit: number = 100): Promise<any[]> {
    try {
      const result = await timescaleDB.query(
        `SELECT time, trade_id, side, amount, price, fee, fee_asset
        FROM trades 
        WHERE trading_pair = $1 
        ORDER BY time DESC 
        LIMIT $2`,
        [tradingPair, limit]
      )

      return result.rows.map(row => ({
        time: row.time,
        id: row.trade_id,
        side: row.side,
        amount: row.amount,
        price: row.price,
        fee: row.fee,
        feeAsset: row.fee_asset
      }))
    } catch (error) {
      console.error('Failed to get recent trades:', error)
      throw error
    }
  }
}

export const marketDataService = new MarketDataService() 