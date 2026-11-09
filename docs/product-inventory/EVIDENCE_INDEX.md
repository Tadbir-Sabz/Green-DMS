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
| ۰۰۰۸ | inventory_txn, stock_balance/reservation/transfer/adjustment/count, reorder_policy | INV-01..INV-08 |
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

## ۹) افزودنیِ TASK-22 — پیاده‌سازیِ P1 (Product Master)

| شاهد | مقدار |
|---|---|
| شاخه / commit شروع | `arena/0d6d3dbc-green-dms` @ `eeecca5d1f26a1c3dd8cb12488b778c835054ffb` (== `main` پس از ادغامِ PR #8) |
| مهاجرت | `migrations/0046_product_master.up.sql` + `.down.sql` — چرخهٔ up→down→up محلی rc=0؛ additive/nullable؛ `product_barcode` با backfill از `product_packaging.barcode`؛ ستون‌های snapshot روی ۱۰ خطِ سند + `fn_product_line_snapshot` + `v_document_line_display`؛ `fn_reject_bundle_line` (D5) روی ۴ خطِ فروش؛ مجوزهای `master.product.import`/`master.product.status` |
| API (apps/api/src/modules/master-data) | `product-normalize.ts` · `product-sensitivity.ts` (D4) · `product-master.repository.ts` · `product-master.service.ts` · `product-barcode.controller.ts` (H-1: barcodes/scan) · `product-catalog.controller.ts` (families/aliases/attributes/relations/bundle/duplicate-check) · `product-import.controller.ts` (§E) · بازنویسیِ `product.service.ts` (D1 auto-SKU + D4) · `packaging.controller.ts` (D4+barcode sync) · sales D5 guards · pricing `packaging_id` (M-2) |
| قرارداد | `packages/contracts/openapi.yaml` — ۱۵۸ مسیر / ۲۳۱ عملیات / ۱۱۴ اسکیما؛ `npm run openapi:check` سبز؛ کلاینتِ TS بازتولید شد (`openapi-typescript`)؛ تولیدِ کلاینتِ Kotlin **BLOCKED** (دانلودِ maven/adoptium در sandbox مسدود) |
| UI (apps/web/src/app/products) | فهرست+جست‌وجو+اسکنِ بارکد (`page.tsx`) · ویزاردِ ساخت با duplicate-check زنده (`new/`) · جزئیات با ۷ تب: مشخصات(D4)/صفات و variant(M-3)/نام‌های جایگزین/بارکد‌ها/بسته‌بندی(D3)/روابط/ترکیب بسته(D5) (`[id]/`) · ویزاردِ import (`import/`) — RTL فارسی، تایپوگرافی موجود، build تولیدی سبز |
| تست‌های جدید (apps/api/test) | `product-master-fixture.ts` (DB موقتِ ایزوله + همهٔ مهاجرت‌ها) + ۷ فایل: core(15) · barcode(11) · attributes(9) · snapshots(5) · bundle(6) · import(7) · security(21) = **۶۸** |
| نتیجهٔ اجرای کامل | **API: ۹۵۰/۹۵۰ (۵۱ فایل)** = پایهٔ ۸۸۲ در `eeecca5d` + ۶۸ جدید · **web: ۵۲/۵۲** · `npm run typecheck` rc=0 · `next build` rc=0 |
| اثبات‌های امنیتی/رفتاری | SKU یکتا (23505→409) · scan قطعی (409 برای برخورد) · تبدیلِ ۴ رقمی بدونِ گردکردنِ مالی (D3 — قواعدِ موجود دست‌نخورده) · D4: تغییرِ حساس بدونِ `confirm_sensitive` → 400 + `master.product.status` برای وضعیت → 403 · M-3: امضای قطعی + یکتایی در خانواده + تغییرناپذیری پس از ارجاع · D5: ردِ خطِ سندِ فروشِ حاویِ bundle در DB (تریگر) + pre-check سرویس · import: validate-before-persist + idempotency + همه‌یاهیچ + audit · audit_log در همهٔ نوشتن‌های حساس |
| باگِ ازپیش‌موجود رفع‌شده | `PackagingController` + `MasterDataRepository` در `MasterDataModule` ثبت نشده بودند ⇒ مسیرهای `/packaging/*` پیش از TASK-22 عملاً 404 بودند (کدِ مرده) |
| تغییرِ قراردادِ مستندشده | D4: `PATCH /products/{id}` برای تغییرِ وضعیت اکنون `confirm_sensitive:true` می‌خواهد (تستِ `products.api.test.ts` متناسب به‌روزرسانی شد) |
| محیطِ تست (بازسازی‌شده) | PG18.6 محلی (embedded) + PostGIS 3.6/pgcrypto با shim/patch سازگاریِ glibc · s3rver :9000 · DBهای تست موقت/ایزوله · هیچ اتصالی به DB اشتراکی/تولید |

---

## ۸) TASK-24 — موتورِ قیمت/تخفیف (P2)

| شاهد | مقدار |
|---|---|
| HEAD مبنا | `d12dc2e04a128775481e9e42c3b48fb339ca4432` (شاخهٔ `arena/1246108f-green-dms`) |
| commit تحویلِ TASK-24 | `1a65d3c78740f357a996ac8fbe3facc165d8f171` (push‌شده به `arena/1246108f-green-dms`؛ بدون merge/deploy) |
| مهاجرت | `migrations/0049_pricing_promotion_engine.{up,down}.sql` — چرخهٔ up→down→up در DB ایزوله: `tables 7→0→7`، `pricing_perms 7→0→7`، `price_list_cols 3→0→3`، `triggers 4→0→4`، `forced_rls_tables 8→0→8` |
| قرارداد | `packages/contracts/openapi.yaml`: مسیرها ۱۷۲ · عملیات ۲۴۹ · schema ۱۲۴ (**drift = ۰**)؛ `npm run openapi:check` سبز؛ `packages/api-client/src/schema.ts` بازتولید شد (کلاینتِ Kotlin در این محیط تولید نشد — نیازِ شبکهٔ Maven) |
| تست‌های تازه (۱۱۲) | `pricing-engine.unit.test.ts` **۴۲ PASS** · `financial-rounding.test.ts` **۱۱ PASS** · `pricing-engine.api.test.ts` **۳۵ PASS** · `rules-engine-behavior.test.ts` **۲۴ PASS** |
| رگرسیونِ هدفمند | `pricing.api.test.ts` + `orders.api.test.ts` = **۳۱ PASS / ۰ FAIL** |
| مجموعهٔ کاملِ API | **۱۰۷۳ PASS / ۳۴ FAIL / ۶۶ SKIP** (مبنا: ۹۶۱/۳۴/۶۶)؛ ۳۴ شکست = محدودیتِ محیط (PostGIS/MinIO/Redis/psql/init-role) |
| typecheck | API ✅ · Web ✅ · `packages/api-client` ✅ |
| UI | `apps/web/src/app/prices/page.tsx` — شبیه‌سازی + تجزیه + هشدارِ کفِ سود + سیاست‌ها + تاریخچه؛ اجرای مرورگری `UNVERIFIED` (G-01) |
| داوری | A/B/C/D **PASS** · E **PASS با گیتِ G-03** · F **BLOCKED (تصمیمِ مالک)** |

جزئیاتِ کامل: `docs/product-inventory/TASK-24_PRICING_ENGINE.md`.

---

## ۹) TASK-24F — اصلاحِ هدفمندِ یافته‌های حسابرسیِ مستقلِ TASK-24R

| شاهد | مقدار |
|---|---|
| مبنای حسابرسی‌شده | `5203d3fb8d7957e7ec7095f24f0c83b301eec8e1` (tree `05075982318ab6387bf4e99c79522f0feb7c5ff2`) روی شاخهٔ `arena/1246108f-green-dms` |
| commit اصلاح (نتیجه) | `1e36108` — روی همان شاخهٔ `arena/1246108f-green-dms` (بدونِ merge/deploy؛ هیچ push به شاخهٔ دیگر) |
| حفظِ کارِ پیشین | پیش از هر تغییری وضعیتِ بازیابی‌پذیر ساخته شد: `/home/user/task24f-backup/tracked-changes.patch` (sha256 `afa65edd…`) + `untracked-files.tgz` (sha256 `b57af493…`)؛ هویتِ تحویلِ حسابرسی‌شده با مقایسهٔ ۲۶۱۳ blob تأیید شد (۲۶۱۳/۲۶۱۳ یکسان، ۰ تفاوت) و بازیابی با `git reset --mixed 5203d3f` (فقط index) انجام شد — بدونِ `checkout -f`/`clean`/`force-push` |
| مهاجرت‌ها | `0050_pricing_remediation.{up,down}.sql` (append-only ledger + `pricing_settings` + ۵ مجوز) · `0051_g03_approval_hardening.{up,down}.sql` (G-03، مستقل) — **چرخهٔ up→down→up در این محیط اجرا نشد: `UNVERIFIED`** |
| قرارداد | ۱۷۳ مسیر · ۲۵۱ عملیات · ۱۲۶ schema · ۳ webhook · `openapi:check` سبز · `contract-drift` = ۰ (شاملِ ۴ enum و فیلدهای الزامیِ DTO، با کنترلِ منفیِ اثبات‌شده) |
| کلاینتِ TS | `packages/api-client/src/schema.ts` بازتولید شد · **Kotlin: `UNVERIFIED`** (نیازِ شبکهٔ Maven) |
| آزمونِ DB-free | `pricing-remediation.unit.test.ts` **۱۶ PASS** (HIGH-4 ×۵، MEDIUM-1 ×۸، HIGH-2 ×۲، MEDIUM-3 ×۱) · کلِ مجموعهٔ DB-free **۳۰۳/۳۰۳ در ۱۹ فایل** |
| آزمونِ DB-محورِ تازه (نوشته‌شده) | `pricing-engine.api.test.ts`: PE-10 (سفارش/مجوز/ممیزی ×۵)، PE-11 (هم‌خوانیِ دفتر + فقط-افزودنی + idempotency)، PE-9 (بین‌قلمرویی ×۳)، بازنویسیِ آزمونِ سقف روی `pricing_settings` · `orders.api.test.ts` به‌روزرسانی شد — **اجرا نشده در این محیط: `UNVERIFIED`** |
| typecheck | `tsc -p apps/api` → ۰ خطا (src) |
| مرزِ صداقت | هیچ DB اشتراکی/تولیدی استفاده نشد؛ هر ادعای DB-محور که اجرا نشده، صریحاً `UNVERIFIED` است |

---

## ۱۰) TASK-24V — دروازهٔ راستی‌آزماییِ نهایی و حسابرسیِ مستقل (read-only audit)

| شاهد | مقدار |
|---|---|
| نسخهٔ حسابرسی‌شده | `00f7f12ca655a90e0e3ff043ae89e0bed19366de` · tree `e102b2b1aa056ce5493f799df0341bbeac0da4b0` (شاخهٔ `arena/1246108f-green-dms`) |
| commitهای دروازه | `c1c9a3e` (ترمیمِ نحوی + هم‌ترازیِ آزمون‌های قیمت) · `75728e8` (هم‌ترازیِ G-03/مهاجرت + آزمونِ RLS) · HEAD شاخه = `75728e8` |
| PR | **#13 (draft)** فقط برای اجرای workflowهای موجود روی PR — **merge نشده**، هیچ push به شاخهٔ دیگر |
| HEAD نهاییِ شاخه | `7e9bdbf` (مستندات) · CI `42450639729` @HEAD: همان ۱ شکست (۸۸۷ pass) · migrations `42450639851` ✅ · release-image `42450639778` ✅ · e2e `42450639653` ⛔ |
| CI — مهاجرت‌ها (up→down→up + مقایسهٔ اشیا، PostGIS واقعی) | `42402374930` @`00f7f12` ✅ · `42450239490` @`75728e8` ✅ · `42452625679` @`9b8bf87` ✅ |
| CI — release-image (build+boot+migrate+health+login+proxy+secret-scan+fail-closed) | `42450239575` @`75728e8` ✅ · `42452625677` @`9b8bf87` ✅ |
| CI — e2e | `42450239526` ⛔ **BLOCKED** (بدونِ ایمیجِ MinIO؛ صفر آزمونِ مرورگری) |
| CI — Integration (Postgres) | `42404284138` @`c1c9a3e`: ۱۳ fail/۸۷۴ pass · `42450239559` @`75728e8`: ۱ fail/۸۸۷ pass · **`42452304238` @`090c78b` و `42452625662` @`9b8bf87`: ✅ success — هر ۵ job سبز** |
| نقصِ کشف‌شده و رفع‌شده (G-23) | `rules-engine-behavior.test.ts > تأییدِ دومرحله‌ای` ⇒ `409 amount_band_mismatch` (پس‌رفتِ `1e36108`) — **رفع در `090c78b`**: باند فقط گامِ ورود را تعیین می‌کند و تنها پیش از نخستین تصمیم بازسنجی می‌شود؛ ۳ آزمونِ رگرسیونِ تازه (زنجیرهٔ بی‌باند، زنجیرهٔ تشدید، ردِ مبلغِ دستکاری‌شده) |
| آزمون‌های قیمت در CI | `pricing-engine.api.test.ts` ۴۵ pass + ۱ expected-fail (شاملِ PE-12 RLS تازه) · `orders`+`pricing` ۳۱/۳۱ · `pricing-remediation.unit` ۱۶/۱۶ · `rules-engine-behavior` (۲۷ سناریو شاملِ ۳ رگرسیونِ G-23) سبز |
| DB ایزوله (پیش از بازنشانیِ سندباکس؛ شاهدِ مکمل — نسخهٔ معتبر CI با PostGIS است) | PG 17.6 · `127.0.0.1:55432` · `data=/tmp/pgdata24` · بدونِ PostGIS/DB اشتراکی؛ `mig_probe`: همهٔ upها در یک تراکنش exit 0 · چرخهٔ 0051 و 0050 down→up پاک · RLSِ `pricing_settings` با `dms_app`: ۱ ردیف، درجِ بین‌شرکتی `42501`، بدونِ زمینه ۰ |
| static | `typecheck` (API+Web) ۰ · `openapi:check` ۱۷۳/۲۵۱/۱۲۶/۳ · `contract-drift` ۰ · `check-test-partition` OK (schema.ts بدونِ diff) |
| Kotlin | **UNVERIFIED** — `npm run clients:generate` ⇒ `fetch failed` به `repo1.maven.org` |
| داوریِ کلی | **PASS برای merge** — هر ۵ jobِ CI + مهاجرت‌ها + release-image سبز · دو یافتهٔ غیرِ‌مسدودکنندهٔ `HIGH-1-R1`/`HIGH-2-R1` و پرسش‌های مالک باز · e2e `BLOCKED` (MinIO) · Kotlin `UNVERIFIED` |
| گزارشِ کامل | `docs/product-inventory/TASK-24V_VERIFICATION_REPORT.md` (بخش‌های ۱–۹) |

---

## ۱۱) TASK-24W — بستنِ HIGH-1-R1 و HIGH-2-R1

| شاهد | مقدار |
|---|---|
| مبنای کار | `1c849bc` (HEAD پیش از این دور، PR #13 draft) |
| شاخه | `arena/1246108f-green-dms` (بدونِ merge/deploy/force-push) |
| HIGH-1-R1 | **CLOSED** — `convert()` actor/مجوز/دلیل/ممیزی + قفلِ ضدِ هم‌زمانی |
| HIGH-2-R1 | **CLOSED** — `pricedPolicyRun()` مسیرِ واحدِ quote/simulate/order |
| فایل‌های کد | `pricing-permissions.ts` (تازه) · `pricing-engine.service.ts` · `pricing-quote.controller.ts` · `order.controller.ts` · `sales-chain.{service,controller,repository}.ts` · `request.dto.ts` |
| قرارداد | `openapi.yaml`: اسکیمای `ConvertRequest`، تفاوت‌های مستندِ `quote`/`simulate` — **۱۷۳ مسیر · ۲۵۱ عملیات · ۱۲۷ اسکیما · ۳ وب‌هوک**، drift = ۰ |
| آزمونِ تازه | `task24w-conversion-and-parity.api.test.ts` — **۲۱/۲۱ PASS** روی DB ایزوله |
| آزمونِ هم‌ترازی | `pricing-engine.api.test.ts` **۴۷/۴۷ PASS** (شاملِ `it.fails` که اکنون آزمونِ واقعی است) |
| آزمون‌های واحد | `pricing-engine.unit` + `pricing-remediation.unit` + `financial-rounding` = **۶۹/۶۹** |
| `rules-engine-behavior` (G-23) | **۲۷/۲۷** (پس از اصلاحِ هم‌ترازی؛ مجموعه سبز) |
| وب | typecheck ✅ · ۵۲/۵۲ آزمون ✅ |
| پارتیشنِ تست | `check-test-partition`: OK (۶۲ فایل) |
| نوع‌شناسی | `tsc -p apps/api` ✅ · `tsc -p apps/web` ✅ |
| DB ایزوله (این محیط) | PostgreSQL 17.6 · `127.0.0.1:55432` · بدونِ PostGIS (کپیِ harness با پچِ PostGIS) |
| CI | پس از push بررسی می‌شود — run ID در گزارشِ نهایی |

**محدودیت‌های محیطیِ همان اجرا (نه رگرسیون):** `geofences`، `customers`، `postgres-init-role`،
`view-isolation`، `tours`، `migrations-security` (چرخهٔ ST_GeomFromText) و یک آزمونِ fuzzy-search در
`product-master-core` به PostGIS/نقشِ init/افزونهٔ جست‌وجو نیاز دارند که در این سندباکس نیست؛ این
فایل‌ها در CI با `postgis/postgis:16-3.4` اجرا می‌شوند.


## TASK-24Z-FINAL-GATE — evidence reconciliation (documentation only)

- `TASK-24Z_FINAL_GATE_REPORT.md`: freshly verified PR HEAD d285850, exact-head
  five CI jobs and 14/14 browser results; both console occurrences UNVERIFIED;
  independent review still pending, no clean-console/approval claim.
- `TASK-24Z_OWNER_DECISION_REGISTER.md`: D01–D07 questions, alternatives,
  consequences, recommendations and role owners; all OPEN, not invented rules.
- `TASK-24Z_MODULE_COMPLETION_MATRIX.md`: current/next/shared/future boundaries,
  canonical roadmap dependencies and bounded operator-closure next task.
- `evidence/task24z-final-gate/`: PR-head/check, CI-job, browser-annotation and
  artifact metadata snapshots. Actual artifact download failed with EOF;
  metadata is not a locally inspected screenshot/event payload.

## TASK-24Z-OPERATOR-CLOSURE

- `TASK-24Z_OPERATOR_CLOSURE_REPORT.md`: source commits8951720/bffdc4c/5cbf3cf/
  b451d2b, exact-head15/15browser and all5nativeCI PASS, immutable provenance0059,
  historic failures and remaining NOT READY gates.
- `TASK-24Z_OPERATOR_POLICY_DEPENDENCIES.md`: D01–D07 implementation boundaries;
  module matrix updated without roadmap reorder/implicit deferrals.
- `../APPROVAL_OPERATOR_GUIDE_FA.md`: Persian lifecycle/provenance/delegation help.
- `evidence/task24z-operator/SCREENSHOT_MANIFEST.md`: actual major-screen browser
  attachment names and artifact13669457924; manual visual review UNVERIFIED.
- `evidence/task24z-operator/`: local44lifecycle/10UI/2filter/targetedrollback
  results, preserved local missing-PostGIS failure, first/filtered/final browser
  annotations and exact-head native CI/artifact metadata. Current two console
  occurrences classified from actual text/path notices, not guessed from counts.

## TASK-24Z-EXIT-GATE (no test reruns / no runtime changes)

- `TASK-24Z_EXIT_GATE.md`: definitive STILL BLOCKED full-module boundary,
  mandatory/optional/owner-gated/approved-future/shared matrix, D01–D07 owner
  choices and exact start conditions; no implicit scope waiver.
- `TASK-PM-01_PRODUCT_MASTER_SPEC.md`: actionable decision-gated design for
  central SKU plus per-domain availability, existing0046/0047 reuse, APIs/RLS,
  audit, governance/autonomy and acceptance; no new business-module implementation.
- `evidence/task24z-exit-gate/`:55f3548 exact-head five-job CI snapshot,
 15/15browser14.5s annotations and artifact13670730844 metadata. Supported
 download again fails signedblob EOF; manual visual review UNVERIFIED.
- Existing target design has a continuity appendix clarifying per-domain
 availability without changing approved D1–D5 or asserting phase reorder approval.

## TASK-PM-01D-M2 — import reliability, concurrency and atomicity

- `TASK-PM-01D-M2_IMPLEMENTATION.md`: source‌truth for the additive `0061` migration, atomic idempotency claim, per‌key advisory lock, transaction‌local batch outcome, deterministic retry boundary, safe replay of unknown outcomes, contract/client/UI changes and the 13‌item acceptance matrix.
- Native disposable PostgreSQL: strict 61‌migration up/down/up cycle, fresh `dms_app` grant probe, 2 focused import files / 22 tests, 10 Product Master DB‌backed files / 151 tests and 44 selected DB‌backed files / 957 tests PASS. Four spatial/password‌auth files were excluded locally because the sandbox uses a non‌spatial PostGIS replacement and trust auth; exact‌final‌SHA CI uses real `postgis/postgis:16-3.4`.
- DB‌free API unit 24 files / 332 tests; web 14 files / 79 tests; partition 73 files; OpenAPI 195 paths / 278 operations / 141 schemas / 3 webhooks; contract drift zero; root typecheck/build (55 pages) and `git diff --check` PASS.
- §E per‌batch all‌or‌nothing plus continuation is preserved. Whole‌file rollback remains an isolated owner decision. PM‌B1..PM‌B8 remain OPEN / NOT APPROVED; no domain membership, RBAC vocabulary, protected branch, deployment or merge action was added.

## TASK-PM-01D-M3 — Product CSV portability, capability assessment and owner boundary

- `TASK-PM-01D-M3_IMPLEMENTATION.md`: Persian-first implementation report with fresh baseline preservation, nine-capability evidence matrix, actual delivered workflow, whole-file decision status, import-reliability architecture findings, exact verification commands, security findings, completion estimate and recommended next module.
- `TASK-PM-01D-M3_WHOLE_FILE_ATOMICITY_OWNER_DECISION.md`: explicit OPEN / NOT APPROVED request distinguishing per-batch atomicity, whole-file atomicity, partial success and retry/recovery, with Q1–Q5 and the evidence required before any approval.
- `PRODUCT_MASTER_OPERATOR_GUIDE_FA.md`: Persian RTL operator guide for list/scan, CSV export, import, history, settings, lifecycle and failure handling.
- Code: `GET /api/v1/products/export`, repeatable-read read-only transaction, service-level `master.product.view` authorization, tenant RLS, resolved reference codes, primary barcode, spreadsheet-formula mitigation, bounded 10,000-row snapshot with explicit truncation headers, `audit_log` export event, generated TypeScript client and Persian RTL download button.
- Contracts: `npm run openapi:check` 196 paths / 279 operations / 141 schemas / 3 webhooks; `node scripts/contract-drift.mjs` zero; `node scripts/check-test-partition.mjs` 75 files.
- Focused tests (native disposable PostgreSQL, no shared/production DB): export unit + export DB + M2 import regressions 4 files / 30 tests PASS; selected Product Master/contract/RLS/history regressions 10 files / 230 tests PASS; DB-free API unit 25 files / 335 tests PASS; web 15 files / 82 tests PASS; root typecheck and build (55 pages) PASS; `git diff --check` PASS.
- Boundaries preserved: no behavior change to §E per-batch all-or-nothing plus continuation, no migration/BullMQ/queue/domain registry/RBAC vocabulary/production DB/merge/deploy. PM-B1..PM-B8 and whole-file atomicity remain OPEN / NOT APPROVED. Exact-final-SHA CI is recorded in PR #14 and the final report after push.
