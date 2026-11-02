# فهرست بررسی استقرار (Production deploy checklist)

این چک‌لیست وظایف **زمان استقرار** است (نه وضعیت کد مخزن)؛ بنابراین جعبه‌ها در
هر بار استقرار توسط مسئول استقرار تیک می‌خورند. برای هر مورد، «چگونه/کجا» ذکر شده است.

- [ ] **فایل `.env.production` تکمیل شده**
      از روی `.env.production.example` کپی و همهٔ مقادیر واقعی پر شود
      (به‌ویژه `JWT_SECRET`، `DATABASE_URL`، `PSP_WEBHOOK_SECRET`).
      تولید رمز تصادفی: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
- [ ] **دامنه و SSL پیکربندی شده**
      `ALLOWED_ORIGINS` و `NEXT_PUBLIC_API_URL` با دامنهٔ نهایی هم‌خوان باشند.
      توجه: `NEXT_PUBLIC_API_URL` در زمان **build** وب در باندل درج می‌شود
      (در `docker-compose.yml` به‌صورت build-arg آمده).
- [ ] **PostgreSQL + PostGIS راه‌اندازی شده**
      سرویس `postgres` در `docker-compose.yml` از ایمیج `postgis/postgis:16-3.4`
      استفاده می‌کند. برای پایگاه‌دادهٔ مدیریت‌شده، `DATABASE_URL` را تغییر دهید.
- [ ] **Redis راه‌اندازی شده**
      سرویس `redis` در `docker-compose.yml`؛ `REDIS_HOST`/`REDIS_PORT` را تنظیم کنید.
- [ ] **مایگریشن‌ها اجرا شده**
      `npm run db:migrate` (یا `AUTO_MIGRATE=true` در بوت API).
      بررسی وضعیت: `npm run db:status`. دادهٔ نمونه: `npm run db:seed-demo`.
- [ ] **Health check ها سبز هستند**
      `GET /api/v1/health/live` و `GET /api/v1/health/ready` باید ۲۰۰ برگردانند.
- [ ] **بک‌آپ تنظیم شده**
      پشتیبان‌گیری منظم از volume `pg_data` (و `minio_data` برای اسناد POD).
- [ ] **مانیتورینگ فعال**
      لاگ‌ها با `LOG_LEVEL` کنترل می‌شوند؛ health check ها را به مانیتور متصل کنید.
- [ ] **تنظیمات فایروال اعمال شده**
      فقط پورت‌های لازم (معمولاً ۴۴۳ وب و در صورت نیاز ۴۰۰۰ API) بیرون باز شوند؛
      `postgres`/`redis`/`minio` داخلی بمانند.

---

**CI:** گردش کار `.github/workflows/ci.yml` روی هر PR به `main` اجرا می‌شود و شامل
typecheck، `openapi:check`، contract-drift، تست‌های وب و API (با سرویس‌های
PostGIS/Redis) و build است. پیش از استقرار، سبز بودن CI را تأیید کنید.
