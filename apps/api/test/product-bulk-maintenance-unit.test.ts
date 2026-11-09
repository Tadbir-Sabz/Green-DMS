import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  BULK_FIELD_DEFINITIONS,
  BulkMaintenanceInputError,
  buildBulkDiffs,
  buildBulkPreviewRecord,
  canonicalJson,
  hashBulkPreviewToken,
  hashBulkRequest,
  normalizeBulkChanges,
  normalizeProductIds,
  type BulkProductSnapshot,
} from '../src/modules/master-data/product-bulk-maintenance.types';

const id1 = '00000000-0000-4000-8000-000000000001';
const id2 = '00000000-0000-4000-8000-000000000002';

const row = (overrides: Partial<BulkProductSnapshot> = {}): BulkProductSnapshot => ({
  id: id1,
  code: 'P-1',
  name: 'کالای نخست',
  name_latin: null,
  brand_id: null,
  min_order_qty: 1,
  weight_gr: null,
  volume_cm3: null,
  distribution_kind: 'cold',
  is_returnable_container: false,
  requires_permit: false,
  status: 'active',
  tax_code_id: null,
  base_uom_id: '00000000-0000-4000-8000-000000000009',
  row_version: 3,
  ...overrides,
});

describe('TASK-PM-01D-M4 bulk maintenance field policy', () => {
  it('owns only nine non-sensitive central catalog fields', () => {
    expect(BULK_FIELD_DEFINITIONS.map((f) => f.key)).toEqual([
      'name',
      'name_latin',
      'brand_id',
      'min_order_qty',
      'weight_gr',
      'volume_cm3',
      'distribution_kind',
      'is_returnable_container',
      'requires_permit',
    ]);
    for (const protectedKey of [
      'status',
      'tax_code_id',
      'base_uom_id',
      'company_id',
      'code',
      'category_id',
      'domain_id',
      'price',
      'row_version',
    ]) {
      expect(() => normalizeBulkChanges({ [protectedKey]: 'x' })).toThrow(
        BulkMaintenanceInputError,
      );
    }
  });

  it('validates bounded IDs and dynamic values, including null for nullable fields', () => {
    expect(normalizeProductIds([id2, id1])).toEqual([id1, id2]);
    expect(() => normalizeProductIds([])).toThrow(/تعداد/);
    expect(() => normalizeProductIds(Array.from({ length: 101 }, () => randomUUID()))).toThrow(
      /تعداد/,
    );
    expect(() => normalizeProductIds([id1, id1])).toThrow(/تکراری/);
    expect(() => normalizeProductIds(['not-uuid'])).toThrow(/معتبر/);

    expect(
      normalizeBulkChanges({
        name: '  کالای تازه ',
        name_latin: '',
        brand_id: id2,
        min_order_qty: 2.5,
        weight_gr: null,
        distribution_kind: 'both',
        is_returnable_container: true,
        requires_permit: false,
      }),
    ).toEqual({
      name: 'کالای تازه',
      name_latin: null,
      brand_id: id2,
      min_order_qty: 2.5,
      weight_gr: null,
      distribution_kind: 'both',
      is_returnable_container: true,
      requires_permit: false,
    });

    for (const bad of [
      { name: '' },
      { min_order_qty: -1 },
      { weight_gr: 1.5 },
      { distribution_kind: 'frozen' },
      { requires_permit: 'yes' },
      { brand_id: 'not-uuid' },
      { unsupported: 1 },
      { constructor: 'x' },
    ]) {
      expect(() => normalizeBulkChanges(bad)).toThrow(BulkMaintenanceInputError);
    }
    expect(new BulkMaintenanceInputError('x', 'پیام')).toBeInstanceOf(BadRequestException);
  });

  it('builds exact before/after diffs, ineligible reasons and stable hashes', () => {
    const changes = normalizeBulkChanges({ name: 'کالای تازه', name_latin: '' });
    const diffs = buildBulkDiffs(row(), changes);
    expect(diffs).toHaveLength(2);
    expect(diffs[0]).toMatchObject({
      field: 'name',
      before: 'کالای نخست',
      after: 'کالای تازه',
      changed: true,
    });
    expect(diffs[1]).toMatchObject({
      field: 'name_latin',
      before: null,
      after: null,
      changed: false,
    });

    const preview = buildBulkPreviewRecord(
      [id1, id2, '00000000-0000-4000-8000-000000000003'],
      [row(), row({ id: id2, name: 'کالای تازه', name_latin: null })],
      changes,
    );
    expect(preview.eligible_count).toBe(1);
    expect(preview.rejected_count).toBe(2);
    expect(preview.items[1].status).toBe('rejected');
    expect(preview.items[1].reason_code).toBe('no_change');
    expect(preview.items[2].status).toBe('rejected');
    expect(preview.items[2].reason_code).toBe('not_found');
    expect(preview.expected_versions).toEqual({ [id1]: 3, [id2]: 3 });

    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(hashBulkRequest([id2, id1], changes)).toBe(hashBulkRequest([id1, id2], changes));
    expect(hashBulkPreviewToken('token')).toHaveLength(64);
    expect(hashBulkPreviewToken('token')).not.toBe(hashBulkPreviewToken('other'));
  });
});
