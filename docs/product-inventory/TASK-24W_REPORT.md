# TASK-24W — گزارشِ اصلاحِ هدفمند: بستنِ HIGH-1-R1 و HIGH-2-R1

> **نوعِ کار:** remediation هدفمند روی دو یافتهٔ بازِ TASK-24V. موتورِ قیمت بازنویسی نشد و هیچ
> یافتهٔ تأییدشدهٔ TASK-24F بدونِ شاهدِ تازه بازگشایی نشد.
> **هیچ merge، deploy، force-push، تغییرِ branch-protection یا DB اشتراکی/تولیدی استفاده نشد.**
> **حسابرسیِ مستقلِ Agent-2 انجام نشده است** (`AWAITING INDEPENDENT AUDIT`) — Agent-1 کارِ خود را تأیید نمی‌کند.

---

## ۱) SHA مبنا و نتیجه

| مورد | مقدار |
|---|---|
| مبنای پیش از اصلاح | `1c849bc23309cc8716269aca6bfc2d24523d4dbf` (تأییدشده با `git fetch` + `gh pr view`: برابرِ `headRefOid`) |
| commitِ کد/آزمون/قرارداد | `f5c89b61c5595261f7754f18e02728b60c5f8e0b` |
| commitهای مستندات | `eaf95cf` — گزارش + درخواستِ حسابرسی + به‌روزرسانیِ شواهد (فقط `docs/`) |
| HEAD نهاییِ شاخه | `eaf95cf` (CI سبز روی همین commit) |
| ancestry | `1c849bc` → `f5c89b6` → مستندات؛ هر دو روی `arena/1246108f-green-dms`، شاخه از `main`(`d12dc2e`) جدا شده |
| worktree پیش از کار | پاک (`git status --porcelain` خالی) |

> **دربارهٔ «شاخهٔ اختصاصیِ remediation»:** کار در یک cloneِ تک‌شاخه‌ای انجام می‌شود و Arena این
> جلسه را با `arena/1246108f-green-dms` ردیف می‌کند. ساختِ شاخهٔ دوم، کار را از جلسه جدا می‌کند و
> امکانِ push به آن هم وجود ندارد. بنابراین **همان شاخه** با commitهای مجزا (`1c849bc` → `f5c89b6`)
> استفاده شد و مرزِ اصلاح با SHA مشخص است. هیچ reset/clean/force-push رخ نداد.

## ۲) وضعیتِ PR و شاخه

| مورد | مقدار |
|---|---|
| PR | **#13 — DRAFT**، `state: OPEN`، `mergeable: MERGEABLE` |
| head | `eaf95cf` (کدِ اصلاح: `f5c89b6`) |
| merge/deploy | **انجام نشد** — تصمیم در اختیارِ مالک |

## ۳) HIGH-1-R1 — داوری: **CLOSED** (ادعای Agent-1؛ منتظرِ حسابرسیِ مستقل)

**نقصِ پیشین:** `RequestService.convert()` → `orders.create(companyId, dto)` بدونِ actor، بدونِ
permissions و بدونِ دلیل ⇒ هر `requested_price` (حتی برابرِ سیستم) با `403 manual_price_not_authorized`
رد می‌شد؛ ممیزی بدونِ actor بود.

**اصلاح:**

| الزام | پیاده‌سازی | فایل |
|---|---|---|
| ۱ actor حفظ شود | `@CurrentUser('userId')` → `convert(..., actorUserId, ...)` → `orders.create(...)` و ممیزی | `sales-chain.controller.ts`, `sales-chain.service.ts` |
| ۲ مجوز از سرور | `pricingPermissionsFromSession(user)` (تنها منبع) | `pricing-permissions.ts` (تازه) |
| ۳ ردِ پرچمِ کلاینتی | `ConvertRequestDto` = فقط `price_override_reason`/`note`؛ `whitelist` بقیه را حذف می‌کند | `request.dto.ts` |
| ۴ مجوز برای `requested_price` | بررسیِ صریحِ اقلام پیش از ساختِ سفارش ⇒ ۴۰۳ | `sales-chain.service.ts` |
| ۵ دلیلِ معنادار | همان قاعدهٔ سفارش (واگرایی ۰٫۰۰۵ + ≥۳ نویسه) ⇒ ۴۰۰ | `pricing-engine.service.ts` (مشترک) |
| ۶ ممیزیِ کامل | ردیفِ `convert_to_order`: `request_id`, `order_id`, actor, `requested_prices`, `reason`, `permissions`, `priced_lines` | `sales-chain.service.ts` |
| ۷ همان محافظ‌ها | سفارش از همان `orders.create` ⇒ کفِ سود/سقف/قواعد/اعتبار/موجودی | `order.service.ts` (بدونِ تغییر) |
| ۸ fail-closed | بدونِ actor ⇒ ۴۰۳ `authorization_context_missing`؛ زمینهٔ ناقص ⇒ استثنا | `pricing-permissions.ts` |
| ۹ ضدِ تکرار/هم‌زمانی | `pg_advisory_lock(hashtextextended(request_id,0))` + `UPDATE ... WHERE status='submitted'` | `sales-chain.repository.ts` |

**نکتهٔ مهم (کشفِ حینِ آزمون):** `UPDATE ... WHERE status='submitted'` به‌تنهایی کافی **نبود** — چون
سند پیش از علامت‌گذاری ساخته می‌شود و دو درخواستِ هم‌زمان دو سفارش می‌ساختند (یکی یتیم). آزمونِ
هم‌زمانی این را نشان داد (`expected 2 to be 1`) و قفلِ مشورتی اضافه شد. **بدونِ مهاجرت.**
آزمونِ هم‌زمانی اکنون ۱ سفارش و ۱ ردیفِ ممیزی را اثبات می‌کند.

## ۴) HIGH-2-R1 — داوری: **CLOSED** (ادعای Agent-1؛ منتظرِ حسابرسیِ مستقل)

**نقصِ پیشین:** `quote`/`simulate` از `buildContext(companyId, dto, opts)` استفاده می‌کردند و
`pricing_settings` را نمی‌خواندند.

**اصلاح:** `PricingEngineService.pricedPolicyRun()` — تنها اجرای سیاست، با `mode`:

| `mode` | مسیرها | تاریخ | مجوزِ backdate | دلیل |
|---|---|---|---|---|
| `document` | `POST/PATCH /orders` + `convert` | مؤثر (امروز برای عقب‌گرد) | الزامی | الزامی برای واگرایی |
| `lookup` | `/pricing/quote`, `/pricing/simulate` | درخواستی (پرس‌وجوی تاریخی) | لازم نیست | گزارش به‌صورتِ `reason_required` |

سیاست‌های یکسان در هر دو حالت: سقفِ کل/قلمِ تخفیف، اعمالِ تشویق، `allow_loss_making`، اولویتِ
قیمتِ مشتری/لیست/قلمرو، سطحِ بسته‌بندی، مجوزِ قیمتِ دستی، ردِ بین‌قلمرویی، مالیات و گردکردن.

**تفاوت‌های عمدیِ مستند (پاسخ/ماندگاری، نه محاسبه):**
- `policy_applied` + `system_unit_prices` فقط در پاسخِ استعلام.
- `simulation_id` + `creates_business_document: false` + `hypothetical_inputs[]` فقط در شبیه‌سازی.
- `lookup`: `pricing_date` فرضی است ⇒ قاعدهٔ backdate اعمال نمی‌شود (چون تاریخِ سند نیست).
- شبیه‌سازی: صفر سفارش/فاکتور/مصرفِ تشویق؛ فقط ۱ ردیفِ `price_simulation_log`.

## ۵) شواهدِ رگرسیون و CI

| جمعیتِ آزمون | نتیجه |
|---|---|
| `task24w-conversion-and-parity.api.test.ts` (تازه، DB-محور) | **۲۱/۲۱ PASS** |
| `pricing-engine.api.test.ts` | **۴۷/۴۷ PASS** (شاملِ `it.fails` که اکنون آزمونِ واقعی است) |
| `rules-engine-behavior.test.ts` (G-23) | **۲۷/۲۷ PASS** |
| `pricing-engine.unit` + `pricing-remediation.unit` + `financial-rounding` | **۶۹/۶۹ PASS** |
| وب (unit) | **۵۲/۵۲ PASS** |
| `tsc -p apps/api` / `tsc -p apps/web` | ۰ خطا |
| `openapi:check` | ۱۷۳ مسیر · ۲۵۱ عملیات · ۱۲۷ اسکیما · ۳ وب‌هوک ✅ |
| `contract-drift` | ۰ (enum/required) ✅ |
| `check-test-partition` | OK — ۶۲ فایل |

**CI روی `f5c89b6`:**

| workflow | Run ID | نتیجه |
|---|---|---|
| CI @`f5c89b6` (کد) | `42458240290` | ✅ **success — هر ۵ job** |
| CI @`eaf95cf` (HEAD نهایی، مستندات) | `42458666777` | ✅ **success — هر ۵ job** (تأییدِ تکرارپذیری) |
| مهاجرت‌های پایگاه‌داده | `42458240314` @`f5c89b6` · `42458666736` @`eaf95cf` | ✅ success |
| release-image | `42458240295` @`f5c89b6` | ✅ success |
| e2e (Playwright) | `42458240364` · `42458666697` | ⛔ BLOCKED — نبودِ ایمیجِ MinIO (پیش‌موجود روی `main`: `42372429275`, `42372091303`, `42349918251`, `42250552238`) |

**محدودیتِ محیطِ محلی (افشا):** سندباکس PostGIS ندارد؛ اجرای DB-محور روی کپیِ harness با مهاجرت‌های
«PostGIS-پچ‌شده» انجام شد. به همین دلیل `geofences`, `customers`, `postgres-init-role`,
`view-isolation`, `tours`, `migrations-security` (چرخهٔ `ST_GeomFromText`) و یک آزمونِ fuzzy-search در
`product-master-core` محلی شکست می‌خورند — **نه رگرسیون**: این فایل‌ها در jobِ CI با
`postgis/postgis:16-3.4` اجرا و **سبز** شدند. هیچ ادعای DB-محوری بدونِ اجرای واقعی مطرح نشده است.

## ۶) محدودیت‌های باقی‌ماندهٔ G-03 (بدونِ اغراق)

`G-03` **کامل حل نشد** و در این دور کامل اعلام نشده است. جدولِ سطحِ قابلیت:

| محافظ | وضعیت |
|---|---|
| زنجیرهٔ خالی ⇒ ۴۰۹ | VERIFIED |
| RBACِ گام + منعِ خودتأییدی + `requested_by` از نشست | VERIFIED |
| یکتاییِ تصمیم در هر گام (مهاجرت ۰۰۵۱) | VERIFIED |
| باندِ مبلغ در زمانِ تصمیم (پس از G-23) | VERIFIED |
| `approval_request.company_id` مستقل | **باز** (جداسازی با join) |
| ناسازگاریِ مسیرِ `GET /approvals/{id}` | **باز** (قابلیت زیرِ `/rules-engine/approvals/{id}`) |
| اتصالِ عملیاتِ حساسِ قیمت | **فقط استثنای کفِ سود (سیاستی)** — بقیه وصل نیستند |

هیچ عملیاتِ حساسِ قیمتی در این دور به موتورِ تأیید **وصل نشد**.

## ۷) ثبتِ تصمیم‌ها (بدونِ تغییر)

| شناسه | موضوع | وضعیت |
|---|---|---|
| Q-24-01 | اعمالِ پیش‌فرضِ تشویق روی سفارش | باز |
| Q-24-02 | سقفِ پیش‌فرضِ تخفیف/کفِ سود | باز |
| Q-24-03 | دامنهٔ `pricing.price_list.cross_domain` | باز |
| Q-24-04 | دلیل برای هر قیمتِ دستی یا فقط واگرا | **تأییدشده در عمل: فقط واگرا** (آزمونِ ۱.۶) — نیازمندِ تأییدِ صریحِ مالک |
| Q-24-05 | سیاستِ عقب‌گرد | باز |
| Q-24-10 | اتصالِ قیمتِ دستی به موتورِ تأیید | باز — **در این دور وصل نشد** |
| Q-24-11 | اتصالِ استثنای کفِ سود | باز |
| Q-24-12 | منعِ خودتأییدی | باز (توصیه: حفظ) |

**تصمیم‌های تازه‌ای که Agent-1 گرفت و نیازِ تأییدِ مالک دارد:**
1. **قیمتِ دستیِ برابر با قیمتِ سیستمی** همچنان مجوزِ `pricing.manual_price.apply` می‌خواهد (رفتارِ
   محافظه‌کارانه و سازگار با `POST /orders`؛ اگر مالک بخواهد فقط واگرایی مجوز بخواهد، تغییرِ کوچکی است).
2. **تبدیل با قفلِ مشورتی** (بدونِ مهاجرت) — انتخابِ فنی، بدونِ اثرِ کسب‌وکاری.
3. **`mode: 'lookup'`** برای استعلام: تاریخِ گذشته در استعلام مجوزِ backdate نمی‌خواهد (کارکردِ
   «قیمتِ تاریخی» حفظ شد؛ سندِ واقعی همچنان محافظت می‌شود).

## ۸) حسابرسیِ مستقلِ Agent-2

**انجام نشده.** درخواستِ کاملِ read-only با ۱۲+۱۰ سناریوی بازتولید و نقاطِ بازرسیِ کد در
`docs/product-inventory/TASK-24W_INDEPENDENT_AUDIT_REQUEST.md` ثبت شد. وضعیت:
`AWAITING INDEPENDENT AUDIT`. Agent-1 کارِ خود را تأیید نمی‌کند.

## ۹) توصیهٔ صریح دربارهٔ merge

**PASS مشروط به حسابرسیِ مستقل.** از نظرِ شواهدِ اجرایی (CI کامل سبز، ۱۶۴ آزمونِ مرتبط سبز،
قرارداد هم‌تراز) هیچ مسدودکننده‌ای باقی نیست؛ اما:

1. حسابرسیِ مستقلِ Agent-2 (§۸) پیش از merge انجام شود.
2. مالک دربارهٔ سه تصمیمِ §۷ (خصوصاً بندِ ۱) اظهارنظر کند.
3. سپس merge توسطِ **انسان** انجام شود — این دور هیچ merge/deploy نکرد.
