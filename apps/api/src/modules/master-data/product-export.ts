import type { QueryResultRow } from 'pg';

/**
 * TASK-PM-01D-M3 — deterministic, DB-free Product Master CSV serialization.
 *
 * The export is a portable central-catalog snapshot, not a database backup:
 * product history, aliases, attributes, relations, bundles and packaging rows
 * are intentionally not flattened into this CSV. Headers that the current
 * import understands use the same vocabulary as PRODUCT_CSV_HEADERS.
 */

export interface ProductExportRow extends QueryResultRow {
  code: string;
  name: string;
  name_latin: string | null;
  category_code: string;
  family_code: string | null;
  brand_name: string | null;
  base_uom_code: string;
  tax_code: string | null;
  barcode: string | null;
  status: string;
  min_order_qty: number;
  weight_gr: number | null;
  volume_cm3: number | null;
  distribution_kind: string;
  is_batch_tracked: boolean;
  is_expiry_tracked: boolean;
  shelf_life_days: number | null;
  is_returnable_container: boolean;
  requires_permit: boolean;
  created_at: string | Date;
}

export const PRODUCT_EXPORT_COLUMNS = [
  { key: 'code', header: 'code' },
  { key: 'name', header: 'name' },
  { key: 'name_latin', header: 'name_latin' },
  { key: 'category_code', header: 'category_code' },
  { key: 'family_code', header: 'family_code' },
  { key: 'brand_name', header: 'brand_name' },
  { key: 'base_uom_code', header: 'base_uom_code' },
  { key: 'tax_code', header: 'tax_code' },
  { key: 'barcode', header: 'barcode' },
  { key: 'status', header: 'status' },
  { key: 'min_order_qty', header: 'min_order_qty' },
  { key: 'weight_gr', header: 'weight_gr' },
  { key: 'volume_cm3', header: 'volume_cm3' },
  { key: 'distribution_kind', header: 'distribution_kind' },
  { key: 'is_batch_tracked', header: 'is_batch_tracked' },
  { key: 'is_expiry_tracked', header: 'is_expiry_tracked' },
  { key: 'shelf_life_days', header: 'shelf_life_days' },
  { key: 'is_returnable_container', header: 'is_returnable_container' },
  { key: 'requires_permit', header: 'requires_permit' },
  { key: 'created_at', header: 'created_at' },
] as const satisfies ReadonlyArray<{ key: keyof ProductExportRow; header: string }>;

/** RFC 4180 quoting plus conservative spreadsheet formula-injection mitigation. */
export function escapeProductCsvCell(value: unknown): string {
  let text: string;
  if (value == null) text = '';
  else if (value instanceof Date) text = value.toISOString();
  else if (typeof value === 'boolean') text = value ? 'true' : 'false';
  else text = String(value);

  // Excel/LibreOffice may interpret cells beginning with these characters as
  // formulas even after optional leading whitespace. Prefixing with an apostrophe
  // keeps the visible data while preventing formula execution.
  const probe = text.replace(/^[\s\u200B-\u200D\uFEFF]+/, '');
  if (
    (probe.length > 0 && '=+-@'.includes(probe[0])) ||
    text.startsWith('\t') ||
    text.startsWith('\r')
  ) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildProductExportCsv(rows: readonly ProductExportRow[]): string {
  const lines = [
    PRODUCT_EXPORT_COLUMNS.map((column) => escapeProductCsvCell(column.header)).join(','),
    ...rows.map((row) =>
      PRODUCT_EXPORT_COLUMNS.map((column) => escapeProductCsvCell(row[column.key])).join(','),
    ),
  ];
  // BOM makes Persian text open correctly in Excel; CRLF is spreadsheet-friendly.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function productExportFilename(now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `products-${day}.csv`;
}
