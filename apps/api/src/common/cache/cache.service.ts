import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.module';

@Injectable()
export class CacheService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    const val = await this.redis.get(key);
    if (!val) return null;
    try {
      return JSON.parse(val) as T;
    } catch {
      return val as T;
    }
  }

  async set(key: string, value: any, ttlSeconds = 300) {
    const data = typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds) await this.redis.set(key, data, 'EX', ttlSeconds);
    else await this.redis.set(key, data);
  }

  async del(key: string) {
    await this.redis.del(key);
  }

  async exists(key: string) {
    return this.redis.exists(key);
  }
}
