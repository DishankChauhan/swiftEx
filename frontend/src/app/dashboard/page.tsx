'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts'
import { 
  TrendingUp, 
  TrendingDown, 
  Volume2,
  RefreshCw,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import type { OrderBook } from '@/lib/api'
import { tradingApi, analyticsApi, wsClient, CandleData } from '@/lib/api'
import { toast } from 'sonner'

// Trading pair selector component
function TradingPairSelector({ 
  selectedPair, 
  onPairChange 
}: { 
  selectedPair: string
  onPairChange: (pair: string) => void 
}) {
  const { data: tradingPairs } = useQuery({
    queryKey: ['trading-pairs'],
    queryFn: () => analyticsApi.getTradingPairs(),
  })

  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 bg-gray-800 px-4 py-2 rounded-lg border border-gray-600 hover:border-gray-500"
      >
        <span className="text-white font-medium">{selectedPair}</span>
        {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-10">
          {tradingPairs?.data.data.pairs.map((pair: any) => (
            <button
              key={pair.symbol}
              onClick={() => {
                onPairChange(pair.symbol)
                setIsOpen(false)
              }}
              className="w-full text-left px-4 py-2 hover:bg-gray-700 text-white first:rounded-t-lg last:rounded-b-lg"
            >
              {pair.symbol}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Price chart component
function PriceChart({ tradingPair, interval }: { tradingPair: string; interval: string }) {
  const { data: candleData, isLoading } = useQuery({
    queryKey: ['candles', tradingPair, interval],
    queryFn: () => analyticsApi.getCandles(tradingPair, interval, 100),
    refetchInterval: 30000, // Refetch every 30 seconds
  })

  if (isLoading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const chartData = candleData?.data.data.candles.map((candle: CandleData) => ({
    time: new Date(candle.timestamp).getTime(),
    price: parseFloat(candle.close),
    volume: parseFloat(candle.volume),
  })) || []

  return (
    <div className="h-96">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis 
            dataKey="time" 
            tickFormatter={(time) => new Date(time).toLocaleTimeString()}
            stroke="#9CA3AF"
          />
          <YAxis stroke="#9CA3AF" />
          <Tooltip 
            labelFormatter={(time) => new Date(time).toLocaleString()}
            contentStyle={{ 
              backgroundColor: '#1F2937', 
              border: '1px solid #374151',
              borderRadius: '8px'
            }}
          />
          <Line 
            type="monotone" 
            dataKey="price" 
            stroke="#3B82F6" 
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

// Order book component
function OrderBook({ tradingPair }: { tradingPair: string }) {
  const [orderBook, setOrderBook] = useState<OrderBook | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchOrderBook = async () => {
      try {
        const response = await tradingApi.getOrderBook(tradingPair)
        if (response.data.success) {
          setOrderBook(response.data.data)
        }
      } catch (error) {
        console.error('Failed to fetch order book:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchOrderBook()
    const interval = setInterval(fetchOrderBook, 5000) // Update every 5 seconds

    return () => clearInterval(interval)
  }, [tradingPair])

  if (isLoading) {
    return (
      <div className="h-96 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const maxDepth = Math.max(
    orderBook?.bids.length || 0,
    orderBook?.asks.length || 0
  )

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-white font-medium mb-4 flex items-center">
        <Volume2 className="h-4 w-4 mr-2" />
        Order Book
      </h3>
      
      <div className="space-y-4">
        {/* Header */}
        <div className="grid grid-cols-3 gap-4 text-xs text-gray-400 font-medium">
          <div>Price</div>
          <div className="text-right">Amount</div>
          <div className="text-right">Total</div>
        </div>

        {/* Asks (Sell orders) */}
        <div className="space-y-1">
          {orderBook?.asks.slice(0, 10).reverse().map((ask, index) => (
            <div key={index} className="grid grid-cols-3 gap-4 text-xs">
              <div className="text-red-400 font-mono">{ask.price}</div>
              <div className="text-right text-gray-300 font-mono">{ask.amount}</div>
              <div className="text-right text-gray-300 font-mono">{ask.total || '0'}</div>
            </div>
          ))}
        </div>

        {/* Spread */}
        <div className="border-t border-gray-700 pt-2">
          <div className="text-center text-xs text-gray-400">
            Spread: {orderBook?.bids[0] && orderBook?.asks[0] ? 
              (parseFloat(orderBook.asks[0].price) - parseFloat(orderBook.bids[0].price)).toFixed(2) : 
              '0.00'
            }
          </div>
        </div>

        {/* Bids (Buy orders) */}
        <div className="space-y-1">
          {orderBook?.bids.slice(0, 10).map((bid, index) => (
            <div key={index} className="grid grid-cols-3 gap-4 text-xs">
              <div className="text-green-400 font-mono">{bid.price}</div>
              <div className="text-right text-gray-300 font-mono">{bid.amount}</div>
              <div className="text-right text-gray-300 font-mono">{bid.total || '0'}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Order form component
function OrderForm({ tradingPair }: { tradingPair: string }) {
  const [orderType, setOrderType] = useState<'limit' | 'market'>('limit')
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('')
  const [price, setPrice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      const orderData = {
        tradingPair,
        orderType,
        side,
        amount,
        ...(orderType === 'limit' && { price })
      }

      const response = await tradingApi.createOrder(orderData)
      
      if (response.data.success) {
        toast.success('Order placed successfully!')
        setAmount('')
        setPrice('')
      } else {
        toast.error('Failed to place order')
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to place order')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <h3 className="text-white font-medium mb-4">Place Order</h3>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Order type selector */}
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={() => setOrderType('limit')}
            className={`flex-1 py-2 px-4 rounded text-sm font-medium ${
              orderType === 'limit' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Limit
          </button>
          <button
            type="button"
            onClick={() => setOrderType('market')}
            className={`flex-1 py-2 px-4 rounded text-sm font-medium ${
              orderType === 'market' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Market
          </button>
        </div>

        {/* Buy/Sell selector */}
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={() => setSide('buy')}
            className={`flex-1 py-2 px-4 rounded text-sm font-medium ${
              side === 'buy' 
                ? 'bg-green-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Buy
          </button>
          <button
            type="button"
            onClick={() => setSide('sell')}
            className={`flex-1 py-2 px-4 rounded text-sm font-medium ${
              side === 'sell' 
                ? 'bg-red-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Sell
          </button>
        </div>

        {/* Price input (only for limit orders) */}
        {orderType === 'limit' && (
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1">
              Price
            </label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00"
              required
            />
          </div>
        )}

        {/* Amount input */}
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">
            Amount
          </label>
          <input
            type="number"
            step="0.000001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="0.00"
            required
          />
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className={`w-full py-3 px-4 rounded-lg font-medium ${
            side === 'buy' 
              ? 'bg-green-600 hover:bg-green-700 text-white' 
              : 'bg-red-600 hover:bg-red-700 text-white'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isSubmitting ? (
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" />
          ) : (
            `${side === 'buy' ? 'Buy' : 'Sell'} ${tradingPair.split('/')[0]}`
          )}
        </button>
      </form>
    </div>
  )
}

// Main trading page
export default function TradingPage() {
  const [selectedPair, setSelectedPair] = useState('SOL/USDC')
  const [chartInterval, setChartInterval] = useState('1h')

  // Connect to WebSocket for real-time updates
  useEffect(() => {
    wsClient.connect()
    wsClient.subscribe(`orderbook:${selectedPair}`)
    wsClient.subscribe(`trades:${selectedPair}`)

    return () => {
      wsClient.unsubscribe(`orderbook:${selectedPair}`)
      wsClient.unsubscribe(`trades:${selectedPair}`)
      wsClient.disconnect()
    }
  }, [selectedPair])

  const intervals = ['1m', '5m', '15m', '1h', '4h', '1d']

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <TradingPairSelector 
            selectedPair={selectedPair} 
            onPairChange={setSelectedPair} 
          />
          <div className="flex items-center space-x-2 text-2xl font-bold text-white">
            <TrendingUp className="h-6 w-6 text-green-400" />
            <span>$150.25</span>
            <span className="text-green-400 text-sm">+2.5%</span>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {intervals.map((interval) => (
            <button
              key={interval}
              onClick={() => setChartInterval(interval)}
              className={`px-3 py-1 rounded text-sm ${
                chartInterval === interval
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {interval}
            </button>
          ))}
        </div>
      </div>

      {/* Trading interface */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Chart section */}
        <div className="lg:col-span-3">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-white font-medium">Price Chart</h2>
              <button className="text-gray-400 hover:text-white">
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
            <PriceChart tradingPair={selectedPair} interval={chartInterval} />
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          <OrderForm tradingPair={selectedPair} />
          <OrderBook tradingPair={selectedPair} />
        </div>
      </div>

      {/* Bottom section - Recent trades and open orders */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent trades */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-white font-medium mb-4">Recent Trades</h3>
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-4 text-xs text-gray-400 font-medium">
              <div>Price</div>
              <div className="text-right">Amount</div>
              <div className="text-right">Time</div>
            </div>
            {/* Sample trade data */}
            {[...Array(5)].map((_, i) => (
              <div key={i} className="grid grid-cols-3 gap-4 text-xs">
                <div className="text-green-400 font-mono">150.25</div>
                <div className="text-right text-gray-300 font-mono">0.5</div>
                <div className="text-right text-gray-400">12:34:56</div>
              </div>
            ))}
          </div>
        </div>

        {/* Open orders */}
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="text-white font-medium mb-4">Open Orders</h3>
          <div className="space-y-2">
            <div className="grid grid-cols-5 gap-2 text-xs text-gray-400 font-medium">
              <div>Type</div>
              <div>Side</div>
              <div>Amount</div>
              <div>Price</div>
              <div>Action</div>
            </div>
            <div className="text-center text-gray-400 text-sm py-8">
              No open orders
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}