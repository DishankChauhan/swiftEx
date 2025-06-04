#!/usr/bin/env bun

const BASE_URL = 'http://localhost:3001'
const WS_URL = 'ws://localhost:3001/ws'

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

async function testUserRegistration() {
  console.log('\n🔐 Testing User Registration...')
  
  for (const [index, user] of testUsers.entries()) {
    const { response, data } = await makeRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(user)
    })
    
    // User might already exist, which is fine for testing
    const passed = response.ok && data.success || (data.error && data.error.includes('already exists'))
    logTest(
      `Register User ${index + 1} (${user.email})`,
      passed,
      data.error || ''
    )
  }
}

async function testUserLogin() {
  console.log('\n🔑 Testing User Login...')
  
  for (const [index, user] of testUsers.entries()) {
    const { response, data } = await makeRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify(user)
    })
    
    const passed = response.ok && data.success && data.data?.accessToken
    logTest(
      `Login User ${index + 1} (${user.email})`,
      passed,
      data.error || ''
    )
    
    if (passed) {
      tokens[user.email] = data.data.accessToken
      userIds[user.email] = data.data.user.id
    }
  }
}

async function testHealthCheck() {
  console.log('\n🏥 Testing Health Check...')
  
  const { response, data } = await makeRequest('/health')
  
  logTest(
    'Health Check - Phase 4',
    response.ok && data.version === '4.0.0' && data.status === 'healthy',
    data.error || ''
  )
}

async function testSystemInitialization() {
  console.log('\n⚙️ Testing System Initialization...')
  
  const userEmail = testUsers[0].email
  const token = tokens[userEmail]
  
  if (!token) {
    logTest('System Init - Missing Token', false, 'No auth token available')
    return
  }
  
  // Initialize system assets
  const { response, data } = await makeRequest('/ledger/init', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  })
  
  logTest(
    'Initialize System Assets',
    response.ok && data.success,
    data.error || ''
  )
  
  // Wait for system initialization to complete
  await sleep(2000)
}

async function testAddBalances() {
  console.log('\n💰 Testing Balance Addition...')
  
  for (const [index, user] of testUsers.entries()) {
    const token = tokens[user.email]
    const userId = userIds[user.email]
    
    console.log(`User ${index + 1} token length:`, token?.length || 'MISSING')
    console.log(`User ${index + 1} userId:`, userId || 'MISSING')
    
    if (!token || !userId) continue
    
    // Add USDC for trading
    const usdcRequest = {
      userId: userId,
      asset: 'USDC',
      amount: '10000',
      operation: 'add',
      description: `Initial USDC balance for user ${index + 1}`
    }
    
    console.log(`Sending USDC request for user ${index + 1}:`, JSON.stringify(usdcRequest))
    
    const { response: usdcResp, data: usdcData } = await makeRequest('/ledger/balance/operation', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(usdcRequest)
    })
    
    logTest(
      `Add USDC Balance - User ${index + 1}`,
      usdcResp.ok && usdcData.success,
      usdcData.error || usdcData.rawText || JSON.stringify(usdcData)
    )
    
    // Wait between operations
    await sleep(1500)
    
    // Add SOL for trading
    const { response: solResp, data: solData } = await makeRequest('/ledger/balance/operation', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        userId: userId,
        asset: 'SOL',
        amount: '100',
        operation: 'add',
        description: `Initial SOL balance for user ${index + 1}`
      })
    })
    
    logTest(
      `Add SOL Balance - User ${index + 1}`,
      solResp.ok && solData.success,
      solData.error || solData.rawText || JSON.stringify(solData)
    )
    
    // Wait between users
    await sleep(1500)
  }
  
  // Wait for all balance operations to settle
  await sleep(3000)
}

async function testOrderBookEndpoints() {
  console.log('\n📊 Testing Order Book Endpoints...')
  
  // Test order book snapshot
  const { response: obResp, data: obData } = await makeRequest('/orderbook/SOLUSDC')
  logTest(
    'Get Order Book Snapshot',
    obResp.ok && obData.success && obData.data.tradingPair === 'SOL/USDC',
    obData.error || ''
  )
  
  await sleep(300)
  
  // Test ticker data
  const { response: tickerResp, data: tickerData } = await makeRequest('/orderbook/SOLUSDC/ticker')
  logTest(
    'Get Ticker Data',
    tickerResp.ok && tickerData.success && tickerData.data.tradingPair === 'SOL/USDC',
    tickerData.error || ''
  )
  
  await sleep(300)
  
  // Test order book stats
  const { response: statsResp, data: statsData } = await makeRequest('/orderbook/SOLUSDC/stats')
  logTest(
    'Get Order Book Stats',
    statsResp.ok && statsData.success && typeof statsData.data.bidCount === 'number',
    statsData.error || ''
  )
  
  await sleep(300)
  
  // Test matching config
  const { response: configResp, data: configData } = await makeRequest('/orderbook/SOLUSDC/config')
  logTest(
    'Get Matching Config',
    configResp.ok && configData.success && configData.data.tradingPair === 'SOL/USDC',
    configData.error || ''
  )
  
  await sleep(500)
}

async function testOrderPlacement() {
  console.log('\n📋 Testing Order Placement via Matching Engine...')
  
  const aliceToken = tokens[testUsers[0].email]
  const bobToken = tokens[testUsers[1].email]
  
  if (!aliceToken || !bobToken) {
    logTest('Order Placement - Missing Tokens', false, 'Missing auth tokens')
    return
  }
  
  // Alice places a buy order (bid)
  const { response: aliceResp, data: aliceData } = await makeRequest('/orderbook/order', {
    method: 'POST',
    headers: { Authorization: `Bearer ${aliceToken}` },
    body: JSON.stringify({
      tradingPair: 'SOL/USDC',
      side: 'buy',
      type: 'limit',
      amount: '10',
      price: '95'
    })
  })
  
  logTest(
    'Alice Buy Order (Bid)',
    aliceResp.ok && aliceData.success,
    aliceData.error || ''
  )
  
  // Wait between orders
  await sleep(2000)
  
  // Bob places a sell order (ask)
  const { response: bobResp, data: bobData } = await makeRequest('/orderbook/order', {
    method: 'POST',
    headers: { Authorization: `Bearer ${bobToken}` },
    body: JSON.stringify({
      tradingPair: 'SOL/USDC',
      side: 'sell',
      type: 'limit',
      amount: '5',
      price: '105'
    })
  })
  
  logTest(
    'Bob Sell Order (Ask)',
    bobResp.ok && bobData.success,
    bobData.error || ''
  )
  
  // Wait for orders to be processed
  await sleep(2000)
  
  // Check order book after placing orders
  const { response: obResp, data: obData } = await makeRequest('/orderbook/SOLUSDC')
  logTest(
    'Order Book After Placement',
    obResp.ok && obData.success && (obData.data.bids.length > 0 || obData.data.asks.length > 0),
    obData.error || ''
  )
  
  await sleep(500)
}

async function testOrderMatching() {
  console.log('\n🔄 Testing Order Matching...')
  
  const aliceToken = tokens[testUsers[0].email]
  const bobToken = tokens[testUsers[1].email]
  
  if (!aliceToken || !bobToken) {
    logTest('Order Matching - Missing Tokens', false, 'Missing auth tokens')
    return
  }
  
  // Alice places a buy order at higher price to match Bob's sell
  const { response: matchResp, data: matchData } = await makeRequest('/orderbook/order', {
    method: 'POST',
    headers: { Authorization: `Bearer ${aliceToken}` },
    body: JSON.stringify({
      tradingPair: 'SOL/USDC',
      side: 'buy',
      type: 'limit',
      amount: '3',
      price: '110' // Higher than Bob's ask price of 105
    })
  })
  
  logTest(
    'Order Matching Execution',
    matchResp.ok && matchData.success && matchData.data.matches?.length > 0,
    matchData.error || `Matches: ${matchData.data?.matches?.length || 0}`
  )
  
  if (matchData.success && matchData.data.matches?.length > 0) {
    logTest(
      'Order Partially/Fully Filled',
      matchData.data.status === 'filled' || matchData.data.status === 'partial',
      `Status: ${matchData.data.status}, Filled: ${matchData.data.filled}`
    )
  }
  
  // Wait for matching to complete
  await sleep(1500)
}

async function testWebSocketConnection() {
  console.log('\n🔌 Testing WebSocket Connection...')
  
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(WS_URL)
      let connected = false
      let subscribed = false
      
      const timeout = setTimeout(() => {
        if (!connected) {
          logTest('WebSocket Connection', false, 'Connection timeout')
        }
        ws.close()
        resolve()
      }, 5000)
      
      ws.onopen = () => {
        connected = true
        logTest('WebSocket Connection', true)
        
        // Test subscription
        ws.send(JSON.stringify({
          type: 'subscribe',
          data: {
            channels: ['orderbook@SOL/USDC', 'ticker@SOL/USDC']
          }
        }))
      }
      
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data)
          if (message.type === 'subscribe' && message.data?.status === 'subscribed') {
            subscribed = true
            logTest('WebSocket Subscription', true)
          } else if (message.type === 'orderbook') {
            logTest('WebSocket Order Book Data', true)
          }
        } catch (error) {
          logTest('WebSocket Message Parse', false, error.message)
        }
      }
      
      ws.onerror = (error) => {
        logTest('WebSocket Connection', false, 'Connection error')
        clearTimeout(timeout)
        resolve()
      }
      
      ws.onclose = () => {
        clearTimeout(timeout)
        resolve()
      }
      
      // Close connection after tests
      setTimeout(() => {
        ws.close()
      }, 3000)
    } catch (error) {
      logTest('WebSocket Connection', false, error.message)
      resolve()
    }
  })
}

async function testOrderCancellation() {
  console.log('\n❌ Testing Order Cancellation...')
  
  const aliceToken = tokens[testUsers[0].email]
  
  if (!aliceToken) {
    logTest('Order Cancellation - Missing Token', false, 'No auth token')
    return
  }
  
  // First, place an order to cancel
  const { response: orderResp, data: orderData } = await makeRequest('/orderbook/order', {
    method: 'POST',
    headers: { Authorization: `Bearer ${aliceToken}` },
    body: JSON.stringify({
      tradingPair: 'SOL/USDC',
      side: 'buy',
      type: 'limit',
      amount: '2',
      price: '90'
    })
  })
  
  if (orderResp.ok && orderData.success) {
    const orderId = orderData.data.orderId
    
    // Wait for order to be placed
    await sleep(1000)
    
    // Now cancel the order
    const { response: cancelResp, data: cancelData } = await makeRequest(`/orderbook/order/${orderId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${aliceToken}` }
    })
    
    logTest(
      'Order Cancellation',
      cancelResp.ok && cancelData.success,
      cancelData.error || ''
    )
  } else {
    logTest('Order Cancellation - Setup Failed', false, 'Could not create order to cancel')
  }
  
  await sleep(500)
}

async function testWebSocketStats() {
  console.log('\n📊 Testing WebSocket Statistics...')
  
  const { response, data } = await makeRequest('/ws/stats')
  
  logTest(
    'WebSocket Statistics',
    response.ok && data.success && typeof data.data.totalConnections === 'number',
    data.error || ''
  )
}

// Main test execution
async function runTests() {
  console.log('🧪 Phase 4: Matching Engine + Order Book Tests Starting...')
  console.log('=' .repeat(60))
  
  try {
    await testHealthCheck()
    await sleep(1000)
    
    await testUserRegistration()
    await sleep(1000)
    
    await testUserLogin()
    await sleep(1000)
    
    await testSystemInitialization()
    await sleep(3000) // Extra wait after system init
    
    await testAddBalances()
    await sleep(3000) // Extra wait after balance operations
    
    await testOrderBookEndpoints()
    await sleep(1000)
    
    await testOrderPlacement()
    await sleep(2000) // Extra wait for order processing
    
    await testOrderMatching()
    await sleep(2000) // Extra wait for matching
    
    await testOrderCancellation()
    await sleep(1000)
    
    await testWebSocketConnection()
    await sleep(1000)
    
    await testWebSocketStats()
    
    // Final summary
    console.log('\n' + '='.repeat(60))
    console.log('🎯 Phase 4 Test Results:')
    console.log(`✅ Passed: ${testResults.passed}`)
    console.log(`❌ Failed: ${testResults.failed}`)
    console.log(`📊 Total: ${testResults.total}`)
    
    if (testResults.failed === 0) {
      console.log('\n🎉 All Phase 4 tests passed! Matching Engine is working perfectly!')
      console.log('🚀 Ready for Phase 5: Advanced Market Data & Analytics')
    } else {
      console.log(`\n⚠️  ${testResults.failed} test(s) failed. Please check the issues above.`)
    }
    
  } catch (error) {
    console.error('Test execution failed:', error)
  }
}

// Add a longer delay to ensure server is ready
setTimeout(runTests, 2000) 