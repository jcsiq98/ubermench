import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;
  private isMemoryMode = false;
  private memoryStore = new Map<string, { value: string; expiresAt?: number }>();

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    const redisUrl = this.configService.get<string>('REDIS_URL');

    if (!redisUrl) {
      console.warn('[Redis] No REDIS_URL configured, using in-memory store');
      this.isMemoryMode = true;
      return;
    }

    try {
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) {
            console.warn('[Redis] Connection failed, falling back to in-memory store');
            this.isMemoryMode = true;
            return null; // stop retrying
          }
          return Math.min(times * 200, 2000);
        },
      });

      this.client.on('connect', () => console.log('[Redis] Connected'));
      this.client.on('error', (err) => {
        console.error('[Redis] Error:', err.message);
        if (!this.isMemoryMode) {
          console.warn('[Redis] Falling back to in-memory store');
          this.isMemoryMode = true;
        }
      });

      // Test connection
      await this.client.ping();
      console.log('[Redis] Connection verified');
    } catch {
      console.warn('[Redis] Could not connect, using in-memory store');
      this.isMemoryMode = true;
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.isMemoryMode) {
      const item = this.memoryStore.get(key);
      if (!item) return null;
      if (item.expiresAt && Date.now() > item.expiresAt) {
        this.memoryStore.delete(key);
        return null;
      }
      return item.value;
    }
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.isMemoryMode) {
      this.memoryStore.set(key, {
        value,
        expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
      });
      return;
    }
    if (ttlSeconds) {
      await this.client.setex(key, ttlSeconds, value);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    if (this.isMemoryMode) {
      this.memoryStore.delete(key);
      return;
    }
    await this.client.del(key);
  }

  async incr(key: string): Promise<number> {
    if (this.isMemoryMode) {
      const item = this.memoryStore.get(key);
      const current = item ? parseInt(item.value, 10) || 0 : 0;
      const next = current + 1;
      this.memoryStore.set(key, {
        value: String(next),
        expiresAt: item?.expiresAt,
      });
      return next;
    }
    return this.client.incr(key);
  }

  async exists(key: string): Promise<boolean> {
    if (this.isMemoryMode) {
      const item = this.memoryStore.get(key);
      if (!item) return false;
      if (item.expiresAt && Date.now() > item.expiresAt) {
        this.memoryStore.delete(key);
        return false;
      }
      return true;
    }
    return (await this.client.exists(key)) === 1;
  }
}

