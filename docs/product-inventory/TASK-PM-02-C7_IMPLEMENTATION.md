# TASK-PM-02-C7 — هویت کالا: نام‌های جایگزین و مقادیر صفات (Product Identity)

**وضعیت:** پیاده‌سازی‌شده برای **همان مدل و همان قواعدی که از پیش در سامانه وجود دارد**:
سه نوع نام جایگزین (`brand_slang` / `latin` / `code`) با یکتایی `(product_id, alias_norm)` و
کنترل‌های برخورد H-1، و مدل EAV محدود صفات (`product_attribute_def` + `product_attribute_value`
با قید «دقیقاً یک ستونِ مقدار»). هیچ تاکسونومی، یکتاییِ شرکتی، نوع دادهٔ تازه، ویژگی الزامیِ
تازه، قاعدهٔ دامنه‌ای یا رفتار عملیاتی ساخته نشد. هر چیزی که سند مصوب ندارد، در UI/قرارداد
صریحاً **BLOCKED / UNRESOLVED** اعلام شده است.

**نوع کار:** DEVELOPMENT واقعی (بک‌اند + قرارداد + کلاینت تولیدشده + فرانت‌اند فارسی RTL +
تست + شاهد زندهٔ همین‌مبدأ + رفع دو ایراد واقعی ۵۰۰)، نه ممیزی یا مستندسازی صرف.

**عامل:** Agent-1 (Arena.ai) · **شاخه:** `arena/be5eaff3-green-dms` · **PR:** #14
(`OPEN / DRAFT`، base `main`، تغییر وضعیت/merge/approve/release/deploy انجام نشد).
**مبنا:** `a894246fe3fc8ee33fbb792bd074b7df56f2c49c` (پایان C6؛ پیش از شروع شش نمای SHA هم‌خوان
بود و worktree پاک: `git status --porcelain` خالی، `git diff --check` = ۰).
**چک‌پوینت پیش از نخستین نوشتن:** `/home/user/pm02-c7-checkpoint.tar.gz`
(۳٬۱۵۱٬۲۱۷ بایت، sha256 `a5cbd0b2f58aca088419886a241788ae749ee3168933f57e6df93d038160dc96`،
`sha256sum -c` → `OK`) + `git bundle --all` (`pm02-c7-checkpoint.bundle`، ۳٬۲۶۵٬۰۵۱ بایت،
`git bundle verify` → complete history، HEAD `a894246…`).

---

## ۱) بازیابی مبنا و حفظ شواهد

`git fetch origin --prune` اجرا و شش نما خوانده شد: local HEAD / local branch ref /
remote-tracking ref / `FETCH_HEAD` / `git ls-remote` / PR head — همه `a894246fe3fc8ee…`.
پیشرفت مبنا **لازم نبود** (C6 همان HEAD بود)؛ پس مبنا بدون تغییر مبنا پذیرفته شد و هیچ
reset / rebase / amend / force-push انجام نشد. اسناد و شواهد C1..C6 و M4/K/J دست‌نخورده ماندند؛
C7 فقط فایل تازه و پیوست افزودنی اضافه می‌کند.

---

## ۲) کشفِ قرارداد واقعی (پیش از هر تغییر)

| موضوع | یافتهٔ مستند (منبع) |
| --- | --- |
| جدول نام جایگزین | `product_alias` با `unique (company_id, product_id, alias_norm)` و قید `kind in ('brand_slang','latin','code')` (`migrations/0046`) |
| یکتاییِ واقعی | فقط **در سطح همان کالا**؛ هیچ یکتاییِ شرکتی/جهانی روی `alias_norm` وجود ندارد |
| برخوردِ بین‌کالایی | کنترلِ سرویس (`findAliasConflicts`): برخورد با `product.code`، با نام جایگزین کالای دیگر، و با هر `product_barcode` → ۴۰۹ `alias_collision` |
| نرمال‌سازی | `normalizeText` (NFC، ارقام فارسی/عربی→لاتین، حذف کنترلی‌ها، trim/فشردن فاصله، lowercase) |
| مصرف‌کننده‌ها | `GET /products?q=` و `GET /products/export?q=` (join با `product_alias`)، و `scan` که **فقط** `kind='code'` را به‌عنوان سومین fallback استفاده می‌کند (بارکد → کد کالا → alias_code) |
| نبودِ قابلیت | هیچ ستون `updated_at`/`row_version` و هیچ سیاست مصوبی برای «ویرایش» نام جایگزین وجود ندارد؛ مسیر UPDATE در کد نبود |
| مدل صفات | کاتالوگ در سطح **شرکت** (`product_attribute_def`، `kind ∈ {text,number,enum}`، `is_variant_axis`، `is_required`، `sort_order`) + مقادیر در سطح **SKU** (`product_attribute_value`، `unique(product_id,def_id)`، قید «دقیقاً یکی از `value_text`/`value_num numeric(19,4)`/`value_enum`») |
| enum | `product_attribute_enum_value` با `unique(def_id, value_norm)` |
| applicability | هیچ مفهوم دسته/دامنه‌ای برای صفات وجود ندارد؛ `is_required` در سطح **کل شرکت** است |
| امضا | `product.variant_signature` = sha256 از محورهای `is_variant_axis` با ترتیب قطعی `def_id`؛ قید یکتایی در خانواده |
| M-3 | پس از نخستین ارجاع عملیاتی (`sales_order_line`/`invoice_line`/`price_list_item`/`inventory_txn`/`waybill_line`) تغییر محورها ۴۰۹ `variant_signature_immutable` |
| تاریخچه | تریگر عمومی `0060` روی ۱۱ جدول، از جمله `product_alias` و `product_attribute_value` |

**دو ایراد واقعی که با اجرای زنده بازتولید شد و در C7 رفع شد:**

1. `PUT /products/{id}/attributes` با مقدار خالی/`null` → **۵۰۰ `internal_error`** (نقضِ قید
   DB داخل تراکنش). اکنون **۲۰۰** با حذف ردیف و `cleared: [def_id]` (یا `clear:true`).
2. ایمپورت/ساخت صفت با کد تکراری و افزودن مقدار enum تکراری → **۵۰۰**؛ قرارداد برای همان
   مسیرها از پیش `409` اعلام کرده بود. اکنون `409 duplicate_attribute_code` /
   `409 duplicate_enum_value`.

---

## ۳) کاتالوگ عملیات: IMPLEMENTABLE / BLOCKED / UNSUPPORTED

| قابلیت | طبقه | حکم C7 و شاهد |
| --- | --- | --- |
| فهرست نام‌های جایگزین کالا | **IMPLEMENTED** | `GET /products/{id}/aliases` — `kind` filter، `limit` (۱..۲۰۰، پیش‌فرض ۱۰۰)، شمارش مستقل از فیلتر، `truncated`، سه نوع مصوب با `used_in_scan` |
| افزودن نام جایگزین | **IMPLEMENTED** | `POST /products/{id}/aliases` — همان قواعد H-1، سقف فنی ۵۰ ردیف، ممیزی fail-closed، `confirm_add` اختیاری |
| حذف نام جایگزین | **IMPLEMENTED** | `DELETE /products/{id}/aliases/{aliasId}` — فقط ردیفِ همین کالا و همین شرکت؛ حذف از مسیر کالای دیگر ۴۰۴ |
| ویرایش نام جایگزین (تغییر `alias`/`kind`) | **UNSUPPORTED (تصمیم مالک)** | هیچ سیاست مصوبی و هیچ ستون نسخه‌ای وجود ندارد؛ حذف+افزودن مسیر ممیزی‌شده است (`C7-D2`) |
| یکتاییِ شرکتی/جهانی نام جایگزین | **BLOCKED** | پایگاه‌داده چنین قیدی ندارد و افزودن آن قاعدهٔ تازه + مهاجرت می‌خواهد؛ برخورد فقط **اطلاع‌رسان** گزارش می‌شود (`C7-D1`) |
| ادغام/انتقال نام جایگزین بین کالاها | **BLOCKED** | صریحاً خارج از دامنه |
| استفاده از نام جایگزین برای تعیین مجوز/مالکیت | **BLOCKED** | هیچ مسیر مجوزی بر پایهٔ alias وجود ندارد؛ مجوزها همان `master.product.view/update` |
| بازنویسی شناسه در اسناد عملیاتی هنگام تغییر نام جایگزین | **BLOCKED** | کد اصلی کالا هرگز تغییر نمی‌کند و هیچ سندی بازنویسی نمی‌شود |
| فهرست صفات + مقدار + الزام + محور + امضا | **IMPLEMENTED** | `GET /products/{id}/attributes` — نمای کامل کاتالوگِ شرکت + مقدارِ همین SKU + `signature_locked` + شمارش‌ها + شکل سازگار `values` |
| ثبت/ویرایش/پاک‌کردن مقدار صفت | **IMPLEMENTED** | `PUT /products/{id}/attributes` — تطابق kind↔column، enum از فهرست مجاز، الزام شرکت‌محور، M-3، امضای قطعی، ممیزی |
| تعریف صفت تازه از کلاینت (تاکسونومی) | **BLOCKED** | کاتالوگ فقط از `POST /product-attributes` با مجوز کاتالوگ؛ در مسیرِ مقادیر، فیلد `def_code`/`title`/`kind` صریحاً ۴۰۰ `unsupported_request_field` |
| صفت الزامیِ تازه، نوع دادهٔ تازه، وراثت دسته‌ای، قاعدهٔ دامنه‌ای | **BLOCKED** | هیچ‌کدام در مدل موجود نیست و C7 نمی‌سازد |
| تاریخچهٔ مقادیر/نام‌ها | **IMPLEMENTED (خواندن)** | `GET /products/{id}/identity/history` از تریگر ۰۰۶۰، بدون نشت `before/after` خام |
| بازگردانی (rollback) یک رویداد تاریخی | **UNSUPPORTED** | قاعدهٔ مصوب ندارد؛ تاریخچه فقط خواندنی است |

---

## ۴) تغییرات پیاده‌سازی

**بک‌اند (NestJS):**

- `apps/api/src/modules/master-data/product-identity.rules.ts` — کاتالوگ معنایی C7 (انواع، سقف‌های
  فنی، فیلدهای ممنوع کلاینتی، برچسب‌های فارسی، هشدارها، تصمیم‌های باز `C7-D1..D7`).
- `.../product-identity.service.ts` — سرویس هویت: `listAliases` / `addAlias` / `removeAlias` /
  `listAttributes` / `setAttributeValues` / `identityHistory`.
- `.../product-identity.controller.ts` — کنترلر اختصاصی با `@UseGuards(AuthGuard, PermissionsGuard,
  DomainBoundaryGuard)` روی کل سطح، `@RequirePermissions('master.product.view'|'master.product.update')`.
- `product-catalog.controller.ts` و `product-master.service.ts` — مسیرهای alias و مقادیر صفات از
  کنترلر/سرویسِ کاتالوگ **حذف** شدند (نه تکرار): تنها یک پیاده‌سازی در سامانه باقی است. کاتالوگ
  صفات (`/product-attributes`) و تصمیم‌های قدیمی (bundle/duplicate) دست‌نخورده ماندند.
  `DELETE /product-aliases/{aliasId}` (بدون `product`) **حذف شد**؛ قرارداد و سرویس از پیش فقط
  `DELETE /products/{id}/aliases/{aliasId}` را می‌شناختند.
- اصلاح دو ۵۰۰ واقعی در کاتالوگ صفات (§۲).
- `master-data.module.ts` — ثبت سرویس/کنترلر تازه.
- کلاینت‌های تولیدشده: `packages/api-client/src/schema.ts` بازتولید شد.

**قرارداد (**`packages/contracts/openapi.yaml`**):**

- `/products/{id}/aliases` (GET با `kind`/`limit`، POST) → اسکیمای `ProductAliasOverview`
  (شامل `kinds`, `items`, `aliases`, `counts`, `scan_resolution_fa`, `downstream_notes_fa`,
  `owner_decisions_fa`) و `ProductAliasItem`.
- `/products/{id}/aliases/{aliasId}` (DELETE) → `ProductAliasDeleteResult`.
- `/products/{id}/attributes` (GET/PUT) → `ProductAttributesOverview` (شامل `attributes`,
  `values`, `signature_locked`, `variant_signature`, `counts`, …)، `ProductAttributeCatalogEntry`,
  `ProductAttributeValueInput` (شامل `clear`)، `ProductAttributeValuesResult`.
- `/products/{id}/identity/history` (GET) → `ProductIdentityHistory`.
- `409` روی `POST /product-attributes` با توضیح `duplicate_attribute_code` مستند شد.
- نتیجهٔ `npm run openapi:check`: **۲۲۹ مسیر / ۳۲۴ عملیات / ۲۳۳ اسکیما / ۳ وب‌هوک**؛
  `node scripts/contract-drift.mjs`: **۳۲۴ عملیات قرارداد = ۳۲۴ عملیات کد، drift ۰**.

**فرانت‌اند (فارسی، RTL کامل):**

- `apps/web/src/app/products/[id]/product-aliases.tsx` — نمای کامل: کارت شمارش بر اساس نوع،
  متن قطعی ترتیب اسکن، فیلتر نوع، افزودن با **تأیید صریح**، حذف دومرحله‌ای، هشدار برخورد نرم،
  وضعیت خالی/بارگذاری/موفقیت/خطا با «تلاش دوباره»، حالت فقط‌خواندنی با علت فارسی، و بخش
  «مرزها و تصمیم‌های باز مالک».
- `apps/web/src/app/products/[id]/product-attributes.tsx` — جدول کاتالوگِ صفات با نوع/الزام/محور،
  ویرایش/ثبت مقدار (متن، عدد با پذیرش ارقام فارسی و `٫`، enum فقط از فهرست مجاز)، «پاک کردن»
  با تأیید، قفلِ محورهای variant وقتی ارجاع عملیاتی وجود دارد، نمایش امضا و قاعدهٔ آن، و
  تاریخچهٔ هویت.
- `[id]/page.tsx` — تب‌های «صفات و variant» و «نام‌های جایگزین» به کامپوننت‌های تازه وصل شدند؛
  تب‌های چرخهٔ حیات/روابط/تصاویر/تاریخچه/دامنه/بسته‌بندی دست‌نخورده‌اند.

---

## ۵) امنیت، ایزوله‌سازی و یکپارچگی داده

- `AuthGuard` + `PermissionsGuard` + `DomainBoundaryGuard` روی **همهٔ** مسیرهای تازه؛
  `master.product.view` برای خواندن و `master.product.update` برای نوشتن (همان مجوزهای C1..C6).
- شرکت/اجاره فقط از زمینهٔ نشست سرور (`user.companyId`) و از طریق `CatalogAccess.assert/write`
  (GUCهای اجاره + advisory lock + `catalog_context_mismatch`)؛ هیچ مسیر alias به مجوز «میان‌بر» تبدیل نشد.
- فیلدهای کلاینتی `company_id`/`tenant_id`/`actor_user_id`/`created_by`/`domain_id`/`permission…`/
  `audit…` → **۴۰۰ `forbidden_client_field`**؛ فیلدهای تعریف‌نشده → **۴۰۰ `unsupported_request_field`**.
- `x-domain-id` → **۴۰۰ `domain_context_not_supported`**؛ کوئری/بدنهٔ دامنه‌ای → **۴۰۰**.
- کالا/نام جایگزینِ شرکت دیگر → **۴۰۴ یکنواخت** (`not_found`/`alias_not_found`) بدون نشت وجود داده.
- ممیزی: `audit.recordRequired` (fail-closed) در همان تراکنشِ نوشتن؛ تاریخچهٔ ۰۰۶۰ مستقل از آن.
- هم‌روندی: ثبت مقدار صفات در `CatalogAccess.write` سریال می‌شود و برخورد امضای variant در خانواده
  به **۴۰۹ `duplicate_variant_signature`** تبدیل می‌شود (تست هم‌روندی + قید DB).

---

## ۶) سازگاری عملیاتی (بدون تغییر رفتار پایین‌دست)

- کد اصلی کالا و هیچ شناسهٔ سند عملیاتی بازنویسی نمی‌شود (تست و شاهد زنده).
- هیچ ادغام خودکار کالا و هیچ ادغام نام جایگزین بین کالاها وجود ندارد.
- جست‌وجوی فهرست و خروجی CSV با `q` همان قرارداد C1 را دارند و نام جایگزین هم‌چنان از همین
  مسیر جست‌وجو می‌شود (بدون تغییر کد).
- `scan` بدون تغییر: بارکد → کد کالا → alias نوع `code`، با خطای صریح در چندپاسخی.
- قیمت‌گذاری، موجودی، COGS، بسته‌بندی، ضمائم (C4) و چرخهٔ حیات (C5) و روابط (C6) دست‌نخورده‌اند:
  هیچ ماژول فروش/قیمت/موجودی در C7 تغییر نکرد (`git diff --stat` را ببینید).
- `product_bundle` خارج از دامنه؛ هیچ رفتاری از bundle تغییر نکرد.

---

## ۷) تصمیم‌های بازِ مالک (اعلام‌شده در UI و قرارداد)

| شناسه | موضوع | وضعیت |
| --- | --- | --- |
| `C7-D1` | یکتایی شرکتی/جهانی نام جایگزین و رفتار برخورد بین کالاها | UNRESOLVED (برخورد فقط اطلاع‌رسان) |
| `C7-D2` | ویرایش نام جایگزین موجود (تغییر مقدار/نوع) | BLOCKED (مسیر مصوب ندارد) |
| `C7-D3` | جست‌وجو/انتخاب کالا با نام جایگزین در فروش/سفارش | UNRESOLVED (قرارداد lookup مصوب ندارد) |
| `C7-D4` | دامنهٔ الزام صفات (شرکت‌محور در برابر دسته‌محور) | BLOCKED |
| `C7-D5` | صفات مختصِ دسته/دامنه و وراثت | BLOCKED (PM-B1..PM-B8) |
| `C7-D6` | چرخهٔ حیات مقدار صفت (تاریخچه‌مندی/بازگردانی) | UNRESOLVED |
| `C7-D7` | تبدیل/یکسان‌سازی نام جایگزین‌های تاریخی (backfill) | BLOCKED |

---

## ۸) پیوست‌ها

- `VERIFICATION-C7.txt` / `VERIFICATION-C7.json` — کارنامهٔ اجرایی همین‌مبدأ.
- `evidence/task-pm-02/VERIFICATION-C7-LIVE.txt` — ۴۸ سنجش زندهٔ HTTP/DB با پاسخ‌های واقعی.
- راهنمای اپراتور فارسی — §۱۲.
