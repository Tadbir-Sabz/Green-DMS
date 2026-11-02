import { Module, Global } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

export const QUEUE_CONNECTION = 'QUEUE_CONNECTION';
export const INVOICE_QUEUE = 'INVOICE_QUEUE';
export const SMS_QUEUE = 'SMS_QUEUE';
export const REPORT_QUEUE = 'REPORT_QUEUE';

@Global()
@Module({
  providers: [
    {
      provide: QUEUE_CONNECTION,
      useFactory: () => {
        const client = new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: Number(process.env.REDIS_PORT || 6379),
          maxRetriesPerRequest: null,
          retryStrategy: (times: number) => Math.min(times * 500, 10_000),
        });
        client.on('error', (err: Error) => {
          console.warn('⚠ Redis برای صف BullMQ در دسترس نیست (' + err.message + ').');
        });
        return client;
      },
    },
    {
      provide: INVOICE_QUEUE,
      useFactory: (conn: Redis) => new Queue('invoice-jobs', { connection: conn }),
      inject: [QUEUE_CONNECTION],
    },
    {
      provide: SMS_QUEUE,
      useFactory: (conn: Redis) => new Queue('sms-jobs', { connection: conn }),
      inject: [QUEUE_CONNECTION],
    },
    {
      provide: REPORT_QUEUE,
      useFactory: (conn: Redis) => new Queue('report-jobs', { connection: conn }),
      inject: [QUEUE_CONNECTION],
    },
  ],
  exports: [INVOICE_QUEUE, SMS_QUEUE, REPORT_QUEUE],
})
export class QueueModule {}
