import { Pool } from 'pg'

// TimescaleDB connection for time series data
const timescalePool = new Pool({
  host: process.env.TIMESCALE_HOST || 'localhost',
  port: parseInt(process.env.TIMESCALE_PORT || '5434'),
  database: process.env.TIMESCALE_DB || 'timeseries',
  user: process.env.TIMESCALE_USER || 'postgres',
  password: process.env.TIMESCALE_PASSWORD || 'password',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

// Test connection
timescalePool.on('connect', () => {
  console.log('✅ TimescaleDB connected')
})

timescalePool.on('error', (err: Error) => {
  console.error('❌ TimescaleDB connection error:', err)
})

// Initialize TimescaleDB schema
export async function initTimescaleDB() {
  try {
    console.log('🔄 Initializing TimescaleDB schema...')
    
    // Create extension if not exists
    await timescalePool.query('CREATE EXTENSION IF NOT EXISTS timescaledb;')
    
    // Create candles table for OHLCV data
    await timescalePool.query(`
      CREATE TABLE IF NOT EXISTS candles (
        time TIMESTAMPTZ NOT NULL,
        trading_pair VARCHAR(20) NOT NULL,
        interval_type VARCHAR(10) NOT NULL, -- 1m, 5m, 15m, 1h, 4h, 1d
        open DECIMAL(20,8) NOT NULL,
        high DECIMAL(20,8) NOT NULL,
        low DECIMAL(20,8) NOT NULL,
        close DECIMAL(20,8) NOT NULL,
        volume DECIMAL(20,8) NOT NULL DEFAULT 0,
        quote_volume DECIMAL(20,8) NOT NULL DEFAULT 0,
        trade_count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (time, trading_pair, interval_type)
      );
    `)
    
    // Create hypertable for time-series optimization
    await timescalePool.query(`
      SELECT create_hypertable('candles', 'time', 
        chunk_time_interval => INTERVAL '1 day',
        if_not_exists => TRUE
      );
    `)
    
    // Create trades table for individual trade records
    await timescalePool.query(`
      CREATE TABLE IF NOT EXISTS trades (
        time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        trading_pair VARCHAR(20) NOT NULL,
        trade_id VARCHAR(50) NOT NULL,
        order_id VARCHAR(50) NOT NULL,
        side VARCHAR(4) NOT NULL, -- 'buy' or 'sell'
        amount DECIMAL(20,8) NOT NULL,
        price DECIMAL(20,8) NOT NULL,
        fee DECIMAL(20,8) NOT NULL DEFAULT 0,
        fee_asset VARCHAR(10) NOT NULL,
        maker_user_id VARCHAR(50),
        taker_user_id VARCHAR(50),
        PRIMARY KEY (time, trade_id)
      );
    `)
    
    // Create hypertable for trades
    await timescalePool.query(`
      SELECT create_hypertable('trades', 'time',
        chunk_time_interval => INTERVAL '1 day',
        if_not_exists => TRUE
      );
    `)
    
    // Create ticker table for 24h statistics
    await timescalePool.query(`
      CREATE TABLE IF NOT EXISTS tickers (
        time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        trading_pair VARCHAR(20) NOT NULL,
        last_price DECIMAL(20,8) NOT NULL,
        price_change_24h DECIMAL(20,8) NOT NULL DEFAULT 0,
        price_change_percent_24h DECIMAL(8,4) NOT NULL DEFAULT 0,
        high_24h DECIMAL(20,8) NOT NULL DEFAULT 0,
        low_24h DECIMAL(20,8) NOT NULL DEFAULT 0,
        volume_24h DECIMAL(20,8) NOT NULL DEFAULT 0,
        quote_volume_24h DECIMAL(20,8) NOT NULL DEFAULT 0,
        trade_count_24h INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (time, trading_pair)
      );
    `)
    
    // Create indexes for performance
    await timescalePool.query(`
      CREATE INDEX IF NOT EXISTS idx_candles_pair_interval 
      ON candles (trading_pair, interval_type, time DESC);
    `)
    
    await timescalePool.query(`
      CREATE INDEX IF NOT EXISTS idx_trades_pair_time 
      ON trades (trading_pair, time DESC);
    `)
    
    // Create continuous aggregates for better performance
    await timescalePool.query(`
      CREATE MATERIALIZED VIEW IF NOT EXISTS candles_1h
      WITH (timescaledb.continuous) AS
      SELECT 
        time_bucket('1 hour', time) AS time,
        trading_pair,
        '1h' as interval_type,
        FIRST(open, time) as open,
        MAX(high) as high,
        MIN(low) as low,
        LAST(close, time) as close,
        SUM(volume) as volume,
        SUM(quote_volume) as quote_volume,
        SUM(trade_count) as trade_count
      FROM candles 
      WHERE interval_type = '1m'
      GROUP BY time_bucket('1 hour', time), trading_pair
      WITH NO DATA;
    `)
    
    console.log('✅ TimescaleDB schema initialized successfully')
  } catch (error) {
    console.error('❌ Failed to initialize TimescaleDB:', error)
    throw error
  }
}

export { timescalePool as timescaleDB } 