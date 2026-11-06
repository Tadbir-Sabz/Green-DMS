import { afterEach, describe, expect, it } from 'vitest';
import nextConfig from '../next.config.mjs';

/**
 * TASK-19 — قراردادِ پروکسیِ هم‌مبدأ: Next این rewriteها را در زمانِ build می‌پزد
 * (routes-manifest)؛ پس API_PROXY_TARGET باید هنگامِ build در دسترس باشد
 * (build-arg ایمیجِ وب). این تست همان تابعی را می‌سنجد که build ارزیابی می‌کند.
 */

const ORIGINAL = process.env.API_PROXY_TARGET;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.API_PROXY_TARGET;
  else process.env.API_PROXY_TARGET = ORIGINAL;
});

/** خروجیِ rewrites می‌تواند آرایه یا شیءِ beforeFiles/afterFiles/fallback باشد */
const flatRewrites = async (): Promise<Array<{ source: string; destination: string }>> => {
  const result = await nextConfig.rewrites?.();
  if (Array.isArray(result)) return result;
  return result?.afterFiles ?? [];
};

describe('next.config rewrites (build-time proxy contract)', () => {
  it('مقصدِ پروکسی از API_PROXY_TARGET خوانده می‌شود', async () => {
    process.env.API_PROXY_TARGET = 'http://api:4000';
    const rewrites = await flatRewrites();
    expect(rewrites).toEqual([
      { source: '/api/:path*', destination: 'http://api:4000/api/:path*' },
    ]);
  });

  it('بدونِ env به پیش‌فرضِ توسعهٔ محلی برمی‌گردد', async () => {
    delete process.env.API_PROXY_TARGET;
    const rewrites = await flatRewrites();
    expect(rewrites[0]?.destination).toBe('http://127.0.0.1:4000/api/:path*');
  });
});
