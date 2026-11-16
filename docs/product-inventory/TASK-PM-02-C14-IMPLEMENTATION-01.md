# TASK-PM-02-C14-IMPLEMENTATION-01 — اعتبارسنجِ چرخهٔ حیاتِ صفات الزامی (D4 lifecycle validator)

**وضعیت:** پیاده‌سازیِ محدود و آمادهٔ مرور؛ **هیچ رفتارِ تولیدیِ جدیدی فعال نیست**. پیش‌فرض
همهٔ کنترل‌های تازه `off` است و فقط با `PRODUCT_ATTRIBUTE_LIFECYCLE_ENFORCEMENT=enforce`
(بی‌بافت) فعال می‌شود. این سند و این commit هیچ‌کدام از تصمیم‌های بازِ D1/D4 را **تصویب نمی‌کند**
و مجوز merge/deploy/migration نیست.

**نوع کار:** DEVELOPMENT محدود (ماژولِ خالصِ مشترک + refactor رفتار-preserving + wiringِ
غیرفعال‌پیش‌فرض + تستِ واحد) — نه ممیزی صرف، نه فعال‌سازیِ قرارداد، نه مهاجرت.

| آیتم | مقدار |
|---|---|
| شاخه | `task/pm-02-c14-identity-attribute-integrity` |
| مبنا (base) | `ebf8901c185b1b3becd6520c5583833da5d43ffa` (tip تحویل C13) |
| چک‌پوینت پیش از نخستین نوشتن | `/home/user/c14-implementation-01/` — `repo-before-c14.bundle` + `c13-worktree-overlay.tgz` (sha256 `be2170ff1e0e4cff16a2874737d52fd5f8cdb253639da94309ae079684edd27d`، `sha256sum -c` → OK؛ ۳۲ فایل هش‌یکس و از worktree منتقل شدند؛ worktree پاک شد) |
| PRهای موجود | PR #15 (`task/pm-02-c14-identity-attribute-readiness`، planning-only) و PR #14 — **دست‌نخورده** |
| Windows verification | UNVERIFIED (به درخواست مالک) |
| Real-data assessment | BLOCKED (بدون کپیِ مجوزدار و ایزوله) |

---

## ۱) آنچه پیش از هر تغییر اثبات شد (baseline)

| موضوع | شواهد منبع‌محور |
| --- | --- |
| الزامِ صفات فقط در مسیرِ ذخیره‌سازیِ مقدارها است | `product-identity.service.ts` → بلوکِ «الزامِ is_required روی وضعیتِ نهایی» (فقط `PUT/POST /products/:id/attributes`) |
| مسیرهای دیگر هیچ اجباری ندارند | `product.service.ts` (create: بدون بررسی؛ update: فقط نگهبانِ فیلد حساس + M-3)؛ `product-master.service.ts` (CSV import: هیچ اشاره‌ای به صفات ندارد)؛ تغییرِ `category_id` در UpdateDTO بدون بررسی |
| CSV نمی‌تواند مقادیر صفات حمل کند | `PRODUCT_CSV_HEADERS` (code/name/name_latin/category_code/brand_name/base_uom_code/tax_code/barcode/status/min_order_qty/weight_gr/volume_cm3/distribution_kind) — هیچ ستونِ صفتی نیست |
| دامنهٔ الزام امروز = کل شرکت | تعریف‌های `is_required` در سطح `product_attribute_def` شرکت‌محورند؛ هیچ نگاشت category/family→attribute در کد/مهاجرت نیست؛ مسیر ویرایش همهٔ محصولات شرکت را می‌بندد |
| کد کالا case-insensitive در اپلیکیشن ولی case-sensitive در DB | `lower(code)` در repository در برابر `uq_product_code (company_id, code)` — شواهدِ D-C11-3؛ **دست‌نخورده** |
| Normalization | `normalizeText` (NFC→foldDigits FA/AR→Latin→کنترلی‌ها→trim→فشردن فاصله→lowercase)؛ `normalizeBarcode` (بدون case fold؛ حفظ صفر)؛ `variantSignature` = sha256 محورهای `is_variant_axis` با ترتیب قطعی `def_id` |
| Sensitive-field boundary | RBAC + `confirm_sensitive` + audit در همهٔ مسیرهای نوشتن دست‌نخورده ماند |
| Bulk maintenance | همچنان attribute-writer **نیست** و اگر روزی بشود باید همین اعتبارسنج را صدا بزند |

---

## ۲) تصمیمِ دامنهٔ D4 — گزینه‌ها (هیچ‌کدام انتخاب/تصویب نشد)

| گزینه | معنا | نیازمندی واقعی | وضعیت |
| --- | --- | --- | --- |
| **A — Company-wide** | هر تعریفِ `is_required` برای همهٔ محصولات شرکت | هیچ جدولِ نگاشت لازم نیست؛ همان معنای مسیر ویرایشِ موجود | شواهدیافته در کد؛ فقط مسیر ویرایش مقادیر را اجبار می‌کند |
| **B — Category-scoped** | الزام وابسته به دستهٔ کالا | نگاشت صریح category→attribute + معنا‌شناسی تغییر دسته و orphan semantics | **NOT AUTHORIZED** — نگاشتی ساخته نشد |
| **C — Family-scoped** | الزام وابسته به خانواده | نگاشت صریح family→attribute + معنا‌شناسی عضویت | **NOT AUTHORIZED** — نگاشتی ساخته نشد |
| **D — Mixed** | پیش‌فرض شرکتی + override دسته/خانواده | precedence/inheritance/conflict rules | **NOT AUTHORIZED** — ساخته نشد |

**سوالات باز (§4.4 سند آمادگی) — بدون پاسخِ مالک هیچ‌کدام ابداع نشد:** آیا کالای ناقص به‌صورت
draft مجاز است؟ در کدام گذار اجباری می‌شود؟ کالای موجود با تغییر دسته/خانواده نامعتبر می‌شود؟
تعریفِ الزامیِ تازه پس از وجودِ محصولات (block / grandfather / remediation workflow)؟ clear کردنِ
مقدار برای صفت الزامی؟ Enumهای inactive و مقادیر تاریخی؟ معنا‌شناسی ورود گروهی وقتی CSV نمی‌تواند
صفات را حمل کند؟

---

## ۳) آنچه پیاده شد

| فایل | نوع | شرح |
| --- | --- | --- |
| `apps/api/src/modules/master-data/product-attribute-requirements.ts` | جدید (خالص، بدون Nest/DB) | قرارداد مشترک: `findMissingRequiredAttributes` / `validateRequiredAttributes` (وضعیت نهایی، ترتیب قطعی code/id)؛ `field`-addressable (`attributes.<code>`)؛ `requiredAttributeMissingExceptionBody` (`details.def_id` همان قرارداد قبلی + `details.missing` فهرست کامل؛ افزودنی و سازگار)؛ `readLifecycleEnforcementMode` (فقط `enforce` بی‌بافت؛ هر چیز دیگر `off` — fail-closed) |
| `apps/api/src/modules/master-data/product-master.repository.ts` | افزوده | `listRequiredAttributeDefs(companyId)` (فقط خواندنی، `order by code, id`) و `listPresentAttributeDefIds(companyId, productId)` (join با `product` و `deleted_at is null`) |
| `apps/api/src/modules/master-data/product-identity.service.ts` | refactor رفتار-preserving | بلوک inline الزام با اعتبارسنج مشترک جایگزین شد؛ همان `code`/`message_fa`؛ ترتیب گمشده‌ها اکنون قطعی است (code، id — به‌جای ترتیب نامشخص DB)؛ `details.missing` اضافه شد |
| `apps/api/src/modules/master-data/product.service.ts` | wiring غیرفعال‌پیش‌فرض | `create`: در enforce و با وجود تعریف الزامی → `400 required_attribute_missing` پیش از هر نوشتن (تراکنش rollback). `update`: فقط وقتی `category_id` یا `family_id` واقعاً تغییر کند و کالایِ موجود ناقص باشد → همان خطا؛ ویرایش‌های نامرتبط قفل نمی‌شوند |
| `apps/api/src/modules/master-data/product-master.service.ts` | wiring غیرفعال‌پیش‌فرض | `commitImport`: در enforce و mode≠`update`، ردیف‌هایی که کالای **جدید** می‌سازند با `required_attribute_missing` رد می‌شوند (row-addressable در همان `validationErrorsByRow`)؛ ردیف‌های کالای موجود grandfather می‌شوند؛ all-or-nothing هر دسته، ادامه پس از خطا (§E) و idempotency **دست‌نخورده** |
| `apps/api/test/product-attribute-requirements.test.ts` | جدید (DB-free) | ۱۹ تست: قطعی‌بودن ترتیب، clear⇒گمشده، نادیده‌گرفتن def ناشناس، حفظ details legacy، fail-closed بودن مرز |

## ۴) آنچه پیاده نشد و چرا

- **هیچ نگاشت category/family→attribute** ساخته نشد (B/C/D NOT AUTHORIZED).
- **هیچ migration/schema/constraint تغییر نکرد**؛ هیچ ایندکسی اضافه نشد.
- **CSV contract دست‌نخورده**: `validateImport` (sync، بدون DB) تغییر نکرد؛ در enforce خطاهای
  ردیف‌ها در زمانِ commit و به‌صورت row-addressable ظاهر می‌شوند — یعنی preview سبز ولی commit
  ردیف‌ها رد می‌کند. این نتیجهٔ اجتناب‌ناپذیر نبودِ توانِ CSV در حمل صفات است و باید در تصویب
  مالک حل شود (ستون‌های صفات؟ post-import completion؟ draft؟).
- **Create در enforce عملاً همهٔ ساخت‌ها را با وجود تعریف الزامی می‌بندد** — این «معنا‌شناسی
  بدون draft» است و فقط با فلیپ صریح مالک فعال می‌شود؛ نه پیش‌فرض است نه توصیه شده.
- **ویرایش‌های نامرتبط روی کالای ناقص قفل نمی‌شوند** (فقط تغییر دسته/خانواده) — grandfathering
  تصمیمِ مالک است.
- **D1/identity (D-C11-*, D-C12-*, D-C13-1)**: هیچ تغییری نشد؛ کد آزمایشی C11–C13 خاموش ماند.
- **Bulk maintenance** همچنان attribute-writer نیست.
- هیچ تغییرِ web/UI/contract/OpenAPI نیست.

## ۵) معنا‌شناسیِ `PRODUCT_ATTRIBUTE_LIFECYCLE_ENFORCEMENT`

| مقدار | رفتار |
| --- | --- |
| (نبودِ متغیر) / `off` / هر چیز غیر از `enforce` | **صفر تغییر رفتار** در همهٔ مسیرها (مسیر ویرایشِ مقادیر صفات همچنان الزامِ final-state خود را دارد — رفتارِ موجود و مستقل از flag) |
| `enforce` (بی‌بافت) | `create` → 400 در صورت وجود تعریف الزامی؛ `update` با تغییر `category_id`/`family_id` روی کالایِ ناقص → 400؛ ردیف‌های سازنده در `commitImport` → ردِ row-addressable؛ مسیر ویرایشِ مقادیر صفات بدون تغییر |

این flag «مرزِ غیرفعالِ» عمدی است تا پیش از تصویبِ دامنه و معنا‌شناسیِ lifecycle، هیچ قانونِ
تازه‌ای فعال نشود. روشن‌کردنِ آن تصمیمِ مالک است، نه تصمیمِ این تسک.

## ۶) تأیید (همین محیط، commit این PR)

| بررسی | نتیجه |
| --- | --- |
| `node scripts/check-test-partition.mjs` | **PASS** (۱۱۴ فایل؛ فایل جدید DB-free طبقه‌بندی شد) |
| Unit suite (CI command، `*.test.ts` بدون DB) | **PASS** — ۵۱ فایل، ۸۵۵ passed، ۱ skipped |
| تست‌های جدید `product-attribute-requirements.test.ts` | **PASS** — ۱۹/۱۹ |
| `npm run typecheck` (contracts + api-client + api + web) | **PASS** (۰ خطا) |
| `npm run build` | **PASS** |
| `npm run openapi:check` | **PASS** (229 مسیر / 324 عملیات / 233 اسکیما — بدون تغییر) |
| `node scripts/contract-drift.mjs` | **PASS** (۰ واگرایی) |
| Web unit (`npm run test:web`) | **PASS** — ۲۹ فایل، ۱۶۵ تست |
| Integration-DB (`*.api.test.ts`، از جمله `product-master-attributes.test.ts`) | **NOT RUN** — این محیط PostGIS/Redis/Docker ندارد و `DATABASE_URL` موجود نیست؛ ادعای PASS بدون اجرا نمی‌شود. رفتارِ مسیر ویرایش مقادیر با همان تست‌های موجود باید در CI/DB واقعی سبز بماند |
| Windows | **UNVERIFIED** (به درخواست مالک) |
| Real-data | **BLOCKED** |

## ۷) گیت‌های باز و تصمیمات مالک (بدون تصویب در این تسک)

1. انتخاب دامنهٔ D4 (A/B/C/D) + مثال‌های پذیرش مثبت/منفی/مرزی.
2. معنا‌شناسیِ draft و گذار اجباری؛ grandfather/remediation workflow برای تعریف‌های تازهٔ الزامی.
3. معنا‌شناسی ورود گروهی وقتی CSV نمی‌تواند صفات را حمل کند (ستون‌های صفت؟ تکمیل پس از ورود؟).
4. ten تصمیمات D1 (D-C11-1..6، D-C12-1..3، D-C13-1) و استراتژی ایندکس (D-C12-3) — همچنان OPEN.
5. پس از تصویب: wiring نهایی + فعال‌سازی + مهاجرت (در صورت نیاز) در گیت‌های جدا (C14-B/C/D/E/F)
   با دروازهٔ صریحِ مالک. PR تا تصویبِ صریح **باز/unmerged** می‌ماند.
