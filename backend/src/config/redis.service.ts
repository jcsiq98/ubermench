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

  isRealRedis(): boolean {
    return !this.isMemoryMode;
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

  // ─── List operations (for message buffering) ─────────────

  async rpush(key: string, ...values: string[]): Promise<number> {
    if (this.isMemoryMode) {
      const item = this.memoryStore.get(key);
      let list: string[] = [];
      if (item) {
        if (item.expiresAt && Date.now() > item.expiresAt) {
          this.memoryStore.delete(key);
        } else {
          try { list = JSON.parse(item.value); } catch { list = []; }
        }
      }
      list.push(...values);
      this.memoryStore.set(key, {
        value: JSON.stringify(list),
        expiresAt: item?.expiresAt,
      });
      return list.length;
    }
    return this.client.rpush(key, ...values);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    if (this.isMemoryMode) {
      const item = this.memoryStore.get(key);
      if (!item) return [];
      if (item.expiresAt && Date.now() > item.expiresAt) {
        this.memoryStore.delete(key);
        return [];
      }
      try {
        const list: string[] = JSON.parse(item.value);
        const s = start < 0 ? Math.max(list.length + start, 0) : start;
        const e = stop < 0 ? list.length + stop + 1 : stop + 1;
        return list.slice(s, e);
      } catch {
        return [];
      }
    }
    return this.client.lrange(key, start, stop);
  }

  async ltrim(key: string, start: number, stop: number): Promise<void> {
    if (this.isMemoryMode) {
      const item = this.memoryStore.get(key);
      if (!item) return;
      try {
        const list: string[] = JSON.parse(item.value);
        const s = start < 0 ? Math.max(list.length + start, 0) : start;
        const e = stop < 0 ? list.length + stop + 1 : stop + 1;
        const trimmed = list.slice(s, e);
        if (trimmed.length === 0) {
          this.memoryStore.delete(key);
        } else {
          this.memoryStore.set(key, { value: JSON.stringify(trimmed), expiresAt: item.expiresAt });
        }
      } catch {
        this.memoryStore.delete(key);
      }
      return;
    }
    await this.client.ltrim(key, start, stop);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    if (this.isMemoryMode) {
      const item = this.memoryStore.get(key);
      if (item) {
        item.expiresAt = Date.now() + ttlSeconds * 1000;
      }
      return;
    }
    await this.client.expire(key, ttlSeconds);
  }

  /**
   * Atomic set-if-not-exists. Returns true if the key was set (caller wins),
   * false if it already existed (someone else won).
   */
  async setNX(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (this.isMemoryMode) {
      const existing = this.memoryStore.get(key);
      if (existing && (!existing.expiresAt || Date.now() <= existing.expiresAt)) {
        return false;
      }
      this.memoryStore.set(key, {
        value,
        expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
      });
      return true;
    }

    const args: (string | number)[] = [key, value];
    if (ttlSeconds) {
      args.push('EX', ttlSeconds);
    }
    args.push('NX');
    const result = await (this.client as any).set(...args);
    return result === 'OK';
  }
}

