# TASK-24X — گزارشِ نهایی

**حوزه:** یکپارچگیِ مالی، هم‌سانیِ قیمت‌گذاری، و ترمیمِ تأییدِ fail-closed
**شاخه:** `arena/1246108f-green-dms` · **PR:** #13 (باز — **merge نشده**)
**نقشِ نویسنده:** Agent-1 (پیاده‌ساز) — **این گزارش خودتأییدی نیست.**

> ## حکم: **PASS WITH FINDINGS**
>
> همهٔ چهار یافته پیاده‌سازی و آزمون شده‌اند و CI سبز است (به‌جز یک قفلِ
> پیش‌موجودِ MinIO). ولی دو دلیلِ صریح مانع از «PASS» می‌شود:
> **(۱)** G-03 در سطحِ معماری کامل نیست و باید باز بماند؛
> **(۲)** Agent-2 هنوز حسابرسیِ مستقل را انجام نداده است و Agent-1 اجازه ندارد
> کارِ خودش را تأیید کند.

---

## ۱) SHAهای مرجع

| نقطه | SHA |
| --- | --- |
| baseline حسابرسی‌شده (Agent-2) | `669c92f0e4af5f1a47878f316df2221c35ed82bd` |
| HEAD پیش از TASK-24X | `d12dc2e` |
| merge TASK-24V/24W + TASK-24X | `b9982617bf875eea9d67ac5349fc023a4684ad46` |
| **HEAD نهایی** | **`43ec3b7654d855bd15dd1334f649dddb48bcfa9e`** |
| remote HEAD | همان (push شد، fast-forward) |

**نکتهٔ مهمِ تاریخچه:** کار روی `d12dc2e` آغاز شد که **۱۵ commit پیش از** origin
بود (TASK-24V/24W). به‌جای rebase/force، `669c92f` **merge** شد. تأیید:
`git merge-base --is-ancestor 669c92f HEAD` ⇒ true. هیچ کاری از دست نرفت.

---

## ۲) یافته‌ها و وضعیتِ ترمیم

### A-1 — یکتاییِ درخواست در همهٔ مسیرهای ساختِ سفارش ⇒ ✅ ترمیم شد

| مورد | پیاده‌سازی |
| --- | --- |
| سازوکارِ واحد | `OrderCreationLock` (`pg_advisory_lock` روی `request:<id>`) |
| همهٔ مسیرها | `POST /orders`، `POST /requests/{id}/convert`، `OrderService.create` |
| قفلِ قدیمی | `withRequestConversionLock` **حذف** شد (یک پیاده‌سازی، نه دو) |
| reentrancy | مجموعهٔ AsyncLocalStorage + `WeakMap` بر `heldByClient` |
| پشتوانهٔ DB | `uq_sales_order_request_active` (partial unique) |
| دامنه | **فقط** `request_id`، با شرطِ `status not in ('cancelled','rejected')` |
| تکرار | `409 request_already_converted` + `details.sales_order_id` |

**چرا `UNIQUE(request_id)` سراسری کافی نبود** (طبقِ خواستهٔ صریحِ کار):
۱) باید partial باشد تا سفارش‌های مستقلِ بدونِ درخواست بیرون بمانند؛
۲) دامنه «درخواست» است نه «درخواست+شرکت» — `customer_request.id` یکتای جهانی
است و افزودنِ `company_id` فقط ایندکس را متورم می‌کرد؛ جداسازیِ شرکت از
`customer_request → branch.company_id` و RLS می‌آید؛
۳) سندِ لغو/ردشده نباید درخواست را برای همیشه قفل کند.

### B-1 — هم‌سانیِ سیاستِ قیمت ⇒ ✅ ترمیم شد

- `apply_promotions` از DTO و قرارداد **حذف** شد.
- منبعِ معتبر: `pricing_settings.apply_promotions_on_orders`.
- استعلام/شبیه‌سازی/سفارش از **یک** تابع (`pricedPolicyRun`).
- نتیجهٔ اندازه‌گیری: **۹۸۱** با تشویق، **۱۰۹۰** بدونِ آن — در هر سه مسیر یکسان.

### C-1 — تأییدِ fail-closed ⇒ ✅ ترمیم شد (G-03 باز)

نبودِ زنجیره/گام/موتور ⇒ `409` و **هیچ ردیفی نوشته نمی‌شود**.
شکست در ساخت/اتصالِ درخواستِ تأیید ⇒ استثنا لغو می‌شود
(`abandonMarginException`)، نه اینکه `pending` بی‌مسیر بماند.
استثنای بدونِ `approval_request_id` **قابلِ تأیید نیست**.
خودتأییدی دوبار مسدود: `403` در route guard، سپس `403 self_approval_forbidden`.

### MEDIUM — تاریخِ کسب‌وکارِ تهران ⇒ ✅ ترمیم شد

`common/business-date.ts` تنها منبع است. `today()`/`todayTehran()` حذف و با
`businessToday()` جایگزین شدند. نیمه‌شبِ تهران = ۲۰:۳۰ UTC؛
`2026-06-15T21:30Z` ⇒ تاریخِ کسب‌وکار `2026-06-16` (تستِ M-4b با fake timers).

---

## ۳) فایل‌های تغییر‌یافته (نسبت به `669c92f`)

**جدید (۹):**
```
apps/api/src/common/business-date.ts
apps/api/src/modules/sales/order-creation-lock.ts
apps/api/test/task24x-remediation.api.test.ts
docs/product-inventory/TASK-24X_APPROVAL_ARCHITECTURE.md
docs/product-inventory/TASK-24X_INDEPENDENT_AUDIT_REQUEST.md
docs/product-inventory/TASK-24X_MIGRATION_0052.md
docs/product-inventory/TASK-24X_PRICING_PARITY.md
migrations/0052_sales_order_request_uniqueness.up.sql
migrations/0052_sales_order_request_uniqueness.down.sql
```

**تغییر‌یافته (۱۳):**
```
apps/api/src/modules/pricing/pricing-engine.repository.ts
apps/api/src/modules/pricing/pricing-engine.service.ts
apps/api/src/modules/pricing/pricing.dto.ts
apps/api/src/modules/sales/order.repository.ts
apps/api/src/modules/sales/order.service.ts
apps/api/src/modules/sales/sales-chain.repository.ts
apps/api/src/modules/sales/sales-chain.service.ts
apps/api/src/modules/sales/sales.module.ts
apps/api/test/migrations-security.test.ts
apps/api/test/pricing-engine.api.test.ts
apps/web/src/app/prices/page.tsx
packages/api-client/src/schema.ts
packages/contracts/openapi.yaml
```

---

## ۴) مهاجرت ۰۰۵۲ — ایمنی (آزمونِ واقعی، اجرا شد)

| سناریو | نتیجهٔ مشاهده‌شده |
| --- | --- |
| دو سفارشِ `approved` با یک `request_id` | **`P0001`** + UUID درگیر در پیام؛ **هیچ ردیفی حذف/ادغام نشد** |
| یکی `cancelled`، یکی `approved` | مهاجرت **موفق** |
| پس از مهاجرت: درجِ سفارشِ فعالِ دوم | `duplicate key ... uq_sales_order_request_active` ⇒ **مسدود** |
| `down` | هر دو ایندکس حذف؛ دادهٔ کسب‌وکار دست‌نخورده |

توالیِ کاملِ `0001…0052` روی دیتابیسِ خالی اعمال شد: **موفق**.

---

## ۵) آزمون‌ها — اجرای واقعی

### محلی (sandbox، PostGIS شبیه‌سازی‌شده — نه واقعی)

| فایل | نتیجه |
| --- | --- |
| `pricing-engine.api.test.ts` | **۴۸/۴۸** ✅ |
| `task24x-remediation.api.test.ts` | **۲۵/۲۵** ✅ |
| `task24w-conversion-and-parity.api.test.ts` | **۲۱/۲۱** ✅ |
| `orders.api.test.ts` | **۱۵/۱۵** ✅ |
| `pricing.api.test.ts` | ۱۶/۱۶ ✅ |
| `pricing-engine.unit.test.ts` | ۴۲/۴۲ ✅ |
| `pricing-remediation.unit.test.ts` | ۱۶/۱۶ ✅ |
| `rules-engine-behavior.test.ts` | ۲۷/۲۷ ✅ |
| `financial-rounding.test.ts` | ۱۱/۱۱ ✅ |
| **جمعِ متمرکز** | **۲۲۱/۲۲۱ ✅** |

**کلِ `apps/api` محلی:** ۱۱۴۹ pass / ۳۶ fail / ۶۶ skip.
هر ۳۶ خطا روی `d12dc2e` (baseline) **همان‌طور** شکست می‌خورند ⇒ محیطی
(PostGIS/نقش/GRANT)، نه رگرسیون. **این‌ها را «سبز» گزارش نمی‌کنم.**

### CI (PostGISِ واقعی) — run `42492130097` و همکاران

| Job | نتیجه |
| --- | --- |
| Static checks (typecheck, OpenAPI, drift) | ✅ pass |
| Unit tests (no DB, no MinIO) | ✅ pass |
| **Integration (Postgres) — API + tenant isolation** | ✅ **pass** |
| Integration (MinIO) — attachment round-trip | ✅ pass |
| Init credential hygiene | ✅ pass |
| چرخهٔ up → down → up روی دیتابیسِ خالی | ✅ pass |
| Release image boot smoke | ✅ pass |
| Playwright E2E | ❌ fail — **پیش‌موجود** |

**دربارهٔ E2E:** شکست در گامِ `assert MinIO resolved (BLOCKED gate)` است، پیش از
بالا آمدنِ پشته. همین workflow روی `669c92f` (پیش از کارِ من) هم `failure` بود.
⇒ قفلِ محیطی، نه رگرسیونِ TASK-24X.

---

## ۶) قرارداد و typecheck

| مورد | نتیجه |
| --- | --- |
| `tsc -p apps/api --noEmit` | ✅ exit 0 |
| `tsc -p apps/web --noEmit` | ✅ exit 0 |
| `contract-drift` | ✅ **۰** واگرایی، ۲۵۱ عملیات |
| `schema.ts` بازتولید | ✅ byte-identical |
| کدهای خطای جدید در OpenAPI | ✅ مستند شدند |

**بدونِ شکستنِ مستندِ API:** `apply_promotions` حذف شد ولی رفتارِ فیلدِ ناشناخته
«حذف» است، نه ۴۰۰ ⇒ کلاینتِ قدیمی نمی‌شکند. کلاینتِ **Kotlin** بازتولید نشد
(Maven JAR در دسترس نیست) — شکافِ ثبت‌شده.

---

## ۷) ریسک‌های باقی‌مانده

| # | ریسک | شدت | وضعیت |
| --- | --- | --- | --- |
| ۱ | G-03: بدونِ اعلان، بدونِ انقضا، بدونِ تفکیل | **HIGH** | باز — مستند شد |
| ۲ | قلمروی عملیاتی در زنجیرهٔ تأیید مدل نشده | MEDIUM | باز |
| ۳ | ردیف‌های تاریخیِ `approval_request_id = null` قابلِ تأیید نیستند | MEDIUM | پذیرفته؛ نیازمندِ لغو/ثبتِ دوباره |
| ۴ | کلاینتِ Kotlin بازتولید نشده | MEDIUM | باز |
| ۵ | تستِ هم‌سانی سناریو-محور است، نه property-based | LOW | باز |
| ۶ | E2E در این محیط اجرا نمی‌شود | LOW | محیطی |
| ۷ | `down` مهاجرت ۰۰۵۲ قید را برمی‌دارد بدونِ ترمیمِ دادهٔ تکراری | LOW | مستند |

---

## ۸) تغییراتِ تست (باید در حسابرسی بازبینی شود)

| فایل | تغییر | توجیه |
| --- | --- | --- |
| `pricing-engine.api.test.ts` | تستِ استثنا اکنون زنجیرهٔ تأیید می‌سازد؛ تستِ fail-closed افزوده شد؛ کاربرِ `pe_chain_approver` | تستِ قدیمی استثنا را **بدونِ** زنجیره می‌ساخت — یعنی خودش آسیب‌پذیری را تثبیت می‌کرد |
| `migrations-security.test.ts` | `toBe(51)` ⇒ `toBe(52)` | مهاجرت ۰۰۵۲ افزوده شد |

**شاهدِ عدمِ تضعیف (کنترلِ منفی):** با غیرفعال‌کردنِ گاردِ C-1 در یک کپیِ موقت،
همان فایل **۱۰ تست** را شکست می‌دهد (شاملِ تستِ جدید) در حالی که نسخهٔ فعلی
۴۸/۴۸ سبز است. ⇒ تست واقعاً از کنترل محافظت می‌کند.

---

## ۹) آنچه انجام **نشد** (عمداً)

- ❌ merge کردنِ PR #13
- ❌ deploy یا تغییرِ زیرساختِ production
- ❌ force-push، reset، clean، یا از دست دادنِ کارِ دیگران
- ❌ حذف یا ادغامِ خودکارِ اسنادِ مالی
- ❌ اعلامِ حل‌شدنِ G-03
- ❌ تضعیفِ کنترل‌ها برای سبزکردنِ تست

---

## ۱۰) آمادگیِ حسابرسیِ مستقل

درخواستِ کامل در `TASK-24X_INDEPENDENT_AUDIT_REQUEST.md` (فقط-خواندن).
Agent-2 باید A-1، B-1، C-1 و MEDIUM را مستقل بسنجد، **از جمله بازتولیدِ
کنترلِ منفی**. تا آن زمان، وضعیت **«آمادهٔ حسابرسی»** است، نه «تأییدشده».

## حکمِ نهایی: **PASS WITH FINDINGS**

پیاده‌سازی و آزمون کامل است و هیچ رگرسیونی وجود ندارد؛ ولی (۱) G-03 در سطحِ
معماری باز است و (۲) تأییدِ مستقل انجام نشده. بنابراین «PASS» کامل ادعا نمی‌شود.
