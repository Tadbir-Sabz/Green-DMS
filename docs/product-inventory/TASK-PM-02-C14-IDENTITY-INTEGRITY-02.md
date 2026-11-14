# TASK-PM-02-C14-IDENTITY-INTEGRITY-02 — یکپارچگیِ هویت (SKU/alias/barcode/واریانت)

**وضعیت:** پیاده‌سازیِ محدود و آمادهٔ مرور؛ **هیچ رفتارِ تولیدیِ جدیدی فعال نیست** و هیچ
تصمیم مالکی تصویب نشده است. این سند مجوزِ merge/deploy/migration نیست.

**نوع کار:** DEVELOPMENT محدود + ابزارِ تشخیصیِ غیرفعال (experimental، inert) + تست واحد/DB-backed.

| آیتم | مقدار |
|---|---|
| شاخه | `task/pm-02-c14-identity-integrity-02` |
| مبنا (base) | `4efb504f01f2a26b5c4cec03717065f948b37e46` (tip تحویل C14-IMPLEMENTATION-01 روی `arena/3fdef0e8-green-dms`) |
| چک‌پوینت پیش از نوشتن | `/home/user/c14-identity-02/` — `worktree-before-ff.tgz` + `repo-before-c14i02.bundle` (verified) |
| PRهای موجود | PR #14 و PR #15 — **دست‌نخورده** |
| Windows verification | UNVERIFIED (به درخواست مالک) |
| Real-data assessment | BLOCKED (بدون کپیِ مجوزدار و ایزوله) |
| DB integration | **NOT RUN** — این محیط PostgreSQL/Redis/Docker ندارد و `DATABASE_URL` موجود نیست؛ تست‌های DB-backed فقط نوشته شدند و باید در CI/DB واقعی اجرا شوند |

---

## ۱) آنچه پیاده شد

| فایل | نوع | شرح |
|---|---|---|
| `apps/api/src/modules/master-data/import-code-index.ts` | جدید (خالص) | `buildImportCodeIndex`/`lookupImportCode`: کلیدها `lower(code)`؛ first-wins قطعی روی case-variantهای ذخیره‌شده (کوچک‌ترین کد از نظر بایت، مستقل از ترتیب ورودی)؛ گزارش `caseVariantStoredCodes` برای مالک؛ **هیچ بازنویسی/ادغامِ خودکاری** |
| `apps/api/src/modules/master-data/product-master.repository.ts` | اصلاح رفتار | `getProductsForImport`/`getProductsForImportTx` → `lower(code) = any($2::text[]) order by code` (نسخهٔ Tx با `for update`)؛ `codeAliasCollisions` → `lower(code) = lower($2)`؛ بازگشت `ImportCodeIndex` به‌جای `Map` خام |
| `apps/api/src/modules/master-data/product-master.service.ts` | اصلاح رفتار | import به‌جای `Map.get(row.code)` از `lookupImportCode` استفاده می‌کند؛ تشخیصِ تکرار درون‌فایلی با `row.code.toLowerCase()`؛ ردیف‌های CSV با نویسهٔ کنترلی/قالب‌بندی در کد → خطای ردیفِ `invalid_code`؛ `addBarcode` ردِ بارکد با نویسه‌های کنترلی/نامرئی (`invalid_barcode`)؛ `productContext` حالا `product_code` و `product_id` را با یک lookup قطعی برمی‌گرداند |
| `apps/api/src/modules/master-data/product.service.ts` | اصلاح رفتار | ساختِ دستی: ردِ نویسه‌های کنترلی/قالب‌بندی (`invalid_code`)، ردِ فاصلهٔ ابتدا/انتها، و pre-check یکتایی با `lower()` → `409 duplicate_code` (قیدِ case-sensitive دیتابیس **دست‌نخورده**) |
| `apps/api/src/modules/master-data/product-identity.service.ts` | اصلاح رفتار | بررسیِ وجود بارکد در resolution اسکن: `lower(b.barcode) = lower($2)` |
| `apps/api/src/modules/master-data/experimental/multilingual-normalize.candidate.ts` | جدید (inert) | نرمال‌سازیِ فارسی/عربی در سه لایهٔ عمداً جدا: `storedIdentifierKey` (یکتایی/مقایسهٔ شناسه — ZWNJ حفظ می‌شود)، `searchKey` (جستجو — ZWNJ/اعراب/تشدید حذف می‌شود)، `FIELD_KEY_POLICY` و `comparisonKeyFor` (نقشهٔ صریح فیلد→لایه؛ `exact_canonical` برای barcode/variant_signature — هرگز از مسیرِ متن عبور نمی‌کنند). مقدار ذخیره‌شده هرگز بازنویسی نمی‌شود |
| `apps/api/src/modules/master-data/experimental/identity-integrity-diagnostics.candidate.ts` | جدید (inert) | تشخیصِ یکپارچهٔ یکپارچگیِ هویت `cident.1`: موتورِ C13 (`assessCrossType` — c13xt.1/c13.1/c11.1) + سه گذر (بین‌نوعی؛ انحرافِ legacy↔canonical برای همان کالا/بسته‌بندی؛ شبیه-GS1 زیرِ kind غیر gs1). هر یافته: طبقه‌بندی (`exact_duplicate` / `equivalent_representation` / `cross_type_collision` / `packaging_canonical_drift` / `invalid_barcode` / `misclassified_gs1_like` / `cross_company_allowed` / `manual_review` / `not_comparable`) · provenance · پرچم synthetic · پوشاندنِ مقادیر بین‌شرکتی · `diagnostics_only: true` · **هیچ اعمال/تعمیر/ادغامی** |
| `apps/api/test/import-code-index.test.ts` | جدید (DB-free) | ۷ تست: قطعی‌بودن، first-wins روی case-variantها مستقل از ترتیب ورودی، lookup بی‌بافت |
| `apps/api/test/multilingual-normalize.test.ts` | جدید (DB-free) | ۴۷ تست: idempotency هر دو لایه روی نمونه‌های فارسی/عربی/لاتین/ارقام؛ ایزولاسیون سه لایه؛ بارکد/امضا هرگز از مسیر متن |
| `apps/api/test/identity-integrity-diagnostics.test.ts` | جدید (DB-free) | ۲۰ تست: UPC↔EAN-13 معادل‌نمایی؛ تکراری gs1؛ drift legacy↔canonical؛ شبیه-gs1 زیر internal/other؛ رقم کنترلی غلط؛ مرز شرکت/دامنه (پوشاندن مقادیر، هرگز ALLOWED)؛ قطعی‌بودن finding_idها؛ provenance ترکیبی هرگز «واقعی» اعلام نمی‌شود |
| `apps/api/test/c14-identity-integrity-boundary.test.ts` | جدید (DB-free) | ۷ تستِ مرزیِ C14: هیچ کد تولیدی outside experimental به `*.candidate` وابسته نیست؛ هیچ migration به قراردادهای این تسک ارجاع نمی‌دهد؛ ماژول تشخیصی هیچ تابعِ apply/enforce/fix/merge/repair صادر نمی‌کند؛ فایل‌های جدید هیچ `process.env` نمی‌خوانند؛ `diagnostics_only === true`؛ ایزولاسیون بین‌شرکت در خروجی گزارش |
| `apps/api/test/product-master-identity-integrity.api.test.ts` | جدید (DB-backed؛ **NOT RUN**) | ۱۰ تست رفتاری: ساخت دستی case-variant → 409؛ کد با کنترلی/فاصله → 400؛ CSV invalid_code؛ duplicate_in_file case-insensitive؛ commit update با case متفاوت → همان کالا؛ commit create case-variant → duplicate_code؛ بارکد با کنترلی → 400؛ اسکن بارکد internal بی‌بافت |
| `apps/api/test/c13-cross-field.test.ts` · `c13-cross-type-policies.test.ts` | اصلاحِ additive | allowlistِ گاردهای C13/C13XT فقط دو نامِ جدیدِ experimental (`identity-integrity-diagnostics`، `multilingual-normalize`) را به «خودِ کدِ آزمایشی» اضافه می‌کند؛ هیچ دربِ تازه‌ای به تولید باز نشد |

## ۲) آنچه پیاده نشد و چرا

- **هیچ تغییری در دیتابیس**: قیدِ case-sensitive `uq_product_code` و همهٔ uniqueness ها دست‌نخورده؛ D-C11-3 همچنان تصمیمِ بازِ مالک است.
- **هیچ env flag تازه‌ای ساخته نشد**؛ هیچ wiring تولیدی به ابزارهای تشخیصی وجود ندارد.
- **هیچ ادغام/بازنویسی خودکار روی case-variantهای ذخیره‌شده**؛ فقط تشخیص و گزارش (`caseVariantStoredCodes`).
- **هیچ enforcement تازه‌ای** برای GS1/check digit (D-C11-1 باز)، cross-company (D-C12-1 باز)، یا ماتریسِ جفت‌ها (D-C13-1 باز).
- **CSV preview/commit ناهمخوانی**: پیش‌نمایش (`validate`) بدونِ DB است و نمی‌تواند کدِ موجود را ببیند؛ ردیف می‌تواند preview-سبز ولی commit-قرمز باشد. این محدودیتِ ساختاری باید در تصویبِ مالک حل شود و در این تسک عمداً به‌صورت follow-up ثبت می‌شود، نه با تغییرِ معنا‌شناسی.
- **رجیستری دامنه وجود ندارد**؛ یافته‌های cross-domain هرگز ALLOWED/قطعی اعلام نمی‌شوند — همیشه `manual_review`.
- **real-data assessment انجام نشد** (BLOCKED؛ نیازمند کپیِ مجوزدار و ایزوله).
- **Windows**: UNVERIFIED.

## ۳) تأیید (همین محیط، همین commit)

| بررسی | نتیجه |
|---|---|
| `node scripts/check-test-partition.mjs` | **PASS** — مانیفست == پارتیشن محاسبه‌شده؛ تست‌های جدیدِ DB-free به‌درسُتی unit طبقه‌بندی شدند (۱۶ فایل unit جدید/تغییر + ۱ فایل `.api.test.ts` DB-backed) |
| Unit suite (دستور CI، پارتیشن `--print unit`) | **PASS** — ۵۵ فایل، **۹۳۶ passed / ۱ skipped** |
| typecheck (contracts + api-client + api + web) | **PASS** — ۰ خطا |
| `npm run build` | **PASS** |
| `npm run openapi:check` | **PASS** — 229 مسیر / 324 عملیات / 233 اسکیما (بدون تغییر) |
| `node scripts/contract-drift.mjs` | **PASS** — ۰ واگرایی |
| Web unit (`npm run test:web`) | **PASS** — ۲۹ فایل، ۱۶۵ تست |
| Integration-DB (`*.api.test.ts`، از جمله `product-master-identity-integrity.api.test.ts`) | **NOT RUN** — `DATABASE_URL` موجود نیست؛ ادعای PASS نمی‌شود |
| Windows | **UNVERIFIED** |
| Real-data | **BLOCKED** |

## ۴) تصمیمات مالک که همچنان بازند (این تسک هیچ‌کدام را تصویب نکرد)

1. D-C11-1 (الزام رقم کنترلی GS1) · D-C11-3 (سیاست case در DB) · D-C12-1 (هم‌نام/هم‌شناسه بین‌شرکتی) · D-C13-1 (ماتریس جفت‌ها و کران‌های آن).
2. POL-PACKAGING-CANON-01 · POL-BARCODE-XKIND-01 · POL-ALIAS-COMPANY-01 — همچنان OPEN.
3. ناهمخوانی CSV preview/commit (معنا‌شناسی preview واقعی vs syntactic) — follow-up پیشنهادی، نه تغییر در این تسک.
4. مهاجرت case-variantهای ذخیره‌شده (پاک‌سازی/ادغام) — فقط پس از تصویب و با backup/rollback، در تسک جدا.

## ۵) محدودیت‌های صادقانه

- یافته‌های بین‌شرکتی عمداً «manual_review» هستند و مقادیرشان پوشانده شده — این یعنی «تصمیم نگرفتیم»، نه «تعارض نداریم».
- ابزار تشخیصی روی ردیف‌های واقعی اجرا نشده است؛ فقط fixture ساختگی تست شده‌اند.
- `cross_company_allowed` فقط وقتی decision موتور ALLOWED باشد برچسب می‌خورد؛ تصویب نهایی با مالک است.
- مسیر `scan_resolution` حالا برای بارکد case-insensitive است، ولی رفتارِ کد/alias در اسکن طبق قراردادِ قبلی تغییر نکرد.
