# TASK-PM-01D-M2 — قابلیت اطمینان، همزمانی و اتمیسیتهٔ import محصول

**وضعیت:** مایلستون مستقل `PASS WITH FINDINGS`؛ پذیرش کامل ماژول Product Master همچنان `BLOCKED` است.
**شاخه/PR:** `arena/be5eaff3-green-dms` / PR #14 (OPEN، DRAFT، base `main`)؛ بدون merge، deploy، تماس با پایگاه‌دادهٔ production/shared یا تغییر شاخهٔ محافظت‌شده.
**مبنای شروع:** `10b75deec41b0864a91a4af477ecc218d7c290c7` (پایان PM-01D). تصمیم‌های PM-B1..PM-B8 همچنان **OPEN / NOT APPROVED** هستند.

## ۱) مرز قرارداد و تصمیم مالک

- مرجع همچنان `PRODUCT_MASTER_TARGET_DESIGN.md` §E است: حداکثر ۱۰٬۰۰۰ ردیف/۱MB، validate بدون نوشتن، `idempotency_key`، مجوز `master.product.import`، دسته‌های ۱۰۰تایی، **همه‌یا‌هیچ در هر دسته**، گزارش خطای ردیف‌به‌ردیف فارسی و **ادامهٔ دسته‌های بعدی پس از خرابی جزئی**.
- M2 رفتار «همهٔ فایل / چند دسته به‌صورت یک تراکنش» را تغییر نداد؛ §E همان مرجع است. تبدیل آن به whole-file rollback یک **تصمیم سیاستی مجزای مالک** باقی می‌ماند، نه نتیجهٔ ضمنی این مایلستون.
- D1–D5، M-5، `DomainCatalogGate` fail-closed، هشت مسیر مسدود دامنه، RBAC/RLS، مهاجرت‌های تاریخی، `.github` و کلاینت Android تغییر نکردند. هیچ شناسهٔ دامنه، عضویت، مجوز تازه یا وضعیت چرخهٔ حیات ساخته نشد.
- `AuditService.record` همچنان خارج از تراکنش و خطاگیر است؛ M2 آن را به guarantee تراکنشی تبدیل نکرد. شاهد اتمیک M2، ردیف `product_import_batch` در **همان تراکنش محصول/تاریخچه** است.

## ۲) پیاده‌سازی تحویل‌شده

| لایه | تغییر | نتیجهٔ رفتاری |
|---|---|---|
| `migrations/0061_product_import_reliability.up.sql` / `.down.sql` | ستون‌های `status`, `failure_category`, `retryable`, `transaction_outcome`, `last_batch_no`, `completed_at`, `updated_at`, `attempts` روی `product_import`؛ یکتایی `(company_id,id)`؛ جدول `product_import_batch` با FK مرکب، RLS `FOR ALL` و گرانت `SELECT/INSERT/UPDATE` فقط | مهاجرت افزودنی و برگشت‌پذیر؛ `0041` ابتدا `DELETE` را از `PUBLIC` و `dms_app` پس می‌گیرد؛ گرانت SELECT-only تاریخچهٔ `0060` دست‌نخورده می‌ماند |
| `product-import-reliability.ts` | واژگان DB-free/Nest-free، دسته‌بندی خطا‌های دامنه و SQLSTATE، نرمال‌سازی گزارش قدیم و ساخت نتیجهٔ قابل پخش | `unknown` هرگز موفقیت فرض نمی‌شود؛ پیام خام SQL یا `company_id` به کلاینت نشت نمی‌کند |
| `product-master.repository.ts` | `claimImport`, `findImportByIdempotencyKey`, `resumeImport`, `getImport`, `listImportBatches`, `recordImportBatch`, `finalizeImport`, `markImportFailed`, `getProductsForImportTx` و بررسی شمار ردیف `updateProductRow` | ادعای اتمیک قبل از نوشتن محصول؛ قفل `FOR UPDATE` مرتب‌شده؛ نتیجهٔ دسته در همان تراکنش محصول؛ marker `committed` توسط گزارش ابهام‌آلود بعدی بازنویسی نمی‌شود |
| `product-master.service.ts` | قفل advisory به ازای `(company_id, idempotency_key)`، `ON CONFLICT DO NOTHING`، پخش terminal، ادامهٔ فقط `processing`، retry درونی `40001/40P01` حداکثر ۳ بار، توقف قطعی روی `unknown` | تکرار همان کلید بدون اثر دوباره؛ فقط دسته‌های با `rolled_back` قطعی و `retryable` قابل از‌سرگیری‌اند؛ import ناموفق terminal به‌صورت verbatim پخش می‌شود |
| `master-data.module.ts` | ثبت `OrderCreationLock` به‌عنوان provider | همان الگوی قفل session-level روی اتصال اجاره‌ای درخواست، بدون مصرف connection دوم برای خود قفل |
| `packages/contracts/openapi.yaml`, `packages/api-client/src/schema.ts` | اسکیمای `ImportIssue`, `ImportFailureCategory`, `ImportTransactionOutcome`, `ImportBatchOutcome` و فیلد‌های تازهٔ `ImportResult` | بدون مسیر/عملیات تازه؛ ۱۹۵ مسیر، ۲۷۸ عملیات، ۱۴۱ اسکیما، ۳ webhook؛ drift صفر |
| `apps/web/src/app/products/import/page.tsx`, `products-lib.ts` | برچسب‌های فارسی وضعیت/نتیجه/دستهٔ خطا، جدول دسته‌ها، شمارهٔ دسته در خطا‌ها و هشدار صریح `unknown` | همان ویزارد RTL؛ نتیجهٔ نامشخص به‌عنوان نیازمند بررسی اپراتور نمایش داده می‌شود، نه موفقیت |
| تست‌ها | `product-import-reliability-unit.test.ts` (۶)، `product-master-import-reliability.test.ts` (۸)، `products-lib.test.ts` (۳)، به‌روزرسانی `migrations-security.test.ts` و `db-backed-tests.txt` | شواهد DB-free و native PostgreSQL برای رقابت، برگشت، retry، resume، RLS و نقش اجرایی |

### مرز‌های دقیق پخش مجدد

1. رکورد `completed` یا `failed` همیشه **فقط پخش گزارش** می‌شود؛ پخش خودکار همان کلید روی import ناموفق ممنوع است.
2. فقط رکورد `processing` متوقف‌شده از سر گرفته می‌شود، و فقط دسته‌های `status=rolled_back` با `transaction_outcome=rolled_back` و `retryable=true` دوباره اجرا می‌شوند.
3. `40001` و `40P01` داخل همان درخواست حداکثر سه بار و فقط به‌عنوان تراکنش قطعاً برگشت‌خورده retry می‌شوند.
4. خطای اتصال `08*`, خطای عمومی بدون دامنه و `infrastructure_error` سرویس ⇒ `unknown`, `retryable=false`, وضعیت terminal و توقف پخش خودکار. این از اثر دوبارهٔ محصول/تاریخچه هنگام گم شدن acknowledgment `COMMIT` جلوگیری می‌کند.
5. وقتی marker `committed` از قبل موجود باشد، `recordImportBatch` آن را حفظ می‌کند؛ شاهد تراکنش محصول بر گزارش ابهام بعدی غالب است.

## ۳) کارنامهٔ راستی‌آزمایی محلی

| فرمان / شاهد | نتیجه |
|---|---|
| `node scripts/test-migrations.mjs` با ۶۱ مهاجرت | exit 0؛ up/down/up و مقایسهٔ دو اجرا: ۱۰۰۹ شیء یکسان (شامل اشیای جایگزین محلی PostGIS) |
| پروب تازهٔ گرانت نقش `dms_app` | `product_import_batch`: SELECT/INSERT/UPDATE=`t`, DELETE=`f`؛ `product_catalog_history`: SELECT=`t`, INSERT=`f` |
| `vitest run test/product-master-import.test.ts test/product-master-import-reliability.test.ts` | ۲ فایل / ۲۲ تست، همگی PASS |
| مجموعهٔ Product Master DB-backed | ۱۰ فایل / ۱۵۱ تست، همگی PASS |
| مجموعهٔ DB-backed منتخب سراسری | ۴۴ فایل / ۹۵۷ تست، همگی PASS؛ چهار فایل وابسته به PostGIS واقعی/احراز رمز به‌دلیل محدودیت جایگزین محلی حذف شدند و در CI واقعی بررسی می‌شوند |
| `vitest run` واحد API | ۲۴ فایل / ۳۳۲ تست، همگی PASS |
| `npm run test:web` | ۱۴ فایل / ۷۹ تست، همگی PASS |
| `node scripts/check-test-partition.mjs` | exit 0؛ ۷۳ فایل، `partition OK` |
| `npm run openapi:check` | exit 0؛ ۱۹۵ مسیر / ۲۷۸ عملیات / ۱۴۱ اسکیما / ۳ webhook |
| `node scripts/contract-drift.mjs` | exit 0؛ واگرایی enum و required صفر |
| `npm run typecheck`, `npm run build`, `git diff --check` | exit 0؛ build وب ۵۵ صفحه |
| `npm run generate -w packages/api-client` و `npm run build -w packages/api-client` | exit 0؛ کلاینت TypeScript با قرارداد هم‌تراز شد |

شواهد exact-final-SHA CI پس از push در بدنهٔ PR #14 و گزارش پایانی ثبت می‌شود. پایگاه‌دادهٔ محلی disposable PostgreSQL 16.2 با `pg_trgm`/`btree_gist` واقعی و جایگزین‌های `pgcrypto`/`postgis` است؛ معادل production یا PostGIS واقعی نیست. خطا‌های `ECONNREFUSED 127.0.0.1:6379` در لاگ‌ها مربوط به نبود Redis محلی‌اند و روی نتیجهٔ تست‌های import اثر نگذاشتند.

## ۴) ماتریس پذیرش ۱۳گانه

| # | مورد | حکم | دلیل / مرز باقی‌مانده |
|---:|---|---|---|
| ۱ | حفظ کار پیشین، بازیابی و عدم عملیات مخرب | PASS | patch/stash حفظ شد؛ fast-forward به `10b75de`؛ بدون reset/force-push/history-rewrite |
| ۲ | مهاجرت افزودنی، برگشت‌پذیر و least-privilege | PASS WITH FINDINGS | چرخهٔ سخت و پروب گرانت سبز؛ معادل PostGIS واقعی فقط در CI نهایی |
| ۳ | نرمال‌سازی قطعی و بدون نشت SQL | PASS | ۶ تست DB-free؛ پیام‌ها و واژگان پایدار |
| ۴ | ادعای اتمیک idempotency و قفل به ازای کلید | PASS WITH FINDINGS | رقابت و `ON CONFLICT DO NOTHING` تست شد؛ تست اشباع pool انجام نشد |
| ۵ | پخش امن تکرار همان کلید | PASS WITH FINDINGS | گزارش یکسان و یک محصول/یک import؛ بدون تست بار اشباع و review مستقل امنیتی |
| ۶ | رقابت کلید‌های متفاوت و قفل ردیف | PASS WITH FINDINGS | `FOR UPDATE` مرتب + company xact lock؛ تمام حالت‌های تداخل مرجع پوشش داده نشد |
| ۷ | همه‌یا‌هیچ در هر دسته و ادامهٔ دسته‌های بعدی | PASS WITH FINDINGS | تست native میان‌فایل و تاریخچه؛ رفتار BullMQ واقعی UNVERIFIED |
| ۸ | مرز retry قطعی `40001/40P01` | PASS WITH FINDINGS | تزریق `40001` و حداکثر ۳ تلاش؛ سایر خطا‌های قفل/شبکه به‌صورت جامع شبیه‌سازی نشد |
| ۹ | پخش امن نتیجهٔ `unknown` | PASS WITH FINDINGS | تست terminal و حفظ marker `committed`؛ قطع واقعی شبکه/ACK تست نشد |
| ۱۰ | از‌سرگیری `processing` متوقف‌شده | PASS WITH FINDINGS | دستهٔ commit‌شده دوباره اجرا نشد؛ crash واقعی فرایند شبیه‌سازی نشد |
| ۱۱ | جداسازی tenant، RLS و نقش اجرایی | PASS WITH FINDINGS | تست `dms_app` و شرکت دیگر سبز؛ PostGIS واقعی/CI نهایی جداگانه است |
| ۱۲ | قرارداد، کلاینت typed و UI فارسی RTL | PASS WITH FINDINGS | OpenAPI/drift/typecheck/build/web tests سبز؛ بررسی دستی responsive/a11y/console انجام نشد |
| ۱۳ | پذیرش کامل ماژول و دروازه‌های مالک | BLOCKED / UNVERIFIED | PM-B1..PM-B8 باز‌اند؛ whole-file rollback تصمیم مالک است؛ Agent2 مستقل، BullMQ، بار اشباع، تأیید دو‌نفره و UX دستی UNVERIFIED |

**حکم مستقل مایلستون:** `PASS WITH FINDINGS`. **حکم کلی ماژول/دامنه:** `BLOCKED`. M2 هیچ تصمیم مالک، عضویت دامنه، فعال‌سازی مسیر دامنه‌ای، merge یا deploy انجام نداد.

## پیوست continuation — TASK-PM-01D-M3 (بدون بازنویسی شواهد M2)

M3 از همان HEAD نهایی M2 آغاز شد و شواهد بالا را حفظ کرد. خروجی CSV خواندنی محصول
بهعنوان برش عمودی تازه افزوده شد؛ رفتار مصوب «همه‌یاهیچ در هر دسته + ادامه»،
مهاجرت `0061`، grantها، idempotency و توقف نتیجهٔ نامشخص بدون تغییر ماندند. درخواست
رسمی تصمیم مالک دربارهٔ اتمیّت کل فایل در
`TASK-PM-01D-M3_WHOLE_FILE_ATOMICITY_OWNER_DECISION.md` ثبت شد و همچنان
**OPEN / NOT APPROVED** است. ارزیابی تازه، شواهد اعتبارسنجی M3 و برآورد باقیمانده در
`TASK-PM-01D-M3_IMPLEMENTATION.md` آمده است.


## پیوست continuation — TASK-PM-01D-M4 (بدون بازنویسی شواهد M2/M3)

M4 از HEAD نهایی M3 آغاز شد و شواهد بالا و پیوست M3 را حفظ کرد. مسیر
`products/bulk-maintenance` صرفاً یک عملیات محدود و مستقل برای گزینش جاری
است؛ رفتار مصوب «همهیاهیچ در هر دسته import + ادامه»، `0061`، idempotency،
نتیجهٔ `unknown` import و پروندهٔ whole-file بدون تغییر ماندند. دفتر تازهٔ
`0062` جایگزین `product_import_batch` یا شواهد M2 نشد. جزئیات و مرزها در
`TASK-PM-01D-M4_IMPLEMENTATION.md` ثبت شده است.
