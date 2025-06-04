#!/usr/bin/env bun

const BASE_URL = 'http://localhost:3001'

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function simpleTest() {
  console.log('🧪 Simple Phase 4 Test...')
  
  try {
    // 1. Login
    console.log('1. Logging in...')
    const loginResp = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'alice@test.com', password: 'password123' })
    })
    
    if (!loginResp.ok) {
      console.log('Login failed:', loginResp.status)
      return
    }
    
    const loginData = await loginResp.json()
    if (!loginData.success) {
      console.log('Login failed:', loginData)
      return
    }
    
    const token = loginData.data.accessToken
    const userId = loginData.data.user.id
    console.log('✅ Login successful')
    
    await sleep(1000)
    
    // 2. Initialize system
    console.log('2. Initializing system...')
    const initResp = await fetch(`${BASE_URL}/ledger/init`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    })
    
    const initData = await initResp.json()
    if (initResp.ok && initData.success) {
      console.log('✅ System initialized')
    } else {
      console.log('❌ System init failed:', initResp.status, initData)
    }
    
    await sleep(2000)
    
    // 3. Add balance
    console.log('3. Adding USDC balance...')
    const balanceResp = await fetch(`${BASE_URL}/ledger/balance/operation`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        userId: userId,
        asset: 'USDC',
        amount: '10000',
        operation: 'add',
        description: 'Simple test'
      })
    })
    
    const balanceData = await balanceResp.json()
    if (balanceResp.ok && balanceData.success) {
      console.log('✅ Balance added')
    } else {
      console.log('❌ Balance add failed:', balanceResp.status, balanceData)
    }
    
    await sleep(1000)
    
    // 4. Place order
    console.log('4. Placing order...')
    const orderResp = await fetch(`${BASE_URL}/orderbook/order`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        tradingPair: 'SOL/USDC',
        side: 'buy',
        type: 'limit',
        amount: '10',
        price: '95'
      })
    })
    
    const orderData = await orderResp.json()
    if (orderResp.ok && orderData.success) {
      console.log('✅ Order placed')
    } else {
      console.log('❌ Order failed:', orderResp.status, orderData)
    }
    
    console.log('🎉 Simple test completed!')
    
  } catch (error) {
    console.error('Test failed:', error)
  }
}

simpleTest() 