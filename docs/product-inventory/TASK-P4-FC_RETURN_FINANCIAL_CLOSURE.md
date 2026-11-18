# TASK-P4-FC — بستنِ مالیِ مرجوعی: بستانکاری، سقف‌های eligibility و آشتی‌گیری

**وضعیت:** پیاده‌سازی تحویل شد؛ روی branch اختصاصی `arena/7a030c7f-green-dms`؛ PR **Draft** علیه `main`؛ ادغام نشده؛ استقرار نشده.
**مبنای دقیق:** `899fe77ebbf6d63b6ebfc3934dbc6dfe4e593081` (merge commit PR #18، تأییدشده: main جاری).

> **مرزهای صریحِ این برش:**
> - **«تحویل»** (receive با تعیین تکلیف)، **«بستانکاری»** (credit note) و **«ارزش‌گذاریِ بهای تمام‌شده»** سه رویدادِ مستقل‌اند و هیچ‌کدام دیگری را ضمنی نمی‌کند. بستانکاری و ارزش‌گذاری مستقل‌اند؛ این برش بستانکاری را پیاده کرده، اما هیچ عملیاتِ ارزش‌گذاری پیاده نشده و وضعیت `unresolved` می‌ماند.
> - **`valuation_status` روی همهٔ مرجوعی‌ها `unresolved` می‌ماند** — بهای تمام‌شدهٔ مرجوعی **حل‌نشده** است و این سند هرگز ادعای تکمیلِ حسابداریِ مرجوعی نمی‌کند (OD-01).
> - **هیچ سندِ GL/journal_entry ساخته نمی‌شود** — فقط دفترِ مشتری (AR) به‌روز می‌شود (OD-07).
> - هیچ سیاستِ حسابداریِ مالک بدون تصویب فعال نشد؛ تصمیماتِ باز در `TASK-P4-FC_OWNER_DECISIONS.md` ثبت‌اند (هیچ‌کدام تصویب‌شده نیست).
> - این برش فقط **بستنِ مالیِ جریان مرجوعی ↔ فاکتور** است؛ باقیِ P4 (backorder/F-06، وصولیِ محل، G-05، E2E مرورگری) مانند قبلِ خود و دست‌نخورده‌اند.

---

## ۱) چرا این برش (دروازهٔ انتخاب)

پس از TASK-P4-R (merge PR #18)، کالای برگشتی از نظر موجودی به‌درستی پُست می‌شد ولی هیچ اثرِ مالی نداشت و حتی eligibility مقداری نسبت به فاکتور سقف نداشت:
- مرجوعی می‌توانست بیش از فروخته‌شدهٔ خط فاکتور ثبت شود؛
- صدور یادداشت بستانکار مسیری نداشت (جداول `credit_note`/`credit_note_line` وجود داشتند ولی به مرجوعی وصل نبودند)؛
- ماندهٔ AR مشتری از مرجوعی مطلع نمی‌شد؛
- فاکتور هیچ نشانهٔ «بازگشت کامل/جزئی» نداشت.

این برش همان «Minimum Needed to Close» را می‌سازد — بدونِ تغییرِ سیاست‌های مالک.

## ۲) چرخهٔ حیات (۱۰ مرحله — وضعیت واقعیِ پیاده‌سازی)

| # | مرحله | رویداد/وضعیت | اثرات | وضعیت |
|---|---|---|---|---|
| ۱ | درخواست | `POST /returns` ⇒ `submitted` | رکورد `return_request` + خطوط؛ پیوند اختیاری `invoice_id` / `invoice_line_id` | ✅ |
| ۲ | اعتبارسنجی اکنون | eligibility مقداری نسبت به خطِ فاکتور (qtyِ فروخته‌شده − بستانکارشدهٔ posted قبلی) | `400 qty_exceeds_invoiced` / `invoice_line_not_found` / `line_product_mismatch` / `invoice_customer_mismatch` / `invoice_line_mismatch` | ✅ |
| ۳ | ارسال به تأیید | `POST /returns/{id}/request-approval` | موتورِ تأیید موجود (بدون تغییر) | ✅ (موجود) |
| ۴ | تأیید | `POST /returns/{id}/approve` (مجوز `sales.return.approve`) | گذار `approved` | ✅ (موجود) |
| ۵ | دریافت + تعیین تکلیف | `POST /returns/{id}/receive` (مجوز `sales.return.post`) | گذار `posted` + `sale_return_in` با `unit_cost=0` برای restock/damaged، بدون حرکت برای scrap/return_to_supplier — **همه در یک تراکنش** (TASK-P4-R) | ✅ (موجود) |
| ۶ | ارزش‌گذاری | `valuation_status` (migration 0067) | صریح و ذخیره‌شده؛ پیش‌فرض `unresolved` ⇒ «ارزش‌گذاری حل‌نشده» | ⚠️ **تصمیم مالک OD-01** |
| ۷ | صدور بستانکار | `POST /returns/{id}/credit-note` (مجوز `sales.return.credit`) | `credit_note(posted)` + `credit_note_line` + `customer_ledger_entry (credit)` + `return_request.credit_note_id` — یک تراکنش، idempotent | ✅ این برش |
| ۸ | حساب مشتری | دفترِ AR (`customer_ledger_entry`, doc_type=`credit_note`) | ماندهٔ بدهکاری مشتری کاهش می‌یابد؛ traceability به `credit_note.id` | ✅ این برش |
| ۹ | ثبتِ حسابداری | — | **هیچ سندِ GL ساخته نمی‌شود** | 🔒 OD-07 |
| ۱۰ | بستن | «بازگشتِ کامل/جزئیِ فاکتور» از نمای `v_invoice_return_summary` مشتق می‌شود؛ `closed` دستی/آینده | بدونِ نوشتنی روی فاکتورِ posted (تغییرناپذیری حفظ شد) | ✅ (نمای مشتق) / جزئی |

## ۳) مدل وضعیت مالی (ذخیره نمی‌شود، مشتق می‌شود)

```
financial_status(row) =
   'awaiting_receipt'      اگر status ∉ {posted, closed}
   'awaiting_credit_note'  اگر posted/closed و credit_note_id ندارد
   'credit_note_issued'    اگر posted/closed و credit_note_id دارد
```

- `awaiting_*` یعنی مسیر هنوز باز است؛ هیچ کمبودِ مجوزی را مخفی نمی‌کند (403 واقعی همچنان برمی‌گردد).
- «بستنِ مالیِ کامل» = `financial_status = credit_note_issued` **و** `valuation_status = valued` — که دومی بدون OD-01 ممکن نیست؛ بنابراین **«P4 complete» هرگز ادعا نمی‌شود**.
- `valuation_status` (`unresolved | valued | not_applicable | waived`) روی `return_request` ذخیره می‌شود (مهاجرت 0067) چون یک قضاوتِ ثبت‌شده است نه یک مشتق.

## ۴) یادداشت بستانکار — قرارداد

**مسیر:** `POST /returns/{id}/credit-note` — مجوز `sales.return.credit` (seed 0022 نقشِ `accountant` با الگوی `sales.return.*` شاملش می‌شود؛ مهاجرت 0067 مجوز را می‌افزاید و آن را صریحاً به نقش‌های `accountant`/`sales_manager`/`ceo` نگاشت می‌کند؛ این لازم است چون seed 0022 الگوها را در زمانِ اجرا بسط می‌دهد و `PermissionsGuard` مجوزِ صریح می‌خواند).

**پیش‌شرط‌ها (fail-closed):**
1. مرجوعی متعلق به همین شرکت باشد، وگرنه `404 not_found`.
2. `status = 'posted'` باشد، وگرنه `409 invalid_transition` (اجرای receive اجباری است).
3. `credit_note_id` خالی باشد، وگرنه `409 already_credited` (idempotency — حتی در رقابت؛ قفلِ ردیف + شرطیِ `update ... where credit_note_id is null`).
4. `invoice_id` داشته باشد، وگرنه `400 credit_requires_invoice`.
5. فاکتور در وضعیت `posted`، `partially_paid` یا `paid` باشد؛ پیش‌نویس/باطل رد می‌شود. اعتبارسنجیِ ثبت مرجوعی و صدور هر دو ردیف invoice را در همان تراکنش `FOR UPDATE` می‌گیرند.
6. همهٔ خطوطِ `qty_approved > 0` پیوندِ `invoice_line_id` داشته باشند، وگرنه `400 lines_missing_invoice_link`.
7. اعتبار بستانکار برای `scrap`، `damaged` و `return_to_supplier` تا تصویبِ OD-10 مسدود است؛ تلاش با `409 credit_disposition_unresolved` رد و در `audit_log` با actor، dispositions و دلیل ثبت می‌شود. هیچ سیاستِ تجاری برای این تکالیف فرض نشده است.

**محاسبه (منبع: `credit-note.ts` — خالص و واحد‌آزمون‌شده):**
```
remaining_qty    = invoice_line.qty − previously_credited_qty  (دقت چهار رقم)
remaining_amount = invoice_line.line_total − previously_credited_amount
partial amount   = round2(remaining_amount × qty_received / remaining_qty)
final amount     = remaining_amount  // تخصیص آخر تمام cents باقیمانده را مصرف می‌کند
tax_amount       = همان قاعده روی ماندهٔ tax_amount
unit_price       = invoice_line.unit_price  // فقط traceability
```

**سقف‌های سخت (fail-closed):**
- سقفِ هر خط: `already_credited_qty + requested ≤ invoice_line.qty` وگرنه `409 credit_exceeds_invoiced_qty`.
- سقفِ فاکتور: `Σ(خطوط این سند) + Σ(credit_noteهای posted قبلی) ≤ grand_total` وگرنه `409 credit_exceeds_invoice`؛ هیچ چیزی persist نمی‌شود.
- مقدار با دقت `numeric(19,4)` و پول با دقت ۲ رقم مستقل‌اند. ماندهٔ پول هر خط از credit noteهای posted قبلی کسر می‌شود؛ تخصیص آخر دقیقاً باقیمانده را مصرف می‌کند تا سه مرجوعی ۱/۳ از 100.00 به 100.00 برسند. سقف نهایی grand_total همچنان fail-closed است.

**تراکنش (یک tx):** قفل `return_request … for update` ← قفلِ فاکتور و خطوط آن (به ترتیبِ id، بدون بن‌بست) ← محاسبه ← درج `credit_note (reason_code='sales_return', status='posted')` با شمارهٔ سریالِ `credit_note` ← درج خطوط ← درج `customer_ledger_entry (credit)` ← اتصال شرطی `credit_note_id`. خطا در هر مرحله ⇒ rollback کامل.

**ارتباط با سندِ قبلی:** بستانکار با `invoice_id` و `credit_note_line.invoice_line_id` به فاکتور و خطوطش و با `return_request.credit_note_id` به مرجوعی وصل است — از هر سه سر قابل ردیابی است.

## ۵) پیوند مرجوعی ↔ فاکتور و سقف eligibility (بخش A این برش)

- ستونِ `return_request_line.invoice_line_id` (nullable؛ مهاجرت 0067) + ایندکس‌های eligibility/backorder-cap.
- در create: هر خطِ دارای `invoice_line_id` بررسی می‌شود: وجودِ خط، تعلق به همان فاکتور (`mixed_invoice`/`invoice_line_mismatch`)، تعلق فاکتور به همان مشتری (`invoice_customer_mismatch`)، برابری کالا (`line_product_mismatch`) و **سقفِ مقداری**: `qtyِ این درخواست + qty_approvedِ بستانکارشده/مرجوعی‌شدهٔ postedِ قبلی ≤ invoice_line.qty` ⇒ وگرنه `400 qty_exceeds_invoiced` با details کامل (`invoice_line_id, sold_qty, already_returned_qty, requested_qty`).
- مرجوعی‌های legacy بدونِ پیوند همچنان معتبرند (nullable) — رفتارِ موجود دست‌نخورده.
- double-line با همان `invoice_line_id` در یک درخواست به‌صورت تجمیعی چک می‌شود.

## ۶) ارزش‌گذاری — مقایسهٔ سیاست‌ها و توصیه (OD-01)

| گزینه | شرح | مزایا | معایب/پیش‌نیاز |
|---|---|---|---|
| الف) بهای خطِ فاکتورِ مبدأ | معکوس‌سازیِ COGS با بهای ثبت‌شدهٔ زمان فروش | تطابق کامل با معکوس‌سازیِ فروش؛ حسابرسی‌پذیر | مستلزمِ بازیابیِ بهای زمان فروش (cogs_entry/cost_layer) و سیاستِ تخصیص؛ در حال حاضر `cogs_entry` در receive نوشته نمی‌شود |
| **ب) میانگین متحرک در لحظهٔ دریافت** | `product_cost` موجود؛ پُستِ `sale_return_in` با بهای روزِ دریافت | بیشترین بازاستفاده از زیرساختِ تأییدشده؛ ساده؛ موجودی همیشه ارزش دفتری دارد | دقتِ تطابق با معکوس‌سازیِ COGS را تضمین نمی‌کند (بهای روز ≠ بهای زمان فروش) |
| ج) بازگرداندنِ لایهٔ هزینه (cost-layer restoration) | باز کردنِ لایهٔ مصرف‌شده هنگام فروش | دقیق‌ترین برای FIFO | پیچیده؛ نیاز به نگاشتِ لایه→خطِ فاکتور؛ تست‌های عمیق |
| د) fallbackِ controlled standard_cost | وقتی هیچ بهای دیگری نیست (با `valuation_status='waived'` و علامت) | جلوگیری از unit_cost=0 | نیازمندِ نگه‌داری standard_cost؛ ریسکِ بهای گمراه‌کننده اگر کنترل نشود |

**توصیه (اجرایی نمی‌شود):** گزینهٔ **(ب)** — پس از تصویبِ مالک، `fn_apply_stock_txn` برای `sale_return_in` بهای میانگین متحرک را می‌نویسد و `valuation_status` از `unresolved` به `valued` می‌رود؛ گزینهٔ (ج) مسیرِ بعدیِ مهاجرت است اگر مالک FIFO سخت می‌خواهد. **این سند هیچ‌کدام را فعال نمی‌کند.**

## ۷) migration 0067 (فقط افزودنی)

| آیتم | اثر |
|---|---|
| `return_request_line.invoice_line_id` (uuid, null, FK→invoice_line) | traceability + مبنای سقف‌ها؛ NULL برای legacy |
| `return_request.valuation_status` | text not null default `'unresolved'` + check (`unresolved/valued/not_applicable/waived`) |
| `ix_return_request_line_invoice_line` / `ix_credit_note_line_invoice_line` / `ix_credit_note_invoice_posted` | eligibility و سقف‌های سخت |
| `permission` + `role_permission`: `sales.return.credit` | accountant/sales_manager/ceo نگاشتِ صریح می‌گیرند (الگوی seed 0022 قبلاً بسط شده بود)؛ نقش‌های میدانی و sys_admin نمی‌گیرند؛ tenantهای جدید نیز CEO همهٔ مجوزها را می‌گیرد و نقش‌های دیگر از template کپی می‌شوند (0038/0056) |
| نمای `v_invoice_return_summary` (`security_invoker`) | `sold_qty / returned_qty / return_status (none/partial/full)` مشتق؛ گرانتِ `select` به dms_app/dms_readonly؛ بدون نوشتن روی سندِ posted |

down: حذف view/مجوز/ستون valuation_status/ایندکس‌ها/ستون invoice_line_id — **تست‌شده (up→down→re-up) روی PostgreSQL 16 (stubbed extensions)**: ✅.

## ۸) تغییرات API/قرارداد

- `ReturnRequest`: `invoice_id`، `valuation_status`، `financial_status`، `credit_note_id`، `credit_note` (خلاصه: doc_number/amount/status/issued_at — فقط پاسخ تکی)، `lines[].invoice_line_id` — همه در `openapi.yaml` مستند و `schema.ts` + `dist` بازتولید شد؛ **contract drift: ۳۳۶ مسیر = ۳۳۶ تطبیق**.
- `POST /returns/{id}/credit-note` (201 / 400 / 401 / 403 / 404 / 409) — idempotent؛ 409 `already_credited` حتی در رقابت.
- خطاها: همه با `code` پایدار + `message_fa` (قرارداد موجود)؛ `details` ماشین‌خوان.

## ۹) UI (وب — Persian-first RTL)

`apps/web/src/app/returns/page.tsx`:
- لیست: ستون‌های «وضعیت مالی» و «ارزش‌گذاری» اضافه شد؛
- فرم ساخت: `شناسه فاکتور مبدأ` (اختیاری) + برای هر قلم `invoice_line_id`؛
- پنل جزئیات: وضعیت مالی، وضعیت ارزش‌گذاری، فاکتور مبدأ، خلاصهٔ یادداشت بستانکار متصل؛
- دکمهٔ «صدور یادداشت بستانکار» فقط وقتی `status=posted` و یادداشتی متصل نیست؛ بدونِ مجوز (`useAuth().hasPermission('sales.return.credit')`) غیرفعال + توضیحِ فارسی؛ خطای 403 همان‌جا به فارسیِ روشن نگاشت می‌شود.

## ۱۰) شواهد تست

| مجموعه | نتیجه | محیط |
|---|---|---|
| `returns-financial.api.test.ts` | شمارِ پیش از remediation مربوط به commit قبلی است؛ شواهد آزمون‌های remediation باید پس از اجرا ثبت شود و اینجا PASS ادعا نمی‌شود. Regressionهای جدید: وضعیت فاکتور در create/issue، gate و audit تکلیف غیر-restock، دقت چهاررقمی، split reconciliation، و تخصیص تجمعی مانده |
| `returns.api.test.ts`, `returns-resolution.api.test.ts` (تست‌های موجود) | **۴۴/۴۴ PASS** | همان env (با patchِ موقتِ محلی؛ فایل‌های اصلی دست‌نخورده‌اند) |
| `credit-note.unit.test.ts` / `return-resolution.unit.test.ts` / `credit-policy.unit.test.ts` | **PASS** | DB-free |
| Web: typecheck + ۱۶۵ تست | **PASS** | node 22 |
| `tsc --noEmit` (api + web + api-client) | **CLEAN** | node 22 |
| `scripts/contract-drift.mjs` + `openapi:check` | **PASS (۳۳۶)** | static |
| Migration 0067 up → down → re-up | **PASS پیش از افزودنِ role_permission صریح**؛ پس از اصلاحِ grant، SQL قطعهٔ grant در تراکنشِ PostgreSQL با accountant/sales_manager/ceo مجاز و salesperson/courier/sys_admin بدون grant اجرا و assert شد؛ replay کاملِ migration نهایی محلی اجرا نشد | PG16 stub برای آزمون قبلی؛ PostgreSQL 16 درون‌تراکنشی برای SQL grant نهایی |
| Migration مسیرِ کامل 0001→0067 | **PASS پیش از اصلاحِ grant نقش‌ها**؛ full replayِ migration نهایی در این محیط اجرا نشد (PostGIS در pgserver محلی موجود نیست) | PG16 stub |
| **E2E مرورگری (Playwright)** | **UNVERIFIED** | پشتهٔ docker موجود در CI؛ محلی اجرا نشد |
| **Kotlin client** | **BLOCKED BY ENVIRONMENT** (آفلاین بودن دانلود jar) | — |

## اصلاحات امنیت و دقت TASK-GDMS-P4-FC-REMEDIATION-01

- مجوزهای role creation/update رد می‌کنند که `sys_admin` بگیرد `sales.return.credit` یا wildcard شامل‌کننده؛ محاسبهٔ permission مؤثر نیز برای کاربری که نقش `sys_admin` دارد، wildcard را به permissionهای معلوم باز می‌کند و کد بستانکار را حذف می‌کند، בלי کم‌کردن قابلیت‌های مدیریتیِ نامرتبط.
- مرجوعی‌ها فقط از فاکتورهای `posted`، `partially_paid` و `paid` ساخته و بستانکار می‌گیرند؛ هر دو گذار، وضعیت را زیر قفل ردیف invoice بررسی می‌کنند.
- Scrap/damaged/return_to_supplier credit gated تا OD-10، با audit-log evidence.
- مقادیر quantity با 4 decimals محاسبه می‌شوند؛ rounding پول بر مبنای مبلغ باقی‌ماندهٔ خط انجام و allocation نهایی باقیماندهٔ cents را مصرف می‌کند.
- `v_invoice_return_summary` هر خط مرجوعی را پیش از join تجمیع می‌کند تا sold_qty با تعداد درخواست‌ها ضرب نشود.

## ۱۱) ریسک‌ها و محدودیت‌ها

1. **ارزش دفتری صفر برای کالای برگشتی هنوز پابرجاست** (`unit_cost=0`) — تا OD-01. انحراف در `v_stock_valuation_variance` قابل‌مشاهده است.
2. **AR و GL موقتاً نامتقارن‌اند** (AR کاهش می‌یابد؛ GL بدون رخداد) — OD-07.
3. فاکتورهای «ناسازگارِ» تاریخی (Σline_total > grand_total؛ باگِ دوبل‌کسرِ تخفیف در مسیر مستقیمِ POST /invoices) کامل بستانکار نمی‌شوند — سقفِ grand_total fail-closed است؛ اصلاحِ خودِ باگ خارج از این برش و مستلزمِ OD-08/تصمیم.
4. مبلغِ بستانکار به `line_total`ِ فاکتور وابسته است؛ اگر فاکتورِ مبدأ خود اشتباهِ قیمت‌گذاری داشت، بستانکار هم همان را منعکس می‌کند (پذیرفته‌شدهٔ OD-05).
5. `closed` همچنان دستی/خارج از خودکار است (بستنِ نهایی گردشِ آینده).
6. مشتق‌بودنِ `financial_status` یعنی گزارش‌ها باید همان منطق را اعمال کنند؛ caching نشده.

## ۱۲) شکاف‌های باقی‌ماندهٔ P4 (دست‌نخورده)

- OD-01 valuation، OD-02 تأیید credit_note، OD-04 refund نقدی، OD-06 not_applicable برای scrap-only، OD-07 GL، OD-08 باگِ دوبل‌کسرِ تخفیف، OD-09 مسیرِ legacy — همه در `TASK-P4-FC_OWNER_DECISIONS.md`.
- F-06 backorder؛ H-05 وصولیِ محل؛ G-05 اعلان؛ E2E مرورگری؛ Kotlin client regen (پس از رفع آفلاین بودن)؛ تسویهٔ کمپین (E-06).
- بستانکارِ legacy بدون پیوند هرگز خودکار صادر نمی‌شود (OD-09).

## ۱۳) عدم‌ادعاها

- این برش «P4 complete» نیست و «P4 COMPLETION» را تحقق نمی‌بخشد.
- هیچ سیاستِ حسابداریِ مالک اجرایی نشده است.
- PR ادغام نشده؛ تاریخچهٔ repo بازنویسی نشده؛ PR #15 دست‌نخورده؛ تولید دست‌نخورده.
