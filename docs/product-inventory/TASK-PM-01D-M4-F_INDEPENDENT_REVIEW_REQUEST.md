# درخواست بازبینی مستقل متمرکز — TASK-PM-01D-M4-F

> وضعیت: **آماده، ولی اجرا نشده / UNVERIFIED**. این سند فقط دامنه و پرسشهای
> بازبینی را مشخص میکند. هیچ حکم مستقل، تأیید امنیتی، تأیید مالک، merge،
> approve، release یا deploy صادر نشده است. حکم گزارش R (`FAIL`) همچنان پابرجاست.
>
> **یادداشت تاریخی H-02/H-03:** پرسش «نقش مهاجرت» در بند ۵ متعلق به فرض F است.
> مدل جاری `0064` اجرای `fn_ensure_partitions` را از `dms_app`، `dms_readonly`،
> `dms_migrator` و `dms_owner` گرفته و ترمیم را فقط به «مالک اشیاء / `DATABASE_URL`
> مجاز» محدود کرده است. این سند تاریخی است و حکم مستقلی صادر نمیکند.

## ۱) مبنا و محدودهٔ فقطخواندنی

- مبنای دقیق F: `6bffef38fc4ce007798e68d4c7959729c76100e2`.
- شاخه: `arena/be5eaff3-green-dms`؛ PR #14 `OPEN / DRAFT` با base `main`.
- بازبین باید فقط کد، تستها، مهاجرتها، اسناد، بدنهٔ PR و متادیتای CI همان SHA
  نهایی را بخواند. هیچ تغییر مخزن، اجرای مهاجرت روی DB مشترک/تولیدی، تغییر نقش،
  تغییر PR، merge یا استقرار مجاز نیست.
- خروجی مطلوب: جدول `PASS` / `PASS WITH FINDINGS` / `FAIL` / `BLOCKED` /
  `UNVERIFIED` برای هر محور، با جدا کردن «بازرسی کد»، «تست ایستا»، «اجرای DB
  یکبارمصرف»، «اجرای نقش واقعی `dms_app`» و «رفتار استنتاجشده».

## ۲) محورهای بررسی

1. **غیرقابلجعل بودن شواهد:** آیا `bulk_operation_id` فقط از GUC تراکنشی
   سرور و دفتر `accepted` همان شرکت/بازیگر میآید؟ آیا PATCH معمولی، هدر
   `x-request-id`، payload، `request_id` یا مقادیر `after_data` نمیتوانند شاهد
   `product_bulk_history_event` / تاریخچهٔ ۰۰۶۰ / ممیزی operation-bound بسازند؟
2. **امتیاز کمینه و مالکیت تریگر:** آیا `dms_app` واقعاً فاقد `CREATE`،
   `INSERT/UPDATE/DELETE` روی جدول شاهد، `EXECUTE` روی توابع تریگر و `DELETE`
   روی دفتر است؟ آیا `SECURITY DEFINER` تازهای اضافه نشده و `search_path`
   توابع پین شده است؟ آیا `dms_readonly` دفتر/شاهد M4 را نمیبیند؟
3. **تطبیقfail-closed:** آیا شواهد ناقص، ناسازگار، تکراری، بینعملیاتی،
   بازیگر/شرکت اشتباه، محصول ناخواسته و نسخهٔ هنوز دستنخورده همگی به
   `unknown`/`rejected` امن ختم میشوند؟ آیا دفتر `accepted` پس از تطبیق بهصورت
   پایدار به `committed` یا `rejected/rolled_back` بروز میشود؟
4. **GET فقطخواندنی و اکشن صریح:** آیا `GET /operations/{id}` هیچ گذار وضعیتی
   انجام نمیدهد و آیا `POST /operations/{id}/reconcile` تنها مسیر تطبیق است؟
   آیا نتیجهٔ ذخیرهشدهٔ قدیمی هنگام `unknown/accepted/preview_created` حاکم
   نمیشود؟
5. **پارتیشن ممیزی:** آیا `recordRequired` هیچ DDLـی زیر `dms_app` اجرا نمیکند؟
   آیا کمبود پارتیشن منجر به rollback کامل، `audit_partition_missing` و پیام
   عملیاتی برای نقش مهاجرت میشود؟ آیا `fn_ensure_partitions` همچنان برای نقش
   برنامه قابل self-provision نیست؟
6. **مهاجرتها:** آیا ۰۰۶۳ فقط افزودنی است، `0060`/`0061` دستنخوردهاند،
   `history_id bigint` با ۰۰۶۰ همنوع است، و `0062.down`/`0063.down` روی دفتر/
   شاهد/تاریخچه/ممیزی پرشده fail-closed میدهند؟ آیا چرخهٔ خالی up/down/up
   همچنان برگشتپذیر است؟
7. **قرارداد و رابط:** آیا OpenAPI، کلاینت typed، کنترلر و صفحهٔ RTL با اکشن
   صریح تطبیق همترازاند؟ آیا مقایسهٔ توکن زمان-ثابت و قفل
   `company+operation` بهدرستی اعمال شدهاند؟
8. **مرزها:** آیا هیچ تصمیم مالک، دامنهٔ عملیاتی، واژگان RBAC، صف/worker،
   تغییر معنای import، بایگانی خارجی، grant گسترده، تغییر production/DB
   اشتراکی، merge، approve، release یا deploy انجام نشده است؟

## ۳) شواهدی که بازبین باید دوباره بسنجد

- `apps/api/test/product-bulk-maintenance-security.api.test.ts`: اتصال واقعی
  `dms_app` از طریق `APP_DATABASE_URL`؛ عدم ابرکاربر/مالکیت/BYPASSRLS؛ RLS
  اجباری؛ GUC خالی/جعلی؛ فورجری `x-request-id`؛ شواهد ناقص/بینعملیاتی؛
  accepted-ledger؛ کمبود پارتیشن ممیزی.
- `migrations/0063_product_bulk_evidence.up.sql` / `.down.sql` و
  `migrations/0062_product_bulk_maintenance.down.sql`.
- `apps/api/src/common/audit.service.ts`،
  `apps/api/src/modules/master-data/product-bulk-maintenance.repository.ts`،
  `.service.ts`، `.types.ts`، `.controller.ts`.
- `apps/api/test/migrations-security.test.ts`،
  `product-bulk-maintenance.api.test.ts`،
  `product-bulk-maintenance-unit.test.ts`،
  `apps/web/src/app/products/bulk-maintenance/page.test.tsx`.
- `node scripts/test-migrations.mjs` و نتایج محلی ثبتشده در
  `evidence/task-pm-01d-m4-f/VERIFICATION.txt`.
- بدنهٔ PR #14 شامل SHA نهایی، شناسههای check-run/job و نتیجهٔ دقیق CI.

## ۴) مواردی که بازبین نباید بهعنوان PASS بپذیرد

پایگاهداده دقیقاً معادل production، قطع واقعی شبکه/ازدسترفتن ACK، بار اشباع
pool، ترمیم پارتیشن توسط اپراتور واقعی، بررسی دستی responsive/a11y/console،
اتصال تأیید دونفره G-03، تصمیم whole-file، PM-B1..PM-B8، و پذیرش کامل
Product Master. محیط محلی `trust auth` است؛ اتصال واقعی `dms_app` اثبات شده،
ولی احراز هویت با رمز در همان کلاستر ادعا نمیشود.

## ۵) خروجی نهایی مورد انتظار

گزارش فارسی فقطخواندنی با:

- SHA دقیق و تاریخ بررسی؛
- جدول یافتهها با سطح `CRITICAL/HIGH/MEDIUM/LOW` و کلاس شاهد؛
- حکم جداگانه برای هر یک از ۸ محور بالا؛
- حکم کلی `PASS` / `PASS WITH FINDINGS` / `FAIL` / `BLOCKED`؛
- فهرست صریح `UNVERIFIED`ها؛
- اعلام اینکه آیا حکم `FAIL` گزارش R قابل تغییر هست یا خیر.

تا زمانی که این گزارش توسط بازبین مستقل تهیه نشود، F صرفاً «اصلاح فنی
خودارزیابیشده» است و حکم R تغییر نمیکند.
