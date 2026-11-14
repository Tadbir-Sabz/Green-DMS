import { describe, expect, it } from 'vitest';
import {
  REQUIRED_ATTRIBUTE_MISSING_CODE,
  findMissingRequiredAttributes,
  readLifecycleEnforcementMode,
  requiredAttributeMissingExceptionBody,
  requiredAttributeMissingMessageFa,
  sortRequiredAttributes,
  validateRequiredAttributes,
  type RequiredAttributeDefinition,
} from '../src/modules/master-data/product-attribute-requirements';

/**
 * TASK-PM-02-C14-IMPLEMENTATION-01 — اعتبارسنجِ صفات الزامی (D4).
 *
 * این تست‌ها DB-free و determinism-محورند: همین قرارداد باید در مسیرهای ساخت/ویرایش/
 * ورودِ گروهی/تغییرِ دسته (وقتی مالک آن‌ها را فعال کند) یک نتیجهٔ یکسان بدهد.
 * دامنهٔ الزام تصمیمِ مالک است؛ اینجا فقط «وضعیتِ نهایی + تعریف‌های قابل‌اعمال» اثبات می‌شود.
 */

const defA: RequiredAttributeDefinition = { id: 'a1', code: 'color', title: 'رنگ' };
const defB: RequiredAttributeDefinition = { id: 'b2', code: 'size', title: 'سایز' };
const defC: RequiredAttributeDefinition = { id: 'c3', code: 'material', title: 'جنس' };
const ALL: RequiredAttributeDefinition[] = [defA, defB, defC];

describe('D4 — ردیف‌های گمشده (findMissingRequiredAttributes)', () => {
  it('بدون تعریفِ الزامی → هیچ کم‌بودن‌ی نیست', () => {
    expect(findMissingRequiredAttributes([], new Set())).toEqual([]);
  });

  it('همهٔ تعریف‌ها حاضر → خالی', () => {
    expect(findMissingRequiredAttributes(ALL, new Set(['a1', 'b2', 'c3']))).toEqual([]);
  });

  it('وضعیتِ نهایی ملاک است: مقدار پاک‌شده (clear) دوباره گمشده حساب می‌شود', () => {
    const presentAfterClear = new Set(['a1', 'b2']); // c3 حذف شد
    const missing = findMissingRequiredAttributes(ALL, presentAfterClear);
    expect(missing.map((m) => m.code)).toEqual(['material']);
    expect(missing[0].field).toBe('attributes.material');
    expect(missing[0].message_fa).toBe('صفتِ «جنس» برای این کالا الزامی است.');
  });

  it('def_id ناشناس در مجموعه حاضر نادیده گرفته می‌شود', () => {
    expect(findMissingRequiredAttributes(ALL, ['a1', 'b2', 'c3', 'ffffffff-0000-4000-8000-000000000000'])).toEqual([]);
  });

  it('ترتیب خروجی قطعی (code، سپس id) و مستقل از ترتیب ورودی است', () => {
    const shuffled = [defC, defA, defB];
    const missing = findMissingRequiredAttributes(shuffled, new Set());
    expect(missing.map((m) => m.code)).toEqual(['color', 'material', 'size']);
  });

  it('هم‌کدها با id مرتب می‌شوند', () => {
    const dup: RequiredAttributeDefinition[] = [
      { id: 'z9', code: 'color', title: 'رنگ ۲' },
      { id: 'a1', code: 'color', title: 'رنگ ۱' },
    ];
    expect(sortRequiredAttributes(dup).map((d) => d.id)).toEqual(['a1', 'z9']);
  });

  it('ترتیب ورودیِ defs جهش نمی‌کند', () => {
    const input = [defC, defA, defB];
    sortRequiredAttributes(input);
    expect(input).toEqual([defC, defA, defB]);
  });

  it('sortRequiredAttributes خروجیِ یکسان برای جایگشت‌های مختلف می‌دهد', () => {
    const p1 = sortRequiredAttributes([defA, defB, defC]).map((d) => d.id);
    const p2 = sortRequiredAttributes([defC, defB, defA]).map((d) => d.id);
    expect(p1).toEqual(p2);
  });
});

describe('D4 — اعتبارسنجیِ وضعیتِ نهایی (validateRequiredAttributes)', () => {
  it('ok=true وقتی همهٔ تعریف‌های قابل‌اعمال حاضر باشند', () => {
    const res = validateRequiredAttributes({ defs: ALL, presentDefIds: ['a1', 'b2', 'c3'], operation: 'update' });
    expect(res.ok).toBe(true);
    expect(res.missing).toEqual([]);
    expect(res.operation).toBe('update');
  });

  it('ok=false و missing قطعی وقتی چیزی جا افتاده باشد', () => {
    const res = validateRequiredAttributes({ defs: ALL, presentDefIds: ['b2'], operation: 'import' });
    expect(res.ok).toBe(false);
    expect(res.operation).toBe('import');
    expect(res.missing.map((m) => m.field)).toEqual(['attributes.color', 'attributes.material']);
  });

  it('دامنهٔ «کدام تعریف قابل‌اعمال است» با کالری است؛ def نادیده‌گرفته‌شده گزارش نمی‌شود', () => {
    const scoped = [defA]; // مثلاً دامنهٔ دسته/خانواده — نگاشتش تصمیمِ مالک است
    const res = validateRequiredAttributes({ defs: scoped, presentDefIds: [], operation: 'category_change' });
    expect(res.missing.map((m) => m.code)).toEqual(['color']);
  });
});

describe('D4 — بدنهٔ استثنای required_attribute_missing', () => {
  const missing = findMissingRequiredAttributes(ALL, new Set(['b2'])); // color + material

  it('code همان قراردادِ قبلی (required_attribute_missing) است', () => {
    expect(REQUIRED_ATTRIBUTE_MISSING_CODE).toBe('required_attribute_missing');
    expect(requiredAttributeMissingExceptionBody(missing, 'attribute_values').code).toBe('required_attribute_missing');
  });

  it('message_fa پیامِ قراردادِ قبلی با عنوانِ اولین صفتِ گمشده (ترتیبِ قطعی) است', () => {
    const body = requiredAttributeMissingExceptionBody(missing, 'attribute_values');
    expect(body.message_fa).toBe('صفتِ «رنگ» برای این کالا الزامی است.');
  });

  it('details.def_id قراردادِ قبلی را حفظ می‌کند؛ details.missing فهرستِ کاملِ field-addressable است', () => {
    const body = requiredAttributeMissingExceptionBody(missing, 'category_change');
    expect(body.details.def_id).toBe('a1');
    expect(body.details.operation).toBe('category_change');
    expect(body.details.missing).toEqual([
      { def_id: 'a1', code: 'color', title: 'رنگ', field: 'attributes.color', message_fa: 'صفتِ «رنگ» برای این کالا الزامی است.' },
      { def_id: 'c3', code: 'material', title: 'جنس', field: 'attributes.material', message_fa: 'صفتِ «جنس» برای این کالا الزامی است.' },
    ]);
  });

  it('با فهرستِ خالی throw می‌کند (فراخوان باید اول ok را بسنجد)', () => {
    expect(() => requiredAttributeMissingExceptionBody([], 'create')).toThrow();
  });

  it('requiredAttributeMissingMessageFa دقیقاً همان پیامِ قراردادِ قبلی است', () => {
    expect(requiredAttributeMissingMessageFa('رنگ')).toBe('صفتِ «رنگ» برای این کالا الزامی است.');
  });
});

describe('D4 — مرزِ غیرفعالِ پیش‌فرض (readLifecycleEnforcementMode)', () => {
  const mode = (v: string | undefined) => readLifecycleEnforcementMode({ PRODUCT_ATTRIBUTE_LIFECYCLE_ENFORCEMENT: v } as NodeJS.ProcessEnv);

  it('نبودِ متغیر / مقدارِ ناشناخته → off (fail-closed)', () => {
    expect(mode(undefined)).toBe('off');
    expect(mode('')).toBe('off');
    expect(mode('on')).toBe('off');
    expect(mode('true')).toBe('off');
    expect(mode('1')).toBe('off');
    expect(mode('yes')).toBe('off');
    expect(mode('enforced')).toBe('off');
    expect(mode('enforce2')).toBe('off');
  });

  it('فقط «enforce» (بی‌بافت، با trim) فعال می‌کند', () => {
    expect(mode('enforce')).toBe('enforce');
    expect(mode('ENFORCE')).toBe('enforce');
    expect(mode('  Enforce  ')).toBe('enforce');
  });

  it('محیطِ خالی → off است', () => {
    expect(readLifecycleEnforcementMode({} as NodeJS.ProcessEnv)).toBe('off');
  });
});
