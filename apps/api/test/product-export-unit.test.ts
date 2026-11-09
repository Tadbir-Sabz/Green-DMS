import { describe, expect, it } from 'vitest';
import {
  PRODUCT_EXPORT_COLUMNS,
  buildProductExportCsv,
  escapeProductCsvCell,
  productExportFilename,
  type ProductExportRow,
} from '../src/modules/master-data/product-export';

const row = (overrides: Partial<ProductExportRow> = {}): ProductExportRow => ({
  code: 'P-001',
  name: 'کالا، «ویژه»',
  name_latin: 'Special, "A"',
  category_code: 'PMCAT',
  family_code: null,
  brand_name: null,
  base_uom_code: 'pm_piece',
  tax_code: null,
  barcode: '1234567890123',
  status: 'active',
  min_order_qty: 1,
  weight_gr: null,
  volume_cm3: null,
  distribution_kind: 'both',
  is_batch_tracked: false,
  is_expiry_tracked: false,
  shelf_life_days: null,
  is_returnable_container: false,
  requires_permit: false,
  created_at: new Date('2026-11-07T10:20:30.000Z'),
  ...overrides,
});

describe('TASK-PM-01D-M3 product CSV serialization', () => {
  it('emits a stable BOM-prefixed header and one CRLF row per product', () => {
    const csv = buildProductExportCsv([row()]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(PRODUCT_EXPORT_COLUMNS.map((c) => c.header)).toEqual([
      'code', 'name', 'name_latin', 'category_code', 'family_code', 'brand_name',
      'base_uom_code', 'tax_code', 'barcode', 'status', 'min_order_qty',
      'weight_gr', 'volume_cm3', 'distribution_kind', 'is_batch_tracked',
      'is_expiry_tracked', 'shelf_life_days', 'is_returnable_container',
      'requires_permit', 'created_at',
    ]);
    expect(csv).toContain('"P-001"');
    expect(csv).toContain('"کالا، «ویژه»"');
    expect(csv).toContain('"Special, ""A"""');
    expect(csv).toContain('"2026-11-07T10:20:30.000Z"');
    expect(csv).toContain('"false"');
    expect(csv).toContain('""'); // null fields
  });

  it('escapes spreadsheet formulas and preserves quoting/newlines', () => {
    expect(escapeProductCsvCell('=SUM(A1:A2)')).toBe('"\'=SUM(A1:A2)"');
    expect(escapeProductCsvCell('  @cmd')).toBe('"\'  @cmd"');
    expect(escapeProductCsvCell('+1')).toBe('"\'+1"');
    expect(escapeProductCsvCell('-1')).toBe('"\'-1"');
    expect(escapeProductCsvCell('\tcmd')).toBe('"\'\tcmd"');
    expect(escapeProductCsvCell('safe "quoted"\nline')).toBe('"safe ""quoted""\nline"');
    expect(escapeProductCsvCell(null)).toBe('""');
    expect(escapeProductCsvCell(true)).toBe('"true"');
  });

  it('uses a deterministic UTC-day filename', () => {
    expect(productExportFilename(new Date('2026-11-07T23:59:59Z'))).toBe('products-20261107.csv');
  });
});
