require('dotenv').config();

/**
 * In-memory store for development when Redis is not available.
 * Supports TTL via setTimeout-based expiration.
 */
const createInMemoryClient = () => {
  const store = new Map();
  const timers = new Map();

  return {
    get: async (key) => {
      return store.get(key) || null;
    },

    set: async (key, value) => {
      store.set(key, value);
      return 'OK';
    },

    setex: async (key, ttlSeconds, value) => {
      store.set(key, value);
      if (timers.has(key)) clearTimeout(timers.get(key));
      const timer = setTimeout(() => {
        store.delete(key);
        timers.delete(key);
      }, ttlSeconds * 1000);
      timers.set(key, timer);
      return 'OK';
    },

    del: async (key) => {
      if (timers.has(key)) clearTimeout(timers.get(key));
      timers.delete(key);
      return store.delete(key) ? 1 : 0;
    },

    connect: async () => {},
    disconnect: async () => {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      store.clear();
    },
    on: () => {},
    isOpen: true,
  };
};

// Use in-memory store unless REDIS_HOST is explicitly set
let redisClient;

if (process.env.REDIS_HOST) {
  try {
    const redis = require('redis');
    redisClient = redis.createClient({
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      retry_strategy: (options) => {
        if (options.attempt > 3) return undefined;
        return Math.min(options.attempt * 100, 3000);
      },
    });

    redisClient.on('connect', () => {
      console.log('[Redis] Connected to Redis server');
    });

    redisClient.on('error', (err) => {
      console.log('[Redis] Error:', err.message);
    });

    redisClient.connect().catch((err) => {
      console.log('[Redis] Connection failed, using in-memory store');
      redisClient = createInMemoryClient();
    });
  } catch (error) {
    console.log('[Redis] Init failed, using in-memory store');
    redisClient = createInMemoryClient();
  }
} else {
  console.log('[Redis] No REDIS_HOST configured, using in-memory store');
  redisClient = createInMemoryClient();
}

module.exports = { redisClient };
