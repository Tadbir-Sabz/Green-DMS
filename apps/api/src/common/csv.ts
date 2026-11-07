/**
 * تجزیه‌گرِ حداقلِ امنِ CSV (RFC 4180) — بدونِ وابستگیِ خارجی.
 * برای import محصول: نقل‌قول‌های دارایِ «،»/خط‌جدید، escape با "" و ردیف‌های خالیِ نادیده.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const s = text.replace(/^\uFEFF/, ''); // حذفِ BOM

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    if (row.length > 1 || row[0]?.trim() !== '') rows.push(row);
    row = [];
  };

  while (i < s.length) {
    const ch = s[i];
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ',') {
      pushField();
      i += 1;
      continue;
    }
    if (ch === '\r') {
      i += 1;
      continue;
    }
    if (ch === '\n') {
      pushRow();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field !== '' || row.length > 0) pushRow();
  return rows;
}

/** نگاشتِ هدرِ فارسی/انگلیسی به کلیدِ داخلی (import محصول) */
export const PRODUCT_CSV_HEADERS: Record<string, string> = {
  code: 'code',
  'کد': 'code',
  'کد کالا': 'code',
  sku: 'code',
  name: 'name',
  'نام': 'name',
  'نام کالا': 'name',
  'عنوان': 'name',
  name_latin: 'name_latin',
  'نام لاتین': 'name_latin',
  category_code: 'category_code',
  'گروه': 'category_code',
  'کد گروه': 'category_code',
  brand_name: 'brand_name',
  'برند': 'brand_name',
  base_uom_code: 'base_uom_code',
  'واحد': 'base_uom_code',
  'کد واحد': 'base_uom_code',
  tax_code: 'tax_code',
  'کد مالیاتی': 'tax_code',
  barcode: 'barcode',
  'بارکد': 'barcode',
  status: 'status',
  'وضعیت': 'status',
  min_order_qty: 'min_order_qty',
  'حداقل سفارش': 'min_order_qty',
  weight_gr: 'weight_gr',
  'وزن': 'weight_gr',
  volume_cm3: 'volume_cm3',
  'حجم': 'volume_cm3',
  distribution_kind: 'distribution_kind',
  'نوع توزیع': 'distribution_kind',
};
