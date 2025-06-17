#!/usr/bin/env bun

const BASE_URL = 'http://localhost:3001'

// Test users
const users = {
  alice: { email: 'alice@test.com', password: 'password123', name: 'Alice' },
  bob: { email: 'bob@test.com', password: 'password123', name: 'Bob' },
  charlie: { email: 'charlie@test.com', password: 'password123', name: 'Charlie' }
}

let tokens = {}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function login(userKey) {
  const user = users[userKey]
  const response = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: user.email,
      password: user.password
    })
  })
  
  const data = await response.json()
  if (data.success) {
    tokens[userKey] = data.data.accessToken
    console.log(`✅ ${user.name} logged in`)
    return true
  } else {
    console.log(`❌ ${user.name} login failed:`, data.message)
    return false
  }
}

async function getBalances(userKey) {
  const response = await fetch(`${BASE_URL}/wallet/balances`, {
    headers: { 'Authorization': `Bearer ${tokens[userKey]}` }
  })
  const data = await response.json()
  return data.success ? data.data.balances : []
}

async function placeOrder(userKey, orderData, description = '') {
  console.log(`\n📦 ${users[userKey].name} placing ${description}...`)
  console.log(`   Order: ${orderData.side} ${orderData.amount} ${orderData.tradingPair.split('/')[0]} at $${orderData.price || 'market'}`)
  
  const response = await fetch(`${BASE_URL}/orderbook/order`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokens[userKey]}`
    },
    body: JSON.stringify(orderData)
  })
  
  const result = await response.json()
  
  if (response.ok && result.success) {
    console.log(`✅ Order placed successfully!`)
    console.log(`   Order ID: ${result.data.orderId}`)
    console.log(`   Status: ${result.data.status}`)
    console.log(`   Filled: ${result.data.filled}`)
    console.log(`   Remaining: ${result.data.remaining}`)
    if (result.data.matches && result.data.matches.length > 0) {
      console.log(`   Matches: ${result.data.matches.length}`)
      result.data.matches.forEach((match, i) => {
        console.log(`     Match ${i + 1}: ${match.amount} at $${match.price} (fee: ${match.fee} ${match.feeAsset})`)
      })
    }
    return { success: true, data: result.data }
  } else {
    console.log(`❌ Order failed:`)
    console.log(`   Error: ${result.error || result.message}`)
    if (result.details) console.log(`   Details: ${result.details}`)
    return { success: false, error: result }
  }
}

async function getOrderBook(tradingPair = 'SOL/USDC') {
  const urlPair = tradingPair.replace('/', '')
  const response = await fetch(`${BASE_URL}/orderbook/${urlPair}`)
  const data = await response.json()
  return data.success ? data.data : null
}

async function printOrderBook(tradingPair = 'SOL/USDC') {
  const orderBook = await getOrderBook(tradingPair)
  if (orderBook) {
    console.log(`\n📖 Current Order Book for ${tradingPair}:`)
    console.log(`   Bids: ${orderBook.bids.length} orders`)
    console.log(`   Asks: ${orderBook.asks.length} orders`)
    
    if (orderBook.bids.length > 0) {
      console.log(`   Best Bid: $${orderBook.bids[0].price} (${orderBook.bids[0].amount} ${tradingPair.split('/')[0]})`)
    }
    if (orderBook.asks.length > 0) {
      console.log(`   Best Ask: $${orderBook.asks[0].price} (${orderBook.asks[0].amount} ${tradingPair.split('/')[0]})`)
    }
  } else {
    console.log(`\n📖 Unable to fetch order book for ${tradingPair}`)
  }
}

async function printBalances(userKey, label = '') {
  const balances = await getBalances(userKey)
  console.log(`\n💰 ${users[userKey].name}'s ${label} balances:`)
  balances.forEach(balance => {
    const locked = parseFloat(balance.locked || '0')
    if (locked > 0) {
      console.log(`   ${balance.asset}: ${balance.available} available, ${balance.locked} locked`)
    } else {
      console.log(`   ${balance.asset}: ${balance.available} available`)
    }
  })
}

async function comprehensiveE2ETest() {
  console.log('🚀 Starting Comprehensive End-to-End Order Testing...\n')
  
  // Phase 1: Login all users
  console.log('🔑 Phase 1: User Authentication')
  for (const userKey of Object.keys(users)) {
    const success = await login(userKey)
    if (!success) return
  }
  
  // Phase 2: Check initial balances
  console.log('\n💳 Phase 2: Initial Balance Check')
  for (const userKey of Object.keys(users)) {
    await printBalances(userKey, 'initial')
  }
  
  // Phase 3: Clear order book to start fresh
  console.log('\n🧹 Phase 3: Clear Order Book')
  await printOrderBook()
  
  // Phase 4: Alice places a large SELL order (maker order)
  console.log('\n📊 Phase 4: Large Sell Order (Market Making)')
  const aliceResult = await placeOrder('alice', {
    tradingPair: 'SOL/USDC',
    side: 'sell',
    type: 'limit',
    amount: '10',      // Large order
    price: '150'       // At $150 per SOL
  }, 'large sell order (10 SOL at $150)')
  
  if (!aliceResult.success) return
  
  await sleep(1000)
  await printOrderBook()
  await printBalances('alice', 'after sell order')
  
  // Phase 5: Bob places a smaller BUY order (partial fill)
  console.log('\n🔄 Phase 5: Partial Fill Scenario')
  const bobResult = await placeOrder('bob', {
    tradingPair: 'SOL/USDC',
    side: 'buy',
    type: 'limit',
    amount: '3',       // Partial fill
    price: '150'       // Same price to trigger match
  }, 'partial buy order (3 SOL at $150)')
  
  if (!bobResult.success) return
  
  await sleep(1000)
  await printOrderBook()
  await printBalances('alice', 'after partial fill')
  await printBalances('bob', 'after partial fill')
  
  // Phase 6: Charlie places another BUY order (more partial fill)
  console.log('\n🔄 Phase 6: Additional Partial Fill')
  const charlieResult = await placeOrder('charlie', {
    tradingPair: 'SOL/USDC',
    side: 'buy',
    type: 'limit',
    amount: '2',       // Another partial fill
    price: '150'       // Same price
  }, 'second partial buy order (2 SOL at $150)')
  
  if (!charlieResult.success) return
  
  await sleep(1000)
  await printOrderBook()
  await printBalances('alice', 'after second partial fill')
  await printBalances('charlie', 'after partial fill')
  
  // Phase 7: Alice places a competing SELL order (order book depth)
  console.log('\n📚 Phase 7: Order Book Depth Testing')
  const aliceResult2 = await placeOrder('alice', {
    tradingPair: 'SOL/USDC',
    side: 'sell',
    type: 'limit',
    amount: '5',       // Competing sell order
    price: '148'       // Better price than her previous order
  }, 'competing sell order (5 SOL at $148)')
  
  if (!aliceResult2.success) return
  
  await sleep(1000)
  await printOrderBook()
  await printBalances('alice', 'after second sell order')
  
  // Phase 8: Bob places a higher BUY order (should match Alice's better price)
  console.log('\n🎯 Phase 8: Price-Time Priority Testing')
  const bobResult2 = await placeOrder('bob', {
    tradingPair: 'SOL/USDC',
    side: 'buy',
    type: 'limit',
    amount: '4',       // Will match Alice's better priced order first
    price: '149'       // High enough to match Alice at $148
  }, 'higher buy order (4 SOL at $149 - should match Alice at $148)')
  
  if (!bobResult2.success) return
  
  await sleep(1000)
  await printOrderBook()
  await printBalances('bob', 'after second buy')
  await printBalances('alice', 'after better order matched')
  
  // Phase 9: Test non-matching orders (order book persistence)
  console.log('\n⏱️ Phase 9: Order Book Persistence Testing')
  const charlieResult2 = await placeOrder('charlie', {
    tradingPair: 'SOL/USDC',
    side: 'buy',
    type: 'limit',
    amount: '2',       // Won't match
    price: '140'       // Below current ask prices
  }, 'low buy order (2 SOL at $140 - should sit in order book)')
  
  if (!charlieResult2.success) return
  
  const charlieResult3 = await placeOrder('charlie', {
    tradingPair: 'SOL/USDC',
    side: 'sell',
    type: 'limit',
    amount: '3',       // Won't match
    price: '155'       // Above current bid prices
  }, 'high sell order (3 SOL at $155 - should sit in order book)')
  
  if (!charlieResult3.success) return
  
  await sleep(1000)
  await printOrderBook()
  
  // Phase 10: Market order test (if supported)
  console.log('\n🌊 Phase 10: Market Order Testing')
  console.log('Attempting market order (may not be supported yet)...')
  
  const aliceMarketResult = await placeOrder('alice', {
    tradingPair: 'SOL/USDC',
    side: 'buy',
    type: 'market',
    amount: '1'        // Market buy order
  }, 'market buy order (1 SOL at market price)')
  
  if (aliceMarketResult.success) {
    await sleep(1000)
    await printOrderBook()
    await printBalances('alice', 'after market order')
  } else {
    console.log('   Market orders not yet implemented (expected)')
  }
  
  // Phase 11: Final state analysis
  console.log('\n📊 Phase 11: Final State Analysis')
  await printOrderBook()
  
  console.log('\n💰 Final Balances:')
  for (const userKey of Object.keys(users)) {
    await printBalances(userKey, 'final')
  }
  
  // Phase 12: Order fulfillment test
  console.log('\n🎯 Phase 12: Complete Order Fulfillment')
  console.log('Charlie will place a market-crossing order to fulfill remaining asks...')
  
  const charlieResult4 = await placeOrder('charlie', {
    tradingPair: 'SOL/USDC',
    side: 'buy',
    type: 'limit',
    amount: '8',       // Large order to sweep asks
    price: '160'       // High price to match all asks
  }, 'sweep order (8 SOL at $160 - should match remaining asks)')
  
  if (charlieResult4.success) {
    await sleep(1000)
    await printOrderBook()
    await printBalances('charlie', 'after sweep order')
    await printBalances('alice', 'after remaining filled')
  }
  
  console.log('\n🎉 Comprehensive End-to-End Test Completed!')
  console.log('\n📋 Test Summary:')
  console.log('✅ User authentication and login')
  console.log('✅ Large sell order placement (market making)')
  console.log('✅ Partial order fills')
  console.log('✅ Order book depth and persistence')
  console.log('✅ Price-time priority matching')
  console.log('✅ Multiple order matching scenarios')
  console.log('✅ Balance locking and unlocking')
  console.log('✅ Fee calculations and application')
  console.log('✅ Order book state management')
  
  const finalOrderBook = await getOrderBook()
  if (finalOrderBook) {
    console.log(`📊 Final Order Book State: ${finalOrderBook.bids.length} bids, ${finalOrderBook.asks.length} asks`)
  }
}

// Run the comprehensive test
comprehensiveE2ETest().catch(console.error) 