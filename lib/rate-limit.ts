type RateLimitRecord = {
  count: number
  lastRequestTime: number
}

const rateLimitCache = new Map<string, RateLimitRecord>()

/**
 * A lightweight in-memory rate limiter.
 * Note: In a serverless environment (like Netlify Functions or Vercel), 
 * memory is NOT shared across function instances/regions. This provides 
 * basic protection against spam but is not globally consistent.
 * 
 * @param ip The client IP address (or a unique identifier like a user ID).
 * @param limit Max number of requests allowed within the window.
 * @param windowMs Time window in milliseconds (e.g., 5000 for 5 seconds).
 * @returns { success: boolean, remaining: number, resetTime: number }
 */
export function rateLimit(ip: string, limit: number, windowMs: number) {
  const now = Date.now()
  const record = rateLimitCache.get(ip)

  if (!record) {
    // Prevent memory leaks by bounding the cache size
    if (rateLimitCache.size > 10000) {
      rateLimitCache.clear()
    }
    
    rateLimitCache.set(ip, { count: 1, lastRequestTime: now })
    return { success: true, remaining: limit - 1, resetTime: now + windowMs }
  }

  // Check if the time window has elapsed
  if (now - record.lastRequestTime > windowMs) {
    // Reset window
    rateLimitCache.set(ip, { count: 1, lastRequestTime: now })
    return { success: true, remaining: limit - 1, resetTime: now + windowMs }
  }

  // Still within the time window
  if (record.count >= limit) {
    return { success: false, remaining: 0, resetTime: record.lastRequestTime + windowMs }
  }

  // Increment count
  record.count += 1
  rateLimitCache.set(ip, record)
  return { success: true, remaining: limit - record.count, resetTime: record.lastRequestTime + windowMs }
}
