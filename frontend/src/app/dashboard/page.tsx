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
import React from 'react'

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
  const lastProcessedPriceRef = useRef<number>(0)
  const [orderForm, setOrderForm] = useState({
    side: 'buy' as 'buy' | 'sell',
    amount: '',
    price: '',
    orderType: 'limit' as 'limit' | 'market'
  })
  const [priceHistory, setPriceHistory] = useState<Array<{timestamp: number, price: number}>>([])
  const [candleData, setCandleData] = useState<Array<{
    timestamp: number
    open: number
    high: number
    low: number
    close: number
    volume: number
    isComplete: boolean
  }>>([])

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

  // Fetch candlestick data - load once and stream updates
  useEffect(() => {
    const fetchInitialCandleData = async () => {
      try {
        console.log('📊 Loading initial candlestick data...')
        
        // Reset price tracking for new pair
        lastProcessedPriceRef.current = 0
        
        const response = await fetch(`http://localhost:3001/analytics/candles?tradingPair=${selectedPair}&interval=1h&limit=50`)
        const result = await response.json()
        
        if (result.success && result.data.candles) {
          const formattedCandles = result.data.candles.map((candle: any) => ({
            timestamp: candle.timestamp,
            open: parseFloat(candle.open),
            high: parseFloat(candle.high),
            low: parseFloat(candle.low),
            close: parseFloat(candle.close),
            volume: parseFloat(candle.volume),
            isComplete: true // Historical candles are complete
          }))
          
          // Sort by timestamp to ensure chronological order
          formattedCandles.sort((a: {timestamp: number}, b: {timestamp: number}) => a.timestamp - b.timestamp)
          
          // Mark the last candle as current (incomplete)
          if (formattedCandles.length > 0) {
            formattedCandles[formattedCandles.length - 1].isComplete = false
          }
          
          console.log('✅ Historical candles loaded:', formattedCandles.length)
          setCandleData(formattedCandles)
        }
      } catch (error) {
        console.error('Failed to fetch initial candle data:', error)
      }
    }

    // Only load initial data once when component mounts or pair changes
    fetchInitialCandleData()
  }, [selectedPair]) // Only depend on selectedPair, not marketData

  // Real-time price streaming for current candle
  useEffect(() => {
    const currentPrice = marketData?.[selectedPair]
    if (!currentPrice || currentPrice <= 0) {
      return
    }

    // Only process if price changed significantly (more than 0.01 cents)
    const priceDiff = Math.abs(currentPrice - lastProcessedPriceRef.current)
    if (priceDiff < 0.01) {
      return
    }

    console.log('💰 Streaming price update:', currentPrice, 'diff:', priceDiff)
    lastProcessedPriceRef.current = currentPrice
    
    // Update only the current (last) candle with real-time price
    setCandleData(prev => {
      if (prev.length === 0) return prev
      
      const updated = [...prev]
      const currentCandle = { ...updated[updated.length - 1] }
      
      // Only update if this is the current incomplete candle
      if (!currentCandle.isComplete) {
        currentCandle.close = currentPrice
        currentCandle.high = Math.max(currentCandle.high, currentPrice)
        currentCandle.low = Math.min(currentCandle.low, currentPrice)
        
        updated[updated.length - 1] = currentCandle
        return updated
      }
      
      return prev
    })
  }, [marketData?.[selectedPair], selectedPair]) // Keep selectedPair to handle pair changes

  // Periodically add new candles (every hour for 1h candles)
  useEffect(() => {
    const addNewCandleInterval = setInterval(() => {
      const currentPrice = marketData?.[selectedPair]
      if (!currentPrice) return

      setCandleData(prev => {
        if (prev.length === 0) return prev

        const now = Date.now()
        const lastCandle = prev[prev.length - 1]
        const hourStart = Math.floor(now / (60 * 60 * 1000)) * (60 * 60 * 1000)
        const lastCandleHour = Math.floor(lastCandle.timestamp / (60 * 60 * 1000)) * (60 * 60 * 1000)

        // If we're in a new hour, complete the current candle and start a new one
        if (hourStart > lastCandleHour) {
          console.log('🕐 Starting new hourly candle')
          const updated = [...prev]
          
          // Mark the last candle as complete
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            isComplete: true
          }
          
          // Add new current candle
          const newCandle = {
            timestamp: hourStart,
            open: currentPrice,
            high: currentPrice,
            low: currentPrice,
            close: currentPrice,
            volume: 0,
            isComplete: false
          }
          
          updated.push(newCandle)
          
          // Keep only last 50 candles for performance
          return updated.slice(-50)
        }
        
        return prev
      })
    }, 60000) // Check every minute

    return () => clearInterval(addNewCandleInterval)
  }, [selectedPair]) // Remove candleData and marketData from dependencies

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

  // Enhanced chart component with proper candlesticks - memoized for performance
  const CandlestickChart = React.memo(({ data }: { data: Array<{timestamp: number, open: number, high: number, low: number, close: number, volume: number, isComplete: boolean}> }) => {
    const { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Bar, ReferenceLine } = require('recharts')
    
    if (data.length < 2) {
      return (
        <div className="h-96 bg-gray-800 rounded-lg flex items-center justify-center">
          <div className="text-center">
            <BarChart3 className="h-16 w-16 text-gray-500 mx-auto mb-4" />
            <p className="text-gray-400">Loading candlestick data...</p>
            <p className="text-3xl font-bold text-white mt-4">${formatPrice(currentPrice)}</p>
          </div>
        </div>
      )
    }

    const latest = data[data.length - 1]
    const previous = data[data.length - 2] 
    const change = latest.close - previous.close
    const changePercent = ((change / previous.close) * 100)

    // Memoize chart data to prevent recalculation on every render
    const chartData = React.useMemo(() => 
      data.map((candle, index) => ({
        ...candle,
        time: new Date(candle.timestamp).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        }),
        date: new Date(candle.timestamp).toLocaleDateString(),
        index
      })), [data]
    )

    // Memoize price range calculation
    const priceRange = React.useMemo(() => {
      const allPrices = data.flatMap(d => [d.open, d.high, d.low, d.close])
      const minPrice = Math.min(...allPrices)
      const maxPrice = Math.max(...allPrices)
      const padding = (maxPrice - minPrice) * 0.05
      return { minPrice, maxPrice, padding }
    }, [data])

    // Custom candlestick component - memoized with live candle styling
    const CandlestickBar = React.useCallback((props: any) => {
      const { payload, x, y, width, height } = props
      if (!payload || !payload.open || !payload.high || !payload.low || !payload.close) return null

      const { open, high, low, close, isComplete } = payload
      const isGreen = close >= open
      const baseColor = isGreen ? '#10b981' : '#ef4444'
      
      // Add visual distinction for live (incomplete) candles
      const color = isComplete ? baseColor : baseColor
      const opacity = isComplete ? 1 : 0.9
      const strokeWidth = isComplete ? 0.5 : 1
      
      // Calculate the scale
      const dataMin = priceRange.minPrice
      const dataMax = priceRange.maxPrice
      const range = dataMax - dataMin
      
      if (range === 0) return null
      
      // Calculate positions
      const candleWidth = Math.max(2, width * 0.8)
      const wickWidth = isComplete ? 1 : 1.5 // Slightly thicker wick for live candle
      const centerX = x + width / 2
      
      // Calculate Y positions (Recharts handles the scaling)
      const scaleY = (price: number) => {
        const ratio = (dataMax - price) / range
        return y + ratio * height
      }
      
      const highY = scaleY(high)
      const lowY = scaleY(low)
      const openY = scaleY(open)
      const closeY = scaleY(close)
      
      const bodyTop = Math.min(openY, closeY)
      const bodyHeight = Math.abs(openY - closeY)
      
      return (
        <g opacity={opacity}>
          {/* High-Low wick */}
          <line
            x1={centerX}
            y1={highY}
            x2={centerX}
            y2={lowY}
            stroke={color}
            strokeWidth={wickWidth}
          />
          
          {/* Open-Close body */}
          <rect
            x={centerX - candleWidth / 2}
            y={bodyTop}
            width={candleWidth}
            height={Math.max(bodyHeight, 1)}
            fill={color}
            stroke={color}
            strokeWidth={strokeWidth}
          />
          
          {/* Add pulse effect for live candle */}
          {!isComplete && (
            <rect
              x={centerX - candleWidth / 2}
              y={bodyTop}
              width={candleWidth}
              height={Math.max(bodyHeight, 1)}
              fill="none"
              stroke={color}
              strokeWidth={2}
              opacity={0.3}
              className="animate-pulse"
            />
          )}
        </g>
      )
    }, [priceRange])

    return (
      <div className="h-96 bg-gray-800 rounded-lg p-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <div className="text-3xl font-bold text-white">${formatPrice(latest.close)}</div>
            <div className={`text-lg flex items-center ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {change >= 0 ? <TrendingUp className="h-5 w-5 mr-2" /> : <TrendingDown className="h-5 w-5 mr-2" />}
              <span className="font-semibold">
                {change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%)
              </span>
              {!latest.isComplete && (
                <div className="ml-2 px-2 py-1 bg-blue-600 text-white text-xs rounded-full animate-pulse">
                  LIVE
                </div>
              )}
            </div>
          </div>
          <div className="text-right text-sm">
            <div className="text-gray-300">
              <span className="text-gray-400">High:</span> <span className="text-white font-mono">${formatPrice(Math.max(...data.map(d => d.high)))}</span>
            </div>
            <div className="text-gray-300">
              <span className="text-gray-400">Low:</span> <span className="text-white font-mono">${formatPrice(Math.min(...data.map(d => d.low)))}</span>
            </div>
            <div className="text-gray-300">
              <span className="text-gray-400">Volume:</span> <span className="text-white font-mono">{formatPrice(latest.volume)}</span>
            </div>
          </div>
        </div>
        
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 20, right: 20, left: 20, bottom: 40 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#374151" opacity={0.3} />
            
            <XAxis 
              dataKey="time"
              tick={{ fontSize: 11, fill: '#9CA3AF' }}
              tickLine={{ stroke: '#4B5563' }}
              axisLine={{ stroke: '#4B5563' }}
              interval="preserveStartEnd"
              tickMargin={8}
            />
            
            <YAxis 
              domain={[priceRange.minPrice - priceRange.padding, priceRange.maxPrice + priceRange.padding]}
              tick={{ fontSize: 11, fill: '#9CA3AF' }}
              tickLine={{ stroke: '#4B5563' }}
              axisLine={{ stroke: '#4B5563' }}
              tickFormatter={(value: number) => `$${value.toFixed(2)}`}
              width={60}
            />
            
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#1F2937', 
                border: '1px solid #374151',
                borderRadius: '8px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
              }}
              content={({ active, payload, label }: any) => {
                if (active && payload && payload[0]) {
                  const data = payload[0].payload
                  const isGreen = data.close >= data.open
                  return (
                    <div className="bg-gray-800 p-3 rounded-lg border border-gray-600 min-w-[200px]">
                      <p className="text-white font-semibold mb-2">{data.date} {label}</p>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Open:</span>
                          <span className="text-white font-mono">${parseFloat(data.open).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">High:</span>
                          <span className="text-blue-400 font-mono">${parseFloat(data.high).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Low:</span>
                          <span className="text-orange-400 font-mono">${parseFloat(data.low).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Close:</span>
                          <span className={`font-mono ${isGreen ? 'text-green-400' : 'text-red-400'}`}>
                            ${parseFloat(data.close).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-gray-600">
                          <span className="text-gray-400">Volume:</span>
                          <span className="text-gray-300 font-mono">{parseFloat(data.volume).toFixed(0)}</span>
                        </div>
                      </div>
                    </div>
                  )
                }
                return null
              }}
            />
            
            {/* Invisible bars for positioning, but use Bar with custom shape */}
            <Bar 
              dataKey="high"
              fill="transparent"
              shape={<CandlestickBar />}
            />
          </ComposedChart>
        </ResponsiveContainer>
        
        <div className="flex justify-between text-xs text-gray-400 mt-3 pt-2 border-t border-gray-700">
          <span className="flex items-center">
            <div className={`w-2 h-2 rounded-full mr-2 ${latest.isComplete ? 'bg-gray-400' : 'bg-green-400 animate-pulse'}`}></div>
            {latest.isComplete ? 'Historical Data' : 'Live Streaming'} • 1H Candlesticks
          </span>
          <span>
            {data.length} candles • {data.filter(d => !d.isComplete).length} live • Updated: {new Date().toLocaleTimeString()}
          </span>
        </div>
      </div>
    )
  })

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
              <CandlestickChart data={candleData} />
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