# TASK-PM-01D-M4-H — همرسانسازی مستندات عملیاتی و آمادگی پذیرش M4

> وضعیت: **انجام شد / PASS WITH FINDINGS**. این سند فقط چهار یافتهٔ کمخطرِ
> بازبینی مستقل `TASK-PM-01D-M4-G-R` (H-01..H-04) را در اسناد و کامنتهای منبع
> همرسان میکند. هیچ معماری تازهای، تغییر مرز امنیتی مصوب، گسترش دامنهٔ Product
> Master، approve/merge/release/deploy یا ادعای «پذیرش کامل M4» انجام نشد.
> حکمهای `R = FAIL` و `F-R = FAIL` و ارزیابی مستقل G-R بدون تغییر باقی میمانند.

## ۱) مبنا، حفظ شواهد و منبع حقیقت

- شاخه: `arena/be5eaff3-green-dms`؛ PR #14 `OPEN / DRAFT` با base `main`.
- SHA دقیق مبنا (محلی، `origin/...`، `git ls-remote`، ref شاخه در GitHub و head
  PR #14 در لحظهٔ شروع H، همگی یکسان):
  `2e6d2711cb2a8b1f60b8c39b87eeb3f3a13a295c`.
- پیش از کار `git fetch origin --prune`، بررسی وضعیت کار tree (۰ خط)،
  `git diff --check` (EXIT=0)، وضعیت PR و طول بدنهٔ PR انجام شد. بدنهٔ PR #14
  (۵۵۳۹۰ نویسه) دستنخورده ماند و همچنان عبارت `PENDING / NOT EXECUTED` را دارد؛
  H هیچ ویرایشی در بدنهٔ PR انجام نداد.
- پشتیبان قابل بازیابی از ۱۱ فایل نامزد با همان SHA دقیق در
  `/tmp/pm01dm4h-backup/`، `/tmp/pm01dm4h-backup.tar.gz` و مانیفست
  `/tmp/pm01dm4h-original-sha256.txt` ساخته شد. **منبع حقیقت پایدار، همان commit
  `2e6d271...` در GitHub است**؛ هیچ تغییر مهمی فقط در `/tmp` باقی نماند.
- اسکن اولیهٔ بینسندی (`/tmp/pm01dm4h-crossdoc-before.txt`، ۳۷۷ خط) و بررسی
  ترتیب runnerها (`scripts/test-migrations.mjs` و `scripts/migrate.mjs`) پیش از
  ویرایش انجام شد.

## ۲) خلاصهٔ H-01..H-04

| یافته | نتیجه | فایلهای کلیدی |
|---|---|---|
| H-01 | نقل قول دوبل `''public.audit_log''::regclass` در دو سند به فرم تکنقلقولی و قابل کپی/پیست `select relowner::regrole from pg_class where oid = 'public.audit_log'::regclass;` اصلاح شد؛ همان فرم از پیش در `apps/api/src/common/audit.service.ts:52` درست بود. دستور دقیق روی PostgreSQL ایزوله اجرا و خروجی `postgres` گرفته شد؛ فرم قدیمی همان `syntax error at or near "public"` داد. | `docs/db-privilege-architecture.md`, `docs/deploy/PRODUCTION_DEPLOYMENT.md`, `apps/api/src/common/audit.service.ts` (فقط بازبینی) |
| H-02 | دستور قدیمی «نقش مهاجرت / `fn_ensure_partitions(2)`» در راهنمای فارسی اپراتور با رویهٔ **مالک اشیاء = `DATABASE_URL` مجاز** جایگزین شد: مالکیت والدهای `public.audit_log` / `location_sample` / `inventory_txn`، `USAGE`+`CREATE` روی `public`، `EXECUTE` روی تابع، دستور `select fn_ensure_partitions(2);`، بررسی پس از ترمیم، ثبت لاگ استقرار، و ممنوعیت صریح میانبرهای `dms_app` / `dms_migrator` / `dms_owner`. | `docs/product-inventory/PRODUCT_MASTER_OPERATOR_GUIDE_FA.md`, `docs/deploy/PRODUCTION_DEPLOYMENT.md`, `migrations/README.md` |
| H-03 | جدول و بندهای مالکیت در گزارش امنیتی با کاتالوگ اندازهگیریشده همرسان شد: `dms_owner` مالک طرحواره/هیچ شیئی نیست و `CREATE` روی `public` ندارد؛ `dms_migrator` عضو `dms_owner` و مالک والدها نیست و بهتنهایی پارتیشن `audit_log` نمیسازد. اسناد تاریخی ۰۰۴۱/TASK-11/TASK-12/TASK-16/TASK-19 و F حفظ و بهصراحت «هدف تاریخی/فرض معوق» برچسب خوردند. `DATABASE_URL` در مدل جاری هویت مالک اشیاء است، نه `dms_migrator` مستقل. | `docs/security-remediation-report.md`, `docs/db-privilege-architecture.md`, `docs/product-inventory/TASK-PM-01D-M4-F_IMPLEMENTATION.md`, `docs/task-11-completion-report.md`, `docs/task-12-completion-report.md`, `docs/task-16-completion-report.md`, `docs/task-19-completion-report.md`, `apps/api/src/database/database.module.ts` (فقط کامنت) |
| H-04 | ادعای «ایمن بودن اجرای مستقیم `0062.down` هنگامی که `0063` اعمال است» اصلاح شد: ترتیب معکوس وابستگی `0064.down → 0063.down → 0062.down` (چرخهٔ خالی `0063.down → 0062.down → 0062.up → 0063.up`)؛ اجرای خارجترتیب ممکن است با خطای وابستگی fail-closed کند و **بازگردانی موفق نیست**؛ runner استاندارد ترتیب را حفظ میکند و نگهبانها تضعیف نشدهاند. | `docs/product-inventory/TASK-PM-01D-M4-G_IMPLEMENTATION.md`, `docs/product-inventory/TASK-PM-01D-M4-F_IMPLEMENTATION.md`, `docs/product-inventory/TASK-PM-01D-M4_IMPLEMENTATION.md`, `migrations/README.md`, درخواستهای بازبینی مستقل F/G |

فایلهای محافظتشدهٔ `0062.down`، `0063.down`، `0064.up/down`، `0041`، `0019`،
`0042`، گرانتهای نقشها، منطق احراز هویت زمان اجرا، تنظیمات production و اسرار
**هیچکدام تغییر نکردند**. تنها تغییر کد، یک کامنت توضیحی در
`apps/api/src/database/database.module.ts` است؛ هیچ عبارت اجرایی/منطقی عوض نشد.

## ۳) فهرست دقیق فایلهای H

فایلهای تغییرکرده نسبت به مبنای `2e6d271...` (۱۸ فایل؛ فهرست نهایی با
`git diff --name-status 2e6d271... HEAD` در گزارش پایانی نیز آمده است):

- `apps/api/src/database/database.module.ts`
- `docs/db-privilege-architecture.md`
- `docs/deploy/PRODUCTION_DEPLOYMENT.md`
- `docs/product-inventory/PRODUCT_MASTER_OPERATOR_GUIDE_FA.md`
- `docs/product-inventory/EVIDENCE_INDEX.md`
- `docs/product-inventory/TASK-PM-01D-M4-H_IMPLEMENTATION.md` (همین سند)
- `docs/product-inventory/TASK-PM-01D-M4-F_IMPLEMENTATION.md`
- `docs/product-inventory/TASK-PM-01D-M4-F_INDEPENDENT_REVIEW_REQUEST.md`
- `docs/product-inventory/TASK-PM-01D-M4-G_IMPLEMENTATION.md`
- `docs/product-inventory/TASK-PM-01D-M4-G_INDEPENDENT_REVIEW_REQUEST.md`
- `docs/product-inventory/TASK-PM-01D-M4_IMPLEMENTATION.md`
- `docs/product-inventory/evidence/task-pm-01d-m4-h/VERIFICATION.txt`
- `docs/security-remediation-report.md`
- `docs/task-11-completion-report.md`
- `docs/task-12-completion-report.md`
- `docs/task-16-completion-report.md`
- `docs/task-19-completion-report.md`
- `migrations/README.md`

## ۴) اعتبارسنجی اجراشده

 ledger دقیق فرمانها و خروجیها در
`docs/product-inventory/evidence/task-pm-01d-m4-h/VERIFICATION.txt` و لاگهای
`/tmp/pm01dm4h-*.log` / `/tmp/pm01dm4h-*-summary.txt` آمده است. خلاصه:

| فرمان / آزمون | نتیجهٔ اجراشده |
|---|---|
| `git diff --check` | EXIT=0 |
| `npm run openapi:check` | EXIT=0؛ ۲۰۱ مسیر / ۲۸۴ عملیات / ۱۵۳ اسکیما / ۳ وب هوک |
| `node scripts/contract-drift.mjs` | EXIT=0؛ واگرایی ۰ |
| `node scripts/check-test-partition.mjs` | EXIT=0؛ ۸۰ فایل، manifest OK |
| `npm run typecheck` (ریشه) | EXIT=0 |
| `node scripts/test-migrations.mjs` با `TEST_DB` یکتا | EXIT=0؛ ۶۴ up/down/up، ۱۰۲۹ شیء دقیقاً یکسان؛ DB موقت حذف شد |
| Vitest متمرکز `migration-rollback-race.test.ts` + `migrations-security.test.ts` | EXIT=0؛ ۲ فایل / ۱۶ تست PASS |
| دستور دقیق مالکیت H-01 روی DB ایزوله | EXIT=0؛ خروجی `postgres`؛ فرم دوبلنقلقول قدیمی EXIT=1 با `syntax error at or near "public"` |
| ترمیم بایدار H-02 روی DB ایزوله | حذف پارتیشن خالی آینده، دو بار `select fn_ensure_partitions(2);` EXIT=0؛ تعداد پارتیشنها ۳←۴، ۱ ردیف تاریخی حفظ، RLS/سیاست/گرانتهای تازه `true|true|1` و `true|true|false|false|false` |
| ترتیب H-04 روی DB ایزوله | `0064.down` EXIT=0؛ `0062.down` مستقیم EXIT=3 با `cannot drop table product_bulk_operation ...` و ۲ سیاست وابسته؛ سپس `0063.down` و `0062.down` هر دو EXIT=0 و `to_regclass(...)=NULL` |
| کاتالوگ نقشها | `nspowner=pg_database_owner`؛ `owner_create=false`؛ `migrator_owner_member=false`؛ `app_exec=false`؛ چهار نقش `dms_*` همچنان `NOLOGIN`؛ هیچ DB/نقش موقتی H باقی نماند |

دو فراخوانی اولیهٔ `test-migrations` و Vitest بهدلیل تنظیم نشدن `TEST_DB` و
`PSQL` در محیط شل با EXIT=1 مواجه شدند (خطای `zero-length delimited identifier`
و `spawnSync psql ENOENT`)؛ اینها شکست کد نبودند. بلافاصله با همان فایلها و محیط
صحیح دوباره اجرا و هر دو PASS شدند. جزئیات در `VERIFICATION.txt` ثبت شده است.

همهٔ اجراهای SQL فقط روی PostgreSQL محلی ایزوله و یکبارمصرف
`127.0.0.1:55432` بودند؛ هیچ DB production/مشترک، رمز production یا سرویس
خارجی لمس نشد. محیط محلی trust-auth و PG16.2 است و معادل CI واقعیِ PostGIS /
password-auth محسوب نمیشود؛ شواهد CI دقیق SHA پیشین G همچنان پابرجاست و CI
نهایی H ادعای سبزشدن ندارد مگر اینکه جداگانه بررسی شود.

## ۵) اسکن بینسندی و موارد باقیمانده

اسکن بینسندی با الگوهای `''public.audit_log''`، مالکیت طرحوارهٔ `dms_owner`،
«نقش مهاجرت»، `fn_ensure_partitions`، `DATABASE_URL` و ترتیب
`0062.down`/`0063.down` پس از ویرایشها اجرا شد؛ نتیجهٔ نهایی در
`VERIFICATION.txt` ثبت میشود. موارد زیر **عمداً باقیمانده و برچسبخورده**اند،
نه ادعای جاری:

1. کامنت درون `0062.down` («اجرای مستقیم و جداگانه ... ایمن») و کامنت `0041`
   («مالکِ طرحواره») در فایلهای محافظتشده قرار دارند و H اجازهٔ ویرایش آنها را
   نداشت؛ `migrations/README.md`، G/H report و این سند صراحتاً آنها را بهعنوان
   «نگهبان fail-closed / هدف تاریخی» تفسیر میکنند.
2. عبارتهای کلی «نقش/هویت مهاجرت» در `runtime-identity.ts`،
   `docs/deploy/PRODUCTION_DEPLOYMENT.md` و گزارشهای تاریخی TASK-12/TASK-19 به
   معنای جداسازی `APP_DATABASE_URL` از `DATABASE_URL` است، نه مجوز مستقل
   `dms_migrator` برای ترمیم پارتیشن. منطق احراز هویت زمان اجرا تغییر نکرد.
3. درخواستهای بازبینی مستقل F/G عمداً دستنخورده و در وضعیت «اجرا نشده /
   UNVERIFIED» باقی ماندند؛ یادداشت H فقط پرسش تاریخی آنها را پاسخ میدهد و حکم
  مستقلی صادر نمیکند.
4. توپولوژی دقیق مالک production بدون شاهد مجاز `UNVERIFIED` است.
   PM-B1..PM-B8، اتمیک بودن whole-file، S3/MinIO و Playwright E2E همچنان
   `OPEN / NOT APPROVED / BLOCKED`اند؛ پذیرش کامل دامنهٔ Product Master همچنان
   `BLOCKED` است.

## ۶) GitHub، push و وضعیت acceptance

- commit مرحلهٔ ۱ (H-01/H-02): `12b80451ab69de72b2bf4039324a015ff794c472`
  — ۳ فایل، push `2e6d271..12b8045` موفق.
- commit مرحلهٔ ۲ (H-03/H-04 و برچسب تاریخچه): `95bd63ac3184445fe616783ae9f1d4be45ace550`
  — ۱۲ فایل، push `12b8045..95bd63a` موفق.
- commitهای بعدی حاوی همین گزارش، `EVIDENCE_INDEX.md`، `VERIFICATION.txt` و
  نتیجهٔ اسکن نهایی نیز به همان شاخه push میشوند؛ SHA نهایی، نتیجهٔ push،
  تطابق محلی/remote و وضعیت PR در **گزارش پایانی چت** و head شاخه/PR در GitHub
  ثبت میشود. از درج هش خودارجاعی در این فایل، مطابق رویهٔ F/G، پرهیز شد.
- PR #14 باید `OPEN / DRAFT` با base `main` بماند؛ approve، merge، release،
  deploy یا تغییر بدنهٔ PR انجام نشد.
- **ارزیابی آمادگی پذیرش M4:** سازگاری مستندات عملیاتی و شواهد چهار یافتهٔ LOW
  بهبود یافت و آزمونهای متمرکز مهاجرت/امنیت سبزاند؛ ولی این یک reconciliation
  مستنداتی است، نه بازبینی کامل M4 یا تأیید مالک. بنابراین پذیرش فنی M4 و
  پذیرش دامنهٔ Product Master همچنان `UNVERIFIED / BLOCKED` باقی میماند و
  هیچ ادعای «پذیرش کامل M4» در این سند وجود ندارد.
