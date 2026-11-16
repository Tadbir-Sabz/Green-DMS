import { describe, expect, it } from 'vitest';
import { BadRequestException, type ExecutionContext } from '@nestjs/common';
import type { Pool } from 'pg';
import {
  SkuImmutableGuard,
  SKU_IMMUTABLE,
} from '../src/modules/master-data/sku-immutable.guard';
import type { AuditEntry, AuditService } from '../src/common/audit.service';

/**
 * REVIEW-01 / LOW-1 + LOW-2 — گاردِ تغییرناپذیریِ SKU با pool/auditِ فیک:
 *   ۱) ثبتِ ممیزیِ sku_change_rejected با بازیگریِ سرور؛
 *   ۲) نبودِ UUIDِ کالا و req.path در کلِ payloadِ ممیزی؛
 *   ۳) پایداری و عمومیِ سطح (PATCH /products/:id)؛
 *   ۴) حفظِ رد با وجودِ شکستِ ممیزی + نبودِ ادعای تصمیم‌ی مالک (owner_decisions).
 */

const PRODUCT_UUID = '11111111-2222-4333-8444-555555555555';

const makeFakes = (auditImpl?: (entry: AuditEntry) => Promise<void>) => {
  const queries: { sql: string; params: unknown[] }[] = [];
  const client = {
    query: async (sql: string, params?: unknown[]) => {
      queries.push({ sql: sql.trim(), params: params ?? [] });
      return { rows: [], rowCount: 0 };
    },
    release: () => undefined,
  };
  const pool = { connect: async () => client } as unknown as Pool;
  const entries: AuditEntry[] = [];
  // AuditService is a class with more surface than needed here; a structural
  // partial is enough for this guard and is injected via the DI token type.
  const audit = {
    record: async () => undefined,
    recordRequired: async (entry: AuditEntry) => {
      if (auditImpl) return auditImpl(entry);
      entries.push(entry);
    },
  } as unknown as AuditService;
  const guard = new SkuImmutableGuard(audit, pool);
  return { guard, entries, queries };
};

const ctxOf = (body: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        body,
        method: 'PATCH',
        path: `/api/v1/products/${PRODUCT_UUID}`,
        url: `/api/v1/products/${PRODUCT_UUID}`,
        ip: '203.0.113.7',
        headers: { 'user-agent': 'vitest-agent' },
        auth: { companyId: 'company-1', userId: 'user-1' },
      }),
    }),
  }) as unknown as ExecutionContext;

describe('SkuImmutableGuard — REVIEW-01', () => {
  it('بدنهٔ بدونِ کلیدِ code ⇒ عبور (true) و بدونِ ممیزی/کوئری', async () => {
    const { guard, entries, queries } = makeFakes();
    await expect(guard.canActivate(ctxOf({ name: 'نام', row_version: 3 }))).resolves.toBe(true);
    expect(entries).toHaveLength(0);
    expect(queries).toHaveLength(0);
  });

  it('بدنهٔ حاوی code ⇒ ردِ 400 code_immutable + ثبتِ sku_change_rejected با actor', async () => {
    const { guard, entries } = makeFakes();
    let err: unknown;
    try {
      await guard.canActivate(ctxOf({ code: 'SKU-NEW-1', name: 'x' }));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(BadRequestException);
    const res = (err as BadRequestException).getResponse() as Record<string, unknown>;
    expect(res.code).toBe(SKU_IMMUTABLE);
    expect((res.details as Record<string, unknown>).surface).toBe('PATCH /products/:id');

    expect(entries).toHaveLength(1);
    const e = entries[0];
    expect(e.action).toBe('sku_change_rejected');
    expect(e.entityType).toBe('product_catalog');
    expect(e.actorUserId).toBe('user-1'); // بازیگریِ سروری — هرگز از بدنه
    expect(e.companyId).toBe('company-1');
    expect(e.ip).toBe('203.0.113.7');
    expect(e.userAgent).toBe('vitest-agent');
    const after = e.after as Record<string, unknown>;
    expect(after.code).toBe('code_immutable');
    expect(after.fields).toEqual(['code']);
    expect(after.surface).toBe('PATCH /products/:id');
  });

  it('ممیزی هیچ UUID/مسیرِ خام/شناسهٔ مالک نمی‌گیرد (LOW-1 + LOW-2)', async () => {
    const { guard, entries } = makeFakes();
    await expect(guard.canActivate(ctxOf({ code: 'SKU-SECRET-9' }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const raw = JSON.stringify(entries[0]);
    expect(raw).not.toContain(PRODUCT_UUID); // UUIDِ کالا در ممیزی نیست
    expect(raw).not.toContain('/api/v1/products/'); // req.path/url خام نیست
    expect(raw).not.toContain('SKU-SECRET-9'); // مقدارِ ارسالیِ SKU نیست
    expect(entries[0]).not.toHaveProperty('entityId');
    expect(entries[0].after).not.toHaveProperty('owner_decisions'); // هیچ تصمیم‌ی مالک ادعا نمی‌شود
    expect(raw).not.toContain('D-C14-I03-F01');
  });

  it('شکستِ ممیزی رد را لغو نمی‌کند — همچنان 400 code_immutable', async () => {
    const { guard } = makeFakes(async () => {
      throw new Error('audit unavailable');
    });
    let err: unknown;
    try {
      await guard.canActivate(ctxOf({ code: 'SKU-X' }));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(BadRequestException);
    expect(((err as BadRequestException).getResponse() as Record<string, unknown>).code).toBe(
      SKU_IMMUTABLE,
    );
  });

  it('کلیدِ codeِ تودرتو توکِن نیست — مجاز است (محافظت در لایهٔ whitelist/UPDATABLE)', async () => {
    const { guard, entries } = makeFakes();
    await expect(
      guard.canActivate(ctxOf({ name: 'کالا', nested: { code: 'SKU-NESTED' } })),
    ).resolves.toBe(true);
    expect(entries).toHaveLength(0);
  });

  it('بدنهٔ آرایه‌ای/غیرِ شیء عبور می‌کند', async () => {
    const { guard } = makeFakes();
    await expect(guard.canActivate(ctxOf([{ code: 'x' }]))).resolves.toBe(true);
    await expect(guard.canActivate(ctxOf('code=1'))).resolves.toBe(true);
  });

  it('set_config شرکت و بازیگر در همان تراکنش ست می‌شود (RLS)', async () => {
    const { guard, queries } = makeFakes();
    await expect(guard.canActivate(ctxOf({ code: 'SKU-RLS' }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const setCfg = queries.find((q) => q.sql.includes('set_config'));
    expect(setCfg?.params).toEqual(['company-1', 'user-1']);
    expect(queries[0].sql).toBe('begin');
    expect(queries.some((q) => q.sql === 'commit')).toBe(true);
  });
});
