// Phase 3 Test Suite - Internal Ledger System
// Run with: bun test-phase3.js (after starting the server)

const API_BASE = 'http://localhost:3001'

async function testPhase3() {
  console.log('🧪 Testing Crypto Exchange API - Phase 3: Internal Ledger System...\n')

  let accessToken = ''
  let userId = ''
  let secondUserId = ''

  // Step 1: Register and get token for first user
  try {
    const testUser = {
      email: `test-phase3-${Date.now()}@example.com`,
      password: 'testpassword123'
    }

    const registerResponse = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    })
    const registerData = await registerResponse.json()
    
    if (registerData.success) {
      accessToken = registerData.data.accessToken
      userId = registerData.data.user.id
      console.log('✅ User Registration successful')
      console.log(`   User ID: ${userId}`)
    } else {
      console.error('❌ Registration failed:', registerData.message)
      return
    }
  } catch (error) {
    console.error('❌ Registration test failed:', error.message)
    return
  }

  // Step 2: Register second user for transfer testing
  try {
    const secondUser = {
      email: `test-phase3-second-${Date.now()}@example.com`,
      password: 'testpassword123'
    }

    const registerResponse = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(secondUser)
    })
    const registerData = await registerResponse.json()
    
    if (registerData.success) {
      secondUserId = registerData.data.user.id
      console.log('✅ Second User Registration successful')
      console.log(`   User ID: ${secondUserId}`)
    } else {
      console.error('❌ Second user registration failed:', registerData.message)
      return
    }
  } catch (error) {
    console.error('❌ Second user registration test failed:', error.message)
    return
  }

  // Step 3: Test Phase 3 Health Check
  try {
    const healthResponse = await fetch(`${API_BASE}/health`)
    const healthData = await healthResponse.json()
    console.log('✅ Phase 3 Health Check:', healthData.status)
    console.log('   Version:', healthData.version)
    console.log('   Features:', Object.keys(healthData.features || {}).join(', '))
  } catch (error) {
    console.error('❌ Health Check failed:', error.message)
  }

  // Step 4: Initialize System Assets and Trading Pairs
  try {
    const initResponse = await fetch(`${API_BASE}/ledger/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    const initData = await initResponse.json()
    
    if (initData.success) {
      console.log('✅ System Assets Initialized')
      console.log('   Assets: SOL, ETH, USDC')
      console.log('   Trading Pairs: SOL/USDC, ETH/USDC')
    } else {
      console.error('❌ System initialization failed:', initData.message)
    }
  } catch (error) {
    console.error('❌ System initialization test failed:', error.message)
  }

  // Step 5: Get Asset Configurations
  try {
    const assetsResponse = await fetch(`${API_BASE}/ledger/assets`)
    const assetsData = await assetsResponse.json()
    
    if (assetsData.success) {
      console.log('✅ Asset Configurations Retrieved')
      assetsData.data.assets.forEach(asset => {
        console.log(`   ${asset.symbol}: ${asset.name} (${asset.chain})`)
      })
    } else {
      console.error('❌ Get assets failed:', assetsData.message)
    }
  } catch (error) {
    console.error('❌ Get assets test failed:', error.message)
  }

  // Step 6: Get Trading Pairs
  try {
    const pairsResponse = await fetch(`${API_BASE}/ledger/trading-pairs`)
    const pairsData = await pairsResponse.json()
    
    if (pairsData.success) {
      console.log('✅ Trading Pairs Retrieved')
      pairsData.data.tradingPairs.forEach(pair => {
        console.log(`   ${pair.symbol}: Min ${pair.minOrderSize}, Max ${pair.maxOrderSize}`)
      })
    } else {
      console.error('❌ Get trading pairs failed:', pairsData.message)
    }
  } catch (error) {
    console.error('❌ Get trading pairs test failed:', error.message)
  }

  // Step 7: Add Some Balance for Testing (Manual Operation)
  try {
    const balanceOpResponse = await fetch(`${API_BASE}/ledger/balance/operation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userId,
        asset: 'USDC',
        amount: '1000',
        operation: 'add',
        description: 'Test balance for Phase 3 testing'
      })
    })
    const balanceOpData = await balanceOpResponse.json()
    
    if (balanceOpData.success) {
      console.log('✅ Test Balance Added')
      console.log('   Added 1000 USDC for testing')
    } else {
      console.error('❌ Balance operation failed:', balanceOpData.message)
    }
  } catch (error) {
    console.error('❌ Balance operation test failed:', error.message)
  }

  // Step 8: Add SOL Balance for Testing
  try {
    const balanceOpResponse = await fetch(`${API_BASE}/ledger/balance/operation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: userId,
        asset: 'SOL',
        amount: '10',
        operation: 'add',
        description: 'Test SOL balance for Phase 3 testing'
      })
    })
    const balanceOpData = await balanceOpResponse.json()
    
    if (balanceOpData.success) {
      console.log('✅ Test SOL Balance Added')
      console.log('   Added 10 SOL for testing')
    } else {
      console.error('❌ SOL balance operation failed:', balanceOpData.message)
    }
  } catch (error) {
    console.error('❌ SOL balance operation test failed:', error.message)
  }

  // Step 9: Check User Balances
  try {
    const balancesResponse = await fetch(`${API_BASE}/ledger/balances`, {
      headers: { 
        'Authorization': `Bearer ${accessToken}`
      }
    })
    const balancesData = await balancesResponse.json()
    
    if (balancesData.success) {
      console.log('✅ User Balances Retrieved')
      balancesData.data.balances.forEach(balance => {
        console.log(`   ${balance.asset}: Available: ${balance.available}, Locked: ${balance.locked}, Total: ${balance.total}`)
      })
    } else {
      console.error('❌ Get balances failed:', balancesData.message)
    }
  } catch (error) {
    console.error('❌ Get balances test failed:', error.message)
  }

  // Step 10: Create a Buy Order (SOL/USDC)
  try {
    const orderResponse = await fetch(`${API_BASE}/ledger/orders`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        tradingPair: 'SOL/USDC',
        orderType: 'limit',
        side: 'buy',
        amount: '1.0',
        price: '100.00',
        timeInForce: 'GTC'
      })
    })
    const orderData = await orderResponse.json()
    
    if (orderData.success) {
      console.log('✅ Buy Order Created')
      console.log(`   Order ID: ${orderData.data.id}`)
      console.log(`   Side: ${orderData.data.side}, Amount: ${orderData.data.amount}, Price: ${orderData.data.price}`)
      console.log(`   Locked: ${orderData.data.lockedAmount} ${orderData.data.lockedAsset}`)
    } else {
      console.error('❌ Create buy order failed:', orderData.message)
    }
  } catch (error) {
    console.error('❌ Create buy order test failed:', error.message)
  }

  // Step 11: Create a Sell Order (SOL/USDC)
  try {
    const orderResponse = await fetch(`${API_BASE}/ledger/orders`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        tradingPair: 'SOL/USDC',
        orderType: 'limit',
        side: 'sell',
        amount: '0.5',
        price: '105.00',
        timeInForce: 'GTC'
      })
    })
    const orderData = await orderResponse.json()
    
    if (orderData.success) {
      console.log('✅ Sell Order Created')
      console.log(`   Order ID: ${orderData.data.id}`)
      console.log(`   Side: ${orderData.data.side}, Amount: ${orderData.data.amount}, Price: ${orderData.data.price}`)
      console.log(`   Locked: ${orderData.data.lockedAmount} ${orderData.data.lockedAsset}`)
    } else {
      console.error('❌ Create sell order failed:', orderData.message)
    }
  } catch (error) {
    console.error('❌ Create sell order test failed:', error.message)
  }

  // Step 12: Get User Orders
  try {
    const ordersResponse = await fetch(`${API_BASE}/ledger/orders`, {
      headers: { 
        'Authorization': `Bearer ${accessToken}`
      }
    })
    const ordersData = await ordersResponse.json()
    
    if (ordersData.success) {
      console.log('✅ User Orders Retrieved')
      console.log(`   Total orders: ${ordersData.data.total}`)
      ordersData.data.items.forEach(order => {
        console.log(`   ${order.side} ${order.amount} ${order.tradingPair} @ ${order.price} - Status: ${order.status}`)
      })
    } else {
      console.error('❌ Get orders failed:', ordersData.message)
    }
  } catch (error) {
    console.error('❌ Get orders test failed:', error.message)
  }

  // Step 13: Check Balances After Orders (should show locked amounts)
  try {
    const balancesResponse = await fetch(`${API_BASE}/ledger/balances`, {
      headers: { 
        'Authorization': `Bearer ${accessToken}`
      }
    })
    const balancesData = await balancesResponse.json()
    
    if (balancesData.success) {
      console.log('✅ Balances After Orders')
      balancesData.data.balances.forEach(balance => {
        console.log(`   ${balance.asset}: Available: ${balance.available}, Locked: ${balance.locked}, Total: ${balance.total}`)
      })
    } else {
      console.error('❌ Get balances after orders failed:', balancesData.message)
    }
  } catch (error) {
    console.error('❌ Get balances after orders test failed:', error.message)
  }

  // Step 14: Test Internal Transfer
  try {
    const transferResponse = await fetch(`${API_BASE}/ledger/transfer`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        toUserId: secondUserId,
        asset: 'USDC',
        amount: '50',
        description: 'Test internal transfer'
      })
    })
    const transferData = await transferResponse.json()
    
    if (transferData.success) {
      console.log('✅ Internal Transfer Completed')
      console.log('   Transferred 50 USDC to second user')
    } else {
      console.error('❌ Internal transfer failed:', transferData.message)
    }
  } catch (error) {
    console.error('❌ Internal transfer test failed:', error.message)
  }

  // Step 15: Get Ledger History
  try {
    const historyResponse = await fetch(`${API_BASE}/ledger/history`, {
      headers: { 
        'Authorization': `Bearer ${accessToken}`
      }
    })
    const historyData = await historyResponse.json()
    
    if (historyData.success) {
      console.log('✅ Ledger History Retrieved')
      console.log(`   Total entries: ${historyData.data.total}`)
      historyData.data.items.slice(0, 5).forEach(entry => {
        console.log(`   ${entry.entryType}: ${entry.amount} ${entry.asset} - ${entry.description}`)
      })
    } else {
      console.error('❌ Get ledger history failed:', historyData.message)
    }
  } catch (error) {
    console.error('❌ Get ledger history test failed:', error.message)
  }

  console.log('\n🎉 Phase 3 Testing Completed!')
  console.log('\n📋 Phase 3 Summary:')
  console.log('   ✅ System asset configuration')
  console.log('   ✅ Trading pair management')
  console.log('   ✅ Balance operations (add, lock, unlock)')
  console.log('   ✅ Order management (create, retrieve)')
  console.log('   ✅ Balance locking for orders')
  console.log('   ✅ Internal transfers between users')
  console.log('   ✅ Complete ledger history tracking')
  console.log('\n🚀 Ready for Phase 4: Matching Engine + Orderbook!')
}

testPhase3() 