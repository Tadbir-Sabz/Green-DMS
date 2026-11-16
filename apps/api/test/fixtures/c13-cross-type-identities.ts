/**
 * TASK-PM-02-C13XT — fixture مصنوعیِ برخوردِ بین‌نوعی.
 *
 * ⚠️ **۱۰۰٪ ساختگی.** هیچ دادهٔ سازمانی، هیچ نامِ واقعیِ مشتری، هیچ بارکدِ واقعی.
 * نام‌ها و کدها عمداً بی‌معنا و ساختگی‌اند تا هیچ ادعایی دربارهٔ دادهٔ واقعی نشود.
 *
 * هر بلوک با کامنتِ «چرا» مستند شده تا نیتِ تست بدونِ خواندنِ تست روشن باشد.
 */

import type { CrossTypeRow } from '../../src/modules/master-data/experimental/cross-type-collision.candidate';

export const COMPANY_A = 'company-synth-A';
export const COMPANY_B = 'company-synth-B';
export const COMPANY_C = 'company-synth-C';
export const DOMAIN_A1 = 'domain-A-retail';
export const DOMAIN_A2 = 'domain-A-wholesale';

export const CAT_1 = 'cat-synth-1';
export const CAT_2 = 'cat-synth-2';
export const FAM_1 = 'fam-synth-1';
export const FAM_2 = 'fam-synth-2';

const row = (
  entity_id: string,
  company_id: string,
  identity_type: CrossTypeRow['identity_type'],
  display_value: string,
  source_ref: string,
  extra: Partial<CrossTypeRow> = {},
): CrossTypeRow => ({
  entity_id,
  entity_type: extra.entity_type ?? 'product',
  company_id,
  domain_id: extra.domain_id,
  identity_type,
  subtype: extra.subtype ?? null,
  category_id: extra.category_id ?? null,
  family_id: extra.family_id ?? null,
  display_value,
  stored_normalized: extra.stored_normalized ?? display_value,
  source_ref,
});
export const CROSS_TYPE_ROW = row;

/** GTIN-13 معتبر (رقمِ کنترلی درست) */
export const GTIN_VALID = '4006381333931';
/** GTIN-13 با رقمِ کنترلیِ غلط */
export const GTIN_BAD_CHECK = '4006381333932';
/** UPC-A معتبر و EAN-13-ی که از آن تا می‌شود (هر دو رقمِ کنترلی درست) */
export const UPC_VALID = '036000291452';
export const EAN13_OF_UPC = '0036000291452';
/** GTIN-8 معتبر */
export const GTIN8_VALID = '12345670';
/** GTIN-14 معتبر (ITF-14) */
export const GTIN14_VALID = '12345678901231';

/**
 * مجموعهٔ اصلیِ crafted — هر بلوک یک سناریویِ مستند.
 */
export const CROSS_TYPE_FIXTURE: readonly CrossTypeRow[] = [
  // ══ ۱) کدِ کالا در دو شیوهٔ نوشتار (DB حساس به حروف، قرارداد نامحسوس) ══
  row('XT-p01', COMPANY_A, 'product_code', 'SKU-9', 'XT-p01-code', { category_id: CAT_1 }),
  row('XT-p02', COMPANY_A, 'product_code', 'sku-9', 'XT-p02-code', { category_id: CAT_2 }),

  // ══ ۲) alias شرکتی برای دو کالای متمایز (بدهیِ تاریخی؛ سرویس امروز ۴۰۹ می‌دهد) ══
  row('XT-p03', COMPANY_A, 'alias', 'زعفران اعلاء', 'XT-p03-alias', { subtype: 'brand_slang', category_id: CAT_1 }),
  row('XT-p04', COMPANY_A, 'alias', 'زعفران  اعلاء', 'XT-p04-alias', { subtype: 'brand_slang', category_id: CAT_1 }),

  // ══ ۳) همان کالا، دو ردیفِ alias یکسان ⇒ افزونگی، نه تعارض ══
  row('XT-p05', COMPANY_A, 'alias', 'my-brand', 'XT-p05-alias-1', { subtype: 'latin' }),
  row('XT-p05', COMPANY_A, 'alias', 'my-brand', 'XT-p05-alias-2', { subtype: 'latin' }),

  // ══ ۴) alias با فاصله در برابرِ بارکدِ بی‌فاصله (همان اصلِ CF-10، اینجا با مخزنِ قدیمی) ══
  row('XT-p06', COMPANY_A, 'alias', '400 111', 'XT-p06-alias', { subtype: 'code' }),
  row('XT-p07', COMPANY_A, 'barcode', '400111', 'XT-p07-barcode', { subtype: 'internal' }),

  // ══ ۵) کدِ کالا = بارکدِ کالای دیگر (scan: بارکد برنده) ══
  row('XT-p08', COMPANY_A, 'product_code', 'QR-9', 'XT-p08-code'),
  row('XT-p09', COMPANY_A, 'barcode', 'qr9', 'XT-p09-barcode', { subtype: 'internal' }),

  // ══ ۶) همان کالا: کد = بارکدِ خودش ⇒ ALLOWED ══
  row('XT-p10', COMPANY_A, 'product_code', '7770001', 'XT-p10-code'),
  row('XT-p10', COMPANY_A, 'barcode', '7770001', 'XT-p10-barcode', { subtype: 'internal' }),

  // ══ ۷) بارکدِ بسته‌بندی (قدیمی) = بارکدِ کانونیِ کالای دیگر ⇒ برخوردِ بین‌بازنمایی ══
  row('XT-p11', COMPANY_A, 'packaging_barcode', '400111', 'XT-p11-packaging', {}),
  //     (بارکدِ کانونیِ «400111» روی XT-p07 است — کالای دیگر)

  // ══ ۸) همان کالا: بارکدِ کانونی = بارکدِ بسته‌بندیِ خودش ⇒ افزونگی، ALLOWED ══
  row('XT-p12', COMPANY_A, 'product_code', '7770002', 'XT-p12-code'),
  row('XT-p12', COMPANY_A, 'barcode', '7770002', 'XT-p12-barcode', { subtype: 'internal' }),
  row('XT-p12', COMPANY_A, 'packaging_barcode', '7770002', 'XT-p12-packaging', {}),

  // ══ ۹) خانواده: دو خانواده با کدِ یکسان ⇒ drift قیدِ امروز ══
  row('XT-f01', COMPANY_A, 'family_code', 'FAM-100', 'XT-f01-family', { entity_type: 'product_family', family_id: FAM_1 }),
  row('XT-f02', COMPANY_A, 'family_code', 'fam-100', 'XT-f02-family', { entity_type: 'product_family', family_id: FAM_2 }),

  // ══ ۱۰) کدِ کالا = کدِ خانواده ══
  row('XT-p13', COMPANY_A, 'product_code', 'FAM-9', 'XT-p13-code'),
  row('XT-f03', COMPANY_A, 'family_code', 'fam-9', 'XT-f03-family', { entity_type: 'product_family', family_id: FAM_1 }),

  // ══ ۱۱) کدِ کالا = کدِ دسته ══
  row('XT-p14', COMPANY_A, 'product_code', 'CAT-7', 'XT-p14-code'),
  row('XT-c01', COMPANY_A, 'category_code', 'cat-7', 'XT-c01-category', { entity_type: 'product_category' }),

  // ══ ۱۲) کدِ خانواده = کدِ دسته ══
  row('XT-f04', COMPANY_A, 'family_code', '130', 'XT-f04-family', { entity_type: 'product_family', family_id: FAM_1 }),
  row('XT-c02', COMPANY_A, 'category_code', '130', 'XT-c02-category', { entity_type: 'product_category' }),

  // ══ ۱۳) variant_signature یکسان در دو خانواده ⇒ ابهامِ بین‌خانواده‌ای ══
  row('XT-p15', COMPANY_A, 'variant_signature', 'size:XL|color:red', 'XT-p15-vs', { family_id: FAM_1 }),
  row('XT-p16', COMPANY_A, 'variant_signature', 'size:XL|color:red', 'XT-p16-vs', { family_id: FAM_2 }),

  // ══ ۱۴) gs1 معتبر، دو کالای متمایز (شرکت A) — قیدِ جهانی باید جلویش را گرفته باشد ══
  row('XT-p17', COMPANY_A, 'barcode', GTIN_VALID, 'XT-p17-barcode', { subtype: 'gs1_ean13' }),
  row('XT-p18', COMPANY_A, 'barcode', GTIN_VALID, 'XT-p18-barcode', { subtype: 'gs1_ean13' }),

  // ══ ۱۵) gs1 در شرکت B؛ internal هم‌مقدار در شرکت A ⇒ «کورِ قید» در همان شرکت دیده می‌شود ══
  row('XT-p19', COMPANY_A, 'barcode', GTIN8_VALID, 'XT-p19-barcode', { subtype: 'internal' }),
  row('XT-p20', COMPANY_B, 'barcode', GTIN8_VALID, 'XT-p20-barcode', { subtype: 'gs1_ean8' }),

  // ══ ۱۶) UPC-A و EAN-13 هم‌ارزش (هر دو معتبر) برای دو کالای متمایز ══
  row('XT-p21', COMPANY_A, 'barcode', UPC_VALID, 'XT-p21-barcode', { subtype: 'gs1_upc' }),
  row('XT-p22', COMPANY_A, 'barcode', EAN13_OF_UPC, 'XT-p22-barcode', { subtype: 'gs1_ean13' }),

  // ══ ۱۷) رقمِ کنترلیِ غلط + طولِ نامعتبر ══
  row('XT-p23', COMPANY_A, 'barcode', GTIN_BAD_CHECK, 'XT-p23-barcode', { subtype: 'gs1_ean13' }),
  row('XT-p24', COMPANY_A, 'barcode', '12345', 'XT-p24-barcode', { subtype: 'gs1_ean13' }),

  // ══ ۱۸) بارکدِ داخلی با حروف — مجاز ══
  row('XT-p25', COMPANY_A, 'barcode', 'INT-A1', 'XT-p25-barcode', { subtype: 'internal' }),

  // ══ ۱۹) alias = بارکدِ internalِ همان شرکت (scan conflict) ══
  row('XT-p26', COMPANY_A, 'alias', '1000', 'XT-p26-alias', { subtype: 'code' }),
  row('XT-p27', COMPANY_A, 'barcode', '1000', 'XT-p27-barcode', { subtype: 'internal' }),

  // ══ ۲۰) نامِ لاتین = کد ══
  row('XT-p28', COMPANY_A, 'product_name_latin', 'K-100', 'XT-p28-namelatin'),
  row('XT-p29', COMPANY_A, 'product_code', 'k-100', 'XT-p29-code'),

  // ══ ۲۱) نامِ عددی = بارکد ⇒ NOT_COMPARABLE ══
  row('XT-p30', COMPANY_A, 'product_name', '500222', 'XT-p30-name'),
  row('XT-p31', COMPANY_A, 'barcode', '500222', 'XT-p31-barcode', { subtype: 'internal' }),

  // ══ ۲۲) کدِ یکسان در شرکت A و B ⇒ مجاز (دامنهٔ شرکت) ══
  row('XT-p32', COMPANY_A, 'product_code', 'XCO-1', 'XT-p32-code'),
  row('XT-p33', COMPANY_B, 'product_code', 'XCO-1', 'XT-p33-code'),

  // ══ ۲۳) بارکدِ داخلیِ هم‌مقدار در دو شرکت ⇒ پیش‌فرض مجاز؛ فقط با مصوبه گزارش ══
  row('XT-p34', COMPANY_A, 'barcode', '777555', 'XT-p34-barcode', { subtype: 'internal' }),
  row('XT-p35', COMPANY_B, 'barcode', '777555', 'XT-p35-barcode', { subtype: 'internal' }),

  // ══ ۲۴) بارکدِ بسته‌بندی برای دو کالای متمایز ⇒ drift قیدِ جهانی ══
  row('XT-p36', COMPANY_A, 'packaging_barcode', '880001', 'XT-p36-packaging', {}),
  row('XT-p37', COMPANY_A, 'packaging_barcode', '880001', 'XT-p37-packaging', {}),

  // ══ ۲۵) بارکدِ بسته‌بندی بدونِ نسخهٔ کانونی (drift تک‌طرفه) ══
  row('XT-p38', COMPANY_A, 'packaging_barcode', '910001', 'XT-p38-packaging', {}),

  // ══ ۲۶) بارکدِ بسته‌بندی که در مخزنِ کانونی به کالای دیگری گره خورده ══
  row('XT-p39', COMPANY_A, 'packaging_barcode', '920001', 'XT-p39-packaging', {}),
  row('XT-p40', COMPANY_A, 'barcode', '920001', 'XT-p40-barcode', { subtype: 'internal' }),

  // ══ ۲۷) بین‌دامنه‌ای در همان شرکت (A1 vs A2) — نباید با بین‌شرکتی اشتباه شود ══
  row('XT-p41', COMPANY_A, 'alias', 'domain-shared', 'XT-p41-alias', { subtype: 'latin', domain_id: DOMAIN_A1 }),
  row('XT-p42', COMPANY_A, 'alias', 'domain-shared', 'XT-p42-alias', { subtype: 'latin', domain_id: DOMAIN_A2 }),

  // ══ ۲۸) زنجیرهٔ اسکن: بارکد '60' روی A؛ کد '60' روی B ⇒ کد سایه می‌شود ══
  row('XT-p43', COMPANY_A, 'barcode', '60', 'XT-p43-barcode', { subtype: 'internal' }),
  row('XT-p44', COMPANY_A, 'product_code', '60', 'XT-p44-code'),

  // ══ ۲۹) زنجیرهٔ اسکن: کد '61' روی C؛ alias نوع code روی D ⇒ alias سایه می‌شود ══
  row('XT-p45', COMPANY_A, 'product_code', '61', 'XT-p45-code'),
  row('XT-p46', COMPANY_A, 'alias', '61', 'XT-p46-alias', { subtype: 'code' }),

  // ══ ۳۰) نامِ فارسی در برابرِ alias (هشدارِ نرم) ══
  row('XT-p47', COMPANY_A, 'product_name', 'شیر کم‌چرب', 'XT-p47-name'),
  row('XT-p48', COMPANY_A, 'alias', 'شیر  کم‌چرب', 'XT-p48-alias', { subtype: 'brand_slang' }),

  // ══ ۳۱) خانواده × کالا: alias یکی با family_code ══
  row('XT-p49', COMPANY_A, 'alias', 'FAM-77', 'XT-p49-alias', { subtype: 'latin' }),
  row('XT-f05', COMPANY_A, 'family_code', 'fam-77', 'XT-f05-family', { entity_type: 'product_family', family_id: FAM_1 }),

  // ══ ۳۲) GTIN-14 (ITF-14) معتبر ══
  row('XT-p50', COMPANY_A, 'barcode', GTIN14_VALID, 'XT-p50-barcode', { subtype: 'gs1_itf14' }),

  // ══ ۳۳) شرکت C هیچ‌چیزی ندارد — برای سناریوی fallback اسکن ══
  // (عمداً ردیفی در شرکت C نیست)

  // ══ ۳۴) GTIN معتبر در شرکت B؛ شرکت C خالی ⇒ fallback بین‌شرکتی برای C ══
  row('XT-p51', COMPANY_B, 'barcode', '4000000000013', 'XT-p51-barcode', { subtype: 'gs1_ean13' }),

  // ══ ۳۵) alias با subtype با حروفِ بزرگ ⇒ طبقه‌بندی + data-quality ══
  row('XT-p52', COMPANY_A, 'alias', 'CASE-TEST', 'XT-p52-alias', { subtype: 'Latin' }),

  // ══ ۳۶) subtype خارج از فهرست ══
  row('XT-p53', COMPANY_A, 'barcode', '999000111', 'XT-p53-barcode', { subtype: 'gs1_ean99' }),

  // ══ ۳۷) ردیف‌های ناقص — نباید کرش کنند ══
  { entity_id: '', entity_type: 'product', company_id: COMPANY_A, identity_type: 'product_code', subtype: null, display_value: 'X-1', stored_normalized: 'X-1', source_ref: 'bad-no-entity' },
  { entity_id: 'XT-p54', entity_type: 'product', company_id: '', identity_type: 'product_code', subtype: null, display_value: 'X-2', stored_normalized: 'X-2', source_ref: 'bad-no-company' },
  { entity_id: 'XT-p55', entity_type: 'product', company_id: COMPANY_A, identity_type: 'product_code', subtype: null, display_value: '   ', stored_normalized: '', source_ref: 'bad-empty-value' },
  { entity_id: 'XT-p56', entity_type: 'product', company_id: COMPANY_A, identity_type: 'bogus_type' as never, subtype: null, display_value: 'X-3', stored_normalized: 'X-3', source_ref: 'bad-type' },
  { entity_id: 'XT-p57', entity_type: 'product', company_id: COMPANY_A, identity_type: 'product_code', subtype: null, display_value: 'NO-REF', stored_normalized: 'NO-REF', source_ref: '' },

  // ══ ۳۸) ردیفِ کاملاً یکسانِ تکراری ══
  row('XT-p58', COMPANY_A, 'product_code', 'DUP-1', 'dup-identical', {}),
  row('XT-p58', COMPANY_A, 'product_code', 'DUP-1', 'dup-identical', {}),

  // ══ ۳۸-ب) کدِ کالا = بارکدِ بسته‌بندیِ کالای دیگر (بازنماییِ قدیمی در برابرِ کد) ══
  row('XT-p60', COMPANY_A, 'product_code', '3300-7', 'XT-p60-code'),
  row('XT-p61', COMPANY_A, 'packaging_barcode', '3300-7', 'XT-p61-packaging', {}),

  // ══ ۳۹-ب) دو کالا در یک خانواده با امضای یکسان ⇒ قیدِ خانواده را رد نمی‌کند ولی ابهام است ══
  row('XT-p62', COMPANY_A, 'variant_signature', 'color:blue', 'XT-p62-vs', { family_id: FAM_1 }),
  row('XT-p63', COMPANY_A, 'variant_signature', 'color:blue', 'XT-p63-vs', { family_id: FAM_1 }),

  // ══ شرکت C — ردیفِ بی‌ارتباط برای سناریوی fallback ══
  row('XT-p64', COMPANY_C, 'product_code', 'C-ONLY-1', 'XT-p64-code'),

  // ══ ۳۹) gs1 با صفرِ ابتدایی در هر دو مخزن برای یک کالا (افزونگیِ بازنمایی) ══
  row('XT-p59', COMPANY_A, 'barcode', GTIN_VALID, 'XT-p59-barcode', { subtype: 'gs1_ean13' }),
  row('XT-p59', COMPANY_A, 'packaging_barcode', GTIN_VALID, 'XT-p59-packaging', {}),
];

/**
 * مولدِ مصنوعیِ قطعی برای تست‌های کارایی و قطعیت.
 * هیچ دادهٔ واقعی استفاده نمی‌شود.
 */
export function generateSyntheticCrossTypeRows(
  products: number,
  seed = 42,
  companies = 2,
): CrossTypeRow[] {
  // LCG قطعی
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
  const rows: CrossTypeRow[] = [];
  for (let i = 0; i < products; i += 1) {
    const company = companies === 1 ? COMPANY_A : next() % companies === 0 ? COMPANY_B : COMPANY_A;
    const cat = next() % 3 === 0 ? CAT_2 : CAT_1;
    // سه کالا از هر ۵۰ تا، کد/alias/barcodeِ تکراریِ عمدی می‌گیرند تا برخورد ساخته شود
    const duplicateBucket = i % 50 < 3 ? Math.floor(i / 50) : -1;
    const codeSuffix = duplicateBucket >= 0 ? String(duplicateBucket).padStart(6, '0') : String(i).padStart(6, '0');
    rows.push({
      entity_id: `SYN-P-${String(i).padStart(6, '0')}`,
      entity_type: 'product',
      company_id: company,
      identity_type: 'product_code',
      subtype: null,
      category_id: cat,
      family_id: null,
      display_value: `SYN-${codeSuffix}`,
      stored_normalized: `syn-${codeSuffix}`,
      source_ref: `syn-code-${String(i).padStart(6, '0')}`,
    });
    // نیمی از کالاها barcode gs1 معتبر دارند (رقمِ کنترلی محاسبه می‌شود)
    if (next() % 2 === 0) {
      const base = String(1000000000000 + (next() % 899999999999)).padStart(13, '0').slice(0, 12);
      const digits = base + String(checkGtin13(base));
      const barcode = duplicateBucket >= 0 ? dupBarcode(duplicateBucket) : digits;
      rows.push({
        entity_id: `SYN-P-${String(i).padStart(6, '0')}`,
        entity_type: 'product',
        company_id: company,
        identity_type: 'barcode',
        subtype: 'gs1_ean13',
        category_id: cat,
        family_id: null,
        display_value: barcode,
        stored_normalized: barcode,
        source_ref: `syn-barcode-${String(i).padStart(6, '0')}`,
      });
    }
    // یک‌سوم کالاها alias دارند
    if (next() % 3 === 0) {
      const alias = duplicateBucket >= 0 ? `syn-dup-alias-${duplicateBucket}` : `syn-alias-${String(i).padStart(6, '0')}`;
      rows.push({
        entity_id: `SYN-P-${String(i).padStart(6, '0')}`,
        entity_type: 'product',
        company_id: company,
        identity_type: 'alias',
        subtype: 'brand_slang',
        category_id: cat,
        family_id: null,
        display_value: alias,
        stored_normalized: alias,
        source_ref: `syn-alias-${String(i).padStart(6, '0')}`,
      });
    }
  }
  return rows;
}

function checkGtin13(base12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i += 1) {
    const d = Number(base12[i]);
    sum += d * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

function dupBarcode(bucket: number): string {
  const base = String(400000000000 + bucket).padStart(12, '0');
  return base + String(checkGtin13(base));
}
