# گزارشِ تکمیلیِ TASK-19 — آمادگیِ release: بسته‌بندیِ ایمیجِ تولید، اعتبارسنجیِ امن، دروازهٔ استقرارِ ایزوله

> نقش: Agent-1 (معمار/DevOps/امنیت برنامه) · شاخهٔ کاری: `arena/5e50ece3-green-dms` · PR #6 (باز، **ادغام‌نشده**)
> روش: اثبات‌محور؛ هر ادعا با شاهدِ اجرایی (کدِ خروجی، annotationِ CI، بازرسیِ ایمیج). مواردِ بدونِ شاهد UNVERIFIED.

## ۱) وضعیتِ اولیه و baseline دقیق

| مورد | مقدار |
|---|---|
| `main` (انتظاری) | `3daca7c66e9224561f70d4cefbcaf0b8fdc05d32` |
| `main` (اندازه‌گیری‌شده) | `3daca7c…` — **تطبیقِ دقیق**؛ درختِ کاری تمیز |
| پایهٔ ادغام | PR #5 (`71b7146`) ادغام شده در `3daca7c` |
| Node / npm | v22.22.3 / 10.9.8 |
| مهاجرت‌ها | **۴۵ جفت** (۹۰ فایل SQL؛ ۴۵ up + ۴۵ down)؛ جدیدترین: `0045_pretenant_otp_and_flags` |
| مسیرِ سلامتِ API | `GET /api/health` (exclude از prefix) + `GET /api/v1/health{,/live,/ready}` (کنترلرِ دوم) |
| مسیرِ راه‌اندازیِ وب | `GET /login` |
| محیطِ sandbox | Debian 12، ۲ هسته/۴GB؛ **بدونِ هیچ container-runtime**؛ probe: `registry-1.docker.io`/`auth.docker.io`/`download.docker.com`/`deb.debian.org` ⇒ HTTP 000؛ فقط `api.github.com`/npm/pypi باز |

## ۲) Blockerهای تأییدشده و ریشهٔ هرکدام

| # | Blocker (پیش از TASK-19) | ریشهٔ اثبات‌شده | شاهد |
|---|---|---|---|
| B1 | **API در کانتینر هرگز بالا نمی‌آمد** | stage نهاییِ Dockerfile فقط dist+package.json+node_modules را کپی می‌کرد؛ `findMigrateScript()` (auto-migrate) در هر دو حالتِ `AUTO_MIGRATE` به `scripts/migrate.mjs` نیاز دارد و `migrate.mjs` مهاجرت‌ها را از `ROOT/migrations` می‌خواند ⇒ `prepareDatabase()` می‌اندازد و بوت متوقف می‌شود | خطایِ مستقیمِ `prepareDatabase` در کد؛ پس از رفع: بوتِ واقعی در CI (annotation `release-image-health`) |
| B2 | symlink های `@dms/contracts`/`@dms/api-client` در `node_modules` می‌شکستند | پکیج‌های workspace با symlink به `packages/*`؛ مقصد کپی نمی‌شد | بازرسیِ `ls -la node_modules/@dms` + require test |
| B3 | **ایمیجِ وب می‌شکست** | `next start` از `/app` اجرا می‌شد (`.next` در `apps/web` است)؛ `next.config.mjs` (پروکسیِ هم‌مبدأ) و `apps/web/node_modules` (@hookform/resolvers تودرتو) کپی نمی‌شدند | مسیرِ CMD؛ پس از رفع: `web-login=OK` در CI |
| B4 | CORS بازتابِ همه با credentials؛ `ALLOWED_ORIGINS` در HTTP نادیده گرفته می‌شد | `app.enableCors({ origin: true, credentials: true })` در main.ts؛ ALLOWED_ORIGINS فقط در tracking.gateway (socket.io) | `git grep` + تستِ رگرسیون |
| B5 | پیکربندیِ ناامنِ production پذیرفته می‌شد | `JWT_SECRET=CHANGE_ME_IN_PRODUCTION` (پیش‌فرضِ compose)، رمزهای `dms`/`dms_app_local`، `SMS_PROVIDER=log` — هیچ اعتبارسنجی‌ای نبود | `auth.config` فقط «نبودِ» JWT_SECRET را چک می‌کرد |
| B6 | `/api/v1/health/{live,ready}` **stub بودند** | readiness حتی با DB پایین «ready» برمی‌گرداند (هیچ وابستگی‌ای چک نمی‌شد) | کدِ قدیمیِ `common/health/health.controller.ts` |
| B7 | تستِ ضمیمه در CI **همیشه skip می‌شد** | شرطِ `steps.minio.outputs.healthy == 'true'` ولی خروجیِ `healthy` هرگز ست نمی‌شد | `grep healthy ci.yml` (فقط شرط، بدونِ تولید) |
| B8 | (در نخستین بوتِ واقعی آشکار شد) پروکسیِ هم‌مبدأ در کانتینر کار نمی‌کرد | **Next.js rewriteها در زمانِ build در `routes-manifest.json` پخته می‌شوند**؛ `API_PROXY_TARGET` runtime نادیده گرفته می‌شد و مقصدِ پخته‌شده `127.0.0.1:4000` بود | بازتولیدِ محلی: با env=47999 باز هم به 4000 رفت؛ `routes-manifest` مقصدِ پخته را نشان داد؛ وب‌لاگِ CI: `Failed to proxy http://127.0.0.1:4000 … ECONNREFUSED` |
| B9 | (در probeهای storage آشکار شد) همهٔ probeهای s3mock شکست می‌خوردند | پورتِ 8090ِ s3mock **کانکتورِ TLS** است؛ HTTP روی **9090** است (README همان تگِ پین‌شده) — «race آماده‌سازی» تشخیصِ اشتباه بود | README تگ `3.9.1` از api.github.com؛ خطای `node:_http_client` با HTTP روی TLS |
| B10 | (با نخستین اجرایِ واقعیِ تستِ ضمیمه) ۲/۹ تست شکست | (۱) fixture مالکِ تصادفی می‌داد در حالی که از TASK-14 سرویس «وجودِ مالک» را اثبات می‌کند (404 owner_not_found = رفتارِ امنیتیِ درست)؛ (۲) انتظارِ نامِ فایل از لایه‌ها قاطی شده بود (busboy پیش از `sanitizeFileName` basename می‌گیرد) | متنِ خطایِ annotationها |

## ۳) فایل‌های تغییریافته و دلیل

**ایمیج‌ها:** `apps/api/Dockerfile` (اضافه شدن `scripts/migrate.mjs`، `migrations/`، `package.json`، `packages/` — multi-stage و بدونِ devDeps حفظ شد)، `apps/web/Dockerfile` (WORKDIR `apps/web`، `next.config.mjs`، `apps/web/node_modules`، `packages/`، build-argِ `API_PROXY_TARGET`).

**پیکربندیِ امن:** `apps/api/src/config/production-config.ts` (جدید — fail-closed: رمزِ جای‌نگه‌دار/کوتاه/تک‌نویسه، رمزِ پیش‌فرضِ URLها، SMS_PROVIDER=log بدونِ اذعان، PSP/MINIO ناقص؛ بدونِ چاپِ هیچ مقدارِ رمزی؛ دو دریچهٔ صریحِ throwaway)، `apps/api/src/common/origin-policy.ts` (جدید — تجزیه/اعتبارسنجیِ origin + fail-closed در production)، `apps/api/src/main.ts` (assertProductionConfig اولِ بوت + `enableCors(corsOptionsFor())`)، `apps/api/src/modules/tracking/tracking.gateway.ts` (تجزیه‌گرِ مشترک + چکِ origin در handshake).

**سلامت:** `apps/api/src/common/health/health.controller.ts` (liveness/readiness واقعی با PG_POOL+REDIS_CLIENT)، `packages/contracts/src/index.ts` (نوع‌های `LivenessResponse`/`ReadinessResponse` — مسیرها عمداً خارج از OpenAPI ماندند، هم‌راستا با `contract-drift.mjs`)، `packages/contracts/package.json` + `src/index.ts` (پسوندِ `.js` + `type: module` — قابلِ بارگذاری با Node خام).

**Compose:** `docker-compose.yml` (پورت‌های فقط-`127.0.0.1`، رمزهای متغیر با پیش‌فرضِ محلی، healthcheckِ readiness با start_period بزرگ، `depends_on: service_healthy` برای وب، MINIO_* passthrough)، `docker-compose.prod.yml` (جدید — fail-closed روشن، restart policy؛ پشتهٔ محلی دست‌نخورده).

**CI:** `.github/workflows/release-image.yml` (جدید — دروازهٔ release؛ بندِ ۶ پایین)، `.github/workflows/ci.yml` (خروجیِ `healthy`، پورتِ s3mock 9090، تشخیصِ ANSI-proof + chunked + artifact)، `.github/workflows/e2e.yml` (overrideِ تولید + رمزهای تصادفیِ mask‌شده برایِ اجرایِ واقعیِ fail-closed).

**تست‌ها (جدید):** `production-config.test.ts` (۱۸)، `origin-policy.test.ts` (۱۰)، `cors-http.test.ts` (۵)، `health-probes.test.ts` (۶)، `apps/web/src/next-config.test.ts` (۲)؛ اصلاحِ `attachments.api.test.ts` (fixture زنجیرهٔ مالکِ واقعیِ pod + خاصیتِ لایهٔ HTTP).

**اسناد:** `docs/deploy/PRODUCTION_DEPLOYMENT.md` (بازنویسی)، `docs/deploy/CHECKLIST.md`، `.env.production.example`، `README.md`، `docs/db-privilege-architecture.md` (بلوکِ به‌روزرسانی). تاریخچه‌های گزارش‌ها دست‌نخورده.

## ۴) محتوایِ نهاییِ ایمیج‌ها (بازرسیِ واقعیِ داخلِ ایمیجِ نهایی)

گامِ `inspect required runtime assets` در `release-image` (docker run رویِ همان ایمیجِ build‌شده):

```
ASSET OK   apps/api/dist/main.js
ASSET OK   scripts/migrate.mjs
ASSET OK   package.json
ASSET migrations_up_count=45            (== 45 فایلِ up مخزن)
ASSET OK   packages/contracts/dist
ASSET OK   import(@dms/contracts)        (require هم محلی راستی‌آزمایی شد)
ASSET OK   require(pg)
ASSET OK   migrate.mjs syntax
WEB ASSETS OK   (.next/BUILD_ID + next.config.mjs + node_modules::next)
```

وابستگی‌های production فقط (npm ci سراسری hoisted؛ `apps/api/node_modules` تودرتو ندارد؛ توسعه‌ای در ایمیج نیست). هر دو ایمیج multi-stage ماندند (`deps→builder→runner`).

## ۵) راستی‌آزماییِ CLI مهاجرت و دایرکتوریِ مهاجرت در ایمیج

- `findMigrateScript()` از cwd (`/app`) بالا می‌رود و `/app/scripts/migrate.mjs` را می‌یابد (در ایمیج موجود).
- `migrate.mjs` مهاجرت‌ها را از `ROOT/migrations` (= `/app/migrations`) می‌خواند؛ شمارِ فایل‌های up داخلِ ایمیج = **۴۵** = مخزن.
- `AUTO_MIGRATE=true`: apply زیرِ `pg_advisory_lock` — در بوتِ CI واقعاً **۴۵/۴۵** اعمال شد (`schema_migrations`).
- `AUTO_MIGRATE=false`: حالتِ check/status هم به CLI نیاز دارد (هر دو مستند شدند)؛ دستورِ درون‌کانتینری: `docker compose exec api node scripts/migrate.mjs up` (و `npm run db:migrate` روی checkout).

## ۶) نتایجِ واقعیِ بوتِ Docker Compose ایزوله (CI — چرخهٔ کاملِ کانتینر)

محلِ اجرا: workflow جدید `release-image.yml` رویِ runner دارایِ Docker (sandboxِ agent از نصبِ Docker ناتوان است — بندِ ۱۳). پروژهٔ یکتای `relimg-<run_id>` با volumeهای تازه؛ سرویس‌ها: postgres/postgis 16-3.4 + redis + api + web (minio عمداً بیرون). run نهایی رویِ `1b0df38` = **success**:

| معیار (فاز ۳) | نتیجه | شاهد (annotation) |
|---|---|---|
| ۱ PostgreSQL init موفق | ✅ | postgres `(healthy)` در `compose ps` |
| ۲ init نقشِ زمانِ اجرا روی volume تازه | ✅ | `role=dms_app(super=f,bypassrls=f,canlogin=t)` |
| ۳ همهٔ مهاجرت‌ها کشف شدند | ✅ | `migrations in image=45 (repo=45)` |
| ۴ همهٔ مهاجرت‌ها اعمال شدند | ✅ | `migrations=45/45` از `schema_migrations` |
| ۵ API با `APP_DATABASE_URL` بالا آمد | ✅ | `dms_app_tcp=1` در `pg_stat_activity` |
| ۶ راستی‌آزماییِ هویتِ زمانِ اجرا پاس شد | ✅ | **`dms_tcp=0`** (هیچ اتصالِ نقشِ مهاجرت)، بدونِ هشدارِ هویت، `forced_rls=161`، `public_tables=169` |
| ۷ health سالم | ✅ | `api-health=OK(0s)` با `"status":"ok"` |
| ۸ وب بالا آمد و `/login` ۲۰۰ | ✅ | `web-login=OK(5s)` |
| ۹ پروکسیِ هم‌مبدأ به API رسید | ✅ | `proxy-api-health-via-web=OK(0s)` با `"service":"dms-api"` از پورت ۳۰۰۰ |
| ۱۰ هیچ رمز/رشتهٔ اتصال در لاگ‌ها | ✅ | `0 secret value occurrences` (مقایسهٔ دقیقِ مقداریِ JWT_SECRET/POSTGRES_PASSWORD/APP_DB_PASSWORD در لاگِ api/web/postgres) |
| ۱۱ API با هویتِ مهاجرت بالا نیامد | ✅ | همان `dms_tcp=0` + سلامتِ فقط با dms_app |
| تستِ منفیِ fail-closed (هدفِ ۸ سند) | ✅ | پیکربندیِ ناقصِ production ⇒ **بوتِ ردشده** با پیامِ فارسی (`incomplete production config correctly REFUSED to boot`) |
| round-trip ضمیمه (آبجکت‌استوریج) | ✅ | `adobe/s3mock:3.9.1` (digest `sha256:7514ca2a…` ثبت‌شده) با کلاینتِ خودِ برنامه: makeBucket/put/stat/**presigned-get**/remove — `attachment round-trip PASSED` |

پاک‌سازی: فقط پروژه‌های `relimg-*`، volumeها، containerِ probe و ایمیج‌های همین جریان (گامِ cleanup با `if: always()`).

## ۷) شواهدِ هویتِ پایگاه‌دادهٔ زمانِ اجرا

- `APP_DATABASE_URL` = `dms_app` (محدود) و `DATABASE_URL` = نقشِ مهاجرت — جداسازی حفظ؛ راستی‌آزماییِ `runtime-identity.ts` (fail-closed) در production فعال.
  **یادداشت تاریخی H:** «نقش مهاجرت» در این گزارش TASK-19 به معنای همان
  `DATABASE_URL` مالک اشیاء است، نه `dms_migrator` مستقل؛ مدل جاری ترمیم پارتیشن
  فقط با مالک اشیاء و `EXECUTE` صریح/خارج از مخزن پشتیبانیشده است.
- `pg_stat_activity` (اتصال‌های TCP واقعیِ برنامه): **`dms_app=1`، `dms=0`** — برنامه قطعاً با نقشِ محدود کار می‌کند و نقشِ مهاجرت پس از migrate باقی نمانده.
- `pg_roles`: `dms_app` با `rolsuper=f, rolbypassrls=f, rolcanlogin=t`.
- ۱۶۱ جدول با RLSِ فعال‌و‌اجباری (`relforcerowsecurity`) رویِ دیتابیسِ تازه؛ خواندنِ `branch` بدونِ زمینه ⇒ صفر ردیف (درونِ همان راستی‌آزماییِ بوت).
- هیچ تغییرِ نقش/مالکیتی رویِ هیچ دیتابیسِ موجودی انجام نشد (init فقط رویِ volume خالی).

## ۸) اعتبارسنجیِ رمزهای production و CORS

- **رمزها:** `assertProductionConfig` در اولِ bootstrap: ردِ JWT_SECRET جای‌نگه‌دار/کوتاه‌تر از ۳۲/تک‌نویسه؛ ردِ رمزِ خالی/پیش‌فرضِ شناخته‌شده در `APP_DATABASE_URL`/`DATABASE_URL`؛ ردِ `SMS_PROVIDER=log` بدونِ `SMS_ALLOW_LOG_PROVIDER=true` (جلوگیری از «ظاهرسازیِ تحویلِ OTP»)؛ ردِ PSP/MINIO فعال با رمزِ جای‌نگه‌دار. **هیچ مقدارِ رمزی در هیچ پیامی چاپ نمی‌شود** (تستِ صریحِ `not.toContain(value)`). دو دریچهٔ `DMS_ACCEPT_INSECURE_LOCAL_SETUP` و `SMS_ALLOW_LOG_PROVIDER` فقط برایِ پشتهٔ throwaway محلی/CI و در اسنادِ production ممنوع‌اند؛ overrideِ `docker-compose.prod.yml` هر دو را `false` می‌کند. تستِ منفیِ CI همین رفتار را با بوتِ واقعی اثبات کرد.
- **CORS:** به‌جایِ `origin:true`، allowlistِ صریحِ `ALLOWED_ORIGINS` (با credentials)؛ production بدونِ فهرستِ معتبر ⇒ fail-closed؛ ورودی باید origin کامل باشد (`*`/بدونِ scheme/مسیردار ⇒ رد). رگرسیون‌ها: `origin-policy.test.ts` (۱۰) + `cors-http.test.ts` (۵) رویِ همان سیم‌کشیِ main.ts (مجاز ⇒ ACAO+credentials+Vary؛ ردشده ⇒ بدونِ بازتابِ ACAO — خاصیتِ fetch spec). socket.io هم فهرستِ مشترک + چکِ handshake.

## ۹) راستی‌آزماییِ endpointهای سلامت

| مسیر | رفتارِ اندازه‌گیری‌شده | تست |
|---|---|---|
| `GET /api/health` | 200؛ `ok\|degraded` + `database` (سازگاری حفظ شد) | CI health + unit |
| `GET /api/v1/health/live` | 200 حتی با DB پایین (بازآغازِ بی‌دلیل ممنوع) | `health-probes.test.ts` |
| `GET /api/v1/health/ready` | 200 `ready` با DB بالا؛ **503** `unready` با DB پایین؛ `redis` فقط گزارش (سرویس بدونِ Redis با کاهشِ کارایی بالا می‌آید — مطابقِ redis.module) | unit + CI |

مسیرهای مستندشده در PRODUCTION_DEPLOYMENT/CHECKLIST دقیقاً همین‌ها هستند (مسیرهای قدیمیِ `/health*` و `localhost:3001` حذف/اصلاح شدند). health عمداً خارج از OpenAPI است (پروبِ زیرساخت، رویهٔ `contract-drift.mjs`).

## ۱۰) نتایجِ CI

**واگذاری به CI (تنها مجرایِ اجرایِ Docker در دسترس):** workflow جدیدِ `release-image.yml` — دروازهٔ ایزولهٔ release (جدای از jobهای MinIO و Playwright) با ۱۲ گامِ شاهدمند (build → بازرسیِ ایمیج → بوتِ ایزوله → health → هویت → اسکنِ رمز → تستِ منفی → storage → cleanup).

**وضعیتِ نهایی رویِ `1b0df38`:**

| جریان/job | نتیجه | توضیح |
|---|---|---|
| **CI › Static** (typecheck, openapi, contract-drift, build) | ✅ | typecheck rc=0، openapi rc=0، drift rc=0 (۱۴۲ path / ۲۰۷ operation / ۱۰۱ schema) |
| **CI › Unit** (بدونِ DB/MinIO) | ✅ | API: **۱۶ فایل / ۲۳۴ تست** (۳۹ جدید) + web: **۷ فایل / ۵۲ تست** (۲ جدید) |
| **CI › Integration (Postgres)** | ✅ | همهٔ تست‌های DB‌دار به‌جز ضمیمه |
| **CI › Integration (MinIO)** | ✅ **(نخستین بار در تاریخِ پروژه)** | resolveِ s3mock:3.9.1 (digest ثبت) + **۹/۹** `attachments.api.test.ts` با round-trip واقعی |
| **CI › init-hygiene** | ✅ | هارنسِ بهداشتِ credential (TASK-17/18) |
| **release-image** (جدید) | ✅ | جدولِ بندِ ۶ — کامل |
| **e2e (Playwright)** | ⛔ **BLOCKED** (حفظِ صریحِ دروازه) | minio/minio ⇒ `pull access denied`، quay.io ⇒ 401؛ پیامِ gate با baseline یکسان؛ هیچ تستِ مرورگری اجرا نشده (ادعایِ E2E PASS نداریم) |
| **migrations (up→down→up)** | ⚠️ رویِ این PR اجرا نشد (فیلترِ مسیر) | `migrations/`، `scripts/migrate.mjs`، `scripts/test-migrations.mjs`، manifestها **بایت‌به‌بایت با baseline یکسان‌اند** (`git diff main...HEAD` روی آن مسیرها = ۰)؛ آخرین اجرایِ سبز: رویِ `71b7146`. dispatch دستی با این توکن 403 خورد ⇒ برایِ این SHA **UNVERIFIED** (نه FAIL) |

تعدادِ دقیقِ تست‌های Integration (Postgres) از لاگ‌های CI قابلِ دانلود نیست (blob) ⇒ **UNVERIFIED**؛ کیفیتِ سبزِ job از conclusion است.

## ۱۱) وضعیتِ MinIO/E2E

- سرویسِ `minio` compose (دستورِ `server /data`) به تصویرِ MinIO واقعی نیاز دارد که در CI عمومی از هر دو مرجع (`minio/minio`، `quay.io/minio/minio`) **غیرقابلِ pull** است ⇒ جریانِ e2e تا رفعِ آن **BLOCKED** می‌ماند (همان رویهٔ پروژه: نه skipِ بی‌صدا، نه FAILِ گمراه‌کننده).
- round-trip ضمیمه با **`adobe/s3mock:3.9.1`** (پین‌شده با digest؛ همان نامزدِ jobِ Integration (MinIO)) در هر دو جایگاه سبز است. ادعایِ سازگاریِ S3 فقط با round-tripِ واقعیِ کلاینتِ برنامه است، نه pull شدن.
- اصلاحِ ریشه‌ایِ probeها: پورتِ HTTP س3mock=**9090** (8090 مالِ TLS) — با استناد به README همان تگ.

## ۱۲) اصلاحاتِ اسناد

- `PRODUCTION_DEPLOYMENT.md` بازنویسی شد: دستورِ migrate درون‌ایمیجی (`docker compose exec api node scripts/migrate.mjs up`)؛ URLهای سلامتِ واقعی؛ جدولِ متغیرهای الزامی با قواعدِ fail-closed؛ نقش‌های DB (جریانِ `\password`، بدونِ `ALTER ROLE … PASSWORD` در SQL)؛ جدولِ پورت‌ها (همه فقط 127.0.0.1؛ مرزِ عمومی = reverse-proxy/TLS)؛ **بک‌آپ تا تستِ restore واقعی «عملیاتی» ادعا نمی‌شود**؛ ارتقا/مرزِ rollback؛ جدولِ تفکیکِ خطایِ برنامه/زیرساخت.
- `CHECKLIST.md`: مسیرها/دستورهای درست، overrideِ الزامیِ تولید، صداقتِ بک‌آپ.
- `.env.production.example`: دستورِ migrate درست، سیاستِ SMS log، دو دریچهٔ throwaway، هشدارِ build-time بودنِ `API_PROXY_TARGET`.
- README (وضعیتِ فعلی، با شمارشِ تأییدشده): **۴۵ جفت مهاجرت / ۱۶۹ جدولِ public** (شمارشِ زندهٔ CI)، قرارداد **۱۴۲/۲۰۷/۱۰۱** (بازشماری از openapi.yaml)، Node ≥22، بخشِ استقرار (loopback، override، health، هشدارِ build-time).
- `docs/db-privilege-architecture.md`: بلوکِ «۶-ب) به‌روزرسانیِ وضعیت» — 0042–0045 مواردِ باقی‌ماندهٔ بخشِ ۶ را پوشش دادند؛ مالکیتِ REASSIGN و نرخ‌گذاریِ Redis همچنان باز. **متنِ تاریخی دست نخورد**؛ گزارش‌های تاریخی (TASK-11…18) بازنویسی نشدند (PR #5 در آن‌ها به‌عنوانِ سندِ تاریخی می‌ماند).

## ۱۳) ریسک‌های باقی‌مانده و UNVERIFIEDها

1. **چرخهٔ up→down→up برایِ این SHA اجرا نشد** (فیلترِ مسیرِ migrations.yml + dispatch با توکن 403) — مسیرهای مربوطه بایت‌به‌بایت با آخرین run سبز یکسان‌اند؛ برایِ این PR **UNVERIFIED**.
2. تعدادِ دقیقِ تست‌های Integration (Postgres) = **UNVERIFIED** (لاگ‌های blob غیرقابلِ دانلود).
3. اجرایِ Docker فقط رویِ runnerهای GitHub انجام شد؛ sandboxِ agent هیچ container-runtime ندارد (probeها در بندِ ۱) — ادعایِ اجرایِ محلیِ کانتینر وجود ندارد.
4. e2e/Playwright همچنان اجرا نشده (BLOCKEDِ MinIO-image) — هیچ ادعایِ E2E PASS نیست.
5. بک‌آپ/restore، ارتقا/rollback عملیاتی **آزموده نشده‌اند** (در اسناد صریحاً همین‌طور ثبت شد).
6. درگاهِ پیامکِ واقعی (http gateways) آزموده نشده؛ SMS فقط مسیرِ log (CI) دیده شده.
7. `ATTACHMENT_ALLOW_UNVERIFIED_OWNER` فقط به‌صورتِ fail-closed دیده شده (مسیرِ بازشدنِ آن آزموده نشده — عمداً).
8. سرویسِ minio در پشتهٔ تولید باید از رجیستریِ سازمانی pull شود (خارج از کنترلِ مخزن).

## ۱۴) حکمِ نهایی

## **PASS WITH FINDINGS**

همهٔ هشت هدفِ سند با شواهدِ اجرایی برقرار شد: build ایمیج‌ها، PostgreSQL/Redis، init تازه، زنجیرهٔ کاملِ مهاجرت (۴۵/۴۵)، بوتِ API با هویتِ محدودِ `dms_app` (با اثباتِ `pg_stat_activity`)، بوتِ وب + `/login` + پروکسیِ هم‌مبدأ، health/live/ready، و fail-closed بودنِ پیکربندیِ ناقص (تستِ منفیِ واقعی). round-trip آبجکت‌استوریج با سرویسِ پین‌شده سبز شد. یافته‌های جانبیِ مهم (B8 تا B10) با ریشه‌یابیِ شاهدمند اصلاح شدند.

**Findings (باز، صادقانه):** (۱) e2e تا رفعِ مسدودیِ رجیستریِ MinIO BLOCKED می‌ماند؛ (۲) چرخهٔ مهاجرت برایِ این SHA UNVERIFIED (فیلترِ مسیر؛ مستند در بندِ ۱۰)؛ (۳) sandbox محلی بدونِ Docker (اجرایِ واقعی در CI — مجرایِ خودِ سند در فاز ۶)؛ (۴) backup/restore و درگاهِ پیامکِ واقعی آزموده نشده‌اند.

**PR #6 باز است؛ ادغام نشده و نمی‌شود — منتظرِ بازبینیِ مستقل و تأییدِ مالک.**
