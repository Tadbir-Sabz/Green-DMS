/**
 * TASK-PM-02-C12 — مجموعهٔ دادهٔ ساختگی برای شاخصِ سایه و شبیه‌سازیِ مهاجرت.
 *
 * ⚠️ **همه ساختگی‌اند.** هیچ نامِ سازمانی، کدِ واقعی یا دادهٔ مشتری در این فایل نیست.
 * شرکت‌ها «آزمایشی-الف» و «آزمایشی-ب» هستند و کدها الگوهای ساختگی‌اند.
 *
 * هدف: پوششِ هر ۱۲ دستهٔ برخورد + حالت‌های لبهٔ یونیکد/فارسی/بارکد + چند شرکت.
 */

import type { IdentityRecord } from '../../src/modules/master-data/experimental/shadow-identity-migration.candidate';

const A = 'company-fixture-A';
const B = 'company-fixture-B';

export const COMPANY_A = A;
export const COMPANY_B = B;

/**
 * مجموعهٔ «کوچک» — تراکمِ بالای برخورد، طراحی‌شده تا هر دسته حداقل یک نمونه داشته باشد.
 */
export const SMALL_FIXTURE: readonly IdentityRecord[] = [
  // --- شرکت الف: علی/علي (برخوردِ حرفی) ---
  { row_id: 'A-p1-name', entity_id: 'A-p1', company_id: A, field: 'name', display_value: 'علی رضایی', stored_normalized: 'علي رضايي' },
  { row_id: 'A-p2-name', entity_id: 'A-p2', company_id: A, field: 'name', display_value: 'علي رضایی', stored_normalized: 'علي رضايي' },

  // --- alias درونِ یک شرکت: كوكا/کوکا روی دو کالای متفاوت ---
  { row_id: 'A-p1-alias', entity_id: 'A-p1', company_id: A, field: 'alias', display_value: 'كوكا', stored_normalized: 'كوكا' },
  { row_id: 'A-p2-alias', entity_id: 'A-p2', company_id: A, field: 'alias', display_value: 'کوکا', stored_normalized: 'کوکا' },

  // --- تکرارِ عینی: همان کالا، همان alias، فاصلهٔ تکراری ---
  { row_id: 'A-p3-alias1', entity_id: 'A-p3', company_id: A, field: 'alias', display_value: 'نوشابه مشکی', stored_normalized: 'نوشابه مشکی' },
  { row_id: 'A-p3-alias2', entity_id: 'A-p3', company_id: A, field: 'alias', display_value: 'نوشابه   مشکی', stored_normalized: 'نوشابه مشکی' },

  // --- alias ↔ کدِ کالا ---
  { row_id: 'A-p4-code', entity_id: 'A-p4', company_id: A, field: 'code', display_value: 'AB-12', stored_normalized: 'AB-12' },
  { row_id: 'A-p5-alias', entity_id: 'A-p5', company_id: A, field: 'alias', display_value: 'ab-12', stored_normalized: 'ab-12' },

  // --- alias ↔ بارکد (با فاصله: امروز از دست می‌رود) ---
  { row_id: 'A-p6-barcode', entity_id: 'A-p6', company_id: A, field: 'barcode', display_value: '123 456', stored_normalized: '123456' },
  { row_id: 'A-p7-alias', entity_id: 'A-p7', company_id: A, field: 'alias', display_value: '123 456', stored_normalized: '123 456' },

  // --- برخوردِ بارکد: صفرِ ابتدایی و خطِ تیره ---
  { row_id: 'A-p8-barcode', entity_id: 'A-p8', company_id: A, field: 'barcode', display_value: '007', stored_normalized: '007' },
  { row_id: 'A-p9-barcode', entity_id: 'A-p9', company_id: A, field: 'barcode', display_value: '0-0-7', stored_normalized: '0-0-7' },

  // --- برخوردِ کدِ کالا با حروفِ متفاوت (case) ---
  { row_id: 'A-p10-code', entity_id: 'A-p10', company_id: A, field: 'code', display_value: 'SKU-9', stored_normalized: 'SKU-9' },
  { row_id: 'A-p11-code', entity_id: 'A-p11', company_id: A, field: 'code', display_value: 'sku-9', stored_normalized: 'sku-9' },

  // --- یونیکد: NFC/NFD ---
  { row_id: 'A-p12-name', entity_id: 'A-p12', company_id: A, field: 'name', display_value: 'Café', stored_normalized: 'café' },
  { row_id: 'A-p13-name', entity_id: 'A-p13', company_id: A, field: 'name', display_value: 'Cafe\u0301', stored_normalized: 'cafe\u0301' },

  // --- alias ↔ نامِ کالایِ دیگر (دستهٔ soft: نامِ جایگزین همان نامِ کالایِ دیگری است) ---
  { row_id: 'A-p15-name', entity_id: 'A-p15', company_id: A, field: 'name', display_value: 'شیر پرچرب', stored_normalized: 'شیر پرچرب' },
  { row_id: 'A-p16-alias', entity_id: 'A-p16', company_id: A, field: 'alias', display_value: 'شیر پرچرب', stored_normalized: 'شیر پرچرب' },

  // --- شرکت ب: همان کدها ⇒ برخوردِ بین‌شرکتی (اطلاع، نه تعارض) ---
  { row_id: 'B-p1-alias', entity_id: 'B-p1', company_id: B, field: 'alias', display_value: 'کوکا', stored_normalized: 'کوکا' },
  { row_id: 'B-p2-code', entity_id: 'B-p2', company_id: B, field: 'code', display_value: 'AB-12', stored_normalized: 'AB-12' },
  { row_id: 'B-p3-barcode', entity_id: 'B-p3', company_id: B, field: 'barcode', display_value: '123456', stored_normalized: '123456' },

  // --- نامِ لاتین با تمام‌عرض ---
  { row_id: 'A-p14-latin', entity_id: 'A-p14', company_id: A, field: 'name_latin', display_value: 'ＣＯＬＡ', stored_normalized: 'ｃｏｌａ' },
  { row_id: 'A-p15-latin', entity_id: 'A-p15', company_id: A, field: 'name_latin', display_value: 'cola', stored_normalized: 'cola' },

  // --- ورودیِ نامعتبر (کد با اسلش) ⇒ باید invalid شود، نه حذفِ بی‌صدا ---
  { row_id: 'A-p16-code', entity_id: 'A-p16', company_id: A, field: 'code', display_value: 'AB/99', stored_normalized: 'AB/99' },
];

/** مجموعهٔ «خالی» — کفایتِ مرزی */
export const EMPTY_FIXTURE: readonly IdentityRecord[] = [];

/** یک ردیفِ تنها — باید هیچ برخوردی تولید نکند */
export const SINGLE_FIXTURE: readonly IdentityRecord[] = [
  { row_id: 'S-1', entity_id: 'S-p1', company_id: A, field: 'alias', display_value: 'تنها', stored_normalized: 'تنها' },
];

/**
 * مجموعهٔ «بزرگ» — ساخته‌شده به‌صورتِ برنامه‌ای برای اندازه‌گیریِ کارایی.
 * تراکمِ برخورد ~۱۰٪ تا هر دو مسیرِ «بدونِ برخورد» و «برخورد» سنجیده شود.
 */
export function makeLargeFixture(n: number, companies = 3): readonly IdentityRecord[] {
  const out: IdentityRecord[] = [];
  const fields: Array<IdentityRecord['field']> = ['alias', 'code', 'barcode', 'name', 'name_latin'];
  for (let i = 0; i < n; i += 1) {
    const c = `company-fixture-${String.fromCharCode(65 + (i % companies))}`;
    const field = fields[i % fields.length];
    // هر ۱۰ ردیف یک «خوشهٔ برخورد» می‌سازد: دو ردیف با همان مقدارِ نرمال‌شده
    const bucket = Math.floor(i / 10);
    const collisionGroup = i % 10 < 2;
    const display =
      field === 'alias' || field === 'name'
        ? collisionGroup
          ? `کالای آزمایشی ${bucket}`
          : `کالای آزمایشی ${i}-${field}`
        : field === 'barcode'
          ? collisionGroup
            ? `900000${bucket}`
            : `90000${i}`
          : field === 'code'
            ? collisionGroup
              ? `SKU-${bucket}`
              : `SKU-${i}`
            : `Latin product ${i}`;
    out.push({
      row_id: `L-${i}`,
      entity_id: `L-p${i}`,
      company_id: c,
      field,
      display_value: display,
      // مقدارِ ذخیره‌شدهٔ «قدیمی» را کمی متفاوت می‌گذاریم تا مسیرِ recalc هم پوشش داده شود
      stored_normalized: collisionGroup ? display : `${display} `.trimEnd(),
    });
  }
  return out;
}
