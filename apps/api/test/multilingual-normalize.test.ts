import { describe, expect, it } from 'vitest';
import {
  comparisonKeyFor,
  FIELD_KEY_POLICY,
  searchKey,
  storedIdentifierKey,
} from '../src/modules/master-data/experimental/multilingual-normalize.candidate';

/**
 * TASK-PM-02-C14-IDENTITY-INTEGRITY-02 — نرمال‌سازیِ چندزبانه/فارسی.
 * همهٔ مثال‌ها ساختگی‌اند؛ هیچ مقدار سازمانی استفاده نشده.
 * تمرکز: سه لایهٔ جدا (ذخیره/جستجو/سیاستِ یکتایی) + idempotency.
 */

const samples = [
  'SKU-000001',
  '  فاصلهٔ   اضافه  ',
  'زعفران اعلاء',
  'زعفران\u0640 اعلاء',
  'می‌روم',
  'میروم',
  'میلیون',
  'کتاب\u200Cها',
  'کتب',
  '۴۰۰۶۳۸۱۳۳۳۹۳۱',
  '٤٠٠٦٣٨١٣٣٣٩٣١',
  'کیک',
  'كيك',
  'یخ',
  'يح',
  'مدرسة',
  'مدرسه',
];

describe('Multilingual — idempotency', () => {
  for (const s of samples) {
    it(`storedIdentifierKey idempotent: JSON ${JSON.stringify(s)}`, () => {
      const once = storedIdentifierKey(s).key;
      expect(storedIdentifierKey(once).key).toBe(once);
    });
    it(`searchKey idempotent: JSON ${JSON.stringify(s)}`, () => {
      const once = searchKey(s).key;
      expect(searchKey(once).key).toBe(once);
    });
  }
});

describe('Multilingual — لایهٔ شناسهٔ ذخیره‌شده', () => {
  it('ارقام فارسی و عربی به لاتین تا می‌شود', () => {
    expect(storedIdentifierKey('۴۰۰۶۳۸۱۳۳۳۹۳۱').key).toBe('4006381333931');
    expect(storedIdentifierKey('٤٠٠٦٣٨١٣٣٣٩٣١').key).toBe('4006381333931');
  });

  it('ک/ك و ی/ي و ة/ه یکسان دیده می‌شوند', () => {
    expect(storedIdentifierKey('کیک').key).toBe(storedIdentifierKey('كيك').key);
    expect(storedIdentifierKey('شیرین').key).toBe(storedIdentifierKey('شيرين').key);
    expect(storedIdentifierKey('مدرسة').key).toBe(storedIdentifierKey('مدرسه').key);
  });

  it('تطویل (کشیده) حذف می‌شود', () => {
    expect(storedIdentifierKey('زعفـران').key).toBe('زعفران');
    expect(storedIdentifierKey('ســـلام').key).toBe('سلام');
  });

  it('ZWNJ حفظ می‌شود (معنادار برای اسم)', () => {
    expect(storedIdentifierKey('می‌روم').key).toBe('می‌روم');
    expect(storedIdentifierKey('می‌روم').key).not.toBe(storedIdentifierKey('میروم').key);
  });

  it('حروفِ کنترلیِ مخرب (مثلاً newline/tab) حذف می‌شود', () => {
    expect(storedIdentifierKey('SKU-1\n\tX').key).toBe('sku-1x');
  });

  it('فضای اضافی فشرده و ابتدا/انتها trim می‌شود', () => {
    expect(storedIdentifierKey('  فاصلهٔ   اضافه  ').key).toBe('فاصلهٔ اضافه');
  });

  it('مقادیرِ لاتین فقط NFC+lowercase+trim می‌شوند (تبدیلِ ویژهٔ فارسی ندارد)', () => {
    expect(storedIdentifierKey('SKU-000001').key).toBe('sku-000001');
  });
});

describe('Multilingual — لایهٔ جستجو (searchKey)', () => {
  it('ZWNJ و ZWJ حذف می‌شود تا «می‌روم» با «میروم» یکی شود', () => {
    expect(searchKey('می‌روم').key).toBe('میروم');
    expect(searchKey('می‌روم').key).toBe(searchKey('میروم').key);
  });

  it('اعراب/تشدید عربی برداشته می‌شود', () => {
    expect(searchKey('مَدْرَسَة').key).toBe(searchKey('مدرسه').key);
    expect(searchKey('بِسْمِ').key).toBe(searchKey('بسم').key);
  });

  it('همهٔ اصلاحاتِ شناسه هم اعمال می‌شود (ارقام، کاف/ی/ه، تطویل)', () => {
    expect(searchKey('۴۰۰ کيك').key).toBe('400 کیک');
    expect(searchKey('کت\u200Cاب').key).toBe(searchKey('کتاب').key);
  });
});

describe('Multilingual — سیاستِ یکتاییِ فیلدها', () => {
  it('بارکد و امضای variant از مسیرِ متن عبور نمی‌کنند (exact_canonical)', () => {
    expect(FIELD_KEY_POLICY.barcode).toBe('exact_canonical');
    expect(FIELD_KEY_POLICY.packaging_barcode).toBe('exact_canonical');
    expect(FIELD_KEY_POLICY.variant_signature).toBe('exact_canonical');
    expect(comparisonKeyFor('barcode', '400 111')).toBeNull();
    expect(comparisonKeyFor('variant_signature', 'abc')).toBeNull();
  });

  it('کد و alias: لایهٔ stored_identifier؛ نام: search', () => {
    expect(FIELD_KEY_POLICY.product_code).toBe('stored_identifier');
    expect(FIELD_KEY_POLICY.alias).toBe('stored_identifier');
    expect(FIELD_KEY_POLICY.name).toBe('search');
    expect(FIELD_KEY_POLICY.attribute_text).toBe('search');
    expect(comparisonKeyFor('alias', 'مي روم')?.key).toBe('می روم');
  });

  it('هیچ لایه‌ای مقدار ذخیره‌شده را بازنویسی نمی‌کند (changed گزارش می‌دهد، نه اعمال)', () => {
    const r = storedIdentifierKey('SKU-AB');
    expect(r.changed).toBe(true); // نسبت به NFC/lowercase/trim تغییر کرده
    expect('SKU-AB').toBe('SKU-AB'); // ورودی دست‌نخورده می‌ماند
    expect(comparisonKeyFor('product_code', '۴۰۰')?.key).toBe('400');
  });
});
