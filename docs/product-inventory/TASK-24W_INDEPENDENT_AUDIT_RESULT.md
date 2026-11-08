# TASK-24W — گزارش حسابرسیِ مستقل (Agent-2)

**نوع:** حسابرسیِ خوانده‌محور (read-only) · **حسابرسی‌شونده:** TASK-24W (رفعِ HIGH-1-R1 و HIGH-2-R1)
**حسابرس:** Agent-2 — مستقل از Agent-1 · **تاریخ:** ۲۰۲۶-۱۱-۰۸

> این گزارش هیچ کد، آزمون، مهاجرت، سند، تاریخِ Git، شاخه یا وضعیتِ PR را تغییر نداده است.
> هیچ merge، deploy، reset، clean، rebase یا force-push انجام نشده است.

---

## ۰) خلاصهٔ اجرایی

| مورد | نتیجه |
|---|---|
| **حکمِ کلی** | **PASS WITH FINDINGS** |
| SHAِ حسابرسی‌شده | `54078ea8de4d61fa415dba68f12ebfd9afa6328d` (پیاده‌سازی: `f5c89b6`) |
| HIGH-1-R1 (تبدیلِ درخواست) | **CLOSED** با یک یافتهٔ جدیدِ جداگانه (A-1) |
| HIGH-2-R1 (یک مسیرِ سیاست) | **PARTIALLY CLOSED** — یک واگراییِ واقعی در `apply_promotions` (B-1) |
| G-03 | **NOT COMPLETE** — یک fail-openِ واقعی در اتصالِ تأیید (C-1) |
| توصیهٔ merge | **بدونِ رفعِ A-1 و B-1 ادغام نشود** (جزئیات در §۸) |

**یافته‌ها:** ۰ CRITICAL · ۳ HIGH · ۳ MEDIUM · ۲ LOW

---

## ۱) مبنای حسابرسی و اختلافِ محیط

بازبینیِ اولیه: مخزن `Tadbir-Sabz/Green-DMS` ✓ · شاخه `arena/1246108f-green-dms` ✓ · PR #13 باز و `MERGEABLE` با head `54078ea` ✓.

**اما** checkout محلی روی `d12dc2e` (والدِ تحویل) و دارای ۴۷ ورودیِ تغییر‌یافته بود — پدیدهٔ بازنشانیِ مکررِ سندباکس.

به‌جای «تعمیر» (که ممنوع بود)، با یک روشِ کاملاً خوانده‌محور صحتِ محتوا را اثبات کردم:

```
blobs in 54078ea: 2623
identical in worktree: 2623
content-different:     0
missing from worktree: 0
```

(مقایسهٔ SHAِ هر blob در درختِ `ee47de88…` با `git hash-object` فایلِ متناظر در worktree — بدونِ fetch/checkout.)

⇒ **محتوای حسابرسی‌شده بیت‌به‌بیت همان `54078ea` است**؛ اختلاف فقط متادیتای Git بود. حسابرسی روی همین محتوا انجام و در ادامه، اجرای آزمون‌ها در یک cloneِ جداگانهٔ `/tmp/v24` (خارج از مخزن) صورت گرفت.

**پاک‌سازیِ محیط:** `geometry/geography` و `ST_X/ST_Y` فقط در *کپیِ مهاجرت‌های `/tmp`* جایگزین شدند (هیچ کدِ برنامه تغییر نکرد). این یک **محدودیتِ محیطی** است، نه شاهدی بر صحت.

---

## ۲) Scope A — HIGH-1-R1 (تبدیلِ درخواست به سفارش)

| # | معیار | نتیجه | شاهد |
|---|---|---|---|
| A1 | actor → رکوردِ ممیزی | **VERIFIED** | `sales-chain.service.ts:convert()` می‌گیرد `actorUserId` از نشست؛ `logPriceChange({actorUserId})` در `after.actor_user_id` |
| A2 | نبودِ زمینهٔ authz ⇒ fail-closed | **VERIFIED** | `if (!actorUserId) throw pricingContextUnavailable()` و `pricing-permissions.ts:isTrustedAuthContext` |
| A3 | مجوز از بدنه قابلِ جعل نیست | **VERIFIED** | `pricingPermissionsFromSession(user)` تنها منبع؛ آزمون W1-۷ با پرچمِ جعلی ⇒ 403 |
| A4 | `requested_price` ⇒ همیشه `pricing.manual_price.apply` | **VERIFIED** | `hasRequestedPrice && !permissions.manual_price ⇒ 403` (پیش از هر ساختِ سفارش) |
| A5 | واگرایی ⇒ دلیلِ ≥۳ نویسه | **VERIFIED** | قاعده در `pricedPolicyRun`؛ آزمون W1-۴/۵ |
| A6 | ممیزیِ کامل (actor/request/order/pricing/reason/permissions) | **VERIFIED** | بلوکِ `after` در `convertLocked` |
| A7 | قواعدِ کسب‌وکارِ ساختِ سفارش حفظ شده | **VERIFIED** | مسیرِ یگانهٔ `orders.create(companyId, dto, actor, permissions)` |
| A8 | هم‌زمانی ⇒ بدونِ سفارشِ تکراری/یتیم | **VERIFIED در مسیرِ convert** · **نقض در مسیرِ جایگزین (A-1)** | قفلِ advisory + `markRequestConverted` شرطی |
| A9 | مرزِ تراکنشِ قفل / رسیدگیِ خطا | **VERIFIED** | `withRequestConversionLock` با `finally { unlock; release }` |
| A10 | هیچ مسیرِ جایگزینِ دیگر محافظت‌ها را دور نزند | **FAILED** | **A-1** |

### A-1 · HIGH · سفارشِ تکراری از مسیرِ `POST /orders` با `request_id`

`CreateOrderDto.request_id` پذیرفته می‌شود و `OrderService.create()` **هرگز** `withRequestConversionLock` را نمی‌گیرد؛ `sales_order.request_id` نیز **unique نیست** (بررسیِ همهٔ `migrations/*.up.sql`).

اثباتِ اجرایی (`SO-1405-000001` و `SO-1405-000002` روی یک درخواست):

```
CONVERT => 201 {"id":"b7035ddb-…","doc_number":"SO-1405-000001",…}
POST /orders with request_id => 201 {"id":"d3615972-…","doc_number":"SO-1405-000002",…}
orders linked to this request => 2
request status after both => converted
BYPASS DEMONSTRATED: true (count=2)
```

**دامنهٔ اثر:** تضمینِ «هیچ سفارشِ تکراری/یتیم» که هدفِ صریحِ HIGH-1-R1 است، از مسیرِ جایگزین نقض می‌شود. توجه: محافظتِ *قیمتِ دستی* در این مسیر **کار می‌کند** (زیرمجموعهٔ مجوزها ⇒ `manual_price_not_authorized`)، پس نقض محدود به **یکتاییِ سفارش** است، نه دورزدنِ authz قیمت.

**توجه به منشأ:** `request_id` در `d12dc2e` نیز وجود داشت؛ این یک **شکافِ پیش‌موجود** است که TASK-24W آن را **نبست** ولی در ادعای «اتمیِ کامل» لحاظ نکرده است.

**رفعِ پیشنهادی:** `create unique index … on sales_order(request_id) where request_id is not null;` **یا** گرفتنِ همان قفل در `OrderService.create()` وقتی `request_id` حاضر است + بازبینیِ وضعیتِ درخواست پیش از ساخت.

---

## ۳) Scope B — HIGH-2-R1 (یک مسیرِ مرجعِ سیاست)

| # | معیار | نتیجه |
|---|---|---|
| B1 | `pricedPolicyRun()` تنها مسیرِ مرجع | **VERIFIED** — تنها دو فراخوان: `quoteForOrder` و `quoteWithPolicy`؛ `computeQuote` بیرون از موتور فراخوانده نمی‌شود |
| B2 | سند/استعلام سازگار | **VERIFIED** (آزمونِ ۲۱تایی) |
| B3 | سقفِ تجمیعی، تشویق، کفِ سود، قلمرو، مجوزِ دستی، مالیات، گِرد | **FAILED در بخشِ تشویق** — **B-1** |
| B4 | تفاوت‌های عمدی درست و مستند | **VERIFIED** — `mode` فقط سرور-سویه است؛ `todayTehran` مبنا قرار گرفته و تفاوت مستند شده |
| B5 | آزمون‌ها رفتارِ واقعی را می‌سنجند | **VERIFIED** — هیچ `it.skip`/`it.fails` در دامنهٔ ۲۴W؛ `it.fails` سابق به آزمونِ واقعی تبدیل شد |
| B6 | بدونِ دورزدنِ محافظت‌نشده | **VERIFIED** |

### B-1 · HIGH · واگراییِ `apply_promotions` بین استعلام و سفارش

`quoteWithPolicy` مقدارِ `apply_promotions: dto.apply_promotions !== false` را از **بدنهٔ درخواست** می‌پذیرد، ولی `OrderService` هیچ ورودیِ هم‌ارزی ندارد و همیشه از `settings.apply_promotions_on_orders` پیروی می‌کند.

اثبات با زمینهٔ یکسان (تنظیمات: تشویق روشن، سقفِ تخفیف ۵۰٪؛ تشویقِ ۱۰٪ فعال):

```
QUOTE default        => 201  discount=100.00  grand=981.00
QUOTE promos-off     => 201  discount=0.00    grand=1090.00
ORDER                => 201  grand=981.00     discount=100.00
DIVERGENCE: quote(promos OFF)=1090   order=981
```

⇒ الزامِ «quote == order در زمینهٔ یکسان» **نقض** می‌شود. کاربر می‌تواند استعلامی بگیرد که ۱۰۹ ریال **گران‌تر** از سفارشی است که همان سیستم ثبت می‌کند.

**نکتهٔ مهم:** بدنه نمی‌تواند تشویق را *روشن* کند وقتی تنظیمات خاموش است (تنها محدودتر می‌کند)، پس این یک **دورزدنِ authz نیست**؛ ولی یک ناسازگاریِ سیاست است و بر خلافِ ادعای «هم‌سانیِ کامل» در `TASK-24W_REPORT.md` §۴.

**رفعِ پیشنهادی:** یا `apply_promotions` از `QuoteRequestDto` حذف شود (منبعِ یکتا: تنظیمات)، یا معادلِ آن به سفارش هم افزوده و در سند مستند شود.

### B-2 · MEDIUM · دو تابعِ «امروز» در یک ماژول

`quoteWithPolicy` پیش‌فرضِ تاریخ را از `today()` (UTC) می‌گیرد، ولی مرزِ عقب‌گرد در `pricedPolicyRun` با `todayTehran()` سنجیده می‌شود. در پنجرهٔ ۲۰:۳۰–۲۴:۰۰ UTC این دو یک روز اختلاف دارند (به A-2 مرتبط است).

---

## ۴) Scope C — ارزیابیِ مستقلِ G-03

| مورد | نتیجه |
|---|---|
| `approval_request.company_id` مستقل | **غایب** — ستون‌ها: `id, approval_chain_id, entity_type, entity_id, requested_by, amount, status, current_step, created_at, closed_at`. جداسازی از طریق `join approval_chain` + RLSِ ۰۰۴۲ انجام می‌شود (کارآمد، ولی به زنجیره وابسته) |
| `GET /approvals/{id}` + جداسازیِ شرکت | **VERIFIED** — `getApprovalRequest` با `a.id=$1 and ac.company_id=$2`؛ آزمونِ متقابل: شرکتِ دیگر ⇒ 404 |
| RBACِ گام | **VERIFIED** — `userCanApproveStep` |
| منعِ خودتأییدی | **VERIFIED** — `self_approval_forbidden` |
| یکتاییِ تصمیم | **VERIFIED** — ایندکسِ `uq_approval_decision_step` (۰۰۵۱) + ترجمهٔ `23505` |
| باندِ مبلغ | **VERIFIED** — فقط گامِ ورود، پیش از نخستین تصمیم |
| زنجیرهٔ خالی ⇒ fail-closed | **VERIFIED** — `approval_chain_empty` (۴۰۹) در ثبت **و** در تصمیم (اثباتِ اجرایی) |
| **اتصالِ عملیاتِ حساس به تأیید** | **FAILED** — **C-1** |

### C-1 · HIGH · Fail-open در اتصالِ استثنای کفِ سود به موتورِ تأیید

در `PricingEngineService.createMarginException`:

```ts
const chainId = await this.repo.findApprovalChain(companyId, 'pricing.margin_exception');
if (chainId) { … createApprovalRequest … }
```

اگر زنجیره **تعریف نشده باشد**، استثنا بدونِ هیچ `approval_request` ساخته می‌شود و در `decideMarginException` بررسیِ تأیید (**که فقط وقتی `approvalRequestId` موجود باشد اجرا می‌شود**) کاملاً رد می‌شود.

اثباتِ اجرایی (بدونِ هیچ زنجیرهٔ `pricing.margin_exception`):

```
create exception  => 201  (approval_request_id = null)
approve exception => 201  status = approved
OBSERVED: exception approved with NO approval_request behind it => true
```

⇒ با یک مجوزِ منفرد `pricing.margin.override`، یک استثنای کفِ سود **بدونِ هیچ گردشِ تأیید** تأیید می‌شود. این دقیقاً همان «اتصالِ ناقصِ عملیاتِ حساس به تأیید» است که G-03 را باز نگه می‌دارد. (در مقابل، وقتی زنجیره **موجود** بود، `approval_chain_empty` درست fail-closed عمل کرد.)

**رفعِ پیشنهادی:** پیش‌فرضِ fail-closed — نبودِ زنجیره ⇒ یا `409` («گردشِ تأیید برای این عملیات تعریف نشده») یا حداقلِ دو-شخص-الزامی بدونِ نیاز به زنجیره.

---

## ۵) Scope D — طبقه‌بندیِ شواهد

| شاهد | طبقه‌بندی | توضیح |
|---|---|---|
| `task24w-conversion-and-parity` | **VERIFIED** | ۲۱/۲۱ — اجرای مستقلِ Agent-2 روی Postgresِ محلی |
| `pricing-engine.api` | **VERIFIED** | ۴۷/۴۷ |
| واحدها (`pricing-engine.unit`، `pricing-remediation.unit`، `financial-rounding`) | **VERIFIED** | ۶۹/۶۹ (۴۲+۱۶+۱۱) |
| `rules-engine-behavior` | **VERIFIED** | اجرای مشترک با `orders.api`: ۴۲/۴۲ |
| `tsc -p apps/api --noEmit` | **VERIFIED** | خروجی ۰ |
| CI @`54078ea` (run `42458927544`) | **VERIFIED** (مستقل از GitHub API) | Static ✓ · Integration Postgres ✓ · Unit ✓ · MinIO ✓ · init-hygiene ✓ · release-image ✓ |
| Playwright E2E | **VERIFIED WITH ENVIRONMENT LIMITATION** | `failure` — روی `main` نیز همین‌طور است (نبودِ ایمیجِ MinIO)؛ رگرسیونِ ۲۴W نیست |
| آزمون‌های PostGIS (`geofences`, `customers`, `postgres-init-role`, `view-isolation`, `tours`, `migrations-security`) | **VERIFIED WITH ENVIRONMENT LIMITATION** | محلی قابلِ اجرا نیستند؛ فقط از CI سبز تأیید می‌شوند — **محلی سبز اعلام نمی‌شوند** |
| Web (`test:web`) | **VERIFIED با ادعای Agent-1** | ۵۲/۵۲ — در این دورِ حسابرسی بازاجرا نشد (خارج از دامنهٔ ریسک) |

**هیچ آزمونِ DB-backed در این گزارش به‌عنوان «محلی سبز» ادعا نشده مگر آنکه واقعاً اجرا شده باشد.**

---

## ۶) Scope E — رگرسیون و امنیت

| حوزه | نتیجه |
|---|---|
| دورزدنِ authz قیمت | **بدونِ یافته** — هر سه مسیر از `pricingPermissionsFromSession` تغذیه می‌شوند |
| دسترسیِ بین‌شرکتی | **بدونِ یافته** در approvals؛ join + RLS |
| مسابقه/هم‌زمانی | **قفلِ convert کار می‌کند**؛ اما A-1 یک مسیرِ بدونِ قفل باقی می‌گذارد |
| ناسازگاریِ تراکنشی | **A-1** (سفارشِ دوم خارج از قفل) |
| یکپارچگیِ ممیزی | **VERIFIED** برای convert؛ مسیرِ `POST /orders` با `request_id` **ممیزیِ منبعِ تبدیل ندارد** |
| افزایشِ سطحِ دسترسی | **بدونِ یافته** |
| ناسازگاریِ سیاست | **B-1** |
| انحرافِ قرارداد | **بدونِ یافته** — `ConvertRequest`/`policy_applied`/`hypothetical_inputs` در OpenAPI |
| نبودِ آزمونِ منفی | **بخشی** — A-1، A-2، B-1، C-1 هیچ آزمونِ پوششی ندارند |

---

## ۷) فهرستِ یافته‌ها

| شناسه | شدت | عنوان | مکان |
|---|---|---|---|
| **A-1** | **HIGH** | سفارشِ تکراری از `POST /orders` با `request_id` (بدونِ قفل، بدونِ unique) | `order.dto.ts:91` · `order.service.ts` · `sales_order.request_id` |
| **B-1** | **HIGH** | واگراییِ `apply_promotions` ⇒ استعلام ≠ سفارش با زمینهٔ یکسان | `pricing-engine.service.ts` (`quoteWithPolicy`) |
| **C-1** | **HIGH** | Fail-open در اتصالِ استثنای کفِ سود به تأیید (نبودِ زنجیره) | `pricing-engine.service.ts` (`createMarginException`, `decideMarginException`) |
| **A-2** | **MEDIUM** | `convert()` با `new Date().toISOString()` تاریخِ سند می‌سازد ولی موتور با `todayTehran()` می‌سنجد ⇒ در ۲۰:۳۰–۲۴:۰۰ UTC ردِ نادرست | `sales-chain.service.ts:187` |
| **B-2** | **MEDIUM** | دو تابعِ «امروز» (`today()` vs `todayTehran()`) در یک ماژول | `pricing-engine.service.ts:160,165` |
| **A-3** | **MEDIUM** | آزمون‌ها `TODAY` را از UTC می‌سازند ⇒ پنجرهٔ زمانیِ A-2 را هرگز نمی‌بینند | `task24w-…test.ts:82` |
| **A-4** | **LOW** | مسیرِ باختِ مسابقه سفارش را «باطل نمی‌کند» و به کاربر واگذار می‌کند | `sales-chain.service.ts` (`already_converted`) |
| **C-2** | **LOW** | `approval_request` بدونِ `company_id` ⇒ جداسازی کاملاً به join با زنجیره وابسته است | `migrations/0009` · `0042` |

---

## ۸) ارزیابیِ دو یافتهٔ HIGH و توصیهٔ merge

- **HIGH-1-R1:** مکانیزمِ اصلی **درست و معتبر** رفع شده است (actor، مجوزِ سرور-محور، دلیل، ممیزی، قفلِ advisory). با این حال ادعای «هیچ سفارشِ تکراری» با **A-1** نقض می‌شود.
- **HIGH-2-R1:** مسیرِ مرجعِ واحد واقعاً ساخته شده و ۹ مورد از ۱۰ مورد هم‌سان است؛ اما **B-1** نشان می‌دهد هم‌سانیِ کامل نیست و ادعای گزارش بیش از شاهد است.

**توصیه (صریح):** PR #13 **در وضعیتِ فعلی ادغام نشود** تا A-1 و B-1 رفع شوند. A-1 ریسکِ داده‌ایِ مالی دارد (دو سفارشِ فعال برای یک درخواست) و B-1 مستقیماً معیارِ پذیرشِ HIGH-2-R1 را نقض می‌کند. A-2/B-2/A-3 را می‌توان در همان دور یا دورِ بلافاصله پس از آن بست. C-1 مانعِ ادغامِ ۲۴W نیست، ولی **G-03 نباید «رفع‌شده» اعلام شود**.

**راه‌حلِ کم‌ریسک:** افزودنِ unique index روی `sales_order(request_id)` + حذف/هم‌ارزسازیِ `apply_promotions` + آزمونِ منفی برای هر سه؛ سپس حسابرسیِ محدودِ مجدد روی commitِ بعدی.

---

## ۹) محدودیت‌های صریحِ این حسابرسی

- اجرای آزمون‌ها در `/tmp` با PostGISِ شبیه‌سازی‌شده انجام شد؛ نتیجهٔ مواردِ **غیرِفضایی** معتبر است، ولی جای CIِ `postgis/postgis:16-3.4` را نمی‌گیرد.
- Redis در دسترس نبود (کش/صفِ سراسری) — بر مسیرِ authzِ آزمون‌شده اثری نداشت.
- E2Eِ Playwright (MinIO) اجرا نشد؛ به CI اتکا شده است.
- آزمون‌های کمکیِ حسابرسی (`zz-audit-*`) **فقط در `/tmp`** ساخته شدند و به مخزن افزوده نشده‌اند.

---

## ۱۰) تأییدیهٔ محدوده

| ممنوعیت | رعایت |
|---|---|
| تغییرِ کد/آزمون/مهاجرت/سند/تاریخِ Git/شاخه/PR | ✓ هیچ تغییری جز افزودنِ همین فایلِ گزارش |
| merge / deploy / reset / clean / rebase / force-push | ✓ انجام نشد |
| ادعای اجرای آزمونی که اجرا نشد | ✓ هر ادعا با شاهدِ خروجی همراه است |
| پذیرشِ ادعای Agent-1 بدونِ بازبینیِ کد | ✓ همهٔ ادعاها مستقیماً در کد/اجرا بازبینی شدند |
