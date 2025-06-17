import { Server as SocketIOServer } from 'socket.io'
import redis from '../config/redis'
import { verifyAccessToken } from '../utils/jwt'

// Define missing constants
const REDIS_KEYS = {
  subscribers: (channel: string) => `ws:subscribers:${channel}`
}

const CHANNELS = {
  orderBook: (tradingPair: string) => `orderbook@${tradingPair}`,
  trade: (tradingPair: string) => `trade@${tradingPair}`,
  ticker: (tradingPair: string) => `ticker@${tradingPair}`,
  allTickers: 'ticker@all'
}

interface WebSocketConnection {
  id: string
  userId?: string
  subscriptions: Set<string>
  socket: any
}

export class WebSocketService {
  private io?: SocketIOServer
  private connections: Map<string, WebSocketConnection> = new Map()
  private subscriptions: Map<string, Set<string>> = new Map() // channel -> connection IDs

  constructor(io?: SocketIOServer) {
    if (io) {
      this.io = io
      this.setupConnectionHandlers()
    }
  }

  private setupConnectionHandlers() {
    this.io?.on('connection', (socket: any) => {
      console.log(`WebSocket connection established: ${socket.id}`)
      
      const connection: WebSocketConnection = {
        id: socket.id,
        subscriptions: new Set(),
        socket
      }
      this.connections.set(socket.id, connection)

      // Handle authentication
      socket.on('authenticate', async (data: any) => {
        try {
          const { token } = data
          const payload = await verifyAccessToken(token)
          
          if (payload) {
            connection.userId = payload.userId
            socket.emit('authenticated', { success: true, userId: payload.userId })
          } else {
            socket.emit('authenticated', { success: false, message: 'Invalid token' })
          }
        } catch (error) {
          socket.emit('authenticated', { success: false, message: 'Authentication failed' })
        }
      })

      // Handle channel subscriptions
      socket.on('subscribe', (data: any) => {
        this.handleSubscription(socket.id, data)
      })

      socket.on('unsubscribe', (data: any) => {
        this.handleUnsubscription(socket.id, data)
      })

      // Handle disconnection
      socket.on('disconnect', () => {
        this.removeConnection(socket.id)
      })
    })
  }

  /**
   * Register a new WebSocket connection
   */
  addConnection(id: string, send: (message: string) => void): void {
    const connection: WebSocketConnection = {
      id,
      subscriptions: new Set(),
      socket: { send }
    }
    
    this.connections.set(id, connection)
    console.log(`WebSocket client ${id} connected. Total connections: ${this.connections.size}`)
  }

  /**
   * Remove a WebSocket connection
   */
  removeConnection(id: string): void {
    const connection = this.connections.get(id)
    if (connection) {
      // Unsubscribe from all channels
      for (const channel of connection.subscriptions) {
        this.unsubscribeFromChannel(id, channel)
      }
      this.connections.delete(id)
      console.log(`WebSocket client ${id} disconnected. Total connections: ${this.connections.size}`)
    }
  }

  /**
   * Handle incoming WebSocket message
   */
  handleMessage(connectionId: string, message: string): void {
    try {
      const data = JSON.parse(message) as any
      
      switch (data.type) {
        case 'subscribe':
          if (data.data && Array.isArray(data.data.channels)) {
            this.handleSubscription(connectionId, data.data)
          }
          break
          
        case 'unsubscribe':
          if (data.data && Array.isArray(data.data.channels)) {
            this.handleUnsubscription(connectionId, data.data)
          }
          break
          
        default:
          this.sendError(connectionId, 'Unknown message type')
      }
    } catch (error) {
      this.sendError(connectionId, 'Invalid message format')
    }
  }

  /**
   * Handle subscription request
   */
  private handleSubscription(connectionId: string, data: any): void {
    const connection = this.connections.get(connectionId)
    if (!connection) return

    for (const channel of data.channels) {
      if (this.isValidChannel(channel)) {
        this.subscribeToChannel(connectionId, channel)
        connection.subscriptions.add(channel)
        
        // Send confirmation
        this.sendMessage(connectionId, {
          type: 'subscribe',
          channel,
          data: { status: 'subscribed' },
          timestamp: new Date().toISOString()
        })
        
        // Send initial data for order book channels
        if (channel.startsWith('orderbook@')) {
          const tradingPair = channel.split('@')[1]
          this.sendInitialOrderBook(connectionId, tradingPair)
        }
        
        // Send initial ticker for ticker channels
        if (channel.startsWith('ticker@')) {
          const tradingPair = channel.split('@')[1]
          if (tradingPair !== 'all') {
            this.sendInitialTicker(connectionId, tradingPair)
          }
        }
      } else {
        this.sendError(connectionId, `Invalid channel: ${channel}`)
      }
    }
  }

  /**
   * Handle unsubscription request
   */
  private handleUnsubscription(connectionId: string, data: any): void {
    const connection = this.connections.get(connectionId)
    if (!connection) return

    for (const channel of data.channels) {
      this.unsubscribeFromChannel(connectionId, channel)
      connection.subscriptions.delete(channel)
      
      // Send confirmation
      this.sendMessage(connectionId, {
        type: 'unsubscribe',
        channel,
        data: { status: 'unsubscribed' },
        timestamp: new Date().toISOString()
      })
    }
  }

  /**
   * Subscribe to a Redis channel
   */
  private async subscribeToChannel(connectionId: string, channel: string): Promise<void> {
    try {
      await redis.sAdd(REDIS_KEYS.subscribers(channel), connectionId)
    } catch (error) {
      console.error(`Failed to subscribe ${connectionId} to ${channel}:`, error)
    }
  }

  /**
   * Unsubscribe from a Redis channel
   */
  private async unsubscribeFromChannel(connectionId: string, channel: string): Promise<void> {
    try {
      await redis.sRem(REDIS_KEYS.subscribers(channel), connectionId)
    } catch (error) {
      console.error(`Failed to unsubscribe ${connectionId} from ${channel}:`, error)
    }
  }

  /**
   * Validate channel name
   */
  private isValidChannel(channel: string): boolean {
    const patterns = [
      /^orderbook@[A-Z]+\/[A-Z]+$/,   // orderbook@SOL/USDC
      /^trade@[A-Z]+\/[A-Z]+$/,       // trade@SOL/USDC
      /^ticker@[A-Z]+\/[A-Z]+$/,      // ticker@SOL/USDC
      /^ticker@all$/,                 // ticker@all
      /^orders@[a-f0-9-]+$/           // orders@user-id
    ]
    
    return patterns.some(pattern => pattern.test(channel))
  }

  /**
   * Send initial order book data
   */
  private async sendInitialOrderBook(connectionId: string, tradingPair: string): Promise<void> {
    try {
      const { orderBookService } = await import('./orderbook.service')
      const orderBook = await orderBookService.getOrderBook(tradingPair, 20)
      
      this.sendMessage(connectionId, {
        type: 'orderbook',
        channel: CHANNELS.orderBook(tradingPair),
        data: orderBook,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('Failed to send initial order book:', error)
    }
  }

  /**
   * Send initial ticker data
   */
  private async sendInitialTicker(connectionId: string, tradingPair: string): Promise<void> {
    try {
      const { orderBookService } = await import('./orderbook.service')
      const [prices, stats] = await Promise.all([
        orderBookService.getBestPrices(tradingPair),
        orderBookService.getOrderBookStats(tradingPair)
      ])
      
      const ticker: any = {
        tradingPair,
        lastPrice: prices.bestAsk || '0',
        priceChange: '0',
        priceChangePercent: '0',
        volume24h: '0',
        high24h: prices.bestAsk || '0',
        low24h: prices.bestBid || '0',
        openPrice: prices.bestBid || '0',
        timestamp: new Date().toISOString()
      }
      
      this.sendMessage(connectionId, {
        type: 'ticker',
        channel: CHANNELS.ticker(tradingPair),
        data: ticker,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      console.error('Failed to send initial ticker:', error)
    }
  }

  /**
   * Broadcast order book update to subscribers
   */
  async broadcastOrderBookUpdate(tradingPair: string, orderBook: any): Promise<void> {
    const channel = CHANNELS.orderBook(tradingPair)
    await this.broadcastToChannel(channel, {
      type: 'orderbook',
      channel,
      data: orderBook,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * Broadcast trade to subscribers
   */
  async broadcastTrade(trade: any): Promise<void> {
    const channel = CHANNELS.trade(trade.tradingPair)
    await this.broadcastToChannel(channel, {
      type: 'trade',
      channel,
      data: trade,
      timestamp: new Date().toISOString()
    })
  }

  /**
   * Broadcast ticker update to subscribers
   */
  async broadcastTicker(ticker: any): Promise<void> {
    const channels = [
      CHANNELS.ticker(ticker.tradingPair),
      CHANNELS.allTickers
    ]
    
    for (const channel of channels) {
      await this.broadcastToChannel(channel, {
        type: 'ticker',
        channel,
        data: ticker,
        timestamp: new Date().toISOString()
      })
    }
  }

  /**
   * Broadcast message to all subscribers of a channel
   */
  private async broadcastToChannel(channel: string, message: any): Promise<void> {
    try {
      const subscribers = await redis.sMembers(REDIS_KEYS.subscribers(channel))
      
      for (const connectionId of subscribers) {
        const connection = this.connections.get(connectionId)
        if (connection) {
          this.sendMessage(connectionId, message)
        } else {
          // Clean up stale subscriber
          await redis.sRem(REDIS_KEYS.subscribers(channel), connectionId)
        }
      }
    } catch (error) {
      console.error(`Failed to broadcast to channel ${channel}:`, error)
    }
  }

  /**
   * Send message to a specific connection
   */
  private sendMessage(connectionId: string, message: any): void {
    const connection = this.connections.get(connectionId)
    if (connection) {
      try {
        connection.socket.send(JSON.stringify(message))
      } catch (error) {
        console.error(`Failed to send message to ${connectionId}:`, error)
        this.removeConnection(connectionId)
      }
    }
  }

  /**
   * Send error message to a connection
   */
  private sendError(connectionId: string, error: string): void {
    this.sendMessage(connectionId, {
      type: 'error',
      data: { error },
      timestamp: new Date().toISOString()
    })
  }

  /**
   * Close all WebSocket connections (for graceful shutdown)
   */
  closeAllConnections(): void {
    console.log(`🔌 Closing ${this.connections.size} WebSocket connections...`)
    
    for (const [connectionId, connection] of this.connections.entries()) {
      try {
        // Send goodbye message
        connection.socket.send(JSON.stringify({
          type: 'goodbye',
          data: { message: 'Server shutting down' },
          timestamp: new Date().toISOString()
        }))
        
        // Remove connection
        this.removeConnection(connectionId)
      } catch (error) {
        console.error(`Error closing connection ${connectionId}:`, error)
      }
    }
    
    this.connections.clear()
    console.log('✅ All WebSocket connections closed')
  }

  /**
   * Get connection statistics
   */
  getStats(): { totalConnections: number; totalSubscriptions: number } {
    let totalSubscriptions = 0
    for (const connection of this.connections.values()) {
      totalSubscriptions += connection.subscriptions.size
    }
    
    return {
      totalConnections: this.connections.size,
      totalSubscriptions
    }
  }
}

export const webSocketService = new WebSocketService() 