# TASK-PM-02-C14-IDENTITY-INTEGRITY-03 — رفع هدفمند F-01..F-07 (بدون تصمیمِ مالک)

**وضعیت:** پیاده‌سازیِ محدود و آمادهٔ مرور؛ **این سند مجوزِ merge/deploy/migration/PR نیست.**
هیچ تصمیم مالکی (D-C11-3 / D-C12-1 / D-C13-1 / D-C11-1 / POL-*) تصویب یا لامس نشد.

**نوع کار:** remediation هدفمند روی یافته‌های گزارشِ تأییدِ مستقل (VERIFICATION-01).

| آیتم | مقدار |
|---|---|
| شاخه | `arena/3fdef0e8-green-dms` (overlay dirty == `5c16902`) |
| مرجع پیاده‌سازی C14 | `task/pm-02-c14-identity-integrity-02` = `5c16902c41f82850ab69c8209d6a38591872306c` (دست‌نخورده؛ merge/deploy/migrate نشد) |
| چک‌پوینت پیش از نوشتن | `/home/user/c14-identity-03/worktree-before-remediation.tgz` (ساخته شد اما **با resetِ سندباکس پاک شد** — پوشهٔ بیرونِ workspace ماندگار نبوده). **چک‌پوینتِ تازه داخل workspace:** `.arena-checkpoints/worktree-task03-remediation-2026-11-14.tgz` (۳,۳۳۹ فایل) — هرگز commit نشود |
| DB integration | **NOT RUN** — این محیط `DATABASE_URL`/psql/Docker ندارد؛ تست‌های `.api.test.ts` فقط نوشته شدند |
| Windows verification | UNVERIFIED |
| Real-data assessment | BLOCKED |

---

## ۱) مبنا و ایمنی (baseline & safety)

- شاخهٔ فعلی `arena/3fdef0e8-green-dms` در `d14395a`؛ worktree تنها؛ stash خالی؛ هیچ force/reset/clean انجام نشد.
- **رخداد سندباکس (صداقت کامل):** بین دو turn، فایل‌سیستمِ بیرونِ workspace reset شد؛ `node_modules` پاک شد و با `npm ci` دوباره نصب شد؛ پوشه‌های ایمنیِ بیرونیِ C13/C14 (`/home/user/c13-guardrails-temp`, `/home/user/c14-identity-02`) و چک‌پوینتِ بیرونیِ این تسک **از بین رفتند**.
- **سلامتِ داده پس از reset دوباره تأیید شد:** پس از `git fetch --depth=1 origin 5c16902…` (بدون لمسِ refs؛ فقط FETCH_HEAD)، اسکنِ بایت‌به‌بایتِ overlay نشان داد **۴۴ مسیر دقیقاً مطابق `5c16902` هستند و تنها ۱۰ مسیر تفاوت دارند — دقیقاً همان فایل‌هایی که این تسک تعمداً تغییر داده** (F-01/F-03/قرارداد). هیچ فایلِ خراب/truncated مشاهده نشد؛ کارِ C14 در شاخهٔ remote و overlay کاملاً سالم است.
- Overlay (۴۸ مسیر) با `5c16902` بایت‌به‌بایت یکسان است؛ هیچ‌یک از ۴۸ مسیر پاک/بازنویسی/Commit نشد.
- `git ls-remote` قبل از کار: `task/pm-02-c14-identity-integrity-02 = 5c16902…` ✓ مطابق انتظار؛ `main = d14395a` ✓؛ هیچ PR برای آن باز نشد (PR #15 متعلق به شاخهٔ planning-only است و دست‌نخورده ماند).
- چک‌پوینتِ بازیافت‌پذیر داخل workspace ساخته شد (`.arena-checkpoints/…tgz`؛ هرگز commit نشود). هیچ push/merge/PR/commitی انجام نشد؛ شاخهٔ `arena/3fdef0e8-green-dms` و remoteها دست‌نخورده‌اند.

## ۲) F-01 — دورزدنِ هویت در ویرایش کالا — **تصمیم: تغییرِ SKU پشتیباتی‌شده نیست → غیرقابلِ PATCH**

### شواهد (evidence)
1. فرمِ ویرایشِ وب، فیلدِ SKU را `disabled` رندر می‌کند با عنوان «کدِ SKU پس از ثبت تغییرناپذیر است»؛ بدنهٔ PATCH در وب هرگز `code` نمی‌فرستند (`apps/web/src/app/products/[id]/page.tsx`).
2. سرگردان انبوه (Bulk Maintenance) `code` را در `PROTECTED_BULK_FIELDS` دارد و در `BULK_FIELD_DEFINITIONS` (۹ کلید) عبارت `code` نیست (`product-bulk-maintenance.types.ts`).
3. چرخهٔ عمر (`product-lifecycle.service.ts`) فقط `{status}` می‌نویسد.
4. تنها مسیری که `code` را می‌پذیرفت: `PATCH /products/:id` ← `UpdateProductDto extends PartialType(CreateProductDto)` ← `code?` ارث‌بری‌شده بدون هیچ validator → `ProductRepository.UPDATABLE` شامل `'code'` ← `code = $n` verbatim در SQL. هیچ pre-check/case-insensitive lookup/audit-before-code/نگاشتِ 23505 در `update()` وجود نداشت (`mapDbError` فقط در `create` صدا زده می‌شد).
5. `ValidationPipe` سراسری `whitelist: true` دارد: **اگر فقط DTO را حذف کنیم**، `code` در بدنه بی‌صدا drop می‌شد و کلاینت هرگز نمی‌فهمید SKU تغییر نکرده — لذا حذفِ صرفِ فیلد کافی نبود.

### تصمیم و دلیل
چون **هیچ کاربر/کلاینتِ پشتیبانی‌شده‌ای تغییرِ SKU نمی‌فرستد** و هیچ اعتبارسنجی/ممیزی/قراردادی برای آن وجود ندارد، تغییرِ SKU یک قابلیتِ کسب‌وکاریِ تعریف‌شده نیست؛ رفتارِ قبلی یک «سوراخ» بود، نه یک قابلیت. حذفِ کاملِ قابلیت، سطح حمله را صفر می‌کند و هیچ مصرف‌کنندهٔ موجود را نمی‌شکند (وِب هرگز آن را نمی‌فرستاد).

### آنچه تغییر کرد
- `product.dto.ts`: `UpdateProductDto = PartialType(OmitType(CreateProductDto, ['code'] as const))`.
- `product.repository.ts`: `'code'` از `UPDATABLE` حذف شد (defense in depth؛ لایهٔ HTTP هم مسدود است).
- `sku-immutable.guard.ts` (جدید): این گارد **پیش از** pipe اجرا می‌شود؛ هر بدنهٔ حاوی کلیدِ `code` را با
  `400 { code: 'code_immutable', message_fa, details: { field: 'code', surface } }` رد می‌کند، با ممیزیِ
  `sku_change_rejected` (فقط نام فیلد و مسیر؛ هرگز مقدار/SKU) — الگوی `DomainBoundaryGuard` (set_config شرکت/کاربر + `withTransaction`).
- `product.controller.ts`: `@UseGuards(DomainBoundaryGuard, SkuImmutableGuard)` روی مسیر PATCH تنها.
- `master-data.module.ts`: ثبت provider.
- `product.service.ts`: فراخوانیِ repository در `update()` در try/catch قرار گرفت و `mapDbError(err, { fa:'ویرایش کالا', slug:'update' })` اعمال شد — هرگز 23505/23514/23503 خام به کلاینت نمی‌رسد؛ نگاشتِ 23505→409 `duplicate_code` در مسیر ویرایش هم فعال شد (دفاع عمیق؛ SKU دیگر نمی‌تواند تغییر کند، ولی قیدِ DB هر خطای منحصربه‌فردی را درست نگاشت می‌کند).
- قرارداد: `packages/contracts/openapi.yaml` ← `ProductUpdate.code` حذف شد و توضیحِ ۴۰۰ `code_immutable` افزوده شد؛ docs typechain بازتولید شد (`packages/api-client/src/schema.ts`)؛ کلاینت Android تولیدشدهٔ دست‌ساز عمداً دست‌نخورده ماند (فیلد اضافه بی‌اراده است؛ سرور با 400 روشن رد می‌کند — «نه سکوت، نه شکستنِ خاموش»؛ بازتولید با `npm run clients:generate` در دسترسی jar در محیط واقعی ممکن است).
- رفتارِ کلاینت‌های موجود: وِب بدون تغییر کار می‌کند (هرگز `code` نمی‌فرستاد). هر کلاینتی که `code` بفرستد اکنون خطای روشن (`code_immutable`) می‌گیرد نه موفقیتِ خاموش — این تعمداً «شکستنِ خاموش» نیست و در قرارداد مستند شد.
- ممیزی (`before`/`after` در `update`): چون SKU تغییرناپذیر است، حذفِ `code` از before/after ممیزی همچنان صادقانه است؛ ردشدن‌ها در `sku_change_rejected` ثبت می‌شوند.

## ۳) تست‌های رگرسیون (رفتارِ واقعیِ API — `test/product-sku-immutability.api.test.ts`)

فایل جدید DB-backed (`.api.test.ts` ← پارتیشن DB به‌صورت خودکار؛ مانیفست نیازی به تغییر نداشت؛ `check-test-partition` ✓). پوشش:
1. PATCH معتبر بدون `code` → 200 و SKU ثابت. 2) تغییرِ SKU به مقدارِ تازه → 400 `code_immutable` + **هیچ فیلدی اعمال نمی‌شود** (نام/کد دست‌نخورده). 3) `code` برابر مقدار فعلی هم 400. 4) نویسهٔ کنترلی → 400. 5) ZWNJ → 400. 6) BOM (U+FEFF) → 400. 7) BIDI (U+202E) → 400. 8) فاصلهٔ ابتدا/انتها → 400. 9) تکراریِ دقیقِ کالای دیگر → 400 (نه 409). 10) تکراریِ case-variant → 400. 11) کنترل مسیر ساخت: تکراریِ دقیق → 409 `duplicate_code`. 12) کنترل مسیر ساخت: case-variant → 409. 13) ممیزیِ ردشدن: `sku_change_rejected` با `fields:['code']` ثبت می‌شود؛ SKU و نام دست‌نخورده. 14) ممیزیِ ویرایش موفق: before/after نام و عدم حضور `code`. 15) همان SKU در شرکتِ دیگر قابل ساخت (۲۰۱؛ قید per-company). 16) PATCHِ شاملِ `code` در شرکت دوم هم 400. 17) CSV validate: کد با فاصلهٔ ابتدا/انتها → خطای ردیف `invalid_code`. 18) CSV validate: کد کنترلی → `invalid_code` (رفتار قبلی حفظ).

**⚠️ NOT RUN** — `DATABASE_URL`/PostgreSQL/Docker در این محیط نیست. ادعای پاس نمی‌شود؛ اجرای آن در CI (job `integration-db`) یا DB ایزولهٔ تأییدشدهٔ مالک الزامی است. تست‌هایی که مهار قطعی ندارند یا صادقانه حذف/محدود شدند: نگاشتِ قطعیِ 23505 با race واقعی (پوشش داده شد: مسیر create با 409 × کنترل؛ مسیر update با mapDbError — race واقعی نیازمند fault-injection است و در این تسک ادعا نمی‌شود).

## ۴) F-02 — رقابتِ case-variant هنگام درج — مقایسهٔ طراحی (بدون migration/تغییر سیاست)

**وضعیت فعلی:** قید DB = `uq_product_code unique (company_id, code)` (case-sensitive). اپلیکیشن pre-check با `lower(code)` می‌کند، ولی بین SELECT و INSERT پنجرهٔ race هست؛ insert case-variantِ موازی توسط قید رد نمی‌شود (هر دو می‌توانند commit شوند).

| گزینه | شرح | مزایا | معایب/ریسک | ملزومات قبل از اجرا |
|---|---|---|---|---|
| **A. ایندکس فانکشنالِ یکتا** `create unique index on product (company_id, lower(code))` | یک migration کوچک؛ قوی‌ترین تضمین | ساده؛ سریع؛ بدون تغییر نوع ستون؛ مقایسه‌ با قراردادِ اپلیکیشن یکسان (lower) | نیازمند **dedupe داده‌های موجود case-variant** پیش از ساخت (fail در دادهٔ کثیف)؛ رفتار درج برای کدهای متفاوت-دراحرف می‌شکند (409 به‌جای موفقیت)؛ D-C11-3 را در عمل تصویب می‌کند | شمارش case-variantهای ذخیره‌شده؛ گزارش به مالک؛ backup/rollback؛ تصمیم D-C11-3 |
| **B. نوع `CITEXT`** | `code CITEXT` + unique | نیت صریح در schema؛ مقایسهٔ بی‌بافت همه‌جا | نیازمند extension + بازنویسی ستون؛ معناشناسی متفاوت در `order by`/regex؛ مهاجرت سنگین‌تر؛ بازهم D-C11-3 | همان ملزومات A + تست عملکردی/رتبه‌بندی |
| **C. `SERIALIZABLE` + retry** | تراکنش read-check-insert با سطح رقابتی | بدون migration؛ محافظت کلی | یکی از رقبا خطای serialization می‌گیرد و باید retry کند (پیچیدگیِ retry-budget؛ throughput)؛ **بدون retry درست، تست‌ها flaky می‌شوند**؛ SQLSTATE 40001 باید در اپ نگاشت شود | سخت‌سازیِ timeout/retry؛ تست بار؛ بازهم فقط پنجره را می‌پوشاند، نه تعریف uniqueness را |
| **D. Backfill + migration جداگانه** برای داده‌های موجود | پیش‌نیاز A/B | ایزوله و قابل rollback | تصمیم داده‌ای (merge/rename/delete) مالکی‌محور است؛ می‌تواند history/audit را نقض کند اگر merge شود | مالک + backup + dry-run گزارش |
| **E. فقط app-layer (وضعیت فعلی+)** | pre-check + `getProductsForImportTx ... for update` + نگاشت خطا | صفر ریسک schema | **race را نمی‌بندد** — فقط پنجره را کوچک می‌کند | — |

**آنچه در app-layer می‌توان بی‌خطر بهتر کرد (اضافه شد در این تسک):** نگاشتِ 23505 → 409 `duplicate_code` در **هر دو** مسیر create/update؛ ردِ زودهنگامِ 400 `code_immutable`؛ ردیف‌های import با `for update`. **هیچ‌کدام از این‌ها race را کامل نمی‌بندد — ادعا نمی‌شود.** تنها یک قید یکتای case-insensitive در DB (A یا B) آن را می‌بندد، و آن در گروی تصویبِ مالک و migration است — **عمداً پیاده نشد.**

**پیشنهاد پیاده‌سازی (پس از تصویب):** A با `not valid` phase؟ — توجه: unique index نمی‌تواند partial باشد؛ ترکیب A + اسکریپت dedupe + تأیید مالک روی policy (نگه‌داشتن کدام‌یک از case-variantها) + rollback plan. تصمیم نهایی با مالک (D-C11-3).

## ۵) F-04 / F-06 / F-07 — تحلیل و اقدامات محدود

### F-07 — فاصلهٔ CSV با قراردادِ هویت هم‌تراز شد (اصلاحِ کم‌ریسک، پیاده شد)
قبل: سلولِ کد با فاصلهٔ ابتدا/انتها بی‌صدا trim و ذخیره می‌شدند — نقضِ «بدون نرمال‌سازیِ خاموشِ شناسه‌ها». اکنون `validateImport` ردیف‌های با فاصله را `invalid_code` (با شمارهٔ ردیف و متن روشن) علامت می‌زند؛ چون `commitImport` همان `validateImport` را صدا می‌زند، **commit هم همان ردیف‌ها را رد می‌کند و هیچ‌گاه شناسهٔ trim‌شده ذخیره نمی‌شود** (مقادیر داخلی بی‌تغییر). رفتار برای CSVهای تمیز تغییری ندارد.

### F-04 — ناهمخوانی CSV Preview/Commit — فقط تحلیل (پیاده نشد — تغییرِ معناشناسی است)
- **امروز:** `POST /products/import/validate` = **نحوی صرف** (کنترل/فاصله/نوع/دامنه) — بدون DB؛ سبز بودن preview ⟹ commit موفق نیست. `commit` خودش validate + resolve دسته/واحد/مالیات + lookup کد موجود را اجرا می‌کند؛ preview آنچه commit می‌بیند را نمی‌بیند.
- **مرز سینتکس ↔ DB:** نحوی: کنترل/غیرقابل چاپ، فاصله، عددی‌بودن، `duplicate_in_file` (lower)، هدر/سقف ردیف. DB-وابسته: `unknown_category`/`unknown_uom`/`unknown_tax_code`، «کد از قبل وجود دارد» (mode=create)، «یافت نشد» (mode=update)، CSV owner/RLS.
- **پیشنهاد (برای تصویب مالک):** یک pipeline مشترک دومرحله‌ای — `validate(csv, { mode, resolve: 'syntax' | 'db' })`؛ مسیر `db` (اختیاری، نیازمند مجوزِ import) همان resolveهای commit را بدون نوشتن اجرا و ردیف‌های «Preview-قرمز» را report می‌کند؛ commit همیشه از مرحلهٔ DB عبور می‌کند (رفتارِ درست fail-closed). کلاینت‌های preview باید دامنهٔ واقعی را بدانند (مستندسازی در openapi + گزارش). ریسک: semantics جدید برای کلاینت‌های موجود → نیازمند تصویب و maybe versioned endpoint. **این تسک پیاده نکرد.**

### F-04 — خلاصهٔ تصمیم‌ها
پیشنهاد: pending مالک؛ این تسک هیچ semantics را تغییر نداد.

## ۶) F-03 — ابزار تشخیصی (experimental) — **فقط اصلاحات ظاهری، با مجوزِ مالک انجام شد**

محتوای تسک در ابتدا ناقص بود؛ مالک اعمالِ «فقط اصلاحات ظاهریِ F-03» را تأیید کرد. اعمال‌شده (هیچ معنا/اعمال/enforce تغییر نکرد):
1. `cross-type-collision.candidate.ts`: docِ `foldUpcToEan` بازنویسی شد تا رفتارِ واقعی (فقط ۱۲ و ۱۱ رقمی تا می‌شوند؛ بدون اعتبارسنجیِ طول/رقم کنترلی) را بگوید — کد بدون تغییر؛ کامنتِ مبهم ۱۱ رقمی نیز شفاف شد. هلپرِ داخلیِ `foldDigitsKeepZeros` اکنون `export` شده (نیاز برای #2؛ نام از allowlistِ مرزی عبور می‌کند).
2. `identity-integrity-diagnostics.candidate.ts`: `detectPackagingCanonicalDrift` در `norm` ارقامِ فارسی/عربی را با `foldDigitsKeepZeros` به لاتین تا می‌کند — «۰۱۲۳…» و «0123…» دیگر کاندیدای driftِ کاذب نمی‌سازند (F-03).
3. `cross_company_allowed` برچسب حفظ شد اما معنایش صریح شد: فقط دسته‌بندیِ خودکارِ موتور برای «همان شناسه در شرکتِ دیگر» + یادداشتِ محدودیتِ تازه `cross_company_allowed_is_label_not_owner_approval_d_c12_1_open` — **نه تأیید و نه تصمیمِ D-C12-1**؛ مقادیر همچنان پوشانده و داوری نهایی با مالک است (محدودیت‌های سراسری `d_c12_1_open_cross_company_policy_pending` از قبل موجود بود).

تست‌های واحد مرتبط (`identity-integrity-diagnostics`, `multilingual-normalize`, `c14-identity-integrity-boundary`) = **۷۴ passed**؛ کلِ unit suite = **۹۳۶ passed / ۱ skipped**؛ typecheckِ api = PASS.

## ۷) F-06 — عملکردِ queryها (EXPLAIN) — فقط تحلیل؛ اجرا نشد
محیط فعلی DB ندارد؛ **هیچ EXPLAIN اجرا نشده و ادعای perf نمی‌شود.** شواهد ایستا:
- lookupهای `lower(code) = lower($n)` و `lower(code) = any($n::text[]) ... for update` (`product-master.repository.ts:474/796/817`, `productCodeExists`) هیچ ایندکس فانکشنالیِ پشتیبان ندارند؛ `uq_product_code (company_id, code)` برای تساویِ دقیق مفید است و `ix_product_code_trgm (gin trgm)` برای `lower(code)=` نیست — احتمال seq-scan روی محصول مشتری‌های بزرگ → ONLINE/ops.
- کاندیدها (پس از تصویب): `create index concurrently ix_product_company_lower_code on product (company_id, lower(code))` — همین A در §۴؛ یا بازنویسی lookup به join روی `lower(code)`ِ stored code کوچک + گزارش. **ساخت ایندکس = migration؛ این تسک انجام نداد.**
- `verify only against authorized isolated DB` — شرط تسک؛ بدون کپیِ مجوزدار انجام نمی‌شود.

## ۸) تأیید (همین محیط)

| بررسی | نتیجه |
|---|---|
| partition (`check-test-partition.mjs`) | **PASS** — manifest == computed؛ تست `.api.test.ts` جدید DB-backed طبقه‌بندی شد |
| unit (دستور CI) | **PASS** — ۵۵ فایل، **۹۳۶ passed / ۱ skipped** |
| `tsc --noEmit` در api | **PASS** |
| `tsc --noEmit` در web | **PASS** |
| `tsc --noEmit` در api-client | **PASS** |
| `npm run openapi:check` | **PASS** — 229/324/233 (بدون تغییر شمارش) |
| `contract-drift.mjs` | **PASS** — ۰ واگرایی |
| Integration-DB (`product-sku-immutability.api.test.ts`) | **NOT RUN** — `DATABASE_URL` نیست؛ ادعای PASS نمی‌شود |
| Build (`npm run build`) و web test | تغییر وب/تولیدیِ پیچیده نشد؛ پیش‌فرضِ تأیید روی tsc + suites واحد است؛ اجرای build کامل توصیه می‌شود |
| Windows / Real-data | UNVERIFIED / BLOCKED |
| F-03 cosmetic (experimental) | **انجام شد با مجوز مالک** — تست‌های واحد مرتبط ۷۴ passed؛ unit suite همچنان ۹۳۶/۱ skipped |

## ۹) جمع‌بندی و صف تصمیم‌های باز
1. F-01 **بسته شد** (immutable SKU + 400 روشن + ممیزی + نگاشت خطا + قرارداد). F-07 **بسته شد** (همکاری با قراردادِ هویت). F-03 **بسته شد** (فقط اصلاحات ظاهری experimental، با مجوز مالک). F-02/F-04/F-06: فقط تحلیل/پیشنهاد — **به تصویب مالک وابسته‌اند** (D-C11-3, semantics preview, migration/ایندکس).
2. باز: D-C11-1/D-C11-3/D-C12-1/D-C13-1 و POL-* — این تسک هیچ‌کدام را لمس نکرد؛ PR/merge/deploy/migration انجام نشد.
3. پیش از merge: اجرای integration-db سبز روی DB ایزوله (برای تست‌های جدید + `product-master-identity-integrity.api.test.ts`)، مرور اعمال رفتارِ 400 جدید روی کلاینت‌های غیر-وِب (Android Kotlin client قدیمی هنوز `code` دارد — بی‌خطر است: سرور 400 می‌دهد؛ بازتولید کلاینت توصیه می‌شود).

---

# FINALIZATION-01 — ضمیمهٔ راستی‌آزمایی و دروازهٔ Integration-DB (2026-11-15)

این ضمیمه خروجی تسک TASK-PM-02-C14-FINALIZATION-01 روی همین overlay است؛ هیچ گزارش قبلی را عوض نمی‌کند.

## ۱) مبنا و ایمنی
- شاخه `arena/3fdef0e8-green-dms` @ `d14395a`؛ stash خالی؛ worktree تنها؛ هیچ reset/clean/force/commit/push/merge/PR/deploy/migration انجام نشد؛ PR #15 دست‌نخورده؛ شاخهٔ remote `task/pm-02-c14-identity-integrity-02` @ `5c16902` دوباره با `git ls-remote` تأیید شد.
- `.arena-checkpoints/` با `.git/info/exclude` محلی پنهان شد؛ `git check-ignore` ✓؛ هرگز stage نشد؛ چک‌پوینت بازتولید شد (۳٬۳۳۹ فایل؛ `git ls-files --error-unmatch .arena-checkpoints` ناموفق = هرگز tracked نیست).
- **آشتیِ شمارش فایل‌ها (قطعی، با هش blob):** overlay نسبت به `5c16902` = **۵۴ مسیر | ۴۳ بایت‌به‌بایت یکسان | ۱۱ متفاوت (دقیقاً فایل‌های اصلاح‌شدهٔ F-01/F-03/قرارداد) | ۰ گم‌شده**. اختلاف ۴۴ در مقابل ۱۰ که قبلاً گزارش شد، صرفاً به‌خاطر اینکه فایل تستِ diagnostics بعد از آن اسکن تغییر کرد است؛ `۴۳ + ۱۱ = ۵۴` همواره و قطعی است؛ ۱۰ مسیرِ اصلیِ متفاوت همان‌های F-01/F-03/قرارداد هستند.
- سندباکس بین turnها reset شد؛ `node_modules` دوباره با `npm ci` نصب شد؛ فایل‌های بیرونِ workspace همچنان ماندگار نیستند.

## ۲) F-01 — تأیید کامل پیاده‌سازی
- `UpdateProductDto`: `PartialType(OmitType(CreateProductDto, ['code'] as const))` ✓ (خط ۱۱۲-۱۱۴).
- `UPDATABLE` در `product.repository.ts`: فاقد `code` ✓.
- ترتیب اجرا: Nest گاردها را **پیش از** pipes اجرا می‌کند — تأییدِ ایستا در `node_modules/@nestjs/core/router/router-execution-context.js` (fnCanActivate اجرا قبل از handler pipes؛ `markRejectedByPipes` فقط بعد از خطای pipe) + `@UseGuards(DomainBoundaryGuard, SkuImmutableGuard)` روی مسیر PATCH تنها؛ whitelist هرگز `code` را بی‌صدا drop نمی‌کند چون گارد زودتر ۴۰۰ را می‌دهد.
- بدنهٔ حاوی `code` ⇒ **۴۰۰ `{ code: 'code_immutable', message_fa, details: { field: 'code', surface } }`** قبل از هر pipe/whitelist؛ ممیزی `sku_change_rejected` (actor از توکن سروری؛ فقط نام فیلد و مسیر؛ هرگز مقدار) داخل `withTransaction` + `set_config('app.company_id'/'app.user_id', …)` ✓.
- ممیزیِ ویرایش موفق: `before`/`after` نام و وضعیت را ثبت می‌کند و `code` در هیچ‌کدام نیست — صادقانه است چون SKU تغییرناپذیر شد ✓.
- `update()`: `repo.update` در try/catch + `mapDbError(…, { fa:'ویرایش کالا', slug:'update' })` ⇒ 23505→409 `duplicate_code`, 23514→400, 23503→400؛ هرگز خطای خام DB به کلاینت نمی‌رسد؛ مسیر `create` دقیقاً همان قرارداد را دارد (هم‌خوان).
- کلاینت‌های موجود: وِب (هرگز `code` نمی‌فرستد) → 200 ✓ typecheck و build وِب سبز؛ api-client schema بازتولید شد؛ کلاینت Kotlin تولیدشده هنوز فیلد dead دارد ولی سرور با ۴۰۰ روشن رد می‌کند (نه موفقیتِ خاموش) — بازتولید با `npm run clients:generate` توصیه می‌شود.
- **Normal product updates still work** — فقط با DB قابل‌اثبات قطعی است ⇒ به تست `product-sku-immutability.api.test.ts` (NOT RUN در این محیط) موکول شد؛ هیچ false claim نمی‌شود.

## ۳) تست‌های DB-backed — **BLOCKED (با تحقیق کامل)**
- این محیط: `psql`، `postgres`، `docker`، `DATABASE_URL` **وجود ندارد**.
- `pip` (pypi.org مجاز) بستهٔ `pgserver 0.1.4` (PostgreSQL 16.2) را با موفقیت نصب کرد؛ اما آن build فقط `plpgsql` و `vector` را دارد و **بدون `pg_trgm`/`pgcrypto`/`btree_gist`/`postgis`** است؛ مهاجرت ۰۰۰۱ همین چهار پسوند را می‌خواهد و ۰۰۰۳/۰۰۰۴ از نوع `geography` استفاده می‌کنند ⇒ زنجیرهٔ مهاجرت (همان fixture واقعی این تست‌ها) با سرویس‌های موجود اجراپذیر نیست.
- `npm` (registry مجاز) `@electric-sql/pglite` 0.5.16 دارد ولی **هیچ بستهٔ PostGIS ارائه نمی‌کند** ⇒ همان بن‌بست.
- **نصب بسته‌های contrib/fake extensions یا دست‌کاریِ پسوندها عمداً انجام نشد** (نه «واقعی» است و نه «ایزولهٔ معتبر»).
- CI وجود دارد: `.github/workflows/ci.yml → integration-db` با سرویس `postgis/postgis:16-3.4` + redis و نصب `postgresql-client`؛ اجرایِ `ls test/*.api.test.ts` (به‌جز attachments) + مانیفست `db-backed-tests.txt` ⇒ فایل `product-sku-immutability.api.test.ts` به‌طور خودکار انتخاب می‌شود. اما trigger فقط روی push به main / PR به main است و کارِ این overlay **هیچ کجا commit/push نشده است**؛ بنابراین CI قادر به اجرا نیست.
- **نتیجه: BLOCKED.** هیچ تستِ DB-backed اجرا/پاس/استاب نشد؛ هیچ تأییدِ «پایگاه‌داده‌ای» ادعا نمی‌شود.
- برای شواهد gate: یک branch تحویلی + (PR یا push با تأیید مالک) لازم است؛ یا اجرای دستیِ CI integration-db روی محیطی با postgres مجوزدار. **PR باز نشد.**

## ۴) F-03 و F-07 — بازتأیید
- تست‌های واحدِ مرتبط: **۹۴ passed** (`identity-integrity-diagnostics` ۲۳ — شامل ۳ تست جدیدِ fold ارقامِ فارسی/عربی/تفاوت واقعی؛ `multilingual-normalize` ۴۷؛ `c14-identity-integrity-boundary` ۷؛ `import-code-index` ۷؛ `product-import-whitespace` ۵ — جدید و بدون DB؛ `c11-normalization-contract` ۳۹).
- `foldDigitsKeepZeros` (صادر شده از `cross-type-collision.candidate.ts`) ارقامِ `۰-۹` و `٠-٩` → لاتین با حفظ صفرِ ابتدایی؛ `foldUpcToEan` فقط ۱۲/۱۱ رقم را تا می‌کند و doc دقیقاً همین است (هیچ اعتبارسنجی/رقمی کنترلی ادعا نمی‌شود)؛ `cross_company_allowed` غیرا authoritative (limitation جدید `cross_company_allowed_is_label_not_owner_approval_d_c12_1_open`)؛ هیچ enforcement/auto-fix اضافه نشد (boundary test سبز).
- CSV boundary whitespace: تست واحد جدید `product-import-whitespace.test.ts` (۵ تست؛ بدون DB روی کدِ واقعیِ `validateImport` که commit نیز صدا می‌زند) — ردِ قاطع `invalid_code`؛ داخلی‌ها دست‌نخورده. Bridge با commit فقط در DB قابل‌اجرا است ⇒ ادعا فقط سطح validate + کدِ مشترک است.

## ۵) رگرسیون نهایی — **سبز**
- Unit (پارتیشن CI): **۵۶ فایل، ۹۴۴ passed / ۱ skipped** (شامل ۳+۵ تست جدید).
- `tsc --noEmit` (api): PASS. `npm run build`: PASS (packages + api + web). `openapi:check`: PASS (229/324/233). `contract-drift`: PASS (۰). partition: PASS. Isolation guards واحد: PASS (boundary).

## ۶) F-02 — بدون تغییر
D‑C11‑3 باز؛ هیچ migration/سیاست uniqueness تغییر نکرد؛ race هم‌پوشانی insert همچنان **آزادِ بدونِ بستن توسط DB** است — مستندشد (§۴ اصلی)؛ تنها قیدِ `(company_id, lower(code))` یا CITEXT پس از تصویبِ مالک آن را می‌بندد.

## ۷) آمادگی تحویل
- هیچ branch ساخته/push/PR نشد (PR #15 دست‌نخورده). «آماده‌سازیِ branch تحویلی» در این نشست محدود به راست‌آزماییِ diff نهایی و چک‌پوینت است؛ ساختِ branch تحویلی (`task/pm-02-c14-identity-integrity-03` از `5c16902`) نیازمند مجوزِ صریح مالک است و عمداً انجام نشد.
- **شواهد integration-db فقط با یک PR/push یا اجرای CI روی محیطی با postgres مجوزدار ممکن است.** این وظیفه تا زمانِ آن BLOCKED است.

## ۸) تصمیم‌های باز مالک (دست‌نخورده)
D-C11-1 · D-C11-3 · D-C12-1 · D-C13-1 · POL-ALIAS-COMPANY-01 · POL-BARCODE-XKIND-01 · POL-PACKAGING-CANON-01 · مهاجرت legacy packaging · semantics preview/commit CSV (F-04) · index migration (F-06) · بازتولید Android client.

---

## ۹) تحویل (DELIVERY-01) — ۲۰۲۶-۱۱-۱۳ — این بخش §۷ را به‌روز می‌کند

- **مجوز صریح مالک** برای: branch تحویلی + commit + push + یک Draft PR + بررسی CI (integration-db). merge/deploy همچنان **غیرمجاز** است؛ PR او #15 دست‌نخورده ماند.
- **Branch تحویلی:** `task/pm-02-c14-identity-integrity-03` → **PR #16 (Draft، base `main`)** — https://github.com/Tadbir-Sabz/Green-DMS/pull/16
- **خط C14 کامل است:** `5c16902` (IDENTITY-INTEGRITY-02) + `be5d0d8` (این remediation) + commitِ همین بخش (C14-I03 CI fix). base = `5c16902` که سرِ `task/pm-02-c14-identity-integrity-02` است (دست‌نخورده، force/push نشده).
- **Gateهای این درخت:** unit ۵۶ فایل / ۹۴۴ pass / ۱ skipped · `tsc --noEmit` PASS · `npm run build` PASS · `openapi:check` PASS (229/324/233) · `contract-drift` ۰ · partition PASS.
- **integration-db در CI روی `be5d0d8` اجرا شد و ۱ تست fail شد** (`product-master-identity-integrity.api.test.ts > اسکنِ بارکدِ internal با case متفاوت`): ریشهٔ نقص در `findBarcodeMatches` بود که مقایسهٔ barcode را exact (بدون `lower`) انجام می‌داد — درحالی‌که ذخیرهٔ مقدار حفظِ case است و resolve در کدِ کالا (`findProductByCode`) و diagnostics هردو lower/lower هستند. این با هدفِ IDENTITY-INTEGRITY-02 ناسازگار بود.
- **fix باریک (C14-I03):** `findBarcodeMatches` → `lower(b.barcode) = lower($1)`؛ شاخهٔ barcode در `findAliasConflicts` → `lower(b.barcode) = $2` (طرفِ alias_norm از قبل lower است). هیچ migration، هیچ ایندکسِ تابعی، هیچ تغییرِ معناییِ ذخیره‌سازی اضافه نشد (همان گیتِ تصمیمِ مالک در جنسِ D-C11-3/F-06 برای product.code).
- **نتیجهٔ اجرایِ CI روی SHA نهایی:** در PR #16 و Actions ثبت می‌شود؛ هرگز PASS ساختگی نیست. اگر هر job غیر از موردِ بالا باز هم fail شد ⇒ NOT READY.
- **F-02 همچنان باز** — هیچ مهاجرتِ unique index / CITEXT / canonicalization اعمال نشد؛ D-C11-3 بدونِ تصمیم مالک بسته نمی‌شود.
- **merge: NOT AUTHORIZED. deploy: NOT AUTHORIZED.** این سند Draft بودن PR را تأیید می‌کند؛ تصمیم‌گیری نهایی با مالک است.

---

## ۱۰) REVIEW-01 — اصلاحِ یافته‌های بازبینیِ مستقل (۲۰۲۶-۱۱-۱۳ / ۱۱-۱۵)

یافته‌های LOW-1 تا LOW-4 از گزارشِ بازبینیِ مستقل روی PR #16 در این بخش بسته شد:

- **LOW-1 (ممیزی):** `sku-immutable.guard.ts` دیگر `req.path`/`url`/`method` را در payloadِ
  `sku_change_rejected` ذخیره نمی‌کند — سطحِ ممیزی همیشه قالبِ ثابتِ `PATCH /products/:id` است.
  تست‌های واحد جدید `apps/api/test/sku-immutable.guard.test.ts` (۷ تست؛ بدون DB؛ ممیزی و UUID
  با فیک‌ها راستی‌آزمایی شد) + تقویتِ تستِ DB-backed `product-sku-immutability.api.test.ts`
  (اکنون: `entity_id IS NULL`، `surface == 'PATCH /products/:id'`، عدم وجود UUIDِ کالا و عدم وجود
  `owner_decisions` در `after_data`).
- **LOW-2 (شناسهٔ تصمیم‌ی نامشخص):** `owner_decisions: ['D-C14-I03-F01']` کامل حذف شد؛ اسکیمای
  `AuditEntry` هیچ فیلدِ تصمیم‌ی مالکی ندارد و این ردّ فنی هرگز نمایندهٔ تأییدِ مالک نیست.
  تستِ واحد و تستِ DB-backed نبودِ آن را قفل می‌کنند؛ دلیل‌کد فنی `code_immutable` دست‌نخورده ماند.
- **LOW-3 (کشف‌پذیریِ قرارداد):** پاسخِ reusable جدید `components.responses.SkuImmutableError`
  (envelope استانداردِ `Error` + نمونهٔ `code_immutable` با `details.field='code'` و
  `details.surface='PATCH /products/:id'`)؛ عملیاتِ `PATCH /products/{id}` حالا به آن ارجاع می‌دهد؛
  فهرستِ دلیل‌کدهای `Error.code` سندِ `code_immutable` را فهرست می‌کند؛ کلاینتِ TypeScript
  بازتولید شد (`SKU PATCH 400` → `SkuImmutableError`). تستِ ایستا
  `apps/api/test/sku-immutable-contract.test.ts` (۵ تست) این زنجیره را می‌سنجد.
  **توجه:** کلاینتِ Kotlin با `npm run clients:generate` بازتولید **نشد** — jar/jre از hostهای
  غیرمجاز (maven/adoptium) دانلود می‌شوند؛ «بازتولید کلاینتِ Android» همچنان تصمیم‌ی باز مالک است.
- **LOW-4 (کاراییِ بارکد):** تفکیکِ صریح در کامنتِ کوئریِ `findBarcodeMatches` مستند شد —
  (الف) درستیِ lookup نامحسوس به case (این کد، بدون تغییر) ≠ (ب) الزامِ یکتاییِ نامحسوس
  (migration؛ تصمیمِ مالک؛ انجام‌نشده) ≠ (ج) کاراییِ query (ایندکسِ تابعیِ `lower(barcode)`،
  همان migration؛ فقط با تأییدِ مالک). هیچ migration/ایندکس/تغییرِ ذخیره‌سازی اعمال نشد.

**رگرسیونِ این درخت (پس از REVIEW-01):**
- Unit (پارتیشنِ CI): **۵۸ فایل · ۹۵۶ passed / ۱ skipped** (شامل ۱۲ تست جدید؛ EXIT 0).
- API `tsc --noEmit` PASS · `npm run build` PASS (packages+api+web) · `openapi:check` PASS
  (229/324/233) · `contract-drift` PASS · partition PASS · DB-backed: فقط در CI.

merge/deploy همچنان **غیرمجاز** است؛ PR #16 در Draft می‌ماند؛ PR #15 دست‌نخورده است.
