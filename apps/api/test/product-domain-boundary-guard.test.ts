import 'reflect-metadata';
import type { ExecutionContext } from '@nestjs/common';
import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../src/common/audit.service';
import { DomainBoundaryGuard } from '../src/modules/master-data/domain-boundary.guard';
import {
  DOMAIN_CONTEXT_NOT_SUPPORTED,
  DOMAIN_PROPERTY_REJECTED,
} from '../src/modules/master-data/product-domain-boundary';

const context = (request: Record<string, unknown>): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

const request = (overrides: Record<string, unknown> = {}) => ({
  method: 'POST',
  path: '/api/v1/products',
  headers: { 'user-agent': 'vitest' },
  body: { name: 'شیر', code: 'SKU-1' },
  query: {},
  ip: '127.0.0.1',
  auth: {
    userId: '00000000-0000-4000-8000-000000000002',
    companyId: '00000000-0000-4000-8000-000000000001',
    sessionId: 's',
    username: 'operator',
    roles: [],
    permissions: [],
  },
  ...overrides,
});

let audit: { recordRequired: ReturnType<typeof vi.fn> };
let client: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };
let guard: DomainBoundaryGuard;

beforeEach(() => {
  audit = { recordRequired: vi.fn(async () => undefined) };
  client = { query: vi.fn(async () => ({ rows: [] })), release: vi.fn() };
  const pool = { connect: vi.fn(async () => client) } as unknown as Pool;
  guard = new DomainBoundaryGuard(audit as unknown as AuditService, pool);
});

describe('TASK-PM-02 DomainBoundaryGuard — server-side enforcement (DB-free)', () => {
  it('POSITIVE: a central product write passes untouched and writes no audit', async () => {
    const req = request();
    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(audit.recordRequired).not.toHaveBeenCalled();
    expect(client.query).not.toHaveBeenCalled();
    expect(req.body).toEqual({ name: 'شیر', code: 'SKU-1' });
  });

  it('NEGATIVE: a body domain property is rejected before any DTO whitelist stripping', async () => {
    const req = request({ body: { name: 'شیر', domain_id: 'd1' } });
    await expect(guard.canActivate(context(req))).rejects.toMatchObject({
      status: 400,
      response: {
        code: DOMAIN_PROPERTY_REJECTED,
        details: { source: 'body', fields: ['domain_id'] },
      },
    });
    expect(audit.recordRequired).toHaveBeenCalledTimes(1);
    const [entry, runnerClient] = audit.recordRequired.mock.calls[0];
    expect(entry).toMatchObject({
      action: 'domain_boundary_rejected',
      entityType: 'product_catalog',
      actorUserId: '00000000-0000-4000-8000-000000000002',
      companyId: '00000000-0000-4000-8000-000000000001',
    });
    // مقادیر دامنهای/کلاینت در ممیزی ذخیره نمیشوند؛ فقط نام فیلدها.
    expect(JSON.stringify(entry.after)).not.toContain('d1');
    expect(entry.after.fields).toEqual(['domain_id']);
    expect(entry.requestId).toBeUndefined();
    expect(runnerClient).toBe(client);
    // GUCهای شرکت/کاربر پیش از نوشتن ممیزی، transaction-local ست شدهاند.
    expect(client.query.mock.calls[1][0]).toContain("set_config('app.company_id'");
    expect(client.query.mock.calls[1][1]).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ]);
  });

  it('NEGATIVE: a CSV header with a Persian domain column is rejected at import validate', async () => {
    const req = request({
      path: '/api/v1/products/import/validate',
      body: { csv: 'code,name,"دامنه"\nSKU-1,شیر,A' },
    });
    await expect(guard.canActivate(context(req))).rejects.toMatchObject({
      status: 400,
      response: {
        code: DOMAIN_PROPERTY_REJECTED,
        details: { source: 'csv_header', fields: ['دامنه'] },
      },
    });
  });

  it('NEGATIVE: a domain query property is rejected with a stable source label', async () => {
    const req = request({ method: 'PATCH', path: '/api/v1/products/p1', query: { domainId: 'A' } });
    await expect(guard.canActivate(context(req))).rejects.toMatchObject({
      status: 400,
      response: {
        code: DOMAIN_PROPERTY_REJECTED,
        details: { source: 'query', fields: ['domainId'] },
      },
    });
  });

  it('NEGATIVE: x-domain-id never turns a central operation into a domain-scoped one', async () => {
    const req = request({
      method: 'GET',
      path: '/api/v1/products/p1/domain-scope',
      headers: { 'x-domain-id': '00000000-0000-4000-8000-000000000011', 'user-agent': 'vitest' },
      query: {},
      body: undefined,
    });
    await expect(guard.canActivate(context(req))).rejects.toMatchObject({
      status: 400,
      response: {
        code: DOMAIN_CONTEXT_NOT_SUPPORTED,
        details: { source: 'x-domain-id', fields: [] },
      },
    });
    expect(audit.recordRequired.mock.calls[0][0].after.domain_header_present).toBe(true);
  });

  it('BOUNDARY: a data cell containing «دامنه» is allowed; only header keys matter', async () => {
    const req = request({
      path: '/api/v1/products/import/validate',
      body: { csv: 'code,name\nSKU-1,شیر دامنهدار' },
    });
    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(audit.recordRequired).not.toHaveBeenCalled();
  });

  it('CROSS-DOMAIN: nested multi-domain fields are deduplicated and fail closed even if audit fails', async () => {
    audit.recordRequired.mockRejectedValueOnce(new Error('audit unavailable'));
    const req = request({
      body: {
        name: 'شیر',
        domain_id: 'A',
        changes: { domain_status: 'active', domain_id: 'B' },
        'وضعیت عرضه': 'فعال',
      },
      headers: { 'x-domain-id': 'A' },
    });
    await expect(guard.canActivate(context(req))).rejects.toMatchObject({
      status: 400,
      response: {
        code: DOMAIN_PROPERTY_REJECTED,
        details: { fields: ['domain_id', 'domain_status', 'وضعیت عرضه'] },
      },
    });
    expect(audit.recordRequired).toHaveBeenCalledTimes(1);
    expect(client.query.mock.calls.some((c) => String(c[0]).toLowerCase().includes('rollback'))).toBe(true);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it('BOUNDARY: an undefined body/query is safe', async () => {
    const req = request({ body: undefined, query: undefined, headers: {} });
    await expect(guard.canActivate(context(req))).resolves.toBe(true);
  });

  // TASK-PM-02-B2 — central READ surfaces carry the very same guard. The global
  // ValidationPipe uses `whitelist: true`, so a domain-owned query key sent to a
  // read would otherwise be silently stripped and an unchanged CENTRAL page/CSV
  // would be returned to a caller that believed it asked for domain-scoped data.
  describe('TASK-PM-02-B2 central read/export/report parity (DB-free)', () => {
    const read = (overrides: Record<string, unknown> = {}) =>
      request({
        method: 'GET',
        path: '/api/v1/products',
        body: undefined,
        query: { sort: 'code_asc', q: 'شیر', status: 'active' },
        ...overrides,
      });

    it('POSITIVE: a plain central list read with legitimate query keys passes untouched', async () => {
      const req = read();
      await expect(guard.canActivate(context(req))).resolves.toBe(true);
      expect(audit.recordRequired).not.toHaveBeenCalled();
      expect(client.query).not.toHaveBeenCalled();
      expect(req.query).toEqual({ sort: 'code_asc', q: 'شیر', status: 'active' });
    });

    it('NEGATIVE: ?available=true on GET /products is rejected before whitelist stripping', async () => {
      const req = read({ query: { q: 'شیر', available: 'true' } });
      await expect(guard.canActivate(context(req))).rejects.toMatchObject({
        status: 400,
        response: {
          code: DOMAIN_PROPERTY_REJECTED,
          details: { source: 'query', fields: ['available'] },
        },
      });
      expect(audit.recordRequired).toHaveBeenCalledTimes(1);
    });

    it('NEGATIVE: a camelCase domainId query on GET /products/export is rejected', async () => {
      const req = read({
        path: '/api/v1/products/export',
        query: { q: 'شیر', domainId: 'A' },
      });
      await expect(guard.canActivate(context(req))).rejects.toMatchObject({
        status: 400,
        response: {
          code: DOMAIN_PROPERTY_REJECTED,
          details: { source: 'query', fields: ['domainId'] },
        },
      });
      expect(audit.recordRequired.mock.calls[0][0].after.surface).toBe('GET /api/v1/products/export');
    });

    it('NEGATIVE: a Persian availability query key on a product detail read is rejected', async () => {
      const req = read({
        path: '/api/v1/products/p1',
        query: { 'دسترسپذیری': 'فعال' },
      });
      await expect(guard.canActivate(context(req))).rejects.toMatchObject({
        status: 400,
        response: {
          code: DOMAIN_PROPERTY_REJECTED,
          details: { source: 'query' },
        },
      });
    });

    it('NEGATIVE: x-domain-id never scopes a central detail or import-report read', async () => {
      for (const path of ['/api/v1/products/p1', '/api/v1/products/import/report/r1']) {
        const req = read({
          path,
          query: {},
          headers: { 'x-domain-id': '00000000-0000-4000-8000-000000000011', 'user-agent': 'vitest' },
        });
        await expect(guard.canActivate(context(req))).rejects.toMatchObject({
          status: 400,
          response: {
            code: DOMAIN_CONTEXT_NOT_SUPPORTED,
            details: { source: 'x-domain-id', fields: [] },
          },
        });
      }
      expect(audit.recordRequired).toHaveBeenCalledTimes(2);
    });

    it('FAIL-CLOSED: a rejected read stays rejected even if the audit transaction fails', async () => {
      audit.recordRequired.mockRejectedValueOnce(new Error('audit unavailable'));
      const req = read({ query: { q: 'شیر', membership: 'A' } });
      await expect(guard.canActivate(context(req))).rejects.toMatchObject({
        status: 400,
        response: { code: DOMAIN_PROPERTY_REJECTED },
      });
      expect(client.query.mock.calls.some((c) => String(c[0]).toLowerCase().includes('rollback'))).toBe(true);
      expect(client.release).toHaveBeenCalledTimes(1);
    });
  });
});
