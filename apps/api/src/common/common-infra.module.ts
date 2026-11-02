import { Global, Module } from '@nestjs/common';
import { RedisModule } from './cache/redis.module';
import { CacheService } from './cache/cache.service';
import { QueueModule } from './queue/queue.module';
import { ThrottlerConfigModule } from './throttler.module';
import { HealthCheckModule } from './health/health.module';

@Global()
@Module({
  imports: [RedisModule, QueueModule, ThrottlerConfigModule, HealthCheckModule],
  providers: [CacheService],
  exports: [RedisModule, CacheService, QueueModule, ThrottlerConfigModule, HealthCheckModule],
})
export class CommonInfraModule {}
