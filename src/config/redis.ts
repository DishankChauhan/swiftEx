import { createClient } from 'redis'

export const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 1000)
  }
})

redis.on('error', (err) => {
  console.error('Redis Client Error:', err)
})

redis.on('connect', () => {
  console.log('🔴 Redis connected successfully')
})

redis.on('ready', () => {
  console.log('🔴 Redis client ready')
})

// Connect to Redis
redis.connect().catch((err) => {
  console.error('Failed to connect to Redis:', err)
})

export default redis 