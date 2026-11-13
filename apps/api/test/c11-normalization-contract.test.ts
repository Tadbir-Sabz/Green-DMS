/**
 * TASK-PM-02-C11 — ماتریسِ اجراییِ قراردادِ نرمال‌سازی.
 *
 * سه لایه را از هم جدا می‌کند:
 *   1. رفتارِ **فعلی** (توابعِ فعالِ تولید: `normalizeText`/`normalizeBarcode`
 *      در `product-normalize.ts`، `normalizeText` در `reference-data.rules.ts`،
 *      و `normalizeFa` در وب).
 *   2. رفتارِ **نامزد** (قراردادِ پیشنهادی در `experimental/`).
 *   3. **تصمیم‌های بازِ کسب‌وکار** (مواردی که تست آن‌ها را «مشخص» نمی‌کند و
 *      عمداً به‌عنوان `OPEN-DECISION` علامت‌گذاری شده‌اند).
 *
 * هیچ دادهٔ واقعیِ سازمانی در این فایل نیست؛ همهٔ ورودی‌ها ساختگی‌اند.
 * این تست هیچ رفتاری را فعال نمی‌کند و صرفاً مشخصه‌یابی (characterization) است.
 */
import { describe, it, expect } from 'vitest';
import { normalizeText, normalizeBarcode } from '../src/modules/master-data/product-normalize';
import { normalizeText as referenceNormalizeText } from '../src/modules/master-data/reference-data.rules';
import {
  productNameKey,
  productNameLatinKey,
  productAliasKey,
  productCodeKey,
  barcodeKey,
  searchKey,
  foldDigits,
  foldPersianLetterVariants,
  PROFILE_SPECS,
  keyFor,
  type NormalizationProfileId,
} from '../src/modules/master-data/experimental/product-identity-normalization.candidate';

/** استخراجِ کلید از نتیجه یا پرتابِ خطا با پیامِ خوانا */
function mustOk(r: { ok: true; key: string } | { ok: false; failure: { code: string } }): string {
  if (!r.ok) throw new Error(`expected ok, got ${r.failure.code}`);
  return r.key;
}
function isRejected(r: { ok: boolean }): boolean {
  return !r.ok;
}

// ===========================================================================
// بخشِ ۱ — حروفِ فارسی/عربی
// ===========================================================================
describe('C11 / 1 — Persian & Arabic letters', () => {
  it('CURRENT: active normalizeText does NOT fold ي→ی or ك→ک', () => {
    // رفتارِ فعلیِ تولید (سندِ شکاف، نه تأیید)
    expect(normalizeText('علي')).toBe('علي');
    expect(normalizeText('علی')).toBe('علی');
    expect(normalizeText('علي')).not.toBe(normalizeText('علی'));
    expect(normalizeText('كوكا')).not.toBe(normalizeText('کوکا'));
  });

  it('CURRENT: reference-data normalizeText DOES fold ي/ك but ONLY those, and does not fold digits', () => {
    // این تابعِ دیگری با همین نام است و رفتارِ متفاوتی دارد.
    expect(referenceNormalizeText('علي')).toBe(referenceNormalizeText('علی'));
    expect(referenceNormalizeText('كوكا')).toBe(referenceNormalizeText('کوکا'));
    // ولی ارقام و کوچک‌سازی را انجام نمی‌دهد:
    expect(referenceNormalizeText('۱۲۳')).toBe('۱۲۳');
    expect(referenceNormalizeText('ABC')).toBe('ABC');
  });

  it('PROPOSED: ProductName folds ي/ى→ی and ك→ک and ة→ه', () => {
    expect(mustOk(productNameKey('علي'))).toBe(mustOk(productNameKey('علی')));
    expect(mustOk(productNameKey('كوكا'))).toBe(mustOk(productNameKey('کوکا')));
    expect(mustOk(productNameKey('ى'))).toBe(mustOk(productNameKey('ی')));
    expect(mustOk(productNameKey('مدينه'))).toBe(mustOk(productNameKey('مدینه')));
  });

  it('PROPOSED: ProductName deliberately does NOT collapse آ/أ/إ into ا', () => {
    // تصمیمِ آگاهانه: «آب» و «اب» در فارسی دو واژه‌اند و ادغام بازگشت‌پذیر نیست.
    expect(mustOk(productNameKey('آب'))).not.toBe(mustOk(productNameKey('اب')));
    expect(mustOk(productNameKey('أحمد'))).not.toBe(mustOk(productNameKey('احمد')));
    expect(mustOk(productNameKey('إسلام'))).not.toBe(mustOk(productNameKey('اسلام')));
  });

  it('PROPOSED: diacritics and tatweel are removed', () => {
    expect(mustOk(productNameKey('كِتَاب'))).toBe(mustOk(productNameKey('کتاب')));
    expect(mustOk(productNameKey('کتـــاب'))).toBe(mustOk(productNameKey('کتاب')));
  });

  it('PROPOSED: Persian and Arabic digits fold to Latin', () => {
    expect(foldDigits('۱۲۳')).toBe('123');
    expect(foldDigits('١٢٣')).toBe('123');
    expect(mustOk(productNameKey('کالا ۱۲۳'))).toBe(mustOk(productNameKey('کالا 123')));
    expect(mustOk(productNameKey('کالا ١٢٣'))).toBe(mustOk(productNameKey('کالا 123')));
  });

  it('PROPOSED: mixed Arabic/Persian text in one string is handled', () => {
    const mixed = 'علي کِتاب ۱۲٣'; // ي عربی + ک فارسی + اعراب + ارقامِ مخلوط
    expect(mustOk(productNameKey(mixed))).toBe(mustOk(productNameKey('علی کتاب 123')));
  });
});

// ===========================================================================
// بخشِ ۲ — فاصله و نشانه‌گذاری
// ===========================================================================
describe('C11 / 2 — whitespace & punctuation', () => {
  it('CURRENT: differs on ZWNJ (half-space)', () => {
    expect(normalizeText('کوکا\u200cزیرو')).not.toBe(normalizeText('کوکازیرو'));
  });

  it('PROPOSED: ZWNJ becomes a space, so «کوکا‌زیرو» and «کوکا زیرو» agree', () => {
    expect(mustOk(productNameKey('کوکا\u200cزیرو'))).toBe(mustOk(productNameKey('کوکا زیرو')));
  });

  it('PROPOSED: ZWJ, NBSP, tabs, newlines collapse to a single space', () => {
    expect(mustOk(productNameKey('a\u200db'))).toBe(mustOk(productNameKey('a b')));
    expect(mustOk(productNameKey('a\u00a0b'))).toBe(mustOk(productNameKey('a b')));
    expect(mustOk(productNameKey('  a\t\tb\n'))).toBe(mustOk(productNameKey('a b')));
  });

  it('PROPOSED: leading/trailing and repeated spaces are collapsed', () => {
    expect(mustOk(productNameKey('  کوکا   زیرو  '))).toBe(mustOk(productNameKey('کوکا زیرو')));
  });

  it('PROPOSED: Arabic comma, Persian semicolon and dash variants are unified', () => {
    expect(mustOk(productNameKey('a،b'))).toBe(mustOk(productNameKey('a,b')));
    expect(mustOk(productNameKey('a–b'))).toBe(mustOk(productNameKey('a-b')));
    expect(mustOk(productNameKey('a—b'))).toBe(mustOk(productNameKey('a-b')));
  });

  it('PROPOSED: parentheses are PRESERVED (they can be part of an official name)', () => {
    expect(mustOk(productNameKey('روغن (۵ لیتری)'))).toContain('(');
    expect(mustOk(productNameKey('روغن (۵ لیتری)'))).not.toBe(mustOk(productNameKey('روغن ۵ لیتری')));
  });
});

// ===========================================================================
// بخشِ ۳ — یونیکد
// ===========================================================================
describe('C11 / 3 — Unicode', () => {
  it('CURRENT: NFC makes NFD input equivalent', () => {
    expect(normalizeText('é')).toBe(normalizeText('e\u0301'));
  });

  it('PROPOSED: NFC (names/aliases) also equates NFD input', () => {
    expect(mustOk(productNameKey('é'))).toBe(mustOk(productNameKey('e\u0301')));
  });

  it('PROPOSED: ProductNameLatin uses NFKC so full-width Latin folds', () => {
    expect(mustOk(productNameLatinKey('ＡＢＣ'))).toBe(mustOk(productNameLatinKey('ABC')));
  });

  it('PROPOSED: ProductName (Persian) keeps full-width Latin distinct from ASCII', () => {
    // عمدی: NFC (نه NFKC) چون NFKC برای فارسی ریسکِ تغییرِ معنایی دارد.
    expect(mustOk(productNameKey('ＡＢＣ'))).not.toBe(mustOk(productNameKey('ABC')));
  });

  it('PROPOSED: case folding is deterministic and locale-independent', () => {
    expect(mustOk(productNameKey('ABC'))).toBe('abc');
    // نقطهٔ حساس: 'I' در ترکی استانبولی میشود 'ı' با toLocaleLowerCase؛ اینجا نه.
    expect(mustOk(productNameKey('I'))).toBe('i');
  });

  it('PROPOSED: combining marks beyond diacritics are handled via NFC', () => {
    expect(mustOk(productNameKey('a\u0308'))).toBe(mustOk(productNameKey('ä')));
  });
});

// ===========================================================================
// بخشِ ۴ — بارکد و کد
// ===========================================================================
describe('C11 / 4 — barcodes & codes', () => {
  it('CURRENT: normalizeBarcode strips ALL spaces', () => {
    expect(normalizeBarcode('123 456')).toBe('123456');
  });

  it('CURRENT: normalizeText preserves an internal space (asymmetry with barcode)', () => {
    expect(normalizeText('123 456')).toBe('123 456');
    expect(normalizeText('123 456')).not.toBe(normalizeBarcode('123 456'));
  });

  it('PROPOSED: Barcode strips spaces and dash separators', () => {
    expect(mustOk(barcodeKey('123 456'))).toBe('123456');
    expect(mustOk(barcodeKey('123-456'))).toBe('123456');
    expect(mustOk(barcodeKey('123–456'))).toBe('123456');
  });

  it('PROPOSED: Barcode NEVER drops leading zeros', () => {
    expect(mustOk(barcodeKey('007'))).toBe('007');
    expect(mustOk(barcodeKey('007'))).not.toBe(mustOk(barcodeKey('7')));
    expect(mustOk(barcodeKey('0012 3456'))).toBe('00123456');
  });

  it('PROPOSED: Barcode folds Persian/Arabic digits', () => {
    expect(mustOk(barcodeKey('۱۲۳۴۵'))).toBe('12345');
    expect(mustOk(barcodeKey('١٢٣٤٥'))).toBe('12345');
  });

  it('PROPOSED: Barcode accepts alphanumeric internal codes, rejects malformed input', () => {
    expect(mustOk(barcodeKey('INT-0042'))).toBe('int0042');
    expect(isRejected(barcodeKey(''))).toBe(true);
    expect(isRejected(barcodeKey('   '))).toBe(true);
    expect(isRejected(barcodeKey('12@34'))).toBe(true);
    expect(isRejected(barcodeKey('۱۲٣٤#'))).toBe(true);
  });

  it('PROPOSED: ProductCode preserves leading zeros and rejects internal spaces', () => {
    expect(mustOk(productCodeKey('007'))).toBe('007');
    expect(mustOk(productCodeKey('007'))).not.toBe(mustOk(productCodeKey('7')));
    expect(isRejected(productCodeKey('AB 12'))).toBe(true);
    expect(mustOk(productCodeKey('AB-12'))).toBe('ab-12');
    expect(mustOk(productCodeKey('۱۲۳'))).toBe('123');
  });

  it('PROPOSED: ProductCode rejects non-code characters rather than silently stripping', () => {
    expect(isRejected(productCodeKey('AB/12'))).toBe(true);
    expect(isRejected(productCodeKey('AB#12'))).toBe(true);
    expect(isRejected(productCodeKey(''))).toBe(true);
  });

  it('OPEN-DECISION (D-C11-1): barcode check-digit validation is NOT implemented', () => {
    // عمداً هیچ اعتبارسنجیِ رقمِ کنترلی (EAN-13/UPC) اضافه نشد: نیازمندِ تصمیمِ
    // کسب‌وکار دربارهٔ منبعِ رسمیِ رقمِ کنترلی و رفتار با بارکدهای داخلی است.
    expect(mustOk(barcodeKey('4006381333931'))).toBe('4006381333931'); // EAN-13 معتبر
    expect(mustOk(barcodeKey('4006381333932'))).toBe('4006381333932'); // رقمِ کنترلیِ نادرست، ولی پذیرفته
  });
});

// ===========================================================================
// بخشِ ۵ — یکنواختیِ پروفایل‌ها و تفکیکِ سه‌لایه
// ===========================================================================
describe('C11 / 5 — profile discipline', () => {
  it('every profile is deterministic: same input twice → same key', () => {
    const ids = PROFILE_SPECS.map((p) => p.id);
    for (const id of ids) {
      const a = keyFor(id, 'نمونه‌ی آزمون ۱۲۳ ABC');
      const b = keyFor(id, 'نمونه‌ی آزمون ۱۲۳ ABC');
      expect(a).toEqual(b);
    }
  });

  it('profiles are independent: at least two profiles disagree on the same input', () => {
    const input = '123-456';
    const barcode = mustOk(barcodeKey(input)); // removes dash
    const alias = mustOk(productAliasKey(input)); // keeps dash
    expect(barcode).toBe('123456');
    expect(alias).toBe('123-456');
    expect(barcode).not.toBe(alias);
  });

  it('SearchKey is the most permissive (empty allowed, punctuation removed)', () => {
    expect(searchKey('')).toEqual({ ok: true, key: '' });
    expect(mustOk(searchKey('(۱۲۳)'))).toBe('123');
    expect(mustOk(searchKey('ABC-12'))).toBe('abc 12');
  });

  it('normalization never mutates the raw display value (keys are derived only)', () => {
    const raw = '  کوکا‌زیرو (۱۲۳)  ';
    const key = mustOk(productNameKey(raw));
    expect(raw).toBe('  کوکا‌زیرو (۱۲۳)  '); // ورودی دست‌نخورده
    expect(key).not.toBe(raw); // کلید مشتق‌شده است
  });

  it('all profiles preserve leading zeros (business safety rule)', () => {
    for (const p of PROFILE_SPECS) {
      if (p.id === 'SearchKey') continue; // جست‌وجو قراردادِ یکتایی ندارد
      expect(p.preserves_leading_zeros).toBe(true);
    }
  });
});

// ===========================================================================
// بخشِ ۶ — تصمیم‌های بازِ کسب‌وکار (تست فقط مستند می‌کند، قضاوت نمی‌کند)
// ===========================================================================
describe('C11 / 6 — open business decisions (documented, not decided)', () => {
  const openDecisions = [
    {
      id: 'D-C11-1',
      topic_fa: 'اعتبارسنجیِ رقمِ کنترلیِ بارکد (EAN/UPC)',
      current: 'هیچ اعتبارسنجی‌ای وجود ندارد',
      options: ['بدونِ اعتبارسنجی (وضعیت فعلی)', 'اعتبارسنجی فقط برای نوعِ gs1_*', 'اعتبارسنجی برای همه'],
      needs: 'منبعِ رسمیِ رقمِ کنترلی + رفتار با بارکدهای داخلی',
    },
    {
      id: 'D-C11-2',
      topic_fa: 'ادغامِ «آ/ا» و «أ/ا»',
      current: 'ادغام نمی‌شوند (تصمیمِ C11)',
      options: ['حفظِ تفکیک (پیشنهادِ C11)', 'ادغام در پروفایلِ SearchKey فقط', 'ادغام در همه'],
      needs: 'شاهدِ دادهٔ واقعی از C10: آیا نام‌هایی وجود دارد که فقط با آ/ا فرق کنند؟',
    },
    {
      id: 'D-C11-3',
      topic_fa: 'حساسیتِ کدِ کالا به بزرگی/کوچکیِ حروف',
      current: 'قیدِ DB case-sensitive است ولی جست‌وجو/برخورد با lower() انجام می‌شود',
      options: ['یکتاییِ case-insensitive (پیشنهادِ C11)', 'حفظِ وضعیت فعلی'],
      needs: 'تأییدِ مالک + گزارشِ تعارضِ پیش‌پرواز',
    },
    {
      id: 'D-C11-4',
      topic_fa: 'خطِ تیره در بارکد',
      current: 'در ذخیره‌سازی حذف نمی‌شود؛ در قراردادِ نامزد حذف می‌شود',
      options: ['حذف به‌عنوان جداکنندهٔ نمایشی (پیشنهادِ C11)', 'حفظ به‌عنوان کاراکترِ معنادار'],
      needs: 'تأییدِ مالکِ انبار دربارهٔ برچسب‌های موجود',
    },
    {
      id: 'D-C11-5',
      topic_fa: 'یکسان‌سازیِ نیم‌فاصله با فاصله',
      current: 'متفاوت‌اند',
      options: ['یکی‌سازی (پیشنهادِ C11)', 'حفظِ تفکیک'],
      needs: 'تأییدِ مالک؛ ریسکِ ادغامِ «کوکا‌زیرو» با «کوکا زیرو»',
    },
    {
      id: 'D-C11-6',
      topic_fa: 'پروفایلِ جست‌وجو در سمتِ وب (normalizeFa)',
      current: 'وب اعراب را حذف و ZWNJ را فاصله می‌کند، ولی API اصلاً نرمال نمی‌کند',
      options: ['تطبیقِ وب با SearchKey (پیشنهادِ C11)', 'حفظِ وضعیت فعلی'],
      needs: 'تصمیمِ هم‌زمان‌سازیِ سرور/کلاینت',
    },
  ];

  it('documents every open decision with options and required evidence', () => {
    expect(openDecisions.length).toBeGreaterThanOrEqual(6);
    for (const d of openDecisions) {
      expect(d.id).toMatch(/^D-C11-\d+$/);
      expect(d.options.length).toBeGreaterThanOrEqual(2);
      expect(d.needs.length).toBeGreaterThan(0);
    }
    console.log(`C11-DECISIONS|${JSON.stringify(openDecisions)}`);
  });

  it('the candidate contract makes NO decision on these items (no silent defaults)', () => {
    // «آ» و «ا» عمداً جدا می‌مانند تا تصمیمِ مالک گرفته نشود.
    expect(mustOk(productNameKey('آب'))).not.toBe(mustOk(productNameKey('اب')));
    expect(mustOk(productNameKey('أحمد'))).not.toBe(mustOk(productNameKey('احمد')));
  });
});

// ===========================================================================
// بخشِ ۷ — نقشهٔ فراخوانی: تفاوتِ سه نرمال‌سازِ موجود در یک نگاه
// ===========================================================================
describe('C11 / 7 — three divergent normalizers must be reconciled', () => {
  const samples = ['علي', 'كوكا', '۱۲۳', 'ABC', '  a   b  ', 'کوکا\u200cزیرو'];

  it('shows that product-normalize.normalizeText and reference-data.normalizeText differ', () => {
    const rows = samples.map((s) => ({
      input: s,
      product: normalizeText(s),
      reference: referenceNormalizeText(s),
      same: normalizeText(s) === referenceNormalizeText(s),
    }));
    console.log(`C11-DIVERGENCE|${JSON.stringify(rows)}`);
    expect(rows.some((r) => !r.same)).toBe(true); // واگرایی اثبات شد
  });

  it('CURRENT product-normalize does not fold ك but reference-data does', () => {
    expect(normalizeText('كوكا')).toBe('كوكا');
    expect(referenceNormalizeText('كوكا')).toBe('کوکا');
  });

  it('CURRENT product-normalize folds digits but reference-data does not', () => {
    expect(normalizeText('۱۲۳')).toBe('123');
    expect(referenceNormalizeText('۱۲۳')).toBe('۱۲۳');
  });
});

// ===========================================================================
// بخشِ ۸ — الزامِ عدمِ فعال‌سازی: ماژولِ نامزد نباید در مسیرِ تولید باشد
// ===========================================================================
describe('C11 / 8 — isolation guard', () => {
  it('the candidate module must not be imported by production code', async () => {
    const { execSync } = await import('node:child_process');
    // فقط «import واقعی» شمرده می‌شود، نه هر رخدادِ متنی. وگرنه فهرستِ allowlistِ
    // خودِ تست‌ها (که نامِ فایل را به‌صورتِ رشته دارد) باعثِ مثبتِ کاذب می‌شود.
    const cmd =
      "grep -rEl \"from '[^']*product-identity-normalization\\.candidate'\" src test --include=*.ts || true";
    let out = '';
    try {
      out = execSync(cmd, { cwd: process.cwd(), encoding: 'utf8' });
    } catch {
      out = '';
    }
    const files = out
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean)
      .filter((f) => !f.endsWith('product-identity-normalization.candidate.ts'));
    // مصرف‌کنندهٔ مجاز: فقط ماژول‌های آزمایشیِ C12 و تست‌هایشان (همه زیرِ experimental/ یا test/)
    const forbidden = files.filter(
      (f) => !/^(src\/modules\/master-data\/experimental\/shadow-identity-(index|migration)\.candidate\.ts|test\/c1[12]-.*\.test\.ts|test\/fixtures\/c12-.*\.ts)$/.test(f),
    );
    expect(forbidden, `production import of the candidate module: ${forbidden.join(', ')}`).toEqual([]);
  });
});
