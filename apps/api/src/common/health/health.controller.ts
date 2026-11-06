import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type { Pool } from 'pg';
import type { Redis } from 'ioredis';
import type { HealthResponse, LivenessResponse, ReadinessResponse } from '@dms/contracts';
import { PG_POOL } from '../../database/database.module';
import { REDIS_CLIENT } from '../cache/redis.module';

/**
 * پروب‌های استقرار (TASK-19 — Phase 4) — مسیرهای زیرساختی، عمداً خارج از قراردادِ
 * OpenAPI (همان رویهٔ /api/health در contract-drift.mjs):
 *
 *   GET /api/v1/health       → خلاصهٔ سازگارِ قدیمی (200 همیشه؛ ok|degraded + database)
 *   GET /api/v1/health/live  → liveness: فقط زنده بودنِ فرآیند؛ قطعیِ موقتِ PostgreSQL
 *                              باعثِ fail شدنِ liveness نمی‌شود (restart بی‌دلیل ممنوع)
 *   GET /api/v1/health/ready → readiness: وابستگیِ لازمِ سرویس‌دهی (پایگاه‌داده) را
 *                              چک می‌کند؛ 200 آماده، 503 آماده‌نیست. Redis فقط گزارش
 *                              می‌شود (سرویس بدونِ Redis با کاهشِ کارایی بالا می‌آید).
 *
 * تفاوتِ /api/v1/health با /api/health (خارج از prefix در main.ts) فقط مسیر است؛
 * هر دو همان قراردادِ HealthResponse را دارند تا مانیتورینگ سردرگم نشود.
 */

const version = (): string => process.env.npm_package_version ?? '0.1.0';
const now = (): string => new Date().toISOString();

@Controller('health')
export class HealthController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private async databaseUp(): Promise<boolean> {
    try {
      await this.pool.query('select 1');
      return true;
    } catch {
      return false;
    }
  }

  private async redisUp(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }

  @Get()
  async check(): Promise<HealthResponse> {
    const database = (await this.databaseUp()) ? 'up' : 'down';
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'dms-api',
      version: version(),
      database,
      timestamp: now(),
    };
  }

  @Get('live')
  live(): LivenessResponse {
    return { status: 'live', service: 'dms-api', version: version(), timestamp: now() };
  }

  @Get('ready')
  async ready(): Promise<ReadinessResponse> {
    const [database, redis] = await Promise.all([this.databaseUp(), this.redisUp()]);
    const body: ReadinessResponse = {
      status: database ? 'ready' : 'unready',
      service: 'dms-api',
      version: version(),
      database: database ? 'up' : 'down',
      redis: redis ? 'up' : 'down',
      timestamp: now(),
    };
    if (!database) throw new ServiceUnavailableException(body);
    return body;
  }
}
