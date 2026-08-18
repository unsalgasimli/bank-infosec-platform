import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { config } from '../config/index.js';
import { cacheService } from '../services/cache.service.js';

function createRateLimiter(options: { windowMs: number; max: number; message: string; skipSuccessfulRequests?: boolean }) {
  const redisClient = cacheService.getRedisClient();

  return rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests || false,
    keyGenerator: (req) => {
      const forwarded = req.headers['x-forwarded-for'];
      if (typeof forwarded === 'string') {
        return forwarded.split(',')[0].trim();
      }
      return req.ip || '127.0.0.1';
    },
    store:
      config.REDIS_ENABLED && redisClient
        ? new RedisStore({
            // @ts-ignore
            sendCommand: (...args: string[]) => redisClient.call(...args),
            prefix: 'rl:',
          })
        : undefined,
    message: {
      success: false,
      status: 429,
      error: 'Too Many Requests',
      message: options.message,
      retryAfterSeconds: Math.ceil(options.windowMs / 1000),
    },
  });
}

// General API rate limiter
export const generalRateLimiter = createRateLimiter({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  message: 'API request rate limit exceeded. Please slow down your requests.',
});

// Strict Auth rate limiter (anti brute-force)
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.AUTH_RATE_LIMIT_MAX,
  skipSuccessfulRequests: true,
  message: 'Too many authentication attempts. Account access temporarily throttled for security.',
});
