// Simple test script to verify API functionality
// Run with: bun test.js (after starting the server)

const API_BASE = 'http://localhost:3001'

async function testAPI() {
  console.log('🧪 Testing Crypto Exchange API...\n')

  // Test 1: Health check
  try {
    const healthResponse = await fetch(`${API_BASE}/health`)
    const healthData = await healthResponse.json()
    console.log('✅ Health Check:', healthData.status)
  } catch (error) {
    console.error('❌ Health Check failed:', error.message)
    return
  }

  // Test 2: API Info
  try {
    const infoResponse = await fetch(`${API_BASE}/`)
    const infoData = await infoResponse.json()
    console.log('✅ API Info:', infoData.message)
  } catch (error) {
    console.error('❌ API Info failed:', error.message)
  }

  // Test 3: User Registration
  const testUser = {
    email: `test-${Date.now()}@example.com`,
    password: 'testpassword123'
  }

  try {
    const registerResponse = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    })
    const registerData = await registerResponse.json()
    
    if (registerData.success) {
      console.log('✅ User Registration successful')
      console.log('   User ID:', registerData.data.user.id)
      console.log('   Access Token received:', !!registerData.data.accessToken)
      
      // Test 4: Get Profile with token
      const profileResponse = await fetch(`${API_BASE}/auth/profile`, {
        headers: { 
          'Authorization': `Bearer ${registerData.data.accessToken}`
        }
      })
      const profileData = await profileResponse.json()
      
      if (profileData.success) {
        console.log('✅ Profile retrieval successful')
        console.log('   Email:', profileData.data.user.email)
        console.log('   2FA Enabled:', profileData.data.user.is2FAEnabled)
      } else {
        console.error('❌ Profile retrieval failed:', profileData.message)
      }
      
    } else {
      console.error('❌ User Registration failed:', registerData.message)
    }
  } catch (error) {
    console.error('❌ Registration test failed:', error.message)
  }

  console.log('\n🎉 API testing completed!')
}

testAPI() 