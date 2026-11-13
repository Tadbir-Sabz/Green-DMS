/**
 * TASK-PM-02-C13 — fixture مصنوعیِ هویتِ بین‌میدانی.
 *
 * ⚠️ **۱۰۰٪ ساختگی.** هیچ دادهٔ سازمانی، هیچ نامِ واقعیِ مشتری، هیچ بارکدِ واقعی.
 * نام‌ها و کدها عمداً بی‌معنا و ساختگی‌اند تا هیچ ادعایی دربارهٔ دادهٔ واقعی نشود.
 *
 * این fixture برای هر جفت‌میدانِ جدولِ مقایسه عمداً یک نمونهٔ تعارضی و یک نمونهٔ
 * «شبیه ولی مجاز» دارد، تا اثبات شود که موتور «هر شباهتِ متنی را تعارض نمی‌داند».
 */

import type { IdentityRow } from '../../src/modules/master-data/experimental/cross-field-identity.candidate';

export const COMPANY_A = 'company-synth-A';
export const COMPANY_B = 'company-synth-B';
export const COMPANY_C = 'company-synth-C';

export const DOMAIN_A1 = 'domain-A-retail';
export const DOMAIN_A2 = 'domain-A-wholesale';

/**
 * مجموعهٔ اصلی.
 *
 * هر بلوک با کامنتِ «چرا» مستند شده تا حتی بدونِ خواندنِ تست، نیت روشن باشد.
 */
export const CROSS_FIELD_FIXTURE: readonly IdentityRow[] = [
  // ══════════════════════════════════════════════════════════════════════════
  // ۱) CF-10 — قلبِ C13: alias با فاصله در برابرِ بارکدِ بی‌فاصله
  //    alias «400 111» → فضای scan → «400111»
  //    barcode «400111» → فضای scan → «400111»   ⇒ برخورد
  //    امروز این برخورد دیده نمی‌شود چون کلیدِ alias فاصله را نگه می‌دارد.
  // ══════════════════════════════════════════════════════════════════════════
  { entity_id: 'A-p01', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'alias', display_value: '400 111', stored_normalized: '400 111', source_ref: 'A-p01-alias' },
  { entity_id: 'A-p02', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'barcode', display_value: '400111', stored_normalized: '400111', source_ref: 'A-p02-barcode' },

  // ══════════════════════════════════════════════════════════════════════════
  // ۲) alias ↔ code  (فضای alnum)
  //    alias «ZX-77» و code «ZX 77» ⇒ هر دو «zx 77» در فضای alnum
  // ══════════════════════════════════════════════════════════════════════════
  { entity_id: 'A-p03', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'alias', display_value: 'ZX-77', stored_normalized: 'ZX-77', source_ref: 'A-p03-alias' },
  { entity_id: 'A-p04', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'code', display_value: 'ZX 77', stored_normalized: 'ZX 77', source_ref: 'A-p04-code' },

  // ══════════════════════════════════════════════════════════════════════════
  // ۳) code ↔ barcode  (فضای scan)
  // ══════════════════════════════════════════════════════════════════════════
  { entity_id: 'A-p05', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'code', display_value: 'QR-9', stored_normalized: 'QR-9', source_ref: 'A-p05-code' },
  { entity_id: 'A-p06', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'barcode', display_value: 'qr9', stored_normalized: 'qr9', source_ref: 'A-p06-barcode' },

  // ══════════════════════════════════════════════════════════════════════════
  // ۴) alias ↔ name  (فضای text) — soft، نه hard
  //    «شیر کم‌چرب» نامِ یک کالا و alias کالای دیگر
  // ══════════════════════════════════════════════════════════════════════════
  { entity_id: 'A-p07', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'name', display_value: 'شیر کم‌چرب', stored_normalized: 'شیر کم‌چرب', source_ref: 'A-p07-name' },
  { entity_id: 'A-p08', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'alias', display_value: 'شیر کم چرب', stored_normalized: 'شیر کم چرب', source_ref: 'A-p08-alias' },

  // ══════════════════════════════════════════════════════════════════════════
  // ۵) barcode ↔ name — باید NOT_COMPARABLE باشد، نه تعارض
  //    name «500222» عمداً عددی است تا وسوسهٔ برخورد بسازد
  // ══════════════════════════════════════════════════════════════════════════
  { entity_id: 'A-p09', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'name', display_value: '500222', stored_normalized: '500222', source_ref: 'A-p09-name' },
  { entity_id: 'A-p10', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'barcode', display_value: '500222', stored_normalized: '500222', source_ref: 'A-p10-barcode' },

  // ══════════════════════════════════════════════════════════════════════════
  // ۶) همان کالا: code = barcode ⇒ مستثنا، نه تعارض
  // ══════════════════════════════════════════════════════════════════════════
  { entity_id: 'A-p11', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'code', display_value: '7770001', stored_normalized: '7770001', source_ref: 'A-p11-code' },
  { entity_id: 'A-p11', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'barcode', display_value: '7770001', stored_normalized: '7770001', source_ref: 'A-p11-barcode' },

  // ══════════════════════════════════════════════════════════════════════════
  // ۷) name_latin ↔ alias  (فضای text)
  // ══════════════════════════════════════════════════════════════════════════
  { entity_id: 'A-p12', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'name_latin', display_value: 'Blue Widget', stored_normalized: 'blue widget', source_ref: 'A-p12-name_latin' },
  { entity_id: 'A-p13', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'alias', display_value: 'blue  widget', stored_normalized: 'blue  widget', source_ref: 'A-p13-alias' },

  // ══════════════════════════════════════════════════════════════════════════
  // ۸) هم‌میدانی: دو کالا کدِ یکسان ⇒ HARD
  // ══════════════════════════════════════════════════════════════════════════
  { entity_id: 'A-p14', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'code', display_value: 'K-100', stored_normalized: 'K-100', source_ref: 'A-p14-code' },
  { entity_id: 'A-p15', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'code', display_value: 'k-100', stored_normalized: 'k-100', source_ref: 'A-p15-code' },

  // ══════════════════════════════════════════════════════════════════════════
  // ۹) هم‌میدانی: دو کالا بارکدِ یکسان با صفرِ ابتدایی ⇒ HARD
  //    «007» و «007» — صفرِ ابتدایی حفظ می‌شود (D-C11-1)
  // ══════════════════════════════════════════════════════════════════════════
  { entity_id: 'A-p16', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'barcode', display_value: '007', stored_normalized: '007', source_ref: 'A-p16-barcode' },
  { entity_id: 'A-p17', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'barcode', display_value: '0-0-7', stored_normalized: '0-0-7', source_ref: 'A-p17-barcode' },

  // ══════════════════════════════════════════════════════════════════════════
  // ۱۰) هم‌میدانی: نامِ یکسان ⇒ SOFT (نه hard — نام‌ها می‌توانند مشروع مشترک باشند)
  // ══════════════════════════════════════════════════════════════════════════
  { entity_id: 'A-p18', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'name', display_value: 'ماست ساده', stored_normalized: 'ماست ساده', source_ref: 'A-p18-name' },
  { entity_id: 'A-p19', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'name', display_value: 'ماست  ساده', stored_normalized: 'ماست  ساده', source_ref: 'A-p19-name' },

  // ══════════════════════════════════════════════════════════════════════════
  // ۱۱) تکرارِ همان کالا در همان میدان ⇒ ALLOWED (اصلاحِ عمدیِ C12)
  // ══════════════════════════════════════════════════════════════════════════
  { entity_id: 'A-p20', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'alias', display_value: 'dupealias', stored_normalized: 'dupealias', source_ref: 'A-p20-alias-1' },
  { entity_id: 'A-p20', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'alias', display_value: 'DUPEALIAS', stored_normalized: 'DUPEALIAS', source_ref: 'A-p20-alias-2' },

  // ══════════════════════════════════════════════════════════════════════════
  // ۱۲) بین‌شرکتی: همان بارکد در B و C ⇒ ALLOWED (با پوشاندنِ اجباری)
  //     A عمداً این بارکد را ندارد تا برخوردِ درون‌شرکتی ساخته نشود.
  // ══════════════════════════════════════════════════════════════════════════
  { entity_id: 'B-p01', company_id: COMPANY_B, domain_id: COMPANY_B, field: 'barcode', display_value: '900333', stored_normalized: '900333', source_ref: 'B-p01-barcode' },
  { entity_id: 'C-p01', company_id: COMPANY_C, domain_id: COMPANY_C, field: 'barcode', display_value: '900333', stored_normalized: '900333', source_ref: 'C-p01-barcode' },

  // ══════════════════════════════════════════════════════════════════════════
  // ۱۳) بین‌دامنه در همان شرکت: همان کد در دو دامنهٔ A ⇒ MANUAL_REVIEW
  // ══════════════════════════════════════════════════════════════════════════
  { entity_id: 'A-p21', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'code', display_value: 'DOM-55', stored_normalized: 'DOM-55', source_ref: 'A-p21-code' },
  { entity_id: 'A-p22', company_id: COMPANY_A, domain_id: DOMAIN_A2, field: 'code', display_value: 'DOM-55', stored_normalized: 'DOM-55', source_ref: 'A-p22-code' },

  // ══════════════════════════════════════════════════════════════════════════
  // ۱۳-الف) name ↔ code ⇒ MANUAL_REVIEW
  //     نامِ «K-100» در فضای alnum با کدِ «K-100» (کالای دیگر) یکی می‌شود.
  // ══════════════════════════════════════════════════════════════════════════
  { entity_id: 'A-p30', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'name', display_value: 'K-100', stored_normalized: 'k-100', source_ref: 'A-p30-name' },

  // ══════════════════════════════════════════════════════════════════════════
  // ۱۴) name ↔ name_latin ⇒ MANUAL_REVIEW (نویسه‌گردانی اثبات‌پذیر نیست)
  // ══════════════════════════════════════════════════════════════════════════
  { entity_id: 'A-p23', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'name', display_value: 'abc', stored_normalized: 'abc', source_ref: 'A-p23-name' },
  { entity_id: 'A-p24', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'name_latin', display_value: 'ABC', stored_normalized: 'abc', source_ref: 'A-p24-name_latin' },

  // ══════════════════════════════════════════════════════════════════════════
  // ۱۵) ورودیِ نامعتبر — باید با دلیل ثبت شود، نه حذفِ بی‌صدا
  // ══════════════════════════════════════════════════════════════════════════
  { entity_id: 'A-p25', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'code', display_value: 'AB/99', stored_normalized: 'AB/99', source_ref: 'A-p25-code' },

  // ══════════════════════════════════════════════════════════════════════════
  // ۱۶) نام‌هایِ فارسی با ي/ك عربی ⇒ هم‌میدانی soft (فقط رسم‌الخط)
  // ══════════════════════════════════════════════════════════════════════════
  { entity_id: 'A-p26', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'name', display_value: 'پنير گouda', stored_normalized: 'پنير گouda', source_ref: 'A-p26-name' },
  { entity_id: 'A-p27', company_id: COMPANY_A, domain_id: DOMAIN_A1, field: 'name', display_value: 'پنیر گouda', stored_normalized: 'پنیر گouda', source_ref: 'A-p27-name' },
];

/** مجموعهٔ خالی */
export const EMPTY_FIXTURE: readonly IdentityRow[] = [];

/** یک ردیف — هیچ جفتی ممکن نیست */
export const SINGLE_FIXTURE: readonly IdentityRow[] = [
  { entity_id: 'S-p1', company_id: COMPANY_A, field: 'alias', display_value: 'lonely', stored_normalized: 'lonely', source_ref: 'S-p1-alias' },
];

/**
 * مجموعهٔ بزرگ برای کارایی.
 *
 * ساختار عمدی: برای هر `i`، یک مثلثِ (alias, barcode, code) با مقادیرِ هم‌ارز در
 * فضای scan ساخته می‌شود تا موتور مجبور شود واقعاً کار کند، نه اینکه همه بی‌برخورد
 * باشند. هر ۱۰ کالا یک بار نامِ مشترک می‌گیرند تا soft هم تولید شود.
 */
export function makeLargeCrossFieldFixture(n: number, companies = 3): readonly IdentityRow[] {
  const rows: IdentityRow[] = [];
  const companyOf = (i: number): string => `company-synth-${String.fromCharCode(65 + (i % companies))}`;

  for (let i = 0; i < n; i += 1) {
    const c = companyOf(i);
    const e = `${c}-e${i}`;
    // مثلثِ هم‌ارز در فضای scan: «8-{i} 0» ≡ «8{i}0» ≡ «8{i}0»
    rows.push({
      entity_id: e, company_id: c, field: 'alias',
      display_value: `8-${i} 0`, stored_normalized: `8-${i} 0`,
      source_ref: `${e}-alias`,
    });
    rows.push({
      entity_id: `${e}-x`, company_id: c, field: 'barcode',
      display_value: `8${i}0`, stored_normalized: `8${i}0`,
      source_ref: `${e}-barcode`,
    });
    rows.push({
      entity_id: `${e}-y`, company_id: c, field: 'code',
      display_value: `8-${i}-0`, stored_normalized: `8-${i}-0`,
      source_ref: `${e}-code`,
    });
    // هر ۱۰ ردیف، یک نامِ مشترک در همان شرکت ⇒ soft
    if (i % 10 === 0) {
      const shared = `shared name ${Math.floor(i / 10)}`;
      rows.push({ entity_id: `${e}-n1`, company_id: c, field: 'name', display_value: shared, stored_normalized: shared, source_ref: `${e}-name1` });
      rows.push({ entity_id: `${e}-n2`, company_id: c, field: 'name', display_value: shared, stored_normalized: shared, source_ref: `${e}-name2` });
    }
  }
  return rows;
}
