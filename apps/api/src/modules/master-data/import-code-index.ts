/**
 * TASK-PM-02-C14-IDENTITY-INTEGRITY-02 — شاخصِ کدِ کالا برای ورودِ گروهی.
 *
 * چرا این ماژول وجود دارد: مسیرِ import کدِ ردیف را با `code = any($2)` (حساس به
 * بزرگی/کوچکی حروف) با کدهای ذخیره‌شده مقایسه می‌کرد، در حالی که همهٔ لایهٔ
 * اپلیکیشنِ امروز کد را با `lower(code)` resolve می‌کند (findProductByCode، اسکن
 * مرحلهٔ ۲، بررسی تداخل alias). ردیفِ «sku-9» در برابر «SKU-9» ذخیره‌شده برای
 * تشخیصِ تکراری نامرئی بود ⇒ واردکردنِ تکراریِ case-variant ممکن بود؛ پس از آن
 * هر lookup مبتنی بر lower() هر دو کالا را می‌بیند (اسکن مبهم / ambiguous_scan).
 *
 * قرارداد این شاخص:
 *   ۱. کلیدها همیشه `lower(code)` هستند و lookup همیشه روی `lower` انجام می‌شود.
 *   ۲. کدهای ذخیره‌شده‌ای که فقط در بزرگی/کوچکی حروف با هم فرق دارند (توسطِ قیدِ
 *      case-sensitiveِ DB مجازند) به‌صورت قطعی resolve می‌شوند: کوچک‌ترین کدِ
 *      ذخیره‌شده از نظر ترتیبِ بایت برنده است (`order by code` + first-wins).
 *      این جفت‌ها در `caseVariantStoredCodes` گزارش می‌شوند تا تشخیص‌شان ممکن باشد
 *      (امروز هیچ مسیر داده‌ای آن‌ها را تولید نمی‌کند؛ ساخته‌شدن‌شان نیازمندِ
 *      ورودِ case-variant پیش از این اصلاح است).
 *   ۳. هیچ شناسهٔ ذخیره‌شده‌ای بازنویسی نمی‌شود؛ فقط کلیدِ مقایسه lower می‌شود.
 *
 * تصمیمِ D-C11-3 (case-insensitivity در سطح DB) همچنان باز و تصویب‌نشده است؛ این
 * تغییر فقط سازگاریِ لایهٔ اپلیکیشن را برقرار می‌کند و قید DB را دست‌نخورده می‌گذارد.
 */

export interface ImportCodeRow {
  id: string;
  code: string;
  status: string;
  base_uom_id: string;
  tax_code_id: string | null;
}

export interface ImportCodeIndex {
  /** lower(code) → ردیفِ ذخیره‌شده (first-wins روی جفت‌های case-variant). */
  readonly map: Map<string, ImportCodeRow>;
  /** lower(code)های دارای ≥۲ کدِ ذخیره‌شده که فقط در حروف فرق دارند. */
  readonly caseVariantStoredCodes: readonly string[];
}

/** ساخت قطعیِ شاخص از ردیف‌های ذخیره‌شده (ورودی نیازی به مرتب‌بودن ندارد). */
export function buildImportCodeIndex(rows: readonly ImportCodeRow[]): ImportCodeIndex {
  const sorted = [...rows].sort((a, b) => (a.code === b.code ? 0 : a.code < b.code ? -1 : 1));
  const map = new Map<string, ImportCodeRow>();
  const variants = new Set<string>();
  for (const row of sorted) {
    const key = row.code.toLowerCase();
    const existing = map.get(key);
    if (existing) {
      if (existing.code !== row.code) variants.add(key);
      continue; // first-wins — قطعی
    }
    map.set(key, row);
  }
  return { map, caseVariantStoredCodes: [...variants].sort() };
}

/** lookupِ یک کدِ ردیفِ CSV — حساس به حروف نیست؛ `null` ⇒ کد نداشت یا وجود ندارد. */
export function lookupImportCode(
  index: ImportCodeIndex,
  rowCode: string | null | undefined,
): ImportCodeRow | null {
  if (!rowCode) return null;
  return index.map.get(rowCode.toLowerCase()) ?? null;
}
