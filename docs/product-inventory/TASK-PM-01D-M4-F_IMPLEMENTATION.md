# TASK-PM-01D-M4-F — رفع تطبیق نگهداشت گروهی، پارتیشن ممیزی زمان اجرا و امنیت نقش production

این سند گزارش اصلاحات فنی F روی مبنای دقیق
`6bffef38fc4ce007798e68d4c7959729c76100e2` است. PR #14 همچنان `OPEN / DRAFT`
با base `main` و شاخهٔ ثابت `arena/be5eaff3-green-dms` باقی میماند. F پاسخ به
گزارش فقطخواندنی `TASK-PM-01D-M4-R` با حکم `FAIL`
(`CRITICAL 0 / HIGH 1 / MEDIUM 3 / LOW 3`) است؛ آن گزارش تغییری در مخزن/DB نداد و
حکم آن تا انجام بازبینی مستقل متمرکز F به قوت خود باقی است. این سند صرفاً
« self-verified remediation » است، نه بازبینی مستقل، نه تأیید مالک و نه مجوز
ادغام/استقرار.

## ۱) یافتههای R و هدف F

| سطح | یافته R | اصلاح F |
|---|---|---|
| HIGH | `x-request-id` کلاینت از طریق PATCH معمولی میتوانست شروط تطبیق `request_id=operation_id` و تاریخچهٔ ۰۰۶۰ را جعل کند و وضعیت `committed` کاذب بسازد. | ستونهای سرور-کنترلشدهٔ `bulk_operation_id`، جدول شاهد `product_bulk_history_event`، GUC فقطتراکنشی و تطبیق operation-bound؛ `request_id` فقط تشخیصی است. |
| MEDIUM | `recordRequired` زیر `dms_app` تابع DDLـدار `fn_ensure_partitions(2)` را صدا میزد. | حذف کامل DDL از زمان اجرا؛ خطای صریح `AuditPartitionMissingError` و طبقهبندی `audit_partition_missing` با rollback کامل. |
| MEDIUM | `0062.down.sql` دفتر پرشده را بیدقت حذف میکرد. | محافظ fail-closed روی هر ردیف دفتر؛ rollback تراکنش مهاجرت، بدون بایگانی خارجی یا حذف خودکار. |
| MEDIUM | RLS/grantهای production-equivalent فقط استنتاج/`SET ROLE` بود. | سوئیت واقعی با اتصال TCP به نقش `dms_app`، `APP_DATABASE_URL`، عدم ابرکاربر/مالکیت/BYPASSRLS، RLS اجباری، grantها و GUCهای fail-closed. |
| LOW | GET وضعیت تغییر حالت میداد؛ پیشنمایش ledger مینوشت؛ مقایسهٔ توکن زمان-ثابت نبود؛ قفل شرکتی سراسری؛ پاکسازی انقضا؛ اسناد قدیمی. | GET واقعاً فقطخواندنی + `POST .../reconcile` صریح؛ `timingSafeEqual`؛ قفل `company+operation`؛ ایندکس انقضا؛ اسناد F. |

هیچ تصمیم مالک، دامنهٔ عملیاتی، واژگان RBAC، صف/worker، تغییر معنای import،
بازنویسی `0060`/`0061`، تغییر production/DB اشتراکی، merge، approve، release یا
deploy انجام نشد.

## ۲) مهاجرت ۰۰۶۳ و محافظت از شواهد

`migrations/0063_product_bulk_evidence.up.sql` فقط افزودنی است:

- `audit_log.bulk_operation_id` و `product_catalog_history.bulk_operation_id`
  از نوع `uuid`، با ایندکس و `NULL` برای ردیفهای تاریخی.
- جدول `product_bulk_history_event` با `history_id bigint` همنوع `0060`،
  قید یکتای `(bulk_operation_id, product_id)` و `history_id`، RLS اجباری،
  `SELECT` فقط برای `dms_app` و `REVOKE ALL` از `dms_readonly`.
- دو تریگر `SECURITY INVOKER` با `search_path` پینشده و `REVOKE EXECUTE`:
  یکی `bulk_operation_id` را فقط از GUC تراکنشی و دفتر `accepted` همان
  شرکت/بازیگر میگیرد، دیگری شاهد الزامی را درون همان تراکنش مینویسد. نوشتن
  شاهد از مسیر تریگر `SECURITY DEFINER` موجود ۰۰۶۰ انجام میشود؛ تابع
  `SECURITY DEFINER` تازهای اضافه نشد.
- `0063.down.sql` و `0062.down.sql` در صورت وجود حتی یک ردیف دفتر/شاهد/
  تاریخچه/ممیزی همبسته، با پیام عملیاتی شکست میخورند و تراکنش مهاجرت rollback
  میشود. هیچ مقصد بایگانی خارجی یا حذف خودکار فرض نشده است. چرخهٔ خالی
  up/down/up همچنان مجاز است.

## ۳) سرویس، قرارداد و رابط

- `AuditService.recordRequired` دیگر DDL نمیکند؛ کمبود پارتیشن ماهانه به
  `AuditPartitionMissingError` تبدیل میشود. **یادداشت تاریخی F:** راهنمای آن
  نسخه `fn_ensure_partitions(2)` را برای «نقش مهاجرت» معرفی میکرد؛ این فرض در
  G و H اصلاح شد. مدل پشتیبانیشدهٔ فعلی فقط «مالک اشیاء / همان `DATABASE_URL`
  مجاز» را برای ترمیم پارتیشن میپذیرد. `bulkOperationId` فقط توسط سرویس M4 ست
  میشود.
- `resultFromRow` هنگام `accepted/unknown/preview_created` نتیجهٔ ذخیرهشدهٔ
  قدیمی را حاکم نمیداند؛ بنابراین GET فقطخواندنی نمیتواند `committed` کاذب
  برگرداند.
- تطبیق فقط ستونهای `bulk_operation_id`، شرکت، بازیگر، محصول، تاریخچه و شاهد
  همان عملیات را میسنجد: کامل/سازگار/بدون تکرار/بدون محصول ناخواسته/بدون
  اتصال به عملیات دیگر. شواهد ناقص یا مبهم ⇒ `unknown` و `reconciled:false`.
- `GET /operations/{operationId}` فقط میخواند؛
  `POST /operations/{operationId}/reconcile` اکشن صریح تطبیق است.
- توکن پیشنمایش با `timingSafeEqual` مقایسه میشود؛ قفل مشورتی به
  `company_id + operation_id` محدود شد؛ GUC `app.bulk_operation_id` فقط
  تراکنشی و فقط پس از `accepted` و پیش از نخستین UPDATE محصول ست میشود.
- OpenAPI، کلاینت typed و صفحهٔ فارسی RTL با دکمهٔ «تطبیق شواهد و بازخوانی»
  همتراز شدند. `GET` دیگر وضعیت دفتر را تغییر نمیدهد.

## ۴) شواهد اجراشده (کلاسها جدا شدهاند)

همهٔ اجراها روی PostgreSQL 16.2 یکبارمصرف محلی `127.0.0.1:55432` با datadir
`/tmp/pm01dm2-pgdata`، بدون `DATABASE_URL`/`APP_DATABASE_URL` production، بدون
اتصال کلاینت دیگر و بدون لمس DB اشتراکی/تولیدی انجام شد. محیط محلی PostGIS
واقعی، pgcrypto واقعی، MinIO و Redis ندارد؛ `ECONNREFUSED 127.0.0.1:6379`
غیرفatal است. CI دقیق SHA نهایی از `postgis/postgis:16-3.4` و سرویسهای واقعی
استفاده میکند.

### الف) ایستا / ساخت / قرارداد

| دستور | نتیجه |
|---|---|
| `npm run typecheck` | PASS |
| `npm run build` | PASS؛ build وب شامل `/products/bulk-maintenance` |
| `npm run openapi:check` | 201 path / 284 operation / 153 schema / 3 webhook؛ valid |
| `node scripts/contract-drift.mjs` | 284/284/284؛ diff صفر |
| `node scripts/check-test-partition.mjs` | 78 فایل؛ declared == computed |
| `npm run generate -w packages/api-client` | PASS؛ `schema.ts` +49/−4 |
| `git diff --check` + `git diff --cached --check` | PASS |

### ب) اجرای واقعی روی DB یکبارمصرف

| دستور | نتیجه |
|---|---|
| `node scripts/migrate.mjs status` | 0 اعمالشده / 63 در انتظار |
| `node scripts/test-migrations.mjs` | چرخهٔ سخت 63 up/down/up؛ دقیقاً 1029 شیء یکسان؛ DB موقت حذف شد |
| focused M4 + migrations + security | 4 فایل / 32 تست PASS |
| `test/migrations-security.test.ts` | 6/6 شامل ۰۰۶۳، down پرشده و چرخهٔ خالی |
| DB-backed انتخابی محلی | 47 فایل / 987 تست PASS |
| DB-free API unit | 26 فایل / 339 تست PASS |
| `npm run test:web` | 17 فایل / 88 تست PASS |

چهار فایل `customers.api` / `geofences.api` / `postgres-init-role.api` /
`tours.api` بهدلیل نبود PostGIS واقعی و password auth از اجرای انتخابی محلی
کنار گذاشته شدند؛ در CI دقیق SHA نهایی اجرا میشوند. لاگها در
`/tmp/pm01dm4f-*.log` هستند و بهعنوان artifact تولیدی وارد Git نشدند.

### ج) نقش واقعی `dms_app` (نه superuser، نه فقط `SET ROLE`)

`apps/api/test/product-bulk-maintenance-security.api.test.ts` یک DB یکتا و
یکبارمصرف میسازد، نقشهای `dms_app` / `dms_readonly` را قابل اتصال میکند،
`APP_DATABASE_URL` را روی اتصال TCP واقعی `dms_app` میگذارد و `AppModule` را
با همان هویت boot میکند. 11/11 تست PASS:

- `PG_POOL.current_user = dms_app`، `rolsuper=false`، `rolbypassrls=false`،
  مالکیت صفر جدول و RLS اجباری؛
- `dms_app` فاقد `CREATE` روی `public` است، نمیتواند DDL کند، نمیتواند با
  `fn_ensure_partitions(12)` پارتیشن بسازد، نمیتواند در جدول شاهد INSERT/DELETE
  کند و `dms_readonly` دفتر/شاهد M4 را نمیبیند؛
- GUC خالی/جعلی ⇒ fail-closed؛ درج و بروزرسانی بینشرکتی رد میشود؛
- جریان عادی M4 تحت `dms_app` دقیقاً 1 ممیزی، 2 تاریخچه و 2 شاهد همبسته
  مینویسد و `request_id` کلاینت صفر است؛
- PATCH معمولی با `x-request-id` جعلی هیچ شاهد operation-bound نمیسازد و
  تطبیق `committed` کاذب نمیدهد؛
- شواهد ناقص/ناسازگار/تکراری/بینعملیاتی/بازیگر اشتباه ⇒ `unknown`؛
- دفتر `accepted` با شواهد کامل بهصورت پایدار `committed` و بدون شواهد بهصورت
  پایدار `rejected/rolled_back` تطبیق مییابد؛
- کمبود پارتیشن `audit_log` زیر `dms_app` ⇒ rollback اتمی،
  `reason_code=audit_partition_missing`، پیام حاوی `fn_ensure_partitions`،
  سپس ترمیم ممتاز و موفقیت عملیات تازه.

محدودیت صادقانه: کلاستر محلی `trust auth` دارد؛ بنابراین ادعای «احراز هویت با
رمز» نمیشود، بلکه اتصال واقعی با هویت کمینهامتیاز `dms_app` و اعمال کامل
RLS/grantها اثبات شده است. CI از تصویر PostGIS با `POSTGRES_PASSWORD` استفاده
میکند.

## ۵) ماتریس حکم F (خودارزیابی، نه بازبینی مستقل)

| # | مورد | حکم | دلیل / مرز |
|---:|---|---|---|
| ۱ | تراکنش واحد و all-or-nothing | PASS WITH FINDINGS | rollback پارتیشن/تداخل تست شد؛ قطع شبکه واقعی UNVERIFIED |
| ۲ | idempotency و تطبیق غیرقابلجعل | PASS WITH FINDINGS | شواهد ۰۰۶۳، POST صریح، فورجری و accepted تست شد؛ ACK-loss واقعی UNVERIFIED |
| ۳ | نقش production، RLS و grantها | PASS WITH FINDINGS | اتصال واقعی `dms_app`، عدم DDL/INSERT/DELETE، GUC fail-closed؛ DB دقیقاً معادل production و بار اشباع UNVERIFIED |
| ۴ | فهرست سفید و فیلدهای محافظتشده | PASS | DTO/سرویس/تستهای M4 بدون تغییر معنا |
| ۵ | مهاجرت و ممیزی | PASS WITH FINDINGS | 63 up/down/up، down پرشده، خطای پارتیشن صریح؛ ترمیم اپراتوری واقعی UNVERIFIED |
| ۶ | رگرسیون M2/M3/قرارداد/UI | PASS WITH FINDINGS | 47/987 DB، 26/339 unit، 17/88 web؛ چهار فایل محیطی فقط CI |
| ۷ | بازبینی مستقل متمرکز F | UNVERIFIED | درخواست بازبینی تهیه شد، ولی اجرا/حکم مستقل انجام نشده است |
| ۸ | پذیرش کامل Product Master / دامنه | BLOCKED | PM-B1..PM-B8 و whole-file atomicity همچنان OPEN / NOT APPROVED |

**حکم فنی خودارزیابی F:** `PASS WITH FINDINGS`.
**حکم R:** تا بازبینی مستقل، `FAIL` باقی میماند؛ F آن را به `PASS` تغییر نمیدهد.
**حکم کلی Product Master:** `BLOCKED`.
**PR #14:** `OPEN / DRAFT`؛ بدون merge/approve/release/deploy.

## ۶) موارد صریحاً UNVERIFIED

پایگاهداده دقیقاً معادل production، قطع واقعی شبکه/ازدسترفتن ACK، بار اشباع
connection pool، ترمیم پارتیشن توسط اپراتور در محیط واقعی، بررسی دستی
responsive/a11y/console، اتصال تأیید دونفره G-03، بایگانی خارجی شواهد،
تصمیم whole-file، PM-B1..PM-B8، و بازبینی مستقل متمرکز F. هیچکدام بهعنوان PASS
گزارش نشدهاند.

## ۷) SHA و CI دقیق

برای جلوگیری از هش خودارجاعی که با هر ویرایش سند بلافاصله کهنه میشود، SHA نهایی
و شناسههای دقیق check-run/job فقط پس از push در **بدنهٔ PR #14** و گزارش پایانی
ثبت میشوند. این سند و `evidence/task-pm-01d-m4-f/VERIFICATION.txt` شواهد محلی
را نگه میدارند؛ شواهد محلی بهتنهایی ادعای سبزشدن CI یا معادل production نیست.
لاگ دقیق CI پس از `gh pr checks --watch` در `/tmp` نگهداری میشود.

## ۸) مرز اصلاح

- اصلاح فقط در شاخهٔ ثابت نشست و همان PR DRAFT انجام شد.
- هیچ `SECURITY DEFINER` تازهای، grant گسترده، `CREATE` برای `dms_app`،
  بایگانی خارجی، تأیید ضمنی مالک یا تغییر معنای `0060`/`0061` اضافه نشد.
- **یادداشت تاریخی H:** عبارت «مسیر مهاجرت/تعمیرات ممتاز» متعلق به فرض F است.
  مدل پشتیبانیشدهٔ فعلی فقط «مالک اشیاء = `DATABASE_URL`» را میپذیرد؛ `dms_migrator`
  بهتنهایی پارتیشن `audit_log` را ترمیم نمیکند و `dms_app` هرگز پارتیشن/DDL نمیسازد.
- درخواست بازبینی مستقل متمرکز در
  `TASK-PM-01D-M4-F_INDEPENDENT_REVIEW_REQUEST.md` آماده شده، ولی اجرا نشده است.
- **H-04:** بازگردانی `0062`/`0063` فقط در ترتیب معکوس وابستگی (`0063.down`
  پیش از `0062.down`) پشتیبانیشده است. اجرای مستقیم `0062.down` هنگامی که `0063`
  اعمال است ممکن است روی سیاستهای وابسته fail-closed کند؛ آن شکست، rollback موفق
  نیست و نگهبانها تضعیف نشدهاند.
