/**
 * TASK-PM-02-C6 — واحد: کاتالوگ روابط، اعتبارسنجی سخت، و مرزهای مصوب.
 * DB-free؛ فقط منطق خالصِ قواعد و پارس/رد فیلدها.
 */
import { describe, expect, it } from 'vitest';
import {
  PRODUCT_RELATION_CREATE_FIELDS,
  PRODUCT_RELATION_FORBIDDEN_CLIENT_FIELDS,
  PRODUCT_RELATION_GRAPH_MAX_DEPTH,
  PRODUCT_RELATION_KINDS,
  PRODUCT_RELATION_KIND_SPECS,
  PRODUCT_RELATION_LIST_MAX,
  PRODUCT_RELATION_OWNER_DECISIONS_FA,
  PRODUCT_RELATION_PRIORITY_MAX,
  PRODUCT_RELATION_PRIORITY_MIN,
  findProductRelationForbiddenFields,
  findProductRelationKind,
  isProductRelationKind,
  productRelationStatusWarningFa,
} from '../src/modules/master-data/product-relations.rules';

describe('C6 relationship catalog', () => {
  it('exposes exactly the two kinds approved by migration 0046', () => {
    expect([...PRODUCT_RELATION_KINDS]).toEqual(['substitute', 'complement']);
    expect(PRODUCT_RELATION_KIND_SPECS.map((k) => k.kind)).toEqual(['substitute', 'complement']);
    // The DB enum is the ceiling: C6 must not add a third kind.
    expect(PRODUCT_RELATION_KIND_SPECS.filter((k) => k.support === 'IMPLEMENTABLE')).toHaveLength(2);
  });

  it('keeps every kind directed and catalog-only (no operational effect)', () => {
    for (const spec of PRODUCT_RELATION_KIND_SPECS) {
      expect(spec.direction).toBe('directed');
      expect(spec.enum_constrained).toBe(true);
      expect(spec.operational_effect_fa).toMatch(/هیچ/);
      expect(spec.evidence.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('documents the cycle policy as established, not invented', () => {
    expect(findProductRelationKind('substitute')?.cycle_policy).toBe('rejected_by_existing_rule');
    expect(findProductRelationKind('complement')?.cycle_policy).toBe('no_approved_rule');
    expect(findProductRelationKind('bundle')).toBeUndefined();
    expect(findProductRelationKind('successor')).toBeUndefined();
  });

  it('recognizes only server-known kinds', () => {
    expect(isProductRelationKind('substitute')).toBe(true);
    expect(isProductRelationKind('complement')).toBe(true);
    expect(isProductRelationKind('SUBSTITUTE')).toBe(false);
    expect(isProductRelationKind('')).toBe(false);
    expect(isProductRelationKind(null)).toBe(false);
    expect(isProductRelationKind(42)).toBe(false);
  });
});

describe('C6 client payload boundaries', () => {
  it('rejects tenant/identity/permission/audit/domain fields explicitly', () => {
    const fields = findProductRelationForbiddenFields({
      related_id: 'x',
      company_id: 'evil',
      actor_user_id: 'evil',
      permission_code: 'master.product.update',
      after_data: {},
      domain_id: 'd1',
      reciprocal: true,
      'x-domain-id': 'd1',
    });
    expect(fields).toEqual([
      'actor_user_id', 'after_data', 'company_id', 'domain_id', 'permission_code', 'reciprocal', 'x-domain-id',
    ]);
  });

  it('does not treat ordinary payload keys as forbidden', () => {
    expect(findProductRelationForbiddenFields({ related_id: 'a', kind: 'substitute', priority: 5 })).toEqual([]);
    expect(findProductRelationForbiddenFields(null)).toEqual([]);
    expect(findProductRelationForbiddenFields(['company_id'])).toEqual([]);
  });

  it('publishes a narrow allowlist and safe numeric bounds', () => {
    expect([...PRODUCT_RELATION_CREATE_FIELDS]).toEqual(['related_id', 'kind', 'priority', 'confirm_add']);
    expect(PRODUCT_RELATION_FORBIDDEN_CLIENT_FIELDS).not.toContain('related_id');
    expect(PRODUCT_RELATION_PRIORITY_MIN).toBe(0);
    expect(PRODUCT_RELATION_PRIORITY_MAX).toBe(32767);
    expect(PRODUCT_RELATION_LIST_MAX).toBe(200);
    expect(PRODUCT_RELATION_GRAPH_MAX_DEPTH).toBe(3);
  });
});

describe('C6 non-active related products', () => {
  it('warns without blocking, because no approved policy blocks it', () => {
    expect(productRelationStatusWarningFa('active')).toBeNull();
    expect(productRelationStatusWarningFa('blocked')).toContain('مسدود');
    expect(productRelationStatusWarningFa('discontinued')).toContain('متوقف');
    expect(productRelationStatusWarningFa('archived')).toBeNull();
  });
});

describe('C6 owner decision register', () => {
  it('keeps every unresolved semantic out of the implementation', () => {
    const ids = PRODUCT_RELATION_OWNER_DECISIONS_FA.map((d) => d.id);
    expect(ids).toEqual(['C6-D1', 'C6-D2', 'C6-D3', 'C6-D4', 'C6-D5', 'C6-D6']);
    expect(PRODUCT_RELATION_OWNER_DECISIONS_FA.filter((d) => d.status === 'BLOCKED')).toHaveLength(2);
    expect(PRODUCT_RELATION_OWNER_DECISIONS_FA.every((d) => d.detail_fa.length > 20)).toBe(true);
  });
});
