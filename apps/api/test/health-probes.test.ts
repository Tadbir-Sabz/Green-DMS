import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PG_POOL, DatabaseModule } from '../src/database/database.module';
import { REDIS_CLIENT, RedisModule } from '../src/common/cache/redis.module';
import { HealthCheckModule } from '../src/common/health/health.module';

/**
 * TASK-19 — Phase 4: پروب‌های استقرار با معنایِ متمایز.
 *   live  ⇒ حتی با پایگاهِ پایین 200 (قطعیِ موقتِ DB نباید liveness را fail کند)
 *   ready ⇒ 200 فقط وقتی DB بالاست؛ 503 با status=unready وقتی DB پایین است
 *   /health ⇒ خلاصهٔ سازگار (200 همیشه؛ ok|degraded)
 * کاملاً بدونِ DB واقعی (pool/redis ساختگی) ⇒ در job واحد اجرا می‌شود.
 */

function fakePool(up: boolean) {
  return {
    query: async () => {
      if (!up) throw new Error('connect ECONNREFUSED');
      return { rows: [{ '?column?': 1 }] };
    },
  };
}

function fakeRedis(up: boolean) {
  return {
    ping: async () => {
      if (!up) throw new Error('Connection is closed.');
      return 'PONG';
    },
  };
}

async function buildApp(dbUp: boolean, redisUp: boolean): Promise<INestApplication> {
  // DatabaseModule/RedisModule هر دو @Global اند (همانندِ app.module واقعی)؛
  // providerها با overrideProvider با stub تعویض می‌شوند تا کاملاً بدونِ DB/Redis اجرا شود.
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, RedisModule, HealthCheckModule],
  })
    .overrideProvider(PG_POOL)
    .useValue(fakePool(dbUp))
    .overrideProvider(REDIS_CLIENT)
    .useValue(fakeRedis(redisUp))
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return app;
}

describe('liveness /api/v1/health/live', () => {
  let app: INestApplication;
  beforeAll(async () => {
    app = await buildApp(false, false); // هر دو وابستگی پایین
  });
  afterAll(async () => {
    await app.close();
  });

  it('با پایگاهِ پایین هم 200 است (بازآغازِ بی‌دلیل ممنوع)', async () => {
    const res = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(res.body.status).toBe('live');
    expect(res.body.service).toBe('dms-api');
    expect(typeof res.body.timestamp).toBe('string');
  });
});

describe('readiness /api/v1/health/ready', () => {
  it('DB بالا ⇒ 200 با status=ready', async () => {
    const app = await buildApp(true, true);
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.database).toBe('up');
    expect(res.body.redis).toBe('up');
    await app.close();
  });

  it('DB پایین ⇒ 503 با status=unready (وابستگیِ لازمِ سرویس‌دهی)', async () => {
    const app = await buildApp(false, true);
    const res = await request(app.getHttpServer()).get('/health/ready').expect(503);
    expect(res.body.status).toBe('unready');
    expect(res.body.database).toBe('down');
    await app.close();
  });

  it('Redis پایین ولی DB بالا ⇒ 200 (redis فقط گزارش می‌شود)', async () => {
    const app = await buildApp(true, false);
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.redis).toBe('down');
    await app.close();
  });
});

describe('خلاصهٔ /api/v1/health (سازگاری)', () => {
  it('DB پایین ⇒ 200 با status=degraded و database=down', async () => {
    const app = await buildApp(false, true);
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('degraded');
    expect(res.body.database).toBe('down');
    await app.close();
  });

  it('DB بالا ⇒ 200 با status=ok', async () => {
    const app = await buildApp(true, true);
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('up');
    await app.close();
  });
});
