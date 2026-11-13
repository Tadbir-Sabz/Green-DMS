/**
 * TASK-PM-02-C12 — شاخصِ سایهٔ هویت (Shadow Identity Index) + موتورِ تشخیصِ برخورد.
 *
 * ⚠️ **آزمایشی و غیرفعال.** هیچ مسیرِ تولیدی این ماژول را import نمی‌کند.
 * تنها مصرف‌کنندگان: تست‌های `test/c12-*.test.ts`. تستِ ایزولاسیون (`C12 isolation`)
 * با grep اثبات می‌کند این ماژول بیرون از `experimental/` و فایل‌های تستِ C12
 * import نشده است.
 *
 * اصلِ طراحی
 *   ۱. **هیچ داده‌ای تغییر نمی‌کند.** این ماژول فقط می‌خواند و کلیدِ «نامزد» می‌سازد.
 *   ۲. **هیچ‌گاه مقدارِ نمایشی بازنویسی نمی‌شود** (اصلِ C11). خروجی همیشه در کنارِ
 *      مقدارِ اصلی و مقدارِ نرمال‌شدهٔ فعلی نگه داشته می‌شود.
 *   ۳. **مرزِ شرکت مقدس است.** برخورد فقط داخلِ `company_id` گزارش می‌شود؛ برخوردِ
 *      بین‌شرکتی *توسطِ قاعدهٔ کسب‌وکارِ مصوب* لازم است، وگرنه هرگز خودکار «تعارض»
 *      شمرده نمی‌شود.
 *   ۴. **قطعیت:** همان ورودی ⇒ همان کلید و همان شناسهٔ پایدارِ برخورد.
 */

import {
  keyFor,
  PROFILE_SPECS,
  type NormalizationProfileId,
  type ProfileResult,
  type ProfileFailure,
} from './product-identity-normalization.candidate';

/**
 * بازکردنِ نتیجهٔ پروفایل.
 * `apps/api/tsconfig.json` مقدارِ `strict: false` دارد، بنابراین narrowing خودکارِ
 * اتحادِ discriminated روی فیلدِ `ok` انجام نمی‌شود. این کمک‌کار همان تفکیک را
 * به‌صورتِ صریح و type-safe انجام می‌دهد.
 */
function unwrapProfile(res: ProfileResult<string>): { key: string | null; reason: string | null } {
  const r = res as { ok: boolean; key?: string; failure?: ProfileFailure };
  if (r.ok === true) return { key: r.key as string, reason: null };
  return { key: null, reason: (r.failure as ProfileFailure).code };
}

/** نسخهٔ قرارداد — هر تغییرِ معنایی باید این را بالا ببرد */
export const NORMALIZATION_CONTRACT_VERSION = 'c11.1';

// ---------------------------------------------------------------------------
// انواعِ ورودی/خروجی
// ---------------------------------------------------------------------------

/** یک ردیفِ هویتی از منبع (در تولید: از DB؛ در تست: از fixture ساختگی) */
export interface IdentitySourceRow {
  readonly entity_id: string;
  readonly company_id: string;
  /** نامِ میدان: name | name_latin | alias | code | barcode */
  readonly field: IdentityField;
  /** مقدارِ نمایشی که کاربر می‌بیند */
  readonly display_value: string;
  /** مقدارِ نرمال‌شدهٔ **موجودِ** ذخیره‌شده (alias_norm / barcode ذخیره‌شده / code خام) */
  readonly stored_normalized: string;
  /** شناسهٔ ردیفِ منبع (برای ردیابی) */
  readonly source_ref: string;
}

export type IdentityField = 'name' | 'name_latin' | 'alias' | 'code' | 'barcode';

/** نگاشتِ میدان به پروفایل — یک‌به‌یک و صریح */
export const FIELD_TO_PROFILE: Readonly<Record<IdentityField, NormalizationProfileId>> = Object.freeze({
  name: 'ProductName',
  name_latin: 'ProductNameLatin',
  alias: 'ProductAlias',
  code: 'ProductCode',
  barcode: 'Barcode',
});

/** یک ورودیِ شاخصِ سایه */
export interface ShadowEntry {
  readonly entity_id: string;
  readonly company_id: string;
  readonly field: IdentityField;
  readonly profile: NormalizationProfileId;
  readonly profile_version: string;
  readonly display_value: string;
  readonly stored_normalized: string;
  /** کلیدِ نامزد؛ null یعنی ورودی نامعتبر (با `invalid_reason`) */
  readonly proposed_key: string | null;
  readonly invalid_reason: string | null;
  /** آیا کلیدِ نامزد با مقدارِ ذخیره‌شدهٔ فعلی فرق دارد؟ */
  readonly key_differs_from_stored: boolean;
  readonly source_ref: string;
}

export interface ShadowIndex {
  readonly contract_version: string;
  readonly built_at_iso: string;
  readonly entries: readonly ShadowEntry[];
  readonly stats: {
    readonly rows_in: number;
    readonly entries: number;
    readonly invalid: number;
    readonly keys_changed: number;
    readonly by_field: Readonly<Record<string, number>>;
  };
}

// ---------------------------------------------------------------------------
// ساختِ شاخصِ سایه
// ---------------------------------------------------------------------------

/** ساعتِ تزریق‌پذیر تا خروجی در تست‌ها قطعی باشد */
export interface BuildOptions {
  readonly now?: () => Date;
}

export function buildShadowIndex(
  rows: readonly IdentitySourceRow[],
  opts: BuildOptions = {},
): ShadowIndex {
  const now = opts.now ?? (() => new Date());
  const entries: ShadowEntry[] = [];
  let invalid = 0;
  let changed = 0;
  const byField: Record<string, number> = {};

  for (const row of rows) {
    const profile = FIELD_TO_PROFILE[row.field];
    if (!profile) {
      // میدانِ ناشناخته ⇒ خطای صریح، نه نادیده‌گرفتنِ بی‌صدا
      throw new Error(`unknown identity field: ${String(row.field)}`);
    }
    const { key, reason } = unwrapProfile(keyFor(profile, row.display_value));
    if (reason !== null) invalid += 1;
    const differs = key !== null && key !== row.stored_normalized;
    if (differs) changed += 1;
    byField[row.field] = (byField[row.field] ?? 0) + 1;

    entries.push({
      entity_id: row.entity_id,
      company_id: row.company_id,
      field: row.field,
      profile,
      profile_version: NORMALIZATION_CONTRACT_VERSION,
      display_value: row.display_value,
      stored_normalized: row.stored_normalized,
      proposed_key: key,
      invalid_reason: reason,
      key_differs_from_stored: differs,
      source_ref: row.source_ref,
    });
  }

  return {
    contract_version: NORMALIZATION_CONTRACT_VERSION,
    built_at_iso: now().toISOString(),
    entries,
    stats: { rows_in: rows.length, entries: entries.length, invalid, keys_changed: changed, by_field: byField },
  };
}

// ---------------------------------------------------------------------------
// دسته‌های برخورد
// ---------------------------------------------------------------------------

export const COLLISION_CATEGORIES = [
  'exact_duplicate',
  'persian_arabic_letters',
  'unicode_normalization',
  'alias_to_alias',
  'alias_to_product_name',
  'alias_to_product_code',
  'alias_to_barcode',
  'product_code_collision',
  'barcode_collision',
  'cross_company',
  'legacy_vs_proposed',
  'search_only_equivalence',
] as const;

export type CollisionCategory = (typeof COLLISION_CATEGORIES)[number];

/** شدت: hard = یکتایی را نقض می‌کند · soft = هشدار · review = نیازمندِ تصمیمِ انسان */
export type CollisionSeverity = 'hard' | 'soft' | 'review';

export interface Collision {
  /** شناسهٔ **پایدار** و قطعی (مشتق از محتوا، نه از ترتیبِ پیمایش) */
  readonly collision_id: string;
  readonly category: CollisionCategory;
  readonly severity: CollisionSeverity;
  readonly company_id: string;
  /** چون برخوردِ بین‌شرکتی به‌طورِ پیش‌فرض مجاز است، همیشه false مگر قاعدهٔ مصوب */
  readonly crosses_company_boundary: boolean;
  readonly profile: NormalizationProfileId;
  readonly key: string;
  readonly parties: readonly {
    readonly entity_id: string;
    readonly field: IdentityField;
    readonly display_value: string;
    readonly source_ref: string;
  }[];
  /** توضیحِ فارسی برای اپراتور */
  readonly message_fa: string;
  /** آیا این برخورد با نرمال‌سازیِ **فعلی** هم دیده می‌شود؟ (legacy) */
  readonly visible_under_current_normalization: boolean;
  readonly provenance: readonly string[];
}

// ---------------------------------------------------------------------------
// کمک‌کارها
// ---------------------------------------------------------------------------

/** هشِ پایدار FNV-1a 32-bit — بدونِ وابستگی به crypto، قطعی */
function stableHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * شناسهٔ پایدارِ برخورد.
 *
 * قطعی و مستقل از ترتیب: از (دسته، شرکت، کلید، مجموعهٔ مرتب‌شدهٔ طرف‌ها) مشتق می‌شود.
 * اگر همان برخورد در اجرای دیگری دیده شود، همان شناسه را می‌گیرد ⇒ قابلِ ردیابی
 * در دفترِ تعارض و در حلِ دستی.
 */
export function collisionId(
  category: CollisionCategory,
  companyId: string,
  key: string,
  parties: readonly { entity_id: string; field: IdentityField }[],
): string {
  const partySig = parties
    .map((p) => `${p.entity_id}:${p.field}`)
    .sort()
    .join('|');
  return `COL-${category}-${stableHash(`${category}\u0000${companyId}\u0000${key}\u0000${partySig}`)}`;
}

function severityFor(category: CollisionCategory): CollisionSeverity {
  switch (category) {
    case 'alias_to_barcode':
    case 'alias_to_product_code':
    case 'product_code_collision':
    case 'barcode_collision':
      return 'hard';
    case 'exact_duplicate':
    case 'alias_to_alias':
      return 'hard';
    case 'alias_to_product_name':
    case 'persian_arabic_letters':
    case 'unicode_normalization':
    case 'legacy_vs_proposed':
      return 'soft';
    case 'cross_company':
      return 'review';
    case 'search_only_equivalence':
      return 'soft';
    default:
      return 'review';
  }
}

const MESSAGES_FA: Record<CollisionCategory, string> = {
  exact_duplicate: 'دو مقدار عیناً یکسان‌اند.',
  persian_arabic_letters: 'تفاوت فقط در رسم‌الخطِ عربی/فارسی است (ي/ی، ك/ک).',
  unicode_normalization: 'دو رشته پس از نرمال‌سازیِ یونیکد یکسان می‌شوند (NFC/NFD).',
  alias_to_alias: 'یک نام جایگزین برای بیش از یک کالا در همین شرکت ثبت شده است.',
  alias_to_product_name: 'نام جایگزین با نامِ کالای دیگری یکسان است.',
  alias_to_product_code: 'نام جایگزین با کدِ کالای دیگری یکسان است؛ اسکن دوپهلو می‌شود.',
  alias_to_barcode: 'نام جایگزین با بارکدِ کالای دیگری یکسان است؛ اسکن دوپهلو می‌شود.',
  product_code_collision: 'دو کالا در یک شرکت کدِ یکسان (پس از نرمال‌سازی) دارند.',
  barcode_collision: 'دو کالا در یک شرکت بارکدِ یکسان (پس از نرمال‌سازی) دارند.',
  cross_company: 'همین مقدار در شرکتِ دیگری هم وجود دارد؛ طبقِ مرزِ شرکت مجاز است.',
  legacy_vs_proposed: 'کلیدِ نامزد با مقدارِ ذخیره‌شدهٔ فعلی فرق دارد؛ مهاجرت آن را تغییر می‌دهد.',
  search_only_equivalence: 'دو مقدار فقط برای جست‌وجو یکسان دیده می‌شوند، نه برای یکتایی.',
};

// ---------------------------------------------------------------------------
// موتورِ تشخیصِ برخورد
// ---------------------------------------------------------------------------

export interface DetectOptions {
  /**
   * قاعدهٔ کسب‌وکارِ مصوب برای «آیا برخوردِ بین‌شرکتی تعارض است؟»
   * پیش‌فرض: هرگز. تنها با مصوبهٔ مالک می‌توان true کرد.
   */
  readonly crossCompanyIsConflict?: boolean;
  /** حداکثر تعدادِ طرف در یک گزارش (جلوگیری از انفجار) */
  readonly maxPartiesPerCollision?: number;
}

export interface ConflictLedger {
  readonly contract_version: string;
  readonly generated_at_iso: string;
  readonly options: { readonly crossCompanyIsConflict: boolean };
  readonly collisions: readonly Collision[];
  readonly summary: {
    readonly total: number;
    readonly hard: number;
    readonly soft: number;
    readonly review: number;
    readonly by_category: Readonly<Record<string, number>>;
    readonly by_company: Readonly<Record<string, number>>;
    readonly rows_considered: number;
  };
  /** مواردی که در دادهٔ فعلی **پنهان**اند و فقط با قراردادِ نامزد آشکار می‌شوند */
  readonly newly_exposed: number;
}

/**
 * تشخیصِ برخورد.
 *
 * الگوریتم:
 *   ۱. شاخصِ سایه را می‌سازد.
 *   ۲. ردیف‌های نامعتبر را جدا می‌کند (برخورد نیستند؛ خطای ورودی‌اند).
 *   ۳. به تفکیکِ **هر شرکت** و هر کلید، گروه‌بندی می‌کند (مرزِ شرکت هرگز شکسته نمی‌شود).
 *   ۴. درونِ هر گروه، جفت‌های متقاطعِ میدانی را دسته‌بندی می‌کند.
 *   ۵. `legacy_vs_proposed` را برای ردیف‌هایی که کلیدشان عوض می‌شود گزارش می‌کند.
 *   ۶. برخوردهای بین‌شرکتی را **فقط** با قاعدهٔ مصوب به‌عنوان تعارض گزارش می‌کند؛
 *      وگرنه فقط به‌عنوانِ «اطلاع» با شدتِ review.
 */
export function detectCollisions(
  index: ShadowIndex,
  opts: DetectOptions = {},
): ConflictLedger {
  const crossCompanyIsConflict = opts.crossCompanyIsConflict === true;
  const maxParties = opts.maxPartiesPerCollision ?? 50;
  const collisions: Collision[] = [];

  const valid = index.entries.filter((e) => e.proposed_key !== null);

  // --- ۱) گروه‌بندی درونِ شرکت (مرزِ شرکت!) ---
  const byCompanyKey = new Map<string, ShadowEntry[]>();
  for (const e of valid) {
    const k = `${e.company_id}\u0000${e.proposed_key}`;
    const arr = byCompanyKey.get(k);
    if (arr) arr.push(e);
    else byCompanyKey.set(k, [e]);
  }

  for (const group of byCompanyKey.values()) {
    if (group.length < 2) continue;
    const company = group[0].company_id;
    const key = group[0].proposed_key as string;

    // جفت‌های متقاطع: هر جفت که (کالای متفاوت) یا (بیش از یک ردیف در همان کالا) باشند
    const fieldSet = new Set(group.map((g) => g.field));
    const entitySet = new Set(group.map((g) => g.entity_id));

    // اگر همه از یک کالا و یک میدان باشند ⇒ تکرارِ عینی
    const category = classifyGroup(group, entitySet, fieldSet);
    const parties = group.slice(0, maxParties).map((g) => ({
      entity_id: g.entity_id,
      field: g.field,
      display_value: g.display_value,
      source_ref: g.source_ref,
    }));

    collisions.push({
      collision_id: collisionId(category, company, key, parties),
      category,
      severity: severityFor(category),
      company_id: company,
      crosses_company_boundary: false,
      profile: group[0].profile,
      key,
      parties,
      message_fa: MESSAGES_FA[category],
      visible_under_current_normalization: group.every((g) => g.stored_normalized === key),
      provenance: group.map((g) => `${g.source_ref}#${g.field}`),
    });
  }

  // --- ۲) legacy vs proposed: کلید تغییر می‌کند ---
  for (const e of valid) {
    if (!e.key_differs_from_stored) continue;
    const parties = [{ entity_id: e.entity_id, field: e.field, display_value: e.display_value, source_ref: e.source_ref }];
    collisions.push({
      collision_id: collisionId('legacy_vs_proposed', e.company_id, e.proposed_key as string, parties),
      category: 'legacy_vs_proposed',
      severity: 'soft',
      company_id: e.company_id,
      crosses_company_boundary: false,
      profile: e.profile,
      key: e.proposed_key as string,
      parties,
      message_fa: MESSAGES_FA.legacy_vs_proposed,
      visible_under_current_normalization: false,
      provenance: [`${e.source_ref}#${e.field}`, `stored=${e.stored_normalized}`],
    });
  }

  // --- ۳) برخوردِ بین‌شرکتی (فقط اطلاع، مگر قاعدهٔ مصوب) ---
  const byKeyAcrossCompanies = new Map<string, ShadowEntry[]>();
  for (const e of valid) {
    const arr = byKeyAcrossCompanies.get(e.proposed_key as string);
    if (arr) arr.push(e);
    else byKeyAcrossCompanies.set(e.proposed_key as string, [e]);
  }
  for (const group of byKeyAcrossCompanies.values()) {
    const companies = new Set(group.map((g) => g.company_id));
    if (companies.size < 2) continue;
    const key = group[0].proposed_key as string;
    const parties = group.slice(0, maxParties).map((g) => ({
      entity_id: g.entity_id,
      field: g.field,
      display_value: g.display_value,
      source_ref: g.source_ref,
    }));
    collisions.push({
      collision_id: collisionId('cross_company', 'ALL', key, parties),
      category: 'cross_company',
      severity: 'review',
      company_id: '*',
      crosses_company_boundary: true,
      profile: group[0].profile,
      key,
      parties,
      message_fa: crossCompanyIsConflict
        ? 'قاعدهٔ مصوبِ سراسری فعال است: همین مقدار در چند شرکت وجود دارد و تعارض شمرده می‌شود.'
        : MESSAGES_FA.cross_company,
      visible_under_current_normalization: false,
      provenance: group.map((g) => `${g.company_id}:${g.source_ref}#${g.field}`),
    });
  }

  // --- ۴) search-only equivalence ---
  const bySearch = new Map<string, ShadowEntry[]>();
  for (const e of index.entries) {
    const sk = keyFor('SearchKey', e.display_value);
    if (!sk.ok || !sk.key) continue;
    const k = `${e.company_id}\u0000${sk.key}`;
    const arr = bySearch.get(k);
    if (arr) arr.push(e);
    else bySearch.set(k, [e]);
  }
  for (const group of bySearch.values()) {
    if (group.length < 2) continue;
    // فقط گروه‌هایی که در کلیدِ canonیک یکسان **نیستند** ولی در جست‌وجو یکسان‌اند
    const distinctKeys = new Set(group.map((g) => g.proposed_key));
    if (distinctKeys.size < 2) continue;
    const company = group[0].company_id;
    const sk = keyFor('SearchKey', group[0].display_value);
    const searchKeyVal = sk.ok ? sk.key : '';
    const parties = group.slice(0, maxParties).map((g) => ({
      entity_id: g.entity_id,
      field: g.field,
      display_value: g.display_value,
      source_ref: g.source_ref,
    }));
    collisions.push({
      collision_id: collisionId('search_only_equivalence', company, searchKeyVal, parties),
      category: 'search_only_equivalence',
      severity: 'soft',
      company_id: company,
      crosses_company_boundary: false,
      profile: 'SearchKey',
      key: searchKeyVal,
      parties,
      message_fa: MESSAGES_FA.search_only_equivalence,
      visible_under_current_normalization: false,
      provenance: group.map((g) => `${g.source_ref}#${g.field}`),
    });
  }

  // --- ۴-الف) برخوردِ بین‌میدانی در «فضای مقایسهٔ مشترک» ---
  //
  // چرا لازم است: پروفایلِ Alias فاصله را **حفظ** می‌کند ولی Barcode آن را **حذف**.
  // پس «123 456» به‌عنوان alias و «123456» به‌عنوان barcode هرگز کلیدِ یکسان نمی‌گیرند
  // و در گروه‌بندیِ ساده دیده نمی‌شوند — در حالی که در **اسکن** هر دو به «123456»
  // می‌رسند (چون ورودیِ اسکن با normalizeBarcode نرمال می‌شود) و ابهامِ واقعی می‌سازند.
  //
  // راه‌حل: برای مقایسهٔ «alias ↔ barcode» هر دو را در **فضای barcode** بسنج؛
  // و برای «alias ↔ code» هر دو را در فضای کد/جست‌وجو. این همان معنایی است که
  // resolutionِ اسکن واقعاً اجرا می‌کند.
  const scanSpace = new Map<string, ShadowEntry[]>();
  const addScan = (k: string, e: ShadowEntry) => {
    const id = `${e.company_id}\u0000${k}`;
    const arr = scanSpace.get(id);
    if (arr) arr.push(e);
    else scanSpace.set(id, [e]);
  };
  for (const e of valid) {
    if (e.field === 'barcode') {
      const b = keyFor('Barcode', e.display_value);
      if (b.ok && b.key) addScan(b.key, e);
    } else if (e.field === 'alias') {
      // همان نرمال‌سازی‌ای که اسکن روی ورودی اعمال می‌کند
      const b = keyFor('Barcode', e.display_value);
      if (b.ok && b.key) addScan(b.key, e);
    }
  }
  for (const group of scanSpace.values()) {
    const fields = new Set(group.map((g) => g.field));
    if (!(fields.has('alias') && fields.has('barcode'))) continue;
    const entities = new Set(group.map((g) => g.entity_id));
    if (entities.size < 2) continue; // همان کالا ⇒ برخوردِ اسکن نیست
    const company = group[0].company_id;
    // کلید را از فضای barcode می‌گیریم تا پیام/شناسه معنادار باشد
    const bk = keyFor('Barcode', group[0].display_value);
    const key = bk.ok ? bk.key : '';
    const parties = group.slice(0, maxParties).map((g) => ({
      entity_id: g.entity_id,
      field: g.field,
      display_value: g.display_value,
      source_ref: g.source_ref,
    }));
    collisions.push({
      collision_id: collisionId('alias_to_barcode', company, key, parties),
      category: 'alias_to_barcode',
      severity: 'hard',
      company_id: company,
      crosses_company_boundary: false,
      profile: 'Barcode',
      key,
      parties,
      message_fa: MESSAGES_FA.alias_to_barcode,
      visible_under_current_normalization: false,
      provenance: group.map((g) => `${g.source_ref}#${g.field}@barcode-space`),
    });
  }

  // --- ۵) مرتب‌سازیِ قطعی (مستقل از ترتیبِ ورودی) ---
  collisions.sort((a, b) => (a.collision_id < b.collision_id ? -1 : a.collision_id > b.collision_id ? 1 : 0));

  const byCategory: Record<string, number> = {};
  const byCompany: Record<string, number> = {};
  for (const c of collisions) {
    byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
    byCompany[c.company_id] = (byCompany[c.company_id] ?? 0) + 1;
  }

  return {
    contract_version: index.contract_version,
    generated_at_iso: index.built_at_iso,
    options: { crossCompanyIsConflict },
    collisions,
    summary: {
      total: collisions.length,
      hard: collisions.filter((c) => c.severity === 'hard').length,
      soft: collisions.filter((c) => c.severity === 'soft').length,
      review: collisions.filter((c) => c.severity === 'review').length,
      by_category: byCategory,
      by_company: byCompany,
      rows_considered: valid.length,
    },
    newly_exposed: collisions.filter((c) => !c.visible_under_current_normalization).length,
  };
}

/** دسته‌بندیِ یک گروهِ هم‌کلید درونِ یک شرکت */
function classifyGroup(
  group: readonly ShadowEntry[],
  entitySet: Set<string>,
  fieldSet: Set<string>,
): CollisionCategory {
  const sameEntity = entitySet.size === 1;
  const onlyAliases = fieldSet.size === 1 && fieldSet.has('alias');

  if (onlyAliases && sameEntity) return 'exact_duplicate';
  if (onlyAliases) return 'alias_to_alias';
  if (fieldSet.has('alias') && fieldSet.has('name')) return 'alias_to_product_name';
  if (fieldSet.has('alias') && fieldSet.has('code')) return 'alias_to_product_code';
  if (fieldSet.size === 1 && fieldSet.has('code')) return 'product_code_collision';
  if (fieldSet.size === 1 && fieldSet.has('barcode')) return 'barcode_collision';

  // تفکیکِ «فقط رسم‌الخط» از «عینی»: اگر رشته‌های نمایشی متفاوت باشند ولی
  // پس از NFC/حذفِ اعراب یکی شوند، برخوردِ یونیکدی/حرفی است.
  const displays = new Set(group.map((g) => g.display_value));
  if (displays.size === 1) return 'exact_duplicate';
  const nfcOnly = new Set(group.map((g) => g.display_value.normalize('NFC')));
  if (nfcOnly.size === 1) return 'unicode_normalization';
  const letterOnly = new Set(
    group.map((g) => g.display_value.normalize('NFC').replace(/\u064A|\u0649/g, '\u06CC').replace(/\u0643/g, '\u06A9')),
  );
  if (letterOnly.size === 1) return 'persian_arabic_letters';
  return 'exact_duplicate';
}
