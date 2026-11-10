# راهنمای استقرار پروداکشن Green-DMS

> **وضعیتِ این سند:** با HEAD جاری راستی‌آزمایی شده (TASK-19)؛ دستورها، پورت‌ها و
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
| `APP_DATABASE_URL` | نقشِ زمانِ اجرا (`dms_app`) | نبود یا یکی‌بودن با نقشِ مهاجرت ⇒ رد |
| `DATABASE_URL` | نقشِ مهاجرت/مدیریت | فقط برایِ migrate؛ رمزِ جای‌نگه‌دار ⇒ رد |
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

### ۳-الف) بازیابی پارتیشن ماهانهٔ ممیزی (TASK-PM-01D-M4-G / F-R-02)

اگر عملیات نگهداشت گروهی با خطای `audit_partition_missing` روبرو شد، **برنامه
هرگز پارتیشن نمیسازد**؛ اقدام زیر فقط توسط اپراتور و خارج از API انجام میشود:

1. با همان هویتِ مجازِ `DATABASE_URL` که مهاجرتها را اعمال کرده و **مالکِ
   `public.audit_log`، `location_sample` و `inventory_txn`** است وصل شوید. بررسی
   مالکیت (دستور دقیق، قابل کپی/پیست و اجراشده روی DB ایزوله):
   `select relowner::regrole from pg_class where oid = 'public.audit_log'::regclass;`
   پیشنیازهای همان اتصال: مالکیت والدها + `USAGE`/`CREATE` روی `public` +
   `EXECUTE` روی `fn_ensure_partitions(integer)`. `dms_app`، `dms_readonly`،
   `dms_migrator` و `dms_owner` مادامیکه مالک نشدهاند مجاز نیستند؛ `0064`
   اجرای `fn_ensure_partitions` را از آنها گرفته است.
2. `select fn_ensure_partitions(2);` — بایدار و قابل تکرار؛ فقط پارتیشنهای موجودنبوده
   ساخته میشوند، ردیفهای تاریخی ممیزی و RLS اجباری دستنخورده میمانند.
3. ساختهشدن پارتیشن، `FORCE ROW LEVEL SECURITY`، سیاست والد و گرانت `dms_app` را
   بررسی و اقدام را در لاگ استقرار ثبت کنید؛ سپس عملیات تازهای آغاز کنید.

هیچ `SECURITY DEFINER` تازهای، هیچ grant گسترده و هیچ تغییر نقش/رمز production
برای این ترمیم لازم نیست. جزئیات مالکیت و اثبات نقشها:
`docs/db-privilege-architecture.md` §۲-الف و
`docs/product-inventory/TASK-PM-01D-M4-G_IMPLEMENTATION.md`.

## ۴) راه‌اندازی

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.production up -d --build
```

فایلِ `docker-compose.prod.yml` **الزامی** است: fail-closed بودنِ اعتبارسنجی را روشن
و restart policy تولید می‌گذارد. پشتهٔ محلی (`docker-compose.yml` تنها) با اذعانِ
`DMS_ACCEPT_INSECURE_LOCAL_SETUP=true` بالا می‌آید — هرگز برایِ production.

## ۵) مهاجرت‌ها (ایمن و کنترل‌شده)

پیشنهادِ production: `AUTO_MIGRATE=false` (در `.env.production`) و اجرایِ صریح:

```bash
# داخلِ کانتینرِ نهاییِ api (scripts/migrate.mjs و migrations/ در ایمیج هستند):
docker compose exec api node scripts/migrate.mjs up
# وضعیت:
docker compose exec api node scripts/migrate.mjs status
# بازگشتِ یک گام (فقط وقتی ضروری و ایمن است):
docker compose exec api node scripts/migrate.mjs down 1
```

`AUTO_MIGRATE=true` هم معتبر است (مهاجرت‌ها هنگامِ بوت و زیرِ قفلِ advisory اعمال
می‌شوند)؛ در این حالت هم `scripts/migrate.mjs` داخلِ همان ایمیج اجرا می‌شود.

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
| `AUTO_MIGRATE=false` و هشدارِ «مهاجرت در انتظار» | مهاجرت‌ها اعمال نشده‌اند | `node scripts/migrate.mjs up` را اجرا کنید |

## ۹) بک‌آپ و بازیابی — مسئولیت‌ها (صادقانه)

- مسئولیتِ بک‌آپِ `pg_data` (و `minio_data` برایِ اسناد POD) با تیمِ زیرساخت است؛
  این مخزن ابزارِ بک‌آپ نمی‌سازد.
- **تا یک بازیابیِ واقعی (restore) رویِ محیطِ آزمایشی آزموده نشود، «بک‌آپِ فعال»
  ادعا نمی‌شود.** حداقلِ آزمون: بازیابیِ اسنپ‌شات رویِ دیتابیسِ خالی →
  `node scripts/migrate.mjs status` (نباید مهاجرتِ pendingِ غیرمنتظره ببیند) →
  smoke سلامت → ثبتِ نتیجه در runbook.
- ترتیبِ بازیابی: volume/سنپ‌شات → (در صورتِ نیاز) `migrate up` تا HEAD → بوتِ api.

## ۱۰) به‌روزرسانی و مرزِ بازگشت

**ارتقا:**

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env.production up -d --build        # تصویرِ جدید
docker compose exec api node scripts/migrate.mjs up   # مهاجرت‌ها (اگر AUTO_MIGRATE=false)
```

**مرزِ بازگشت (rollback):**

1. بازگشتِ تصویر: checkoutِ نسخهٔ قبلی + `up -d --build` (بدونِ اجرایِ مهاجرتِ جدید).
2. **مهاجرت‌ها یک‌طرفه نیستند مگر down صریح:** همهٔ ۴۵ مهاجرت فایلِ down دارند، اما
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
