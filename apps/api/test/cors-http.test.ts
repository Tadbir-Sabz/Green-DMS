import { Controller, Get, Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { corsOptionsFor } from '../src/common/origin-policy';

/**
 * TASK-19 — Phase 2C: رگرسیونِ CORS روی همان سیم‌کشیِ main.ts (corsOptionsFor).
 * خواسته: خاستگاهِ مجاز ⇒ هدرهای CORS با credentials؛ خاستگاهِ ردشده ⇒ **بدونِ**
 * بازتابِ Access-Control-Allow-Origin (reflected origin با credentials ممنوع).
 */

@Controller('probe')
class ProbeController {
  @Get()
  ok() {
    return { ok: true };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

const ALLOWED = 'https://app.example.com';

async function buildApp(env: NodeJS.ProcessEnv): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
  const app = moduleRef.createNestApplication({ logger: false });
  app.enableCors(corsOptionsFor(env));
  await app.init();
  return app;
}

describe('CORS (سیم‌کشیِ واقعیِ main.ts)', () => {
  let app: INestApplication;
  const http = () => app.getHttpServer();

  beforeAll(async () => {
    app = await buildApp({ NODE_ENV: 'production', ALLOWED_ORIGINS: ALLOWED });
  });
  afterAll(async () => {
    await app.close();
  });

  it('خاستگاهِ مجاز ⇒ ACAO همان origin + credentials + Vary', async () => {
    const res = await request(http()).get('/probe').set('Origin', ALLOWED).expect(200);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(String(res.headers.vary ?? '')).toMatch(/Origin/i);
  });

  it('خاستگاهِ ردشده ⇒ هیچ بازتابِ ACAO نیست (reflected origin ممنوع)', async () => {
    const res = await request(http())
      .get('/probe')
      .set('Origin', 'https://evil.example.com')
      .expect(200);
    // خاصیتِ امنیتیِ واقعی: خاستگاهِ مهاجم هرگز در ACAO بازتاب نمی‌شود و مرورگر
    // بدونِ تطابقِ ACAO با Origin درخواست، پاسخ را در اختیارِ صفحهٔ مهاجم نمی‌گذارد.
    // (هدرِ ACAC به‌تنهایی — بدونِ ACAO مطابق — طبقِ fetch spec هیچ امتیازی نمی‌دهد.)
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example.com');
  });

  it('پیش‌فرضِ خطرناکِ قبلی (origin: true) دیگر برنمی‌گردد', async () => {
    const res = await request(http()).get('/probe').set('Origin', 'https://attacker.example').expect(200);
    // با origin:true مقدارِ ACAO دقیقاً 'https://attacker.example' بود؛ اکنون نباید باشد.
    expect(res.headers['access-control-allow-origin']).not.toBe('https://attacker.example');
  });

  it('بدونِ Origin (کلاینتِ غیرِمرورگر) ⇒ پاسخ عادی بدونِ هدرِ CORS', async () => {
    const res = await request(http()).get('/probe').expect(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('CORS در production بدونِ پیکربندی', () => {
  it('ساختِ برنامه fail-closed است (resolveCorsOrigins می‌اندازد)', async () => {
    await expect(buildApp({ NODE_ENV: 'production' })).rejects.toThrow(/ALLOWED_ORIGINS/);
  });
});
