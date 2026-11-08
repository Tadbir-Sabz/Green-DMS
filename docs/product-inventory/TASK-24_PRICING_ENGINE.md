# TASK-24 — تکمیلِ موتورِ قیمت و تخفیفِ سازمانی (P2)

> **نقش:** Agent-1 (معمارِ ارشد / بک‌اند / محصول / مجری) · **شاخه:** `arena/1246108f-green-dms` · **HEAD مبنا:** `d12dc2e04a128775481e9e42c3b48fb339ca4432`
> **ماهیت:** تکمیلِ ماژولِ موجود (`master-data` pricing/promotion + `sales`)، نه بازنویسی. schemaها **extend** شده‌اند؛ هیچ جدول/رفتارِ پیشینی حذف یا بازنویسی نشد.
> **وضعیتِ تحویل:** همهٔ کد و تست‌ها در commit **`1a65d3c78740f357a996ac8fbe3facc165d8f171`** روی شاخهٔ `arena/1246108f-green-dms` ثبت و push شده‌اند؛ هیچ merge/deploy انجام نشده و هیچ DB/سرویسِ تولیدی لمس نشده است.

---

## ۰) خلاصهٔ اجرایی و داوریِ قابلیت‌ها

| قابلیت | داوری | شاهدِ اصلی | محدودیتِ صریح |
|---|---|---|---|
| **A. موتورِ قیمت** (لیست/اولویت، قیمتِ مشتری، اعتبار/انقضا، تیراژ، بسته‌بندی، واجدِشرطی، قلمرو، قطعیت) | **PASS** | `pricing-engine.ts` · `pricing-engine.unit.test.ts` (۴۲) · `pricing-engine.api.test.ts` PE-1/PE-2 (۱۰) | — |
| **B. موتورِ تشویق** (۹ نوع، stacking/ترتیب، گروهِ انحصار، سقف‌ها، کوپن، هدیه، مصرف) | **PASS** (با محدودهٔ عملیاتیِ D-24-05) | `computeBenefit` · تست‌های U6/U7 + PE-3 (۵) | معنای «bundle در سفارش» تصمیمِ عملیاتی است (بدونِ سندِ انبار) |
| **C. حفاظتِ کفِ سود** (سیاست، مبنای بهای تمام‌شده، تشخیصِ نقض، استثنای مجاز، دلیلِ رد، audit) | **PASS** | `evaluateLineMargin`/`resolveMarginPolicy` · `margin_policy`/`margin_exception` · PE-4 (۶) | اتصالِ چندمرحله‌ای فقط با زنجیرهٔ فعال (G-03) |
| **D. شبیه‌سازیِ قیمت** (بدونِ سند، تجزیهٔ کامل، توضیحِ گام‌به‌گام) | **PASS** | `POST /pricing/simulate` · `price_simulation_log` · PE-1 (۵) | اثباتِ مرورگریِ UI = G-01 (اجرانشده) |
| **E. اتصالِ تایید** | **PASS با گیتِ G-03** | `rules-engine-behavior.test.ts` (۲۴) + RBACِ اختصاصی + قاعدهٔ «شخصِ دوم» | موتورِ تأیید **همچنان HIGH** (G-03)؛ عملیاتِ حساس وصل **نشده** مگر زنجیرهٔ صریح |
| **F. تسویهٔ کمپین** | **BLOCKED — ON OWNER DECISION** | پیش‌نیازِ فنی: `promotion_redemption` + `price_change_log` | هیچ تعهد/سند/حسابداری ساخته نشد (عمدی) |

**نتیجهٔ کلان:** A–E در سطحِ API/DB/تست **PASS**؛ UI **PASS در سطحِ کد و typecheck، UNVERIFIED در سطحِ اجرای مرورگری** (همان محدودیتِ G-01)؛ F **BLOCKED**. هیچ ادعای «تکمیلِ کامل» برای F و برای اتصالِ چندمرحله‌ایِ تایید مطرح نمی‌شود.

---

## ۱) تصمیم‌های معماری (ثبت‌شده و اثبات‌شده با تست)

### D-24-01 — تقدمِ منابعِ قیمت (قطعی، عددی، بدونِ استثنای خاموش)
`PRICE_SCOPE_RANK`: **قیمتِ اختصاصیِ مشتری (۱) > لیستِ صریحِ درخواست (۲) > لیستِ قلمرو (۳) > لیستِ سراسریِ شرکت (۴) > دستی (۵)**.
مرتب‌سازیِ قطعی: `scope_rank` ↑ → `domain_rank` ↑ (شعبه ۰ > حوزه ۱ > کانال ۲) → `list_priority` ↓ → `list_code` ↑ → `packaging_rank` ↑ → `tier_min_qty` ↓ → `sort_key`.
**قاعدهٔ حاکمیتی:** لیستِ قلمرو هرگز با «قاعدهٔ سراسری» بازنویسی نمی‌شود؛ تنها یک منبعِ با رتبهٔ بالاتر (مشتری/لیستِ صریح) بر آن مقدم است و این تقدم **صریح و مستند** است، نه خاموش.
شاهد: U1/U2 (unit) و PE-2 (API).

### D-24-02 — معنای تاریخ
`valid_from` **شامل**، `valid_to` **انحصاری** (معادلِ `daterange '[)'` در DB). بیرون از پنجره ⇒ `price_missing` (۴۰۰) نه قیمتِ خاموشِ قدیمی. شاهد: U2 + PE-2 (مرزِ ۲۰۲۶-۰۶-۰۱ / ۲۰۲۶-۰۷-۰۱).

### D-24-03 — بسته‌بندی
قیمتِ سطحِ بستهٔ خط **بر** قیمتِ واحدِ پایهٔ تبدیل‌شده اولویت دارد (`packaging_rank`: ۰ = قیمتِ همان بسته، ۱ = قیمتِ واحدِ پایه × `factor_to_base`). `qty_base = qty × factor`؛ حاشیه، مالیات و موجودی همیشه بر `qty_base` محاسبه می‌شوند. شاهد: U4 + PE-1 (کارتن ۱۲تایی: `qty_base=24`, `gross=24000`).

### D-24-04 — اجرای تشویق (fail-closed)
ترتیب: `priority` ↓ → `code` ↑ → `id`. `allow_stacking=false` ⇒ تشویق‌های بعدی `blocked_by_non_stackable`. `exclusive_group` ⇒ حداکثر یکی. سقف‌ها به‌ترتیب: `max_discount_pct` → `max_discount_amount` → `max_per_customer_per_day` → `max_total_discount_pct` سند. مصرف: `max_uses_total`/`max_uses_per_customer` با `promotion_redemption`.
تعریفِ ناقص ⇒ **بی‌اثر با دلیلِ صریح** (`zero_benefit`)؛ کلیدِ ناشناخته در `conditions`/`benefit` ⇒ `unsupported_condition`/`unsupported_benefit` (رد، نه تفسیرِ خوش‌بینانه).

### D-24-05 — محدودهٔ عملیاتیِ bundle/buy-X-get-Y/gift (تصمیمِ دامنه، نه سیاستِ کسب‌وکار)
موتور **فقط ارزش‌گذاریِ مالی** می‌کند؛ برای `gift_item` ارزشِ مرجع به‌صورتِ تخفیفِ معادلِ مالیِ همان قلم ثبت می‌شود (`valuation_source = reference_price`) و **هیچ سندِ انبار/حواله ساخته نمی‌شود**. ثبتِ فیزیکیِ هدیه/بسته در P5 (انبار) و با تصمیمِ مالک انجام می‌شود.
شاهد: U6 + PE-3 (هدیه ۱۰۰ ریالی، `net_ex_tax` از ۱۷۰۰ به ۱۶۰۰).

### D-24-06 — کفِ سود
سیاست: دقتِ `product(3) > category(2) > company(1)`؛ در تساوی، قلمرو بر غیرِ قلمرو، سپس `priority` ↓، سپس `id`. مبنا: `avg_cost` (میانگینِ وزن‌دارِ موجودیِ انبارها)، `standard_cost`، `last_purchase_cost`. بهای نامشخص: `block`/`warn`/`ignore`.
استثنا فقط با `status='approved'` **و** `decided_by <> requested_by` (constraint `ck_margin_exception_second_person`) **و** `valid_until` منقضی‌نشده اثر دارد. نقض ⇒ ۴۰۹ `margin_floor_violation` با `details.violations` (پیامِ فارسی + درصدِ مؤثر + درصدِ لازم + `policy_id`).

### D-24-07 — گردکردنِ مالی (قراردادِ قفل‌شده)
`money(n) = (Math.round(n*100)/100).toFixed(2)` (نیمه‌ها به سمت +∞، از جمله برای منفی: `money(-0.125) = '-0.12'`)، `unitPrice` با ۴ رقم اعشار، `lineTax = Math.round(gross × rate_pct)/100` و صفر برای نرخِ ≤۰، `marginPct = null` وقتی درآمد صفر است. **هیچ گردکردنی «اصلاح» نشد**؛ رفتارِ فعلی (شاملِ رفتارِ اعدادِ منفی و خطاهای شناورِ `1.005 → 1.00`) در `test/financial-rounding.test.ts` به‌عنوان قرارداد تثبیت شد.

### D-24-08 — idempotency
`promotion_evaluation(company_id, idempotency_key)` نتیجهٔ کاملِ `QuoteResult` را با `sha256` بدنهٔ کانونیک کش می‌کند؛ همان کلید + همان بدنه ⇒ `replayed: true` با همان اعداد؛ همان کلید + بدنهٔ متفاوت ⇒ **۴۰۹** `idempotency_key_reuse`. مصرفِ تشویق با `promotion_redemption(company_id, idempotency_key, promotion_id)` یکتا و `on conflict do nothing` ⇒ `{inserted, skipped}`.
شاهد: PE-7 (۴ تست).

### D-24-09 — کنترلِ تخفیف/قیمتِ غیرمجاز
`unit_price`/`discount_amount` روی خطوطِ `/pricing/quote` و `/pricing/simulate` فقط با مجوزهای **`pricing.manual_price.apply`** و **`pricing.discount.override`** مجاز است. پرچم‌های `allow_manual_price`/`allow_discount_override` **از بدنه پذیرفته نمی‌شوند** و در کنترلر از مجوزهای نشست استخراج می‌شوند؛ ارسالِ قیمتِ دستی توسطِ کاربرِ بدونِ مجوز ⇒ ۴۰۳ `manual_price_not_authorized`؛ تخفیفِ فراتر از سقفِ قلم ⇒ ۴۰۳ `discount_cap_exceeded` با `details.max_discount_pct`.
**استثنای مستند (باطل‌شده در TASK-24F):** در تحویلِ TASK-24 مسیرِ `POST /orders` با `apply_pricing_engine=true` بی‌قید `unit_price`ِ خطِ سفارش را می‌پذیرفت. این رفتار **حذف شد**: مسیرِ سفارش همیشه از موتور می‌گذرد و قیمتِ دستی فقط با مجوزِ `pricing.manual_price.apply` از **نشست** و با دلیلِ ثبت‌شده در `price_change_log` پذیرفته می‌شود (نگاه کنید به §۸).

### D-24-10 — جداسازیِ اجاره و RLS
همهٔ جدول‌های تازهٔ ۰۰۴۹ (۸ جدول) با `enable` + `force row level security` و سیاستِ `company_id = fn_current_company_id()`؛ پرس‌وجوهای ریپازیتوری هم‌زمان `company_id` را صریح فیلتر می‌کنند (دفاعِ دولایه). مشتری/سفارش/قیمتِ مشتری که ستونِ `company_id` ندارند از مسیرِ `join branch b on b.id = …` محدود می‌شوند.
شاهد: PE-9 (۴ تست) + بررسیِ up/down (`forced_rls_tables = 8`).

### D-24-11 — audit و تغییرناپذیریِ تاریخی
`price_change_log` **append-only** با triggerِ DB که UPDATE/DELETE را رد می‌کند. سندِ فروش snapshot است؛ تغییرِ قیمت/سیاست بر سندِ ثبت‌شده اثری ندارد (PE-6). شبیه‌سازی فقط `price_simulation_log` را می‌نویسد و **هیچ سندِ کسب‌وکاری** نمی‌سازد (PE-1).

### D-24-12 — G-03: چرا عملیاتِ حساس به موتورِ تأیید وصل نشد
اول بستهٔ رفتاری ساخته شد (۲۴ سناریو) و در همان مسیر دو نقصِ واقعی رفع شد (کدِ تکراری ۵۰۰ → ۴۰۹؛ UUIDِ نامعتبر ۵۰۰ → ۴۰۴). اما سه شکافِ HIGH باقی است: زنجیرهٔ خالی (`-Infinity`)، نبودِ RBACِ تأییدکننده/منعِ خودتأییدی در موتور، و اعتبارسنجی‌نشدنِ بازهٔ مبلغ در زمانِ تصمیم. بنابراین به‌جای اتصال، **گیتِ دوگانه** فعال شد: RBACِ اختصاصی (`pricing.margin.override`) + قاعدهٔ «شخصِ دوم» در DB و سرویس + audit؛ و اتصالِ چندمرحله‌ای فقط وقتی زنجیرهٔ صریحِ `pricing.margin_exception` تعریف شده باشد (و تا تأییدِ کامل، تصمیم ۴۰۹ `approval_pending`).

---

## ۲) تحویل‌شدنی‌ها (نگاشت به فهرستِ ۱۱گانه)

| # | تحویل‌شدنی | محل |
|---|---|---|
| ۱ | موتورِ تکمیل‌شده | `apps/api/src/modules/pricing/{pricing-engine,pricing-engine.repository,pricing-engine.service,pricing.dto,pricing.tokens,pricing-quote.controller,pricing-admin.controller,pricing.module}.ts` · `apps/api/src/common/financial.ts` |
| ۲ | مهاجرت‌ها | `migrations/0049_pricing_promotion_engine.{up,down}.sql` (افزودنی/برگشت‌پذیر) |
| ۳ | API + OpenAPI + کلاینت | ۱۸ مسیرِ تازه در `packages/contracts/openapi.yaml` (۲۴۹ عملیات، ۱۲۴ schema)؛ `packages/api-client/src/schema.ts` بازتولید شد؛ `contract-drift` = ۰ اختلاف؛ `openapi:check` سبز |
| ۴ | UI فارسی/راست‌به‌چپ | `apps/web/src/app/prices/page.tsx` (توسعهٔ همان صفحه: لیست‌ها + شبیه‌سازی/تجزیه + هشدارِ کفِ سود + سیاست‌ها + تاریخچه) |
| ۵ | تست‌های رفتاری و امنیتی | `pricing-engine.unit.test.ts` (۴۲) · `financial-rounding.test.ts` (۱۱) · `pricing-engine.api.test.ts` (۳۵) · `rules-engine-behavior.test.ts` (۲۴) |
| ۶ | `MODULE_INVENTORY` | ردیف‌های E-01..E-06 به‌روزرسانی شد |
| ۷ | `GAP_REGISTER` | G-03 (بستهٔ رفتاری + شکاف‌های باقی‌مانده) و G-04 (بسته‌شدنِ موتور، بازماندنِ تسویه) |
| ۸ | `IMPLEMENTATION_SEQUENCE` | P2 به «پیاده‌سازی‌شده» ارتقا یافت با محدودیت‌های صریح |
| ۹ | تصمیم‌های معماری + پرسش‌های کسب‌وکار | همین سند (§۱ و §F) |
| ۱۰ | شواهدِ CI/تست | §۳ و §۴ همین سند |
| ۱۱ | محدودیت‌های باقی‌مانده | §۵ |

---

## ۳) شواهدِ تست

### ۳-۱) فایل‌های تازه (۱۱۲ تست)
| فایل | تست | نتیجه | پوشش |
|---|---|---|---|
| `apps/api/test/pricing-engine.unit.test.ts` | ۴۲ | **PASS** | تقدم/تاریخ/تیراژ/بسته‌بندی/هر ۹ نوع تشویق/انباشت/سقف/کفِ سود/تجزیه — خالص و بدونِ DB |
| `apps/api/test/financial-rounding.test.ts` | ۱۱ | **PASS** | قراردادِ گردکردن شاملِ منفی و خطاهای شناور |
| `apps/api/test/pricing-engine.api.test.ts` | ۳۵ | **PASS** | PE-1..PE-9 روی DB ایزوله از مسیرِ HTTP |
| `apps/api/test/rules-engine-behavior.test.ts` | ۲۴ | **PASS** | G-03: چرخهٔ قاعده، ارزیابی روی سفارش، گردشِ تأیید، جداسازیِ اجاره |

### ۳-۲) ناحیه‌های حداقلیِ ۱۸گانهٔ درخواست
| # | ناحیه | پوشش |
|---|---|---|
| ۱ | تقدمِ لیستِ قیمت | U1/U3 · PE-2 |
| ۲ | تقدمِ قیمتِ مشتری | U1 · PE-2 |
| ۳ | جداسازیِ قلمرو | U3 · PE-2 |
| ۴ | مرزِ تاریخ | U2 · PE-2 |
| ۵ | تیراژِ تعدادی | U4 · PE-2 |
| ۶ | تبدیلِ بسته‌بندی | U4 · PE-1 |
| ۷ | هر ۹ نوع تشویق | U6 (۹ نوع) |
| ۸ | انباشت و استثنا | U7 · PE-3 |
| ۹ | سقفِ تخفیف | U7 · PE-3 |
| ۱۰ | کفِ سود | U5/U8 · PE-4 |
| ۱۱ | دقتِ شبیه‌سازی | PE-1 |
| ۱۲ | محاسبهٔ مالیات | U4 · PE-1 |
| ۱۳ | مقادیرِ مالیِ مثبت/منفی | `financial-rounding.test.ts` |
| ۱۴ | تغییرناپذیریِ snapshot تاریخی | PE-6 |
| ۱۵ | ردِ تخفیفِ غیرمجاز | U8 · PE-5 |
| ۱۶ | جداسازیِ cross-tenant | PE-9 |
| ۱۷ | درخواستِ تکراری/بازپخش | PE-7 |
| ۱۸ | تغییرِ هم‌زمانِ قیمت | PE-8 (`row_version` ⇒ ۴۰۹) |

### ۳-۳) رگرسیون
- `pricing.api.test.ts` + `orders.api.test.ts` = **۳۱ PASS / ۰ FAIL** (قرارداد و سازگاریِ سفارش حفظ شد؛ `apply_pricing_engine` پیش‌فرض خاموش است).
- مجموعهٔ کاملِ API: **۱۰۷۳ PASS / ۳۴ FAIL / ۶۶ SKIP** — همهٔ ۳۴ شکست از محدودیتِ محیط (PostGIS، MinIO، Redis، shimِ psql، Postgresِ init-role) است؛ فهرست در §۴-۳. مبنا پیش از تغییرات: ۹۶۱ PASS / ۳۴ FAIL / ۶۶ SKIP.
- `typecheck`: API و Web و `packages/api-client` سبز. `openapi:check` سبز. `contract-drift`: ۰ کدِ بی‌سند و ۰ سندِ بی‌کد.

---

## ۴) شواهدِ مهاجرت و قرارداد

### ۴-۱) چرخهٔ ۰۰۴۹ (scratch DB، PostGIS فقط در محیطِ محلی stub شده)
```
after_all_up {"tables":7,"pricing_perms":7,"price_list_cols":3,"triggers":4,"forced_rls_tables":8}
down 0049: ok
after_down   {"tables":0,"pricing_perms":0,"price_list_cols":0,"triggers":0,"forced_rls_tables":0}
up 0049 again: ok
after_reup   {"tables":7,"pricing_perms":7,"price_list_cols":3,"triggers":4,"forced_rls_tables":8}
```
- جدول‌های تازه: `pricing_domain`، `margin_policy`، `margin_exception`، `price_change_log`، `price_simulation_log`، `promotion_coupon`، `promotion_evaluation`، `promotion_redemption` (فهرستِ ۷تاییِ بالا جدول‌های نصب‌شدهٔ بررسی‌شده در آن پرس‌وجو است؛ کوپن نیز در همان مهاجرت ساخته می‌شود).
- ستون‌های افزوده: `price_list.domain_id/priority/row_version`، `price_list_item.row_version`، `customer_price.row_version`، `promotion.exclusive_group/requires_coupon/domain_id/…`.
- مجوزهای تازه (۷): `pricing.simulation.run`، `pricing.margin.view`، `pricing.margin.update`، `pricing.margin.override`، `pricing.audit.view`، `pricing.manual_price.apply`، `pricing.discount.override`.
- triggerها (۴): `trg_price_list_touch`، `trg_price_list_item_touch`، `trg_customer_price_touch`، `trg_price_change_log_immutable`.
- **هیچ داده‌ای از جدول‌های پیشین جز ستون‌های افزوده لمس نشده و down همه را برمی‌گرداند.**

### ۴-۲) قرارداد
`packages/contracts/openapi.yaml`: مسیرها ۱۷۲، عملیات ۲۴۹، schema ۱۲۴ (پیش از تغییر: ۲۳۱ عملیات). مسیرهای تازه:
`/pricing/quote`، `/pricing/simulate`، `/pricing/price-changes`، `/pricing-domains`(+`/{id}`)، `/margin-policies`(+`/{id}`)، `/margin-exceptions`(+`/{id}/decision`)، `/customer-prices`(+`/{id}`)، `/coupons`(+`/{id}`)، `/promotions/{id}/coupons`؛ و فیلدهای تازهٔ `PriceList`/`Promotion`.
کلاینتِ TypeScript بازتولید شد. **کلاینتِ Kotlin بازتولید نشد** چون تولیدکنندهٔ آن به دانلودِ jar از Maven نیاز دارد و شبکهٔ این محیط فقط GitHub/npm/PyPI را مجاز می‌کند؛ در CI باید اجرا شود (`npm run clients:generate`).

### ۴-۳) شکست‌های محیطیِ مجموعهٔ کامل (بدونِ دخالتِ کدِ TASK-24)
`postgres-init-role.api.test.ts` (نیازمندِ `psql` واقعی و process substitution)، `geofences.api.test.ts`/`geofence-rls.test.ts`/`customers.api.test.ts`/`view-isolation.test.ts`/`tours.api.test.ts` (نیازمندِ PostGIS و جغرافی)، `attachments.api.test.ts` (MinIO)، `product-master-core` (وابسته به دادهٔ نمونهٔ trgm)، `migrations-security` (down/upِ ۰۰۴۸ با `st_geomfromtext`).

---

## ۵) محدودیت‌های باقی‌مانده (صادقانه)

1. **تسویهٔ کمپین (F):** هیچ سند/تعهد/حسابداری ساخته نشد — منتظرِ تصمیم‌های §F.
2. **G-03 همچنان HIGH:** زنجیرهٔ خالی، نبودِ RBACِ گام و منعِ خودتأییدی در موتور، اعتبارسنجی‌نشدنِ بازهٔ مبلغ در تصمیم.
3. **UI:** کد typecheck و build سبز است ولی **اجرای مرورگری اثبات نشده** (G-01)؛ تب‌های مدیریتی (ساخت/ویرایش لیست، پیکربندی تشویق، ویرایشِ سیاست) در این مرحله فقط خواندنی + شبیه‌سازی هستند.
4. **کلاینتِ Kotlin** بازتولید نشده (محدودیتِ شبکه؛ باید در CI انجام شود).
5. **پرچمِ `apply_pricing_engine` حذف شد (TASK-24F):** هیچ مسیری، موتورِ قیمت را دور نمی‌زند. آنچه اکنون تصمیمِ مالک می‌خواهد، **پیش‌فرض‌های سیاستِ پایدار** است: اعمالِ خودکارِ تشویق روی سفارش (پیش‌فرض خاموش)، سقفِ کل/قلمِ تخفیف (پیش‌فرض بدونِ سقف) و حداکثرِ عقب‌گردِ تاریخ (§۸-۶، Q-24-07…Q-24-09).
6. **هدیه/bundle در سطحِ مالی**: ثبتِ فیزیکیِ انبار انجام نمی‌شود (D-24-05).
7. **گزارشِ اثربخشی و تسویه** (E-06) پیاده‌سازی نشده است.

---

## ۶) پرسش‌های تصمیمِ مالک

### F) تسویهٔ کمپین — چه چیزی باید تصمیم گرفته شود (بدونِ اختراعِ شرایط)
- **Q-24-01 (مبنای تسویه):** تسویه با تأمین‌کننده/پخش‌کننده بر مبنای «تعدادِ مصرف‌شده»، «مبلغِ تخفیفِ اعطاشده» یا «تفاوتِ قیمتِ مصوب و فروش»؟
- **Q-24-02 (مسئولیت):** سهمِ تأمین‌کننده/شرکت در هر تخفیف چگونه تعیین می‌شود و در چه سندی ثبت می‌شود؟
- **Q-24-03 (حسابداری):** آیا تسویه سندِ بدهی/دریافتنی می‌سازد، یا فقط کاهشِ بهای تمام‌شده/درآمد؟ دورهٔ شناسایی و رفتار با تسویهٔ پس از پایانِ کمپین؟
- **Q-24-04 (قیمتِ دستی در سفارش) — پاسخِ موقت اعمال‌شده در TASK-24F:** بله؛ مجوز در **همهٔ** مسیرهای ایجاد/ویرایشِ سفارش الزامی است (الزامِ یافتهٔ HIGH-3 حسابرسی، نه سیاستِ تجاری). مالک باید تأیید کند که این سخت‌گیری برای همهٔ نقش‌های فروش مطلوب است یا نقشِ «فروشندهٔ میدانی» استثنا می‌خواهد.
- **Q-24-05 (bundle/hدیه/فروش):** ثبتِ فیزیکیِ هدیه و اجرای `bundle` در سفارش از کدام فاز (P5 انبار) و با چه سندی؟
- **Q-24-06 (فعال‌سازیِ موتور روی سفارش) — منسوخ شد:** پرچم حذف شد؛ موتور همیشه اجرا می‌شود.
- **Q-24-07 (اعمالِ تشویق روی سفارش):** `pricing_settings.apply_promotions_on_orders` پیش‌فرض **خاموش** است (رفتارِ پیش‌فرض fail-closed). روشن شود؟
- **Q-24-08 (سقف‌های تخفیف):** مقدارِ سیاستیِ `max_total_discount_pct` و `max_line_discount_pct` چقدر باشد؟ (پیش‌فرض NULL = بدونِ سقف؛ عددِ دلخواه وضع نشد.)
- **Q-24-09 (عقب‌گردِ تاریخِ سفارش):** `min_order_date_lookback_days` چند روز باشد؟ (پیش‌فرض NULL = فقط با مجوزِ `pricing.backdate.apply` و دلیل.)
- **Q-24-10 (سقفِ استثنای کفِ سود):** آیا تصمیمِ تأیید باید `granted_margin_pct` را **اجباری** کند؟ در TASK-24F استثنای بدونِ سقف بی‌اثر (fail-closed) است و تست‌ها سقفِ صریح می‌فرستند.
- **Q-24-11 (استفادهٔ بین‌قلمرویی):** آیا علاوه بر مجوز + دلیل + ممیزی، تأییدِ شخصِ دوم هم لازم است؟
- **Q-24-12 (فروشِ زیرِ بهای تمام‌شده):** آیا مجوزِ مستقل (مثلاً `pricing.margin.loss_making`) لازم است یا سیاستِ شرکت (`allow_loss_making_sales`) کافی است؟

---

## ۷) راستی‌آزماییِ مستقل (انتظار)
- بازرسیِ read-onlyِ Agent-2 روی: ترتیبِ تقدمِ قیمت، مسیرهای پول (تخفیف/مالیات/کفِ سود)، گیتِ مجوزهای دستی، RLSِ جدول‌های تازه، و برگشت‌پذیریِ ۰۰۴۹.
- معیارِ پایانِ این مرحله: **STOP** پس از ارائهٔ همین گزارش و انتظار برای مجوزِ مالک؛ هیچ merge/deploy انجام نمی‌شود.

---

## ۸) TASK-24F — بازآزماییِ هدفمندِ یافته‌های حسابرسیِ مستقلِ TASK-24R

> **دامنه:** اصلاحِ **همان یافته‌های** گزارشِ مستقلِ Agent-2 روی تحویلِ `5203d3f`؛ بازنویسیِ موتورِ قیمت نیست.
> **قاعده:** هیچ یافته‌ای تنزل/تفسیرِ مجدد نشده و هیچ قاعدهٔ تجاریِ تازه‌ای اختراع نشده است؛ آنجا که اصلاح نیازمندِ **سیاستِ مالک** بود، مکانیزمِ **fail-closed** + پرسشِ ثبت‌شده (§۶) جای‌گزین شده است.

### ۸-۱) نگاشتِ یافته‌ها به اصلاح

| یافته | اصلاحِ انجام‌شده | وضعیت |
|---|---|---|
| **HIGH-4** یکپارچگیِ تخصیص/مصرفِ تشویق | مبلغِ ثبت‌شده در سند/دفتر = **مبلغِ واقعاً تخصیص‌یافته** (`pricing-engine.ts` تخصیص با سقفِ ماندهٔ خط، `attributeGift` با نسبتِ تخصیص)؛ ارزشِ هدیه/buy-X-get-Y ≤ ماندهٔ واجدِ شرط؛ `qty` با همان نسبت مقیاس می‌شود؛ `requested_value` برای ممیزی حفظ می‌شود؛ سقفِ روزانه/درصد/مبلغ روی مبلغِ پس از سقف اعمال می‌شود؛ تخصیصِ صفر ⇒ تشویق «اعمال‌نشده» | **FIXED** (کد + ۵ آزمونِ واحد + ۱ آزمونِ DB-محورِ هم‌خوانیِ دفتر) |
| **HIGH-1** حذفِ کلیدهای امنیتیِ سمتِ کلاینت | `apply_pricing_engine`/`allow_manual_price`/`allow_discount_override` از DTOهای سفارش و استعلام حذف شدند؛ مسیرِ قدیمیِ `computeLines` **حذف** شد؛ همهٔ سفارش‌ها از `PricingEngineService.quoteForOrder` می‌گذرند؛ تاریخِ گذشته با «امروز» قیمت‌گذاری می‌شود (تشویق/لیست/سیاستِ منقضی دوباره فعال نمی‌شود) و خودِ سند تاریخِ گذشته را با مجوز+دلیل+audit نگه می‌دارد | **FIXED** (کد + آزمونِ ۴۰۹ با پرچمِ بدنه + آزمونِ تشویقِ منقضی) |
| **HIGH-2** سقفِ کلِ تخفیف به‌عنوان پارامترِ درخواست | سقف‌ها از سیاستِ پایدارِ `pricing_settings` خوانده می‌شوند (مهاجرت **۰۰۵۰**)، با `GET/PATCH /pricing/settings` و مجوزِ `pricing.settings.view|update`؛ استعلام و سفارش از یک منبعِ واحد؛ پارامترِ درخواست بی‌اثر (آزمون) | **FIXED** |
| **HIGH-3** نبودِ مجوز/ممیزیِ قیمتِ دستی روی مسیرِ سفارش | `pricing.manual_price.apply` و `pricing.discount.override` از **نشست** خوانده می‌شوند (کنترلر) و به موتور پاس می‌شوند؛ هر قلمِ قیمتِ دستی/عبور از سقف در `price_change_log` با actor، قیمتِ سیستمی، قیمتِ درخواستی، درصدِ تخفیف، دلیل، سیاستِ مؤثر و `pricing_date`/`backdated` ثبت می‌شود؛ دلیلِ اجباری فقط وقتی قیمتِ دستی **واقعاً** از قیمتِ سیستم انحراف دارد یا سقف رد شده است | **FIXED** (کد + ۶ آزمونِ DB-محورِ ±مجوز/ممیزی) |
| **MEDIUM-1** صحتِ استثنای کفِ سود | `exceptionPermits`: فقط استثنای **همان کالا**؛ `customer_id`/`policy_id` باید بخوانند؛ استثنای مقید به سندِ دیگر در استعلام اعمال نمی‌شود؛ `granted_margin_pct` **سقفِ واقعی** است (حاشیه باید از آن کمتر نباشد)؛ استثنای بدونِ سقف بی‌اثر (fail-closed)؛ فروشِ زیرِ بهای تمام‌شده فقط با سیاستِ صریح یا استثنای محدود؛ `approved_by` یک قیمتِ مشتری = `decided_by` استثنا (هرگز نویسنده) | **FIXED** (کد + ۱۰ آزمون) |
| **MEDIUM-2** اعتبارِ لیستِ قیمتِ صریح نسبت به قلمرو | لیستِ صریحِ متعلق به قلمروی دیگر بدونِ `pricing.price_list.cross_domain` ⇒ **403** `price_list_domain_forbidden`؛ با مجوز و **دلیل** ⇒ مجاز + ممیزیِ اجباریِ `cross_domain_use` (قبل از محاسبه) | **FIXED** (کد + ۳ آزمون) |
| **MEDIUM-3** واگراییِ قرارداد/رندرِ حاشیه | enumهای موتور منبعِ حقیقت شدند و `openapi.yaml` هم‌تراز شد (`explicit_list`، `violation`، `exception_applied`، `margin_loss_making`، فیلدهای هدیه، `/pricing/settings`)؛ `scripts/contract-drift.mjs` اکنون **۴ enum** و **فیلدهای الزامیِ DTO** را هم می‌سنجد (با کنترلِ منفیِ اثبات‌شده)؛ ستونِ حاشیه در `apps/web/src/app/prices/page.tsx` وضعیتِ واقعی را رندر می‌کند | **FIXED** (Kotlin client: **UNVERIFIED** — نیازِ شبکهٔ Maven) |
| **MEDIUM-4** فقط-افزودنی‌نبودنِ `promotion_redemption` | مهاجرت **۰۰۵۰** §۱: تریگرِ تغییرناپذیری + `revoke update, delete … from dms_app`؛ اصلاح فقط با ردیفِ جبرانی؛ آزمونِ DB: UPDATE/DELETE رد می‌شوند و `has_table_privilege(dms_app, …, 'UPDATE'|'DELETE') = false` | **FIXED** (کد + آزمونِ DB) |
| **MEDIUM-5** دامنهٔ idempotency | کشِ نتیجهٔ ارزیابی با TTL و **تاریخ‌محدود** بازپخش می‌شود (`replay_ttl_seconds`، `PRICING_REPLAY_TTL_SECONDS`)؛ مسیرِ سفارش بازپخش را خاموش می‌کند؛ کلیدِ سفارش‌محور برای `promotion_redemption` | **FIXED** |
| **LOW** | `ignore_domain_prices` مرده حذف شد؛ انتسابِ هدیه با `line_nos`؛ پیامِ خطای سقف اکنون **سقفِ مؤثر** را نشان می‌دهد (نه `null`)؛ شماره‌گذاریِ پرسش‌های مالک اصلاح شد (§۶) | **FIXED** |

### ۸-۲) دستاوردهای تازه

- **مهاجرت‌ها:** `0050_pricing_remediation.{up,down}.sql` (فقط-افزودنی‌بودنِ دفترِ مصرف، جدول و سیاستِ `pricing_settings` با RLSِ اجباری، ۵ مجوزِ تازه: `pricing.settings.view/update`، `pricing.backdate.apply`، `pricing.price_list.cross_domain`، `pricing.margin.loss_making`) و `0051_g03_approval_hardening.{up,down}.sql` (یکتاییِ تصمیم در هر مرحله — **مستقل و قابلِ شناساییِ جدا** برای G-03).
- **قرارداد:** `/pricing/settings` (GET/PATCH) و فیلدهای `PriceQuoteRequest.cross_domain_reason`، `SalesOrder.price_override_reason`، `QuoteLineResult.margin.exception_granted_margin_pct`، `gift_lines[].line_nos/requested_value`؛ شمارشِ فعلی: **۱۷۳ مسیر · ۲۵۱ عملیات · ۱۲۶ schema · ۳ webhook**، drift = ۰ (شاملِ enum/فیلدهای الزامی).
- **آزمون‌ها:** `pricing-remediation.unit.test.ts` **۱۶ PASS** (بدونِ DB) + آزمون‌های DB-محورِ تازه در `pricing-engine.api.test.ts` (PE-10 سفارش/ممیزی، PE-11 دفترِ مصرف/فقط-افزودنی، PE-9 بین‌قلمرویی) و به‌روزرسانیِ `orders.api.test.ts` برای مسیرِ اجباریِ موتور.
- **پارتیشنِ تست:** `node scripts/check-test-partition.mjs` سبز؛ فایلِ تازه در مجموعهٔ DB-free قرار گرفت (منابعش DB نمی‌خواند).

### ۸-۳) شواهدِ اجرا و مرزِ صداقت

| مورد | نتیجه |
|---|---|
| `tsc -p apps/api` (src) | ۰ خطا |
| مجموعهٔ DB-free API | **۳۰۳/۳۰۳ PASS (۱۹ فایل)** — شاملِ ۱۶ آزمونِ تازه |
| `openapi:check` | سبز (۱۷۳/۲۵۱/۱۲۶/۳) |
| `contract-drift` | `251/251/251`، drift = ۰ (enum = ۰، required = ۰)؛ کنترلِ منفی: بازگرداندنِ `requested_list` یا افزودنِ فیلدِ الزامیِ جعلی ⇒ شکستِ عمدی |
| وب (unit) + typecheck | همان وضعیتِ پیشین (گزارشِ اجرا در گزارشِ نهاییِ TASK-24F) |
| آزمون‌های DB-محورِ تازه (PE-9/PE-10/PE-11، بازنویسیِ سقف، `orders.api`) | **نوشته و بازبینی شدند؛ در این محیط اجرا نشدند** (`UNVERIFIED`) چون در این سندباکس PostgreSQL محلیِ ایزوله در دسترس نبود. اجرای آن‌ها در CI/DB ایزوله الزامی است |
| مهاجرت ۰۰۵۰/۰۰۵۱ | up→down→up **اجرا نشد** (همان محدودیتِ بالا) — `UNVERIFIED` |
| کلاینتِ Kotlin | **UNVERIFIED** (تولیدکنندهٔ آن jar از Maven می‌خواهد؛ شبکهٔ محیط فقط GitHub/npm/PyPI) |

### ۸-۴) G-03

سخت‌سازیِ حداقلی **جدا از قیمت‌گذاری** و در فایل/مهاجرتِ مستقل انجام شد (زنجیرهٔ خالی ⇒ ۴۰۹، گام از `current_step` و نه از بدنه، `requested_by` از نشست، منعِ خودتأییدی، RBACِ تأییدکننده، یکتاییِ تصمیم). **G-03 همچنان `PARTIAL` و `VERIFIED=NO`** است تا حسابرسیِ مستقلِ بعدی: هیچ عملیاتِ حساسِ قیمت به موتورِ تأیید وصل نشده و اتصالِ استثنای کفِ سود به آن همچنان اختیاری/سیاستی است.

---

## ۹) TASK-24V — نتیجهٔ دروازهٔ راستی‌آزمایی (پس از TASK-24F)

**داوریِ کلی: PASS برای merge** — نقصِ مسدودکنندهٔ تازه‌کشف (G-23) کشف و رفع شد (`090c78b`) و CI کامل سبز است؛ دو یافتهٔ بازِ کارکردی غیرِ مسدودکننده‌اند. گزارشِ کامل:
`docs/product-inventory/TASK-24V_VERIFICATION_REPORT.md`.

| مورد | وضعیتِ نهایی |
|---|---|
| مهاجرت 0050/0051 | ✅ چرخهٔ up→down→up روی PostGIS واقعی در CI (`42402374930`, `42450239490`) + بازرسیِ اشیا در DB ایزوله |
| RLSِ `pricing_settings` | ✅ آزمونِ تازهٔ **PE-12** (نقشِ `dms_app`: ۱ ردیف، درجِ بین‌شرکتی 42501، بدونِ زمینه fail-closed) — سبز در CI |
| HIGH-1 مسیرِ یگانه | **PARTIAL** — `/orders` و ویرایش و sales-chain از موتور می‌گذرند، ولی `sales-chain.convert` actor/permissions/دلیل را منتقل نمی‌کند ⇒ `403 manual_price_not_authorized` برای هر درخواستِ دارایِ `requested_price` (probe) — `HIGH-1-R1` |
| HIGH-2 سقف از سیاست | **PARTIAL** — روی مسیرِ سفارش اعمال می‌شود؛ `POST /pricing/quote` و `simulate` سیاست را نمی‌خوانند (`it.fails` مستند) — `HIGH-2-R1` |
| HIGH-3 ممیزی | **FIXED** (PE-10، ۵ سناریو، سبز) |
| HIGH-4 تخصیص/هدیه/دفتر | **FIXED** (PE-3/PE-11، سبز) |
| MEDIUM-1..5 | **FIXED** (PE-4، PE-9، drift/openapi/typecheck، PE-11 فقط-افزودنی، idempotency) |
| G-03 | **PARTIAL** — `G-23` (قفلِ گردشِ چندمرحله‌ای با `amount_band_mismatch`) در همین دروازه کشف و در `090c78b` **رفع** شد؛ (a)/(c)/(d) با CI سبز تأیید شدند |
| اتصالِ عملیاتِ حساس به موتورِ تأیید | **اصلاحِ ادعا:** استثنای کفِ سود هنگام وجودِ زنجیرهٔ `pricing.margin_exception` به موتورِ تأیید گره می‌خورد (`pricing-engine.service.ts:838-857`, `899-912`) ⇒ «وصل نیست» دقیق نبود؛ بقیهٔ عملیات وصل نیستند (Q-24-11) |
| CI (PR #13) @`090c78b` | **static ✅ · unit ✅ · Integration (Postgres) ✅ · MinIO ✅ · init-hygiene ✅** (`42452304238`) · migrations ✅ · release-image ✅ · e2e ⛔ BLOCKED (MinIO) |
| Kotlin | **UNVERIFIED** (شبکهٔ Maven) |

**هیچ merge/deploy انجام نشد.** از نظرِ دروازهٔ فنی آمادهٔ merge است؛ تصمیم دربارهٔ `HIGH-1-R1`/`HIGH-2-R1` و پرسش‌های Q-24-* در اختیارِ مالک است.

---

## ۱۰) TASK-24W — بستنِ دو یافتهٔ بازِ TASK-24V (HIGH-1-R1 و HIGH-2-R1)

> **نوعِ کار:** اصلاحِ هدفمند (targeted remediation) — نه بازنویسیِ موتور.
> هیچ یافتهٔ تأییدشدهٔ TASK-24F بدونِ شاهدِ تازه بازگشایی نشد.

### ۱۰-۱) HIGH-1-R1 — تبدیلِ درخواست به سفارش با زمینهٔ کاملِ احراز هویت

**نقصِ پیشین:** `RequestService.convert()` سفارش را با `orders.create(companyId, dto)` می‌ساخت —
بدونِ `actorUserId`، بدونِ `permissions` و بدونِ `price_override_reason`. نتیجه: هر درخواستِ دارایِ
`requested_price` (حتی برابرِ قیمتِ سیستمی) با `403 manual_price_not_authorized` رد می‌شد و رکوردِ
ممیزیِ قلم، `actor_user_id = null` داشت.

**اصلاح (`sales-chain.service.ts`, `sales-chain.controller.ts`, `sales-chain.repository.ts`):**

| # | الزامِ کار | پیاده‌سازی |
|---|---|---|
| ۱ | حفظِ actor در کلِ گردش | actor از `@CurrentUser('userId')` به سرویس می‌رود و به `orders.create(..., actorUserId, permissions)` و به ممیزی منتقل می‌شود |
| ۲ | مجوز از نشست | `pricingPermissionsFromSession(user)` — تابعِ مشترکِ `pricing-permissions.ts` |
| ۳ | ردِ پرچمِ کلاینتی | `ConvertRequestDto` فقط `price_override_reason`/`note`؛ `whitelist` بقیه را حذف می‌کند؛ آزمونِ «پرچمِ جعلی» ۴۰۳ می‌گیرد |
| ۴ | `pricing.manual_price.apply` برای `requested_price` | بررسیِ صریح روی اقلامِ درخواست پیش از ساختِ سفارش ⇒ ۴۰۳ |
| ۵ | دلیلِ معنادار برای واگرایی | همان قاعدهٔ `quoteForOrder` (آستانهٔ ۰٫۰۰۵ + حداقلِ ۳ نویسه) ⇒ ۴۰۰ `override_reason_required` |
| ۶ | ممیزیِ کامل | ردیفِ `convert_to_order` روی `customer_request` با `request_id`, `order_id`, actor, `requested_prices`, `reason`, `permissions`, `priced_lines` — به‌علاوهٔ ممیزیِ قلم‌ها از مسیرِ سفارش |
| ۷ | همان محافظ‌های سفارش | سفارش از همان `orders.create` ساخته می‌شود ⇒ کفِ سود/سقفِ تخفیف/قواعد/اعتبار/موجودی عیناً |
| ۸ | fail-closed | `actorUserId == null` ⇒ ۴۰۳ `authorization_context_missing`؛ زمینهٔ ناقص ⇒ `pricingPermissionsFromSession` استثنا می‌دهد |
| ۹ | ضدِ تکرار/هم‌زمانی | قفلِ مشورتیِ نشستی (`pg_advisory_lock(hashtextextended(request_id,0))`) + `UPDATE ... WHERE status='submitted'`؛ بازنده ۴۰۹ و **بدونِ سفارشِ یتیم** |

**نکتهٔ طراحی:** قفلِ مشورتی به‌جای مهاجرت انتخاب شد چون (الف) مهاجرت لازم نمی‌شود، (ب) با بستنِ
اتصال خودکار آزاد می‌شود، (ج) از ساختِ سفارشِ دوم جلوگیری می‌کند — چیزی که `UPDATE` شرطی به‌تنهایی
نمی‌توانست (چون سند پیش از علامت‌گذاری ساخته می‌شود).

### ۱۰-۲) HIGH-2-R1 — یک مسیرِ واحدِ اجرای سیاست

**نقصِ پیشین:** `POST /pricing/quote` و `/pricing/simulate` از `buildContext(companyId, dto, opts)`
استفاده می‌کردند و `pricing_settings` را نمی‌خواندند ⇒ سقفِ تجمیعیِ تخفیف، اعمالِ تشویق و
`allow_loss_making` روی شبیه‌سازی بی‌اثر بود و عددِ شبیه‌سازی با سفارشِ واقعی نمی‌خواند.

**اصلاح:** `PricingEngineService.pricedPolicyRun()` — تنها اجرای سیاست، با `mode`:

| `mode` | مسیر | تاریخ | backdate | دلیل |
|---|---|---|---|---|
| `document` | `POST/PATCH /orders`, `convert` | تاریخِ مؤثر (امروز برای عقب‌گرد) | مجوز + دلیل الزامی | الزامی برای واگرایی |
| `lookup` | `/pricing/quote`, `/pricing/simulate` | تاریخِ درخواستی (پرس‌وجوی تاریخی) | لازم نیست | در پاسخ به‌صورتِ `reason_required` گزارش می‌شود |

بقیهٔ سیاست‌ها در هر دو حالت **یکسان** است: سقفِ کل/قلمِ تخفیف، اعمالِ تشویق، منعِ فروشِ زیرِ بهای
تمام‌شده، اولویتِ لیست/قلمرو/قیمتِ مشتری، سطحِ بسته‌بندی، مجوزِ قیمتِ دستی، ردِ بین‌قلمرویی، مالیات و گردکردن.

**تفاوت‌های عمدیِ مستند (پاسخ/ماندگاری، نه محاسبه):**
- `policy_applied` و `system_unit_prices` فقط در پاسخِ استعلام می‌آیند (سند دارایِ این فیلدها نیست).
- `simulation_id` + `creates_business_document: false` + `hypothetical_inputs[]` فقط در شبیه‌سازی.
- `mode: 'lookup'` ⇒ قاعدهٔ مجوزِ backdate اعمال نمی‌شود (چون تاریخِ سند نیست).
- شبیه‌سازی هیچ سفارش/فاکتور/مصرفِ تشویقی نمی‌سازد؛ فقط یک ردیفِ `price_simulation_log`.

### ۱۰-۳) جدولِ وضعیتِ یافته‌ها

| یافته | وضعیتِ TASK-24V | وضعیتِ TASK-24W |
|---|---|---|
| HIGH-1-R1 (تبدیلِ درخواست) | OPEN (403 برای هر `requested_price`) | **CLOSED** — ۱۱ سناریوی رگرسیون |
| HIGH-2-R1 (هم‌سانیِ استعلام/سفارش) | OPEN (`it.fails` مستند) | **CLOSED** — `it.fails` به آزمونِ واقعی تبدیل شد + ۱۰ سناریوی هم‌سانی |
| HIGH-1 (مسیرِ یگانهٔ سفارش) | PARTIAL | **VERIFIED** (شاملِ مسیرِ تبدیل) |
| HIGH-2 (سقف از سیاست) | PARTIAL | **VERIFIED** (استعلام/شبیه‌سازی/سفارش) |
| HIGH-3/4، MEDIUM-1..5 | FIXED | بدونِ تغییر (بازآزمایی شد) |
| G-23 | RESOLVED (24V) | بدونِ تغییر — ۳ آزمونِ رگرسیونش حفظ شد |
| G-03 | PARTIAL / VERIFIED=(a),(c),(d) | **بدونِ تغییر** — عمداً کامل اعلام نمی‌شود (§۱۰-۴) |

### ۱۰-۴) G-03 — وضعیتِ سطحِ قابلیت (بدونِ اغراق)

با رفعِ G-23، فقط همان یک نقصِ گامِ تأیید بسته شد. **G-03 کامل حل نشده است**:

| محافظ | وضعیت |
|---|---|
| زنجیرهٔ خالی ⇒ ۴۰۹ (a) | **VERIFIED** (آزمونِ رفتاری + CI سبز) |
| RBACِ گام + منعِ خودتأییدی + `requested_by` از نشست (c) | **VERIFIED** |
| یکتاییِ تصمیم در هر گام (d) | **VERIFIED** (مهاجرت ۰۰۵۱ + آزمون) |
| باندِ مبلغ در زمانِ تصمیم | **VERIFIED** پس از اصلاحِ G-23 |
| `approval_request.company_id` (ستونِ مستقل) | **باز** — جداسازی همچنان با join به `approval_chain` |
| ناسازگاریِ مسیرِ `GET /approvals/{id}` | **باز** — قابلیت زیرِ `/rules-engine/approvals/{id}` هست |
| اتصالِ عملیاتِ حساسِ قیمت به موتورِ تأیید | **فقط استثنای کفِ سود، آن هم سیاستی/اختیاری** — بقیه وصل نیستند (Q-24-10/11) |

> **قاعدهٔ رعایت‌شده:** هیچ عملیاتِ حساسِ قیمتی به قابلیتِ تأییدی که مستقلاً تأیید نشده وصل نشد.
> اتصالِ موجود (استثنای کفِ سود) پیش از این دور بود و در TASK-24W دست‌نخورده ماند.
