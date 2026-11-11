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


## TASK-PM-01D-M4 — controlled bulk Product Master maintenance

- `TASK-PM-01D-M4_IMPLEMENTATION.md`: Persian-first source-of-truth report with baseline preservation, exact server-owned field whitelist, `0062` durable ledger, synchronous all-or-nothing transaction, strict preview/confirm/execute, replay/unknown reconciliation, 14-item acceptance matrix, security boundaries and precise verdicts.
- `PRODUCT_MASTER_OPERATOR_GUIDE_FA.md`: Persian RTL operator workflow for `/products/bulk-maintenance`, including permission gate, preview expiry, ineligible-selection warning, explicit confirmation, stable operation status and unknown-outcome handling.
- `evidence/task-pm-01d-m4/VERIFICATION.txt`: command/result ledger for local validation. Logs remain in `/tmp` and are not committed as generated artifacts.
- Code: four new `/products/bulk-maintenance` endpoints, `product_bulk_operation` ledger with forced tenant RLS and SELECT/INSERT/UPDATE-only runtime grants, strict `AuditService.recordRequired` for M4 only, `CatalogAccess.write` isolation/timeout options, `ProductRepository.update(..., client?)`, generated typed client and Persian RTL page/nav.
- Contracts: `npm run openapi:check` 200 paths / 283 operations / 153 schemas / 3 webhooks; `node scripts/contract-drift.mjs` 283/283/283 diff 0; `node scripts/check-test-partition.mjs` 77 files.
- Local tests (native disposable PostgreSQL, no shared/production DB): 26 DB-free API files / 338 tests; M4 unit 3/3; M4 DB API 11/11; selected Product Master/contract/RLS/history 12 files / 244 tests; broad local selection 44 files / 925 tests; web 17 files / 88 tests; migrations-security 3/3; strict 62-migration up/down/up with 1013 identical objects in both up passes; root typecheck and build (56 pages) PASS.
- A broader 47-file local DB run had 44 passed files / 970 passed tests and 12 failures: 10 in `task24w`/`task24y` and 2 in `attachments.api`. The same 10 `task24w`/`task24y` failures were reproduced in an isolated worktree at exact baseline `8509255`; their root cause is the pre-existing UTC-vs-business-date window described below, not an M4 regression. The 2 `attachments` failures are the missing MinIO service locally; attachments passed in exact CI. Four real-PostGIS/password-auth files were excluded locally; exact-final-SHA CI uses real services.
- CI at the first M4 push SHA `975c12f` (run `42709786143`, job `129475954785`) was red only in those two legacy files: 2 failed / 48 passed files and 10 failed / 1043 passed tests. Root cause: they computed `TODAY` / `order_date` with UTC `new Date().toISOString().slice(0,10)` while the server uses `businessToday()` (Asia/Tehran); between 20:30–24:00 UTC documents were treated as backdated. The run started 22:12 UTC. M3 baseline CI at `8509255` was green earlier (19:45 UTC) and could not be rerun. Follow-up fix changed only those two test files to use `businessToday` / `shiftBusinessDate`; no production source, migration, workflow or `.github` change. Local re-run inside the same window: targeted 2 files / 48 tests PASS and CI-equivalent 46 DB-backed files / 973 tests PASS; the full 50-file local run had 17 failures confined to four real-PostGIS/password-auth files that passed in exact CI at `975c12f`.
- Boundaries preserved: §E per-batch import all-or-nothing plus continuation, whole-file owner decision, PM-B1..PM-B8, `0060` immutable history, `0061` import reliability, no new RBAC/domain vocabulary, no BullMQ/queue/worker, no merge/deploy and no production/shared DB change. Independent milestone **PASS WITH FINDINGS**; full Product Master/domain acceptance **BLOCKED**. Exact-final-SHA CI outcome (including the follow-up test-fix SHA) is recorded in PR #14 body and the final report; local evidence alone is not a CI-equivalence claim.


## TASK-PM-01D-M4-F — remediation of bulk reconciliation, runtime audit partitioning and production-role security

- `TASK-PM-01D-M4-F_IMPLEMENTATION.md`: Persian source-of-truth report for the F remediation of the read-only `M4-R` `FAIL` verdict. It separates code inspection, static checks, real disposable-DB execution and real least-privilege `dms_app` connection evidence; keeps `BLOCKED`/`UNVERIFIED` boundaries explicit; and does not claim independent review.
- `TASK-PM-01D-M4-F_INDEPENDENT_REVIEW_REQUEST.md`: prepared, **not executed**, focused independent read-only review request. R's `FAIL` verdict remains until that independent review is completed.
- `evidence/task-pm-01d-m4-f/VERIFICATION.txt`: exact local command/result ledger and `/tmp` log paths; exact-final-SHA CI is recorded in PR #14 body, not as a self-referential hash inside the repository.
- Code: additive `0063_product_bulk_evidence` columns/table/triggers/RLS/grants, guarded `0062`/`0063` down migrations, operation-bound reconciliation, `AuditPartitionMissingError` with no runtime DDL, read-only `GET /operations/{id}`, explicit `POST /operations/{id}/reconcile`, constant-time token comparison, company+operation advisory lock and transaction-local `app.bulk_operation_id`.
- Contracts: `npm run openapi:check` 201 paths / 284 operations / 153 schemas / 3 webhooks; `node scripts/contract-drift.mjs` 284/284/284 diff 0; `node scripts/check-test-partition.mjs` 78 files; generated client `schema.ts` +49/−4.
- Local validation: 63-migration up/down/up with exactly 1029 identical objects; focused 4 files / 32 tests PASS; migrations-security 6/6; selected DB-backed 47 files / 987 tests PASS; DB-free API unit 26 files / 339 tests PASS; web 17 files / 88 tests PASS; root typecheck/build/OpenAPI/drift/partition/diffcheck PASS.
- Production-role suite: 11/11 PASS on an isolated disposable DB with a real `dms_app` TCP runtime (`APP_DATABASE_URL`), not superuser and not `SET ROLE` only. Verified no CREATE/DDL, no evidence INSERT/DELETE, forced RLS, fail-closed tenant GUCs, non-forgeable operation-bound evidence, explicit reconciliation, accepted-ledger durability and missing-partition atomic rollback. Local trust auth is disclosed; CI uses real PostGIS/password services.
- Boundaries preserved: PR #14 remains OPEN / DRAFT; no merge/approve/release/deploy, production/shared DB change, owner decision, domain registry, RBAC vocabulary, queue/worker, import semantics change, `0060`/`0061` rewrite, broad grant, external archive or new `SECURITY DEFINER` function. PM-B1..PM-B8 and whole-file atomicity remain OPEN / NOT APPROVED; overall Product Master acceptance remains BLOCKED; independent focused F review remains UNVERIFIED.

## TASK-PM-01D-M4-G — migration race elimination and audit partition recovery

- `TASK-PM-01D-M4-G_IMPLEMENTATION.md`: Persian source-of-truth for the G implementation + self-assessment. Documents exact baseline `74e71172055d6cad482305db1834300c62fb53f5`, recoverable `/tmp/pm01dm4g-backup*` preservation, F-R-01 root cause (guard-before-lock TOCTOU), lock-first/fail-closed `0062`/`0063` down migrations, F-R-02 measured PostgreSQL ownership model, `0064` invoker/pinned-search_path/least-privilege recovery, M2/M3/M4 regression evidence and `UNVERIFIED` boundaries. Exact final SHA and CI IDs are recorded in PR #14 body, not as a self-referential hash inside the repo.
- `TASK-PM-01D-M4-G_INDEPENDENT_REVIEW_REQUEST.md`: prepared, **not executed**, read-only independent review request. It specifically requires retrying the original F-R-01 widened-window exploit against the final SQL and verifying F-R-02 with real TCP PG connection identities (no `SET ROLE`, no superuser substitute). It must not modify the repo, approve/merge/deploy, change infrastructure, or block unrelated development. `R = FAIL` and `F-R = FAIL` remain unchanged until that review resolves both findings.
- `evidence/task-pm-01d-m4-g/VERIFICATION.txt`: exact local command/result ledger, `/tmp/pm01dm4g-*.log` paths, disposable-DB isolation proof, failed-run triage, exact `0064.down` catalog mismatch/fix and final executed counts. Logs are not committed as generated artifacts.
- Code: rewritten `migrations/0062_product_bulk_maintenance.down.sql` and `migrations/0063_product_bulk_evidence.down.sql` acquire `ACCESS EXCLUSIVE` locks in the fixed order `product_bulk_operation → product_catalog_history → product_bulk_history_event → audit_log` before fail-closed guards; new `migrations/0064_audit_partition_recovery.{up,down}.sql` hardens `fn_ensure_partitions` (SECURITY INVOKER, pinned `search_path`, owner/CREATE precondition, EXECUTE revoked from PUBLIC/`dms_app`/`dms_readonly`/`dms_migrator`/`dms_owner`, explicit per-partition RLS/policies/grants) and restores the exact post-`0042` catalog state on down; updated operator error text and privilege/deploy docs.
- Mandatory deterministic suites: `apps/api/test/migration-rollback-race.test.ts` (8/8, independent connections, explicit witness ordering, A–G) and `apps/api/test/audit-partition-recovery.api.test.ts` (7/7, real TCP role identities, owner recovery, 3 historical audit rows preserved, idempotent retry). `apps/api/test/migrations-security.test.ts` gained an isolated-DB exact-catalog test for `0064.down`/reapply (8/8 total). `apps/api/test/db-backed-tests.txt` and CI comments were updated for the new non-api DB suite.
- Final local validation: 64-migration up/down/up with exactly 1029 identical objects; focused 6 files / 49 tests; DB-free API unit 26 files / 339 tests; web 17 files / 88 tests; selected DB-backed 49 files / 1004 tests; OpenAPI 201/284/153/3, contract drift zero, partition 80 files, root typecheck/build and `git diff --check` PASS. Local PG16.2 trust auth and missing real PostGIS/Redis are disclosed; four real-PostGIS/password-auth files were excluded locally and covered by exact-final-SHA CI.
- Boundaries preserved: PR #14 OPEN / DRAFT; no approve/merge/release/deploy, production/shared DB change, production role/secret change, owner decision, PM-B1..PM-B8 change, whole-file atomicity, domain registry, queue/worker, external archive, broad grant, new `SECURITY DEFINER` to bypass ownership, `pg_sleep`/test hook in real migration SQL, or change to `0060`/`0061`/`0041`/`0019`/`0042`. Overall Product Master/domain acceptance remains BLOCKED; both F-R-01 and F-R-02 are technically `PASS WITH FINDINGS` in self-assessment but `UNVERIFIED` for final acceptance until independent review.


## TASK-PM-01D-M4-H — operational documentation reconciliation and M4 acceptance readiness

- `TASK-PM-01D-M4-H_IMPLEMENTATION.md`: Persian source-of-truth for the four Agent-2 G-R LOW findings (H-01..H-04). It records the exact baseline `2e6d2711cb2a8b1f60b8c39b87eeb3f3a13a295c`, the recoverable exact-SHA backup, the preserved historical records, the explicit `dms_owner`/`dms_migrator`/`DATABASE_URL` catalogue model, the supported `fn_ensure_partitions(2)` owner runbook, the reverse-dependency rollback order and the deliberately untouched protected migration files. Exact final SHA is recorded in PR #14 head and the final chat report, not as a self-referential hash inside the repository.
- `evidence/task-pm-01d-m4-h/VERIFICATION.txt`: exact commands, exit codes, disposable-DB names, SQL outputs, failed-environment triage and cross-document scan results. Raw logs remain in `/tmp/pm01dm4h-*.log` / `/tmp/pm01dm4h-*-summary.txt`; the durable source of truth is the pushed branch commit.
- Stage 1 `12b80451ab69de72b2bf4039324a015ff794c472` (3 files) fixed the doubled-quote ownership SQL and replaced the obsolete Persian migration-role recovery instruction. Stage 2 `95bd63ac3184445fe616783ae9f1d4be45ace550` (12 files) reconciled security-report ownership claims, labelled historical architecture/runtime wording, clarified `0063.down` before `0062.down`, and preserved all protected migration SQL. Later stage commits add this index, the H report, the verification ledger and the final scan result.
- Validation: `git diff --check`, `npm run openapi:check` (201/284/153/3), `node scripts/contract-drift.mjs` (0), `node scripts/check-test-partition.mjs` (80 files), root `npm run typecheck`, `node scripts/test-migrations.mjs` (64 up/down/up, 1029 identical objects), and focused Vitest `migration-rollback-race.test.ts` + `migrations-security.test.ts` (2 files / 16 tests) all PASS. The exact H-01 ownership command returned `postgres` on an isolated DB; the historic doubled-quote form failed with `syntax error at or near "public"`. Two idempotent `select fn_ensure_partitions(2);` calls restored an empty future partition, kept 1 historical audit row, and preserved RLS/policies/grants while `dms_app`/`dms_migrator`/`dms_owner` had no EXECUTE. Direct `0062.down` with `0063` applied failed closed (exit 3, two dependent policies); standard `0063.down -> 0062.down` then succeeded.
- Boundaries preserved: PR #14 OPEN / DRAFT and PR body unchanged; no approve/merge/release/deploy, production/shared DB change, production role/secret change, owner decision, new architecture, permission expansion, runtime authorization logic change, `pg_sleep`/test hook in repository SQL, or edit to `0062.down`, `0063.down`, `0064.up/down`, `0041`, `0019`, `0042`. `R = FAIL`, `F-R = FAIL`, PM-B1..PM-B8, whole-file atomicity and Product Master acceptance remain OPEN / NOT APPROVED / BLOCKED. M4 technical and domain acceptance remain `UNVERIFIED` / `BLOCKED`; H improves documentation consistency but does **not** claim full M4 acceptance.

## TASK-PM-01D-M4-I — evidence-based M4 acceptance closure (authoritative reconciliation)

- `M4_ACCEPTANCE_MATRIX.md`: current authoritative A–D matrix and historical/current status ledger. Current rows use only `PASS`, `FAIL`, `UNVERIFIED`, or `NOT APPLICABLE`; historical labels `FAIL`, `PASS WITH FINDINGS`, `VERIFIED SAFE`, `BLOCKED`, `PARTIAL`, and `OPEN / NOT APPROVED` are quoted and preserved with exact source SHAs. It supersedes the 14-item M4 §7 matrix as a current acceptance posture but does not rewrite that historical report.
- `TASK-PM-01D-M4-I_IMPLEMENTATION.md`: I implementation/audit report, exact baseline `8c40105f8c5b38660a605078207ac5bd90215359`, Stage A `ce34fdcd738240025fb4f8c801da1a948eb98108`, source-SHA chain, F-R-03/04 implementation, validation, residual gates and readiness. Exact final I SHA and exact final-SHA CI run IDs are recorded in PR #14 body and the final chat report, not as a self-referential hash in this tree.
- `evidence/task-pm-01d-m4-i/VERIFICATION.txt` and `evidence/task-pm-01d-m4-i/VERIFICATION.json`: durable exact command/result and structured source-SHA/verdict/CI ledgers. Raw `/tmp/pm01dm4i-*` logs remain non-durable; these files preserve the G-R narrow review result, exact H and Stage A CI run IDs, and the contradiction resolution.
- Reconciliation of preserved historical contradictions: earlier F/G/H index entries that say `R = FAIL`, `F-R = FAIL`, the G independent review request was “not executed”, and Product Master acceptance is `BLOCKED` are preserved as historical records at their own SHAs. G-R was later executed as a narrow independent read-only review at exact SHA `2e6d2711cb2a8b1f60b8c39b87eeb3f3a13a295c`: F-R-01/F-R-02 `VERIFIED SAFE`, M4-G technical acceptance `UNVERIFIED`, production topology `UNVERIFIED`, Product Master `BLOCKED`, overall `PASS WITH FINDINGS` with 4 LOW caveats. I separates historical aggregate verdict, implementation status, independent verification, exact SHA and scope; it does not erase old verdicts or promote G-R to aggregate M4 acceptance. H documenting a finding correctly is not treated as resolving it.
- Stage A `ce34fdcd738240025fb4f8c801da1a948eb98108` (6 files, +593/−2) closed F-R-03 with `scripts/cleanup-expired-bulk-previews.mjs` (explicit owner DB URL, single tenant UUID, ISO cutoff, dry-run default, `--apply`, no scheduler/queue/runtime grant/`SECURITY DEFINER`/protected SQL edit), `product-bulk-preview-cleanup.test.ts` (5 disposable-PG tests), the DB-backed manifest entry and operator guide §۴-ب. It closed F-R-04 with a direct viewer POST reconcile 403/401 test asserting unchanged ledger, zero evidence/audit rows, unchanged versions and `reconciled:false`. It also fixed the three H non-ZWNJ spellings in `PRODUCTION_DEPLOYMENT.md`.
- Validation: focused Vitest 2 files / 17 tests; static checks (OpenAPI 201/284/153/3, drift 0, partition 81, root typecheck, diffcheck); 64-migration up/down/up with 1029 identical objects; M4 regression 7 files / 117 tests; full local API unit 26 files / 339 tests, web 17 files / 88 tests and root build all PASS. Local PG16.2 trust-auth limitations and Redis/PG teardown notices are disclosed, not treated as CI-equivalent. All four exact G-R original `dms_*` SCRAM hashes were restored, equality-verified and left NOLOGIN.
- Exact-SHA CI: H `8c40105...` 8/8 check-runs + 4/4 workflow runs success (CI `42852806525`, e2e `42852806522`, release-image `42852806482`, migrations `42852806515`); Stage A `ce34fdc...` 9/9 check-runs + 5/5 workflow runs success (push migrations `42856944161`, PR CI `42856956874`, release-image `42856956995`, e2e `42856957000`, migrations `42856957011`). `gh pr checks 14` and `gh pr checks 14 --watch -i 15` both EXIT=0. No workflow was edited or rerun to manufacture green; status is never transferred to another SHA.
- Current mandatory M4 A/B rows are `PASS`, but the independent full read-only re-audit of all seven original R findings at the final SHA (R-AGG) is `UNVERIFIED`; exact missing evidence is the re-audit with commands/results plus production topology/owner authorization. Therefore aggregate M4 readiness is `UNVERIFIED`, not `PASS`. Production topology, S3/MinIO production grade, manual RTL/a11y/console review, network/ACK/pool/`ACCESS EXCLUSIVE` operational impact, external archive and retention/scheduling remain `UNVERIFIED`.
- Boundaries preserved: PR #14 OPEN / DRAFT; no approve/merge/release/deploy, production/shared DB/config change, CI trigger change, protected migration/SQL edit, runtime grant expansion, owner decision, domain registry, queue/worker, external archive, or new `SECURITY DEFINER`. G-03 `PARTIAL / VERIFIED=NO`, PM-B1..PM-B8 `OPEN / NOT APPROVED`, whole-file atomicity Q1–Q5 `OPEN / NOT APPROVED` and full Product Master acceptance `BLOCKED` remain separate from M4. Readiness is evidence assessment only, not authorization.

## TASK-PM-01D-M4-J — independent read-only final M4 acceptance review (durable copy)

- `evidence/task-pm-01d-m4-j/INDEPENDENT_REVIEW.md`: durable repository copy of the **complete Agent-2 chat report supplied by the project owner**, reproduced in full after a K metadata wrapper. Only trailing Markdown hard-break spaces were normalized for `git diff --check`; no report content changed. Classification: **independent review**, **read-only**, exact target SHA `39355a377fe66f3fd8c2bae996c8ec92211bd4db`, overall verdict `PASS WITH FINDINGS`, **M4 technical scope only**, Product Master `BLOCKED`, production deployment `NOT AUTHORIZED`. The wrapper and report preserve the limitation that the original R report was chat-only and that the seven finding IDs/groupings `R-REC-01`…`R-REC-07` were reconstructed from available evidence; they are not represented as original IDs.
- `evidence/task-pm-01d-m4-j/REVIEW_METADATA.json`: structured independent-review metadata, exact SHA, verdicts, scope boundaries and preserved limitations.
- Exact-SHA CI independently re-queried by J: 8/8 check-runs and 4/4 workflow runs `completed / success` at `head_sha=39355a377fe66f3fd8c2bae996c8ec92211bd4db`. Workflow runs `42859214454`, `42859214511`, `42859214519`, `42859215185`; check-run/job IDs `129980469451`, `129980470263`, `129980472444`, `129980472808`, `129980472963`, `129980473065`, `129980473154`, `129980481452`.
- J limitations preserved: raw per-test CI log counts could not be independently retrieved because the external blob log returned EOF; local PG16.2 trust-auth is not CI- or production-equivalent; exact production topology/object owner/operator authorization remains `UNVERIFIED`. J performed no repository writes, no PR metadata writes, no CI configuration writes, no approval/merge/release/deploy, no production access, and no role/grant/secret/config change.

## TASK-PM-01D-M4-K — final acceptance ledger reconciliation

- `TASK-PM-01D-M4-K_IMPLEMENTATION.md`: dated K reconciliation report. Required starting SHA `39355a377fe66f3fd8c2bae996c8ec92211bd4db`; branch `arena/be5eaff3-green-dms`; PR #14 remains `OPEN / DRAFT`. K final commit SHA and exact final-SHA CI IDs are recorded in PR #14 body and the final chat report, not as a self-referential hash in this tree.
- `evidence/task-pm-01d-m4-k/VERIFICATION.txt` and `VERIFICATION.json`: durable K command/result and structured current-state ledger. Earlier `evidence/task-pm-01d-m4-i/VERIFICATION.*` files remain unchanged as historical I records.
- `M4_ACCEPTANCE_MATRIX.md` §8 is the **current authoritative acceptance state**; §§1–7 and the I readiness line are preserved as historical I records. R-AGG remains a mandatory M4 acceptance evidence row and is not silently removed. §8 explicitly separates (A) current isolated M4 technical correctness `PASS WITH FINDINGS`, (B) historical evidence completeness `UNVERIFIED`, and (C) production topology/operational authorization `UNVERIFIED` / `NOT AUTHORIZED`.
- Scope-resolution source references recorded in §8: `TASK-PM-01D-M4_IMPLEMENTATION.md:199-210`, `GAP_REGISTER.md:220-227`, `PRODUCT_MASTER_TARGET_DESIGN.md:288-299`, `TASK-PM-01D-M4-F_INDEPENDENT_REVIEW_REQUEST.md:75-81`, `TASK-PM-01D-M4-I_IMPLEMENTATION.md:7`, and `M4_ACCEPTANCE_MATRIX.md:64-84`. These establish production topology/operator authorization as separate production-release gates and exact original R IDs as historical-evidence completeness, not current-code M4 technical prerequisites. No owner approval or approval decision is invented.
- A-20 now cites exact SHA `39355a377fe66f3fd8c2bae996c8ec92211bd4db`, the 8/8 check-runs, 4/4 workflow runs, exact workflow/check-run IDs, and the independent J review. It also records the raw per-test CI log and local trust-auth limitations.
- Factual correction: `TASK-PM-01D-M4-I_IMPLEMENTATION.md:40` now says the earlier prose incorrectly named `created_at` as the cleanup filter; the tool filters by the explicit `expires_at` cutoff, matching `scripts/cleanup-expired-bulk-previews.mjs:111-132`, and `created_at` is not that filter. Historical I verdict text is unchanged.
- Current final verdicts: **M4 TECHNICAL ACCEPTANCE: PASS WITH FINDINGS**; **PRODUCT MASTER ACCEPTANCE: BLOCKED**; **PRODUCTION DEPLOYMENT: NOT AUTHORIZED**. Historical R `FAIL`, F-R `FAIL`, G-R narrow `VERIFIED SAFE`, H `PASS WITH FINDINGS` and I `UNVERIFIED` are preserved.
- Validation: documentation, evidence-index, link/path, JSON and consistency checks only. No DB-backed suite was rerun, no database roles were altered, and no application code, migration, grant, authorization, secret, production configuration, CI configuration, approval, merge, release, deployment, or PR readiness change was made.

## TASK-PM-02 — مرز سروریشدهٔ مرکزی/دامنهای و نمای صریح scope (PM-02-B1)

- `TASK-PM-02_IMPLEMENTATION_MAP.md`: نقشهٔ کوتاه و کدمحور پیش از پیادهسازی — آنچه وجود دارد و کار میکند (هویت مرکزی، D1–D5، D4، تاریخچهٔ ۰۰۶۰، import/export/bulk، RBAC/RLS/audit، مرز ۴۰۰/۵۰۳، صفحات فارسی)، آنچه نیمه است (G-03،D4/جدایی، UI دامنه)، آنچه در کد فعلی غایب است (بدون رجیستری/عضویت/RLS دامنهای/ارائهدهنده)، آنچه با تصمیم مالک BLOCKED است، و آنچه با الزامات مصوب قابل انجام است. هیچ شکاف مستندی بدون بررسی کد «باقیمانده» فرض نشد؛ کار M4 تکرار نشد و احکام تاریخی M4 تغییر نکرد.
- `TASK-PM-02_OWNER_DECISION_REGISTER.md`: ثبت فشردهٔ PM-B1..PM-B8 و Q1..Q5 با پرسش دقیق، تفسیر مستند فعلی، گزینهها، پیامدها، توصیه (فقط مشاوره) و پاسخ صریح «آیا پیادهسازی میتواند ادامه یابد؟»؛ بهعلاوه بررسی دقیق G-03/دونفره: تنها اقدام عینی دونفره `POST /pricing/margin-exceptions/{id}/decision` با قید `ck_margin_exception_second_person` و `403 second_person_required` است، گردش عمومی `self_approval_forbidden`/`requester_identity_missing`/`entity_creator_identity_missing` را اعمال میکند، هویتها از نشست و `approval_step_def` میآیند، زیرساخت برای قیمت/سفارش وجود دارد ولی **هیچ binding دونفره برای Product Master وجود ندارد**؛ `RBAC + confirm_sensitive + audit` همچنان کنترل مصوب D4/M-5 است. هیچ معنای دونفره تضعیف، دورزده یا ساخته نشد.
- `TASK-PM-02_IMPLEMENTATION.md`: گزارش بادوام با SHA مبنا `c382d6a822fdf52b711f168f1778443a70194a24`، SHA نهایی و CI دقیق همان SHA در بدنهٔ PR #14 و گزارش نهایی چت (قرارداد خودارجاعی مخزن)، قابلیت دقیق، فهرست کامل فایلها/عدم مهاجرت، تصمیمات معماری، رفتار API/UI، نتایج واقعی تستها، تصمیمات باقیمانده، محدودیتها و یک گام بعدی پیشنهادی.
- `evidence/task-pm-02/VERIFICATION.txt` و `VERIFICATION.json`: دفتر دقیق فرمان/نتیجهٔ محلی، پشتیبان قابل راستیآزمایی `/home/user/pm02-backup.tar.gz` با sha256 `3deb84dd66de0f250e22a3d6886d095e538133e4cc95a30a70d49737cd69ebc2`، محدودیت PostgreSQL محلی trust-auth و نبود Redis.
- کد جدید: `product-domain-boundary.ts` (قرارداد خالص و اسکن فقط کلیدها، فارسی/انگلیسی، سقفدار)، `domain-boundary.guard.ts` (نگهبان پیش از pipe، ممیزی با GUCهای transaction-local)، `product-domain-scope.service.ts` / `.controller.ts` (نمای خواندنی مرکزی با `available:false` و سه فیلد `unresolved`). سیمکشی در `product.controller.ts`، `product-import.controller.ts` و `master-data.module.ts`؛ `OPERATIONAL_DOMAIN_AUTHORITY` همچنان ثبت نشده است.
- قرارداد/کلاینت/UI: مسیر `GET /products/{id}/domain-scope` و اسکیمای `ProductDomainScope` در OpenAPI (۲۰۲ مسیر / ۲۸۵ عملیات / ۱۵۴ اسکیما / ۳ وب هوک)، کدهای `domain_property_rejected` و `domain_context_not_supported`، کلاینت تولیدشدهٔ `schema.ts` (+۹۲ خط)، سه صفحهٔ فارسی RTL (تب دامنهٔ جزئیات کالا، صفحهٔ تصمیمهای دامنه، یادداشت صفحهٔ import). هیچ کنترل عضویت/فعالسازی ساختگی اضافه نشد.
- تستها: واحد خالص ۷/۷، نگهبان ۸/۸، نمای scope ۹/۹ (مجموع ۲۴ بیداده)، HTTP بومی روی PostgreSQL ۱۶.۲ یکبارمصرف ۱۲/۱۲ (شامل رد `domain_id` بدون اثر، سرستون فارسی/انگلیسی، `x-domain-id` ۴۰۰، بیننده ۴۰۳، کالای شرکت دیگر ۴۰۴، ردیف `audit_log` بدون مقدار خام)، وب ۹۴/۹۴ (۱۸ فایل)، واحد API بیداده ۳۶۳/۳۶۳ (۲۹ فایل)، ۶۴ مهاجرت up/down/up با دقیقاً ۱۰۲۹ شیء یکسان، typecheck/OpenAPI/drift/partition/root build/`git diff --check` همگی PASS.
- مرزها: بدون مهاجرت، جدول دامنه، گرانت/RLS/نقش/seed تازه، ارائهدهنده، مجوز دامنهای، عضویت، lifecycle، backfill، cutover، تغییر §E، تغییر G-03/D4، تغییر D1–D5، تغییر ۰۰۶۰..۰۰۶۴، تغییر پیکربندی CI، تغییر آمادگی PR، merge/approve/release/deploy یا دسترسی به DB/زیرساخت/secret تولید. PM-B1..PM-B8 و Q1..Q5 همچنان `OPEN / NOT APPROVED`؛ پذیرش کامل Product Master `BLOCKED`؛ استقرار تولید `NOT AUTHORIZED`.
- بهروزرسانی همراستا: `PRODUCT_MASTER_TARGET_DESIGN.md` (پیوست TASK-PM-02) و `TASK-PM-01_PRODUCT_MASTER_SPEC.md` §12. `M4_ACCEPTANCE_MATRIX.md` و سایر اسناد M4 دستنخورده ماندند.

---

## TASK-PM-02-B2 — بستهٔ تصمیم مالک و همسانی سطوح خواندنی مرکزی

- `TASK-PM-02-B2_OWNER_DECISION_PACKAGE.md`: بستهٔ فشردهٔ درخواست تصمیم برای سه
  گلوگاه PM-B1 (هویت دامنه)، PM-B2 (چرخهٔ حیات) و PM-B4 (اختیار/انتساب)؛ پرسش
  دقیق، گزینهها، توصیهٔ فقطمشاورهای، پیامدها، فهرست دقیق عناصر مسدود (رجیستری،
  مهاجرت، FK، نگاشت/backfill، ماشین حالت، ماتریس اختیار، انتساب، مجوزها، RLS،
  API/UI دامنهای)، شواهد پذیرش، قالب جدول هفتستونی امضاشده، شواهد دروازهٔ بسته،
  و احکام PASS/FAIL/UNVERIFIED/BLOCKED. وضعیت همهٔ تصمیمها `OPEN / NOT APPROVED`.
- `evidence/task-pm-02/VERIFICATION-B2.txt` و `VERIFICATION-B2.json`: دفتر
  فرمان/نتیجهٔ محلی B2، پشتیبان `/home/user/pm02-b2-backup.tar.gz` با sha256
  `0ae60fac33f3a6f35e25f35834ba745586af6fa9316577bfdb35a981857540e8`، و اثبات
  اینکه ۴ فایل/۱۷ تست ناکام محیطی (PostGIS/trust-auth) عیناً روی مبنای دستنخورده
  نیز ناکاماند و رگرسیون B2 نیستند.
- کد تغییریافته (فقط-parity، بدون معنای دامنهای): `product.controller.ts`
  (`list`/`get`)، `product-export.controller.ts` (`export`)،
  `product-import.controller.ts` (`report/:id`) همگی `@UseGuards(DomainBoundaryGuard)`
  گرفتند؛ ترتیب `AuthGuard, PermissionsGuard` پیش از نگهبان مرز حفظ شد. مسیرهای
  `CatalogFoundationController` که `@Headers("x-domain-id")` میخوانند بدون نگهبان
  ماندند؛ `OPERATIONAL_DOMAIN_AUTHORITY` همچنان ثبت نشده است.
- قرارداد/کلاینت: `openapi.yaml` خطای `400` روی `GET /products/import/report/{id}`
  و توضیح مرز B2 در `Error.code`؛ `packages/api-client/src/schema.ts` با
  openapi-typescript ۷٫۱۳٫۰ بازتولید شد (تولید قطعی، ۱۲+/۱− خط). شمارشها بدون
  تغییر: ۲۰۲ مسیر / ۲۸۵ عملیات / ۱۵۴ اسکیما / ۳ وب هوک.
- تستهای نو: `product-domain-boundary-guard.test.ts` (+۶ مورد خواندنی بیداده)،
  `product-domain-boundary-read-parity.test.ts` (جدید، ۴ مورد ساختاری بیداده:
  پوشش ۵ handler، ترتیب نگهبانها، نبود رد سراسری مسیرهای زمینهٔ دامنه، نبود
  ارائهدهنده)، `product-domain-boundary.api.test.ts` (+۷ مورد HTTP واقعی).
  نتایج محلی: واحد بیدادهٔ متمرکز ۳/۲۵، پارتیشن کامل بیداده ۳۰/۳۷۳، وب ۱۸/۹۴،
  مرز HTTP بومی ۱/۱۹، رگرسیون هدفمند DB ۷/۱۴۶، مهاجرت up/down/up دقیقاً ۱۰۲۹
  شیء یکسان، typecheck/OpenAPI/drift/partition/root build/`git diff --check`
  همگی PASS. اجرای کامل DB ۵۱/۵۵ فایل و ۱۰۹۲/۱۱۰۹ تست؛ ۴ فایل/۱۷ تست ناکام
  (`customers`/`geofences`/`tours`/`postgres-init-role`) عیناً روی مبنای
  `dad4ce8…` بازتولید شدند ← محدودیت محیط محلی، نه رگرسیون.
- بهروزرسانی همراستا: `TASK-PM-02_OWNER_DECISION_REGISTER.md` §5،
  `PRODUCT_MASTER_TARGET_DESIGN.md` پیوست B2، `TASK-PM-02_IMPLEMENTATION.md` §9.
  اسناد M4 و `M4_ACCEPTANCE_MATRIX.md` دستنخورده ماندند. PM-B1..PM-B8 و Q1..Q5
  `OPEN / NOT APPROVED`؛ پذیرش کامل `BLOCKED`؛ استقرار تولید `NOT AUTHORIZED`؛
  PR #14 `OPEN / DRAFT`؛ بدون merge/approve/release/deploy.

---

## TASK-PM-02-C1 — مرکز تصاویر و اسناد کالا (شواهد تازه)

- گزارش اصلی: `TASK-PM-02-C1_IMPLEMENTATION.md`؛ کارنامهٔ دروازهها:
  `VERIFICATION-C1.txt` / `VERIFICATION-C1.json` (۲۰ دروازه با نتیجه و شاهد).
- کد: `apps/api/src/modules/master-data/product-media.{rules,service,controller}.ts`،
  `apps/api/src/modules/master-data/master-data.module.ts`،
  `apps/api/src/modules/attachments/{attachments.module,attachments.service}.ts`،
  `apps/web/src/app/products/[id]/{product-media.tsx,product-media.test.tsx,page.tsx}`،
  `apps/web/src/lib/api.ts`، `packages/contracts/openapi.yaml`،
  `packages/api-client/src/schema.ts`.
- تستها: `apps/api/test/product-media-rules.test.ts` (۹، بیداده)،
  `apps/api/test/product-media.api.test.ts` (۸، HTTP واقعی + PostgreSQL بومی)،
  `apps/web/src/app/products/[id]/product-media.test.tsx` (۷، jsdom).
- نتایج: واحد قواعد ۹/۹؛ ترکیب C1 بکاند ۲ فایل/۱۷ تست؛ واحد بیدادهٔ کامل API
  ۳۱ فایل/۳۸۲ تست؛ وب ۱۹ فایل/۱۰۱ تست؛ `npm run typecheck` و `npm run build -w apps/web`
  سبز؛ OpenAPI ۲۰۴ مسیر/۲۸۸ عملیات/۱۵۶ اسکیما/۳ webhook؛ drift=۰؛ پارتیشن تست ۸۸ فایل
  declared==computed؛ `git diff --check` صفر. **بدون مهاجرت تازه**.
- مرز: `DomainBoundaryGuard` روی ۳ مسیر تازه؛ `x-domain-id` و `?available=true` در تست
  HTTP بهترتیب `domain_context_not_supported` و `domain_property_rejected` (۴۰۰) دادند.
  PM-B1..PM-B8 / Q1..Q5 / G-03 و پذیرش کامل `BLOCKED`؛ PR #14 `OPEN / DRAFT`؛
  CI روی SHA نهایی تا اجرای واقعی `UNVERIFIED / PENDING`.


---

## TASK-PM-02-C2 — مدیریت دادههای مرجع کالا (شواهد تازه)

- گزارش اصلی: `TASK-PM-02-C2_IMPLEMENTATION.md`؛ کارنامهٔ ۳۰ دروازه:
  `VERIFICATION-C2.txt` / `VERIFICATION-C2.json`؛ شاهد زندهٔ همانمبدأ:
  `evidence/task-pm-02/VERIFICATION-C2-LIVE.txt`.
- کد: `migrations/0065_reference_data_admin.{up,down}.sql`،
  `reference-data.{rules,repository,service,controller}.ts`، سیمکشی
  `master-data.module.ts`، `product.repository.ts` / `product.service.ts`،
  `packages/contracts/openapi.yaml`، `packages/api-client/src/schema.ts`،
  `apps/web/src/app/products/reference-data/*`، صفحات `products`/`new`/`[id]`/
  `settings` و `products-lib.ts`.
- تستها: `reference-data-rules.test.ts` (۷)، `reference-data.api.test.ts` (۹)،
  `reference-data-lib.test.ts` (۶)، `reference-selectors.test.tsx` (۴)،
  `page.test.tsx` (۷)، بهروزرسانی آگاهانهٔ `migrations-security.test.ts` و نگهبان
  `setup-pg-guard.ts`.
- نتایج: متمرکز بکاند ۱۶/۱۶؛ متمرکز وب ۱۷/۱۷؛ وب کامل ۲۲/۱۱۸؛ واحد بیدادهٔ API
  ۳۲/۳۸۹؛ قرارداد اجراشده ۸۰/۸۰؛ OpenAPI ۲۱۱/۳۰۴/۱۷۴/۳ و drift=۰؛ کلاینت +۷۲۶؛
  typecheck/build ریشه؛ پارتیشن ۹۰ فایل؛ diffcheck صفر؛ مهاجرت up/down/up با
  ۱۰۳۳ شیء یکسان؛ اجرای کامل DB ۸۵/۹۰ فایل و ۱۵۰۵/۱۵۲۴ تست با کنترل مبنای
  `aa0028a…` عیناً همان ۵/۱۹ شکست محیطی (`identical=True`).
- مرز: `DomainBoundaryGuard` و رد `x-domain-id` / بدنه/پارامتر ناشناخته؛ بدون
  مجوز/نقش/seed/RLS/grant/دامنه تازه؛ PM-B1..PM-B8 / Q1..Q5 / G-03 و پذیرش
  کامل `BLOCKED`؛ استقرار `NOT AUTHORIZED`؛ PR #14 `OPEN / DRAFT`.
- همسنجی: عبارت «برند/UOM … BLOCKED» در C1 محدودهٔ همان کامیت بود، نه تصمیم
  مالک؛ پیوستهای C2 در پنج سند بالادستی/گزارش/ثبت مالک/شکافها/شاخص شواهد و
  راهنمای اپراتور بهصورت افزودنی ثبت شدند. `M4_ACCEPTANCE_MATRIX.md` و احکام
  تاریخی M4 دستنخورده ماندند.
- محدودیتهای صریح: CI نهایی دقیقSHA، مرورگر دستی/RTL/a11y/console، MinIO/S3
  production و معادل CI/تولید `UNVERIFIED`؛ هیچ اسکرینشات ساختگی ثبت نشد.
