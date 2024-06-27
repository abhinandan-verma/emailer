import Redis from 'ioredis';

// Use REDIS_URL from environment or fallback to localhost
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const connection = new Redis(REDIS_URL);

export { connection };