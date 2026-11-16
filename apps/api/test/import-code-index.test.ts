import { describe, expect, it } from 'vitest';
import {
  buildImportCodeIndex,
  lookupImportCode,
  type ImportCodeRow,
} from '../src/modules/master-data/import-code-index';

/**
 * TASK-PM-02-C14-IDENTITY-INTEGRITY-02 — شاخصِ کدِ کالا برای import.
 *
 * قرارداد: کلیدها lower(code)؛ lookup بی‌بافت؛ first-wins روی جفت‌های case-variant
 * ذخیره‌شده (که قیدِ case-sensitive DB امروز مجازشان می‌کند) با ترتیبِ قطعی.
 */

const row = (id: string, code: string): ImportCodeRow => ({
  id,
  code,
  status: 'active',
  base_uom_id: 'uom-1',
  tax_code_id: null,
});

describe('buildImportCodeIndex', () => {
  it('اندیس خالی برای ورودی خالی', () => {
    const index = buildImportCodeIndex([]);
    expect(index.map.size).toBe(0);
    expect(index.caseVariantStoredCodes).toEqual([]);
  });

  it('کلیدها lower هستند', () => {
    const index = buildImportCodeIndex([row('1', 'SKU-000001')]);
    expect(index.map.has('sku-000001')).toBe(true);
    expect(index.map.has('SKU-000001')).toBe(false);
  });

  it('lookup بی‌بافت است (هم حروف بزرگ هم کوچک)', () => {
    const index = buildImportCodeIndex([row('1', 'SKU-000001')]);
    expect(lookupImportCode(index, 'sku-000001')?.id).toBe('1');
    expect(lookupImportCode(index, 'SKU-000001')?.id).toBe('1');
    expect(lookupImportCode(index, 'Sku-000001')?.id).toBe('1');
  });

  it('lookup با کد ناموجود / خالی / null → null', () => {
    const index = buildImportCodeIndex([row('1', 'SKU-1')]);
    expect(lookupImportCode(index, 'SKU-2')).toBeNull();
    expect(lookupImportCode(index, '')).toBeNull();
    expect(lookupImportCode(index, null)).toBeNull();
    expect(lookupImportCode(index, undefined)).toBeNull();
  });

  it('روی جفت‌های case-variant ذخیره‌شده قطعی و first-wins (کوچک‌ترین کد از نظر بایت) است', () => {
    const a = row('id-a', 'SKU-9');
    const b = row('id-b', 'sku-9');
    const forward = buildImportCodeIndex([a, b]);
    const reverse = buildImportCodeIndex([b, a]);
    expect(forward.map.get('sku-9')?.code).toBe('SKU-9'); // 'SKU-9' < 'sku-9' (S < s)
    expect(reverse.map.get('sku-9')?.code).toBe('SKU-9'); // مستقل از ترتیب ورودی
    expect(forward.caseVariantStoredCodes).toEqual(['sku-9']);
    expect(reverse.caseVariantStoredCodes).toEqual(['sku-9']);
  });

  it('کدهای کاملاً یکسان (نه فقط case-variant) → first-wins بدون گزارش variant', () => {
    const index = buildImportCodeIndex([row('1', 'SKU-1'), row('2', 'SKU-1')]);
    expect(index.map.get('sku-1')?.id).toBe('1');
    expect(index.caseVariantStoredCodes).toEqual([]);
  });

  it('ورودی بدون ترتیب مشخص ⇒ همان نتیجه (قطعی)', () => {
    const rows = [row('3', 'B-2'), row('1', 'A-1'), row('2', 'a-1'), row('4', 'C-3')];
    const i1 = buildImportCodeIndex(rows);
    const i2 = buildImportCodeIndex([...rows].reverse());
    expect([...i1.map.keys()]).toEqual([...i2.map.keys()]);
    expect(i1.map.get('a-1')?.id).toBe(i2.map.get('a-1')?.id);
    expect(i1.caseVariantStoredCodes).toEqual(i2.caseVariantStoredCodes);
  });
});
