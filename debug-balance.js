#!/usr/bin/env bun

async function debugBalance() {
  // First login to get fresh token
  const loginResp = await fetch('http://localhost:3001/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alice@test.com', password: 'password123' })
  });
  
  const loginData = await loginResp.json();
  console.log('Login success:', loginData.success);
  
  if (!loginData.success) {
    console.log('Login failed:', loginData);
    return;
  }
  
  const token = loginData.data.accessToken;
  const userId = loginData.data.user.id;
  
  console.log('Token length:', token.length);
  console.log('User ID:', userId);
  
  // Now try balance operation
  const balanceResp = await fetch('http://localhost:3001/ledger/balance/operation', {
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
      description: 'Debug test'
    })
  });
  
  const balanceData = await balanceResp.json();
  console.log('Balance operation response status:', balanceResp.status);
  console.log('Balance operation response:', JSON.stringify(balanceData, null, 2));
}

debugBalance().catch(console.error); 