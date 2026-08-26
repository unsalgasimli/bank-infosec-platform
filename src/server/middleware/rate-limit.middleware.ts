import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { config } from '../config/index.js';
import { cacheService } from '../services/cache.service.js';

function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message: string;
  keyPrefix: string;
  skipSuccessfulRequests?: boolean;
}) {
  const redisClient = cacheService.getRedisClient();

  return rateLimit({
    windowMs: options.windowMs,
    max: (req) => (config.NODE_ENV === 'development' ? 2000 : options.max),
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: options.skipSuccessfulRequests || false,
    skip: (req) => {
      // In local development, never throttle localhost/loopback requests
      if (config.NODE_ENV === 'development') {
        const ip = req.ip || '';
        return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.startsWith('127.');
      }
      return false;
    },
    // Express resolves req.ip through the loopback-only trusted proxy policy.
    // Reading X-Forwarded-For directly would let LAN clients bypass throttling.
    keyGenerator: (req) => req.ip || '127.0.0.1',
    store:
      config.REDIS_ENABLED && redisClient
          ? new RedisStore({
            // @ts-ignore
            sendCommand: (...args: string[]) => redisClient.call(...args),
            // Each limiter must have its own namespace. The general API
            // limiter and the auth limiter both see login requests, so sharing
            // a Redis key would make one request count twice and trigger
            // express-rate-limit's ERR_ERL_DOUBLE_COUNT validation.
            prefix: options.keyPrefix,
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
  keyPrefix: 'rl:api:',
  message: 'API request rate limit exceeded. Please slow down your requests.',
});

// Strict Auth rate limiter (anti brute-force)
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.AUTH_RATE_LIMIT_MAX,
  keyPrefix: 'rl:auth:',
  skipSuccessfulRequests: true,
  message: 'Too many sign-in attempts. Please wait before trying again.',
});
