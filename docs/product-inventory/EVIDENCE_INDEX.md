# ایندکسِ شواهد (Evidence Index) — Gate 1 (TASK-21)

> قابلِ ردیابی برای هر نتیجهٔ مهم: مسیر/خط، مهاجرت، عملیاتِ API، تست + نتیجهٔ دقیقِ اجرا، CI run/SHA، شواهدِ runtime. مواردِ مسدود/`UNVERIFIED` با دلیل.

## ۱) baseline و Git

| شاهد | مقدار |
|---|---|
| HEAD کار / `main` (remote+local) | `d39ba068ed9dae1bcb9f6aac241ec9f5e2bffdf5` (`git rev-parse` + `gh api .../commits/main`) |
| merge commit ادعاییِ TASK-19 | تأیید شد: parents=`bef9da7`,`80fb846`، ۲۰۲۶-۱۱-۰۶T13:28:18Z |
| وضعیتِ کار در شروع | پاک (0 فایلِ تغییریافته) |
| PRهای باز | هیچ (`gh pr list`) |

## ۲) مهاجرت‌ها (migrations/ — ۴۵ زوج، ۹۱ فایل)

| مهاجرت | محتوای کلیدی | استفاده‌شده در |
|---|---|---|
| ۰۰۰۱ | extensions/functions (trgm) | جست‌وجوی محصول |
| ۰۰۰۲ | زیرساختِ مشترک (company, branch, audit, feature_flag, number_counter…) | A-01..A-03 |
| ۰۰۰۳/۰۰۰۴ | سازمانِ فروش (region/sales_area/route/visit/staff) | A-02, D-02 |
| **۰۰۰۵** | uom, product_category, brand, tax_code, **product**, product_packaging (+`uq_product_barcode`)، batch | C-01..C-06 |
| **۰۰۰۶** | price_list/item (daterange+EXCLUDE), customer_price, promotion (۹ نوع) | E-01..E-03 |
| ۰۰۰۸ | inventory_txn, stock_balance/reservation/transfer/adjustment/count, reorder_policy | G-01..G-08 |
| ۰۰۱۰ | sales_order(+status check)/line (snapshot مالی)، invoice، waybill، **moadian_submission** | F-01..F-03, J-01 |
| ۰۰۱۷ | settings, sms_template, print_template | A-03, J-03 |
| ۰۰۲۲ | seed مجوزها (RBAC) | B-02 |
| ۰۰۴۱/۰۰۴۲ | امتیازاتِ DB + پوششِ RLS | A-01 |
| ۰۰۴۵ | pretenant otp/flags (آخرین) | B-01 |

شمارش‌های زنده (CI، run `42211433467` روی `80fb846`، annotation `release-image-identity`): `migrations=45/45 · forced_rls=161 · public_tables=169 · dms_app_tcp=1 · dms_tcp=0 · super=f · bypassrls=f`.

## ۳) عملیاتِ API (قرارداد: `packages/contracts/openapi.yaml`)

| منطقه | کنترلرها (مسیرها) | نمونهٔ عملیات |
|---|---|---|
| auth/RBAC | auth(7), users(5), roles(5), devices(3) | `POST /auth/login`، `POST /auth/otp/request`، `POST /auth/refresh` |
| master-data | product(5), packaging(5), price-list(4), promotion(4), person(4), staff(4), reference(2), master-data(1) | CRUD محصول/بسته/قیمت |
| sales | sales-chain(11), order(5), customer(5), return(5), area(4), route(4), waybill(3) | `POST /sales/requests/:id/convert` |
| inventory/purchasing | stock(2), stocktake(5), transfer(3), warehouse(4), purchasing(11), goods-receipt(5) | دریافتِ کالا، انتقال، شمارش |
| finance/GL | finance(8), payment(3), cheque(4), gl(8) | `POST /gl/periods/:id/close` |
| distribution | tours(9), tracking(6), geofence(5) | settlement تور، GPS |
| integrations | moadian(2), psp(3), integrations-status(2) | submission مؤدیان |
| portal | portal(9) | پورتالِ مشتری |
| rules | rules-engine(14), rules.contract(6) | تاییدها/قواعد |
| bi/reports | bi(5), reports(2) | kpi/abc/forecast |
| attachments | attachments(3) | upload با owner-chain |

`npm run openapi:check` (اجراشده در TASK-21، rc=0): **مسیرها ۱۴۲ | عملیات ۲۰۷ | اسکیما ۱۰۱ | وب‌هوک ۳** — «سند OpenAPI معتبر است».

## ۴) تست‌ها — نتایجِ دقیقِ اجرا در TASK-21 (محیط: sandbox بدونِ Docker/DB؛ SHA=`d39ba06`)

| فرمان | نتیجه |
|---|---|
| `npm ci` | rc=0 |
| `npm run typecheck` (contracts+api-client+api+web) | **rc=0** |
| `npx vitest run` (apps/api) | **Tests 234 passed (234)** — ۱۶ فایلِ بدون‌DB پاس؛ **۲۸ فایلِ وابسته به DB اجرا نشدند** (PostgreSQL در دسترس نیست — خطای setup در اتصال؛ environmental، نه شکستِ تست) |
| `npx vitest run` (apps/web) | **Test Files 7 passed (7) — Tests 52 passed (52)** |
| `npm run openapi:check` | **rc=0** (۱۴۲/۲۰۷/۱۰۱/۳) |

### پوششِ تستی (فایل‌های `apps/api/test/` — ۴۴ فایل + guard)
- مستقیمِ کسب‌وکار: products, customers, persons, orders, pricing, returns, inventory, warehouses, purchasing, goods-receipt, waybills, tours, gl, treasury, reports, bi, bi-forecast, settings, staff, structure.
- امنیت/چند-مستأجری: tenant-isolation, tenant-connection-lifecycle, runtime-identity, db-privileges, postgres-init-role, attachment-owner-scope, portal-auth, onboarding-abuse, auth, otp, users-roles, devices.
- زیرساخت: queue-failure-persistence, job-tenant-context, sms-sender, attachments(+api), contract, cors-http, origin-policy, health-probes, production-config.
- **نبودها (ثبت‌شده در GAP_REGISTER):** rules-engine/approval (G-03)، audit اختصاصی، moadian اختصاصی، reconciliation گزارش‌ها (G-16).

## ۵) شواهدِ CI (GitHub Actions — همه روی `80fb8469beabb5e9b1860719d152797a956dba62`، سرِ PR #6؛ درختِ کد با `d39ba06` جز اسناد یکسان — G-18)

| Workflow/Job | Run ID | نتیجه | شاهدِ کلیدی (annotation) |
|---|---|---|---|
| ci.yml — Static | 42211433517 | ✅ | typecheck/openapi/drift |
| ci.yml — Unit | 42211433517 | ✅ | ۲۳۴ API + ۵۲ web |
| ci.yml — Integration (Postgres) | 42211433517 | ✅ | (۲۸ فایلِ DB) |
| ci.yml — Integration (MinIO) | 42211433517 | ✅ | ۹/۹ attachments روی s3mock (گامِ `Attachment round-trip tests` اجرا+موفق — بدونِ skip) |
| ci.yml — Init hygiene | 42211433517 | ✅ | statement-logging |
| release-image.yml | 42211433467 | ✅ | assets 45=45 · api/live/ready ✅ · web-login ✅ · proxy ✅ · identity (بالا) · log-hygiene 0-secret · negative: بوتِ ناقص رد شد · storage round-trip با digest `sha256:7514ca2a…48a` |
| e2e.yml | 42211433478 | ❌ | `BLOCKED-e2e-minio-image` (مانعِ registry — G-01؛ تغییرناپذیر از گزارش‌های تاریخی) |
| migrations.yml (up→down→up) | 42091866275 روی `3daca7c` | ✅ | ورودی‌های مهاجرت در `3daca7c..80fb846` بایت‌به‌بایت یکسان (اثباتِ equivalence در TASK-20) |

## ۶) شواهدِ runtime و محیط

| مورد | وضعیت |
|---|---|
| Docker در sandbox | ❌ موجود نیست (پروب‌های registry مسدود — تاریخی) |
| Java/Android SDK | ❌ ⇒ build اندروید `UNVERIFIED` (G-02) |
| PostgreSQL/PostGIS/MinIO محلی | ❌ ⇒ Integration محلی اجرا نشد؛ مرجع = CI |
| Node/npm | ✅ v22.22.3 / 10.9.8 |
| ایمیجِ release بوت‌شده (CI) | ✅ (release-image.yml) |
| backup/restore | ❌ `UNVERIFIED` (G-11، تاریخی) |
| درگاهِ SMS/Moadian/PSP واقعی | ❌ `UNVERIFIED` (G-08، تاریخی) |

## ۷) اسنادِ تاریخیِ حفظ‌شده (بدونِ بازنویسی)

`docs/task-11..task-19-completion-report.md`، `docs/task-18-qa-report.md`، `docs/db-privilege-architecture.md`، `docs/deploy/*`، `docs/integrations-golive.md`، `dms-design-report.md`، `ANDROID_STEPS_PRIORITY.md` (کهنه‌شدگیِ بخشی در G-10 ثبت شد — خودِ سند دست‌نخورده ماند).

## ۸) روشِ استنتاجِ وضعیت‌ها (قابلِ تکرار)

1. هر قابلیت: مهاجرت (ساختار) ← controller/endpoint (سطح) ← فایلِ تست (اجرا) ← CI (شاهدِ اجرای اخیر) ← UI (فقط استاتیک).
2. هرگز route/جدول به‌تنهایی = پیاده‌سازی؛ هرگز تستِ اجرا-نشده = تأیید؛ mock = جریانِ واقعی نیست.
3. `UNVERIFIED` برای هر شکافِ اجراییِ محیطی؛ «تاریخیِ معتبر» برای محدودیت‌های بدونِ تغییر از TASK-19/20.
