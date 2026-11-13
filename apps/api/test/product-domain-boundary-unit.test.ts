import { describe, expect, it } from 'vitest';
import {
  DOMAIN_CONTEXT_NOT_SUPPORTED,
  DOMAIN_PROPERTY_REJECTED,
  domainBoundaryError,
  findDomainOwnedCsvHeaders,
  findDomainOwnedKeys,
  isDomainOwnedToken,
  normalizeDomainToken,
} from '../src/modules/master-data/product-domain-boundary';

/**
 * TASK-PM-02 — مرز مرکزی/دامنهای: واحدِ خالص، بدون DB/Redis/HTTP.
 * مثبت · منفی · مرز · چنددامنهای (cross-domain).
 */
describe('TASK-PM-02 central/domain boundary — pure contract (DB-free)', () => {
  it('normalizes English, camelCase and Persian variants deterministically', () => {
    expect(normalizeDomainToken('domain_id')).toBe('domain_id');
    expect(normalizeDomainToken('DomainID')).toBe('domain_id');
    expect(normalizeDomainToken('  Domain-Status ')).toBe('domain_status');
    expect(normalizeDomainToken('\uFEFFوضعیت عرضه')).toBe('وضعیت_عرضه');
    expect(normalizeDomainToken('دسترس\u200cپذیری')).toBe('دسترسپذیری');
    expect(normalizeDomainToken('domainId')).toBe('domain_id');
    expect(normalizeDomainToken('x-domain-id')).toBe('x_domain_id');
  });

  it('POSITIVE: ordinary central product payloads contain no domain-owned key', () => {
    const create = {
      name: 'شیر پرچرب',
      code: 'SKU-1001',
      name_latin: 'Milk',
      category_id: '00000000-0000-4000-8000-000000000001',
      base_uom_id: '00000000-0000-4000-8000-000000000002',
      distribution_kind: 'cold',
      min_order_qty: 1,
    };
    expect(findDomainOwnedKeys(create).fields).toEqual([]);
    expect(findDomainOwnedKeys({ csv: 'code,name,category_code\nSKU-1,شیر,DAIRY' }).fields).toEqual([]);
    expect(findDomainOwnedKeys({ q: 'دامنه', status: 'active', limit: 50 }).fields).toEqual([]);
  });

  it('NEGATIVE: rejects identity, membership, lifecycle and availability keys', () => {
    const forbidden = [
      'domain', 'domain_id', 'DomainID', 'domainId', 'operational_domain_id',
      'domain_status', 'domain_membership', 'membership_status',
      'domain_availability', 'available_in_domain', 'is_available',
      'active_in_domain', 'domain_activation', 'domain_authority',
      'x-domain-id', 'دامنه', 'کد دامنه', 'وضعیت دامنه', 'عضویت دامنه',
      'وضعیت عرضه', 'قابل عرضه', 'فعال در دامنه', 'دسترس پذیری',
    ];
    for (const key of forbidden) {
      expect(isDomainOwnedToken(key), `key ${key} must be rejected`).toBe(true);
    }
    expect(findDomainOwnedKeys({ domain_id: 'x', name: 'شیر' }).fields).toEqual(['domain_id']);
    expect(findDomainOwnedKeys({ domain_status: 'active' }).fields).toEqual(['domain_status']);
  });

  it('BOUNDARY: scans nested objects and arrays but never scans values', () => {
    const nested = {
      name: 'شیر دامنهدار', // فقط مقدار؛ نباید رد شود
      attributes: [{ def_id: 'a', values: { domain_availability: true } }],
      changes: { domain_id: 'd1', available: true },
      note: 'عرضه در دامنه', // مقدار متنی
    };
    expect(findDomainOwnedKeys(nested).fields).toEqual([
      'available', 'domain_availability', 'domain_id',
    ]);
    expect(findDomainOwnedKeys({ a: { b: { c: { d: { e: { domain_id: 'x' } } } } } }).bounded).toBe(true);
    expect(findDomainOwnedKeys(Array.from({ length: 120 }, (_, i) => ({ [`k${i}`]: i }))).bounded).toBe(true);
    expect(findDomainOwnedKeys({ __proto__: { domain_id: 'x' }, name: 'a' }).fields).toEqual([]);
  });

  it('BOUNDARY: CSV inspects only the header row, with BOM, quotes and Persian headers', () => {
    expect(findDomainOwnedCsvHeaders('code,name,category_code\nSKU-1,شیر,DAIRY').fields).toEqual([]);
    expect(findDomainOwnedCsvHeaders('\uFEFFcode,domain_id,name\nSKU-1,d1,شیر').fields).toEqual(['domain_id']);
    expect(findDomainOwnedCsvHeaders('"code","دامنه","name"\nSKU-1,A,شیر').fields).toEqual(['دامنه']);
    expect(findDomainOwnedCsvHeaders('code,"وضعیت عرضه"\nSKU-1,فعال').fields).toEqual(['وضعیت عرضه']);
    // واژهٔ «دامنه» در سلول داده مجاز است؛ فقط سرستون بررسی میشود.
    expect(findDomainOwnedCsvHeaders('code,name\nSKU-1,شیر دامنه').fields).toEqual([]);
    expect(findDomainOwnedCsvHeaders('').fields).toEqual([]);
    expect(findDomainOwnedCsvHeaders('code,domain_availability\n').fields).toEqual([
      'domain_availability',
    ]);
    const huge = 'code,name\n' + 'x'.repeat(1024 * 1024 + 10);
    expect(findDomainOwnedCsvHeaders(huge).bounded).toBe(true);
  });

  it('CROSS-DOMAIN: several domain properties are reported once, sorted and bounded', () => {
    const result = findDomainOwnedKeys({
      domain_id: 'A',
      domain_status: 'active',
      nested: { available_in_domain: true, domain_id: 'B' },
      'عضویت دامنه': 'available',
    });
    expect(result.fields).toEqual([
      'available_in_domain', 'domain_id', 'domain_status', 'عضویت دامنه',
    ]);
    expect(new Set(result.fields).size).toBe(result.fields.length);
  });

  it('produces one stable Persian error envelope for every central surface', () => {
    const err = domainBoundaryError({
      code: DOMAIN_PROPERTY_REJECTED,
      surface: 'POST /api/v1/products',
      fields: ['domain_id'],
      source: 'body',
    });
    expect(err.getStatus()).toBe(400);
    expect(err.getResponse()).toMatchObject({
      code: DOMAIN_PROPERTY_REJECTED,
      details: {
        surface: 'POST /api/v1/products',
        source: 'body',
        fields: ['domain_id'],
        owner_decisions: ['PM-B1', 'PM-B2', 'PM-B4', 'PM-B5'],
      },
    });
    const headerErr = domainBoundaryError({
      code: DOMAIN_CONTEXT_NOT_SUPPORTED,
      surface: 'GET /api/v1/products/{id}/domain-scope',
      fields: [],
      source: 'x-domain-id',
    });
    expect(headerErr.getResponse()).toMatchObject({
      code: DOMAIN_CONTEXT_NOT_SUPPORTED,
      details: { source: 'x-domain-id', fields: [] },
    });
    expect((headerErr.getResponse() as { message_fa: string }).message_fa).toContain(
      'فعال مرکزی',
    );
  });
});
