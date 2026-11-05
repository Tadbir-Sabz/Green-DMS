# گزارشِ پذیرشِ TASK-11 — تکمیلِ جداسازیِ چنداجاره‌ای، مالکیتِ ضمیمه و راستی‌آزماییِ تولید

**شاخه:** `arena/63ef2061-green-dms` · **PR #5:** باز (OPEN)، MERGEABLE، **ادغام/استقرار نشده**
**HEAD نهایی:** `db4dab5` · **SHA راستی‌آزمایی‌شده با CI:** `db4dab5` (همهٔ نتایجِ §۲ رویِ همین SHA)

> تفکیکِ خواسته‌شده در فازِ ۰: `0473639` آخرین کامیتِ **کد** در دورِ قبل بود؛ `99dbafd` و
> `3919fd7` فقط سند بودند (اجرایِ CI رویِ `99dbafd` به‌دلیلِ pushِ بعدی cancel شد). کارِ این دور
> رویِ `3919fd7` سوار شد: `0b673e3` → `a14d9e2` → `d799aca` → `db4dab5`. درختِ کار تمیز است،
> تغییرِ ردیابی‌نشده‌ای نمانده و شاخه با origin واگرایی ندارد.

---

## ۱) ماتریسِ پذیرش

| # | بند | حکم | شاهد |
|---|---|---|---|
| ۱ | جداسازیِ کاملِ اجاره در DB (جداولِ فرزند) | **PASS** | مهاجرت 0042 + ۶۰۳ تستِ DB سبز در CI؛ §۴ |
| ۲ | پارتیشن‌ها و پارتیشنِ پویا | **PASS** | §۵ — دسترسیِ مستقیمِ پارتیشن اثبات شد |
| ۳ | مالکیتِ ضمیمه | **PASS** (منطقِ مجوز) / **UNVERIFIED** (round-trip رویِ S3 واقعی) | §۶ |
| ۴ | پیکربندیِ زمانِ اجرایِ DB | **PASS** (نقش/RLS/استخر) · **UNVERIFIED** (کارگرِ پس‌زمینه) | §۷ |
| ۵ | یکپارچه‌سازیِ S3 و E2E | **BLOCKED** (زیرساخت) | §۸ |
| ۶ | رگرسیون و ایمنیِ مهاجرت | **PASS** | §۲ |
| ۷ | گزارشِ نهایی | **PASS** | همین سند |

---

## ۲) نتایجِ کاملِ CI رویِ `db4dab5`

| Workflow / Job | نتیجه | جزئیات |
|---|---|---|
| مهاجرت‌های پایگاه‌داده | ✅ **success** | up → down → up رویِ **۴۲ مهاجرت** (0042 برگشت‌پذیر است) |
| CI › Static checks | ✅ **success** | typecheck، openapi:check، contract-drift |
| CI › Unit tests (no DB) | ✅ **success** | **۱۵۵ تست / ۸ فایل** (پیش از این دور: ۱۳۶ / ۷) |
| CI › Integration (Postgres) | ✅ **success** | **۶۰۳ تست / ۲۶ فایل** — همه سبز، بدونِ skip |
| CI › Integration (MinIO) | ❌ **failure = BLOCKED** | گامِ کاوشِ S3؛ هیچ نامزدی round-trip را پاس نکرد |
| e2e (Playwright) | ❌ **failure = BLOCKED** | گیتِ MinIO ⇒ **۰ تستِ مرورگر اجرا شد** (مجموعه: ۱۰ تست / ۲ فایل) |

در دورِ میانی (`0b673e3`) نتیجه `4 failed | 599 passed` بود؛ هر چهار شکست **نقصِ خودِ تست** بود
(کاتالوگ از دیتابیسِ maintenance پرسیده شد نه دیتابیسِ یکبارمصرف؛ و `pg_policy` ستونِ `qual`
ندارد — ستونِ رندرشده در viewِ `pg_policies` است) و در `a14d9e2`/`db4dab5` رفع شد. هیچ تستی
حذف، skip یا سست نشد.

---

## ۳) کامیت‌هایِ این دور

| SHA | محتوا |
|---|---|
| `0b673e3` | مهاجرت 0042 (RLS زنجیرهٔ والد + پارتیشن‌ها)، ماژولِ `owner-scope.ts` و اعمالِ آن در سرویس/ریپوزیتوریِ ضمیمه، بازنویسیِ کاوشِ S3 در CI، ۱۹ تستِ جدیدِ مالکیت، رشدِ `db-privileges` از ۲۷ به ۴۲ تست |
| `a14d9e2` | رفعِ ۴ نقصِ تستِ کاتالوگ (استخرِ درست + `pg_policies`) |
| `d799aca` | تلاشِ مجددِ round-trip، نامِ درستِ `chrislusf/seaweedfs`، region در کلاینتِ کاوش |
| `db4dab5` | الگویِ regex برایِ رندرِ واجدِ شرایطِ ruleutils + شفاف‌سازیِ شاهدِ کاوشِ S3 |

فایل‌هایِ کلیدی: `migrations/0042_tenant_parent_chain.{up,down}.sql`،
`apps/api/src/modules/attachments/owner-scope.ts`، `attachments.service.ts`،
`attachments.repository.ts`، `apps/api/test/attachment-owner-scope.test.ts`،
`apps/api/test/db-privileges.api.test.ts`، `.github/workflows/{ci,e2e}.yml`.

---

## ۴) فازِ ۱ — پوششِ جداولِ فرزند با مسیرِ مالکیتِ راستی‌آزمایی‌شده

**وضعیتِ پیش از 0042:** ۱۵۲ جدول، ۷۰ جدولِ دارایِ ستونِ اجاره زیرِ RLS (از 0041)، و
**۸۰ جدولِ فرزند/سطری بدونِ هیچ سیاستی** ⇒ یک اجاره می‌توانست سطرِ فرزندِ اجارهٔ دیگر را
مستقیم بخواند/بنویسد (مثلِ `invoice_line` یا `pod`).

**الگویِ پیاده‌شده:** سیاستِ هر فرزند «دیده‌شدنِ والد» را می‌سنجد، نه ستونِ اجاره را:

```sql
create policy p_delivery_line_tenant on delivery_line for all
  using      (exists (select 1 from delivery pp where pp.id = delivery_id))
  with check (exists (select 1 from delivery pp where pp.id = delivery_id));
```

چون والد خودش سیاستِ 0041 را دارد و عبارتِ سیاست زیرِ RLSِ نقشِ پرس‌وجوکننده اجرا می‌شود،
جداسازی **گذرا** به ارث می‌رسد. این الگو جداولِ دوپرشی را هم بدونِ سخت‌کدکردنِ مسیرِ کامل پوشش
می‌دهد: `approval_decision → approval_request → approval_chain`،
`geofence_event → field_session → staff`، `bank_statement_line → bank_statement → bank_account`،
`tour_settlement_line → tour_settlement → tour`.

**۶۸ جدولِ فرزند** سیاست گرفتند؛ فهرست از گرافِ کلیدِ خارجیِ واقعیِ مهاجرت‌ها استخراج شد (نه
حدس): همهٔ `*_line`ها (`invoice_line`, `sales_order_line`, `purchase_order_line`,
`delivery_line`, `goods_receipt_line`, `journal_line`, `stock_adjustment_line`,
`stock_count_line`, `stock_transfer_line`, `waybill_line`, `vehicle_load_line`,
`value_document_line`, `supplier_invoice_line`, `credit_note_line`, `customer_request_line`,
`purchase_request_line`, `return_request_line`, `bank_statement_line`, `petty_cash_line`,
`commission_line`, `approval_step_def`, `tour_settlement_line`)، به‌علاوهٔ `pod`, `route_plan`,
`route_plan_stop`, `tour_stop`, `visit`, `stock_balance`, `stock_reservation`,
`stock_valuation`, `reorder_policy`, `batch`, `cost_layer`, `product_cost`,
`product_packaging`, `customer_price`, `standard_cost_history`, `cogs_entry`,
`number_counter`, `receipt_allocation`, `payment_allocation`, `invoice_match`,
`moadian_submission`, `collection_action`, `customer_credit`, `container_loan`,
`cheque_event`, `cash_session`, `cash_txn`, `webhook_delivery`, `person_address`,
`person_phone`, `rule_action`, `rule_condition`, `rule_scope`, `gl_dimension_value`,
`region`, `route`, `staff_area`, `route_salesperson`, `field_session`, `geofence_event`,
`approval_request`, `approval_decision`, `commission_tier`, `price_list_item`,
`bank_statement`, `tour_settlement`.

**اثباتِ «مسیرِ راستی‌آزمایی‌شده» (اجراشده، نه بازرسیِ ایستا):** تستی نامِ والد را از متنِ
رندرشدهٔ هر سیاست بیرون می‌کشد و با `pg_constraint` مقایسه می‌کند؛ خروجی: **≥۶۷ سطر و صفر موردِ
تأییدنشده** ⇒ هر سیاستِ زنجیرهٔ والد به جدولی اشاره می‌کند که کلیدِ خارجیِ *اعلام‌شدهٔ* همان
جدول است.

**استثناها — عمداً، با دلیل (نه برایِ بالا بردنِ شمارِ پوشش):**

| جدول | چرا سیاست نگرفت |
|---|---|
| `app_user`, `auth_session`, `user_scope`, `user_role`, `role_permission` | خوشهٔ هویتِ **پیش‌اجاره**: پیش از `set` شدنِ `app.company_id` در ورودِ کارمند خوانده می‌شوند ⇒ سیاستِ زنجیرهٔ والد ورود را می‌شکست. راهِ درست همان الگویِ پرتال است: تابعِ `SECURITY DEFINER` با `search_path` پین‌شده. **کارِ باقی‌ماندهٔ صریح.** |
| `permission`, `feature_flag`, `uom`, `payment_method`, `auth_otp` | دادهٔ مرجعِ **سراسری** بدونِ مالکِ اجاره ⇒ باید برایِ همه خواندنی بماند (الزامِ «حفظِ رکوردهایِ سراسریِ مشروع») |
| `attachment`, `setting`, `portal_user`, `portal_session`, `onboarding_attempt` | از پیش در 0041 با استثناهایِ مستند پوشش گرفته‌اند |

**رفتارِ اثبات‌شده زیرِ نقشِ واقعیِ زمانِ اجرا (`dms_app`، غیرابرکاربر، غیر`BYPASSRLS`):**

| سناریو | نتیجه |
|---|---|
| A سطرِ فرزندِ B را می‌خواند | صفر ردیف |
| A سطرِ فرزندِ B را `UPDATE`/`DELETE` می‌کند | `rowCount = 0` و دادهٔ B دست‌نخورده (با استخرِ مالک بازبینی شد) |
| A سطرِ فرزند زیرِ والدِ B درج می‌کند | `42501` |
| A سطرِ فرزند برایِ والدِ خودش درج می‌کند | مجاز (کمینه‌امتیاز، نه انسدادِ کامل) |
| زمینهٔ اجاره ست نشده | صفر ردیف (fail-closedِ **گذرا** از والد) |
| زمینهٔ نامعتبر (غیر UUID) | صفر ردیف |

پوششِ کاتالوگ: **≥۱۳۹ رابطهٔ عمومی با `relrowsecurity` + `relforcerowsecurity` + سیاست**.

---

## ۵) فازِ ۱ — پارتیشن‌ها (دورزدنِ جداسازی با دسترسیِ مستقیم)

**خطرِ واقعی:** در PostgreSQL سیاستِ جدولِ پارتیشن‌شده فقط وقتی از راهِ والد پرس‌وجو شود اعمال
می‌شود؛ `select * from audit_log_2026_11` سیاستِ والد را **دور می‌زند** مگر رویِ خودِ پارتیشن هم
RLS فعال و همان سیاست تعریف شده باشد.

**اقدام:** (۱) سه والدِ پارتیشن‌شده سیاست گرفتند — `audit_log` با قاعدهٔ «`company_id` تهی =
رویدادِ سراسریِ پیش‌اجاره: خواندنی، ولی هرگز نوشتنِ company_idِ اجارهٔ دیگر»؛ `inventory_txn` از
راهِ `branch_id → branch.company_id` (همان الگویِ `invoice` در 0041)؛ `location_sample` از راهِ
`staff_id → staff` (کلیدِ خارجیِ اعلام‌نشده ولی معنایی — همان ستونی که `field_session.staff_id`
به `staff.id` می‌دهد — مستند شد). (۲) همهٔ پارتیشن‌هایِ **موجود** با بلوکِ `DO` رویِ
`pg_inherits` retrofit شدند. (۳) `fn_ensure_partitions` جایگزین شد تا هر پارتیشنِ ماهانهٔ
**تازه** در لحظهٔ ساخت RLS + FORCE + سیاستِ والد را بگیرد (امضا و منطقِ بازهٔ زمانی بدونِ تغییر).

**شاهدِ اجراشده:** خواندنِ مستقیمِ `audit_log_<ماه جاری>` زیرِ نقشِ برنامه ⇒ اجارهٔ A فقط سطرِ
خودش + سطرهایِ سراسریِ NULL را می‌بیند و سطرِ B را نمی‌بیند (و برعکس)؛ بدونِ زمینهٔ اجاره فقط
سطرهایِ NULL؛ درجِ ممیزی با `company_id` اجارهٔ دیگر ⇒ `42501` و درجِ سراسریِ NULL مجاز. پس از
`select fn_ensure_partitions(6)`، **همهٔ** پارتیشن‌هایِ سه والد (شاملِ تازه‌ساخت‌ها)
`relrowsecurity = relforcerowsecurity = true` و سیاست دارند.

---

## ۶) فازِ ۲ — مالکیتِ ضمیمه (رفعِ شکافِ معوقِ دورِ قبل)

`attachment` فقط `company_id` دارد و `owner_id` یک UUIDِ آزاد است ⇒ فیلترِ شرکت به‌تنهایی ثابت
نمی‌کند موجودیتِ مالک به همان شرکت تعلق دارد. ماژولِ جدیدِ `owner-scope.ts` مالکیت را از راهِ
زنجیرهٔ والد در خودِ DB اثبات می‌کند.

**نگاشتِ نهایی — مشتق از قراردادِ برنامه و روابطِ واقعیِ پایگاه‌داده:**

| `owner_type` (enumِ openapi) | مسیرِ راستی‌آزمایی‌شده |
|---|---|
| `invoice` | `invoice.branch_id` (NOT NULL) → `branch.company_id` |
| `sales_order` | `sales_order.branch_id` (NOT NULL) → `branch.company_id` |
| `return_request` | `return_request.branch_id` (NOT NULL) → `branch.company_id` |
| `stock_count` | `stock_count.branch_id` (NOT NULL) → `branch.company_id` |
| `product` | `product.company_id` (NOT NULL) |
| `journal_entry` | `journal_entry.company_id` (NOT NULL؛ `branch_id` در این جدول nullable است) |
| `pod` | `pod.delivery_id` (NOT NULL UNIQUE) → `delivery.branch_id` → `branch.company_id` |
| `receipt` | **`payment_receipt.branch_id` → `branch.company_id`** |
| `other` | هیچ موجودیتِ کسب‌وکاری ندارد ⇒ **fail-closed** (۴۰۳) مگر opt-inِ صریحِ اپراتور |

**رفعِ ابهامِ `receipt` با شاهد، نه اختراع:** تنها کلیدِ خارجیِ ورودی که نامِ receipt دارد
`receipt_allocation.receipt_id references payment_receipt(id)` است؛ `goods_receipt` سندِ رسیدِ
انبارِ خرید (GRN) است، `client_sync_receipt` تأییدیهٔ همگام‌سازیِ آفلاین است و
`receipt_allocation` خودش «رسید» نیست بلکه سطرِ تخصیصِ آن است ⇒ `receipt = payment_receipt`.
هیچ گردشِ کاریِ POD تغییر نکرد: `pod` از راهِ `delivery` حل می‌شود و مسیرِ موفقِ آپلود/فهرست/URL
در تست‌ها سبز است.

**سه نقطهٔ کنترل (همه fail-closed):**
1. **آپلود** — اثباتِ مالکیت **پیش از** `storage.put` ⇒ حملهٔ ردشده حتی زبالهٔ اورفان در bucket
   نمی‌گذارد (با `invocationCallOrder` در تست اثبات شد).
2. **فهرستِ owner** — اثباتِ مالکیت **پیش از** `listByOwner` ⇒ `owner_id` حدس‌زده نه ضمیمه‌ای
   برمی‌گرداند و نه وجودِ موجودیت را لو می‌دهد.
3. **URL دانلود/پیش‌نمایش** — حتی وقتی `company_id`ِ خودِ سطرِ ضمیمه می‌خواند، زنجیرهٔ مالکیت
   **دوباره** سنجیده می‌شود ⇒ دسترسیِ غیرمستقیم با شناسهٔ ضمیمهٔ حدس‌زده بسته است و هیچ URL
   امضاشده‌ای نشت نمی‌کند.

مالکِ بیگانه ⇒ **۴۰۴** (`owner_not_found`) نه ۴۰۳، تا «وجود ندارد» و «مالِ تو نیست» از بیرون
قابلِ تشخیص نباشند؛ مالکِ موجود ولی متعلق به اجارهٔ دیگر ⇒ **۴۰۳** (`owner_scope_denied`)؛
نوعِ راستی‌آزمایی‌ناپذیر ⇒ **۴۰۳** (`owner_scope_unverifiable`). هر سه کد در وضعیت‌هایِ
از پیش مستندِ ۴۰۳/۴۰۴ِ همان مسیرها می‌نشینند ⇒ **قراردادِ openapi و کلاینتِ تولیدی تغییری
نکردند** (openapi:check و contract-drift سبز).

**تست‌ها:** ۱۹ تستِ DB-free در `attachment-owner-scope.test.ts` — نگاشتِ هر نوعِ مالک، رسیدنِ
`pod` از راهِ delivery و `receipt` به `payment_receipt` (و نه سه نامزدِ دیگر)، نبودِ درون‌یابیِ
ورودیِ کاربر در SQL (`owner_id` همیشه `$1::uuid` بایند است و تابع فقط یک پارامتر دارد)،
`__proto__`/رشتهٔ خالی ⇒ راستی‌آزمایی‌ناپذیر، پیش‌فرضِ fail-closed برایِ `other` (و فقط مقدارِ
دقیقِ `true` بازش می‌کند)، ۴۰۳/۴۰۴ در هر سه نقطهٔ کنترل، نبودِ هر نوشتن در استوریج/DB هنگامِ رد،
و مسیرِ سالمِ دانلود/فهرست.

---

## ۷) فازِ ۳ — هویتِ پایگاه‌داده در زمانِ اجرا

| ادعا | شاهد |
|---|---|
| مهاجرت‌ها با هویتِ مهاجرت اجرا می‌شوند | `scripts/migrate.mjs` و jobِ مهاجرت‌ها از `DATABASE_URL`؛ برنامه از `APP_DATABASE_URL ?? DATABASE_URL` (0041) ⇒ تفکیک، افزودنی و بدونِ شکستنِ مسیرِ فعلی |
| پرس‌وجوهایِ برنامه با `dms_app` | هر ۴۲ تستِ `db-privileges` با اتصالِ واقعیِ `dms_app` رویِ دیتابیسِ یکبارمصرف (رمزِ تصادفیِ یکبارمصرف، هرگز در مخزن؛ در پایان `NOLOGIN` بازمی‌گردد) |
| برنامه نمی‌تواند RLS را دور بزند | `dms_app`: `nosuperuser`, `nobypassrls`, `nocreatedb`, `nocreaterole`؛ **مالکِ صفر جدول** در `public`؛ `FORCE ROW LEVEL SECURITY` رویِ همهٔ جداولِ هدف |
| نشتِ زمینهٔ اجاره از استخر | هر سناریو با `pg.Client` **اختصاصیِ غیراجتماعی** اجرا و بسته می‌شود (`set_config(...,false)` نشست‌محور است) ⇒ نشتِ GUC بینِ سناریوها ممکن نیست |
| نبودِ زمینهٔ اجاره ⇒ fail-closed | `fn_current_company_id()` وقتی `app.company_id` ست نباشد **یا** UUID نباشد `null` می‌دهد (بدونِ پرتابِ خطا) ⇒ صفر ردیف و ردِ نوشتن؛ در 0042 این رفتارِ گذرا به جداولِ فرزند هم رسید |
| توابعِ ممتاز قابلِ سوءاستفاده نیستند | `fn_portal_find_login`: یک پارامتر (بدونِ company_id)، `SECURITY DEFINER`، `search_path=public,pg_temp` پین‌شده، `REVOKE ALL FROM PUBLIC`، `EXECUTE` فقط برایِ `dms_app`، حداکثر یک سطر با کمینهٔ ستون‌ها؛ `dms_readonly` نمی‌تواند صدایش بزند |

**صادقانه — راستی‌آزمایی‌نشده:** زمینهٔ اجاره برایِ **کارگرِ پس‌زمینه و jobهایِ زمان‌بندی‌شده**.
پیاده‌سازی نشده: هیچ صف/زمان‌بندیِ فعالی در مخزن `app.company_id` را ست نمی‌کند، بنابراین کارِ
پس‌زمینه‌ای که با `dms_app` اجرا شود امروز **صفر ردیف** می‌بیند (fail-closed ⇒ نشتِ داده ندارد،
ولی کار هم انجام نمی‌دهد). راهِ درست: ست‌کردنِ صریحِ زمینه در ابتدای هر job یا صفِ اجاره‌محور.
این **کارِ باقی‌ماندهٔ صریح** است، نه PASS.

---

## ۸) فازِ ۴ — یکپارچه‌سازیِ S3 و E2E: **BLOCKED** (بدونِ سست‌کردنِ گیت)

کاوشِ CI اکنون «فهرستِ نامزد» است و انتخاب فقط با **round-trip واقعیِ S3** انجام می‌شود
(`makeBucket`, `putObject`, `statObject`, `presignedGetObject` که واقعاً با HTTP واکشی و محتوا
مقایسه می‌شود، `removeObject`) با **همان کلاینتِ `minio`** که `StorageService` استفاده می‌کند —
چون pull شدنِ تصویر به‌تنهایی معنایِ سازگاریِ S3 ندارد. همهٔ تگ‌ها پین‌شده‌اند (هرگز `latest`).

**شاهدِ اجراشده از خودِ رانرها:**

| نامزد | نتیجه |
|---|---|
| `minio/minio:latest` | `pull access denied` — در حالی که `postgis/postgis:16-3.4` و `redis:7-alpine` در **همان job** بی‌مشکل pull می‌شوند ⇒ مسئله دسترسیِ همان repository است، نه rate limit و نه تگِ بد |
| `quay.io/minio/minio:latest` و `:RELEASE.2024-01-16T16-07-38Z` | `401 UNAUTHORIZED` / `unexpected status from HEAD` |
| `localstack/localstack:3.9` | `not found` |
| `seaweedfs/seaweedfs:3.76` | `pull access denied, repository does not exist` ⇒ نامِ درست `chrislusf/seaweedfs` است و در `d799aca` جایگزین شد |
| **`adobe/s3mock:3.9.1`** | **pull شد و بالا آمد** (`pull_rc=0`، JVM راه افتاد) ولی نقطهٔ S3 با `health_http=000` و `socket hang up` در **۱۲ تلاشِ متوالی (~۶۰ ثانیه)** پاسخِ درست نداد ⇒ round-trip رد شد |

**نتیجه:** هیچ نامزدی معیارِ «pull + start + round-trip واقعی» را پاس نکرد ⇒ گام با تشخیصِ کاملِ
`BLOCKED-s3-unavailable` خارج می‌شود، تست‌هایِ ضمیمه **اجرا نشدند و skip هم نشدند**، و گیتِ `e2e`
پشتهٔ compose را بالا نیاورد ⇒ **۰ تستِ Playwright اجرا شد** (مجموعهٔ موجود: ۱۰ تست در ۲ فایل).
ساختِ موفقِ تصویر هرگز به‌عنوانِ PASSِ E2E گزارش نشده است.

**رفعِ یک ابهامِ مهم برایِ گامِ بعد:** برخلافِ جمع‌بندیِ دورِ قبل، Docker Hub از رانر **در دسترس
است** (دو تصویرِ دیگرِ همان job از آنجا pull می‌شوند). مانعِ باقی‌مانده دقیقاً دو چیز است:
(۱) repository خودِ MinIO دیگر عمومی نیست ⇒ یا یک اعتبارنامهٔ رجیستری به‌صورتِ secret مجاز شود،
یا (۲) یکی از جایگزین‌هایِ S3-سازگار تصویب شود. نزدیک‌ترین نامزد `adobe/s3mock:3.9.1` است که
pull و start می‌شود؛ برایِ عبور باید دلیلِ `socket hang up` تعیین شود (پورت/پروتکلِ واقعیِ S3Mock
در این نسخه، یا نیاز به HTTPS رویِ 9191) که یک چرخهٔ تشخیصیِ دیگر با لاگِ کاملِ container می‌خواهد.
برایِ e2e همچنین `docker-compose.yml` باید فرمانِ اجرایِ سرویسِ S3 را پارامتری کند، چون امروز
فقط فرمانِ `minio server` را می‌شناسد.

---

## ۹) ریسک‌هایِ باقی‌مانده و پیش‌نیازهایِ استقرار

**ریسک/کارِ باقی‌مانده (صریح):**
1. **خوشهٔ هویتِ پیش‌اجاره** (`app_user`, `auth_session`, `user_scope`, `user_role`,
   `role_permission`) بدونِ RLS است — عمداً، چون ورودِ کارمند پیش از زمینهٔ اجاره می‌خواندشان.
   راهِ درست: تابعِ `SECURITY DEFINER` مانندِ `fn_portal_find_login`. امروز این جداول فقط با
   فیلترِ لایهٔ برنامه محدود می‌شوند، نه با DB.
2. **زمینهٔ اجاره در کارگرِ پس‌زمینه/زمان‌بندی** ست نمی‌شود ⇒ fail-closed (صفر ردیف).
3. **`location_sample.staff_id`** کلیدِ خارجیِ اعلام‌نشده است؛ سیاست بر پایهٔ رابطهٔ معناییِ
   مستند نوشته شد. افزودنِ FKِ واقعی این اطمینان را قطعی می‌کند.
4. **شمارندهٔ نرخِ استقرار درون‌فرآیندی** است ⇒ سقفِ مؤثر ≈ حد × تعدادِ replica (اشتراکِ Redis
   عمداً بیرونِ دامنهٔ این دور ماند).
5. **مالکیتِ اشیاء** به `dms_owner` منتقل نشد: `REASSIGN OWNED` در مهاجرت اجرا نشد چون
   بازگشت‌پذیرِ ایمن نیست؛ تفکیکِ نقش‌ها کامل است (نقشِ برنامه مالکِ هیچ جدولی نیست) ولی مالکِ
   جداول همان هویتِ سازندهٔ مهاجرت است.
6. **`pod.delivery_id` یکتاست** (`unique`) ⇒ هر delivery یک POD دارد؛ نگاشتِ مالکیت همین را فرض
   می‌کند.

**پیش‌نیازهایِ استقرار (این کار هیچ اعتبارنامه/پیکربندیِ تولیدی را تغییر نداد):**
- چهار نقشِ `dms_owner/dms_migrator/dms_app/dms_readonly` در 0041 به‌صورتِ `NOLOGIN` ساخته
  می‌شوند؛ در استقرار باید `LOGIN` + رمزِ واقعی (خارج از مخزن) بگیرند و `APP_DATABASE_URL` با
  `dms_app` تنظیم شود. تا وقتی `APP_DATABASE_URL` ست نشود برنامه با `DATABASE_URL` کار می‌کند ⇒
  **RLS عملاً فعال نمی‌شود** (رفتارِ افزودنیِ عمدی برایِ سازگاری).
- اجرایِ `fn_ensure_partitions` با cron ماهانه از این پس پارتیشن‌ها را هم سخت می‌کند.
- یک سرویسِ S3-سازگارِ قابلِ pull (یا اعتبارنامهٔ رجیستری) پیش‌نیازِ round-tripِ ضمیمه و بالا
  آمدنِ پشتهٔ compose برایِ E2E است.

---

## ۱۰) تفکیکِ «شاهدِ اجرایِ واقعی» از «بازرسیِ ایستا»

| ادعا | نوعِ شاهد |
|---|---|
| جداسازیِ جداولِ فرزند، fail-closed، ردِ نوشتنِ بین‌اجاره‌ای | **اجراشده** زیرِ نقشِ واقعیِ `dms_app` رویِ Postgres واقعی در CI |
| پارتیشنِ مستقیم/آینده | **اجراشده** (خواندنِ مستقیمِ پارتیشنِ ماهِ جاری + `fn_ensure_partitions(6)`) |
| مسیرِ مالکیتِ هر سیاست = کلیدِ خارجیِ اعلام‌شده | **اجراشده** از کاتالوگِ زنده (`pg_policies` ⋈ `pg_constraint`) |
| نقشِ برنامه: غیرابرکاربر/غیر`BYPASSRLS`/مالکِ صفر جدول | **اجراشده** از `pg_roles`/`pg_class` |
| مالکیتِ ضمیمه (منطقِ مجوز، ۴۰۳/۴۰۴، نبودِ نوشتنِ اورفان) | **اجراشده** به‌صورتِ تستِ واحد با ریپوزیتوری/استوریجِ ماک — round-trip رویِ S3 واقعی **BLOCKED** |
| اعتبارسنجیِ محتوایِ فایل، سقفِ TSP، دقتِ مالیِ BI | **اجراشده** (۱۵۵ تستِ DB-free سبز در CI) |
| برگشت‌پذیریِ مهاجرت‌ها (۴۲ جفت) | **اجراشده** up→down→up در CI |
| E2E مرورگری | **اجرا نشده** — ۰ تست (گیتِ زیرساخت) |
