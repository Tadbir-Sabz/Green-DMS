# TASK-24W — درخواستِ حسابرسیِ مستقلِ Agent-2 (read-only)

> این سند **درخواستِ حسابرسی** است، نه گزارشِ حسابرسی. تا زمانی که Agent-2 مستقلاً آن را پر نکند،
> وضعیتِ هر دو یافته در این جدول `AWAITING INDEPENDENT AUDIT` است.
> **Agent-1 (نویسندهٔ اصلاح) مجاز به تأییدِ کارِ خودش نیست.**

## ۱) دامنه و مرزِ صداقت

| مورد | مقدار |
|---|---|
| مخزن/شاخه | `Tadbir-Sabz/Green-DMS` · `arena/1246108f-green-dms` |
| مبنای پیش از اصلاح | `1c849bc23309cc8716269aca6bfc2d24523d4dbf` |
| commitِ اصلاح | `f5c89b61c5595261f7754f18e02728b60c5f8e0b` (TASK-24W — کد/آزمون/قرارداد) |
| گزارشِ کامل | `docs/product-inventory/TASK-24W_REPORT.md` |
| PR | #13 — **draft**، mergeable، بدونِ merge/deploy |
| CI @`f5c89b6` | `42458240290` ✅ هر ۵ job سبز · مهاجرت‌ها `42458240314` ✅ · release-image `42458240295` ✅ · e2e `42458240364` ⛔ BLOCKED (نبودِ ایمیجِ MinIO — پیش‌موجود روی `main`) |
| نوعِ حسابرسی | **read-only** — بدونِ تغییرِ کد/شاخه/قرارداد |

Agent-2 باید **کدِ واقعیِ همین commit** را بخواند و سناریوها را خودش بازتولید کند؛ پذیرشِ ادعاهای
Agent-1 یا گزارشِ CI به‌تنهایی کافی نیست.

## ۲) HIGH-1-R1 — چه چیزی باید مستقل بررسی شود

**ادعای Agent-1:** `POST /requests/{id}/convert` اکنون actor/مجوز/دلیل را از نشست می‌گیرد، ممیزیِ
منبع ثبت می‌کند، و ضدِ تکرار/هم‌زمانی است.

| # | سناریوی بازتولید | نتیجهٔ موردانتظار |
|---|---|---|
| 1.1 | کاربر با `sales.request.convert` ولی **بدونِ** `pricing.manual_price.apply`، درخواستِ دارایِ `requested_price` | `403 manual_price_not_authorized`، وضعیتِ درخواست `submitted`، صفر سفارش |
| 1.2 | همان کاربر، درخواستِ **بدونِ** `requested_price` | `201`، قیمت = قیمتِ سیستمی، درخواست `converted` با `sales_order_id` |
| 1.3 | کاربر با مجوز، قیمتِ دستیِ واگرا + دلیلِ معتبر | `201`، ممیزیِ `convert_to_order` با actor/`request_id`/`order_id`/`reason` |
| 1.4 | همان، بدونِ دلیل | `400 override_reason_required`، صفر سفارش |
| 1.5 | دلیلِ کوتاه (`'  آ  '`) | `400` |
| 1.6 | قیمتِ دستیِ **برابر** با قیمتِ سیستمی، بدونِ دلیل | `201` (بدونِ الزامِ دلیل) |
| 1.7 | بدنهٔ حاویِ `permissions`/`manual_price`/`is_admin`/`roles` برای کاربرِ بی‌مجوز | همچنان `403` (بدنه مجوز نیست) |
| 1.8 | کاربرِ بدونِ `sales.request.convert` | `403` |
| 1.9 | بدونِ توکن | `401` |
| 1.10 | دو درخواستِ هم‌زمانِ تبدیل | یک `201` و یک `409/400`؛ **یک** سفارش با آن `request_id`؛ **یک** ردیفِ ممیزی |
| 1.11 | تبدیلِ سوم پس از موفقیت | `409 already_converted` |
| 1.12 | قیمتِ زیرِ کفِ سود | `409 margin_floor_violation`، درخواست دست‌نخورده |

**نقاطِ بازرسیِ کد (برای Agent-2):**
- `apps/api/src/modules/sales/sales-chain.controller.ts` — `convert()`: `@CurrentUser()` و
  `pricingPermissionsFromSession`؛ `@Body() ConvertRequestDto`.
- `apps/api/src/modules/sales/sales-chain.service.ts` — `convert()` / `convertLocked()`: fail-closedِ
  actor، الزامِ مجوز برای `requested_price`، انتقالِ `permissions` به `orders.create`، ثبتِ ممیزی،
  ۴۰۹ در بازنده.
- `apps/api/src/modules/sales/sales-chain.repository.ts` — `withRequestConversionLock()` و
  `markRequestConverted()` (شرطِ `status='submitted'`).
- `apps/api/src/modules/pricing/pricing-permissions.ts` — تنها منبعِ ساختِ مجوزها؛ ورودی = `AuthContext`.

**سؤالِ کلیدیِ حسابرسی:** آیا مسیرِ دیگری وجود دارد که `sales_order` با `request_id` بسازد و این
کنترل‌ها را دور بزند؟ (پاسخِ Agent-1: `order.repository.insert` تنها درج‌کننده است و همهٔ مسیرها از
`orders.create` می‌گذرند — باید مستقل تأیید شود.)

## ۳) HIGH-2-R1 — چه چیزی باید مستقل بررسی شود

**ادعای Agent-1:** `quote`/`simulate`/`order` همه از `pricedPolicyRun()` می‌گذرند و سیاستِ پایدار
یکسان اعمال می‌شود؛ تفاوت‌ها فقط در تاریخ‌مبنا و ماندگاریِ پاسخ است.

| # | سناریوی بازتولید | نتیجهٔ موردانتظار |
|---|---|---|
| 2.1 | زمینهٔ یکسان در سه مسیر | `subtotal`/`discount_total`/`tax_total`/`grand_total` یکسان |
| 2.2 | تشویقِ ۴۰٪ + `pricing_settings.max_total_discount_pct = 5` | هر سه مسیر سقفِ ۵٪ را می‌بینند |
| 2.3 | `apply_promotions_on_orders = false` | هر سه مسیر تشویق را اعمال نمی‌کنند |
| 2.4 | قیمتِ زیرِ کفِ سود | استعلام `margin_violations` را برمی‌گرداند؛ سفارش `409` |
| 2.5 | قیمتِ دستی بدونِ مجوز | `403` در استعلام و سفارش |
| 2.6 | لیستِ قیمتِ بین‌قلمرویی بدونِ مجوز/دلیل | `403` / `400` در هر دو |
| 2.7 | مرزِ `valid_to` (انحصاری) | `price_missing` در استعلام و سفارش |
| 2.8 | qty اعشاری + قیمتِ اعشاری | گردکردن و مالیات یکسان تا ۲ رقم |
| 2.9 | شبیه‌سازی با ورودیِ فرضی | `creates_business_document=false`، `hypothetical_inputs`، صفر سفارش/فاکتور/مصرف، فقط ۱ ردیفِ `price_simulation_log` |
| 2.10 | `max_total_discount_pct`/`allow_manual_price`/`permissions` در بدنه | بی‌اثر |

**نقاطِ بازرسیِ کد:**
- `apps/api/src/modules/pricing/pricing-engine.service.ts` — `pricedPolicyRun()` (تنها اجرا)،
  `quoteForOrder()` (document)، `quoteWithPolicy()` (lookup)، `simulate()`.
- `apps/api/src/modules/pricing/pricing-quote.controller.ts` — بدونِ `QuoteRunOptions` از بدنه.
- `apps/api/src/modules/sales/order.service.ts` — `quoteViaEngine()` هنوز تنها مسیرِ سفارش است.

**سؤال‌های کلیدیِ حسابرسی:**
1. آیا `mode: 'lookup'` می‌تواند برای دور زدنِ کنترلِ backdate استفاده شود؟ (ادعا: نه، چون
   `mode` فقط در سرویس و برای مسیرهای استعلام ست می‌شود و از بدنه خوانده نمی‌شود — باید تأیید شود
   که هیچ کنترلری مقدارِ `mode` را از ورودیِ کاربر نمی‌گذارد.)
2. آیا `apply_promotions` از بدنه می‌تواند سیاست را **فراتر** از آنچه مجاز است گسترش دهد؟
   (ادعا: نه؛ فقط می‌تواند محدودتر کند: `settings.apply_promotions_on_orders && input.apply_promotions !== false`.)
3. آیا `pricedPolicyRun` با `customer_id = null` مسیرِ قیمتی ناامن باز می‌کند؟ (ادعا: رفتارِ قبلیِ
   `quote` حفظ شده؛ سفارش همیشه `customer_id` اجباری دارد.)

## ۴) G-03 — چه چیزی نباید «حل‌شده» تلقی شود

Agent-2 باید تأیید کند که:
- `G-23` (باندِ مبلغ در زمانِ تصمیم) رفع شده و ۳ آزمونِ رگرسیونش پابرجاست؛
- **G-03 هنوز `PARTIAL` است** (ستونِ `approval_request.company_id`، ناسازگاریِ مسیر، اتصالِ ناقصِ
  عملیاتِ حساس) و در اسناد به‌عنوان حل‌شده اعلام نشده؛
- هیچ عملیاتِ حساسِ قیمتی به قابلیتِ تأییدِ تأییدنشده **وصل نشده** است.

## ۵) قالبِ پاسخِ Agent-2

برای هر یافته:

```
HIGH-1-R1: VERIFIED | VERIFIED-WITH-NOTES | NOT VERIFIED
سناریوهای بازتولیدشده: <شماره‌ها> (روش: <HTTP/DB/کد>)
شواهد: <run/log/فایل:خط>
اختلاف با ادعای Agent-1: <هیچ | شرح>
HIGH-2-R1: (همان قالب)
G-03: PARTIAL تأیید شد؟ بله/خیر + توضیح
نتیجهٔ کلی: APPROVE MERGE | APPROVE WITH FOLLOW-UPS | BLOCK
```

## ۶) وضعیتِ فعلیِ این درخواست

| مورد | وضعیت |
|---|---|
| Agent-2 (حسابرسیِ مستقل) | **انجام نشده — AWAITING INDEPENDENT AUDIT** |
| ادعای Agent-1 | `HIGH-1-R1` و `HIGH-2-R1` بسته؛ G-03 همچنان `PARTIAL` |
| تصمیمِ merge | **در اختیارِ مالک** — این درخواست هیچ merge/deploy انجام نمی‌دهد |
