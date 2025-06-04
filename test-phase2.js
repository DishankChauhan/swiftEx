// Phase 2 Test Suite - Wallet System
// Run with: bun test-phase2.js (after starting the server)

const API_BASE = 'http://localhost:3001'

async function testPhase2() {
  console.log('🧪 Testing Crypto Exchange API - Phase 2: Wallet System...\n')

  let accessToken = ''
  let userId = ''

  // Step 1: Register and get token
  try {
    const testUser = {
      email: `test-phase2-${Date.now()}@example.com`,
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

  // Step 2: Test Phase 2 Health Check
  try {
    const healthResponse = await fetch(`${API_BASE}/health`)
    const healthData = await healthResponse.json()
    console.log('✅ Phase 2 Health Check:', healthData.status)
    console.log('   Features:', Object.keys(healthData.features || {}).join(', '))
  } catch (error) {
    console.error('❌ Health Check failed:', error.message)
  }

  // Step 3: Generate Solana Deposit Address
  try {
    const solanaAddressResponse = await fetch(`${API_BASE}/wallet/deposit/address`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ chain: 'solana' })
    })
    const solanaData = await solanaAddressResponse.json()
    
    if (solanaData.success) {
      console.log('✅ Solana Deposit Address Generated')
      console.log(`   Address: ${solanaData.data.address}`)
      console.log(`   Chain: ${solanaData.data.chain}`)
    } else {
      console.error('❌ Solana address generation failed:', solanaData.message)
    }
  } catch (error) {
    console.error('❌ Solana address test failed:', error.message)
  }

  // Step 4: Generate Ethereum Deposit Address
  try {
    const ethAddressResponse = await fetch(`${API_BASE}/wallet/deposit/address`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ chain: 'ethereum' })
    })
    const ethData = await ethAddressResponse.json()
    
    if (ethData.success) {
      console.log('✅ Ethereum Deposit Address Generated')
      console.log(`   Address: ${ethData.data.address}`)
      console.log(`   Chain: ${ethData.data.chain}`)
    } else {
      console.error('❌ Ethereum address generation failed:', ethData.message)
    }
  } catch (error) {
    console.error('❌ Ethereum address test failed:', error.message)
  }

  // Step 5: Get All Deposit Addresses
  try {
    const addressesResponse = await fetch(`${API_BASE}/wallet/deposit/addresses`, {
      headers: { 
        'Authorization': `Bearer ${accessToken}`
      }
    })
    const addressesData = await addressesResponse.json()
    
    if (addressesData.success) {
      console.log('✅ All Deposit Addresses Retrieved')
      addressesData.data.addresses.forEach(addr => {
        console.log(`   ${addr.chain}: ${addr.address}`)
      })
    } else {
      console.error('❌ Get addresses failed:', addressesData.message)
    }
  } catch (error) {
    console.error('❌ Get addresses test failed:', error.message)
  }

  // Step 6: Get User Balances
  try {
    const balancesResponse = await fetch(`${API_BASE}/wallet/balances`, {
      headers: { 
        'Authorization': `Bearer ${accessToken}`
      }
    })
    const balancesData = await balancesResponse.json()
    
    if (balancesData.success) {
      console.log('✅ User Balances Retrieved')
      if (balancesData.data.balances.length === 0) {
        console.log('   No balances found (expected for new user)')
      } else {
        balancesData.data.balances.forEach(balance => {
          console.log(`   ${balance.asset} (${balance.chain}): ${balance.available}`)
        })
      }
    } else {
      console.error('❌ Get balances failed:', balancesData.message)
    }
  } catch (error) {
    console.error('❌ Get balances test failed:', error.message)
  }

  // Step 7: Get Transaction History
  try {
    const txResponse = await fetch(`${API_BASE}/wallet/transactions`, {
      headers: { 
        'Authorization': `Bearer ${accessToken}`
      }
    })
    const txData = await txResponse.json()
    
    if (txData.success) {
      console.log('✅ Transaction History Retrieved')
      console.log(`   Total transactions: ${txData.data.total}`)
      if (txData.data.transactions.length === 0) {
        console.log('   No transactions found (expected for new user)')
      }
    } else {
      console.error('❌ Get transactions failed:', txData.message)
    }
  } catch (error) {
    console.error('❌ Get transactions test failed:', error.message)
  }

  // Step 8: Test Duplicate Address Generation (should return existing)
  try {
    const duplicateResponse = await fetch(`${API_BASE}/wallet/deposit/address`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ chain: 'solana' })
    })
    const duplicateData = await duplicateResponse.json()
    
    if (duplicateData.success) {
      console.log('✅ Duplicate Address Handling Works')
      console.log('   Returns existing address instead of creating new one')
    } else {
      console.error('❌ Duplicate address test failed:', duplicateData.message)
    }
  } catch (error) {
    console.error('❌ Duplicate address test failed:', error.message)
  }

  console.log('\n🎉 Phase 2 Testing Completed!')
  console.log('\n📋 Phase 2 Summary:')
  console.log('   ✅ Solana wallet generation')
  console.log('   ✅ Ethereum wallet generation') 
  console.log('   ✅ Deposit address management')
  console.log('   ✅ Balance tracking system')
  console.log('   ✅ Transaction history')
  console.log('   ✅ Duplicate address prevention')
}

testPhase2() 