import { describe, expect, it } from 'vitest';
import {
  PRODUCT_LIFECYCLE_STATUSES,
  PRODUCT_LIFECYCLE_TRANSITIONS,
  PRODUCT_LIFECYCLE_TRANSITION_BLOCKED_CODE,
  findProductLifecycleForbiddenFields,
  findProductLifecycleTransition,
  isSupportedCentralStatusChange,
} from '../src/modules/master-data/product-lifecycle.rules';
import { assertSensitiveConfirmed } from '../src/modules/master-data/product-sensitivity';

/** DB-free policy tests: evidence-backed matrix, BLOCKED discontinued edges, D4 centralization. */
describe('TASK-PM-02-C5 central lifecycle matrix', () => {
  it('exposes exactly the existing 3x3 status matrix plus soft-delete BLOCKED rows', () => {
    expect(PRODUCT_LIFECYCLE_STATUSES).toEqual(['active', 'blocked', 'discontinued']);
    expect(PRODUCT_LIFECYCLE_TRANSITIONS).toHaveLength(12);
    expect(PRODUCT_LIFECYCLE_TRANSITIONS.filter((r) => r.supported)).toHaveLength(2);
    expect(PRODUCT_LIFECYCLE_TRANSITIONS.filter((r) => !r.supported && r.rejection_code === 'lifecycle_transition_unchanged')).toHaveLength(2);
    expect(PRODUCT_LIFECYCLE_TRANSITIONS.filter((r) => !r.supported && r.rejection_code === PRODUCT_LIFECYCLE_TRANSITION_BLOCKED_CODE)).toHaveLength(5);
    expect(PRODUCT_LIFECYCLE_TRANSITIONS.filter((r) => r.source_status === 'deleted_soft' && r.supported)).toHaveLength(0);
    for (const status of PRODUCT_LIFECYCLE_STATUSES) {
      for (const target of PRODUCT_LIFECYCLE_STATUSES) {
        const rule = findProductLifecycleTransition(status, target);
        expect(rule, `${status}→${target}`).toBeTruthy();
        expect(rule?.evidence.length).toBeGreaterThan(0);
        expect(rule?.validation_fa).toContain('row_version');
        expect(rule?.authorization_fa).toContain('master.product.status');
        expect(rule?.dependent_modules_fa.join(' ')).toContain('قیمت');
        expect(rule?.audit_fa).toContain('0060');
        expect(rule?.test_coverage_fa.length).toBeGreaterThan(0);
        if (status === 'discontinued' || target === 'discontinued') {
          expect(rule?.supported, `${status}→${target}`).toBe(false);
          expect(rule?.rejection_code, `${status}→${target}`).toBe(PRODUCT_LIFECYCLE_TRANSITION_BLOCKED_CODE);
          expect(rule?.reason_fa, `${status}→${target}`).toContain('BLOCKED');
        }
      }
    }
  });

  it('supports only evidence-backed active↔blocked; same-state, discontinued and soft-deleted are BLOCKED', () => {
    expect(isSupportedCentralStatusChange('active', 'blocked')).toBe(true);
    expect(isSupportedCentralStatusChange('blocked', 'active')).toBe(true);
    expect(isSupportedCentralStatusChange('active', 'discontinued')).toBe(false);
    expect(isSupportedCentralStatusChange('blocked', 'discontinued')).toBe(false);
    expect(isSupportedCentralStatusChange('discontinued', 'active')).toBe(false);
    expect(isSupportedCentralStatusChange('discontinued', 'blocked')).toBe(false);
    expect(isSupportedCentralStatusChange('discontinued', 'discontinued')).toBe(false);
    expect(isSupportedCentralStatusChange('active', 'active')).toBe(false);
    expect(isSupportedCentralStatusChange('blocked', 'blocked')).toBe(false);
    expect(isSupportedCentralStatusChange('deleted_soft', 'active')).toBe(false);
    expect(findProductLifecycleTransition('deleted_soft', 'active')?.rejection_code).toBe('product_not_found');
    expect(findProductLifecycleTransition('active', 'archived')).toBeUndefined();
    expect(findProductLifecycleTransition('active', 'discontinued')?.reason_fa).toContain('NOT AUTHORIZED');
  });

  it('rejects forged ownership, tenant, actor, permission and audit fields', () => {
    expect(findProductLifecycleForbiddenFields({
      company_id: 'company', tenant_id: 'tenant', actor_user_id: 'actor',
      permissions: ['*'], approved_by: 'someone', audit_metadata: { at: 'now' },
      'x-domain-id': 'domain',
    })).toEqual([
      'actor_user_id', 'approved_by', 'audit_metadata', 'company_id',
      'permissions', 'tenant_id', 'x-domain-id',
    ]);
    expect(findProductLifecycleForbiddenFields({ target_status: 'blocked', row_version: 0 })).toEqual([]);
  });

  it('central D4 guard rejects blocked and unknown transitions before permission or confirmation', () => {
    const code = (fn: () => void): string | undefined => {
      try {
        fn();
        return undefined;
      } catch (err) {
        const response = (err as { getResponse?: () => unknown }).getResponse?.();
        return (response as { code?: string } | undefined)?.code;
      }
    };
    expect(code(() => assertSensitiveConfirmed(
      [{ field: 'status', before: 'active', after: 'archived' }], true, true,
    ))).toBe('lifecycle_transition_unsupported');
    expect(code(() => assertSensitiveConfirmed(
      [{ field: 'status', before: 'active', after: 'discontinued' }], true, true,
    ))).toBe(PRODUCT_LIFECYCLE_TRANSITION_BLOCKED_CODE);
    expect(code(() => assertSensitiveConfirmed(
      [{ field: 'status', before: 'discontinued', after: 'active' }], true, true,
    ))).toBe(PRODUCT_LIFECYCLE_TRANSITION_BLOCKED_CODE);
    expect(code(() => assertSensitiveConfirmed(
      [{ field: 'status', before: 'active', after: 'blocked' }], false, true,
    ))).toBe('sensitive_change_requires_confirmation');
    expect(code(() => assertSensitiveConfirmed(
      [{ field: 'status', before: 'active', after: 'blocked' }], true, false,
    ))).toBe('status_change_forbidden');
  });
});
