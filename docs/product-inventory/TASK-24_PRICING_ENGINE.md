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
**استثنای مستند:** مسیرِ `POST /orders` با `apply_pricing_engine=true` هم‌چنان `unit_price`ِ خطِ سفارش را می‌پذیرد (`allow_manual_price: true`) چون این **رفتارِ پیشینِ سفارش** و بخشی از سازگاریِ API است؛ کنترل‌های کفِ سود/سقف/audit روی همان مسیر فعال‌اند. تغییرِ این رفتار نیازمندِ تصمیمِ مالک است (پرسشِ Q-24-04).

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
5. **بستهٔ `apply_pricing_engine` روی سفارش پیش‌فرض خاموش است**؛ فعال‌سازیِ سراسری تصمیمِ مالک می‌خواهد (Q-24-03).
6. **هدیه/bundle در سطحِ مالی**: ثبتِ فیزیکیِ انبار انجام نمی‌شود (D-24-05).
7. **گزارشِ اثربخشی و تسویه** (E-06) پیاده‌سازی نشده است.

---

## ۶) پرسش‌های تصمیمِ مالک

### F) تسویهٔ کمپین — چه چیزی باید تصمیم گرفته شود (بدونِ اختراعِ شرایط)
- **Q-24-01 (مبنای تسویه):** تسویه با تأمین‌کننده/پخش‌کننده بر مبنای «تعدادِ مصرف‌شده»، «مبلغِ تخفیفِ اعطاشده» یا «تفاوتِ قیمتِ مصوب و فروش»؟
- **Q-24-02 (مسئولیت):** سهمِ تأمین‌کننده/شرکت در هر تخفیف چگونه تعیین می‌شود و در چه سندی ثبت می‌شود؟
- **Q-24-03 (حسابداری):** آیا تسویه سندِ بدهی/دریافتنی می‌سازد، یا فقط کاهشِ بهای تمام‌شده/درآمد؟ دورهٔ شناسایی و رفتار با تسویهٔ پس از پایانِ کمپین؟
- **Q-24-04 (قیمتِ دستی در سفارش):** آیا `unit_price`ِ خطِ سفارش (رفتارِ پیشین) باید هم مجوزِ `pricing.manual_price.apply` بخواهد؟ (اکنون فقط در `/pricing/quote` و `/pricing/simulate` الزامی است.)
- **Q-24-05 (bundle/hدیه/فروش):** ثبتِ فیزیکیِ هدیه و اجرای `bundle` در سفارش از کدام فاز (P5 انبار) و با چه سندی؟
- **Q-24-06 (فعال‌سازیِ موتور روی سفارش):** `apply_pricing_engine` پیش‌فرض روشن شود یا انتخابِ کاربری بماند؟

---

## ۷) راستی‌آزماییِ مستقل (انتظار)
- بازرسیِ read-onlyِ Agent-2 روی: ترتیبِ تقدمِ قیمت، مسیرهای پول (تخفیف/مالیات/کفِ سود)، گیتِ مجوزهای دستی، RLSِ جدول‌های تازه، و برگشت‌پذیریِ ۰۰۴۹.
- معیارِ پایانِ این مرحله: **STOP** پس از ارائهٔ همین گزارش و انتظار برای مجوزِ مالک؛ هیچ merge/deploy انجام نمی‌شود.
