# TASK-PM-02-C1 — مرکز تصاویر و اسناد کالا (Product Media)

**وضعیت:** پیادهسازی شده · **نوع کار:** DEVELOPMENT (بکاند + قرارداد + فرانتاند + تست)، نه ممیزی/مستندسازی صرف
**شاخه:** `arena/be5eaff3-green-dms` · **PR:** #14 (`OPEN / DRAFT`, base `main`)
**مبنای بازیابی:** `deefa05b89de62da7a34fb920626a0adca920f57` (همان B2 final / head شاخه / `ls-remote` / head PR)
**چکپوینت قابل بازیابی:** `/home/user/pm02-c1-checkpoint.tar.gz` + `.sha256`
(`fe76589ea73322a2816f24e17a834f82da6dbfd227e2fb6dfe969501cb636e32`, ۲٬۸۴۴ فایل tracked، `sha256sum -c` موفق)

---

## ۱) ماژول انتخابشده و شواهد واجدشرایطبودن

**انتخاب: «مدیریت تصویر و سند محصولمحور»** — فهرست، بارگذاری، نمایش تصویرِ اصلی خودکار،
دریافت پیوند دانلود تازه، و UI فارسی RTL روی تب جزئیات کالا.

شواهد صریح (بدون هیچ تصمیم دامنهای):

| منبع | متن/معنا | نتیجه |
| --- | --- | --- |
| `PRODUCT_MASTER_TARGET_DESIGN.md` §0، سطر ۲۴ | «بقیهٔ مواردِ §۸ (attributes، variants، alias، **تصویر**، …، import، snapshot) طبقِ نقشهٔ راه الزامیاند و **تصمیمِ دامنهای نمیخواهند**» | مجاز |
| همان §A، سطر ۳۸ | «**بازاستفاده از `attachment.owner_type='product'` (زنجیرهٔ مالکیت موجود)**. قراردادِ تصویرِ اصلی = نخستین بر اساس `created_at` (**بدونِ مهاجرت**)؛ … 🟡 API موجود، **UX ندارد**» | دقیقاً شکاف قابل پیادهسازی |
| همان §B4، سطر ۱۳۰ | «نخستینِ attachment بر اساسِ `created_at` = تصویرِ اصلی … تا آن زمان UI این رفتار را بهشکلِ **«اصلی (خودکار)»** نشان دهد» | قاعدهٔ v1 و برچسب UI مصوب |
| همان §F، سطر ۱۹۹ | «سایر فیلدها (نام، alias، **تصویر**، …) \| RBAC عادی (`master.product.*`) + **audit**» | مدل مجوز/ممیزی |
| `GAP_REGISTER.md` G-06 و یادداشت M4/F | «باقیمانده … UX تصویر» / «**نبود UI محصولمحور برای ضمائم** … همچنان از یافتههای M3 هستند» | شکاف باز و مستند |

**چرا رد نشد:** PM-B1/B2/B4 و PM-B3/B5–B8، Q1–Q5، G-03 به «هویت/چرخهٔ حیات/عضویت/اختیار دامنه»
مربوطاند؛ تصویر کالا هیچیک را تعیین نمیکند. `POST /attachments` عمومی نیز پیشتر مجوز
`attachment.upload` و زنجیرهٔ مالکیت راستیآزمایشدهٔ `product.company_id` داشت؛ C1 فقط
**نمای محصولمحور** و **قاعدهٔ مصوب تصویرِ اصلی** و **RBAC/ممیزی §F** را روی همان پایه میسازد.

**چرا ماژولهای دیگر انتخاب نشدند:** full import round-trip / مرکز import عمومی (Q1–Q5 و سیاست
مالک باز)، UI برند/UOM (نیازمند گسترهٔ مصوب)، و هرگونه registry/لایفسانیکل/انتساب/RLS
دامنهای `BLOCKED`اند. قابلیتهای تکراری موجود (duplicate-check، alias، صفت، رابطه، بسته،
import/export/history/bulk-maintenance) دوباره پیادهسازی نشدند.

**ارزش کسبوکاری:** اپراتور کاتالوگ اکنون بدون ترک صفحهٔ کالا میتواند تصویر/کاتالوگ PDF
بارگذاری کند، تصویر اصلی و ترتیب قطعی را ببیند، پیوند منقضیشده را تازه کند و اسناد را
دانلود کند؛ این همان باقیماندهٔ صریح G-06 است و پایهای است برای صفات/انواع بعدی بدون
وابستگی به تصمیمات دامنه.

---

## ۲) عملکرد تحویلشده (واقعی، نه placeholder)

**بکاند** (`ProductMediaService` + `ProductMediaController`):

1. `GET /products/{id}/media` → نمای محصولمحور شامل `items` (قدیمیترین اول، ترتیب قطعی
   `created_at` سپس `id`)، `primary_image`، `counts`، قاعده/برچسب/یادداشت مصوب و پیام
   صریح «صرفاً کاتالوگ مرکزی، بدون وضعیت دامنهای».
2. `POST /products/{id}/media` → آپلود multipart فقط با فیلد `file`. مالک و شرکت **فقط از
   مسیر و نشست** مشتق میشوند؛ ارسال `owner_type`/`owner_id`/`company_id`/`uploaded_by`/
   `storage_key` صریحاً `400 product_media_owner_scope_rejected` میگیرد (نه حذف بیصدا).
   همان خط لولهٔ موجود (سقف ۸ مگابایت، allowlist، امضای بایتی، SHA-256، کلید نامفضاشده،
   URL امضاشده) دوباره استفاده شده است.
3. `GET /products/{id}/media/{mediaId}/url` → URL امضاشدهٔ تازه، با قید صریح
   `owner_id = {id}` و `company_id` نشست (ضمیمهٔ کالای دیگر حتی در همان شرکت ۴۰۴ میگیرد).
4. تصویرِ اصلی = نخستین **تصویر** بر اساس `created_at`، محاسبهشده در لحظهٔ خواندن؛
   سند PDF هرگز اصلی نمیشود. هیچ `is_primary`/`sort_order` ذخیرهشده و هیچ مهاجرت تازهای نیست.
5. آپلود + metadata + رویداد `audit_log` (`action=create`، `entity_type=product_media`)
   در **یک تراکنش**؛ شکست ممیزی ⇒ rollback و پاکسازی شیء آپلودشده (بدون اورفان).
6. **رفع نقص یافتهشده در C1:** نام فایل فارسی multipart توسط multer/busboy بهصورت latin1
   خوانده میشد («نمای-اصلی.png» → «ÙÙØ§Û-Ø§ØµÙÛ.png»). `decodeUploadFileName`
   فقط رشتههایی را بازکدگذاری میکند که رفتوبرگشت بایتیشان دقیق باشد؛ نام ASCII/یونیکد
   درست و محتوای فایل/SHA-256/allowlist تغییری نمیکنند.

**فرانتاند** (`apps/web/src/app/products/[id]/product-media.tsx`):

- تب دهم «تصاویر و اسناد» در صفحهٔ جزئیات کالا؛ بیرون از `<fieldset disabled>` قرار گرفت
  تا نشستهای فقطخواندنی هم بتوانند ببینند/دانلود کنند.
- فرم آپلود با `accept`، اعتبارسنجی سریع نوع/حجم، نام فایل انتخابشده و حجم فارسی،
  پیام موفقیت/خطای فارسی (`role="status"` / `role="alert"`) و بارگذاری مجدد فهرست.
- کارتهای تصویر با برچسب **«اصلی (خودکار)»** دقیقاً از سرور، و «پیوند تازه / دانلود»
  برای URLهای منقضیشده؛ کارتهای سند PDF با «دانلود سند».
- شمارش فارسی، تاریخ جلالی (`toPersianDateTime`)، `bdi`/`dir="auto"` برای نام فایل،
  `aria-label`/`aria-busy`، حالت خالی، یادداشت محدودیت مصوب §B4 و پیام مرز مرکزی.

`uploadProductMedia` در `apps/web/src/lib/api.ts` همان نشست/refresh را دارد و هیچ فیلد
مالکیتی ارسال نمیکند.

---

## ۳) فایلهای تغییریافته و اثر معماری

| فایل | تغییر |
| --- | --- |
| `apps/api/src/modules/master-data/product-media.rules.ts` | **جدید** — قواعد خالص §B4، بدون DB/MinIO |
| `apps/api/src/modules/master-data/product-media.service.ts` | **جدید** — بیزنسلاجیک، RBAC، ممیزی تراکنشی، محدودسازی مالک |
| `apps/api/src/modules/master-data/product-media.controller.ts` | **جدید** — ۳ مسیر، `DomainBoundaryGuard` روی هر سه |
| `apps/api/src/modules/master-data/master-data.module.ts` | import `AttachmentsModule` + ثبت کنترلر/سرویس پیش از `ProductController` |
| `apps/api/src/modules/attachments/attachments.module.ts` | export توکن `ATTACHMENTS_REPOSITORY` (همان ریپوزیتوری، بدون کوئری تازه) |
| `apps/api/src/modules/attachments/attachments.service.ts` | `decodeUploadFileName` + اصلاح نام فایل فارسی |
| `packages/contracts/openapi.yaml` | +۲ مسیر / +۳ عملیات / +۲ اسکیما |
| `packages/api-client/src/schema.ts` | تولید مجدد با `openapi-typescript` (فقط +۲۳۳ خط، بدون حذف) |
| `apps/api/test/product-media-rules.test.ts` | **جدید** — ۹ تست واحد بیداده |
| `apps/api/test/product-media.api.test.ts` | **جدید** — ۸ تست HTTP واقعی + PostgreSQL بومی |
| `apps/web/src/lib/api.ts` | `uploadProductMedia` + تایپ `UploadedProductMedia` |
| `apps/web/src/app/products/[id]/product-media.tsx` | **جدید** — تب RTL |
| `apps/web/src/app/products/[id]/product-media.test.tsx` | **جدید** — ۷ تست jsdom |
| `apps/web/src/app/products/[id]/page.tsx` | تب دهم + `canUpload` + رندر بیرون از fieldset |
| `docs/product-inventory/*` | گزارش C1، لجر `VERIFICATION-C1.*`، پیوستهای ۵ سند موجود |

**اثر معماری:** `MasterDataModule` اکنون `AttachmentsModule` را import میکند (بدون حلقه؛
`AttachmentsModule` فقط `IdentityRbacModule` را import میکند). هیچ جدول، مهاجرت، RLS،
grant، نقش، مجوز، enum، seed، ارائهدهندهٔ authority یا سرویس ذخیرهسازی تازهای ساخته نشد.
قرارداد `POST/GET /attachments`، import/export/history/domain-scope/bulk-maintenance همگی
دستنخوردهاند.

---

## ۴) تغییرات API و پایگاهداده

- **مسیرهای تازه:** `GET|POST /products/{id}/media` و `GET /products/{id}/media/{mediaId}/url`.
- **اسکیماهای تازه:** `ProductMediaItem`، `ProductMediaView`.
- **کدهای خطای مستندشده:** `invalid_id`، `product_not_found`، `media_not_found`،
  `product_media_owner_scope_rejected`، `domain_property_rejected`،
  `domain_context_not_supported`، `empty_file`، `file_too_large`،
  `unsupported_media_type`، `unverifiable_content_type`، `content_type_mismatch`،
  `malformed_content`، `extension_mismatch`، `storage_not_configured`، `forbidden`.
- **سازگاری:** OpenAPI از ۲۰۲ مسیر/۲۸۵ عملیات/۱۵۴ اسکیما/۳ webhook به
  **۲۰۴/۲۸۸/۱۵۶/۳** رفت؛ `contract-drift` صفر؛ کلاینت TS فقط خط اضافه کرد (هیچ حذفی).
- **پایگاهداده:** **هیچ مهاجرتی اضافه نشد** (§A صریحاً «بدونِ مهاجرت» را خواسته).
  جدول `attachment`، ستون `company_id` (۰۰۳۵)، RLS `p_attachment_tenant` (۰۰۳۶/۰۰۴۱)
  و زنجیرهٔ `ownerTenantSql('product')` همانطور باقیاند. `audit_log` فقط ردیف
  `entity_type='product_media'` تازهای میگیرد.

---

## ۵) تستها — نتایج واقعی

| دروازه | نتیجه |
| --- | --- |
| `npx vitest run test/product-media-rules.test.ts` | **PASS** ۹/۹ |
| `npx vitest run test/product-media-rules.test.ts test/product-media.api.test.ts` (PG بومی + AppModule واقعی) | **PASS** ۱۷/۱۷ (۲ فایل) |
| واحد بیدادهٔ کامل API (`check-test-partition --print unit`) | **PASS** ۳۱ فایل / ۳۸۲ تست (مبنای B2: ۳۰/۳۷۳) |
| `npm run test -w apps/web` | **PASS** ۱۹ فایل / ۱۰۱ تست (مبنای B2: ۱۸/۹۴) |
| `npm run typecheck` (همهٔ ورکاسپیسها) | **PASS** |
| `npm run build -w apps/web` (Next.js production) | **PASS** |
| `node scripts/openapi-check.mjs` | **PASS** ۲۰۴/۲۸۸/۱۵۶/۳ |
| `node scripts/contract-drift.mjs` | **PASS** drift=۰ (کد↔سند ۲۸۸/۲۸۸) |
| `node scripts/check-test-partition.mjs` | **PASS** declared==computed، ۸۸ فایل |
| `git diff --check` | **PASS** ۰ |
| `npm run build` (همهٔ ورکاسپیسها: packages + API + Next) | **PASS** |
| `npm run test:migrations` (up → down → up روی PG بومی) | **PASS** ۱۰۲۹ شیء یکسان |
| مجموعهٔ کامل DB-backed API + کنترل مبنای پاک | **PASS** عدم رگرسیون / **FAIL** محیط محلی (توضیح زیر) |

تستهای سرتاسری API شامل: نمای خالی، آپلود تصویر + ردیف ممیزی + برچسب اصلی،
ترتیب قدیمیتریناول و «PDF/تصویر دوم اصلی نمیشوند»، محدودسازی URL به همان کالا،
رد فیلدهای مالکیتی کلاینت، همسانی fail-closed مرز B2 (`x-domain-id` و `?available=true`)،
کالای شرکت دیگر/ناموجود، MIMEUnsupported/امضای جعلی، ۴۰۱، و ۴۰۳ برای کاربر بیمجوز.
MinIO/S3 در تستهای تازهٔ C1 با `vi.spyOn` روی **همان نمونهٔ `StorageService`**
جایگزین شد؛ round-trip واقعی MinIO همچنان در `apps/api/test/attachments.api.test.ts`
پوشش دارد. اجرای کامل DB-backed نیز انجام شد (`DATABASE_URL` + `PSQL` روی PostgreSQL
بومی ۱۶.۲): ۸۸ فایل / ۱۵۰۸ تست → ۸۳ فایل و ۱۴۸۹ تست **PASS**، ۵ فایل و ۱۹ تست
**FAIL** (`EXIT=1`). برای تفکیک رگرسیون از محیط، همان ۵ فایل روی یک worktree جداگانهٔ
**مبنای پاک `deefa05…`** با همان متغیرها اجرا شد: دقیقاً همان ۵ فایل و همان ۱۹ عنوان
شکست (مقایسهٔ دوتایی `identical=True`، بدون حتی یک تفاوت). علل محیطی: PostGIS/هندسه،
احراز هویت trust محلی، قرارداد Tour، و نبود MinIO/S3 واقعی برای round-trip ضمائم.
دو فایل تازهٔ C1 در همان اجرای کامل ✓ ۸/۸ و ✓ ۹/۹ بودند. نتیجه: **PASS** برای
«عدم رگرسیون C1»، **UNVERIFIED** برای معادل CI/تولید؛ `queued` یا شکست محیطی هرگز
بهعنوان `PASS` C1 گزارش نمیشود.

**UNVERIFIED:** بررسیدستی RTL/a11y/console در مرورگر واقعی، CI روی SHA نهایی تا اجرای
واقعی، و round-trip MinIO در محیط تولید. **BLOCKED:** PM-B1..PM-B8 / Q1..Q5 / G-03
و پذیرش کامل Product Master.

---

## ۶) شواهد UI

- ۷ تست jsdom با `@testing-library/react` روی کامپوننت واقعی: حالت خالی و راهنمایی
  فقطخواندنی، برچسب مصوب «اصلی (خودکار)» + کارت تصویر/سند، رد فایل نامجاز پیش از
  درخواست، آپلود موفق بدون فیلد مالکیت + بارگذاری مجدد، نمایش خطای ساختاریافته سرور،
  و تازهسازی URL از مسیر محصولمحور. همگی **PASS**.
- تب «تصاویر و اسناد» در `products/[id]/page.tsx` ثبت و بیرون از `<fieldset disabled>`
  رندر میشود (دسترسی خواندن برای نشستهای فقطخواندنی حفظ شد).
- `npm run build -w apps/web` موفق؛ مسیر `/products/[id]` در فهرست مسیرهای build حضور دارد.
- **پیشنمایش زنده (اجراشده):** سرور توسعهٔ وب (پورت ۳۰۰۰) + API کامپایلشده
  (پورت ۴۰۰۰) + PostgreSQL بومی + استاب محلی S3 (پورت ۹۱۰۰). نشانی پیشنمایش
  `https://3000-i2hc8membf15gd6pw6m1m.e2b.app`؛ ورود `c1_admin` / `Demo!pass123`
  و کالای `C1-DEMO` (`7bf39ab6-b1d6-43a6-a758-feaf09b64a5b`). تمام جریانها از
  **پروکسی هممبدأ وب** (`/api/v1/...`) با `curl` راستیآزمایی شد: ورود ۲۰۰؛
  نمای خالی ۲۰۰ (`counts` صفر + «اصلی (خودکار)»)؛ آپلود فایل با نام فارسی
  «نمای-اصلی.png» → ۲۰۱ با `is_primary=true`، `owner_type=product`،
  `owner_id` همان کالا؛ فهرست پس از آپلود → ۲۰۰ و `counts.images=1`؛
  دریافت URL تازه → ۲۰۰ با `expires_in=300`؛ `?available=true` → ۴۰۰
  `domain_property_rejected` (همسانی B2)؛ و `GET /products/{id}` → ۲۰۰.
- **محدودیت شناختهشده پیشنمایش:** URL امضاشدهٔ استاب ذخیرهسازی به `127.0.0.1:9100`
  اشاره میکند (محلی سندباکس)، بنابراین thumbnail در مرورگر کاربر نیازمند
  MinIO/S3 قابلهدسترس از مرورگر است (محیط تولید/CI)؛ سایر جریانها کاملاً کار
  میکنند. هیچ تغییری در کد تولید برای دور زدن این محدودیت انجام نشد.

---

## ۷) اثر امنیتی / مجوز

- **تقویت، نه تضعیف:** مسیر تازه به **هر دو** خانوادهٔ مجوز نیاز دارد
  (`master.product.view|update` §F **و** `attachment.view|upload`)؛ `PermissionsGuard`
  روی route و `CatalogAccess.assert` دوباره از DB هر دو را بررسی میکند. هیچ مجوز تازهای
  ساخته/seed نشد.
- مالک/شرکت فقط از `:id` و نشست؛ فیلدهای مالکیتی کلاینت صریحاً رد میشوند؛ `assertProductInCompany`
  و زنجیرهٔ `ownerTenantSql('product')` و RLS `attachment` همگی پابرجا و دوباره اعمال میشوند.
- `DomainBoundaryGuard` (B2) روی هر ۳ مسیر: `x-domain-id` و کلیدهای دامنهای ۴۰۰ میگیرند؛
  هیچ هویت/عضویت/دسترسپذیری دامنهای ساخته نمیشود.
- ممیزی fail-closed در همان تراکنش + پاکسازی شیء اورفان؛ bucket خصوصی و URL کوتاهعمر
  دستنخورده.
- **حذف ضمیمه پیادهسازی نشد:** طراحی مصوب فقط اثر حذف را مستند کرده و مسیر حذفِ تاییدشدهای
  وجود ندارد؛ ساختن سیاست حذف/بایگانی یک بدعت ممنوعه بود.
- D4، جداسازی import، محافظت مرز B1، رفتار fail-closed B2، گاردهام و RLS موجود تغییر نکردند.

---

## ۸) CI / SHA نهایی

کامیت پیادهسازی C1: `aa2fba23d4688b5b741235e5a55ed71492f9d483` (معمولی،
۲۲ فایل / ۲۴۰۲+/۴−) و push معمولی `deefa05..aa2fba2` (بدون
amend/force/reset/rebase). شش نمای SHA بلافاصله پس از push همگی
`aa2fba2…` بودند: HEAD محلی، `origin/<branch>`، `git ls-remote`، head PR #14،
`git rev-parse HEAD~0` و `git show -s --format=%H HEAD` (`ALL_AGREE=True`).
PR #14 همچنان `OPEN / DRAFT` با base `main` است.

روی همان SHA چهار workflow ایجاد شد: `43053200836` (CI)، `43053200543` (e2e)،
`43053201194` (مهاجرتهای پایگاهداده) و `43053200591` (release-image).
پس از `gh pr checks 14 --watch` محدود ۱۸۰ ثانیهای (`EXIT=124`) و بازخوانی
check-runs، هر ۸ check-run همچنان `queued / conclusion=null` است →
**CI روی SHA پیادهسازی: `UNVERIFIED / PENDING`**؛ `queued` هرگز `PASS` نیست.
کامیت نهایی شواهد (همین بهروزرسانی) SHA تازهای دارد و شناسهٔ آن، شش نمای SHA
و وضعیت workflowهایش در بدنهٔ PR #14 ثبت میشود؛ تا اجرای واقعی workflow هیچ
نتیجهای `PASS` اعلام نمیشود.

بازخوانی CI مبنای B2 `deefa05…` در زمان C1: سه run `43040312220` (CI)،
`43040312421` (e2e) و `43040312489` (release-image) اکنون
`completed/cancelled` و `43040312368` (مهاجرتها) همچنان `queued` است. حکم B2
بدون حذف یا بازنویسی شواهد تاریخی به `UNVERIFIED / CANCELLED (3) + QUEUED (1)`
بهروز شد؛ همچنان هرگز `PASS` نیست. هیچ workflow/secret/زیرساختی تغییر نکرد؛
هیچ merge/approve/release/deploy انجام نشد.

---

## ۹) کامیت / push

کامیت معمولی (بدون amend/force/reset/rebase) و fast-forward push به
`arena/be5eaff3-green-dms` انجام شد؛ شناسهٔ دقیق در §8 و بدنهٔ PR #14 درج شد
تا از دوراهی «گزارش قبل از کامیت» اجتناب شود. شش نمای SHA و `git diff --check`
پس از ویرایش نهایی نیز پاکاند. PR همچنان `OPEN / DRAFT`.

---

## ۱۰) موانع باقیمانده و ماژول منطقی بعدی

**BLOCKED (بدون تغییر):** PM-B1 (هویت عملیاتی دامنه)، PM-B2 (چرخهٔ حیات)، PM-B4
(اختیار مرکزی/دامنه و انتساب)، PM-B3/B5–B8، Q1–Q5، G-03 (تأیید دونفره)،
registry/عضویت/RLS/مهاجرت دامنهای، backfill/cutover، و پذیرش کامل Product Master.
بستهٔ دقیق تصمیم مالک در `TASK-PM-02-B2_OWNER_DECISION_PACKAGE.md` همچنان لازم است
(جدول ۷ ستونی امضاشده + مرجع تصویب + نمونههای تأییدشده + امضای IAM/Security +
سیاست cutover/backfill + تستهای پذیرش).

**ماژول منطقی بعدیِ بدون مجوز:** تکمیل UX مدیریت برند/واحد/دستهٔ محصول در همان چارچوب
مرکزی (§F)، یا گسترش نمای محصولمحور ضمائم به سایر موجودیتها؛ سپس **فقط پس از تصویب
کتبی مالک** registry شرکت-محور، چرخهٔ حیات و انتساب actor→domain با RLS دامنهای و
شواهد up/down/up، و تنها بعد از آن فعالسازی عضویت/دسترسپذیری و مسیرهای ۴۰۰/۵۰۳.

---

## جدول احکام

| مورد | حکم |
| --- | --- |
| بازیابی مبنا، شش نمای SHA، چکپوینت، حفظ B1/B2 | **PASS** |
| واجدشرایطبودن ماژول و عدم عبور از مرز مالک | **PASS** |
| عملکرد بکاند (۳ مسیر، قاعدهٔ §B4، ممیزی تراکنشی) | **PASS** |
| قرارداد/کلاینت/عدم drift/سازگاری | **PASS** |
| فرانتاند RTL و یکپارچگی واقعی | **PASS** |
| تستهای واحد/HTTP/وب/typecheck/build | **PASS** |
| امنیت، مجوز، جداسازی اجارها، B2 parity | **PASS** |
| build ریشه + چرخه up/down/up مهاجرتها | **PASS** |
| مجموعهٔ کامل DB-backed با کنترل مبنای پاک | **PASS** عدم رگرسیون / **UNVERIFIED** معادل CI |
| پیشنمایش زنده از پروکسی هممبدأ وب | **PASS** |
| مهاجرتهای دامنهای / حذف ضمیمه / برند-UOM / import round-trip | **BLOCKED** (عمداً انجام نشد) |
| PM-B1..PM-B8، Q1..Q5، G-03، پذیرش کامل | **BLOCKED** |
| CI روی SHA پیادهسازی C1 تا اجرای واقعی | **UNVERIFIED / PENDING** (۴ run / ۸ check-run در صف) |
| CI روی `deefa05…` (B2) | **UNVERIFIED / CANCELLED (3) + QUEUED (1)** |
| بررسیدستی مرورگر/a11y/console و round-trip MinIO تولید | **UNVERIFIED** |
| merge / approve / release / deploy | **انجام نشد** (ممنوع) |
