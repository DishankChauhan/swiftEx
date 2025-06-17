import redis from '../config/redis'

interface RateLimitConfig {
  windowMs: number      // Time window in milliseconds
  maxRequests: number   // Max requests per window
  keyGenerator?: (context: any) => string  // Custom key generator
  skipSuccessfulRequests?: boolean
  skipFailedRequests?: boolean
}

interface RateLimitResult {
  allowed: boolean
  resetTime: number
  remainingRequests: number
  totalRequests: number
}

export class RateLimiter {
  private config: RateLimitConfig

  constructor(config: RateLimitConfig) {
    this.config = config
  }

  /**
   * Check if request is within rate limits
   */
  async checkRateLimit(context: any): Promise<RateLimitResult> {
    const key = this.generateKey(context)
    const now = Date.now()
    const windowStart = now - this.config.windowMs

    try {
      // Use Redis sorted set to track requests
      const pipeline = redis.multi()
      
      // Remove old entries outside the window
      pipeline.zRemRangeByScore(key, '-inf', windowStart)
      
      // Count current requests in window
      pipeline.zCard(key)
      
      // Add current request
      pipeline.zAdd(key, [{ score: now, value: `${now}-${Math.random()}` }])
      
      // Set expiration
      pipeline.expire(key, Math.ceil(this.config.windowMs / 1000))
      
      const results = await pipeline.exec()
      
      if (!results || results.length < 2) {
        throw new Error('Redis pipeline failed')
      }

      const requestCount = ((results[1] as any)?.[1] as number) || 0
      const isAllowed = requestCount < this.config.maxRequests
      
      return {
        allowed: isAllowed,
        resetTime: windowStart + this.config.windowMs,
        remainingRequests: Math.max(0, this.config.maxRequests - requestCount - 1),
        totalRequests: requestCount + 1
      }

    } catch (error) {
      console.error('Rate limit check failed:', error)
      // Fail open - allow request if Redis is down
      return {
        allowed: true,
        resetTime: now + this.config.windowMs,
        remainingRequests: this.config.maxRequests - 1,
        totalRequests: 1
      }
    }
  }

  /**
   * Generate rate limit key
   */
  private generateKey(context: any): string {
    if (this.config.keyGenerator) {
      return `rate_limit:${this.config.keyGenerator(context)}`
    }

    // Default: use IP address
    const ip = this.getClientIP(context)
    return `rate_limit:ip:${ip}`
  }

  /**
   * Extract client IP address
   */
  private getClientIP(context: any): string {
    const request = context.request || context
    
    // Check various headers for real IP
    const forwarded = request.headers['x-forwarded-for']
    if (forwarded) {
      return forwarded.split(',')[0].trim()
    }

    return request.headers['x-real-ip'] || 
           request.headers['cf-connecting-ip'] || 
           request.connection?.remoteAddress || 
           request.socket?.remoteAddress ||
           'unknown'
  }
}

// Pre-configured rate limiters for different use cases
export const rateLimiters = {
  // General API requests: 100 requests per minute
  general: new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100
  }),

  // Authentication: 5 attempts per minute
  auth: new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5,
    keyGenerator: (context: any) => {
      const ip = context.request?.headers['x-forwarded-for']?.split(',')[0] || 
                 context.request?.connection?.remoteAddress || 'unknown'
      return `auth:${ip}`
    }
  }),

  // Order placement: 20 orders per minute per user
  orders: new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20,
    keyGenerator: (context: any) => {
      const userId = context.user?.id || 'anonymous'
      return `orders:${userId}`
    }
  }),

  // Market data: 60 requests per minute
  marketData: new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60
  }),

  // Admin operations: 10 requests per minute
  admin: new RateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
    keyGenerator: (context: any) => {
      const userId = context.user?.id || 'anonymous'
      return `admin:${userId}`
    }
  })
}

/**
 * Elysia rate limit middleware factory
 */
export function createRateLimitMiddleware(limiter: RateLimiter) {
  return async (context: any, next: () => Promise<any>) => {
    const result = await limiter.checkRateLimit(context)

    // Add rate limit headers
    context.set.headers = {
      ...context.set.headers,
      'X-RateLimit-Limit': limiter['config'].maxRequests.toString(),
      'X-RateLimit-Remaining': result.remainingRequests.toString(),
      'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString()
    }

    if (!result.allowed) {
      return {
        success: false,
        error: 'Rate limit exceeded',
        message: `Too many requests. Limit: ${limiter['config'].maxRequests} per ${limiter['config'].windowMs / 1000}s`,
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
      }
    }

    return next()
  }
}

/**
 * User-specific rate limiter
 */
export async function checkUserRateLimit(
  userId: string, 
  action: string, 
  maxRequests: number = 100,
  windowMs: number = 60000
): Promise<RateLimitResult> {
  const limiter = new RateLimiter({
    windowMs,
    maxRequests,
    keyGenerator: () => `user:${userId}:${action}`
  })

  return await limiter.checkRateLimit({ user: { id: userId } })
}

/**
 * IP-based rate limiter for public endpoints
 */
export async function checkIPRateLimit(
  ip: string,
  endpoint: string,
  maxRequests: number = 60,
  windowMs: number = 60000
): Promise<RateLimitResult> {
  const limiter = new RateLimiter({
    windowMs,
    maxRequests,
    keyGenerator: () => `ip:${ip}:${endpoint}`
  })

  return await limiter.checkRateLimit({ 
    request: { 
      connection: { remoteAddress: ip } 
    } 
  })
} 