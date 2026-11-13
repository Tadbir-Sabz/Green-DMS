# TASK-PM-02-C6 — روابط کالا‑به‑کالا و مدیریت وابستگی (Product Relationships)

**وضعیت:** پیاده‌سازی‌شده برای **دو نوع رابطهٔ موجود و مصوب** در مهاجرت `0046`:
`substitute` (جایگزین) و `complement` (مکمل) — جهت‌دار، فقط کاتالوگی و بدون هیچ اثر
عملیاتی. رابطهٔ سوم/جهت تازه/کاردینالیتی/قاعدهٔ حلقهٔ تازه **ساخته نشد**؛ موارد
بدون سند مصوب به‌صورت **BLOCKED / UNRESOLVED** ثبت و در UI/قرارداد اعلام شده‌اند.
**نوع کار:** DEVELOPMENT واقعی (بک‌اند + قرارداد + کلاینت تولیدشده + فرانت‌اند فارسی RTL +
تست + شاهد زندهٔ همین‌مبدأ)، نه ممیزی یا مستندسازی صرف.
**عامل:** Agent-1 (Arena.ai) · **شاخه:** `arena/be5eaff3-green-dms` · **PR:** #14
(`OPEN / DRAFT`، base `main`).
**مبنا:** `50a7a587b6e8542cf7217dde3922e88dc39da74a` (پایان C5 = HEAD / `origin` /
`ls-remote` / head PR / مبنای اعلام‌شده؛ شش نمای SHA هم‌خوان).
**چک‌پوینت پیش از نخستین نوشتن:** `/home/user/pm02-c6-checkpoint.tar.gz`
(۳٬۰۹۷٬۲۷۲ بایت، sha256 `1c1c199532c15b201404c12dd97ac3181592659705f5d2153c623697fc356e0e`،
`sha256sum -c` → `OK`) + `git bundle --all` (`pm02-c6-checkpoint.bundle`،
۳٬۲۰۵٬۴۰۷ بایت، `git bundle verify` → complete history، HEAD `50a7a58…`).
**بدنهٔ PR پیش از C6:** ۱۳۱٬۴۷۴ نویسه / ۱۴۶٬۹۳۲ بایت، sha256
`c8fb45a7211bbd49bc59ceb38d8124a15d1a6a524ec8531204e08a69a1a00610` —
**بایت‌به‌بایت حفظ می‌شود** و C6 فقط پیوست افزودنی می‌گیرد.

---

## ۱) بازیابی مبنا و حفظ شواهد

`git fetch origin --prune` + `git pull --ff-only` → `Already up to date`؛ شش نمای SHA
همگی `50a7a587…`؛ worktree پاک، `git diff --check=0`. هیچ amend / force-push / reset /
rebase / merge / approve / release / deploy انجام نشد و هیچ commit پس از CI ساخته نمی‌شود.
اسناد و شواهد C1..C5 و M4/K/J **بدون ویرایش** ماندند؛ C6 فقط فایل‌های تازه و پیوست‌های
افزودنی به `EVIDENCE_INDEX.md` و راهنمای اپراتور (§۱۱) اضافه می‌کند.

> تلهٔ بازیابی: `git pull --ff-only` فایل `.git/FETCH_HEAD` را بازنویسی می‌کند؛ برای
> تطابق شش‌نمایی نهایی باید پس از push، `git fetch origin arena/be5eaff3-green-dms`
> تازه اجرا و SHA شاخه (نه `main`) خوانده شود.

---

## ۲) کاتالوگ روابط — IMPLEMENTABLE / BLOCKED / UNSUPPORTED

منبع حقیقت: `migrations/0046_product_master.up.sql` (شکل جدول و enum)،
`0047_product_master_rls.up.sql` (RLS هیبرید)، `0060_product_catalog_history.up.sql`
(تاریخچهٔ تغییرناپذیر)، `product-master.service.ts` (کنترل‌های پیش از C6)،
`PRODUCT_MASTER_TARGET_DESIGN.md §A`, `TASK-PM-01_PRODUCT_MASTER_SPEC.md §1`.
کد مرجع در `apps/api/src/modules/master-data/product-relations.rules.ts`
(`PRODUCT_RELATION_KIND_SPECS`, `PRODUCT_RELATION_OWNER_DECISIONS_FA`).

| رابطه/سازوکار | طبقه | حکم C6 و شاهد |
| --- | --- | --- |
| `substitute` (جایگزین)، جهت‌دار، `priority` | **IMPLEMENTABLE** | همان enum و همان سه کنترل موجود: خودارجاع ممنوع، حلقهٔ جایگزین ممنوع، یکتایی `(product_id, related_id, kind)`. نمایش خروجی/ورودی، ویرایش اولویت و حذف با ممیزی. |
| `complement` (مکمل)، جهت‌دار، `priority` | **IMPLEMENTABLE** | همان جدول/enum؛ قاعدهٔ حلقه‌ای برای مکمل وجود ندارد و C6 **نمی‌سازد** (`cycle_policy: no_approved_rule`). |
| `product_bundle` (D5، ترکیب بسته) | **BLOCKED (عملیاتی)** | فقط کاتالوگی؛ گسترش عملیاتی/رزرو/COGS منحصراً P5 است. C6 به آن دست نزد (`C6-D6`). |
| رابطهٔ دامنه‌ای / عرضه در دامنه | **BLOCKED** | PM-B1..PM-B8 خارج از دامنه؛ `DomainBoundaryGuard` روی کل سطح C6 نصب شد تا `x-domain-id`/`domain_id` صریحاً ۴۰۰ بگیرند. |
| نوع رابطهٔ سوم (جانشین زنجیره‌ای، «بسته‌شامل»، «سازگار با»، «منسوخ‌شده») | **UNSUPPORTED** | در enum پایگاه‌داده وجود ندارد؛ افزودن آن مهاجرت + تصویب مالک می‌خواهد. `kind` بیرون از دو مقدار → `validation_failed`. |
| جایگزینیِ خودکار در سفارش/فاکتور/بارنامه (backorder، rewrite سند) | **BLOCKED** | `C6-D1`؛ هیچ کدی در ماژول‌های فروش/قیمت/موجودی لمس نشد. |
| رابطهٔ معکوس/متقارنِ خودکار | **UNRESOLVED** → پیاده نشد | `C6-D2`؛ افزودن A→B هیچ B→A نمی‌سازد (تست و شاهد زنده هر دو اثبات می‌کنند). درخواست `reciprocal` صریحاً ۴۰۰ است. |
| کاردینالیتی، حداقل/حداکثر رابطه، الزامِ وجود رابطه | **UNRESOLVED** → پیاده نشد | `C6-D4`؛ سقف‌های موجود (۲۰۰ ردیف نمایش، عمق ۳، ۱۰۰ گره) **فنی** هستند و در پاسخ با `technical_limits` برچسب خورده‌اند. |
| مسدودسازی رابطه با کالای blocked/discontinued | **UNRESOLVED** → پیاده نشد | `C6-D5`؛ رابطه حفظ می‌شود و فقط هشدار فارسی برمی‌گردد. |

هیچ نوع/جهت/کاردینالیتی/قاعدهٔ چرخهٔ حیات یا پیامد عملیاتی **اختراع نشد**؛ هر حکم یا
به مهاجرت/سرویس موجود ارجاع دارد یا صریحاً «بدون سند مصوب» علامت خورده است.

---

## ۳) معماری و امنیت

### ۳٫۱ فایل‌های تازه/ویرایش‌شده

| فایل | نقش |
| --- | --- |
| `apps/api/src/modules/master-data/product-relations.rules.ts` | **تازه** — کاتالوگ دو نوع، تفکیک IMPLEMENTABLE/BLOCKED/UNSUPPORTED، ثبت شش تصمیم باز، whitelist/blacklist فیلدها، سقف‌های فنی، هشدار وضعیت کالای مرتبط |
| `apps/api/src/modules/master-data/product-relations.service.ts` | **تازه** — نمای کامل (خروجی/ورودی/شمارش)، تاریخچهٔ ۰۰۶۰، پیمایش محدود، افزودن/ویرایش اولویت/حذف، همه در `CatalogAccess.write` با ممیزی fail-closed |
| `apps/api/src/modules/master-data/product-relations.controller.ts` | **تازه** — شش مسیر با `AuthGuard, PermissionsGuard, DomainBoundaryGuard` |
| `apps/api/src/modules/master-data/master-data.module.ts` | ثبت کنترلر/سرویس تازه |
| `apps/api/src/modules/master-data/product-catalog.controller.ts` | حذف مسیرهای قدیمی `GET/POST /products/:id/relations` و `DELETE /product-relations/:id` و DTO مربوط، تا نسخهٔ ضعیف‌تر باقی نماند |
| `apps/api/src/modules/master-data/product-master.service.ts` | حذف `listRelations/addRelation/removeRelation` (منتقل‌شده) و import بلااستفاده |
| `apps/web/src/app/products/[id]/product-relations.tsx` | **تازه** — تب فارسی RTL با فرم افزودن، فیلتر، ویرایش اولویت، حذف، نقشهٔ محدود، تاریخچه و اعلام مرزها |
| `apps/web/src/app/products/[id]/page.tsx` | جایگزینی تب قدیمی و حذف کامپوننت درون‌خطی |
| `apps/web/src/app/products/products-lib.ts` | انواع تولیدشدهٔ C6 (جایگزینی نوع قدیمی `ProductRelation`) |
| `packages/contracts/openapi.yaml` | ۴ مسیر بازطراحی‌شده + ۲ مسیر تازه، ۱۰ اسکیمای `ProductRelation*` |
| `packages/api-client/src/schema.ts` | کلاینت تولیدشده (بازتولید با `openapi-typescript`) |
| `apps/api/test/product-relations-unit.test.ts` | **تازه** — ۹ تست بی‌داده |
| `apps/api/test/product-relations.api.test.ts` | **تازه** — ۱۴ تست HTTP + PostgreSQL واقعی |
| `apps/web/src/app/products/[id]/product-relations.test.tsx` | **تازه** — ۷ تست کامپوننت |

**بدون مهاجرت، مجوز، نقش، grant، seed، سیاست RLS، شرکت یا دامنهٔ تازه.** جدول‌ها همان
`0046/0047/0060` هستند؛ هیچ DDL اجرا نشد (up/down/up با ۱٬۰۳۳ شیء یکسان بازتأیید شد).

### ۳٫۲ سطح API (قرارداد و کد ۳۲۳/۳۲۳، انحراف ۰)

| متد و مسیر | مجوز | رفتار |
| --- | --- | --- |
| `GET /products/{id}/relations?kind&direction&limit` | `master.product.view` | نمای کامل: کالا، `actor.can_update`، دو نوع با معنا/اثر/سیاست حلقه، ردیف‌ها با جهت، وضعیت و هشدار کالای مرتبط، شمارش‌ها، `downstream_notes_fa`، شش تصمیم باز |
| `GET /products/{id}/relations/history` | `master.product.view` | تاریخچهٔ تغییرناپذیر `product_catalog_history` (فقط کنشگر/زمان/نوع/اولویت؛ بدون before/after خام) |
| `GET /products/{id}/relations/graph?depth&kind` | `master.product.view` | پیمایش فقط‌خروجی، عمق ≤۳ و ≤۱۰۰ گره، با `technical_limits` و `semantics_fa` |
| `POST /products/{id}/relations` | `master.product.update` | بدنه فقط `related_id, kind, priority, confirm_add` |
| `PATCH /products/{id}/relations/{relationId}` | `master.product.update` | فقط `priority` (تنها فیلد قابل ویرایش در مدل مصوب) |
| `DELETE /products/{id}/relations/{relationId}` | `master.product.update` | فقط رابطهٔ خروجی همان کالا؛ سیاست موجود حفظ شد |

### ۳٫۳ کنترل‌ها و مرزها

- **گارد واحد و ترتیب:** `AuthGuard → PermissionsGuard → DomainBoundaryGuard`؛ بنابراین
  ممیزی ردِ دامنه هویت سروریشده دارد و درخواست بی‌توکن هرگز ممیزی نمی‌سازد.
- **مرز دامنه:** `x-domain-id` → `400 domain_context_not_supported`؛ `domain_id` در
  کوئری/بدنه → `400 domain_property_rejected` (پیش از این سطح، این فیلترها روی
  `ProductCatalogController` نصب نبود و ویژگی دامنه بی‌صدا نادیده گرفته می‌شد — این
  **شکاف پیش از C6** با نصب گارد بسته شد و در §۷ ثبت است).
- **فیلدهای ممنوع کلاینت:** `company_id/tenant*/actor*/created_by/permissions/role*/`
  `before_data/after_data/audit_id/domain_*/reciprocal/inverse/auto_create_inverse/…` →
  `400 forbidden_client_field` با فهرست فیلدها (نه حذف بی‌صدا). فیلد ناشناخته →
  `400 unsupported_request_field`. `reciprocal: true` صریحاً ممنوع است تا هیچ‌کس
  «ساخت معکوس خودکار» را از سمت کلاینت طلب نکند.
- **هویت/شرکت:** فقط از نشست (`AuthContext`)؛ شرکت هرگز از بدنه/کوئری خوانده نمی‌شود.
  RLS + FORCE RLS روی `product_relation` (تأیید زنده از `pg_class`/`pg_policy`).
- **یکنواختی ۴۰۴:** کالای ناموجود و کالای شرکت دیگر و رابطهٔ متعلق به کالای دیگر همه
  ۴۰۴ می‌دهند (بدون افشای وجود بین‌شرکتی). خواندن پیش از این، `assertProduct` نداشت.
- **تراکنش و ممیزی:** هر نوشتن در `CatalogAccess.write` (قفل advisory سراسری شرکت +
  GUC شرکت/کاربر + بازاعتبارسنجی مجوز) و با `recordRequired` **fail-closed**؛ شکست
  ممیزی ⇒ شکست کامل عملیات (`audit_partition_missing` → ۴۰۹ بدون تغییر).
- **تاریخچه:** تریگر `0060` در همان تراکنش `INSERT/UPDATE/DELETE` را ثبت می‌کند؛
  مسیر تاریخچه فقط همان شرکت و همان کالا را می‌خواند و دادهٔ خام before/after نمی‌دهد.
- **حلقهٔ جایگزین:** همان قاعدهٔ پیش از C6 بازنویسی‌شده با `WITH RECURSIVE` روی گراف
  همان شرکت؛ قفل advisory شرکت، پنجرهٔ check→insert را می‌بندد (بدون قاعدهٔ تازه).
- **قواعد مصوب در سطح DB دست‌نخورده:** `check (product_id <> related_id)`،
  `unique (product_id, related_id, kind)`، `check activity` وضعیت کالا، RLS هیبرید.
- **بدون اثر عملیاتی:** هیچ ماژول فروش/قیمت/موجودی/بارنامه/بسته لمس نشد؛ تست و شاهد
  زنده نشان می‌دهند وضعیت و `row_version` کالاها، تعداد `product_bundle` و ممیزی
  `entity_type='product'` پس از افزودن رابطه تغییر نمی‌کند.

---

## ۴) قرارداد و پایگاه‌داده

- OpenAPI: **۲۲۸ مسیر / ۳۲۳ عملیات / ۲۲۱ اسکیما / ۳ وب‌هوک** (`npm run openapi:check`).
- drift: **۳۲۳ عملیات در کد و ۳۲۳ در سند، اشتراک ۳۲۳، انحراف ۰**
  (`node scripts/contract-drift.mjs`). یک مسیر قدیمی (`/product-relations/{relationId}`)
  حذف و مسیرهای موجود بازطراحی و سه مسیر تازه (history/graph/relations/{relationId})
  اضافه شد؛ هیچ endpoint بی‌سند یا سند بی‌کد نماند.
- کلاینت: `npx openapi-typescript packages/contracts/openapi.yaml -o packages/api-client/src/schema.ts`
  و `npm run build:packages` PASS؛ مسیرهای تازه در `schema.ts` موجودند.
- پایگاه‌داده: **بدون مهاجرت**؛ `npm run test:migrations` → up/down/up با
  **۱٬۰۳۳ شیء یکسان**؛ `node scripts/check-test-partition.mjs` → **۹۹ فایل،
  `declared == computed`**.
- تست واحد C6 در مجموعهٔ بی‌داده است (بدون `DATABASE_URL` سبز می‌شود: ۹/۹).

---

## ۵) فرانت‌اند فارسی RTL

تب «روابط» بازنویسی شد (`product-relations.tsx`) و کامپوننت قدیمی درون‌خطی حذف شد:

- کارت‌های شمارش (خروجی/ورودی/جایگزین/مکمل)، فیلتر نوع و جهت، و برچسب جهت
  «از این کالا ←» / «→ به این کالا» تا جهت رابطه با مفهوم اشتباه نشود.
- فرم افزودن: جست‌وجوی کالا (خود کالا هرگز کاندید نیست)، انتخاب کالا با کد/نام/وضعیت،
  نوع، اولویت و **چک‌باکس تأیید صریح**؛ بدون تأیید هیچ درخواستی ارسال نمی‌شود.
- راهنمای درون‌فرم برای تفاوت جایگزین/مکمل و این‌که رابطهٔ معکوس خودکار ساخته نمی‌شود.
- جدول دو گروهی با وضعیت کالای مرتبط و هشدار کالای مسدود/متوقف، ویرایش درجای اولویت،
  حذف، و برچسب «از کالای مقابل مدیریت می‌شود» برای ردیف‌های ورودی.
- نقشهٔ روابط محدود و تاریخچهٔ روابط با کنشگر/زمان فارسی.
- بخش «مرزها و تصمیم‌های باز مالک» که BLOCKED/UNRESOLVED را با شناسه (`C6-D1..D6`) نشان می‌دهد.
- حالت فقط‌خواندنی بدون `master.product.update` با علت فارسی و بدون هیچ دکمهٔ نوشتن.
- همهٔ کدهای خطای سرور به پیام فارسی کنش‌پذیر نگاشت شده‌اند
  (`self_relation`, `duplicate_relation`, `relation_cycle`, `relation_not_found`,
  `relation_unchanged`, `forbidden_client_field`, `unsupported_request_field`,
  `invalid_id`, `product_not_found`, `domain_context_not_supported`,
  `domain_property_rejected`, `relation_write_failed/read_failed`).

---

## ۶) تست‌ها و راستی‌آزمایی

| مجموعه | نتیجه |
| --- | --- |
| واحد بی‌دادهٔ C6 (`product-relations-unit.test.ts`) | **۱ فایل / ۹ تست — PASS** (بدون `DATABASE_URL` هم سبز) |
| HTTP + PostgreSQL واقعی (`product-relations.api.test.ts`) | **۱ فایل / ۱۴ تست — PASS** |
| کامپوننت وب (`product-relations.test.tsx`) | **۱ فایل / ۷ تست — PASS** |
| رگرسیون هدفمند C1..C6 + مرز دامنه + امنیت | **۸ فایل / ۶۲ تست — PASS** |
| وب کامل | **۲۷ فایل / ۱۵۰ تست — PASS** |
| API کامل (DB) بدون فایل C6 | **۹۴/۹۸ فایل و ۱٬۵۷۴/۱٬۵۹۱ تست**؛ ۴ فایل/۱۷ عنوان شکست **عیناً همان‌های مبنا** |
| مقایسه با مبنا (`/tmp/pm02c5-api-full.log`) | همان ۵ فایل/۱۹ عنوان (attachments/customers/geofences/tours/postgres-init-role)؛ C6 هیچ شکست تازه‌ای ندارد؛ `attachments.api.test.ts` جداگانه **۹/۹ PASS** |
| مهاجرت‌ها | **۱٬۰۳۳ شیء یکسان** در دو اجرا |
| پارتیشن تست | **۹۹ فایل، `declared == computed`** |
| قرارداد | **۲۲۸ مسیر / ۳۲۳ عملیات / ۲۲۱ اسکیما / ۳ وب‌هوک**، drift **۰** |
| ساخت | `npm run typecheck` (۰ خطا)، `npm run build`، `node apps/api/dist/main.js` PASS |

نکتهٔ صداقت: «Full DB PASS» اعلام نمی‌شود؛ شکست‌های باقی‌مانده **پیش‌موجود و محیطی** هستند
(Redis `ECONNREFUSED`، و چهار فایل خارج از دامنهٔ Product Master) و با اجرای مبنا مقایسه شده‌اند.

---

## ۷) شکاف‌های پیش از C6 که بسته شد / باقی‌ماندهٔ ثبت‌شده

1. **بسته شد — گارد مرز دامنه:** `ProductCatalogController` (روابط/باندل/alias/صفات)
   `DomainBoundaryGuard` نداشت؛ اکنون کل سطح روابط گارد دارد و `x-domain-id`/`domain_id`
   صریحاً ۴۰۰ می‌گیرند (شاهد زنده: سه حالت ۴۰۰).
2. **بسته شد — خواندن بدون `assertProduct`:** `listRelations`/`listBundle` کالای
   ناموجود/بین‌شرکتی را ۲۰۰ توخالی برمی‌گرداندند؛ نمای جدید ۴۰۴ یکنواخت می‌دهد.
3. **بسته شد — نبود ویرایش اولویت و نمای ورودی:** اکنون `PATCH` اولویت و نمای دوطرفه
   با تفکیک `editable/removable` وجود دارد.
4. **باقی‌مانده (خارج از دامنهٔ C6، ثبت‌شده):** مسیرهای `bundle` و `alias/attribute`
   همان کنترلر همچنان گارد مرز دامنه و `assertProduct` کامل ندارند؛ C6 آن‌ها را تغییر
   نداد چون دامنهٔ مجاز فقط «روابط» بود. این مورد به‌عنوان ورودی C7/PM-B ثبت می‌شود و
   هیچ رفتار عملیاتی تازه‌ای برای آن ساخته نشد.
5. **باقی‌مانده:** مسیر قدیمی `DELETE /product-relations/{relationId}` حذف شد؛ کلاینت‌های
   بیرونی (اگر وجود داشته باشند) باید به مسیر جدید کالا‑محور مهاجرت کنند. این تغییر
   قرارداد در همین سند و در OpenAPI مستند شده است.

---

## ۸) شاهد زندهٔ همین‌مبدأ

`docs/product-inventory/evidence/task-pm-02/VERIFICATION-C6-LIVE.txt` (۱۰٬۰۹۸ بایت،
sha256 `6bff0d1b21ffcf6e00b9e2a8a56fd959c4b0a8debaf4945819a15ba09f43473f`)
روی PostgreSQL 16.2 واقعی و API ساخته‌شده از همین درخت:
نمای خالی با دو نوع و شش تصمیم باز → افزودن A→B بدون ساخت معکوس → نمای ورودی از B →
`self_relation` (۴۰۰)، `duplicate_relation` (۴۰۹)، `relation_cycle` (۴۰۰) و پذیرش حلقهٔ
مکمل → شش ۴۰۰ صریح برای فیلد شرکت/`reciprocal`/نوع نامعتبر/کوئری ناشناخته/هدر و
ویژگی دامنه → ۴۰۱ بی‌نشست و ۴۰۴ ناموجود → ویرایش اولویت + `relation_unchanged` +
`unsupported_request_field` + تاریخچهٔ UPDATE → سقف عمق پیمایش → هشدار کالای مسدود →
حذف با ممیزی و تاریخچهٔ `INSERT,UPDATE,DELETE` → بی‌اثر بودن روی کالا/بسته/ممیزی
«product» → پوستهٔ وب ۲۰۰ → **بازگشت شمارش‌ها به مبنا** (product=4، product_relation=0،
product_bundle=0، audit(product_relation)=0). خروجی هیچ‌جا before/after خام، کلید
استوریج/امضا، دادهٔ تماس یا زیرساخت لو نمی‌دهد (بررسی خودکار `no_leak`).

---

## ۹) مرزها، احکام و موارد UNVERIFIED

**BLOCKED / NOT AUTHORIZED:** جایگزینی خودکار در اسناد و هر بازنویسی سند (C6-D1)؛
گسترش عملیاتی بسته و P5 (C6-D6)؛ هر اثر بر قیمت/موجودی/COGS/اسناد؛ رابطهٔ دامنه‌ای
(PM-B1..PM-B8)؛ نوع رابطهٔ سوم بدون تصویب مالک؛ G-03 و جایگزینی D4؛ حذف/بایگانی/
نگهداشت؛ مهاجرت/مجوز/نقش/grant/RLS/شرکت/seed تازه؛ پذیرش کامل Product Master؛
استقرار/ادغام/انتشار.

**UNRESOLVED (تصمیم مالک، عمداً پیاده نشده):** تقارن و رابطهٔ معکوس خودکار (C6-D2)؛
قاعدهٔ حلقه برای مکمل (C6-D3)؛ کاردینالیتی/الزام حداقل–حداکثر (C6-D4)؛ مسدودسازی رابطه
با کالای غیرفعال (C6-D5).

**UNVERIFIED:** بازبینی دستی مرورگر (RTL/دسترس‌پذیری/کنسول/تعامل واقعی)، زیرساخت معادل
تولید (MinIO/S3 واقعی، صف/کش)، پذیرش نهایی Product Master، و اجرای کامل e2e مرورگری.

---

## ۱۰) سیاست ثبت نتیجهٔ CI و شش نمای SHA

CI فقط روی SHA دقیقِ همین commit اجرا و ثبت می‌شود؛ شش نما (HEAD، `origin/<branch>`،
`git ls-remote`، head PR، مبنای اعلام‌شده، SHA پیام commit) باید هم‌خوان باشند و
**هیچ commit پس از CI** ساخته نمی‌شود. بدنهٔ PR #14 فقط **افزودنی** است: پیشوند
۱۳۱٬۴۷۴ نویسه / ۱۴۶٬۹۳۲ بایت با sha256
`c8fb45a7211bbd49bc59ceb38d8124a15d1a6a524ec8531204e08a69a1a00610` بایت‌به‌بایت
حفظ می‌شود. merge/approve/release انجام نشد؛ PR همچنان `DRAFT` است.
