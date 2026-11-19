# راهنمای استقرار پروداکشن Green-DMS

> **وضعیتِ این سند:** بخش‌های S8-04 (۳-الف تا ۳-ج و ۵) با اجرای real-login روی PostgreSQL 16.2 + PostGIS 3.4.2 تنظیم شده‌اند؛ اجرای کامل در محیطِ بعدی باید دوباره انجام شود (بخش «وضعیتِ شواهد» در گزارشِ TASK-04). بقیهٔ سند با HEAD جاری راستی‌آزمایی شده (TASK-19)؛ دستورها، پورت‌ها و
> endpointهای سلامت با کدِ واقعی هم‌ترازند. مواردی که هنوز آزمایشِ عملیاتی نشده‌اند
> (مانند restore بک‌آپ) صریحاً «آزمایش‌نشده» گزارش شده‌اند، نه «فعال».

## ۱) پیش‌نیازها

- Docker + Docker Compose v2
- یک میزبانِ لبه با دامنه و TLS (Nginx/Caddy/Traefik/Cloudflare) — تنها ورودیِ عمومی: **443**
- حداقل ۲ CPU / 4GB RAM / 20GB دیسک

تصاویرِ پایه: `postgis/postgis:16-3.4` (PostgreSQL 16 + PostGIS)، `redis:7-alpine`.
سرویسِ MinIO فقط برایِ ضمیمه‌های POD لازم است؛ تصویرِ `minio/minio` باید از رجیستریِ
خودتان pull شود (در CI عمومی مسدود است — به بخشِ ۱۱ نگاه کنید).

## ۲) تنظیم متغیرها

```bash
cp .env.production.example .env.production
# همهٔ مقادیر CHANGE_ME/REPLACE_WITH را با مقادیر واقعی عوض کنید
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"  # برای هر رمز
```

**متغیرهای الزامیِ production** (API بدونِ آن‌ها fail-closed بالا نمی‌آید):

| متغیر | نقش | قاعدهٔ ردشدن (fail-closed) |
|---|---|---|
| `JWT_SECRET` | امضای توکن‌ها | نبود/جای‌نگه‌دار/کوتاه‌تر از ۳۲ نویسه/تک‌نویسه ⇒ رد |
| `APP_DATABASE_URL` | نقشِ زمانِ اجرا (`dms_app`) | نبود یا یکی بودن با هویتِ مالک اشیاء / اجرای مهاجرتها ⇒ رد |
| `DATABASE_URL` | **هویتِ مهاجرت** `dms_migrator` (LOGIN جدا؛ فقط برای `scripts/migrate.mjs`)؛ **نه** مالکِ اشیاء و **نه** هویتِ زمانِ اجرا. در زمانِ اجرای عادیِ API لازم نیست | رمزِ جای‌نگه‌دار ⇒ رد؛ یکی‌بودن با `APP_DATABASE_URL` ⇒ رد. نقشِ `dms_app`/`dms_maintainer` در این متغیر **مجاز نیست** (بررسیِ خودکار در راه‌اندازی وجود ندارد؛ اپراتور مسئول است) |
| `ALLOWED_ORIGINS` | فهرستِ CORS (کاما-جدا) | نبود یا ورودیِ نامعتبر ⇒ رد؛ `*` ممنوع |
| `SMS_PROVIDER` + درگاه | تحویلِ OTP | `log` بدونِ `SMS_ALLOW_LOG_PROVIDER=true` ⇒ رد |
| `PSP_WEBHOOK_SECRET` | HMAC وب‌هوک PSP | فقط اگر `PSP_ENDPOINT` ست باشد؛ جای‌نگه‌دار ⇒ رد |
| `MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` | آبجکت‌استوریج | فقط اگر `MINIO_ENDPOINT` ست باشد؛ پیش‌فرض ⇒ رد |

دو دریچهٔ صریح وجود دارد که **فقط** برایِ پشتهٔ throwaway محلی/CI هستند و در
استقرارِ واقعی نباید ست شوند:

- `DMS_ACCEPT_INSECURE_LOCAL_SETUP=true` — ردشدنِ بررسی‌های امنیتیِ بالا (با هشدارِ بلند).
- `SMS_ALLOW_LOG_PROVIDER=true` — پذیرفتنِ `SMS_PROVIDER=log` (کدِ OTP فقط در لاگ).

## ۳) نقش‌های پایگاه‌داده (یک‌بار، دستی، بیرون از مهاجرت‌ها)

معماریِ کامل: `docs/db-privilege-architecture.md` (نقش‌ها: `dms_owner`، `dms_migrator`
مهاجرت‌ها، `dms_app` زمانِ اجرا، `dms_readonly` گزارش‌گیری). نکته‌های حیاتی:

- نقشِ زمانِ اجرا باید **غیرِابرکاربر، غیرِBYPASSRLS و مالکِ هیچ جدولی** باشد؛
  API هنگامِ راه‌اندازی این را از خودِ پایگاه‌داده می‌پرسد و در production در صورتِ
  ناامنی **بالا نمی‌آید** (fail-closed).
- رمزِ نقش را هرگز در `ALTER ROLE ... PASSWORD '...'` نگذارید (در لاگِ `log_statement`
  می‌نشیند). مسیرِ امن:

```sql
alter role dms_app login;   -- فقط LOGIN؛ هیچ رمزی در متنِ دستور نیست
\password dms_app           -- psql سمتِ کلاینت هش می‌کند (SCRAM) و فقط verifier می‌فرستد
```

- برایِ حجمِ محلیِ **تازه**، اسکریپتِ init (`docker/postgres-init/10-runtime-role.sh`)
  همین کار را خودکار و بدونِ نشتِ رمز انجام می‌دهد؛ رویِ دیتابیسِ موجود **هرگز** اجرا
  نمی‌شود (فقط وقتی volume خالی است).

### ۳-الف) هویت‌ها و جداسازیِ اعتبار (S8-04؛ آزمونِ قبلی با LOGIN واقعی روی PG16.2 انجام شد، محیطش بازتولید نشده؛ S8-05: UNVERIFIED تا اجرای PG16+PostGIS)

| هویت | نوع | دسترسی | ممنوعیت‌های آزموده‌شده |
|---|---|---|---|
| `postgres` (ابرکاربرِ استقرار) | سوپرکاربر | فقط `bootstrap`، پنجرهٔ مهاجرت (grant/revoke)، بازگشتِ اضطراری | **هرگز** در `APP_DATABASE_URL`، `DATABASE_URL` یا `MAINTENANCE_DATABASE_URL`؛ هرگز در API یا کارگر |
| `dms_migrator` | LOGIN، `NOSUPERUSER NOBYPASSRLS` | مالکِ اشیاء (تا پیش از انتقال به `dms_owner` برای جداول دفتر)؛ اجرای `scripts/migrate.mjs` | عضوِ `dms_owner` **فقط** درونِ پنجرهٔ مهاجرت؛ خارج از پنجره: `SET ROLE dms_owner` و `TRUNCATE` دفتر ⇒ `42501`؛ `ALTER ROLE`/`CREATE ROLE`/`GRANT dms_owner` ⇒ `42501` |
| `dms_app` | LOGIN، `NOSUPERUSER NOBYPASSRLS` | هویتِ زمانِ اجرای API (`APP_DATABASE_URL`) | عضوِ `dms_owner`/`dms_maintainer` نیست؛ `SET ROLE` به هیچ‌کدام ⇒ `42501`؛ `UPDATE/DELETE/TRUNCATE` روی دفتر و روی `audit_log`/`location_sample` ⇒ `42501`؛ `fn_ensure_partitions`/`fn_maintain_inventory_partitions`/`fn_inventory_txn_maintenance_begin` ⇒ `42501`؛ DDL ⇒ `42501` |
| `dms_maintainer` | LOGIN، `NOSUPERUSER NOBYPASSRLS` | فقط `EXECUTE` روی سه wrapper: `fn_maintain_inventory_partitions` (0070)، `fn_maintain_audit_partitions` و `fn_maintain_location_partitions` (0071/0072)؛ ورودی ۰..۱۲ | عضوِ `dms_owner` نیست؛ `TRUNCATE/DELETE/UPDATE/DISABLE TRIGGER/DROP` روی دفتر ⇒ `42501`؛ ورودیِ خارج از بازه ⇒ `22023` |
| `dms_owner` | `NOLOGIN` | مالکِ جداولِ دفتر (`inventory_txn` و پارتیشن‌های آن)؛ هیچ LOGIN مستقیم ندارد | `dms_app` و `dms_maintainer` هرگز عضوِ آن نیستند |
| `dms_readonly` | `NOLOGIN` | گزارش‌گیری (فقط `SELECT`) | — |

- **`AUTO_MIGRATE=false` در production الزامی است.** اعتبارسنجیِ راه‌اندازی اگر `AUTO_MIGRATE` تنظیم نشده باشد یا مقدارِ دیگری داشته باشد، API را بالا نمی‌آورد (fail-closed؛ آزمونِ واحد دارد). دلیل: با `AUTO_MIGRATE=true` هویتِ `dms_migrator` داخلِ پروسهٔ API قرار می‌گیرد.
- **راستی‌آزماییِ هویتِ زمانِ اجرا** (`verifyRuntimeDatabaseIdentity`) در راه‌اندازیِ production روی اتصالِ واقعی اجرا می‌شود و در صورتِ یکی از این موارد **بالا نمی‌آید**: ابرکاربر، `BYPASSRLS`، مالکیتِ هر شیءِ `public`، عضویتِ مستقیم یا غیرمستقیم در `dms_owner` یا `dms_maintainer`، امکانِ `SET ROLE dms_owner`، یا نامِ `dms_migrator` به‌عنوانِ هویتِ زمانِ اجرا. پیام‌ها هرگز رمز یا رشتهٔ اتصال را نشان نمی‌دهند.
- **رمزها** فقط از مدیرِ رمز یا `.pgpass`/متغیرِ تزریق‌شده می‌آیند؛ هیچ رمزی در SQL، مخزن، لاگ یا متنِ دستور نیست.

### ۳-ب) نصبِ یک‌باره (bootstrap) و PostGIS — فقط یک بار، با سوپرکاربرِ استقرار

**پیش‌نیاز:** PostgreSQL 16 با بستهٔ PostGIS (در Docker: `postgis/postgis:16-3.4`). نصبِ افزونهٔ PostGIS برای غیرِ سوپرکاربر مجاز نیست؛ پس این مرحله با `postgres` انجام می‌شود.

```bash
# متغیرها از مدیرِ رمز تزریق شوند؛ هیچ‌کدام در مخزن نوشته نمی‌شوند
export ADMIN_DATABASE_URL='postgres://postgres:<رمز>@<میزبان>:5432/<پایگاه‌داده>'
export DATABASE_URL='postgres://dms_migrator:<رمز>@<میزبان>:5432/<پایگاه‌داده>'
export APP_DATABASE_URL='postgres://dms_app:<رمز>@<میزبان>:5432/<پایگاه‌داده>'
export MAINTENANCE_DATABASE_URL='postgres://dms_maintainer:<رمز>@<میزبان>:5432/<پایگاه‌داده>'
export DMS_BOOTSTRAP_CONFIRM=yes
node scripts/db-window.mjs bootstrap
```

`bootstrap` به ترتیب انجام می‌دهد: ساخت نقش‌های LOGIN جدیدِ `dms_migrator`/`dms_app`/`dms_maintainer` با رمزِ URLهای بالا (نقشِ موجود رمزش **تغییر نمی‌کند**؛ چرخشِ رمز جداگانه و آگاهانه است)؛ اجرای `0001..0041` با ابرکاربر (شامل PostGIS و سخت‌سازیِ نقش‌ها)؛ و انتقالِ مالکیتِ اشیای `public` و خودِ طرحوارهٔ `public` به `dms_migrator` (لازم برای `COMMENT ON SCHEMA public` در `0064`). همهٔ گام‌ها در لاگِ JSON ثبت می‌شوند.

> **توجه:** `bootstrap` هنگامِ اجرا روی پایگاهِ داده‌ای که قبلاً اشیای ساخته‌شدهٔ `postgres` دارد، همان‌ها را به `dms_migrator` منتقل می‌کند. فقط روی پایگاهِ مقصدِ تازه یا پس از بک‌آپِ تأییدشده اجرا کنید.

**REVOKE TEMP از PUBLIC (S8-06، در `bootstrap`):** پس از ساختنِ نقش‌ها و مالکیتِ `public`، `db-window.mjs bootstrap` امتیازِ TEMP را از PUBLIC برمی‌دارد تا هیچ نقشِ کم‌دسترسی‌ای جدولِ موقتِ سایه‌زن نسازد. `db-window.mjs verify` (و پس‌بررسیِ `up`) با `databaseProblems` بررسی می‌کند و اگر PUBLIC یا هر نقشِ زمانِ اجرا هنوز TEMP داشته باشد، شکست می‌دهد. اصلاحِ دستی با ابرکاربر: `REVOKE TEMP ON DATABASE <db> FROM PUBLIC;`.

### ۳-پ) پنجرهٔ مهاجرت — تنها مسیرِ دادنِ امتیازِ مالکیت به `dms_migrator`

`dms_migrator` فقط در یک پنجرهٔ کنترل‌شده عضوِ `dms_owner` (با `SET`) می‌شود. چرخهٔ کامل:

1. **مجوز و دلیل:** اپراتورِ مجاز (مالکِ سرویس/سرپرستِ DBA) دلیلِ پنجره را (حداقل ۱۰ نویسه) در `DMS_WINDOW_REASON` می‌نویسد. دلیل در لاگ ثبت می‌شود.
2. **بک‌آپِ تأییدشده:** `node scripts/db-window.mjs backup --out <فایل>.dump` (فقط با `pg_dump` و ابرکاربر؛ فایلِ `.sha256` کنارِ آن ساخته می‌شود).
3. **اجرای `up`:** `DMS_BACKUP_FILE` و `DMS_WINDOW_REASON` (الزامی)، `DMS_BACKUP_SHA256` (توصیه‌شده؛ اگر ست باشد تطبیق داده می‌شود)، `DATABASE_URL` (=`dms_migrator`) و `ADMIN_DATABASE_URL` را ست کنید (S8-07)، سپس:

```bash
node scripts/db-window.mjs up            # کامل تا ۰۰۷۲. `--to` با مقدارِ ۰۰۷۰ یا ۰۰۷۱ رد می‌شود (S8-07: D1 باز می‌ماند)
```

   ترتیب داخلی: preflight (بررسیِ وجود و هشِ بک‌آپ) ⇒ قفلِ مشاوره‌ای (دو اجرای هم‌زمان ممنوع) ⇒ `GRANT dms_owner TO dms_migrator WITH INHERIT FALSE, SET TRUE` ⇒ `migrate.mjs up` با هویتِ مهاجرت ⇒ **REVOKE همیشه** (حتی پس از شکست) ⇒ `verify`. هر شکستِ مهاجرت تراکنشِ همان مرحله را برمی‌گرداند و پنجره بسته می‌شود؛ خروجی `window_closed` با `verified=true` باید دیده شود.
4. **گرانت/ریووک دستی** (فقط برای عیب‌یابیِ کنترل‌شده): `node scripts/db-window.mjs grant` و `… revoke`؛ هر دو ثبت می‌شوند و `revoke` پس از کار **الزامی** است.
4-ب. **بازیابی پس از قطعی (S8-05):** اگر فرایندِ `up` قطع شد (SIGKILL، خرابیِ میزبان) و پنجره باز ماند، فوراً اجرا کنید: `node scripts/db-window.mjs recover`. این فرمان با اتصالِ تازه `REVOKE` می‌کند، عضویت را از نبودنِ آن تأیید می‌کند و راستی‌آزماییِ کامل را اجرا می‌کند. تا وقتی `recover` موفق نشده، **هیچ** `up` دیگری اجرا نشود (preflight آن را رد می‌کند).
4-پ. **مهاجرتِ تغییرکرده رد می‌شود (S8-05):** `migrate.mjs` پیش از اجرا checksumِ هر مهاجرتِ اعمال‌شده را می‌سنجد؛ ناهمخوانی یعنی توقف بدون تغییرِ پایگاه. مهاجرتِ اعمال‌شده را ویرایش نکنید؛ مهاجرتِ جدید بسازید یا تصمیمِ مالک را بگیرید. هم‌زمانی با قفلِ نشستِ `dms-migrate` کنترل می‌شود.
4-ث. **تشخیصِ ناهمخوانیِ checksum (S8-06؛ بدونِ bypass):** `migrate.mjs` هر مهاجرتِ اعمال‌شده را با checksumِ ثبت‌شده مقایسه می‌کند و در ناهمخوانی متوقف می‌شود. روالِ تشخیص:
   1) `node scripts/migrate.mjs status` تا نسخهٔ مشکل‌دار را ببینید.
   2) `sha256sum migrations/<NNNN>_*.up.sql` را با `select version, checksum, applied_at from schema_migrations where version='<NNNN>'` مقایسه کنید. برای ردیف‌های `v2:<هشِ up>:<هشِ down>` هشِ `migrations/<NNNN>_*.down.sql` را هم با بخش دوم مقایسه کنید (S8-07: down فقط برای ردیف‌های v2 سنجیده می‌شود)؛ ردیف‌های قدیمیِ ۶۴-رقمی فقط هشِ up دارند.
   3) نسخهٔ اعمال‌شده را از تاریخچهٔ git پیدا کنید: `git log --oneline -- migrations/<NNNN>_*` و `git show <commit>:migrations/<file> | sha256sum`.
   4) تعیین کنید محیط نسخهٔ قبل یا بعد از ویرایش را اعمال کرده است (`applied_at` در برابر زمانِ ویرایش).
   5) تصمیم: اگر فایل به‌اشتباه تغییر کرده، از git به نسخهٔ اعمال‌شده برگردانید. اگر تغییرِ عمدی است، **ردیفِ checksum را دست نزنید**؛ مهاجرتِ اصلاحیِ جدید بسازید. هر بازنویسیِ checksum یا غیرفعال‌کردنِ بررسی فقط تصمیمِ مالک است و در گزارشِ استقرار ثبت می‌شود.
   6) تا رفعِ ناهمخوانی هیچ `up` اجرا نمی‌شود. `.gitattributes` نیز مهاجرت‌های SQL را LF نگه می‌دارد تا checksum با checkout تغییر نکند.

4-ت. **`reset` (S8-05):** در `NODE_ENV=production` یا بدونِ `DMS_ALLOW_DESTRUCTIVE_RESET=yes` اجرا نمی‌شود. فقط برای پایگاهِ یکبارمصرفِ آزمون.
5. **راستی‌آزمایی:** `node scripts/db-window.mjs verify` (فقط خواندنی؛ کد خروج غیرصفر یعنی مشکل).

**پیش‌نیازِ مهاجرت برای هویتِ مهاجرت:** پایگاه‌داده باید `dms_owner` را داشته باشد (از bootstrap). اگر پنجره باز بماند، `verify` و آزمون‌های real-login شکست می‌خورند.

### ۳-ت) نگه‌داریِ زمان‌بندی‌شدهٔ پارتیشن‌ها (`inventory_txn`، `audit_log`، `location_sample`)

- **هویت:** فقط `dms_maintainer` با `MAINTENANCE_DATABASE_URL` (نه `DATABASE_URL`، نه `APP_DATABASE_URL`).
- **فرمان‌ها:**

```bash
node scripts/db-maintain.mjs check                     # هویت و محدودیت‌ها (فقط خواندنی)
node scripts/db-maintain.mjs partitions --months 2     # ساخت پارتیشن‌های آتی + محافظت (۰..۱۲)
```

  خروجیِ JSON است؛ شکست = کد خروج غیرصفر. زمان‌بندی (مثلاً روزانه از cron یا systemd timer) با متغیرِ تزریق‌شده؛ نتیجه را در لاگِ زمان‌بندی نگه دارید.
  `partitions` هر سه والد را با wrapperِ اختصاصی صدا می‌زند: `fn_maintain_inventory_partitions` (0070)، `fn_maintain_audit_partitions` و `fn_maintain_location_partitions` (0071). `fn_ensure_partitions` برای نگه‌داری **استفاده نمی‌شود** و `dms_maintainer` روی آن EXECUTE ندارد.
- **رفتار:** پارتیشنِ ماه جاری تا `+N` ماه را اگر نبود می‌سازد؛ تکرار بی‌خطر است. پارتیشنِ تازه مالکِ همان والدش است (`inventory_txn`: `dms_owner`؛ `audit_log`/`location_sample`: `dms_migrator`) و `FORCE RLS` و سیاستِ مستأجر را **همان لحظه** دارد. پارتیشن‌های دفتر دو تریگرِ محافظ (`append-only` و `no-truncate`) می‌گیرند. `dms_app` روی همهٔ این پارتیشن‌ها فقط `SELECT/INSERT` دارد (`UPDATE/DELETE/TRUNCATE` برداشته می‌شود). هیچ ردیف یا پارتیشنِ موجودی تغییر یا حذف نمی‌شود.
- **پارتیشنِ جداشده (DETACH):** اگر جدولی با نامِ پارتیشنِ بعدی هنوز وجود داشته باشد، تابع با `42P07` می‌ایستد و آن را **حذف یا بازسازی نمی‌کند**. اپراتور باید بررسی کند و در صورتِ تأیید `ATTACH PARTITION` را با همان بازه دستی اجرا کند.
- **محدوده:** `inventory_txn` (با مالکِ `dms_owner`) و `audit_log`/`location_sample` (با مالکِ فعلیِ جدول `dms_migrator`، بدونِ انتقال). مالکیتِ هر پارتیشن با مالکِ والدش یکی است و `check` این را راستی‌آزمایی می‌کند.

### ۳-ث) `audit_log` و `location_sample` — مدلِ پیاده‌شده (S8-05، مدلِ C) و تصمیمِ مالک

- **امتیازهای فعلی:** `dms_app` روی این دو جدول و پارتیشن‌هایشان **فقط `SELECT/INSERT`** دارد؛ `UPDATE/DELETE/TRUNCATE` ندارد (**UNVERIFIED**: آزمونِ LOGIN واقعیِ `dms_app` روی wrapperهای 0071/0072 هنوز روی PG16 اجرا نشده است؛ بخش ۱۰-ث در docs/db-privilege-architecture.md). `dms_readonly` فقط `SELECT`.
- **نگه‌داری:** فقط با `dms_maintainer` و wrapperِ `fn_maintain_audit_partitions(int)` / `fn_maintain_location_partitions(int)` (ورودی ۰..۱۲). مالکِ wrapper همان مالکِ جدول (`dms_migrator`) است و **هیچ مالکیتی منتقل نشده است**. پارتیشنِ تازه `FORCE RLS` و سیاستِ والد را فوراً دارد.
- **مرزِ اعتماد:** مالکِ این جداول (`dms_migrator`) و ابرکاربر هنوز می‌توانند آن‌ها را تغییر دهند و مالک می‌تواند خودش را GRANT کند. «append-only» در برابرِ هویتِ برنامه است، نه در برابرِ مالک یا ابرکاربر.
- **تصمیمِ مالک لازم است:** آیا به‌جای مدلِ C، انتقالِ مالکیت به `dms_owner` (NOLOGIN، مدلِ A) تأیید می‌شود؟ تا آن زمان مدلِ C فعال است. هیچ‌کدام از دو مسیر در S8-05 روی PostgreSQL 16 واقعی **آزموده نشده‌اند** (زیرساخت PostGIS در دسترس نبود؛ بخش ۱۰-ث).
- **دستورِ عملیاتیِ قدیمی حذف شد:** پیامِ `audit.service.ts` (`select fn_ensure_partitions(2)` با هویتِ مالک) دیگر توصیه نمی‌شود؛ جایگزین: `node scripts/db-maintain.mjs partitions --months 2` با `dms_maintainer`، و در بازیابیِ اضطراری فقط ابرکاربرِ استقرار.

### ۳-ج) بازگشتِ اضطراری (break-glass) — مجوز، اجراکننده، بک‌آپ، بازگردانیِ مالکیت، بررسیِ یکپارچگی

| گام | مسئول | شرط/ابزار |
|---|---|---|
| مجوز | سرپرستِ DBA یا مالکِ سرویس | دلیلِ مکتوب؛ `DMS_WINDOW_REASON` |
| اجراکننده | اپراتورِ دارای ابرکاربر (هرگز API) | `ADMIN_DATABASE_URL` فقط برای همین فرمان |
| بک‌آپ و preflight | اجراکننده | `backup --out` و `DMS_BACKUP_FILE`/`DMS_BACKUP_SHA256`؛ بدونِ بک‌آپِ تأییدشده `rollback` اجرا نمی‌شود |
| برگشت | اجراکننده | `node scripts/db-window.mjs rollback [n]` (فقط سوپرکاربر؛ `0072.down` **همیشه رد می‌شود** (S8-07)، و `0070.down` برای غیرِسوپرکاربر **fail-closed** است و با `42501` رد می‌شود) |
| بازگردانیِ مالکیت | خودِ `0070.down` و `0071.down` | `0070.down`: مالکِ پارتیشن‌های `inventory_txn` به مالکِ `schema_migrations` برمی‌گردد و wrapper حذف می‌شود؛ گرانت‌های `audit_log`/`location_sample` به وضعیتِ 0041 برمی‌گردد. `0071.down`: wrapperهای audit/location حذف می‌شوند؛ مالکیتِ جدول تغییر نمی‌کند؛ پارتیشن‌ها حذف نمی‌شوند |
| یکپارچگی | اجراکننده | `verify` (شامل بررسیِ دفتر)؛ مقایسهٔ `pg_dump --schema-only` پیش و پس از چرخه (در CI: صفر خط تفاوت). پس از شکستِ `up` یا قطعی: `node scripts/db-window.mjs recover` |

- **چرخهٔ up/down/up (گزارشِ تاریخی؛ UNVERIFIED در این نسخه):** در تسک -04 روی PostgreSQL 16.2+PostGIS گزارش شد که پس از `rollback 1` و `up` مجدد، `pg_dump` یکسان بود. آن محیط و شواهدش در این workspace موجود نیستند؛ برای 0071/0072 و مهاجرت‌های بعدی بازآزمایی لازم است.
- **بازگشتِ 0072 رد می‌شود (S8-07):** `down` مهاجرت 0072 بدنهٔ `fn_maintain_inventory_partitions` را با search_path بدون `pg_temp` بازمی‌گرداند (سطح D1). `migrate.mjs down` پیش از هر SQL با «ROLLBACK_REFUSED» متوقف می‌شود. بازیابی فقط از پشتیبانِ پیش از `up`.
- **نکتهٔ مرزی:** `0070.down` همچنان **هرگز** به `dms_owner`/`dms_migrator` اجازهٔ حذفِ دفتر را نمی‌دهد؛ اما خودِ `rollback` با ابرکاربر یعنی دفترِ موجودی در اختیارِ ابرکاربر است. این را در ثبتِ حادثه قید کنید.

## ۴) راه‌اندازی

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.production up -d --build
```

فایلِ `docker-compose.prod.yml` **الزامی** است: fail-closed بودنِ اعتبارسنجی را روشن
و restart policy تولید می‌گذارد. این فایل همچنین برای سرویسِ api `AUTO_MIGRATE=false` و `DATABASE_URL` خالی می‌گذارد (S8-06): هویتِ مهاجرت/ابرکاربر هرگز به پروسهٔ API نمی‌رسد. پشتهٔ محلی (`docker-compose.yml` تنها) با اذعانِ
`DMS_ACCEPT_INSECURE_LOCAL_SETUP=true` بالا می‌آید — هرگز برایِ production.

## ۵) مهاجرت‌ها (ایمن و کنترل‌شده)

- **production:** `AUTO_MIGRATE=false` الزامی است (بخش ۲ و ۳-الف). API هرگز مهاجرت نمی‌کند.
- **مسیرِ مهاجرتِ عادی:** فقط از طریقِ پنجرهٔ مهاجرت (بخش ۳-پ): `node scripts/db-window.mjs up`. این فرمان خودش بک‌آپِ تأییدشده را می‌خواهد، دسترسیِ موقت می‌دهد، مهاجرت را با `dms_migrator` اجرا می‌کند، دسترسی را **همیشه** برمی‌دارد و راستی‌آزمایی می‌کند.
- **وضعیت (هر هویتی که بتواند بخواند):** `node scripts/migrate.mjs status`.
- **بازگشتِ یک گام:** فقط break-glass (بخش ۳-ج)؛ با `node scripts/db-window.mjs rollback 1` و بک‌آپِ تأییدشده.
- **`scripts/migrate.mjs up` مستقیم** با `dms_migrator` بدونِ پنجره برای production توصیه نمی‌شود. مهاجرت 0070 درونِ خودش `SET LOCAL ROLE dms_owner` می‌کند و `ALTER … OWNER` نیاز به عضویتِ SET دارد؛ بدونِ پنجره شکست می‌خورد (fail-closed). بنابراین مهاجرت‌های 0070 به بعد **فقط** از مسیرِ `db-window.mjs up` اجرا شوند. (S8-07) `migrate.mjs up` اکنون بدونِ قفلِ خارجیِ `dms-db-window` هر مجموعه‌ای را که شامل مهاجرتِ مالکانه باشد (0041، 0070، 0071، 0072) پیش از هر SQL رد می‌کند؛ و `DMS_MIGRATE_CALLER=api-auto` (مسیرِ API) برای این مجموعه همیشه رد است. حتی یک مهاجرتِ مالکانهٔ در انتظار کلِ مجموعه را متوقف می‌کند.

## ۶) پورت‌ها و مرزِ شبکه

| سرویس | داخلِ شبکهٔ compose | رویِ میزبان | عمومی؟ |
|---|---|---|---|
| web | `web:3000` | `127.0.0.1:3000` | فقط از طریقِ reverse-proxy روی 443 |
| api | `api:4000` | `127.0.0.1:4000` | **هرگز مستقیم** — فقط پروکسیِ هم‌مبدأِ وب یا reverse-proxy داخلی |
| postgres | `postgres:5432` | `127.0.0.1:5432` (عملیاتی) | **هرگز** |
| redis | `redis:6379` | `127.0.0.1:6379` (عملیاتی) | **هرگز** |
| minio | `minio:9000` | `127.0.0.1:9000` (عملیاتی) | **هرگز** |

همهٔ bindingها در `docker-compose.yml` روی `127.0.0.1` هستند؛ یعنی PostgreSQL، Redis،
MinIO و API از شبکهٔ بیرون قابلِ دسترسی نیستند. **مرزِ عمومی فقط reverse-proxy روی
443 (TLS) است** که به وب (`127.0.0.1:3000`) می‌رسد؛ وب درخواست‌های `/api/*` را از
سرور به `http://api:4000` پروکسی می‌کند (نیازی به CORS نیست و مرورگر هرگز API را
مستقیم نمی‌بیند). ⚠️ مقصدِ این پروکسی (`API_PROXY_TARGET`) در زمانِ **build** در
`.next/routes-manifest.json` پخته می‌شود (build-arg ایمیجِ وب)؛ برایِ تغییرِ آن
ایمیجِ وب را دوباره بسازید (`docker compose build web`). اگر API را روی دامنهٔ جدا
می‌خواهید، فقط reverse-proxy خودتان `/api` را به `127.0.0.1:4000` ببرد و
`ALLOWED_ORIGINS` را مطابق آن ست کنید.

هیچ فایروال/سرویسِ مشترکِ میزبان را در این راهنما تغییر نمی‌دهیم؛ محدودسازیِ اضافی
(غیرفعال‌کردنِ کاملِ انتشارِ پورتِ 5432/6379 حتی روی loopback) در صورتِ نیازِ
عملیاتی بر عهدهٔ مسئولِ زیرساخت است.

## ۷) endpointهای سلامت (دقیقاً همان‌هایی که ثبت شده‌اند)

| مسیر | معنا | رفتار |
|---|---|---|
| `GET /api/health` | خلاصهٔ سازگار (پروبِ قدیمیِ CI/Compose) | همیشه 200؛ `status: ok\|degraded` + `database: up\|down` |
| `GET /api/v1/health/live` | **liveness** — فقط زنده بودنِ فرآیند | 200؛ قطعیِ موقتِ PostgreSQL باعثِ fail نمی‌شود (بازآغازِ بی‌دلیل ممنوع) |
| `GET /api/v1/health/ready` | **readiness** — آمادگیِ سرویس‌دهی | 200 با `status: ready` وقتی DB بالاست؛ **503** با `status: unready` وقتی پایین است. `redis` فقط گزارش می‌شود (سرویس بدونِ Redis با کاهشِ کارایی بالا می‌آید) |

این‌ها probeهای زیرساخت‌اند و **عمداً** در قراردادِ OpenAPI نیستند (همان رویهٔ
`/api/health` در `scripts/contract-drift.mjs`). healthcheck سرویسِ api در compose از
`/api/v1/health/ready` استفاده می‌کند.

## ۸) تشخیصِ «خطایِ برنامه» از «خطایِ وابستگیِ زیرساخت»

| نشانه | معنا | اقدام |
|---|---|---|
| کانتینرِ api مدام restart + لاگِ «راه‌اندازی API متوقف شد» | خطا در راه‌اندازیِ برنامه (پیکربندی/هویتِ DB/مهاجرت) | پیامِ فارسیِ لاگ را بخوانید؛ مقصر پیکربندی است نه زیرساخت |
| `ready` ⇒ 503 و `database: down`، `live` ⇒ 200 | **وابستگی** (PostgreSQL) در دسترس نیست | وضعیتِ postgres/`pg_isready` را بررسی کنید؛ برنامه سالم است |
| `ready` ⇒ 200 ولی `redis: down` | کش/صف غیرفعال (کاهشِ کارایی) | Redis را بازیابی کنید؛ قطعیِ کاملِ سرویس نیست |
| خطایِ «هویتِ پایگاه‌دادهٔ زمانِ اجرا امن نیست» | fail-closedِ امنیتی | `APP_DATABASE_URL`/نقش‌ها را اصلاح کنید — این یک ویژگی است نه باگ |
| `AUTO_MIGRATE=false` و خطاهای 500 پس از استقرار | مهاجرت‌ها اعمال نشده‌اند (API هنگامِ بوت وضعیتِ مهاجرت را نمی‌بیند و مهاجرت نمی‌کند) | `node scripts/migrate.mjs status` را از میزبانِ اپراتور ببینید، سپس `node scripts/db-window.mjs up` (بخش ۳-پ) |

## ۹) بک‌آپ و بازیابی — مسئولیت‌ها (صادقانه)

- مسئولیتِ بک‌آپِ `pg_data` (و `minio_data` برایِ اسناد POD) با تیمِ زیرساخت است؛
  این مخزن ابزارِ بک‌آپ نمی‌سازد.
- **تا یک بازیابیِ واقعی (restore) رویِ محیطِ آزمایشی آزموده نشود، «بک‌آپِ فعال»
  ادعا نمی‌شود.** حداقلِ آزمون: بازیابیِ اسنپ‌شات رویِ دیتابیسِ خالی →
  `node scripts/migrate.mjs status` (نباید مهاجرتِ pendingِ غیرمنتظره ببیند) →
  smoke سلامت → ثبتِ نتیجه در runbook.
- ترتیبِ بازیابی: volume/سنپ‌شات → (در صورتِ نیاز) `node scripts/db-window.mjs up` تا HEAD (با بک‌آپ و دلیلِ پنجره؛ S8-07) → بوتِ api.

## ۱۰) به‌روزرسانی و مرزِ بازگشت

**ارتقا:**

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.production up -d --build        # تصویرِ جدید
# مهاجرت‌ها: فقط در پنجرهٔ مهاجرت، از میزبانِ اپراتور (نه داخلِ کانتینرِ api؛ بخش ۳-پ)
# بک‌آپِ تأییدشده ⇒ DMS_BACKUP_FILE/DMS_BACKUP_SHA256 ⇒ up ⇒ verify
node scripts/db-window.mjs backup --out backups/pre-upgrade.dump
# (S8-07) متغیرهای up؛ مقادیر را از مدیرِ رمز تزریق کنید، هرگز در مخزن یا شل‌تاریخچه نگذارید:
#   DMS_BACKUP_FILE=backups/pre-upgrade.dump  DMS_BACKUP_SHA256=<هشِ فایل>  DMS_WINDOW_REASON='<≥10 نویسه>'
node scripts/db-window.mjs up
node scripts/db-window.mjs verify
```

**مرزِ بازگشت (rollback):**

1. بازگشتِ تصویر: checkoutِ نسخهٔ قبلی + `up -d --build` (بدونِ اجرایِ مهاجرتِ جدید).
2. **مهاجرت‌ها یک‌طرفه نیستند مگر down صریح:** همهٔ ۷۲ مهاجرتِ مخزن (0001–0072) فایلِ down دارند؛ down مهاجرت‌های 0070–0071 فقط برای سوپرکاربرند؛ **down مهاجرت 0072 رد می‌شود** (S8-07) و بازگشت از آن فقط با بازیابیِ پشتیبانِ پیش از up ممکن است. در هر حال
   `down` داده‌های ساخته‌شده توسطِ up را برنمی‌گرداند؛ بازگشتِ داده فقط با بک‌آپ.
3. اگر مهاجرتِ جدیدی اعمال شده و تصویرِ قبلی با اسکیمای جدید ناسازگار است، تنها
   مسیرِ امن = بازیابیِ بک‌آپ (بخشِ ۹). پس در production ابتدا `AUTO_MIGRATE=false`،
   سپس migrate به‌صورتِ کنترل‌شده.

## ۱۱) آبجکت‌استوریج (POD) و وضعیتِ CI

- سرویسِ `minio` در compose برایِ حجمِ محلی است؛ در production بهتر است از S3ِ
  سازگارِ سازمانی استفاده و فقط `MINIO_*` را ست کنید.
- در CI عمومی، `minio/minio` (Docker Hub) و `quay.io/minio/minio` قابلِ pull نیستند؛
  jobِ `Integration (MinIO)` با نامزدهایِ S3-سازگارِ پین‌شده (مثل `adobe/s3mock:3.9.1`)
  round-trip واقعیِ کلاینتِ برنامه را می‌سنجد و digest را ثبت می‌کند. جریانِ e2e
  (Playwright) تا رفعِ این محدودیت صریحاً **BLOCKED** گزارش می‌شود — نه skip.

## ۱۲) لاگ‌ها و اسرار

- هیچ رمزی در لاگ/تشخیص‌ها چاپ نمی‌شود (اسکنِ دقیقِ مقداری در CI دروازهٔ release
  همین را می‌سنجد). اگر رمزی در لاگ دیدید، آن را لو‌رفته فرض و عوض کنید.
- `LOG_LEVEL` سطحِ لاگ را کنترل می‌کند. تشخیص‌های خطا فقط «نامِ متغیر» را می‌گویند،
  نه مقدارش را.

## ۱۳) مانیتورینگِ پیشنهادی

- liveness: `GET /api/v1/health/live` (هر ۱۰–۳۰ثانیه) — فقط برایِ بازآغازِ گیرکرده.
- readiness: `GET /api/v1/health/ready` (برایِ خارج‌کردن از بار/هشدار).
- هشدار روی: restart-loop کانتینرِ api، 503ِ پیوستهٔ ready، و خطایِ «هویتِ زمانِ اجرا».
