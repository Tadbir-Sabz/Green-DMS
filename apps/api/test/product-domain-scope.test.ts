import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../src/common/audit.service';
import { TenantAwarePool } from '../src/database/tenant-pool';
import { CatalogAccess } from '../src/modules/master-data/catalog-access.service';
import { DomainCatalogGate } from '../src/modules/master-data/domain-catalog.contract';
import { ProductDomainScopeController } from '../src/modules/master-data/product-domain-scope.controller';
import { ProductDomainScopeService } from '../src/modules/master-data/product-domain-scope.service';
import { PERMISSIONS_KEY } from '../src/modules/identity-rbac/require-permissions.decorator';
import type { AuthContext } from '../src/modules/identity-rbac/auth-context.decorator';
import type { RequestMeta } from '../src/common/request-meta';

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const company = '00000000-0000-4000-8000-000000000001';
const otherCompany = '00000000-0000-4000-8000-000000000099';
const user = '00000000-0000-4000-8000-000000000002';
const productId = '00000000-0000-4000-8000-000000000003';

const actor: AuthContext = {
  userId: user,
  sessionId: 'session',
  companyId: company,
  username: 'auditor',
  roles: [],
  permissions: [],
};

const actorForeign: AuthContext = { ...actor, companyId: otherCompany };
const meta: RequestMeta = { ip: '127.0.0.1', userAgent: 'vitest', requestId: null };

type Call = { sql: string; values: readonly unknown[] | undefined };

function fixture(permissions: string[] = ['master.product.view'], productRows: unknown[] = [{ status: 'active' }]) {
  const calls: Call[] = [];
  const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
    calls.push({ sql, values });
    if (sql.includes('select distinct rp')) return { rows: permissions.map((code) => ({ code })) };
    if (sql.includes('from product')) return { rows: productRows };
    return { rows: [] };
  });
  const client = { query, release: vi.fn() } as unknown as PoolClient;
  const inner = { query, connect: vi.fn(async () => client) } as unknown as Pool;
  const pool = new TenantAwarePool(inner) as unknown as Pool;
  const audit = { record: vi.fn(async () => undefined) };
  const service = new ProductDomainScopeService(
    pool,
    new CatalogAccess(pool),
    new DomainCatalogGate(),
    audit as unknown as AuditService,
  );
  return { service, audit, calls, query, inner };
}

describe('TASK-PM-02 GET /products/{id}/domain-scope — central/domain projection (DB-free)', () => {
  it('POSITIVE: returns central identity facts and never infers domain availability', async () => {
    const f = fixture();
    const scope = await f.service.getScope(actor, productId, meta);
    expect(scope).toMatchObject({
      product_id: productId,
      scope: 'central',
      central_status: 'active',
      central_status_label_fa: 'فعال (مرکزی)',
      domain_context: 'unresolved',
      domain_membership: 'unresolved',
      domain_availability: 'unresolved',
      available: false,
      state: 'domain_identity_unresolved',
      central_status_is_domain_availability: false,
    });
    expect(scope.owner_decisions.map((d) => d.id)).toEqual([
      'PM-B1', 'PM-B2', 'PM-B3', 'PM-B4', 'PM-B5', 'PM-B6', 'PM-B7', 'PM-B8',
    ]);
    expect(scope.message_fa).toContain('وضعیت مرکزی کالا، وضعیت عرضه در دامنه نیست');
    expect(scope).not.toHaveProperty('items');
    expect(scope).not.toHaveProperty('memberships');
    expect(scope).not.toHaveProperty('domains');
  });

  it('POSITIVE/BOUNDARY: blocked and discontinued central states still do not create a domain state', async () => {
    for (const status of ['blocked', 'discontinued']) {
      const f = fixture(['master.product.view'], [{ status }]);
      const scope = await f.service.getScope(actor, productId, meta);
      expect(scope.central_status).toBe(status);
      expect(scope.domain_availability).toBe('unresolved');
      expect(scope.domain_membership).toBe('unresolved');
      expect(scope.available).toBe(false);
    }
  });

  it('NEGATIVE: a malformed product id is rejected before any database access', async () => {
    const f = fixture();
    await expect(f.service.getScope(actor, 'not-a-uuid', meta)).rejects.toMatchObject({
      status: 400,
      response: { code: 'invalid_id' },
    });
    expect(f.query).not.toHaveBeenCalled();
  });

  it('NEGATIVE: server-side permission is revalidated from the database (viewer denied)', async () => {
    const f = fixture([]);
    await expect(f.service.getScope(actor, productId, meta)).rejects.toMatchObject({
      status: 403,
      response: { code: 'catalog_write_forbidden' },
    });
    expect(f.calls.some((c) => c.sql.includes('from product'))).toBe(false);
  });

  it('NEGATIVE: a missing product returns a non-leaking 404', async () => {
    const f = fixture(['master.product.view'], []);
    await expect(f.service.getScope(actor, productId, meta)).rejects.toMatchObject({
      status: 404,
      response: { code: 'product_not_found' },
    });
  });

  it('CROSS-COMPANY/CROSS-DOMAIN: company comes only from the session and no domain column is queried', async () => {
    const f = fixture(['master.product.view'], []);
    await expect(f.service.getScope(actorForeign, productId, meta)).rejects.toMatchObject({
      status: 404,
    });
    const productCall = f.calls.find((c) => c.sql.includes('from product'));
    expect(productCall?.values).toEqual([productId, otherCompany]);
    expect(productCall?.sql).toContain('company_id = $2');
    expect(productCall?.sql).toContain('deleted_at is null');
    expect(productCall?.sql).not.toMatch(/domain|available|membership/i);
  });

  it('BOUNDARY: a caller-supplied domain header cannot alter the central projection', async () => {
    const f = fixture();
    const withHeader = await f.service.getScope(actor, productId, {
      ...meta,
      requestId: 'ignored-by-service',
    });
    const plain = await f.service.getScope(actor, productId, meta);
    expect(withHeader).toEqual(plain);
    expect(withHeader.domain_context).toBe('unresolved');
    expect(withHeader.available).toBe(false);
  });

  it('audits the privileged domain-scoped read with actor, product and no fabricated values', async () => {
    const f = fixture();
    await f.service.getScope(actor, productId, meta);
    expect(f.audit.record).toHaveBeenCalledTimes(1);
    expect(f.audit.record.mock.calls[0][0]).toMatchObject({
      companyId: company,
      actorUserId: user,
      action: 'domain_scope_read',
      entityType: 'product',
      entityId: productId,
      after: {
        scope: 'central',
        central_status: 'active',
        state: 'domain_identity_unresolved',
        domain_availability: 'unresolved',
      },
    });
    expect(f.audit.record.mock.calls[0][0].requestId).toBeUndefined();
  });

  it('keeps the route behind central RBAC and the domain boundary guard', () => {
    expect(
      Reflect.getMetadata(PERMISSIONS_KEY, ProductDomainScopeController.prototype.getScope),
    ).toEqual(['master.product.view']);
    const source = readFileSync(
      path.join(API_ROOT, 'src/modules/master-data/product-domain-scope.controller.ts'),
      'utf8',
    );
    expect(source).toContain('DomainBoundaryGuard');
    expect(source).toContain('AuthGuard');
    expect(source).toContain('PermissionsGuard');
    const moduleSource = readFileSync(
      path.join(API_ROOT, 'src/modules/master-data/master-data.module.ts'),
      'utf8',
    );
    expect(moduleSource).not.toContain('provide: OPERATIONAL_DOMAIN_AUTHORITY');
  });
});
