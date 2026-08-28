import Redis from 'ioredis';

// Use environment variable, fallback to localhost for tests running outside Docker
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6367';
export const redisClient = new Redis(redisUrl);

redisClient.on('error', (err: Error) => {
    console.error('[Redis Error]', err.message);
});
