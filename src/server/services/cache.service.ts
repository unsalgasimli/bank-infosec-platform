import { Redis } from 'ioredis';
import { config } from '../config/index.js';
import { logger } from './logger.service.js';

interface MemoryCacheEntry {
  value: string;
  expiresAt: number;
}

export class CacheService {
  private static instance: CacheService;
  private redisClient: Redis | null = null;
  private memoryCache: Map<string, MemoryCacheEntry> = new Map();
  private isRedisConnected: boolean = false;

  private constructor() {
    this.initCache();
  }

  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  private initCache(): void {
    if (config.REDIS_ENABLED) {
      try {
        this.redisClient = new Redis(config.REDIS_URL, {
          password: config.REDIS_PASSWORD,
          keyPrefix: config.REDIS_KEY_PREFIX,
          lazyConnect: true,
          retryStrategy(times) {
            const delay = Math.min(times * 200, 2000);
            return delay;
          },
        });

        this.redisClient.on('connect', () => {
          this.isRedisConnected = true;
          logger.info('Redis cache client connected');
        });

        this.redisClient.on('error', (err) => {
          this.isRedisConnected = false;
          logger.warn({ err: err.message }, 'Redis error, using memory fallback');
        });

        this.redisClient.connect().catch((err) => {
          logger.warn({ err: err.message }, 'Could not immediately connect to Redis, operating with in-memory fallback');
        });
      } catch (err) {
        logger.warn({ err }, 'Failed to initialize Redis, fallback to in-memory cache');
      }
    } else {
      logger.info('Redis disabled in config, using high-performance in-memory cache');
    }
  }

  public getRedisClient(): Redis | null {
    return this.redisClient;
  }

  public async get<T>(key: string): Promise<T | null> {
    if (this.isRedisConnected && this.redisClient) {
      try {
        const raw = await this.redisClient.get(key);
        return raw ? JSON.parse(raw) : null;
      } catch (err) {
        logger.warn({ err, key }, 'Failed to get key from Redis, falling back to memory');
      }
    }

    const item = this.memoryCache.get(key);
    if (!item) return null;
    if (item.expiresAt < Date.now()) {
      this.memoryCache.delete(key);
      return null;
    }

    try {
      return JSON.parse(item.value);
    } catch {
      return null;
    }
  }

  public async set(key: string, value: any, ttlSeconds: number = config.REDIS_TTL_SECONDS): Promise<void> {
    const serialized = JSON.stringify(value);

    if (this.isRedisConnected && this.redisClient) {
      try {
        await this.redisClient.set(key, serialized, 'EX', ttlSeconds);
        return;
      } catch (err) {
        logger.warn({ err, key }, 'Failed to write key to Redis, writing to memory');
      }
    }

    this.memoryCache.set(key, {
      value: serialized,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  public async del(key: string): Promise<void> {
    if (this.isRedisConnected && this.redisClient) {
      try {
        await this.redisClient.del(key);
      } catch (err) {
        logger.warn({ err, key }, 'Failed to delete key from Redis');
      }
    }
    this.memoryCache.delete(key);
  }

  public async checkHealth(): Promise<{ status: 'UP' | 'DOWN'; mode: 'redis' | 'memory'; latencyMs?: number; error?: string }> {
    if (config.REDIS_ENABLED && this.redisClient) {
      const start = Date.now();
      try {
        await this.redisClient.ping();
        const latencyMs = Date.now() - start;
        return { status: 'UP', mode: 'redis', latencyMs };
      } catch (error: any) {
        return { status: 'DOWN', mode: 'redis', error: error.message };
      }
    }
    return { status: 'UP', mode: 'memory' };
  }

  public async close(): Promise<void> {
    if (this.redisClient) {
      await this.redisClient.quit();
      this.isRedisConnected = false;
      logger.info('Redis client disconnected');
    }
  }
}

export const cacheService = CacheService.getInstance();
