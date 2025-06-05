'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import { apiClient, walletApi, tradingApi, OrderBook } from '@/lib/api'
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft,
  RefreshCw,
  ExternalLink,
  Activity,
  DollarSign,
  BarChart3,
  BookOpen,
  Settings
} from 'lucide-react'
import { toast } from 'sonner'

interface Balance {
  asset: string
  chain: string
  available: string
  locked: string
  total: string
}

interface MarketData {
  [key: string]: number // Market maker API returns { "SOL/USDC": 150.47, "ETH/USDC": 2589.61 }
}

interface Trade {
  id: string
  price: string
  amount: string
  side: 'buy' | 'sell'
  timestamp: string
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [balances, setBalances] = useState<Balance[]>([])
  const [marketData, setMarketData] = useState<MarketData | null>(null)
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null)
  const [selectedPair, setSelectedPair] = useState('SOL/USDC')
  const [loading, setLoading] = useState(true)
  const [recentTrades, setRecentTrades] = useState<Trade[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const [orderForm, setOrderForm] = useState({
    side: 'buy' as 'buy' | 'sell',
    amount: '',
    price: '',
    orderType: 'limit' as 'limit' | 'market'
  })
  const [priceHistory, setPriceHistory] = useState<Array<{timestamp: number, price: number}>>([])

  // WebSocket connection for real-time updates
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        console.log('🔌 Connecting to WebSocket...')
        const ws = new WebSocket('ws://localhost:3001/ws')
        
        ws.onopen = () => {
          console.log('✅ WebSocket connected to SwiftEx')
          setIsConnected(true)
          
          // Subscribe to order book updates for current trading pair
          const subscribeMessage = {
            type: 'subscribe',
            data: {
              channels: [
                `orderbook@${selectedPair}`,
                `ticker@${selectedPair}`,
                `trade@${selectedPair}`
              ]
            }
          }
          console.log('📤 Subscribing to channels:', subscribeMessage)
          ws.send(JSON.stringify(subscribeMessage))
        }
        
        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            console.log('📦 WebSocket message received:', data)
            
            switch (data.type) {
              case 'welcome':
                console.log('🎉 WebSocket welcome:', data.data.message)
                break
                
              case 'subscribe':
                console.log('✅ Subscription confirmed for:', data.channel)
                break
                
              case 'orderbook':
                console.log('📊 Order book update received for:', data.channel)
                if (data.data) {
                  setOrderBook(data.data)
                }
                break
                
              case 'ticker':
                console.log('💰 Ticker update:', data.data)
                if (data.data) {
                  setMarketData(prev => ({
                    ...prev,
                    [data.data.tradingPair]: parseFloat(data.data.lastPrice)
                  }))
                }
                break
                
              case 'trade':
                console.log('💸 Trade executed:', data.data)
                break
                
              case 'error':
                console.error('❌ WebSocket error from server:', data.data.error)
                break
                
              default:
                console.log('📋 Unknown WebSocket message type:', data.type)
            }
          } catch (error) {
            console.error('WebSocket message parse error:', error)
          }
        }
        
        ws.onclose = (event) => {
          console.log('🔌 WebSocket disconnected:', event.code, event.reason)
          setIsConnected(false)
          // Reconnect after 3 seconds
          setTimeout(connectWebSocket, 3000)
        }
        
        ws.onerror = (event) => {
          // WebSocket errors are often empty, so provide more context
          console.log('⚠️ WebSocket error occurred (this is normal during connection attempts)')
          setIsConnected(false)
          // Don't log the empty error object to avoid console spam
        }
        
        wsRef.current = ws
      } catch (error) {
        console.error('WebSocket connection error:', error)
        setTimeout(connectWebSocket, 3000)
      }
    }

    connectWebSocket()

    return () => {
      if (wsRef.current) {
        console.log('🔌 Closing WebSocket connection')
        wsRef.current.close()
      }
    }
  }, [selectedPair])

  // Fetch dashboard data
  useEffect(() => {
    fetchDashboardData()
    
    // Set up polling for data that WebSocket doesn't cover
    const interval = setInterval(fetchDashboardData, 10000) // Reduced frequency since WebSocket provides real-time updates
    return () => clearInterval(interval)
  }, [selectedPair])

  const fetchDashboardData = async () => {
    try {
      console.log('🔄 Fetching dashboard data for:', selectedPair)
      const promises = []
      
      // Fetch balances (authenticated)
      if (user) {
        promises.push(walletApi.getBalances())
      }
      
      // Convert SOL/USDC to SOLUSDC for API calls
      const urlSafePair = selectedPair.replace('/', '')
      
      // Fetch public market data
      promises.push(
        fetch('http://localhost:3001/public/prices').then(res => res.json()),
        fetch(`http://localhost:3001/orderbook/${urlSafePair}`).then(res => res.json()) // Use direct order book endpoint that works
      )

      const results = await Promise.all(promises)
      
      if (user && results[0]?.data?.success) {
        setBalances(results[0].data.data.balances || [])
      }

      // Market data (Binance prices)
      const marketRes = results[user ? 1 : 0]
      if (marketRes.success) {
        console.log('💰 Market data loaded:', marketRes.data)
        setMarketData(marketRes.data)
      }

      // Order book
      const orderBookRes = results[user ? 2 : 1]
      if (orderBookRes.success) {
        console.log('📊 Order book loaded:', {
          pair: orderBookRes.data.tradingPair,
          bids: orderBookRes.data.bids.length,
          asks: orderBookRes.data.asks.length
        })
        setOrderBook(orderBookRes.data)
      } else {
        console.error('❌ Failed to load order book:', orderBookRes)
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error)
      toast.error('Failed to fetch market data')
    } finally {
      setLoading(false)
    }
  }

  const handlePlaceOrder = async () => {
    if (!user) {
      toast.error('Please login to place orders')
      return
    }

    try {
      const response = await tradingApi.createOrder({
        tradingPair: selectedPair,
        orderType: orderForm.orderType,
        side: orderForm.side,
        amount: orderForm.amount,
        price: orderForm.orderType === 'limit' ? orderForm.price : undefined
      })

      if (response.data.success) {
        toast.success('Order placed successfully!')
        setOrderForm({ side: 'buy', amount: '', price: '', orderType: 'limit' })
        fetchDashboardData()
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to place order')
    }
  }

  const formatPrice = (price: string | number) => {
    if (price === undefined || price === null) return '0.00'
    return parseFloat(price.toString()).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 6
    })
  }

  const formatPercent = (percent: string | number | undefined) => {
    if (percent === undefined || percent === null || isNaN(Number(percent))) {
      return '+0.00%'
    }
    const val = parseFloat(percent.toString())
    return `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`
  }

  // Add price to history when market data updates
  useEffect(() => {
    const currentPrice = marketData?.[selectedPair]
    if (currentPrice && currentPrice > 0) {
      setPriceHistory(prev => {
        const newPoint = { timestamp: Date.now(), price: currentPrice }
        const updated = [...prev, newPoint]
        // Keep only last 50 points for chart
        return updated.slice(-50)
      })
    }
  }, [marketData, selectedPair])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading trading interface...</p>
        </div>
      </div>
    )
  }

  const currentPrice = marketData?.[selectedPair] || 0
  const baseAsset = selectedPair.split('/')[0]
  const quoteAsset = selectedPair.split('/')[1]

  // Create simple chart component
  const SimpleChart = ({ data }: { data: Array<{timestamp: number, price: number}> }) => {
    if (data.length < 2) {
      return (
        <div className="h-64 bg-gray-700 rounded-lg flex items-center justify-center">
          <div className="text-center">
            <BarChart3 className="h-16 w-16 text-gray-500 mx-auto mb-4" />
            <p className="text-gray-400">Collecting price data...</p>
            <p className="text-3xl font-bold text-white mt-4">${formatPrice(currentPrice)}</p>
          </div>
        </div>
      )
    }

    const maxPrice = Math.max(...data.map(d => d.price))
    const minPrice = Math.min(...data.map(d => d.price))
    const priceRange = maxPrice - minPrice || 0.01 // Prevent division by zero
    const latest = data[data.length - 1]
    const previous = data[data.length - 2]
    const change = latest.price - previous.price
    const changePercent = ((change / previous.price) * 100)

    // Safely calculate Y positions to avoid NaN
    const calculateY = (price: number) => {
      if (priceRange === 0 || isNaN(price) || !isFinite(price)) return 50 // Center line if no price variation or invalid price
      const y = 100 - ((price - minPrice) / priceRange) * 100
      return Math.max(0, Math.min(100, y)) // Clamp between 0 and 100
    }

    return (
      <div className="h-64 bg-gray-700 rounded-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <div className="text-2xl font-bold text-white">${formatPrice(latest.price)}</div>
            <div className={`text-sm ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%)
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">H: ${formatPrice(maxPrice)}</div>
            <div className="text-xs text-gray-400">L: ${formatPrice(minPrice)}</div>
          </div>
        </div>
        
        <svg className="w-full h-32" viewBox="0 0 400 100">
          <polyline
            points={data.map((point, index) => {
              const x = (index / (data.length - 1)) * 400
              const y = calculateY(point.price)
              return `${x},${y}`
            }).join(' ')}
            fill="none"
            stroke={change >= 0 ? "#10b981" : "#ef4444"}
            strokeWidth="2"
          />
          <circle
            cx="400"
            cy={calculateY(latest.price)}
            r="3"
            fill={change >= 0 ? "#10b981" : "#ef4444"}
          />
        </svg>
        
        <div className="flex justify-between text-xs text-gray-400 mt-2">
          <span>Market Maker Active</span>
          <span>
            {orderBook ? `${orderBook.bids.length} bids • ${orderBook.asks.length} asks` : 'Loading...'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Top Navigation Bar */}
      <div className="bg-gray-900 border-b border-gray-700 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-8">
            <h1 className="text-xl font-bold text-white">SwiftEx</h1>
            <div className="flex items-center space-x-2">
              <span className="text-gray-400">Trading:</span>
              <select
                value={selectedPair}
                onChange={(e) => setSelectedPair(e.target.value)}
                className="bg-gray-800 border border-gray-600 rounded px-3 py-1 text-white"
              >
                <option value="SOL/USDC">SOL/USDC</option>
                <option value="ETH/USDC">ETH/USDC</option>
              </select>
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-2xl font-bold text-white">
                ${formatPrice(currentPrice)}
              </div>
              <div className="flex items-center text-green-400">
                <div className={`w-2 h-2 rounded-full mr-1 ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
                <span className="text-sm">{isConnected ? 'Live' : 'Offline'}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-gray-400">Welcome, {user?.email || 'Guest'}</span>
            <button
              onClick={fetchDashboardData}
              className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-64px)]">
        {/* Left Sidebar - Portfolio */}
        <div className="w-64 bg-gray-900 border-r border-gray-700 p-4">
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center">
              <Wallet className="h-5 w-5 mr-2" />
              Portfolio
            </h2>
            <div className="space-y-3">
              {balances.length === 0 ? (
                <p className="text-gray-500 text-sm">
                  {user ? 'No balances' : 'Login to view balances'}
                </p>
              ) : (
                balances.map((balance, index) => (
                  <div key={index} className="bg-gray-800 rounded-lg p-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium text-white">{balance.asset}</div>
                        <div className="text-xs text-gray-400">{balance.chain}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-white">
                          {formatPrice(balance.available)}
                        </div>
                        <div className="text-xs text-gray-400">
                          Locked: {formatPrice(balance.locked)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="space-y-2">
            {user ? (
              <>
                <a
                  href="/dashboard/wallet"
                  className="w-full bg-green-600 hover:bg-green-700 rounded-lg p-2 flex items-center justify-center text-sm font-medium transition-colors"
                >
                  <ArrowDownLeft className="h-4 w-4 mr-2" />
                  Deposit
                </a>
                <a
                  href="/dashboard/wallet"
                  className="w-full bg-red-600 hover:bg-red-700 rounded-lg p-2 flex items-center justify-center text-sm font-medium transition-colors"
                >
                  <ArrowUpRight className="h-4 w-4 mr-2" />
                  Withdraw
                </a>
              </>
            ) : (
              <a
                href="/auth/login"
                className="w-full bg-blue-600 hover:bg-blue-700 rounded-lg p-2 flex items-center justify-center text-sm font-medium transition-colors"
              >
                Login to Trade
              </a>
            )}
          </div>
        </div>

        {/* Main Trading Interface */}
        <div className="flex-1 flex">
          {/* Chart Area (Left) */}
          <div className="flex-1 bg-gray-900 p-4">
            <div className="bg-gray-800 rounded-lg h-full p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Price Chart - {selectedPair}</h3>
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-gray-400">Real-time Price Feed</span>
                  <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></div>
                </div>
              </div>
              
              {/* Real-time Chart */}
              <SimpleChart data={priceHistory} />
            </div>
          </div>

          {/* Right Panel - Order Book & Trading */}
          <div className="w-96 bg-gray-900 border-l border-gray-700 flex flex-col">
            {/* Order Book */}
            <div className="flex-1 p-4">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <BookOpen className="h-5 w-5 mr-2" />
                Order Book
                {isConnected && <div className="w-2 h-2 bg-green-400 rounded-full ml-2 animate-pulse"></div>}
                {orderBook && (
                  <span className="ml-auto text-xs text-gray-400">
                    {orderBook.bids.length}↗ | {orderBook.asks.length}↘
                  </span>
                )}
              </h3>
              
              {orderBook ? (
                <div className="space-y-1 text-sm font-mono">
                  {/* Asks (Sell Orders) - Show top 6 in reverse order */}
                  <div className="space-y-px">
                    <div className="flex justify-between text-xs text-gray-400 pb-1 font-sans">
                      <span>Price ({quoteAsset})</span>
                      <span>Amount ({baseAsset})</span>
                    </div>
                    {orderBook.asks.slice(0, 6).reverse().map((ask, index) => (
                      <div key={`ask-${index}`} className="flex justify-between py-1 hover:bg-red-900/20 rounded px-2 transition-colors">
                        <span className="text-red-400">${formatPrice(ask.price)}</span>
                        <span className="text-gray-300">{parseFloat(ask.amount).toFixed(3)}</span>
                      </div>
                    ))}
                    {orderBook.asks.length === 0 && (
                      <div className="text-center py-2 text-gray-500 text-xs font-sans">No asks</div>
                    )}
                  </div>

                  {/* Current Price Spread */}
                  <div className="bg-gray-700 rounded py-3 px-3 my-3">
                    <div className="text-center">
                      <div className="text-lg font-bold text-white">
                        ${formatPrice(currentPrice)}
                      </div>
                      {orderBook.bids.length > 0 && orderBook.asks.length > 0 && (
                        <div className="text-xs text-gray-400 mt-1">
                          Spread: ${(parseFloat(orderBook.asks[0].price) - parseFloat(orderBook.bids[0].price)).toFixed(2)}
                        </div>
                      )}
                      <div className="text-xs text-gray-400">Market Price</div>
                    </div>
                  </div>

                  {/* Bids (Buy Orders) - Show top 6 */}
                  <div className="space-y-px">
                    {orderBook.bids.slice(0, 6).map((bid, index) => (
                      <div key={`bid-${index}`} className="flex justify-between py-1 hover:bg-green-900/20 rounded px-2 transition-colors">
                        <span className="text-green-400">${formatPrice(bid.price)}</span>
                        <span className="text-gray-300">{parseFloat(bid.amount).toFixed(3)}</span>
                      </div>
                    ))}
                    {orderBook.bids.length === 0 && (
                      <div className="text-center py-2 text-gray-500 text-xs font-sans">No bids</div>
                    )}
                  </div>
                  
                  {/* Order Book Stats */}
                  <div className="border-t border-gray-600 pt-2 mt-2">
                    <div className="flex justify-between text-xs text-gray-400 font-sans">
                      <span>Total Volume</span>
                      <span>
                        {orderBook.bids.length + orderBook.asks.length} orders
                      </span>
                    </div>
                    <div className="flex justify-between text-xs text-gray-400 font-sans mt-1">
                      <span>Last Updated</span>
                      <span>{new Date(orderBook.lastUpdated).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
                  <div className="text-gray-400 text-sm">Loading order book...</div>
                </div>
              )}
            </div>

            {/* Trading Interface */}
            {user && (
              <div className="border-t border-gray-700 p-4">
                <h3 className="text-lg font-semibold mb-4">Trade {selectedPair}</h3>
                
                {/* Order Type Toggle */}
                <div className="flex bg-gray-800 rounded-lg p-1 mb-4">
                  <button
                    onClick={() => setOrderForm({...orderForm, orderType: 'limit'})}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium ${
                      orderForm.orderType === 'limit'
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-300 hover:text-white'
                    }`}
                  >
                    Limit
                  </button>
                  <button
                    onClick={() => setOrderForm({...orderForm, orderType: 'market'})}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium ${
                      orderForm.orderType === 'market'
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-300 hover:text-white'
                    }`}
                  >
                    Market
                  </button>
                </div>

                {/* Buy/Sell Toggle */}
                <div className="flex bg-gray-800 rounded-lg p-1 mb-4">
                  <button
                    onClick={() => setOrderForm({...orderForm, side: 'buy'})}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium ${
                      orderForm.side === 'buy'
                        ? 'bg-green-600 text-white'
                        : 'text-gray-300 hover:text-white'
                    }`}
                  >
                    Buy
                  </button>
                  <button
                    onClick={() => setOrderForm({...orderForm, side: 'sell'})}
                    className={`flex-1 py-2 px-4 rounded-md text-sm font-medium ${
                      orderForm.side === 'sell'
                        ? 'bg-red-600 text-white'
                        : 'text-gray-300 hover:text-white'
                    }`}
                  >
                    Sell
                  </button>
                </div>

                {/* Order Form */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">
                      Amount ({baseAsset})
                    </label>
                    <input
                      type="number"
                      value={orderForm.amount}
                      onChange={(e) => setOrderForm({...orderForm, amount: e.target.value})}
                      className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                      placeholder="0.00"
                    />
                  </div>

                  {orderForm.orderType === 'limit' && (
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        Price ({quoteAsset})
                      </label>
                      <input
                        type="number"
                        value={orderForm.price}
                        onChange={(e) => setOrderForm({...orderForm, price: e.target.value})}
                        className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                        placeholder={formatPrice(currentPrice)}
                      />
                    </div>
                  )}

                  <button
                    onClick={handlePlaceOrder}
                    disabled={!orderForm.amount || (orderForm.orderType === 'limit' && !orderForm.price)}
                    className={`w-full py-3 rounded-lg font-medium text-sm ${
                      orderForm.side === 'buy'
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-red-600 hover:bg-red-700 text-white'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {orderForm.orderType === 'market' ? 'Market' : 'Limit'} {orderForm.side === 'buy' ? 'Buy' : 'Sell'} {baseAsset}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}