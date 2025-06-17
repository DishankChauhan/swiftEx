import axios from 'axios';
import cron from 'node-cron';
import { prisma } from '../config/database.js';
import { redis } from '../config/redis.js';
import { ledgerService } from './ledger.service.js';
import { orderBookService } from './orderbook.service.js';

interface BinancePrice {
  symbol: string;
  price: string;
}

interface BinanceTicker {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  lastPrice: string;
  volume: string;
  bidPrice: string;
  askPrice: string;
}

interface MarketMakerConfig {
  tradingPair: string;
  spread: number; // 0.002 = 0.2%
  orderSize: number;
  maxOrders: number;
  priceDeviation: number; // Maximum deviation from Binance price
  enabled: boolean;
}

class MarketMakerService {
  start() {
    throw new Error('Method not implemented.');
  }
  private config: Map<string, MarketMakerConfig> = new Map();
  private binancePrices: Map<string, number> = new Map();
  private marketMakerId: string = 'market-maker-bot';
  private isRunning: boolean = false;
  private priceUpdateTask: any = null;
  private marketMakingTimeout: NodeJS.Timeout | null = null;
  private isShuttingDown: boolean = false;

  constructor() {
    this.initializeConfig();
    this.startPriceFeed();
    this.startMarketMaking();
  }

  /**
   * Initialize market maker configuration
   */
  private initializeConfig(): void {
    // Configure SOL/USDC market making
    this.config.set('SOL/USDC', {
      tradingPair: 'SOL/USDC',
      spread: 0.002, // 0.2% spread
      orderSize: 10, // 10 SOL per order
      maxOrders: 5, // Max 5 orders each side
      priceDeviation: 0.05, // 5% max deviation from Binance
      enabled: true
    });

    // Configure ETH/USDC market making
    this.config.set('ETH/USDC', {
      tradingPair: 'ETH/USDC',
      spread: 0.001, // 0.1% spread
      orderSize: 1, // 1 ETH per order
      maxOrders: 5, // Max 5 orders each side
      priceDeviation: 0.05, // 5% max deviation from Binance
      enabled: true
    });

    console.log('Market maker configuration initialized');
  }

  /**
   * Start Binance price feed
   */
  private startPriceFeed(): void {
    // Update prices every 5 seconds
    this.priceUpdateTask = cron.schedule('*/5 * * * * *', async () => {
      if (!this.isShuttingDown) {
        await this.updateBinancePrices();
      }
    });

    // Initial price fetch
    this.updateBinancePrices();
    console.log('Binance price feed started');
  }

  /**
   * Fetch prices from Binance API
   */
  private async updateBinancePrices(): Promise<void> {
    try {
      const symbols = ['SOLUSDC', 'ETHUSDC'];
      const response = await axios.get<BinanceTicker[]>(
        'https://api.binance.com/api/v3/ticker/24hr',
        {
          params: {
            symbols: JSON.stringify(symbols)
          },
          timeout: 5000
        }
      );

      for (const ticker of response.data) {
        let pair: string;
        if (ticker.symbol === 'SOLUSDC') {
          pair = 'SOL/USDC';
        } else if (ticker.symbol === 'ETHUSDC') {
          pair = 'ETH/USDC';
        } else {
          continue;
        }

        const price = parseFloat(ticker.lastPrice);
        this.binancePrices.set(pair, price);

        // Store in Redis for other services
        await redis.setEx(`binance_price:${pair}`, 30, price.toString());
        
        // Store market data
        await redis.hSet(`market_data:${pair}`, {
          price: ticker.lastPrice,
          change: ticker.priceChange,
          changePercent: ticker.priceChangePercent,
          volume: ticker.volume,
          bidPrice: ticker.bidPrice,
          askPrice: ticker.askPrice,
          timestamp: Date.now().toString()
        });
      }

      console.log('Updated Binance prices:', Object.fromEntries(this.binancePrices));
    } catch (error) {
      console.error('Error fetching Binance prices:', error);
    }
  }

  /**
   * Start market making process
   */
  private startMarketMaking(): void {
    // Market making every 3-8 seconds (random interval)
    const scheduleNextOrder = () => {
      if (this.isShuttingDown) {
        console.log('🛑 Market making stopped due to shutdown');
        return;
      }

      const randomDelay = Math.floor(Math.random() * 5000) + 3000; // 3-8 seconds
      this.marketMakingTimeout = setTimeout(async () => {
        if (!this.isRunning && !this.isShuttingDown) {
          this.isRunning = true;
          await this.performRandomMarketMaking();
          this.isRunning = false;
        }
        scheduleNextOrder(); // Schedule next order
      }, randomDelay);
    };

    scheduleNextOrder();
    console.log('Market making service started - placing orders randomly');
  }

  /**
   * Perform random market making - place one random order
   */
  private async performRandomMarketMaking(): Promise<void> {
    const enabledPairs = Array.from(this.config.entries()).filter(([, config]) => config.enabled);
    if (enabledPairs.length === 0) return;

    // Pick a random trading pair
    const [pair, config] = enabledPairs[Math.floor(Math.random() * enabledPairs.length)];

    try {
      await this.placeRandomOrderForPair(pair, config);
    } catch (error) {
      console.error(`Error placing random order for ${pair}:`, error);
    }
  }

  /**
   * Place a single random order for a specific trading pair
   */
  private async placeRandomOrderForPair(pair: string, config: MarketMakerConfig): Promise<void> {
    const binancePrice = this.binancePrices.get(pair);
    if (!binancePrice) {
      console.log(`No Binance price available for ${pair}`);
      return;
    }

    // Ensure market maker user exists
    await this.ensureMarketMakerUser();

    // Get current order book
    const orderBook = await orderBookService.getOrderBook(pair);
    
    // Calculate target bid/ask prices
    const spread = config.spread;
    const bidPrice = binancePrice * (1 - spread / 2);
    const askPrice = binancePrice * (1 + spread / 2);

    // Cancel old market maker orders that are too far from current price
    await this.cancelStaleOrders(pair, binancePrice, config.priceDeviation);

    // Count existing market maker orders
    const existingBids = orderBook.bids.filter((order: any) => 
      order.userId === this.marketMakerId
    ).length;
    const existingAsks = orderBook.asks.filter((order: any) => 
      order.userId === this.marketMakerId
    ).length;

    // Decide randomly whether to place a bid or ask (or both if we're low on orders)
    const needsBids = existingBids < config.maxOrders;
    const needsAsks = existingAsks < config.maxOrders;
    
    if (!needsBids && !needsAsks) {
      return; // Already have enough orders
    }

    let side: 'buy' | 'sell';
    if (needsBids && needsAsks) {
      // Randomly choose side if both are needed
      side = Math.random() < 0.5 ? 'buy' : 'sell';
    } else if (needsBids) {
      side = 'buy';
    } else {
      side = 'sell';
    }

    // Calculate order price with random price level
    const maxLevels = 5; // Maximum price levels
    const currentOrdersOnSide = side === 'buy' ? existingBids : existingAsks;
    const priceLevel = Math.floor(Math.random() * Math.min(maxLevels, config.maxOrders - currentOrdersOnSide)) + 1;
    const priceOffset = priceLevel * 0.001; // 0.1% price steps
    
    let orderPrice: number;
    if (side === 'buy') {
      orderPrice = bidPrice * (1 - priceOffset);
    } else {
      orderPrice = askPrice * (1 + priceOffset);
    }

    // Add some random variation to the order size (±10%)
    const baseSize = config.orderSize;
    const sizeVariation = (Math.random() - 0.5) * 0.2; // ±10%
    const orderSize = baseSize * (1 + sizeVariation);

    await this.placeMarketMakerOrder(
      pair,
      side,
      orderSize.toFixed(6),
      orderPrice.toFixed(6)
    );
  }

  /**
   * Ensure market maker user exists with sufficient balance
   */
  private async ensureMarketMakerUser(): Promise<void> {
    try {
      let user = await prisma.user.findUnique({
        where: { id: this.marketMakerId }
      });

      if (!user) {
        // Create market maker user
        user = await prisma.user.create({
          data: {
            id: this.marketMakerId,
            email: 'market-maker@swiftex.com',
            password: 'market-maker-password', // Not used
            kycStatus: 'approved'
          }
        });
      }

      // Ensure sufficient balances for market making
      await this.ensureBalance('SOL', 'solana', 10000); // 10,000 SOL
      await this.ensureBalance('ETH', 'ethereum', 1000); // 1,000 ETH
      await this.ensureBalance('USDC', 'solana', 1000000); // 1M USDC on Solana
      await this.ensureBalance('USDC', 'ethereum', 1000000); // 1M USDC on Ethereum

    } catch (error) {
      console.error('Error ensuring market maker user:', error);
    }
  }

  /**
   * Ensure market maker has sufficient balance for an asset
   */
  private async ensureBalance(asset: string, chain: string, minAmount: number): Promise<void> {
    try {
      let balance = await prisma.balance.findUnique({
        where: {
          userId_asset_chain: {
            userId: this.marketMakerId,
            asset,
            chain
          }
        }
      });

      const currentBalance = balance ? parseFloat(balance.available) : 0;

      if (currentBalance < minAmount) {
        const addAmount = minAmount - currentBalance;

        if (!balance) {
          // Create new balance
          await prisma.balance.create({
            data: {
              userId: this.marketMakerId,
              asset,
              chain,
              available: addAmount.toString(),
              locked: '0',
              total: addAmount.toString()
            }
          });
        } else {
          // Update existing balance
          await prisma.balance.update({
            where: { id: balance.id },
            data: {
              available: (currentBalance + addAmount).toString(),
              total: (parseFloat(balance.total) + addAmount).toString()
            }
          });
        }

        // Create ledger entry
        await prisma.ledgerEntry.create({
          data: {
            userId: this.marketMakerId,
            entryType: 'deposit',
            asset,
            amount: addAmount.toString(),
            balanceBefore: currentBalance.toString(),
            balanceAfter: (currentBalance + addAmount).toString(),
            description: `Market maker balance provision: ${addAmount} ${asset}`
          }
        });

        console.log(`Added ${addAmount} ${asset} to market maker balance`);
      }
    } catch (error) {
      console.error(`Error ensuring balance for ${asset}:`, error);
    }
  }

  /**
   * Cancel stale market maker orders
   */
  private async cancelStaleOrders(pair: string, currentPrice: number, maxDeviation: number): Promise<void> {
    try {
      const staleOrders = await prisma.order.findMany({
        where: {
          userId: this.marketMakerId,
          tradingPair: pair,
          status: 'pending'
        }
      });

      for (const order of staleOrders) {
        const orderPrice = parseFloat(order.price || '0');
        const deviation = Math.abs(orderPrice - currentPrice) / currentPrice;

        if (deviation > maxDeviation) {
          // Cancel stale order
          await ledgerService.cancelOrder(this.marketMakerId, order.id);
          console.log(`Cancelled stale market maker order: ${order.id} (${deviation * 100}% deviation)`);
        }
      }
    } catch (error) {
      console.error('Error cancelling stale orders:', error);
    }
  }

  /**
   * Place a market maker order
   */
  private async placeMarketMakerOrder(
    tradingPair: string,
    side: 'buy' | 'sell',
    amount: string,
    price: string
  ): Promise<void> {
    try {
      const order = await ledgerService.createOrder(this.marketMakerId, {
        tradingPair,
        orderType: 'limit',
        side,
        amount,
        price,
        timeInForce: 'GTC'
      });

      console.log(`✅ Placed market maker ${side} order: ${amount} ${tradingPair} @ ${price} (ID: ${order.id})`);
    } catch (error) {
      console.error(`❌ Failed to place market maker ${side} order: ${amount} ${tradingPair} @ ${price}`);
      console.error(`   Error:`, error instanceof Error ? error.message : error);
      
      // If it's a balance issue, ensure balance and retry once
      if (error instanceof Error && error.message.includes('Insufficient')) {
        console.log(`   🔄 Attempting to refresh market maker balances...`);
        await this.ensureMarketMakerUser();
        
        try {
          const retryOrder = await ledgerService.createOrder(this.marketMakerId, {
            tradingPair,
            orderType: 'limit',
            side,
            amount,
            price,
            timeInForce: 'GTC'
          });
          console.log(`✅ Retry successful - Placed market maker ${side} order: ${amount} ${tradingPair} @ ${price} (ID: ${retryOrder.id})`);
        } catch (retryError) {
          console.error(`❌ Retry failed:`, retryError instanceof Error ? retryError.message : retryError);
        }
      }
    }
  }

  /**
   * Get current Binance price for a pair
   */
  public getBinancePrice(pair: string): number | null {
    return this.binancePrices.get(pair) || null;
  }

  /**
   * Get market data for a pair
   */
  public async getMarketData(pair: string): Promise<any> {
    try {
      const data = await redis.hGetAll(`market_data:${pair}`);
      return data;
    } catch (error) {
      console.error('Error getting market data:', error);
      return null;
    }
  }

  /**
   * Update market maker configuration
   */
  public updateConfig(pair: string, newConfig: Partial<MarketMakerConfig>): void {
    const currentConfig = this.config.get(pair);
    if (currentConfig) {
      this.config.set(pair, { ...currentConfig, ...newConfig });
      console.log(`Updated market maker config for ${pair}:`, newConfig);
    }
  }

  /**
   * Get current configuration
   */
  public getConfig(): Map<string, MarketMakerConfig> {
    return this.config;
  }

  /**
   * Enable/disable market making for a pair
   */
  public toggleMarketMaking(pair: string, enabled: boolean): void {
    const config = this.config.get(pair);
    if (config) {
      config.enabled = enabled;
      console.log(`Market making for ${pair}: ${enabled ? 'ENABLED' : 'DISABLED'}`);
    }
  }

  /**
   * Stop all market maker services (for graceful shutdown)
   */
  public stop(): void {
    console.log('🛑 Stopping Market Maker Service...');
    this.isShuttingDown = true;

    // Stop price feed cron job
    if (this.priceUpdateTask) {
      this.priceUpdateTask.stop();
      this.priceUpdateTask = null;
      console.log('✅ Price feed stopped');
    }

    // Clear market making timeout
    if (this.marketMakingTimeout) {
      clearTimeout(this.marketMakingTimeout);
      this.marketMakingTimeout = null;
      console.log('✅ Market making timeout cleared');
    }

    // Reset running state
    this.isRunning = false;
    console.log('✅ Market Maker Service stopped');
  }

  /**
   * Check if service is running
   */
  public isServiceRunning(): boolean {
    return !this.isShuttingDown;
  }
}

export const marketMakerService = new MarketMakerService();

// Export for standalone execution
if (import.meta.main) {
  console.log('🤖 Market Maker Bot Started');
  console.log('Configuration:', Object.fromEntries(marketMakerService.getConfig()));
  
  // Keep the process running
  process.on('SIGINT', () => {
    console.log('\n🛑 Market Maker Bot Stopped');
    process.exit(0);
  });
} 