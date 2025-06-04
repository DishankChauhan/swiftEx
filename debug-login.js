#!/usr/bin/env bun

async function debugLogin() {
  const response = await fetch('http://localhost:3001/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alice@test.com', password: 'password123' })
  });
  
  const data = await response.json();
  console.log('Full response:', JSON.stringify(data, null, 2));
  console.log('data.data exists:', !!data.data);
  console.log('data.user exists:', !!data.user);
  console.log('data.accessToken exists:', !!data.accessToken);
  if (data.data) {
    console.log('data.data.accessToken exists:', !!data.data.accessToken);
    console.log('data.data.user exists:', !!data.data.user);
    if (data.data.user) {
      console.log('data.data.user.id:', data.data.user.id);
    }
  }
  if (data.user) {
    console.log('data.user.id:', data.user.id);
  }
}

debugLogin().catch(console.error); 