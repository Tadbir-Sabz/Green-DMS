import { describe, expect, it } from 'vitest';
import type { Category, Unit, Brand } from '../products-lib';
import {
  ACTION_LABEL_FA,
  ENTITY_LABEL_FA,
  PAGE_SIZE,
  activeFilterValue,
  activeLabel,
  brandOptionLabel,
  categoryDepthMap,
  categoryPath,
  categoryPathLabel,
  descendantIds,
  faNumber,
  pageRangeLabel,
  parentOptions,
  unitOptionLabel,
} from './reference-data-lib';

const cat = (id: string, code: string, name: string, parent_id: string | null = null, is_active = true): Category => ({
  id, code, name, parent_id, is_active,
});

const ROWS: Category[] = [
  cat('r', 'ROOT', 'ریشه'),
  cat('c', 'CHILD', 'فرزند', 'r'),
  cat('g', 'GRAND', 'نوه', 'c'),
  cat('other', 'OTHER', 'دسته دیگر', null, false),
];

describe('TASK-PM-02-C2 — ابزار داده مرجع (وب)', () => {
  it('اعداد و برچسبها فارسی و پایدارند', () => {
    expect(faNumber(1234)).toBe('۱۲۳۴');
    expect(faNumber('0')).toBe('۰');
    expect(activeLabel(true)).toBe('فعال');
    expect(activeLabel(false)).toBe('غیرفعال');
    expect(ENTITY_LABEL_FA.uom).toBe('واحد اندازهگیری');
    expect(ACTION_LABEL_FA.delete).toBe('حذف');
    expect(activeFilterValue('all')).toBeUndefined();
    expect(activeFilterValue('active')).toBe(true);
    expect(activeFilterValue('inactive')).toBe(false);
    expect(PAGE_SIZE).toBe(20);
  });

  it('برچسب صفحهبندی با total صفر و محدودهٔ درست ساخته میشود', () => {
    expect(pageRangeLabel(0, 0)).toBe('موردی یافت نشد.');
    expect(pageRangeLabel(0, 45)).toBe('نمایش ۱–۲۰ از ۴۵');
    expect(pageRangeLabel(40, 45)).toBe('نمایش ۴۱–۴۵ از ۴۵');
  });

  it('عمق و مسیر سلسلهمراتب ریشه ← نواده محاسبه میشود', () => {
    const depths = categoryDepthMap(ROWS);
    expect(depths.get('r')).toBe(0);
    expect(depths.get('c')).toBe(1);
    expect(depths.get('g')).toBe(2);
    expect(categoryPath(ROWS, 'g').map((r) => r.id)).toEqual(['r', 'c']);
    expect(categoryPathLabel(ROWS, 'g')).toBe('ریشه › فرزند › نوه');
  });

  it('نوادگان و گزینههای والد، حلقه و دسته غیرفعال را حذف میکنند', () => {
    expect([...descendantIds(ROWS, 'r')].sort()).toEqual(['c', 'g', 'r']);
    const forRoot = parentOptions(ROWS, 'r').map((r) => r.id);
    expect(forRoot).toEqual([]); // ریشه، فرزند و نوه حذف شدند؛ دسته دیگر غیرفعال است
    const forGrand = parentOptions(ROWS, 'g').map((r) => r.id);
    expect(forGrand).toEqual(['c', 'r']); // نیاکان مجاز؛ فقط خود/نوادگان حذف میشوند
    expect(parentOptions(ROWS).map((r) => r.id)).toEqual(['c', 'g', 'r']);
  });

  it('حلقهٔ ناخواستهی داده، عمق و مسیر را بیکران نمیکند', () => {
    const cyclic: Category[] = [cat('a', 'A', 'الف', 'b'), cat('b', 'B', 'ب', 'a')];
    const depths = categoryDepthMap(cyclic);
    expect(depths.get('a')).toBeLessThanOrEqual(2);
    expect(depths.get('b')).toBeLessThanOrEqual(2);
    expect(categoryPath(cyclic, 'a').length).toBeLessThanOrEqual(2);
  });

  it('برچسب گزینههای واحد و برند قرارداد D3/لاتین را نشان میدهد', () => {
    const u: Unit = {
      id: 'u1', code: 'kg', title: 'کیلوگرم', decimal_places: 3,
      symbol: 'kg', title_latin: 'Kilogram', is_active: true,
    };
    expect(unitOptionLabel(u)).toContain('kg — کیلوگرم');
    expect(unitOptionLabel(u)).toContain('۳ رقم اعشار');
    const b: Brand = {
      id: 'b1', code: 'GR', name: 'برند سبز', name_latin: 'Green',
      is_active: true, product_count: 2,
    };
    expect(brandOptionLabel(b)).toBe('GR — برند سبز (Green)');
    expect(brandOptionLabel({ ...b, code: null, name_latin: null })).toBe('برند سبز');
  });
});
