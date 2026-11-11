# TASK-PM-02-C3 — ضمائم سازمانی (Enterprise-Wide Entity Attachments)

**وضعیت:** پیادهسازی شده · **نوع کار:** DEVELOPMENT واقعی (بکاند + قرارداد + فرانتاند + تست + شاهد زنده)، نه ممیزی/مستندسازی صرف
**عامل:** Agent-1 (Arena.ai) · **شاخه:** `arena/be5eaff3-green-dms` · **PR:** #14 (`OPEN / DRAFT`, base `main`)
**مبنای بازیابی:** `19d412a966bd612694a08b58e133f71d9c6ba3fa` (C2 نهایی = head شاخه / `origin` / `ls-remote` / head PR / `FETCH_HEAD`)
**چکپوینت قابل بازیابی:** `/home/user/pm02-c3-checkpoint.tar.gz` + `.sha256`
(`75d2cf6fed6d0ebfbb6b6dbd00272e97a08bc9b22b988329b2c935918eb2dd5e`) و
`/home/user/pm02-c3-checkpoint.bundle` (`git bundle --all`)؛ ۲٬۸۷۳ فایل، بدون حذف/جابهجایی.

---

## ۱) بازیابی مبنا و حفظ شواهد

`git fetch` و `git pull --ff-only` (`Already up to date`) انجام شد؛ شش نمای SHA
(HEAD، `origin/...`، `ls-remote`، head PR، شاخه، مبنای اعلامشده) همگی
`19d412a966bd612694a08b58e133f71d9c6ba3fa` و `ALL_AGREE=True`، worktree پاک،
`git diff --check=0`. چکپوینت پیش از نخستین نوشتن ساخته شد. تمام فایلها،
گزارشها و شواهد C1/C2/B2/M4/K/J **بدون ویرایش** حفظ شدند؛ فقط پیوستهای
**افزودنی** C3 به برخی اسناد اضافه شد. هیچ amend / force-push / reset /
rebase / merge / approve / release / deploy انجام نشد.

---

## ۲) ماتریس واجدشرایطبودن موجودیتها

منبع حقیقت، `apps/api/src/modules/attachments/attachments.dto.ts`
(`ATTACHMENT_OWNER_TYPES`)، enum همنام در `packages/contracts/openapi.yaml`،
`apps/api/src/modules/attachments/owner-scope.ts` (`ownerTenantSql`) و مهاجرتهای
`0002` / `0035` / `0036` / `0041` است — نه حدس یا نام صفحه.

| موجودیت | `owner_type` | پشتیبانی مالک موجود | ارزش کسبوکاری | مجوز | تصمیم پیادهسازی |
| --- | --- | --- | --- | --- | --- |
| سفارش فروش | `sales_order` | ✅ `sales_order.branch_id → branch.company_id` | اسناد سفارش / مدرک تحویل | `attachment.view\|upload` (۰۰۳۵) | **IMPLEMENTED end-to-end** — جزئیات سفارش |
| فاکتور فروش | `invoice` | ✅ `invoice.branch_id → branch.company_id` | اسکن فاکتور، پیوست مؤدیان | همان | **IMPLEMENTED end-to-end** — ستون ردیفها |
| درخواست مرجوعی | `return_request` | ✅ `return_request.branch_id → branch.company_id` | تصویر کالای آسیبدیده / دلیل مرجوعی | همان | **IMPLEMENTED end-to-end** — پنل جزئیات |
| سند انبارگردانی | `stock_count` | ✅ `stock_count.branch_id → branch.company_id` | برگهٔ شمارش، شواهد مغایرت | همان | **IMPLEMENTED end-to-end** — ستون ردیفها |
| سند حسابداری | `journal_entry` | ✅ `journal_entry.company_id` | مستندات پیوست سند | همان | **IMPLEMENTED end-to-end** — دیالوگ جزئیات دفتر کل |
| رسید پرداخت | `receipt` | ✅ `payment_receipt.branch_id → branch.company_id` | تصویر رسید وصول | همان | **BACKEND-READY / UI DEFERRED** — لایهٔ مشترک پاسخگو است، ولی صفحهای که فهرست رسیدها را نشان دهد وجود ندارد |
| مدرک تحویل | `pod` | ✅ `pod.delivery_id → delivery.branch_id → branch.company_id` | عکس/امضای تحویل | همان | **BACKEND-READY / UI DEFERRED** — همان دلیل؛ صفحهٔ مدیریت POD اختصاصی نیست |
| کالا | `product` | ✅ `product.company_id` | تصویر/کاتالوگ کالا | `master.product.*` (C1) | **PRESERVED / NOT DUPLICATED** — نمای محصولمحور C1 با قاعدهٔ «اصلی (خودکار)» §B4 انحصاراً پابرجاست |
| نامشخص | `other` | ❌ راستیآزماییناپذیر، fail-closed | — | — | **REJECTED** (`unsupported_owner_type`) |
| برند / دسته / انبار / واحد | — | ❌ در enum مصوب نیست | قابل تصور | نیازمند طراحی مجوز تازه | **BLOCKED / NOT AUTHORIZED** — افزودنشان «اختراع نوع مالک» است |

**نتیجه:** هفت نوع عملیاتی مصوب پشتیبانی میشوند و **پنج موجودیت** واقعاً
(end-to-end: بکاند + قرارداد + UI + تست + شاهد زنده) به قابلیت مشترک متصلاند.
هیچ `owner_type`، جدول، مهاجرت، مجوز، نقش، grant، seed یا معنای دامنهای تازهای
ساخته نشد. انواع `brand`/`product_category`/`warehouse`/`uom` عمداً رد میشوند
(`unsupported_owner_type` در تست HTTP و شاهد زنده).

---

## ۳) معماری مشترک (بدون تکرار منطق Product Media)

- **`AttachmentsModule` موجود** همچنان تنها صاحب `AttachmentsService`،
  `AttachmentsRepository`، `StorageService`، allowlist/امضای بایتی، SHA-256،
  کلید نامفضاشده، URL امضاشدهٔ کوتاهعمر، `ownerTenantSql` و RLS/FORCE RLS است.
- **`EntityAttachmentsModule` تازه** فقط یک **لایهٔ هماهنگکننده** روی همان
  سرویسهاست: `entity-attachments.{rules,service,controller,module}.ts`.
  هیچ کد ذخیره/مالکیت/RLS تازهای نوشته نشد؛ `AUDIT_SERVICE` و `PG_POOL`
  (هر دو `@Global`) و `DomainBoundaryGuard` مصوب B2 تزریق شدند. ثبت دوبارهٔ
  گارد در این ماژول وابستگی دوری Nest ایجاد نمیکند (فقط به دو ارائهدهندهٔ
  سراسری نیاز دارد).
- **بهبود افزودنی در زیرساخت موجود:** `AttachmentsService.upload` یک قلاب
  اختیاری `onObjectStored(storageKey)` گرفت (پس از `storage.put`، پیش از ثبت
  ردیف). لایهٔ C3 از آن برای **پاکسازی اورفان در شکست هر گام بعدی** (ثبت DB،
  صدور URL، یا ممیزی تراکنشی) استفاده میکند. فراخوانهای تاریخی
  (`POST /attachments` و C1) بدون تغییر و بدون قلاب میمانند.
- **ممیزی تراکنشی:** ثبت `attachment` و `audit_log`
  (`entity_type=entity_attachment`, `action=create`) در **یک** `withTransaction`
  با GUCهای تراکنش-محلی `app.company_id`/`app.user_id` انجام میشود. شکست ممیزی
  ⇒ rollback + حذف شیء استوریج. `after_data` فقط metadata است؛ **هیچ URL
  امضاشده، `storage_key` یا ورودی خام کلاینتی** در ممیزی/لاگ نیست (شاهد DB: ۰ نشت).
- **چهار لایهٔ مجوز:** `AuthGuard` → `PermissionsGuard`
  (`attachment.upload|view`) → بازاعتبارسنجی همان مجوز از روی DB در سرویس →
  RLS/FORCE RLS + زنجیرهٔ مالکیت والد. `DomainBoundaryGuard` پیش از
  `ValidationPipe` کلید/هدر دامنهای را صریحاً ۴۰۰ میکند (همسانی B2).
- **مالک فقط از مسیر و نشست:** `owner_type`/`owner_id` پارامتر مسیراند،
  `company_id`/`userId` از `AuthContext`. ارسال `owner_type`، `owner_id`،
  `company_id`، `tenant_id`، `uploaded_by`، `storage_key` یا فیلد دامنهای در
  بدنه/کوئری **۴۰۰ صریح** میگیرد (نه حذف بیصدای whitelist). هر پارامتر
  ناشناختهٔ کوئری و هر فیلد اضافی multipart نیز ۴۰۰ دارد.

---

## ۴) بکند، قرارداد و پایگاهداده

سه مسیر مشترک (برای همهٔ هفت نوع واجدشرایط):

```
GET  /entity-attachments/{ownerType}/{ownerId}
POST /entity-attachments/{ownerType}/{ownerId}                     (multipart: فقط file)
GET  /entity-attachments/{ownerType}/{ownerId}/{attachmentId}/url
```

- پاسخها: `EntityAttachmentView` (برچسب فارسی مصوب، مسیر ماژول، شمارش
  تصویر/سند/کل، `note_fa`، `message_fa`)، `EntityAttachmentItem`
  (همان `Attachment` + `kind`/`kind_label_fa` محاسبهشده در لحظه)،
  `AttachmentUrl` موجود. **هیچ** `is_primary` / `sort_order` / `domain_id` /
  `available` وجود ندارد.
- **OpenAPI:** ۲۱۳ مسیر / ۳۰۷ عملیات / ۱۷۸ اسکیما / ۳ وبحوک
  (مبنا ۲۱۱/۳۰۴/۱۷۴/۳)، `openapi-check` معتبر، **drift=۰** (کد ⊆ سند و
  سند ⊆ کد)، انحراف enum/required صفر، کلاینت TypeScript بازتولیدشد (+۲۴۴ خط).
- **بدون مهاجرت:** جدول `attachment` وfkها، ستون `company_id` (۰۰۳۵)،
  RLS (۰۰۳۶)، FORCE RLS + `fn_current_company_id()` (۰۰۴۱) و
  `ownerTenantSql` دقیقاً دستنخوردهاند. چرخهٔ up/down/up روی DB موقت:
  **۱٬۰۳۳ شیء یکسان**، پارتیشن تستها ۹۲ فایل `declared == computed`.
- **سازگاری:** `POST/GET /attachments`، `GET /attachments/{id}/url`،
  `/products/{id}/media`، `uploadAttachment` و `uploadProductMedia` بدون تغییر
  و در تست رگرسیون/شاهد زنده PASSاند. `Attachments.tsx` قدیمی به یک نگهدارندهٔ
  نازک تبدیل شد که همان جزء مشترک را صدا میزند؛ امضای props حفظ شد.

---

## ۵) فرانتاند — یک جزء، پنج صفحهٔ واقعی

`apps/web/src/components/EntityAttachments.tsx` **تنها** پیادهسازی UI ضمائم
عملیاتی است؛ `EntityAttachmentLauncher` همان جزء را در دیالوگ دسترسپذیر
صفحههای فهرستی سوار میکند.

| صفحه | نحوهٔ اتصال | موجودیت |
| --- | --- | --- |
| `/orders/[id]` | `Attachments` (نگهدارندهٔ سازگاری) | `sales_order` |
| `/invoices` | ستون «ضمائم» + `EntityAttachmentLauncher` | `invoice` |
| `/returns` | پنل جزئیات درخواست | `return_request` |
| `/stock-count` | ستون اقدامات + launcher | `stock_count` |
| `/gl` | دیالوگ جزئیات سند | `journal_entry` |
| `/attachments-center` | **مرکز ناوبری** (پیوندهای واقعی به پنج ماژول + مرزهای پشتیبانی) | — |

ویژگیها: فهرست responsive، نوع/حجم/تاریخ/برچسب، شمارشها، پیشرفت **واقعی**
بایتها (`XMLHttpRequest.upload.onprogress` + `ProgressBar` با
`role="progressbar"`)، بارگذاری/خالی/خطا/تلاش مجدد، نگهدارندهٔ سازگاری که مجوز نوشتن را بهجای `true` پیشفرض از نشست میگیرد، URL امضاشدهٔ تازه هنگام
انقضای تصویر، دانلود/پیشنمایش امن (`noopener,noreferrer`)، پیامهای خطای فارسی،
`aria-label`/`role="alert"`/`role="status"`/`aria-busy`، جهت منطقی `start/end`
و `dir="auto"` برای نام فایل، پیوند «باز کردن صفحهٔ …» برای ناوبری، و
read-only وقتی مجوز `attachment.upload` نباشد. **هیچ** دکمهٔ حذف، بایگانی،
انتخاب تصویر اصلی یا سیاست نگهداشت وجود ندارد.

---

## ۶) نتایج تستها و اعتبارسنجی (واقعی)

| دروازه | نتیجه |
| --- | --- |
| متمرکز C3 بکند (قواعد خالص + HTTP/DB) | **PASS** ۲ فایل / ۱۶ تست |
| متمرکز وب C3 (جزء + سیمکشی + نگهدارندهٔ فقطخواندنی) | **PASS** ۲ فایل / ۱۴ تست |
| وب کامل | **PASS** ۲۴ فایل / ۱۳۲ تست (مبنا ۲۲/۱۱۸) |
| واحد بیدادهٔ API (بدون `DATABASE_URL`) | **PASS** ۳۳ فایل / ۳۹۵ تست (مبنا ۳۲/۳۸۹) |
| `contract.api.test.ts` اجراشده | **PASS** ۸۰/۸۰ |
| `migrations-security.test.ts` | **PASS** ۸/۸ |
| رگرسیون C1 (`product-media.api`) / C2 (`reference-data.api`) / `attachment-owner-scope` | **PASS** ۸/۸، ۹/۹، ۱۹/۱۹ |
| `typecheck` و `build` ریشه | **PASS** (شامل صفحهٔ `/attachments-center`) |
| OpenAPI / drift / پارتیشن / diffcheck | **PASS**؛ ۲۱۳/۳۰۷/۱۷۸/۳، drift=۰، ۹۲ فایل، ۰ |
| مهاجرت up/down/up | **PASS**؛ ۱٬۰۳۳ شیء یکسان |
| اجرای کامل DB-backed API | ۸۷/۹۲ فایل و **۱٬۵۲۱/۱٬۵۴۰** تست PASS؛ ۵ فایل / ۱۹ شکست محیطی |
| کنترل مبنای پاک | **PASS** `identical=True`؛ فایلها **و** ۱۹ عنوان شکست دقیقاً همان مبنای C2 (`aa0028a…` / `/tmp/pm02c2-baseline-tests.log`) |
| شاهد زندهٔ همانمبدأ | **PASS** `evidence/task-pm-02/VERIFICATION-C3-LIVE.txt` |

شکستهای محیطی (غیرمرتبط، تکرارشده روی مبنای پاک):
`attachments.api.test.ts` (MinIO واقعی)، `customers.api.test.ts` و
`geofences.api.test.ts` (PostGIS)، `postgres-init-role.api.test.ts`
(trust-auth محلی)، `tours.api.test.ts`. PG محلی ۱۶٫۲ با trust-auth و MinIO
شبیهساز **معادل CI/تولید نیست**؛ CI دقیقSHA در §۸ جداگانه ثبت میشود.

**شاهد زنده:** ورود، نمای خالی پنج موجودیت، **پنج آپلود واقعی** (۴ تصویر +
۱ PDF) با SHA-256 و URL امضاشده، فهرست/شمارش، URL تازه (۳۰۰ ثانیه)، ۴۰۴
ضمیمهٔ مالک دیگر، رد `brand`/`product`/`other`، شناسهٔ نامعتبر، مالک ناموجود،
تزریق `owner_id`/`company_id`، فیلد ناشناخته، `x-domain-id`، `?available=true`،
`?foo=1`، امضای بایتی جعلی ۴۱۵، ۴۰۱، رگرسیون `/attachments` و
`/products/{id}/media`، و ۶ صفحهٔ وب `200`. راستیآزمایی DB همان پیشنمایش:
۵ رویداد `entity_attachment` و **۰** نشت URL/`storage_key` در `after_data`.
هیچ اسکرینشات ساختگی ثبت نشد.

---

## ۷) امنیت و مرزها

حفظشده: RBAC موجود، جداسازی اجارهها، RLS + FORCE RLS روی `attachment`،
`ownerTenantSql`، تضمینهای D4، جدایی مرکزی/دامنهای B1، همسانی fail-closed B2،
ممیزی تراکنشی، `AuditService.recordRequired`. هم مسیر و هم پایگاهداده مجوز را
اعمال میکنند. **هیچ** مجوز/نقش/grant/seed/RLS/مهاجرت/`domain_id`/عضویت/
چرخهٔ حیات/انتساب/سیاست حذف یا بایگانی/انتخابگر اصلی/`sort_order` تازهای
نیامد. URL امضاشده با عمر محدود (پیشفرض ۳۰۰ ثانیه) و bucket غیردسترسعمومی؛
شکست استوریج ۵۰۳ ساختاریافته، شکست ثبت DB/ممیزی ⇒ rollback + پاکسازی اورفان.

**BLOCKED (بدون تغییر):** PM-B1..PM-B8، Q1..Q5، G-03، registry/چرخهٔ حیات/
انتساب/عضویت/RLS و مهاجرت دامنهای، backfill/cutover، whole-file import،
پذیرش کامل Product Master. **NOT AUTHORIZED:** استقرار تولید، merge، approve،
release. G-06 همچنان `IMPLEMENTED WITH GAPS` است (G-13 و Q1..Q5 بازاند).
**UNVERIFIED:** مرورگر دستی RTL/a11y/console، round-trip production MinIO/S3،
معادل دقیق توپولوژی CI/تولید برای PG محلی.

---

## ۸) Git، CI و PR

بهصورت **commit معمولی** روی همان شاخه ثبت و `git push origin arena/be5eaff3-green-dms`
شد (جزئیات SHA/پیام در `VERIFICATION-C3.txt`). PR #14 همچنان `OPEN / DRAFT` با
base `main`، بدون review/approve. نتیجهٔ CI دقیقاً روی SHA نهایی C3 **جداگانه**
از CI تاریخی C2 (`19d412a…` = PASS) و C1 (`aa0028a…` = NOT PASS، شکست
زیرساختی `psql install`) در بدنهٔ PR و گزارش نهایی چت ثبت میشود؛
`queued`/`in_progress`/`null` هرگز `PASS` اعلام نمیشود. هیچ commit مصنوعی
برای trigger کردن CI ساخته نشد. شش نمای SHA پیش از اتمام دوباره همسنجی میشود.
بدنهٔ PR بهصورت **افزودنی** و با حفظ بایتبهبایت تمام شواهد پیشین بهروز شد.

---

## ۹) احکام جداگانهٔ موجودیتها

| موجودیت | پیادهسازی | تست خودکار | پیشنمایش زنده | CI دقیقSHA | حکم |
| --- | --- | --- | --- | --- | --- |
| **Sales order** | بکاند + UI + ناوبری | PASS | PASS | §۸ | **PASS** |
| **Invoice** | بکاند + UI + ناوبری | PASS | PASS | §۸ | **PASS** |
| **Return request** | بکاند + UI + ناوبری | PASS | PASS | §۸ | **PASS** |
| **Stock count** | بکاند + UI + ناوبری | PASS | PASS | §۸ | **PASS** |
| **Journal entry** | بکاند + UI + ناوبری | PASS | PASS | §۸ | **PASS** |
| **Receipt / POD** | بکاند مشترک (۷ نوع) | PASS (نوع مجاز + ۴۰۴ مالک) | PASS (نوع مجاز) | §۸ | **PASS (backend)** / **UI DEFERRED** |
| **Brand / Category / Warehouse / UOM** | — | — | — | — | **BLOCKED / NOT AUTHORIZED** |
| **معادل production MinIO/S3، مرورگر دستی/a11y** | — | — | — | — | **UNVERIFIED** |
| **PM-B*/Q*/G-03، پذیرش کامل، deploy** | — | — | — | — | **BLOCKED / NOT AUTHORIZED** |
| **FAIL** | — | — | — | — | **هیچ** |

---

## ۱۰) ماژول منطقی بعدی

**بدون نیاز به مجوز مالک:** `TASK-PM-02-C4 — مرکز import/export عمومی اسناد
و ضمائم` : همان قابلیت مشترک C3 را با الگوی «گزارش پیشنمایش خواندنی + تأیید
دوطرفه + تاریخچهٔ ممیزی» M4 برای فهرست/خروجی ضمائم چندموجودیتی تکمیل کند؛
بدون مهاجرت، بدون سیاست حذف/بایگانی، بدون معنای دامنهای، بدون تغییر
`whole-file import` (آن همچنان وابسته به Q1..Q5 است). این فقط **توصیه** است.

**گام مسدود بعدازآن:** تنها پس از بستهٔ امضاشدهٔ مالک (جدول ۷ ستونی
PM-B1/PM-B2/PM-B4، مرجع تصویب، نمونههای تأییدشده، امضای IAM/Security،
سیاست cutover/backfill، تستهای پذیرش) ابتدا registry شرکت-محور، چرخهٔ حیات و
انتساب actor→domain با RLS/grants و شواهد up/down/up؛ سپس عضویت و
دسترسپذیری. G-13 و whole-file import همچنان وابسته به Q1..Q5اند.

---

**شواهد ساختاریافته:** `VERIFICATION-C3.json` / `VERIFICATION-C3.txt`؛
**شاهد زنده:** `evidence/task-pm-02/VERIFICATION-C3-LIVE.txt`؛
**شاخص:** `EVIDENCE_INDEX.md` پیوست C3.
