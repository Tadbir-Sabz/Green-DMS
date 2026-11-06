# فهرست بررسی استقرار (Production deploy checklist)

این چک‌لیست وظایف **زمان استقرار** است (نه وضعیت کد مخزن)؛ بنابراین جعبه‌ها در
هر بار استقرار توسط مسئول استقرار تیک می‌خورند. برای هر مورد، «چگونه/کجا» ذکر شده است.

- [ ] **فایل `.env.production` تکمیل شده**
      از روی `.env.production.example` کپی و همهٔ مقادیر واقعی پر شود
      (به‌ویژه `JWT_SECRET`، `DATABASE_URL`، `APP_DATABASE_URL`، `PSP_WEBHOOK_SECRET`).
      تولید رمز تصادفی: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
      API با مقادیرِ جای‌نگه‌دار (`CHANGE_ME_*`/`REPLACE_WITH_*`) یا رمزهای پیش‌فرضِ
      توسعه **بالا نمی‌آید** (fail-closed) — این رفتارِ خواسته است، نه باگ.
- [ ] **`DMS_ACCEPT_INSECURE_LOCAL_SETUP` و `SMS_ALLOW_LOG_PROVIDER` ست نشده‌اند**
      (یا صریحاً `false`‌اند). این دو فقط برایِ پشتهٔ throwaway محلی/CI هستند.
- [ ] **دامنه و SSL پیکربندی شده**
      `ALLOWED_ORIGINS` و `NEXT_PUBLIC_API_URL` با دامنهٔ نهایی هم‌خوان باشند
      (هر ورودیِ `ALLOWED_ORIGINS` باید origin کامل باشد: `https://app.example.com`).
      توجه: `NEXT_PUBLIC_API_URL` در زمان **build** وب در باندل درج می‌شود
      (در `docker-compose.yml` به‌صورت build-arg آمده).
- [ ] **PostgreSQL + PostGIS راه‌اندازی شده**
      سرویس `postgres` در `docker-compose.yml` از ایمیج `postgis/postgis:16-3.4`
      استفاده می‌کند. برای پایگاه‌دادهٔ مدیریت‌شده، `DATABASE_URL` را تغییر دهید.
      نقش‌ها طبق `docs/db-privilege-architecture.md` (جدا از هم: مهاجرت vs زمانِ اجرا).
- [ ] **Redis راه‌اندازی شده**
      سرویس `redis` در `docker-compose.yml`؛ `REDIS_HOST`/`REDIS_PORT` را تنظیم کنید.
- [ ] **پشته با override تولید بالا آمده**
      `docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env.production up -d`
      (بدونِ `docker-compose.prod.yml` اعتبارسنجیِ امنیتیِ production غیرفعال می‌شود).
- [ ] **مایگریشن‌ها اجرا شده**
      داخلِ کانتینرِ api: `docker compose exec api node scripts/migrate.mjs up`
      (روی checkout: `npm run db:migrate`). وضعیت: `docker compose exec api node scripts/migrate.mjs status`.
- [ ] **Health check ها سبز هستند**
      - `GET /api/v1/health/live` ⇒ 200 (liveness؛ قطعیِ DB آن را fail نمی‌کند)
      - `GET /api/v1/health/ready` ⇒ 200 با `status: ready` (readiness؛ DB پایین ⇒ 503)
      - `GET /api/health` ⇒ 200 با `status: ok` (خلاصهٔ سازگار)
- [ ] **مرزِ شبکه برقرار است**
      فقط پورت‌های لازم (معمولاً ۴۴۳ وب) از بیرون باز باشند؛
      `postgres`/`redis`/`minio` حتی روی میزبان هم فقط `127.0.0.1`‌اند و نباید از
      بیرون قابلِ دسترسی شوند. مرزِ TLS بر عهدهٔ reverse-proxy است.
- [ ] **بک‌آپ تعریف و «آزمایشِ restore» شده**
      پشتیبان‌گیری منظم از volume `pg_data` (و `minio_data` برای اسناد POD).
      ⚠️ تا یک **restore واقعی** روی محیط آزمایشی موفق نشود، بک‌آپ را «عملیاتی»
      گزارش نکنید (جزئیات: `docs/deploy/PRODUCTION_DEPLOYMENT.md` بخش ۹).
- [ ] **مانیتورینگ فعال**
      لاگ‌ها با `LOG_LEVEL` کنترل می‌شوند؛ liveness/readiness را به مانیتور وصل کنید.
      هشدار رویِ restart-loop کانتینرِ api و 503ِ پیوستهٔ ready.
- [ ] **تفکیکِ خطایِ برنامه/زیرساخت تمرین شده**
      جدولِ بخشِ ۸ راهنمای استقرار (نشانه‌ها: `database: down` در ready=503 یعنی
      زیرساخت؛ «راه‌اندازی API متوقف شد» یعنی پیکربندی/برنامه).

---

**CI:** گردش کار `.github/workflows/ci.yml` (typecheck، openapi:check، contract-drift،
unit، Integration Postgres/MinIO، init-hygiene)، `migrations.yml` (چرخهٔ up→down→up)،
`release-image.yml` (build ایمیج نهایی + بوتِ ایزوله + هویتِ زمانِ اجرا + health +
پروکسی + اسکنِ رمز در لاگ + تستِ منفیِ fail-closed) و `e2e` (Playwright؛ تا رفعِ
مسدودیِ رجیستریِ MinIO صریحاً BLOCKED) روی هر PR به `main` اجرا می‌شوند. پیش از
استقرار، سبز بودنِ CI (و درکِ وضعیتِ BLOCKEDها) را تأیید کنید.
