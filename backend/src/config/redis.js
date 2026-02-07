const redis = require('redis');
require('dotenv').config();

// Create a mock Redis client for development when Redis is not available
const createMockRedisClient = () => {
  return {
    get: async () => null,
    set: async () => 'OK',
    setex: async () => 'OK',
    del: async () => 1,
    connect: async () => {},
    disconnect: async () => {},
    on: () => {},
    isOpen: false
  };
};

let redisClient;

try {
  redisClient = redis.createClient({
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    retry_strategy: (options) => {
      if (options.error && options.error.code === 'ECONNREFUSED') {
        console.log('Redis not available, using mock client for development');
        return undefined; // Stop retrying
      }
      if (options.total_retry_time > 1000 * 60 * 60) {
        return new Error('Retry time exhausted');
      }
      if (options.attempt > 3) {
        return undefined;
      }
      return Math.min(options.attempt * 100, 3000);
    }
  });

  redisClient.on('connect', () => {
    console.log('Connected to Redis');
  });

  redisClient.on('error', (err) => {
    console.log('Redis connection error, using mock client:', err.message);
    redisClient = createMockRedisClient();
  });

  redisClient.connect().catch(() => {
    console.log('Redis connection failed, using mock client for development');
    redisClient = createMockRedisClient();
  });

} catch (error) {
  console.log('Redis initialization failed, using mock client for development');
  redisClient = createMockRedisClient();
}

module.exports = { redisClient };
