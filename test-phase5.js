#!/usr/bin/env bun

const BASE_URL = 'http://localhost:3001'

// Test user credentials
const testUsers = [
  { email: 'alice@test.com', password: 'password123' },
  { email: 'bob@test.com', password: 'password123' }
]

let tokens = {}
let userIds = {}

// Test results tracking
let testResults = {
  passed: 0,
  failed: 0,
  total: 0
}

// Helper function to add delays
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function logTest(name, passed, details = '') {
  testResults.total++
  if (passed) {
    testResults.passed++
    console.log(`✅ ${name}`)
    if (details) {
      console.log(`   ${details}`)
    }
  } else {
    testResults.failed++
    console.log(`❌ ${name} - ${details}`)
  }
}

async function makeRequest(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options
  })
  
  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch (error) {
    data = { error: `JSON parse error: ${error.message}`, rawText: text, status: response.status }
  }
  return { response, data }
}

async function testHealthCheck() {
  console.log('\n🏥 Testing Phase 5 Health Check...')
  
  const { response, data } = await makeRequest('/health')
  
  logTest(
    'Health Check - Phase 5',
    response.ok && data.version === '5.0.0' && data.features?.includes('Advanced Market Data & Analytics'),
    `Version: ${data.version}, Features: ${data.features?.length || 0}`
  )
}

async function testUserSetup() {
  console.log('\n🔐 Setting Up Test Users...')
  
  // Register and login users
  for (const [index, user] of testUsers.entries()) {
    // Register (may already exist)
    await makeRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(user)
    })
    
    // Login
    const { response, data } = await makeRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify(user)
    })
    
    const passed = response.ok && data.success && data.data?.accessToken
    logTest(
      `Setup User ${index + 1} (${user.email})`,
      passed,
      passed ? 'Login successful' : data.error || ''
    )
    
    if (passed) {
      tokens[user.email] = data.data.accessToken
      userIds[user.email] = data.data.user.id
    }
  }
}

async function testAnalyticsConfiguration() {
  console.log('\n⚙️ Testing Analytics Configuration...')
  
  // Test analytics config endpoint
  const { response, data } = await makeRequest('/analytics/config')
  
  logTest(
    'Analytics Configuration',
    response.ok && data.success && data.data.version === '5.0.0',
    data.success ? `Features: ${Object.keys(data.data.features).length}` : data.error
  )
  
  // Test analytics health endpoint
  const { response: healthResp, data: healthData } = await makeRequest('/analytics/health')
  
  logTest(
    'Analytics Health Check',
    healthResp.ok && healthData.success && healthData.data.status === 'healthy',
    healthData.success ? `Status: ${healthData.data.status}` : healthData.error
  )
}

async function testTradingPairsList() {
  console.log('\n📊 Testing Trading Pairs List...')
  
  const { response, data } = await makeRequest('/analytics/pairs')
  
  logTest(
    'Trading Pairs List',
    response.ok && data.success && Array.isArray(data.data.pairs),
    data.success ? `Found ${data.data.count} pairs` : data.error
  )
  
  if (data.success && data.data.pairs.length > 0) {
    const pair = data.data.pairs[0]
    logTest(
      'Trading Pair Structure',
      pair.symbol && pair.baseAsset && pair.quoteAsset,
      `Sample: ${pair.symbol} (${pair.baseAsset}/${pair.quoteAsset})`
    )
  }
}

async function testHistoricalData() {
  console.log('\n📈 Testing Historical Market Data...')
  
  // Test candle data
  const candleParams = new URLSearchParams({
    tradingPair: 'SOL/USDC',
    interval: '1h',
    limit: '10'
  })
  
  const { response, data } = await makeRequest(`/analytics/candles?${candleParams}`)
  
  logTest(
    'OHLCV Candle Data',
    response.ok && data.success && Array.isArray(data.data.candles),
    data.success ? `Generated ${data.data.count} candles for ${data.data.interval}` : data.error
  )
  
  if (data.success && data.data.candles.length > 0) {
    const candle = data.data.candles[0]
    logTest(
      'Candle Data Structure',
      candle.timestamp && candle.open && candle.high && candle.low && candle.close,
      `OHLC: ${candle.open}/${candle.high}/${candle.low}/${candle.close}`
    )
  }
  
  await sleep(500)
}

async function testTechnicalIndicators() {
  console.log('\n📊 Testing Technical Indicators...')
  
  // Test technical indicators
  const indicatorParams = new URLSearchParams({
    tradingPair: 'SOL/USDC',
    interval: '1h',
    indicators: 'sma_20,rsi,macd',
    limit: '50'
  })
  
  const { response, data } = await makeRequest(`/analytics/indicators?${indicatorParams}`)
  
  logTest(
    'Technical Indicators',
    response.ok && data.success && Array.isArray(data.data.indicators),
    data.success ? `Calculated ${data.data.count} indicator points` : data.error
  )
  
  if (data.success && data.data.indicators.length > 0) {
    const indicator = data.data.indicators[data.data.indicators.length - 1] // Get latest
    const hasIndicators = indicator.sma_20 || indicator.rsi || indicator.macd
    logTest(
      'Indicator Values Present',
      hasIndicators,
      `SMA20: ${indicator.sma_20 || 'N/A'}, RSI: ${indicator.rsi || 'N/A'}`
    )
  }
  
  await sleep(500)
}

async function testMarketDepthAnalytics() {
  console.log('\n🔍 Testing Market Depth Analytics...')
  
  // Test market depth analysis
  const { response, data } = await makeRequest('/analytics/depth?tradingPair=SOL/USDC&limit=10')
  
  logTest(
    'Market Depth Analysis',
    response.ok && data.success && data.data.tradingPair === 'SOL/USDC',
    data.success ? `Analyzed ${data.data.bidDepth.levels + data.data.askDepth.levels} levels` : data.error
  )
  
  if (data.success) {
    const hasSpread = data.data.spread && data.data.spread.absolute && data.data.spread.percentage
    logTest(
      'Spread Calculation',
      hasSpread,
      `Spread: ${data.data.spread?.absolute || 'N/A'} (${data.data.spread?.percentage || 'N/A'}%)`
    )
    
    const hasImbalance = data.data.imbalance && data.data.imbalance.ratio
    logTest(
      'Order Book Imbalance',
      hasImbalance,
      `Bid/Ask Ratio: ${data.data.imbalance?.ratio || 'N/A'}`
    )
  }
  
  await sleep(500)
}

async function testLiquidityMetrics() {
  console.log('\n💧 Testing Liquidity Metrics...')
  
  // Test liquidity metrics
  const { response, data } = await makeRequest('/analytics/liquidity?tradingPair=SOL/USDC&period=1d')
  
  logTest(
    'Liquidity Metrics',
    response.ok && data.success && data.data.tradingPair === 'SOL/USDC',
    data.success ? `Volume 24h: ${data.data.volume24h}, Score: ${data.data.liquidityScore}` : data.error
  )
  
  if (data.success) {
    const hasMetrics = data.data.volume24h && data.data.liquidityScore !== undefined
    logTest(
      'Liquidity Data Completeness',
      hasMetrics,
      `Price: ${data.data.price}, Change: ${data.data.priceChangePercentage24h}%`
    )
    
    const hasDepthMetrics = data.data.marketDepth1Percent && data.data.marketDepth5Percent
    logTest(
      'Market Depth Metrics',
      hasDepthMetrics,
      `Depth 1%: ${data.data.marketDepth1Percent}, 5%: ${data.data.marketDepth5Percent}`
    )
  }
  
  await sleep(500)
}

async function testPerformanceAnalytics() {
  console.log('\n🚀 Testing Performance Analytics...')
  
  // Test performance analytics
  const { response, data } = await makeRequest('/analytics/performance?tradingPair=SOL/USDC&period=1d')
  
  logTest(
    'Performance Analytics',
    response.ok && data.success && data.data.tradingPair === 'SOL/USDC',
    data.success ? `Returns 24h: ${data.data.returns24h}%` : data.error
  )
  
  if (data.success) {
    const hasReturns = data.data.returns1h && data.data.returns24h && data.data.returns7d
    logTest(
      'Returns Calculation',
      hasReturns,
      `1h: ${data.data.returns1h}%, 24h: ${data.data.returns24h}%, 7d: ${data.data.returns7d}%`
    )
    
    const hasVolatility = data.data.volatility1h && data.data.volatility24h
    logTest(
      'Volatility Metrics',
      hasVolatility,
      `1h: ${data.data.volatility1h}%, 24h: ${data.data.volatility24h}%`
    )
    
    const hasEfficiency = data.data.efficiency !== undefined && data.data.vwap24h
    logTest(
      'Market Efficiency',
      hasEfficiency,
      `Efficiency: ${data.data.efficiency}, VWAP: ${data.data.vwap24h}`
    )
  }
  
  await sleep(500)
}

async function testRiskAnalytics() {
  console.log('\n⚠️ Testing Risk Analytics...')
  
  // Test risk analytics
  const { response, data } = await makeRequest('/analytics/risk?tradingPair=SOL/USDC')
  
  logTest(
    'Risk Analytics',
    response.ok && data.success && data.data.tradingPair === 'SOL/USDC',
    data.success ? `VaR 95%: ${data.data.var_95}` : data.error
  )
  
  if (data.success) {
    const hasVaR = data.data.var_95 && data.data.var_99
    logTest(
      'Value at Risk (VaR)',
      hasVaR,
      `95% VaR: ${data.data.var_95}, 99% VaR: ${data.data.var_99}`
    )
    
    const hasVolatility = data.data.historicalVolatility
    logTest(
      'Historical Volatility',
      hasVolatility,
      `Historical Vol: ${data.data.historicalVolatility}`
    )
    
    const hasDrawdown = data.data.maxDrawdown7d && data.data.maxDrawdown30d
    logTest(
      'Drawdown Metrics',
      hasDrawdown,
      `7d: ${data.data.maxDrawdown7d}, 30d: ${data.data.maxDrawdown30d}`
    )
    
    const hasRiskScores = data.data.liquidityRisk !== undefined && data.data.concentrationRisk !== undefined
    logTest(
      'Risk Scores',
      hasRiskScores,
      `Liquidity Risk: ${data.data.liquidityRisk}, Concentration Risk: ${data.data.concentrationRisk}`
    )
  }
  
  await sleep(500)
}

async function testMarketSummary() {
  console.log('\n🌍 Testing Market Summary...')
  
  // Test market summary
  const { response, data } = await makeRequest('/analytics/market/summary')
  
  logTest(
    'Market Summary',
    response.ok && data.success && data.data.totalPairs !== undefined,
    data.success ? `${data.data.totalPairs} pairs, Health: ${data.data.marketHealthScore}` : data.error
  )
  
  if (data.success) {
    const hasTopPerformers = Array.isArray(data.data.topGainers) && Array.isArray(data.data.topLosers)
    logTest(
      'Top Performers',
      hasTopPerformers,
      `Gainers: ${data.data.topGainers?.length || 0}, Losers: ${data.data.topLosers?.length || 0}`
    )
    
    const hasVolumeData = data.data.totalVolume24h && Array.isArray(data.data.topVolume)
    logTest(
      'Volume Analytics',
      hasVolumeData,
      `Total 24h: ${data.data.totalVolume24h}, Top Volume Pairs: ${data.data.topVolume?.length || 0}`
    )
    
    const hasHealthMetrics = data.data.marketHealthScore !== undefined && data.data.averageSpread
    logTest(
      'Market Health',
      hasHealthMetrics,
      `Health Score: ${data.data.marketHealthScore}, Avg Spread: ${data.data.averageSpread}%`
    )
  }
  
  await sleep(500)
}

async function testMultiPairAnalytics() {
  console.log('\n🔀 Testing Multi-Pair Analytics...')
  
  // Test multi-pair analytics
  const { response, data } = await makeRequest('/analytics/multi-pair', {
    method: 'POST',
    body: JSON.stringify({
      pairs: ['SOL/USDC', 'ETH/USDC'],
      metrics: ['liquidity', 'performance'],
      period: '1d'
    })
  })
  
  logTest(
    'Multi-Pair Analytics',
    response.ok && data.success && data.data.results,
    data.success ? `Analyzed ${data.data.pairs} pairs with ${data.data.metrics.length} metrics` : data.error
  )
  
  if (data.success && data.data.results) {
    const results = data.data.results
    const hasSOL = results['SOL/USDC'] && results['SOL/USDC'].liquidity
    const hasETH = results['ETH/USDC'] && results['ETH/USDC'].liquidity
    
    logTest(
      'Multi-Pair Results',
      hasSOL && hasETH,
      `SOL/USDC: ${hasSOL ? 'OK' : 'Missing'}, ETH/USDC: ${hasETH ? 'OK' : 'Missing'}`
    )
  }
  
  await sleep(500)
}

async function testAnalyticsCache() {
  console.log('\n🗄️ Testing Analytics Cache Management...')
  
  const userToken = tokens[testUsers[0].email]
  
  if (!userToken) {
    logTest('Cache Management - Missing Token', false, 'No auth token available')
    return
  }
  
  // Test cache clearing (admin endpoint)
  const { response, data } = await makeRequest('/analytics/cache', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${userToken}` }
  })
  
  logTest(
    'Analytics Cache Clear',
    response.ok && data.success,
    data.success ? `Cleared ${data.data.clearedKeys} cache keys` : data.error
  )
  
  await sleep(500)
}

async function testAnalyticsErrorHandling() {
  console.log('\n🚨 Testing Analytics Error Handling...')
  
  // Test with invalid trading pair
  const { response, data } = await makeRequest('/analytics/liquidity/INVALID/PAIR')
  
  logTest(
    'Invalid Trading Pair Handling',
    response.status >= 400 || (data.success === false),
    data.error || 'Handled gracefully'
  )
  
  // Test with invalid interval
  const { response: resp2, data: data2 } = await makeRequest('/analytics/candles?tradingPair=SOL/USDC&interval=invalid&limit=10')
  
  logTest(
    'Invalid Interval Handling',
    resp2.status >= 400 || (data2.success === false),
    data2.error || 'Handled gracefully'
  )
  
  await sleep(500)
}

// Main test execution
async function runTests() {
  console.log('🧪 Phase 5: Advanced Market Data & Analytics Tests Starting...')
  console.log('=' .repeat(70))
  
  try {
    await testHealthCheck()
    await sleep(1000)
    
    await testUserSetup()
    await sleep(1000)
    
    await testAnalyticsConfiguration()
    await sleep(1000)
    
    await testTradingPairsList()
    await sleep(1000)
    
    await testHistoricalData()
    await sleep(1000)
    
    await testTechnicalIndicators()
    await sleep(1000)
    
    await testMarketDepthAnalytics()
    await sleep(1000)
    
    await testLiquidityMetrics()
    await sleep(1000)
    
    await testPerformanceAnalytics()
    await sleep(1000)
    
    await testRiskAnalytics()
    await sleep(1000)
    
    await testMarketSummary()
    await sleep(1000)
    
    await testMultiPairAnalytics()
    await sleep(1000)
    
    await testAnalyticsCache()
    await sleep(1000)
    
    await testAnalyticsErrorHandling()
    
    // Final summary
    console.log('\n' + '='.repeat(70))
    console.log('🎯 Phase 5 Test Results:')
    console.log(`✅ Passed: ${testResults.passed}`)
    console.log(`❌ Failed: ${testResults.failed}`)
    console.log(`📊 Total: ${testResults.total}`)
    console.log(`📈 Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`)
    
    if (testResults.failed === 0) {
      console.log('\n🎉 All Phase 5 tests passed! Advanced Market Data & Analytics is working perfectly!')
      console.log('📊 Features Available:')
      console.log('   • 📈 OHLCV Historical Data & Candles')
      console.log('   • 🔍 Technical Indicators (SMA, EMA, RSI, MACD, Bollinger Bands)')
      console.log('   • 💧 Market Depth & Liquidity Analytics')
      console.log('   • 🚀 Performance Metrics & Returns Analysis')
      console.log('   • ⚠️ Risk Analytics & VaR Calculations')
      console.log('   • 🌍 Market Summary & Multi-Pair Analysis')
      console.log('   • ⚡ Real-time Market Data Processing')
      console.log('\n🚀 Ready for Phase 6: Advanced Order Types & Risk Management')
    } else {
      console.log(`\n⚠️  ${testResults.failed} test(s) failed. Please check the issues above.`)
      console.log('📋 Failed tests may indicate:')
      console.log('   • Missing market data for calculations')
      console.log('   • Redis connectivity issues')
      console.log('   • Database synchronization problems')
      console.log('   • Analytics service configuration errors')
    }
    
  } catch (error) {
    console.error('Test execution failed:', error)
  }
}

// Add a longer delay to ensure server is ready
setTimeout(runTests, 2000) 