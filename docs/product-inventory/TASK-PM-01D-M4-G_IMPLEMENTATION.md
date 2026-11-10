# TASK-PM-01D-M4-G — حذف رقابتِ rollback و تصحیح بازیابی پارتیشن ممیزی

> **وضعیت:** اجرا و راستیآزمایی فنیِ خودارزیابیشده؛ **نه** approve، merge،
> release، deploy، تأیید مالک یا پذیرش کامل Product Master. PR #14 همچنان
> `OPEN / DRAFT` با base `main` است. حکم نهایی منوط به بازبینی مستقل فقطخواندنی
> است؛ تا پیش از آن، یافتهها «اصلاح فنی اثباتشده»اند نه «RESOLVED نهایی».
> SHA دقیق و شناسههای CI در **بدنهٔ PR #14** ثبت میشود تا این سند خودارجاعی
> و مستلزم commitـی تازه پس از سبزشدن CI نباشد.

## ۱) مبنا، حفظ کار پیشین و پشتیبان

- مبنای دقیق: `74e71172055d6cad482305db1834300c62fb53f5` (F نهایی / headـی PR #14).
- شاخه: `arena/be5eaff3-green-dms`؛ local HEAD، remote HEAD و PR head پیش از
  تغییر همگی همان SHA بودند؛ worktree تمیز؛ PR `OPEN / DRAFT` / base `main`.
- پشتیبان قابل بازیابی پیش از هر تغییر: `/tmp/pm01dm4g-backup/` و
- `/tmp/pm01dm4g-backup.tar.gz` شامل تمام `migrations/*.sql`، `audit.service.ts`،
  سوئیتهای امنیتی/امتیازی/مهاجرتی، مانیفست پارتیشن تست، اسناد معماری/استقرار/
  Product Master و بدنهٔ PR (۱۴۵ فایل). هیچ reset، force-push، rebase مخرب،
  بازنویسی تاریخ یا حذف کاری انجام نشد.
- اسناد و شواهد F/R و نتایج CI پیشین **دستنخورده** ماندند؛ G فقط پیوست میافزاید.
- `0060`، `0061`، `0041_db_privileges.up.sql`، `0019` و `0042` تغییر نکردند؛
  `apps/api/test/db-backed-tests.txt` تنها یک ورودی تازه گرفت.

## ۲) F-R-01 — علت ریشهای و اصلاح

**علت ریشهای (تأییدشده در بازبینی F-R):** نسخهٔ F نگهبان «خالیبودن دفتر/شواهد»
را بهصورت `EXISTS` سادهای در `READ COMMITTED` و **بدون هیچ قفل رابطهای** اجرا
میکرد. `migrate.mjs` هر down را در یک تراکنش واحد میگذارد، ولی تراکنش A و
تراکنش نویسندهٔ B مستقلاند: A نگهبان را روی تصویر لحظهای میبیند، B میانِ نگهبان
و `DROP TABLE`/`ALTER TABLE ... DROP COLUMN` ردیف operation-bound درج و commit
میکند، و DDLـی A همان دادهٔ تازهcommitted را خاموش حذف میکند (TOCTOU).
بازتولید مستقل F-R با پنجرهٔ مصنوعیاً گشادشده، `ledger_dropped=true` و
`evidence_gone=true` / `audit_col_gone=true` داد.

**اصلاح:** در `0062_product_bulk_maintenance.down.sql` و
`0063_product_bulk_evidence.down.sql`، پیش از *هر* بررسیِ داده، قفلهای سطحجدول
گرفته میشود:

```
ترتیب سراسری یکسان (و سازگار با ترتیب قفلِ مسیر نوشتن M4):
  product_bulk_operation → product_catalog_history
  → product_bulk_history_event → audit_log
هر رابطهٔ موجود: LOCK TABLE public.<rel> IN ACCESS EXCLUSIVE MODE
سپس: نگهبانِ fail-closed
سپس: DDLِ مخرب
```

- `ACCESS EXCLUSIVE` با `RowExclusiveLock`ـی `INSERT/UPDATE` ناسازگار است؛
  بنابراین `LOCK` منتظر نویسندههای درحالاجرا میماند و نویسندهٔ تازهای نمیتواند
  وارد شود. نگهبان، **وضعیت نهایی commitشده** را میسنجد.
- وجود رابطهها با `to_regclass`/`pg_attribute` شرطی بررسی میشود تا نگهبانها در
  وضعیتهای نیمهاعمالشده هم fail-closed بمانند؛ ولی **اجرای مستقیم `0062.down`
  هنگامی که `0063` هنوز اعمال است، بازگردانی موفق محسوب نمیشود**. سیاستهای RLS
  `product_bulk_history_event` به `product_bulk_operation` وابستهاند و `DROP TABLE`
  ممکن است با «cannot drop table … because other objects depend on it» متوقف شود.
  این شکست، تغییر نیمهاعمالشدهای بجا نمیگذارد و نگهبانها را تضعیف نمیکند.
- `audit_log` والدی پارتیشنشده است؛ `LOCK TABLE` بهصورت پیشفرض تمام پارتیشنهای
  فرزند را هم قفل میکند.
- **هیچ** `pg_sleep`، فرض زمانی، قلاب تست یا رفتار ویژهٔ production در SQL
  مهاجرت وجود ندارد. نگهبانها تضعیف نشدند، تراکنش و تاریخ مهاجرتها حفظ شد.

### ۲-الف) آزمون رقابت تعیینکننده

`apps/api/test/migration-rollback-race.test.ts` (۸ تست، DB یکبارمصرف،
اتصالهای مستقل، `PGAPPNAME` برای شناسایی بکندهای psql، همگامسازی صریح با
`pg_stat_activity`/`pg_locks`، جدول `g_witness` برای ثبت ترتیب واقعی):

| مورد | نتیجهٔ اجراشده |
|---|---|
| A | ردیف دفتر `committed` ⇒ `0062.down` شکست خورد و اسکیما/ردیف دستنخورده ماند |
| B | ردیف ممیزی operation-bound (بدون ردیف دفتر، تا علت منحصر باشد) ⇒ `0062/0063` نگهبانِ «ممیزی دارای همبستگی M4» را داد |
| C/0062 | نویسنده `BEGIN` + INSERT بدون commit ⇒ down منتظر قفل ماند (`wait_event_type='Lock'`)؛ پس از `COMMIT` نویسنده، نگهبان `پرشده` داد؛ ترتیب `rollback_waiting_on_lock < writer_committed` ثبت شد |
| C/0063 | همان با نویسندهٔ ممیزی (قفل چهارم) ⇒ نگهبان ممیزی، `FULL_STATE` unchanged |
| D/0062 | کنترلکننده `audit_log` را `ACCESS EXCLUSIVE` نگه داشت؛ down قفلهای ۱..۳ را گرفت (`pg_locks`: `AccessExclusiveLock` روی دفتر/تاریخچه) و منتظر ماند؛ نویسندهٔ پس از قفل **مسدود** شد (`wait_event_type='Lock'`)، `D62_writer_committed` هرگز ثبت نشد، down خالی با `code=0` دفتر را حذف کرد |
| D/0063 | همان برای شاهد `product_bulk_history_event`؛ `D63_writer_committed` هرگز ثبت نشد |
| E | پس از هر شکست نگهبان: ستونها، جداول، ۲ تریگر، ۲ سیاست، ۳ قید، ۵ ایندکس، ۲ تابع و ردیفها دقیقاً برابر قبل |
| F | چرخهٔ خالی `0063.down` → `0062.down` → `0062.up` → `0063.up` همان `FULL_STATE` و گرانتها/RLS اجباری را بازگرداند |
| G | دو دور شکست مکرر، سپس حذف ردیف ساختگی و down موفق؛ هیچ تغییر نیمهاعمالشدهای بجا نماند |

### ۲-ب) ترتیب اجرای بازگردانی (TASK-PM-01D-M4-H / H-04)

مهاجرتها باید **برعکسِ ترتیب وابستگی** برگردانده شوند؛ برای چرخهٔ M4/G ترتیب
استاندارد `0064.down → 0063.down → 0062.down → …` است و چرخهٔ خالی آزمونها
`0063.down → 0062.down → 0062.up → 0063.up` را دنبال میکند:

1. نخست `0063.down` سیاستها/شاهد/ستونهای همبستگی M4 را حذف میکند، سپس
   `0062.down` دفتر عملیات را حذف میکند.
2. اجرای مستقیم `0062.down` درحالیکه `0063` هنوز اعمال است **ممکن است fail-closed**
   کند، چون `drop table product_bulk_operation` با سیاستهای وابستهٔ
   `product_bulk_history_event` برخورد میکند. چنین خروجی `code≠0` هرگز «بازگردانی
   موفق» گزارش نمیشود؛ فقط یعنی از تغییر نیمهاعمالشده جلوگیری شده است.
3. `scripts/migrate.mjs` (`applied.slice(-count).reverse()`) و
   `scripts/test-migrations.mjs` (`[...migrations].reverse()`) ترتیب معکوس استاندارد
   runner را حفظ میکنند؛ هیچ قفلی، نگهبانی یا وابستگیای برای موفقکردن اجرای
   خارجترتیب تضعیف نشده است.

## ۳) F-R-02 — مدل واقعی مالکیت و هویت ترمیم

**اندازهگیری مستقل F-R روی DB تازه:** مالک `audit_log` = `postgres` (همان هویت
`DATABASE_URL` که مهاجرتها را اعمال کرده)؛ `dms_migrator` با `CREATE` روی `public`
⇒ `must be owner of table audit_log`؛ `dms_owner` ⇒ `permission denied for schema
public`؛ فقط `postgres` موفق شد. `0041_db_privileges.up.sql` عضویت `dms_owner` را
به `dms_migrator` نمیدهد و هیچ مهاجرتی مالکیتی منتقل نمیکند، درحالیکه
`docs/db-privilege-architecture.md` خلاف آن را توصیف میکرد. همچنین `0041` به
`dms_app` روی «همهٔ توابع public» `EXECUTE` داده و `CREATE FUNCTION` به `PUBLIC`
پیشفرض `EXECUTE` میداد.

**قانون PostgreSQL:** `create table … partition of <والد>` نیازمند مالکیت والد
(یا عضویت در نقش مالک) + `CREATE` روی `public` است. کمینهامتیازترین هویتِ قادر
به ترمیم، «مالک اشیاء» است؛ سپردن آن به `dms_app`/`dms_migrator` بدون انتقال
مالکیت یا `SECURITY DEFINER` ممکن نیست و هر دو گزینه خارج از مجوزند.

**اصلاح (`0064_audit_partition_recovery.up.sql`/`.down.sql`):**

- `fn_ensure_partitions(integer)` اکنون `SECURITY INVOKER` صریح،
  `search_path = public, pg_catalog, pg_temp` پینشده، و دارای **پیششرط مالکیت**
  روی هر سه والد (`audit_log`/`location_sample`/`inventory_txn`) بههمراه
  `CREATE` روی `public` است؛ هویت غیرمالک خطای عملیاتی صریح میگیرد.
- `EXECUTE` از `PUBLIC` و از هر چهار نقش `dms_app`/`dms_readonly`/`dms_migrator`/
  `dms_owner` گرفته شد؛ فقط مالک تابع (و ابرکاربر) آن را دارند.
- منطق `0042` حفظ شد: فقط پارتیشن موجودنبوده ساخته میشود، `FORCE RLS` و سیاست
  والد اعمال میشود، **هیچ ردیف/پارتیشن موجودی** حذف یا تغییر نمیکند.
- گرانتهای `dms_app`/`dms_readonly` روی پارتیشن تازه اکنون **صریح** و همارز
  `ALTER DEFAULT PRIVILEGES`ـی `0041` داده میشوند تا ترمیم توسط مالک دیگری
  برنامه را از کار نیندازد. تابع بایدار و قابل تکرار است.
- `AuditPartitionMissingError` و `classifyFailure` اکنون هویت مالک اشیاء
  (`DATABASE_URL`)، پرسوجوی بررسی مالک، ممنوعیت `dms_app`/`dms_migrator`/
  `dms_owner`، مراحل اجرا و ثبت لاگ استقرار را نام میبرند.
- `docs/db-privilege-architecture.md` (§۲، جدول اثر، §۲-الف) و
  `docs/deploy/PRODUCTION_DEPLOYMENT.md` (§۳-الف) به مدل اندازهگیریشده اصلاح شدند.
- **هیچ** `SECURITY DEFINER` تازه، نقش/رمز production، عضویت تازه، grant گسترده
  یا انتقال مالکیت production انجام نشد.

### ۳-الف) آزمون هویتهای واقعی

`apps/api/test/audit-partition-recovery.api.test.ts` (۷ تست، اتصال TCP واقعی با
رمز تصادفی، `current_user`/`session_user` تأییدشده، بدون `SET ROLE`، بدون
سبزکردن آزمون کمینهامتیاز با ابرکاربر):

- `dms_app`: غیرابرکاربر/غیرBYPASSRLS/غیرCREATEDB/غیرCREATEROLE؛ `EXECUTE` تابع
  رد شد؛ `CREATE TABLE` و `CREATE TABLE … PARTITION OF audit_log` رد شد.
- `dms_readonly`: `EXECUTE` رد شد؛ خواندن `product_bulk_operation` و
  `product_bulk_history_event` رد شد.
- `dms_migrator` و `dms_owner`: `EXECUTE` رد شد (هر دو اتصال TCP واقعی).
- حتی با اعطای `EXECUTE` آزمایشی به `dms_app`، پیششرط **مالکیت** در خود تابع
  جلوی ساخت پارتیشن را گرفت.
- یک هویت نگهداشتِ **غیرابرکاربر** (در DB یکبارمصرف، مالکیت والدها به آن منتقل
  و `EXECUTE` صریح داده شد) پارتیشن گمشده را ساخت؛ ۳ ردیف تاریخی ممیزی (شمارش و
  جمع `id`) دقیقاً unchanged ماند؛ `FORCE RLS` والد/پارتیشن، سیاست
  `p_audit_log_tenant` و گرانتهای `dms_app`/`dms_readonly` برقرار بودند؛ اجرای
  دوم هیچ پارتیشن تکراری نساخت.
- هویت مستند `DATABASE_URL` (مالک اشیاء) نیز ترمیم بایدار را انجام داد.

سوئیت امنیتی F و `migrations-security.test.ts` نیز بررسی میکنند که چهار نقش
فاقد `EXECUTE`اند و تابع `prosecdef=false` با `search_path` پینشده است.
همان سوئیت روی DB یکبارمصرف جداگانه، وضعیت کاتالوگ پس از `0064.down` را
**بایتبهبایت** با وضعیت پس از `0042` مقایسه میکند: بدنهٔ تابع،
`prosecdef/proconfig`، ترتیب دقیق `proacl`، comment تابع (شامل ZWNJ) و comment
طرحوارهٔ `public` (`standard public schema`). نسخهٔ نخست down که صرفاً
`CREATE OR REPLACE` بود این موارد را ناهمسان میگذاشت؛ `0064.down` اکنون تابع را
حذف و دقیقاً بدنهٔ `0042` را بازسازی میکند، `grant execute ... to dms_app` را
برمیگرداند، و هیچ پارتیشن/ردیف ممیزیای را حذف نمیکند. اعمال دوبارهٔ `0064.up`
همان سختسازی را برمیگرداند.

## ۴) شواهد اجراشده (کلاسها جدا شدهاند)

همه روی PostgreSQL 16.2 یکبارمصرف محلی `127.0.0.1:55432` با datadir
`/tmp/pm01dm2-pgdata`، **trust auth** (احراز رمز محلی ادعا نمیشود)، بدون
`DATABASE_URL`/`APP_DATABASE_URL` production، بدون DB مشترک/تولیدی. محیط محلی
فاقد PostGIS/pgcrypto/MinIO/Redis واقعی است؛ `ECONNREFUSED 6379` و خطاهای منفی
تست غیرfatalاند. لاگها: `/tmp/pm01dm4g-*.log`.

| کلاس | فرمان / نتیجه |
|---|---|
| ایستا / ساخت | `npm run typecheck` PASS، `npm run build` PASS، `npm run openapi:check` ۲۰۱/۲۸۴/۱۵۳/۳ valid، `contract-drift` صفر، `check-test-partition` ۸۰ فایل / declared==computed، `git diff --check` PASS |
| چرخه مهاجرت | `node scripts/test-migrations.mjs` ⇒ **۶۴** up/down/up، دقیقاً **۱۰۲۹** شیء یکسان، DB موقت حذف شد |
| هدفمند | ۶ فایل / **۴۹** تست PASS (M4 unit/API/security + migrations-security + race + recovery) |
| واحد API | ۲۶ فایل / **۳۳۹** تست PASS |
| وب | ۱۷ فایل / **۸۸** تست PASS |
| DB-backed منتخب محلی | **۴۹** فایل / **۱۰۰۴** تست PASS |
| سوئیت تازه رقابت | ۸/۸ PASS |
| سوئیت تازه نقش | ۷/۷ PASS |

چهار فایل `customers.api` / `geofences.api` / `postgres-init-role.api` /
`tours.api` وابسته به PostGIS/احراز رمز واقعی از اجرای منتخب محلی کنار گذاشته
شدند؛ در CI دقیق SHA نهایی اجرا میشوند. اجرای کامل ۵۳ فایلی CI محلی تکرار نشد؛
نتیجهٔ CI دقیق، **شواهد لاگ CI** است نه اجرای مجدد مستقیم.

## ۵) حفظ رگرسیون M2/M3/M4

- تفاوت نسبت به مبنا تنها ۲ فایل down تغییریافته، ۱ مهاجرت تازهٔ `0064`،
  پیامهای خطا، ۲ سوئیت تازه، ۱ ورودی مانیفست، و اسناد است؛ `0060`/`0061`/
  `0041`/`0019`/`0042` و `OpenAPI`/کلاینت typed/صفحهٔ RTL تغییر نکردند.
- شواهد operation-bound، شناسهٔ سرور‑کنترلشده، GUC فقطتراکنشی، RLS اجباری و
  کمینهامتیازی، تطبیق fail-closed، `accepted` پایدار، GET فقطخواندنی، اکشن
  صریح `POST .../reconcile`، `timingSafeEqual`، قفل `company+operation`، ممیزی
  الزامی و سازگاری OpenAPI/کلاینت همگی با سوئیتهای موجود دوباره PASS شدند.
- قفلگیری تازه با **ترتیبِ قفلِ مسیر نوشتن M4** همسو است تا بنبست نسازد؛
  آزمونهای D کاملاً تعیینکننده و بدون `pg_sleep` آن را نشان دادند.

## ۶) خودارزیابی و مرزها

| محور | حکم خودارزیابی |
|---|---|
| F-R-01 (رقابت rollback) | **PASS WITH FINDINGS** — اکسپلویت قدیمی و وارونهایش با آزمون تعیینکننده شکست خوردند؛ قفل `ACCESS EXCLUSIVE` هنگام rollback تمام نوشتنهای ممیزی/کاتالوگ را مسدود میکند (اثر عملیاتی قابلتوجه، در «ریسکها» آمده است) |
| F-R-02 (هویت ترمیم) | **PASS WITH FINDINGS** — مدل واقعی مستند و اعمال شد؛ توپولوژی مالک production همچنان `UNVERIFIED` |
| رگرسیون M2/M3/M4 | **PASS** |
| پذیرش کلی | **UNVERIFIED** تا بازبینی مستقل فقطخواندنی؛ حکم `FAIL` گزارش R تغییر نکرده است |

**UNVERIFIED / ریسکهای باقیمانده:** زیرساخت و مالکیت دقیق production؛ انتقال
مالکیت به `dms_owner` (خارج از مخزن)؛ قطع واقعی شبکه/ACK loss؛ بار اشباع pool؛
قفل `ACCESS EXCLUSIVE` هنگام rollback در پنجرهٔ نگهداری (تمام نوشتنهای
`audit_log`/`product_catalog_history` مسدود میشوند)؛ ترمیم پارتیشن توسط اپراتور
واقعی؛ بررسی دستی RTL/responsive/a11y/console؛ G-03؛ PM-B1..PM-B8؛
whole-file atomicity؛ پذیرش کامل Product Master / دامنهٔ عملیاتی؛ پاکسازی
انقضا (همچنان پیادهمسازی نشده، یافتهٔ LOW قدیمی).

**انجام نشد:** merge/approve، release/deploy، دسترسی به DB تولیدی/اشتراکی،
تغییر نقش یا رمز production، تصمیم مالک، رجیستری دامنه، صف/worker/BullMQ،
بایگانی خارجی، whole-file atomicity، تغییر معنای import، grant گسترده،
`SECURITY DEFINER` تازه برای دور زدن مالکیت، و هرگونه `pg_sleep`/قلاب تست در
SQL مهاجرت.
