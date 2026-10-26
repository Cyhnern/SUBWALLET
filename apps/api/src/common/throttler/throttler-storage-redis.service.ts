import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';

@Injectable()
export class ThrottlerStorageRedisService implements ThrottlerStorage, OnApplicationShutdown {
  private readonly redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
    });
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ) {
    const multi = this.redis.multi();
    multi.incr(key);
    multi.pexpire(key, ttl, 'NX');
    multi.pttl(key);

    const results = await multi.exec();
    const totalHits = (results?.[0]?.[1] as number) ?? 1;
    const timeToExpire = (results?.[2]?.[1] as number) ?? ttl;

    const isBlocked = totalHits > limit;
    const timeToBlockExpire = isBlocked ? blockDuration : 0;

    return { totalHits, timeToExpire, isBlocked, timeToBlockExpire };
  }

  onApplicationShutdown() {
    this.redis.quit().catch(() => {});
  }
}
