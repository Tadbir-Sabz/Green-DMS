# TASK-PM-02-C4 — مرکز انتقال ضمائم چندموجودیتی (Multi-Entity Attachment Import & Export Center)

**وضعیت:** پیادهسازی شده برای **صدور، دانلود، بازرسی، پیشنمایش امن ورود، نگاشت، تاریخچه و ممیزی**؛ **اجرای ورود عمداً BLOCKED / fail-closed** است.
**نوع کار:** DEVELOPMENT واقعی (بکاند + قرارداد + فرانتاند + تست + شاهد زندهٔ همانمبدأ)، نه ممیزی/مستندسازی صرف.
**عامل:** Agent-1 (Arena.ai) · **شاخه:** `arena/be5eaff3-green-dms` · **PR:** #14 (`OPEN / DRAFT`, base `main`).
**مبنا:** `8ca19b4dfa6fc9b255915c383c0530f7a67adf1d` (پایان C3 = head شاخه / `origin` / `ls-remote` / head PR / `FETCH_HEAD` / مبنای اعلامشده؛ `ALL_AGREE=True`).
**چکپوینت قابل بازیابی:** `/home/user/pm02-c4-checkpoint.tar.gz` + `.sha256`
(`3a3aa375b3e871c8508e9ed1c00a4fb7553cdcb2afc9dfc95a697a8fc9fa49ab`) و
`/home/user/pm02-c4-checkpoint.bundle` (`git bundle --all`, ۳٬۰۴۱٬۱۱۷ بایت)؛ ۲٬۸۸۷ فایل استخراجشده،
`sha256sum -c` → `OK`، `git bundle verify` → تاریخچهٔ کامل. بدنهٔ PR پیش از C4:
۱۱۲٬۹۸۵ نویسه / ۱۲۲٬۳۱۶ بایت، sha256
`6ef4a5089c4caa552032ca86a9a1e9d54bd01944eebaa2a78bddfe4b8d310f4e` — **بایتبهبایت حفظ میشود**.

---

## ۱) بازیابی مبنا و حفظ شواهد

`git fetch` / `git pull --ff-only` → `Already up to date`؛ شش نمای SHA در ابتدا همگی
`8ca19b4dfa6fc9b255915c383c0530f7a67adf1d`؛ worktree پاک و `git diff --check=0`.
چکپوینت پیش از نخستین نوشتن ساخته شد. همهٔ اسناد، تستها و شواهد C1/C2/C3/B2/M4/K/J
**بدون ویرایش** ماندند؛ C4 فقط پیوستهای **افزودنی** به `EVIDENCE_INDEX.md`،
`PRODUCT_MASTER_OPERATOR_GUIDE_FA.md` و بدنهٔ PR اضافه میکند. هیچ amend / force-push /
reset / rebase / merge / approve / release / deploy انجام نشد. نتیجهٔ CI دقیقSHA و شش
نمای نهایی، پس از کامیت، **فقط بهصورت افزودنی در بدنهٔ PR #14 و گزارش پایانی چت**
ثبت میشود تا هیچ ویرایش پساCIـای SHA تحت آزمون را تغییر ندهد.

---

## ۲) ماتریس واجدشرایطبودن (بدون اختراع مالک تازه)

منبع حقیقت همچنان `ATTACHMENT_OWNER_TYPES`، `ownerTenantSql` (۸ زنجیرهٔ
راستیآزمایشده + `other` fail-closed)، enum مصوب OpenAPI و مهاجرتهای ۰۰۰۲ / ۰۰۳۵ /
۰۰۳۶ / ۰۰۴۱ / ۰۰۱۰ / ۰۰۱۴ است. C4 دقیقاً همان هشت مالک مصوب C1/C3 را میپذیرد:

| موجودیت | `owner_type` | جایگاه در C4 | توضیح |
|---|---|---|---|
| کالا | `product` | **PRESERVED / NOT DUPLICATED** | نمای «رسانهٔ کالا»ی C1 و قاعدهٔ تصویر اصلی خودکار دستنخورده ماند؛ فقط در فهرست انواع و صدور شرکت میکند |
| فاکتور فروش | `invoice` | **PASS** | کشف سرورساخته، صدور، بازرسی، پیشنمایش، نگاشت |
| سفارش فروش | `sales_order` | **PASS** | همان |
| درخواست مرجوعی | `return_request` | **PASS** | همان |
| سند انبارگردانی | `stock_count` | **PASS** | همان |
| سند حسابداری | `journal_entry` | **PASS** | همان |
| رسید پرداخت | `receipt` | **BACKEND-READY / UI DEFERRED** | مالکیت `payment_receipt.branch_id → branch.company_id` مصوب است؛ صفحهای که فهرست رسیدها را نشان دهد وجود ندارد |
| مدرک تحویل | `pod` | **BACKEND-READY / UI DEFERRED** | مالکیت `pod.delivery_id → delivery.branch_id → branch.company_id` مصوب است؛ صفحهٔ اختصاصی POD وجود ندارد |
| نامشخص / برند / دسته / انبار / واحد / دامنه | `other`, `brand`, `product_category`, `warehouse`, `uom`, … | **REJECTED** | `unsupported_owner_type` / `forbidden_client_field` صریح؛ نه حذف بیصدا |

**هیچ** `owner_type`، جدول، مهاجرت، مجوز، نقش، grant، seed، RLS، ارائهدهندهٔ استوریج،
سیاست حذف/نگهداشت یا معنای دامنهای تازهای ساخته نشد. مجوزها فقط همان
`attachment.view` / `attachment.upload` (۰۰۳۵) و `master.product.view` موجود برای
انتخاب کالا هستند.

---

## ۳) معماری و امنیت

### ۳٫۱ ماژول تازه، روی زیرساخت موجود

`apps/api/src/modules/attachments/attachment-transfer.{rules,package,types,service,controller,module}.ts`
و ثبت `AttachmentTransferModule` در `app.module.ts`. ماژول فقط
`IdentityRbacModule` و `AttachmentsModule` موجود را وارد میکند و `DomainBoundaryGuard`
مصوب B2 را فراهم میکند؛ **هیچ `RulesEngineService` تزریق نشد**، چون گردش تأیید مصوب
برای این عملیات وجود ندارد (§۴). همان `StorageService`، `ownerTenantSql`،
`AuditService.recordRequired`، `withTransaction`، GUCهای تراکنش-محلی، RLS/FORCE RLS و
`audit_log` reuse شدند.

### ۳٫۲ خواندن باندشده از استوریج

به `StorageService` فقط یک متد افزوده شد: `get(key, maxBytes): Promise<Buffer>`.
همان کلاینت MinIO/S3 موجود، همان `getObject`، ولی با سقف سخت بایتها، `destroy()` هنگام
سرریز و خطاهای ساختاریافتهٔ `invalid_storage_read_limit` / `attachment_too_large` /
`storage_read_failed`. هیچ URL امضاشده، bucket عمومی، ارائهدهنده یا مسیر تازهای ساخته نشد.
`getObject` داخل `try` قرار گرفت تا خطای شبکه به پاسخ امن تبدیل شود.

### ۳٫۳ بستهٔ ZIP کنترلشده (بدون وابستگی آرشیو خارجی)

`attachment-transfer.package.ts` با `node:crypto`، `node:zlib`، `node:path` و CRC32
دستی، بستهٔ `green-dms.attachment-transfer/1` را میسازد و بازرسی میکند:

- `manifest.json` + `checksums.json` قطعی؛ مسیرهای سرورساخته
  `files/NNNN-<sha12>.(jpg|jpeg|png|webp|pdf)`؛ SHA-256 تکفایل، CRC32، SHA-256 manifest،
  SHA-256 یکپارچگی کل بسته (manifest + محتوا به ترتیب مسیر).
- بررسی امضای بایتی/پسوند/MIME، تطابق اندازه و CRC و SHA، فیلدهای ممنوع، ورودیهای
  unexpected/duplicate، و رد ZIP64، رمزگذاری، چنددیسکی، traversal و بمب فشردهسازی.
- سقفها: بسته ۳۲ MiB، محتوای بازشده ۴۸ MiB، ۲۰۰ فایل، تکفایل ۸ MiB، manifest ۱ MiB،
  نسبت فشردهسازی ۱۰۰، ۵۰ رکورد مالک / ۵۰ انتخاب.
- بستههای تولیدشده فقط stored (method 0)اند؛ خواندن deflate (method 8) پشتیبانی میشود.
  `ZipEntryInput.method?: 0|8` **فقط برای تست بمب فشردهسازی** است و مسیر تولید را تغییر نمیدهد.
- `TRANSFER_FORBIDDEN_CLIENT_FIELDS` شامل `company_id`، `domain_id`، `storage_key`،
  URL/توکن، فیلدهای کاربر/تأییدکننده/نقش/مجوز و `x-domain-id` است؛ این فیلدها حتی در
  اشیای تودرتوی manifest/بدنه/کوئری پیدا و **۴۰۰ صریح** میشوند.

### ۳٫۴ سرویس، تراکنش و ممیزی

- کشف رکوردها فقط با SQL ثابت/allowlist سرور و `$1 = company_id` نشست؛ `q`/`limit`
  پارامتربندیشدهاند؛ رکورد شرکت دیگر هرگز برگردانده نمیشود.
- `exportPreview` بایتها را با `storage.get` میخواند، دوباره امضا/SHA/پسوند را از روی
  بایتهای واقعی میسنجد، بسته را میسازد و نتیجه را در **همان تراکنش** ممیزی میکند.
- `exportPackage` بسته را از `audit_log` همان شرکت/عملیات بازسازی میکند، فراداده و محتوا
  را با رکوردهای زنده مقایسه میکند، `inspectTransferPackage` دوباره اجرا میکند و تنها در
  صورت تطابق هش، ZIP همانمبدأ را با `Content-Type: application/zip`،
  `Content-Disposition`, `Content-Length`, `X-Transfer-Package-Sha256`,
  `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` برمیگرداند.
- `importPreview` / `updateMappings` ارزیابی و ممیزی را در **یک** `tenantTransaction`
  انجام میدهند؛ وضعیتها `accepted|rejected|duplicate|unresolved`، بدون درج/حذف/بازنویسی
  attachment. پیشنمایشها در حافظه، initiator-scoped، نسخهدار، TTLدار و حداکثر ۲۴ مورداند.
- `execute` و `cancel` فقط وضعیت/ممیزی را ثبت میکنند؛ `cancel` هیچ حذف فیزیکی انجام نمیدهد.
- `assertSafeAuditValue` مانع نشت `storage_key`، URL، توکن، bucket، رمز، `company_id`
  و کلیدهای دامنهای در `after_data` میشود. تاریخچه/جزئیات فقط از `audit_log` همان شرکت خوانده میشوند.
- تمام ۱۱ مسیر: `AuthGuard` → `PermissionsGuard` → `DomainBoundaryGuard` در سطح کلاس،
  سپس بازاعتبارسنجی مجوز از DB، GUC/RLS و `ownerTenantSql`. هر پارامتر کوئری تعریفنشده
  یا ممنوع روی مسیرهای بدون کوئری اکنون **۴۰۰ صریح** میگیرد، نه حذف بیصدا.

### ۳٫۵ مسیرها

```
GET  /attachment-transfer/owner-types
GET  /attachment-transfer/owners?entity_types=&q=&limit=
POST /attachment-transfer/exports/preview                 { selections }
GET  /attachment-transfer/exports/{operationId}/package  (باینری ZIP)
POST /attachment-transfer/imports/preview                (multipart: فقط file)
GET  /attachment-transfer/imports/{operationId}
POST /attachment-transfer/imports/{operationId}/mappings { mapping_overrides }
POST /attachment-transfer/imports/{operationId}/execute  (fail-closed)
POST /attachment-transfer/operations/{operationId}/cancel
GET  /attachment-transfer/operations?limit=
GET  /attachment-transfer/operations/{operationId}
```

---

## ۴) اجرای ورود: BLOCKED، دقیقاً بهدلیل وابستگی مصوب M4

معماری تأیید دونفرهٔ مصوب M4 عبارت است از ترکیب سیاست در `rules-engine` ←
`approval_request` / `approval_binding` با `entity_fingerprint` ← `approval_decision`
تغییرناپذیر ← رد Self-approval ← `consumeApprovedBinding` **در همان تراکنش** گذار
کسبوکاری. `ENTITY_STATE_SQL` / `FINGERPRINT_FIELDS` فقط سه عملیات
`sales.order.approve`، `sales.return.approve` و `ap.purchase.approve` را میشناسند؛
`submitForApproval` برای عملیات ناشناخته fail-closed است
(`fingerprint_unsupported` / `approval_policy_missing`). `ProductImportController`
فقط `confirm_sensitive` اختیاری دارد و `ProductBulkMaintenance` دفتر token/hash
پیشنمایش مخصوص خود را دارد؛ هیچکدام **مکانیزم عمومی اتصال هش دقیق بستهٔ ضمائم به
تأیید دونفره** نیستند.

برای C4 هیچ عملیات، فیلد اثرانگشت، سیاست، زنجیره، `owner type`، مجوز، نقش، گرنت،
مهاجرت یا تغییر RLS تازهای ساخته نشد. `TRANSFER_APPROVAL_OPERATION =
'attachment.import.execute'` فقط **نام وابستگی** است که در پاسخ و ممیزی افشا میشود؛
`fingerprintFieldsFor` برای آن `[]` برمیگرداند و `approval.fingerprint_supported=false`
است. `validateTwoPersonApprovalBinding` همچنان تأییدکنندهٔ مستقل، منع Self-approval،
تطابق هش بسته/نگاشت/پیشنمایش و عدم انقضا را میخواهد. بنابراین:

- `POST .../execute` همیشه `409 approval_required` (یا `approval_invalidated` /
  `self_approval_forbidden` / `approval_expired`) میدهد و رویداد
  `attachment_transfer.execution` با `execution_status='blocked'` ثبت میکند.
- بدنهای شامل `approved_by` / `confirm` پیش از آن `400 forbidden_client_field` میگیرد.
- **هیچ ردیف `attachment` درج، بهروزرسانی، حذف یا بایگانی نمیشود.**
- رابط کاربری **دکمهٔ «اجرای ورود» ندارد**؛ `checkImportExecutionGate` پاسخ واقعی
  fail-closed سرور را به اپراتور نشان میدهد.

فعالسازی اجرا نیازمند تصمیم و امضای مصوب مالک برای افزودن عملیات، فیلدهای اثرانگشت
دقیق بسته/نگاشت، سیاست ترکیب تأیید، موجودیت قابلقفل، آزمون دونفره و قطعنامهای
جداست. توصیه، تست، سکوت یا همین سند **بههیچوجه تأیید محسوب نمیشود**. G-03،
PM-B1..PM-B8، Q1..Q5، G-13 و پذیرش کامل Product Master همچنان
`BLOCKED / OPEN / NOT APPROVED`اند.

---

## ۵) قرارداد، کلاینت و پایگاهداده

- `packages/contracts/openapi.yaml`: تگ `attachment-transfer`، ۱۱ مسیر تازه
  (پیش از `webhooks:`)، ۲۵ اسکیمای `Transfer*` و تولید قطعی
  `packages/api-client/src/schema.ts` (+۸۱۰ خط). `npm run openapi:check`:
  **۲۲۴ مسیر / ۳۱۸ عملیات / ۲۰۳ اسکیما / ۳ وبحوک**.
- `node scripts/contract-drift.mjs`: **۳۱۸/۳۱۸، انحراف عملیات/enum/required صفر**.
- `npm run build:packages`، typecheckـهای `apps/api`، `apps/web`،
  `packages/api-client` و buildـهای API/وب همگی PASS؛ `next build` مسیر
  `/attachment-transfer` و `/attachments-center` را تولید کرد.
- **بدون مهاجرت تازه:** چرخهٔ up/down/up روی DB موقت همچنان **۱٬۰۳۳ شیء یکسان**؛
  پارتیشن تستها **۹۵ فایل، declared == computed**. جدول `attachment`، enum مالک،
  RLS/FORCE RLS، `ownerTenantSql` و لایهٔ C3 دستنخوردهاند.
- `git diff --check` صفر؛ فایلهای build (`.next`, `dist`) در Git نیستند.

---

## ۶) فرانتاند فارسی RTL

- `apps/web/src/lib/attachment-transfer.ts`: کلاینت خام همانمبدأ برای JSON،
  multipart و باینری ZIP؛ `API_BASE_URL` / `refreshAccessToken` از `lib/api.ts` صادر شدند.
  `downloadExportPackage` هش `X-Transfer-Package-Sha256` را هم برمیگرداند.
- `AttachmentTransferCenter.tsx`: سه تب «مرکز صدور»، «مرکز ورود»، «تاریخچه و ممیزی»؛
  انتخاب هشت نوع مصوب، جستوجوی رکوردها، پیشنمایش manifest و اندازه، دانلود امن،
  بارگذاری/بازرسی بسته، جدول وضعیتها، نگاشت مالک موجود، دروازهٔ اجرا، لغو، تاریخچه،
  جزئیات، خطا/تلاش دوباره، `aria`/`role`/`dir="rtl"` و پیامهای فارسی.
- `/attachment-transfer/page.tsx` با `RoleGuard permission="attachment.view"`؛
  ناوبری `/attachment-transfer` با `IconTransfer` و همان مجوز؛ کارت پیوند C4 در
  `/attachments-center`. **دکمهٔ اجرای ورود وجود ندارد.**
- Receipt/POD: همانطور که در §۲ آمد، بکند مصوب است ولی صفحهای عملیاتی واجدشرایط
  (فهرست رسیدها/POD) در مخزن یافت نشد: `/payments` فقط بکند است، `treasury` موقعیتها/
  بستنها را نشان میدهد و `waybills` فهرست/جزئیات حوالهها را دارد. بنابراین کنترل UI
  تازهای اختراع نشد؛ وابستگی دقیق ثبت و بکند حفظ شد.

---

## ۷) تستها و راستیآزمایی

| دروازه | نتیجه |
|---|---|
| تستهای واحد بسته/قواعد C4 | **PASS ۲ فایل / ۱۷ تست** (`attachment-transfer.package.test.ts` ۸، `.service.test.ts` ۹) |
| تست سرتاسری C4 روی PostgreSQL موقت + HTTP واقعی | **PASS ۱ فایل / ۷ تست** (`attachment-transfer.api.test.ts`) |
| تست جزء وب C4 | **PASS ۱ فایل / ۵ تست** (`AttachmentTransferCenter.test.tsx`) |
| وب کامل | **PASS ۲۵ فایل / ۱۳۷ تست** (مبنا ۲۴/۱۳۲) |
| واحد بیدادهٔ API | **PASS ۳۵ فایل / ۴۱۲ تست** (مبنا ۳۳/۳۹۵) |
| رگرسیون هدفمند C1–C4 | **PASS ۹/۱۰ فایل، ۲۰۶/۲۰۸ تست**؛ ۲ شکست `attachments.api.test.ts` عیناً مبنای محیطی C3 |
| اجرای کامل DB-backed API | **۹۰/۹۵ فایل، ۱٬۵۴۵/۱٬۵۶۴ تست PASS**؛ ۵ فایل / ۱۹ عنوان شکست، `identical=True` با `/tmp/pm02c3-api-full.log` (PostGIS/trust-auth/MinIO محلی) |
| OpenAPI / drift / کلاینت | **PASS** ۲۲۴/۳۱۸/۲۰۳/۳، drift ۰، build packages |
| typecheck / build | **PASS** API، وب، api-client، `next build`، `node apps/api/dist/main.js` |
| مهاجرتها / پارتیشن / diffcheck | **PASS** ۱٬۰۳۳ شیء یکسان، ۹۵ فایل، ۰ |
| شاهد زندهٔ همانمبدأ | **PASS** `evidence/task-pm-02/VERIFICATION-C4-LIVE.txt`، sha256 `409044cd7a3623e07a6299c861cb67f2588a6cd1b02c9666d7365af74ddca1ff` |

شاهد زنده روی `greendms_c1_preview`، API ساختهشدهٔ `node apps/api/dist/main.js`،
Next rewrite همانمبدأ، ورود `c1_admin` و پنج ضمیمهٔ واقعی C3 اجرا شد: ۸ نوع مالک،
کشف ۵ رکورد، بستهٔ ۵ فایل / ۳٬۵۱۵ بایت ZIP، هش یکپارچگی، دانلود باینری، پیشنمایش
ورود با ۵ مورد «تکراری»، رد بستهٔ دستکاریشده (`crc_mismatch`)، رد تزریق
`company_id`، نگاشت نسخهٔ ۲ و بیاعتباری تأیید، رد تأییدکنندهٔ جعلی، `409
approval_required`، ثابت ماندن شمارش ضمائم (۶←۶)، تاریخچه/جزئیات/لغو، ۷ رویداد ممیزی
تراکنشی و **۰ نشت** کلید استوریج/URL/زیرساخت در `after_data`. دو صفحهٔ وب
`/attachment-transfer` و `/attachments-center` هر دو ۲۰۰. هیچ توکن/URL/اسکرینشات
ساختگی در شاهد ذخیره نشد.

---

## ۸) مرزها، احکام و موارد UNVERIFIED

**PASS:** صدور کنترلشده، دانلود همانمبدأ، بازرسی سختگیرانهٔ ZIP، پیشنمایش امن ورود،
نگاشت، تاریخچه/ممیزی تراکنشی، لغو، قرارداد/کلاینت، RTL و تستها. **FAIL: هیچ** در
محدودهٔ تحویلشده.

**BLOCKED / NOT AUTHORIZED:** اجرای ورود ضمائم (§۴)؛ افزودن عملیات/اثرانگشت/سیاست
تأیید؛ موجودیتهای برند/دسته/انبار/واحد/`other`؛ انتساب بینشرکتی؛ ایجاد مالک مفقود؛
بازنویسی، حذف، بایگانی، جایگزینی خودکار و سیاست نگهداشت؛ مهاجرت، مجوز، نقش، grant،
RLS، دامنه، ارائهدهندهٔ استوریج یا معنای کسبوکاری تازه؛ PM-B1..PM-B8 / Q1..Q5 /
G-03 / G-13؛ پذیرش کامل Product Master؛ استقرار تولید. PR #14 همچنان
`OPEN / DRAFT`، بدون merge / approve / release / deploy.

**UNVERIFIED:** بازبینی دستی مرورگر (RTL، a11y، خطاهای کنسول)، round-trip
MinIO/S3 production-equivalent، نمای اختصاصی Receipt/POD، و CI دقیقSHAی HEAD نهایی
تا لحظهٔ نگارش این سند (نتیجه پس از push بهصورت افزودنی در بدنهٔ PR و گزارش چت ثبت
میشود). تستهای محلی و شاهد زنده جایگزین تأیید مالک یا آمادگی تولید نیستند.

---

## ۹) سیاست ثبت نتیجهٔ CI و شش نمای SHA

کامیت C4 یک **کامیت معمولی** روی همین شاخه است؛ push معمولی به
`origin/arena/be5eaff3-green-dms`. SHA دقیق نهایی، چهار workflow / هشت check،
شش نمای SHA (HEAD، `origin/...`، `ls-remote`، head PR، شاخه، مبنای اعلامشده) و هش
بدنهٔ PR پس از پیوست C4 فقط در **بدنهٔ PR #14** و **گزارش پایانی چت** ثبت میشوند؛
هیچ فایل مخزن پس از اجرای CI ویرایش نمیشود، هیچ کامیت trigger مصنوعی و هیچ ویرایش
پساCI وجود ندارد. پیوست بدنهٔ PR افزودنی است و پیشوند
`6ef4a5089c4caa552032ca86a9a1e9d54bd01944eebaa2a78bddfe4b8d310f4e`
بایتبهبایت حفظ میشود. `gh api -X PATCH --input` (نه `gh pr edit --body-file`)
استفاده میشود. queued / in_progress / null / cancelled هرگز PASS اعلام نمیشوند.
