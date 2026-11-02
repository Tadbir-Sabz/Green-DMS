import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL_MS ?? 60_000),
        // سقف محدودکنندهٔ ترافیک باید در تست‌ها آزاد باشد؛ تولید/توسعه: ۱۰۰ درخواست در دقیقه
        limit: process.env.NODE_ENV === 'test' ? 100_000 : Number(process.env.THROTTLE_LIMIT ?? 100),
      },
    ]),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class ThrottlerConfigModule {}
