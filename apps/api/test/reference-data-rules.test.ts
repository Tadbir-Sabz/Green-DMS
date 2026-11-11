import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import {
  BRAND_LIST_QUERY_KEYS,
  BRAND_WRITABLE_KEYS,
  CATEGORY_DELETE_QUERY_KEYS,
  CATEGORY_LIST_QUERY_KEYS,
  CATEGORY_WRITABLE_KEYS,
  HISTORY_QUERY_KEYS,
  REFERENCE_MAX_DEPTH,
  UOM_DECIMAL_MAX,
  UNIT_LIST_QUERY_KEYS,
  UNIT_WRITABLE_KEYS,
  clampLimit,
  clampOffset,
  isValidDecimalPlaces,
  normalizeReferenceCode,
  normalizeText,
  parseIsActive,
  unknownQueryKeys,
  wouldCreateCycle,
} from '../src/modules/master-data/reference-data.rules';

/**
 * TASK-PM-02-C2 — تست واحدِ قوانین داده مرجع (بدون دیتابیس/شبکه).
 * تمرکز: محدودیت دقت اعشار D3، پارامترها/فیلدهای ناشناخته (عدم حذف بیصدا)،
 * نرمالسازی کد لاتین، جلوگیری از حلقه، و فیلتر وضعیت.
 */

describe('TASK-PM-02-C2 — قوانین داده مرجع', () => {
  it('دقت اعشار واحد فقط ۰..۴ است (D3 / ck_uom_decimal_places)', () => {
    expect(UOM_DECIMAL_MAX).toBe(4);
    for (const n of [0, 1, 2, 3, 4]) expect(isValidDecimalPlaces(n)).toBe(true);
    for (const n of [-1, 5, 6, 2.5, NaN, Infinity, '3', null]) {
      expect(isValidDecimalPlaces(n)).toBe(false);
    }
  });

  it('پارامترها/فیلدهای ناشناخته بیصدا حذف نمیشوند', () => {
    expect(unknownQueryKeys({ q: 'x', limit: '20' }, BRAND_LIST_QUERY_KEYS)).toEqual([]);
    expect(unknownQueryKeys({ unsupported: '1' }, BRAND_LIST_QUERY_KEYS)).toEqual(['unsupported']);
    expect(unknownQueryKeys({ domain_id: 'x' }, CATEGORY_LIST_QUERY_KEYS)).toEqual(['domain_id']);
    expect(unknownQueryKeys({ company_id: 'x' }, UNIT_WRITABLE_KEYS)).toEqual(['company_id']);
    expect(unknownQueryKeys({ cost_method: 'fifo' }, BRAND_WRITABLE_KEYS)).toEqual(['cost_method']);
    expect(unknownQueryKeys({ parent_id: null }, CATEGORY_WRITABLE_KEYS)).toEqual([]);
    expect(unknownQueryKeys({}, UNIT_LIST_QUERY_KEYS)).toEqual([]);
    expect(unknownQueryKeys(undefined, HISTORY_QUERY_KEYS)).toEqual([]);
    expect(unknownQueryKeys({ b: 1, a: 3 } as Record<string, unknown>, ['a'])).toEqual(['b']);
    expect(CATEGORY_DELETE_QUERY_KEYS).toEqual(['reassign_to']);
  });

  it('حداکثر عمق سلسلهمراتب یک عدد مثبت و محدود است', () => {
    expect(REFERENCE_MAX_DEPTH).toBeGreaterThan(1);
    expect(REFERENCE_MAX_DEPTH).toBeLessThanOrEqual(20);
  });

  it('حلقهٔ سلسلهمراتب (خودارجاعی و انتساب به نواده) تشخیص داده میشود', () => {
    const root = '11111111-1111-4111-8111-111111111111';
    const child = '22222222-2222-4222-8222-222222222222';
    expect(wouldCreateCycle(root, root, [])).toBe(true);
    expect(wouldCreateCycle(root, child, [root])).toBe(true);
    expect(wouldCreateCycle(root, child, ['33333333-3333-4333-8333-333333333333'])).toBe(false);
    expect(wouldCreateCycle(root, null, [])).toBe(false);
  });

  it('کد لاتین نرمال و متن فارسی بدون فاصلههای اضافی ذخیره میشود', () => {
    expect(normalizeReferenceCode('brand', '  BR_01  ')).toBe('BR_01');
    expect(normalizeReferenceCode('category', 'Cat.A-1')).toBe('Cat.A-1');
    expect(normalizeReferenceCode('unit', '  Kg  ')).toBe('kg');
    expect(normalizeReferenceCode('unit', 'KG_1')).toBe('kg_1');
    expect(normalizeReferenceCode('brand', 'کیلو')).toBeNull();
    expect(normalizeReferenceCode('unit', 'Kg')).toBe('kg');
    expect(normalizeReferenceCode('brand', 'has space')).toBeNull();
    expect(normalizeReferenceCode('unit', 'x'.repeat(17))).toBeNull();
    expect(normalizeText('  برند   تست  ')).toBe('برند تست');
    expect(normalizeText('عرب\u064A و\u0643')).toBe('عرب\u06CC و\u06A9');
  });

  it('is_active فقط true/false/خالی را میپذیرد', () => {
    expect(parseIsActive(undefined)).toBeNull();
    expect(parseIsActive(null)).toBeNull();
    expect(parseIsActive('')).toBeNull();
    expect(parseIsActive('true')).toBe(true);
    expect(parseIsActive('false')).toBe(false);
    expect(parseIsActive(true)).toBe(true);
    expect(parseIsActive('TRUE')).toBeUndefined();
    expect(parseIsActive('1')).toBeUndefined();
  });

  it('limit حداکثر ۲۰۰ و پیشفرض ۵۰ دارد؛ offset منفی صفر میشود', () => {
    expect(clampLimit(undefined)).toBe(50);
    expect(clampLimit('20')).toBe(20);
    expect(clampLimit(999)).toBe(200);
    expect(clampLimit('abc')).toBe(50);
    expect(clampLimit(-1)).toBe(1);
    expect(clampOffset(-3)).toBe(0);
    expect(clampOffset('12')).toBe(12);
  });
});
