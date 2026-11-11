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
});
