import { describe, expect, it } from 'vitest';
import {
  BULK_STATUS_LABEL,
  bulkEnumLabel,
  bulkOperationSummary,
  bulkPreviewExpired,
  bulkSelectionError,
  bulkStatusToneCls,
  buildBulkChanges,
  parseBulkFieldValue,
} from './bulk-maintenance';
import {
  errorCls,
  okCls,
  type BulkMaintenanceField,
  type BulkMaintenanceOperationResult,
} from '../products-lib';

const nameField: BulkMaintenanceField = {
  key: 'name',
  label_fa: 'نام کالا',
  kind: 'text',
  nullable: false,
  max_length: 255,
};
const latinField: BulkMaintenanceField = {
  key: 'name_latin',
  label_fa: 'نام لاتین',
  kind: 'nullable_text',
  nullable: true,
  max_length: 255,
};
const distField: BulkMaintenanceField = {
  key: 'distribution_kind',
  label_fa: 'شرایط توزیع فیزیکی',
  kind: 'enum',
  nullable: false,
  enum_values: ['cold', 'warm', 'both'],
};
const flagField: BulkMaintenanceField = {
  key: 'requires_permit',
  label_fa: 'نیازمند مجوز',
  kind: 'boolean',
  nullable: false,
};
const qtyField: BulkMaintenanceField = {
  key: 'min_order_qty',
  label_fa: 'حداقل مقدار سفارش',
  kind: 'number',
  nullable: false,
};
const weightField: BulkMaintenanceField = {
  key: 'weight_gr',
  label_fa: 'وزن (گرم)',
  kind: 'nullable_integer',
  nullable: true,
};

describe('M4 bulk maintenance client helpers', () => {
  it('builds bounded changes only from server-listed fields', () => {
    const fields = [nameField, latinField, distField, flagField, qtyField, weightField];
    const result = buildBulkChanges(
      fields,
      ['name', 'name_latin', 'distribution_kind', 'requires_permit', 'min_order_qty', 'weight_gr'],
      {
        name: '  کالای تازه  ',
        name_latin: '',
        distribution_kind: 'both',
        requires_permit: 'false',
        min_order_qty: '2.5',
        weight_gr: '',
      },
    );
    expect(result.error_fa).toBeUndefined();
    expect(result.changes).toEqual({
      name: 'کالای تازه',
      name_latin: null,
      distribution_kind: 'both',
      requires_permit: false,
      min_order_qty: 2.5,
      weight_gr: null,
    });
  });

  it('rejects incomplete, unsupported, prototype-polluting and out-of-range values', () => {
    expect(parseBulkFieldValue(nameField, '')).toBeUndefined();
    expect(parseBulkFieldValue(nameField, 'x'.repeat(256))).toBeUndefined();
    expect(parseBulkFieldValue(distField, 'invented')).toBeUndefined();
    expect(parseBulkFieldValue(flagField, 'maybe')).toBeUndefined();
    expect(parseBulkFieldValue(qtyField, '-1')).toBeUndefined();
    expect(parseBulkFieldValue(weightField, '1.5')).toBeUndefined();
    expect(buildBulkChanges([nameField], ['status'], { status: 'blocked' }).error_fa).toContain(
      'فهرست سرور',
    );
    expect(buildBulkChanges([nameField], ['__proto__'], {}).error_fa).toContain('مجاز نیست');
    expect(buildBulkChanges([nameField], [], {}).error_fa).toContain('حداقل یک فیلد');
  });

  it('exposes Persian labels, bounded selection and lifecycle tones', () => {
    expect(bulkEnumLabel(distField, 'both')).toBe('سرد و گرم');
    expect(bulkSelectionError(0)).toContain('حداقل یک کالا');
    expect(bulkSelectionError(101)).toContain('100');
    expect(bulkStatusToneCls('committed')).toBe(okCls);
    expect(bulkStatusToneCls('unknown')).toBe(errorCls);
    expect(bulkPreviewExpired(new Date(Date.now() - 1000).toISOString())).toBe(true);
    expect(bulkPreviewExpired(new Date(Date.now() + 60_000).toISOString())).toBe(false);
    const result = {
      operation_id: '00000000-0000-4000-8000-000000000001',
      status: 'committed',
      outcome: 'committed',
      lifecycle: [],
      eligible_count: 2,
      updated_count: 2,
      rejected_count: 0,
      failure_category: 'none',
      items: [],
    } as BulkMaintenanceOperationResult;
    expect(bulkOperationSummary(result)).toContain(BULK_STATUS_LABEL.committed);
  });
});
