import { Controller, Get, Inject } from '@nestjs/common';
import type { Pool } from 'pg';
import type { HealthResponse } from '@dms/contracts';
import { PG_POOL } from '../database/database.module';

@Controller('api/health')
export class HealthController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Get()
  async health(): Promise<HealthResponse> {
    let database: 'up' | 'down' = 'down';
    try {
      await this.pool.query('select 1');
      database = 'up';
    } catch {
      database = 'down';
    }

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'dms-api',
      version: process.env.npm_package_version ?? '0.1.0',
      database,
      timestamp: new Date().toISOString(),
    };
  }
}
