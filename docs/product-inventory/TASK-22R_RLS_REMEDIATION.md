# TASK-22R — رفع HIGH-01: جداسازیِ اجارهٔ Product Master در پایگاه‌داده (RLS)

> **وضعیت:** اجراشده — نیازمندِ بازبینیِ مستقلِ مالک.
> **شاخه:** `arena/0d6d3dbc-green-dms` · **PR:** #9 (بدونِ merge) · **تاریخ:** 2026-11-07
> **مهاجرتِ جدید:** `0047_product_master_rls` (+ down کامل و بازگشت‌پذیر)
> **تستِ جدید:** `apps/api/test/product-master-rls.test.ts` (۶۴ سناریویِ پویا زیرِ نقشِ `dms_app`)

## ۱) آشتیِ دامنه — «۸ در برابر ۹» و عددِ واقعی: ۱۰

گزارشِ TASK-22Q «۸ جدولِ بدون RLS» نوشته بود اما ۹ نام فهرست کرده بود. بازرسیِ
مستنداتی (کاتالوگِ زنده + متنِ 0046 + کلیدهای خارجی) نشان داد:

- مهاجرت `0046_product_master` **ده** جدولِ مالکِ اجاره می‌سازد و هیچ‌کدام RLS نداشتند:
  `product_family`، `product_alias`، `product_attribute_def`،
  `product_attribute_enum_value`، `product_attribute_value`، `product_relation`،
  `product_bundle`، `product_barcode`، **`product_code_seq`**، `product_import`.
- عددِ «۸» عدم‌تقارنِ داخلیِ خودِ گزارش بود؛ `product_code_seq` اصلاً در فهرستِ ۹تایی هم نبود.

## ۲) ماتریسِ مالکیت/جداسازی (شواهدمحور)

| جدول | مالکِ اجاره | کلیدِ اجاره | مسیرِ والد | RLS پیشین | طراحیِ سیاستِ 0047 |
|---|---|---|---|---|---|
| product_family | بله | company_id | — | — | مستقیم (`fn_current_company_id`) |
| product_attribute_def | بله | company_id | — | — | مستقیم |
| product_code_seq | بله | company_id (PK) | — | — | مستقیم |
| product_import | بله | company_id | — | — | مستقیم |
| product_alias | بله | company_id | product_id→product | — | هیبرید: مستقیم + دیده‌شدنِ والد |
| product_relation | بله | company_id | product_id, related_id→product | — | هیبرید + هر دو والد |
| product_barcode | بله | company_id | product_id→product، packaging_id→product_packaging (nullable) | — | هیبرید + والدِ شرطی |
| product_attribute_enum_value | بله | — | def_id→product_attribute_def | — | زنجیرهٔ والد |
| product_attribute_value | بله | — | product_id + def_id | — | زنجیرهٔ والد (هر دو) |
| product_bundle | بله | — | bundle_product_id + component_product_id→product | — | زنجیرهٔ والد (هر دو) |

**جدول‌هایِ تغییریافته توسط 0046 (تقویتِ سیاستِ موجود فقط برایِ کلیدِ خارجیِ افزوده‌شده):**

| جدول | ستونِ جدید | اقدام |
|---|---|---|
| product | family_id | + شرطِ «تهی یا والد دیده می‌شود» |
| price_list_item | packaging_id | همین شرط |
| customer_price | packaging_id | همین شرط |
| sales_order_line / invoice_line / credit_note_line / return_request_line | packaging_id | همین شرط |

**نمای `v_document_line_display`:** با `security_invoker=true` مسیرِ دسترسیِ جایگزینِ
نمایِ definer-rights (مالکِ superuser ⇒ دورزدنِ RLS برای `dms_app`) بسته شد.

## ۳) رفتارِ اثبات‌شده (قبل/بعد)

- **پیش از رفع:** `product-master-rls.test.ts` ⇒ **۵۸ شکست / ۶ موفق**
  (خواندن/نوشتنِ بین‌اجاره‌ای آزاد، نمای بدونِ مرز، نبودِ پوششِ کاتالوگ).
- **پس از رفع:** همان مجموعه ⇒ **۶۴/۶۴ موفق**.
- همهٔ سناریوها زیرِ نقشِ `dms_app` (غیرابرکاربر، بدونِ BYPASSRLS، بدونِ مالکیتِ جدول)
  و مکانیزمِ GUC برنامه (`set_config('app.company_id'/'app.user_id', ..., false)` روی
  اتصالِ اختصاصی) اجرا شده‌اند — نه superuser و نه متنِ مهاجرت.

## ۴) شواهد (مسیرها در `qa/task22r/` خارج از مخزن)

| سند | محتوا |
|---|---|
| `before-fix-product-master-rls.log` | ۵۸ شکست روی وضعیتِ آسیب‌پذیر |
| `after-fix-product-master-rls.log` | ۶۴/۶۴ پس از 0047 |
| `catalog-evidence.txt` | وضعیتِ کاتالوگ: ۱۷ جدول t/t/1، عبارتِ سیاست‌ها، `security_invoker=true`، grantهای dms_app، صفر شکافِ مستندنشده |
| `test-migrations-cycle.log` | up→down→up کامل؛ ۱۷۱۸ شیء یکسان؛ اسکیما پس از down خالی |
| `upgrade-chain-evidence.log` | 0001–0045 → 0046 (۱۰ جدول بدون RLS) → 0047 (۱۰/۱۰) → down (سیاست‌های اصلی بازسازی‌شده) → 0046.down بدونِ تعارضِ وابستگی → up مجدد ۱۰/۱۰ |
| `regression-product-master.log` | ۱۳۲/۱۳۲ (۶۸ قبلی + ۶۴ جدید) |
| `regression-api-full.log` | کلِ suite: **۱۰۱۲/۱۰۱۴** — ۲ شکست فقط round-tripِ ضمیمه (MinIO واقعی لازم دارد؛ بدونِ 0047 هم بازتولید شد) |
| `regression-web.log` | ۵۲/۵۲ |
| `typecheck.log` | سبز (همهٔ workspaces) |

## ۵) سازگاری با D1–D5 و معماریِ آینده

- D1–D5 دست‌نخورده: شمارندهٔ SKU، یکتاییِ gs1 جهانی (ADR-NEW-1)، دقتِ numeric(19,4)،
  confirm_sensitive (D4/ADR-NEW-3)، و ممنوعیتِ خطِ سند روی «بسته» (D5 — زیرِ dms_app
  هم با P0001 رد می‌شود) همگی در تست‌هایِ رگرسیون تأیید شدند.
- **بدونِ** جدولِ domain / سلسله‌مراتبِ domain / دسترسیِ بین‌دامنه‌ای؛ مالکیت همچنان company.
- **نکتهٔ معماری (بدونِ مانعِ جدید):** مرزبندیِ فعلی «company» است؛ برایِ آیندهٔ
  Central HQ + دامنه‌هایِ مستقل باید scope دامنه در سیاست‌ها بازتعریف شود (همان
  جهتِ ADR-NEW-3). سیاست‌هایِ 0047 از همان تابعِ واحدِ زمینه (`fn_current_company_id`)
  می‌خوانند ⇒ تغییرِ آینده فقط در یک نقطه (تابع/الگویِ سیاست) انجام می‌شود.

## ۶) یافته‌ها (خلاصه؛ طبقه‌بندی کامل در گزارشِ TASK-22R)

| شناسه | شدت | مسدودکنندهٔ PR #9؟ | شرح |
|---|---|---|---|
| R-01 | **HIGH** | **خیر** (پیش از TASK-22، بیرون از مرزِ Product Master) | `geofence` (0012_tracking) هیچ سیاستی ندارد؛ جدولِ مالکِ اجاره (branch_id). |
| R-02 | **HIGH** | **خیر** (همان وضعیت) | `device` (0012_tracking) بدونِ سیاست؛ دارای push_token. |
| R-03 | MEDIUM | خیر | وکتورهایِ اتصالِ بین‌اجاره‌ایِ «کلیدِ خارجیِ قدیمی» (product.brand_id/category_id/tax_code_id، line.product_id و…) مطابقِ قراردادِ 0041/0042 باقی ماندند — پیش از 0046؛ پیشنهادِ سخت‌سازیِ سراسریِ FK در تسکِ جدا. |
| R-04 | INFO | خیر | `p_invoice_scope` (0021) با `current_setting('app.user_id')` سخت‌گیرانه؛ در نبودِ GUC به‌جایِ صفر ردیف خطا می‌دهد (برنامه همیشه هر دو GUC را ست می‌کند). |
| R-05 | INFO | خیر | snapshot نشت نمی‌کند (اثباتِ پویا)؛ ارجاعِ بین‌اجاره‌ایِ line.product_id از قبل ممکن است (زیرمجموعهٔ R-03) اما snapshot fail-closed است. |

فهرستِ `KNOWN_GAPS = ['device','geofence']` در تستِ پوششِ پویایِ `db-privileges.api.test.ts`
ثبت شده است: هر شکافِ **جدید** RLS مجموعه را می‌شکند؛ این دو موردِ مستند تا رفعِ جداگانه
استثناء شده‌اند (پنهان‌کاری نیست — نام‌برده و طبقه‌بندی‌شده).

> **اصلاحیهٔ TASK-23 (رفعِ F-2 از TASK-22RQ):** گزارشِ TASK-22R ادعا کرده بود این شکاف‌ها
> (و شکافِ افشای نماها) با شناسه‌های «G-16/G-21» در `GAP_REGISTER` **ثبت شده‌اند**؛
> آن ادعا **نادرست** بود: ثبت تا G-19 بود، G-16 شکافِ دیگری است (تطبیقِ گزارش‌ها)،
> و G-21 اصلاً وجود نداشت. تنها «ثبتِ» واقعیِ آن زمان همین فهرستِ استثنایِ تست بود —
> نه ثبتِ رسمیِ شکاف. شکاف‌های واقعی اکنون در `GAP_REGISTER` با شناسه‌های واقعی ثبت
> شدند: **G-20** (افشای بین‌اجاره‌ایِ نماهای definer)، **G-21** (RLS دستگاه)،
> **G-22** (RLS حوزهٔ جغرافیایی). تفکیکِ وضعیتِ اسناد:
> - **TASK-22R-fixed:** RLS ده‌گانهٔ Product Master + `v_document_line_display` (0047).
> - **TASK-22RQ-verified:** یافته‌های F-1 (نماها)، F-2 (همین ادعای نادرست)، F-3 (GUC)، R-01/R-02.
> - **TASK-23-fixed:** F-1 و R-01/R-02 با مهاجرتِ `0048_cross_tenant_views_device_geofence` + تست‌های A–E.
> - **still-open:** F-3 (محدودیتِ ذاتیِ GUC = زمینهٔ ادعاشده)، R-03 (وکتورهای FK قدیمی)، G-01..G-19.

## ۷) معیارهای تکمیل

- ✅ هر ۱۰ جدولِ تأییدشده: جداسازیِ database-enforced (RLS+FORCE+سیاستِ درستِ داده‌ای).
- ✅ هیچ خواندن/نوشتنِ بین‌اجاره‌ایِ ممکن نیست (۶۴ سناریو، نقشِ برنامه).
- ✅ نبودِ زمینه و زمینهٔ نامعتبر ⇒ fail-closed؛ جابه‌جاییِ زمینه در نشست نشت نمی‌دهد.
- ✅ روابطِ والد-فرزند محافظت‌شده (با `with check` روی همهٔ والدهایِ 0046).
- ✅ تست‌های پویا جایگزین/تقویتِ بررسی‌های ایستا شدند (L-01 رفع شد).
- ✅ مهاجرت‌ها و رگرسیون‌ها سبز (جز ۲ شکستِ محیطیِ اثبات‌شدهٔ ذخیره‌سازی).
- ✅ هیچ کارِ قبلی از دست نرفت؛ هیچ سرویس/پایگاهِ مشترکی تغییر نکرد.
