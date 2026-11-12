# TASK-PM-02-C5 — چرخهٔ حیات مرکزی کالا (Central Product Lifecycle)

**وضعیت:** پیاده‌سازی شده برای **خواندن وضعیت/تاریخچه و گذارهای شاهدپذیر `active↔blocked`**؛
**همهٔ گذارهای به/از `discontinued` عمداً `BLOCKED / NOT AUTHORIZED`** هستند و هیچ API،
تست یا کنترلی آن‌ها را تبلیغ/اجرا نمی‌کند.
**نوع کار:** DEVELOPMENT واقعی (بک‌اند + قرارداد + فرانت‌اند + تست + شاهد زندهٔ همان‌مبدأ)، نه ممیزی/مستندسازی صرف.
**عامل:** Agent-1 (Arena.ai) · **شاخه:** `arena/be5eaff3-green-dms` · **PR:** #14 (`OPEN / DRAFT`, base `main`).
**مبنا:** `f0d39980fbcd3d1ca4d00cb13b4db24b3f664341` (پایان C4 = head شاخه / `origin` / `ls-remote` / head PR / مبنای اعلام‌شده).
**چک‌پوینت قابل بازیابی:** `/home/user/pm02-c5-checkpoint.tar.gz` + `.sha256`
(`0c2057d700cfdd0457b2fb6b5cc2176c851c3ce557ce1abd4cb6b3d012843f88`)،
`/home/user/pm02-c5-checkpoint.bundle` (تاریخچهٔ کامل، ۳٬۱۴۸٬۷۴۰ بایت)، ۲٬۹۰۳ فایل استخراج‌شده،
`sha256sum -c` → `OK`، `git bundle verify` → complete history. بدنهٔ PR پیش از C5:
۱۲۶٬۲۸۶ نویسه / ۱۳۹٬۹۶۸ بایت، sha256
`4b4d1a1d2904239130926fd597268d4c56f6dd6ad90c79f9fbd7e930693d4b0b` — **بایت‌به‌بایت حفظ می‌شود**.

---

## ۱) بازیابی مبنا و حفظ شواهد

`git fetch` / `git pull --ff-only` → `Already up to date`؛ شش نمای SHA در ابتدا همگی
`f0d39980fbcd3d1ca4d00cb13b4db24b3f664341`؛ worktree پاک و `git diff --check=0`.
چک‌پوینت پیش از نخستین نوشتن ساخته و راستی‌آزمایی شد. همهٔ اسناد، تست‌ها و شواهد
C1/C2/C3/C4/B2/M4/K/J **بدون ویرایش** ماندند؛ C5 فقط پیوست‌های **افزودنی** به
`EVIDENCE_INDEX.md`، `PRODUCT_MASTER_OPERATOR_GUIDE_FA.md` (بخش ۱۰) و بدنهٔ PR اضافه می‌کند.
هیچ amend / force-push / reset / rebase / merge / approve / release / deploy انجام نشد.

> نکتهٔ تلهٔ بازیابی: `git pull --ff-only` فایل `.git/FETCH_HEAD` را بازنویسی می‌کند و SHA
> `main` را اول می‌گذارد؛ برای تطابق شش‌نمایی نهایی باید پس از push،
> `git fetch origin arena/be5eaff3-green-dms` تازه اجرا و SHA شاخه (نه `main`) خوانده شود.

---

## ۲) دامنهٔ مجاز و تصمیم‌های BLOCKED (منبع حقیقت)

| موضوع | حکم C5 | شاهد |
| --- | --- | --- |
| `create` کالا | `status` در بدنه پذیرفته **نمی‌شود**؛ پیش‌فرض DB `active` | `0005`، `CreateProductDto`، تست HTTP |
| `active → blocked` و `blocked → active` | **PASS** — همان گذار شاهدپذیر D4 با `row_version` و `confirm_sensitive` | `products.api.test.ts`، `product-master-core.test.ts`، C5 API/unit |
| گذار بی‌تغییر (`active→active`, `blocked→blocked`) | رد صریح `lifecycle_transition_unchanged` (بدون رویداد/ممیزی) | `product-lifecycle.rules.ts`، تست واحد |
| `active→discontinued`, `blocked→discontinued`, `discontinued→active`, `discontinued→blocked`, `discontinued→discontinued` | **BLOCKED / NOT AUTHORIZED** — `400 lifecycle_transition_blocked` | ماتریس C5، تست واحد، تست HTTP، شاهد زنده |
| کالای دارای `discontinued` (دادهٔ قدیمی) | فقط **خواندنی**؛ `available_actions=[]`، بدون کنترل UI | تست HTTP، شاهد زنده |
| حذف نرم/بازگردانی/بایگانی/نگهداشت | **BLOCKED** — فقط `deleted_at` موجود؛ مسیر `deleted_soft` → `404 product_not_found` | ماتریس، `product.repository.ts` |
| معنای «توقف»، برگشت‌ناپذیری، دلیل/مدت، اثر بر عملیات درجریان، بایگانی | **BLOCKED** تا تصویب مالک | `PRODUCT_LIFECYCLE_OWNER_DECISIONS_FA` |
| تأیید دونفرهٔ G-03 و جایگزینی D4 | **BLOCKED** — `confirm_sensitive` شخص دوم نیست | `policy.two_person_approval='BLOCKED'` |
| چرخهٔ حیات/عضویت دامنه‌ای PM-B1..PM-B8، Q1..Q5، G-13 | **BLOCKED** — وضعیت مرکزی ≠ دسترس‌پذیری دامنه | نگهبان مرز دامنه، `domain_context_not_supported` |
| رفتار downstream (قیمت، بارنامه، سفارش، موجودی، فاکتور، ضمائم) | **دست‌نخورده** — همان قید/قرائت موجود | `pricing-engine.ts:501`، `waybill.repository.ts:155` |

تصحیح صریح نسبت به پیش‌نویس اولیهٔ C5: نسخهٔ نخست ماتریس، شش گذار (شامل چهار گذار
`discontinued`) را `supported` می‌دانست. این با تصمیم مصوب/کشف C5 («همهٔ گذارهای شامل
`discontinued` مسدود») **در تضاد بود** و در همین کار اصلاح شد: ماتریس، سرویس، نگهبان D4
(که import و PATCH هم از آن می‌گذرند)، قرارداد OpenAPI، کلاینت تولیدشده، UI و تست‌ها
همگی اکنون فقط `active↔blocked` را مجاز می‌دانند. هیچ گذار «متوقف»ی پیاده‌سازی نشده است.

---

## ۳) معماری و امنیت

### ۳٫۱ فایل‌های تازه/ویرایش‌شده

```
apps/api/src/modules/master-data/product-lifecycle.rules.ts      (جدید)  ماتریس ۳×۳ + deleted_soft، فیلدهای ممنوع، یادداشت‌های مالک
apps/api/src/modules/master-data/product-lifecycle.service.ts    (جدید)  read + transition با تراکنش CatalogAccess.write
apps/api/src/modules/master-data/product-lifecycle.controller.ts (جدید)  ۲ مسیر با AuthGuard/PermissionsGuard/DomainBoundaryGuard
apps/api/src/modules/master-data/product-sensitivity.ts          (ویرایش) اعمال همان ماتریس در نقطهٔ واحد D4
apps/api/src/modules/master-data/product.dto.ts                  (ویرایش) PRODUCT_STATUSES = PRODUCT_LIFECYCLE_STATUSES
apps/api/src/modules/master-data/product-master.service.ts       (ویرایش) پیش‌نمایش import: ردیف discontinued صریحاً رد می‌شود
apps/api/src/modules/master-data/master-data.module.ts           (ویرایش) ثبت سرویس/کنترلر پیش از ProductController
packages/contracts/openapi.yaml                                  (ویرایش) ۲ مسیر + ۷ اسکیمای ProductLifecycle*
packages/api-client/src/schema.ts                                (تولیدشده)
apps/web/src/app/products/[id]/product-lifecycle.tsx             (جدید)  تب RTL چرخهٔ حیات
apps/web/src/app/products/[id]/page.tsx                          (ویرایش) تب «چرخه حیات» به‌عنوان تب نخست + وضعیت فقط‌خواندنی
apps/api/test/product-lifecycle.rules.unit.test.ts               (جدید)  ۴ تست بی‌داده
apps/api/test/product-lifecycle.api.test.ts                      (جدید)  ۱۳ تست HTTP + PostgreSQL واقعی
apps/api/test/product-master-import.test.ts                      (ویرایش) ۱ تست BLOCKED برای discontinued در import
apps/web/src/app/products/[id]/product-lifecycle.test.tsx        (جدید)  ۶ تست کامپوننتی
```

### ۳٫۲ نگهبان واحد، نه سیاست تازه

`product-lifecycle.rules.ts` تنها مرجع ماتریس است و در **همان** نقطهٔ D4
(`product-sensitivity.ts → assertSensitiveConfirmed`) اعمال می‌شود؛ بنابراین `PATCH /products/{id}`،
import گروهی، بسته‌بندی/واحد، بستهٔ محصول و سرویس اختصاصی چرخهٔ حیات همگی یک حکم می‌گیرند.
هیچ مجوز، نقش، grant، RLS، مهاجرت، جدول، شرکت، دامنه، ارائه‌دهنده یا seed تازه‌ای ساخته نشد؛
فقط `master.product.view` / `master.product.update` / `master.product.status` موجود (۰۰۴۶) reuse شدند.

### ۳٫۳ تراکنش، ممیزی و هویت

- `transition` در `CatalogAccess.write` اجرا می‌شود: مجوز پیش/داخل تراکنش بازاعتبارسنجی،
  GUCهای `app.company_id`/`app.user_id`، قفل advisory روی `catalog:${companyId}`، و
  `TenantAwarePool` که کوئری‌ها را به همان کلاینت تراکنش می‌فرستد.
- `SELECT … FOR UPDATE` + مقایسهٔ `row_version` قفل‌شده، سپس `repo.update(..., row_version)`
  با قید نسخه در `WHERE` و در نهایت `recordRequired` (fail-closed) در همان تراکنش.
  تریگر تغییرناپذیر `0060` نیز در همین تراکنش before/after را با `app.user_id` ثبت می‌کند.
- کنشگر و زمان فقط از نشست/سرور؛ `before_data`/`after_data`، `actor_user_id`، `created_by`،
  `approved_by`، `company_id`، `permissions` و `x-domain-id` در بدنه/کوئری **۴۰۰ صریح**
  (`forbidden_client_field`) می‌گیرند و فیلد تعریف‌نشده `unsupported_request_field`.
- خطاها امن‌اند: `invalid_id`، `product_not_found` یکنواخت (بدون افشای وجود بین‌شرکتی)،
  `version_conflict` بدون SQL، و خطای زیرساخت `lifecycle_transition_failed` بدون جزئیات DB.

### ۳٫۴ مسیرها

```
GET  /api/v1/products/{id}/lifecycle                 master.product.view    → وضعیت، row_version، سیاست، actor،
                                                                            available_actions، ماتریس ۱۲ ردیفی،
                                                                            یادداشت‌های downstream/مالک، تاریخچهٔ 0060
POST /api/v1/products/{id}/lifecycle/transitions     master.product.update  → { target_status, row_version,
                                                                            confirm_sensitive } → 200 / 400 / 403 / 404 / 409
```

`@HttpCode(HttpStatus.OK)` روی POST، و ثبت کنترلر **پیش از** `ProductController` تضمین می‌کند
`/products/:id/lifecycle` با مسیرهای `:id/*` عمومی برخورد نکند.

### ۳٫۵ خواندن تاریخچه

تاریخچه فقط از `product_catalog_history` همان شرکت/کالا خوانده می‌شود
(`entity_type='product'`، تغییر وضعیت یا INSERT/DELETE)، با `left join` روی
`app_user`/`person` **همان شرکت**؛ خروجی فقط `actor_user_id`، برچسب کنشگر، نوع رویداد،
from/to status و زمان است. `before_data`/`after_data` خام، دادهٔ تماس/هویتی یا جزئیات
زیرساخت هرگز برگردانده نمی‌شود. صفحه‌بندی با `before`/`limit` (۱..۱۰۰، پیش‌فرض ۳۰).

---

## ۴) قرارداد، کلاینت و پایگاه‌داده

- `packages/contracts/openapi.yaml`: ۲ مسیر تازه و ۷ اسکیمای `ProductLifecycle*`؛
  `ProductLifecycleAction.target_status` و `ProductLifecycleTransitionResult.{from_status,status}`
  فقط `[active, blocked]` هستند، `status` در `ProductUpdate` و `confirm_sensitive` در import
  توضیح صریح BLOCKED گرفتند. `npm run openapi:check`: **۲۲۶ مسیر / ۳۲۰ عملیات / ۲۱۰ اسکیما / ۳ وب‌هوک**.
- `node scripts/contract-drift.mjs`: **۳۲۰/۳۲۰**، انحراف enum/required صفر.
- `npx openapi-typescript` → `packages/api-client/src/schema.ts` (+۲۷۰ خط) و `build:packages` PASS.
- **بدون مهاجرت تازه:** چرخهٔ up/down/up روی DB موقت همچنان **۱٬۰۳۳ شیء یکسان**؛
  پارتیشن تست‌ها **۹۷ فایل، declared == computed**.

---

## ۵) فرانت‌اند فارسی RTL

- تب نخست صفحهٔ جزئیات کالا: «چرخه حیات» (`product-lifecycle.tsx`)؛ کارت وضعیت، نسخه،
  سیاست D4 و علت دردسترس‌نبودن عمل؛ دکمه‌های عمل **فقط** از `available_actions` سرور ساخته
  می‌شوند و یک فیلتر دفاعی دوم، هر عمل `discontinued` را حتی در پاسخ کهنه حذف می‌کند.
- برای وضعیت `discontinued` پیام ثابت «فقط خواندنی / BLOCKED تا تصویب مالک» نمایش داده
  می‌شود و هیچ چک‌باکس/دکمهٔ تأیید رندر نمی‌شود.
- جریان تأیید: انتخاب عمل ← چک‌باکس صریح ← «تأیید و اجرای گذار» با
  `{ target_status, row_version, confirm_sensitive: true }`؛ پس از موفقیت `onChanged()` و
  بازخوانی؛ در `version_conflict` بازخوانی + پیام، بدون پاک‌شدن خطا.
- تاریخچه با «رویدادهای قدیمی‌تر» و cursor؛ زمان با `fa-IR` و منطقهٔ زمانی تهران؛
  نقش‌های `alert`/`status`، `aria-busy`، `aria-expanded`، `dir="rtl"` و متن فارسی.
- تب «مشخصات» دیگر هیچ `select` وضعیت و هیچ ارسال `status` در PATCH عمومی ندارد؛
  به‌جای آن نشان وضعیت **فقط‌خواندنی** با ارجاع به تب چرخهٔ حیات نشان داده می‌شود
  (حذف کنترل جعلی/تکراری، بدون حذف قابلیت از دستِ رفته چون مسیر واقعی همان تب است).

---

## ۶) تست‌ها و راستی‌آزمایی

| دروازه | نتیجه |
|---|---|
| تست واحد بی‌دادهٔ C5 | **PASS ۱ فایل / ۴ تست** (ماتریس ۳×۳ + `deleted_soft`، BLOCKEDها، فیلدهای ممنوع، نگهبان D4) |
| تست HTTP + PostgreSQL واقعی C5 | **PASS ۱ فایل / ۱۳ تست** |
| تست مخرب‌نما/دادهٔ قدیمی در import | **PASS** (پیش‌نمایش و commit هر دو `lifecycle_transition_blocked`) |
| جزء وب C5 | **PASS ۱ فایل / ۶ تست** |
| وب کامل | **PASS ۲۶ فایل / ۱۴۳ تست** |
| واحد بی‌دادهٔ API | **PASS ۳۶ فایل / ۴۱۶ تست** |
| رگرسیون هدفمند C1–C5 | **PASS ۱۱ فایل / ۲۴۱ تست** |
| اجرای کامل DB-backed API | **۹۲/۹۷ فایل و ۱٬۵۶۳/۱٬۵۸۲ تست PASS**؛ ۵ فایل / ۱۹ عنوان شکست با مجموعهٔ **عیناً یکسان** `/tmp/pm02c4-api-full.log` (PostGIS/trust-auth/MinIO محلی) — «Full DB PASS» اعلام نشد |
| OpenAPI / drift / کلاینت | **PASS** ۲۲۶/۳۲۰/۲۱۰/۳، drift ۳۲۰/۳۲۰/۰، `build:packages` |
| typecheck / build | **PASS** ریشه (`npm run typecheck`)، `npm run build` (API + Next)، `node apps/api/dist/main.js` |
| مهاجرت‌ها / پارتیشن / diffcheck | **PASS** ۱٬۰۳۳ شیء یکسان، ۹۷ فایل، `git diff --check=0` |
| شاهد زندهٔ همان‌مبدأ | **PASS** `evidence/task-pm-02/VERIFICATION-C5-LIVE.txt`، ۹٬۷۹۸ بایت، sha256 `4d392651b7b9cc4796c52b29c3bcac2c2d5696b567aeb02fe4f078db03dff417` |

شاهد زنده روی `greendms_c1_preview`، API ساخته‌شده روی `:4000` و Next rewrite همان‌مبدأ:
سلامت `database=up`، ورود `c1_admin`، ساخت کالا با `active/row_version=0`، نمای ۱۲ ردیفی با
دقیقاً ۲ گذار پشتیبانی‌شده و ۵ گذار BLOCKED، رد ۶ درخواست خواندنی و ۷ درخواست گذارِ ساختگی/ناقض (شرکت/کنشگر/دامنه/فیلد
ناشناخته/limit/cursor/بدون تأیید/بدون نسخه/بی‌تغییر/`discontinued` روی POST و PATCH)،
گذار `active→blocked` با `row_version 0→1`، ممیزی `product_lifecycle.transition|blocked|active`
با کنشگرِ نشست، تاریخچهٔ `0060`، `409 version_conflict` بدون افشای SQL، بازگشت `blocked→active`
(۱→۲)، و کالای قدیمی `discontinued` که هیچ عمل/گذاری ندارد و بدون تغییر می‌ماند.
شمارش‌ها پس از پاک‌سازی ردیف‌های آزمون به مبنای `product=4 · audit_log(product)=3` برگشت.

---

## ۷) مرزها، احکام و موارد UNVERIFIED

**PASS:** خواندن وضعیت/نسخه/سیاست/تاریخچه، گذار تراکنشی `active↔blocked` با D4 و قفل
خوش‌بینانه، ممیزی fail-closed، تاریخچهٔ تغییرناپذیر، رد صریح فیلدهای ساختگی، جداسازی شرکت،
قرارداد/کلاینت/تست/UI RTL، شاهد زندهٔ همان‌مبدأ. **FAIL: هیچ** در محدودهٔ تحویل‌شده.

**BLOCKED / NOT AUTHORIZED:** همهٔ گذارهای به/از `discontinued` و معنای توقف/برگشت‌ناپذیری/
دلیل/بایگانی؛ حذف/بازگردانی/نگهداشت؛ تأیید دونفرهٔ G-03 و هر جایگزینی سیاست D4؛
چرخهٔ حیات/عضویت دامنه‌ای PM-B1..PM-B8 و Q1..Q5 و G-13؛ هر مهاجرت/مجوز/نقش/grant/RLS/
شرکت/دامنه/seed تازه؛ تغییر رفتار قیمت/بارنامه/سفارش/موجودی/فاکتور/ضمائم؛ پذیرش کامل
Product Master؛ استقرار تولید. PR #14 همچنان `OPEN / DRAFT` بدون merge/approve/release/deploy.

**UNVERIFIED:** بازبینی دستی مرورگر (RTL، a11y، کنسول، تعامل واقعی؛ محتوای تب کلاینتی است و
پوستهٔ SSR آن را رندر نمی‌کند)، زیرساخت معادل تولید (MinIO/S3 واقعی)، و CI دقیقSHAی HEAD نهایی
تا لحظهٔ نگارش این سند (نتیجه پس از push به‌صورت افزودنی در بدنهٔ PR و گزارش چت ثبت می‌شود).
تست محلی و شاهد زنده جایگزین تأیید مالک یا آمادگی تولید نیستند.

---

## ۸) سیاست ثبت نتیجهٔ CI و شش نمای SHA

کامیت C5 یک **کامیت معمولی** روی همین شاخه و push معمولی به `origin/arena/be5eaff3-green-dms`
است. SHA نهایی، چهار workflow / هشت check، شش نمای SHA و هش بدنهٔ PR پس از پیوست C5 فقط در
**بدنهٔ PR #14** و **گزارش پایانی چت** ثبت می‌شوند؛ هیچ فایل مخزن پس از CI ویرایش نمی‌شود و
هیچ کامیت trigger مصنوعی وجود ندارد. پیوست بدنهٔ PR افزودنی است و پیشوند
`4b4d1a1d2904239130926fd597268d4c56f6dd6ad90c79f9fbd7e930693d4b0b` بایت‌به‌بایت حفظ می‌شود.
`gh api -X PATCH --input` (نه `gh pr edit --body-file`) استفاده می‌شود و
queued / in_progress / null / cancelled هرگز PASS اعلام نمی‌شوند.
