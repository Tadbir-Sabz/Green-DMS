import { Module, Global } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const client = new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: Number(process.env.REDIS_PORT || 6379),
          maxRetriesPerRequest: null,
          // بدون Redis هم باید بالا بیاییم؛ اتصال بعداً خودترمیم می‌شود
          retryStrategy: (times: number) => Math.min(times * 500, 10_000),
        });
        // listener خطای ضروری: بدون آن، رویداد error روی EventEmitter باعث crash است
        client.on('error', (err: Error) => {
          console.warn('⚠ Redis در دسترس نیست (' + err.message + ')؛ کش/صف سراسری غیرفعال است.');
        });
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
