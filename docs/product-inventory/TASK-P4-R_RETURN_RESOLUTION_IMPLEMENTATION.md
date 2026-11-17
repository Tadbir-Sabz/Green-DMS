# TASK-P4-R — تکمیلِ گردشِ resolution مرجوعی (F-04)

**وضعیت:** پیاده‌سازی و آزمونِ محلیِ unit تحویل شد؛ آزمون‌های مبتنی بر DB به CI (`integration-db`) سپرده شد؛ روی main ادغام نشده — PR اختصاصی **Draft**. هیچ merge، استقرار، تغییر دادهٔ تولیدی یا بازنویسیِ تاریخچه انجام نشد.

**مبنای دقیق:** `5e24ababe597a3cefe74071d182c5e2826d0d222` (merge commit PR #17 — تأییدشده: main جاری و P3 هم‌نیا است).

> **قرارداد فعلیِ receive (به‌روزِ 2026-11):** بخش‌های ۲ تا ۴ توصیفِ *تحویل اولیهٔ* TASK-P4-R است؛
> تمام اشارات «`422 rule_rejected` / `422 RuleRejected`» در آن‌ها **تاریخی و منسوخ**‌اند.
> قرارداد فعلی همان ضمیمهٔ «TASK-P4-R-HARDEN» در ادامهٔ همین فایل است: receive فقط
> `200/400/401/403/404/409` دارد؛ `qty` بیش از ثبت‌شده ⇒ `400 qty_exceeds_requested`؛
> قیدِ DB فقط بکاپ است ⇒ `400 check_violation`؛ قلم تکراری ⇒ `400 duplicate_line`؛
> پوشش ناقصِ خطوط ⇒ `400 incomplete_lines`؛ سایر کدهای پایدار در H-5.
>
> **تفکیک‌های ضروری:**
> - «دریافتِ جزئی در یک قلم» (مقدارِ دریافتی ≤ مقدارِ qty) مجاز است و سند `posted` می‌شود؛
>   «پوشش ناقصِ خطوطِ حل‌نشدهٔ مرجوعی» **رد** و هرگز `posted` نمی‌شود (`400 incomplete_lines`) — H-1/H-2.
> - `unit_cost = 0` در `sale_return_in` هنوز برقرار است: کمیت و ارزش دفتری دو مسیر جدا هستند و
>   `v_stock_valuation_variance` انحراف را نشان می‌دهد؛ بهای تمام‌شدهٔ مرجوعی **حل‌نشده** است
>   (Phase-5 cost-layer، تصمیمِ مالک) — H-3. این سند هرگز ادعای تکمیلِ حسابداریِ مرجوعی نمی‌کند.
> - این برش فقط **F-04 / Return-to-Resolution (receive)** است؛ باقیِ P4 (backorder/F-06، وصولیِ محل،
>   G-05، E2E مرورگری) و تصمیماتِ بازِ مالک (credit_note/بستانکاری، cost-layer، 200-vs-201) دست‌نخورده‌اند — بخش‌های ۵ و ۶.

---

## ۱) چرا این برش (دروازهٔ انتخاب)

توالیِ حاکم (`IMPLEMENTATION_SEQUENCE.md`) پس از ادغامِ P3، P4 را بعدی می‌داند: Order-to-Cash سخت + Return-to-Resolution. در میانِ اجزای P4، «resolution مرجوعی» کامل‌ترین و کم‌ریسک‌ترین برش بود چون:

- **نقص ثبت‌شدهٔ واقعی:** فلوِ مرجوعی پیش از این `receive` را فقط به گذار وضعیت `approved/partially_approved → posted` و ثبتِ `qty_approved/disposition` روی خطوط محدود می‌کرد؛ **هیچ `inventory_txn` ساخته نمی‌شد** و `stock_balance` هرگز تکان نمی‌خورد — یعنی کالای برگشتی از دفاتر انبار به‌کل ناپدید می‌شد. قرارداد OpenAPI با summary «تحویل کالا به انبار + تعیین تکلیف» این رفتار را وعده داده بود ولی پیاده نمی‌کرد.
- **بدون تصمیمِ مالکِ جدید:** هیچ مجوز تازه، هیچ جدول تازه، هیچ تغییر در معنای کسب‌وکارِ disposition (restock/damaged/scrap/return_to_supplier).
- **بازاستفاده از مکانیکیِ تأییدشده:** همان الگوی `inventory_txn + fn_apply_stock_txn` که در انبارگردانی/اصلاحیه/شمارش استفاده و در CI سبز است — نه پیاده‌سازیِ موازی.
- سایر اجزای P4 (F-06 backorder، H-05 تحویل‌به‌صندوق موبایل، G-05 مرکز اعلان) به برش‌های خودشان موکول می‌شوند؛ G-05 به‌دلایل حاکمیتی (کانال‌ها/ارائه‌دهنده نیازمندِ تصمیمِ مالک) عمداً در این برش نبود.

## ۲) رفتار تحویل‌شده (همه در **یک تراکنش** با گذار `posted`)

| disposition | اثر موجودی | مقصد |
|---|---|---|
| `restock` | `sale_return_in (+qty)` | مقصد صریحِ `warehouse_id` در بدنهٔ receive (اختیاری)؛ پیش‌فرض: انبارِ فعال `kind='main'` همان شعبه |
| `damaged` | `sale_return_in (+qty)` | انبارِ فعال `kind='quarantine'` و در نبودش `kind='damaged'` همان شعبه؛ **fail-closed**: نبودش ⇒ `409 quarantine_warehouse_missing` و هیچ‌چیز پُست نمی‌شود |
| `scrap` | بدونِ حرکت موجودی | فقط رکوردِ تکلیف روی خط (کالا هرگز وارد قفسه نمی‌شود) |
| `return_to_supplier` | بدونِ حرکت موجودی | فقط رکوردِ تکلیف روی خط |

قواعد:

- انبارِ صریح فقط برای `restock` اعمال می‌شود؛ کالای معیوب هرگز به انبارِ فروش/دپو رد نمی‌شود.
- انبارِ صریح باید مالِ **همان شعبهٔ سند** و فعال باشد؛ وگرنه `400 warehouse_not_found` یا `400 warehouse_inactive` — هیچ نوشتنی رخ نمی‌دهد.
- نبودِ انبارِ پیش‌فرض `main` ⇒ `409 restock_warehouse_missing`.
- هر خطا کل تراکنش را rollback می‌کند؛ وضعیت همچنان `approved` می‌ماند. **(تاریخچه — منسوخ:)** در تحویل اولیه، ردِ قیدِ `ck_return_line_approved` (وقتی `qty` دریافتی از `qty` ثبت‌شده بیشتر باشد) به `422 rule_rejected` نگاشت می‌شد؛ از TASK-P4-R-HARDEN به‌بعد، receive اول `400 qty_exceeds_requested` می‌دهد و `23514` فقط بکاپ است که `400 check_violation` نگاشت می‌شود — H-1.
- ضدِ تکرار: شرط وضعیت در `update` همان قبل است؛ double-receive ⇒ `409 invalid_transition` و فقط یک پُستينگ.
- `qty_approved <= qty` همچنان با قیدِ جدول اعزام می‌شود.
- واحد پولِ حرکت: `unit_cost = 0` (بهای خرید مرجوعی در این فاز ثبت نمی‌شود؛ هزینهٔ ناموجود بهتر از بهای جعلی است). هزینهٔ واقعی موضوعِ اتصالِ آینده به لایهٔ هزینه است.
- `inventory_txn.source_type='return_request'`، `source_id=<return id>`، `source_line_id=<خط>` — دفتر منبعِ حقیقت؛ مانده‌ها از همان مسیرِ مشترک `fn_apply_stock_txn` به‌روز می‌شوند.
- مجوز همچنان `sales.return.post` است؛ مجوز تازه‌ای اضافه نشد.

## ۳) فایل‌های تغییرکرده

| فایل | تغییر |
|---|---|
| `apps/api/src/modules/sales/return-resolution.ts` | **جدید** — برنامه‌ریزِ خالص `planReturnPostings` + `ResolutionPlanError` (کدهای پایدار `warehouse_not_found` / `warehouse_inactive` / `restock_warehouse_missing` / `quarantine_warehouse_missing`) |
| `apps/api/src/modules/sales/return.repository.ts` | `receive`: حلِ انبار داخلِ تراکنش؛ ثبتِ `inventory_txn` با `fn_apply_stock_txn` برای restock/damaged؛ rollback کامل در هر خطا |
| `apps/api/src/modules/sales/return.service.ts` | نگاشت `ResolutionPlanError` → 400/409 با `details`؛ `23514` در مسیر receive → `400 check_violation` (**تاریخچه — منسوخ:** ابتدا `422 rule_rejected` — H-1) |
| `apps/api/src/modules/sales/return.dto.ts` | `ReceiveReturnDto.warehouse_id?` (اختیاری، uuid) |
| `packages/contracts/openapi.yaml` | receive: `warehouse_id` اختیاری؛ پاسخ `422` حذف شد — receive فقط `400/401/403/404/409` (**تاریخچه — منسوخ:** ابتدا `422 RuleRejected` — H-1)؛ توضیح رفتار قرنطینه |
| `packages/api-client/src/schema.ts` | بازتولید از قرارداد (drift = 0؛ `npm run generate` دوباره اجرا و بدون diff) |
| `apps/api/test/return-resolution.unit.test.ts` | **جدید** — سناریوهای unit روی برنامه‌ریز خالص؛ با HARDEN افزوده شدند: ۱۴ سناریوی `assertReceiveEligibility` + چک تکراریِ پلننر — اکنون **۳۲ تست** |
| `apps/api/test/returns-resolution.api.test.ts` | **جدید** — سناریوهای API/DB (restock پیش‌فرض/صریح، damaged→قرنطینه، scrap/supplier، fail-closedهای B و C، batch، double-receive، 403/404 tenant؛ با HARDEN افزوده شدند: `duplicate_line`، پوشش ناقصِ خطوط `incomplete_lines`، `partially_approved`، دادهٔ خراب `duplicate_stored_lines`، `qty` جزئی، `qty_exceeds_requested`) — اکنون **۲۷ تست** |
| `apps/api/test/returns.api.test.ts` | fixture انبار main+quarantine اضافه شد؛ بلاک **تاریخچه — منسوخ:** ابتدا پوششِ «422 مستندشده» بود؛ اکنون همان رفتار اتمی با کدِ فعلی `400 qty_exceeds_requested` آزمایش می‌شود + `expectBodyMatchesSchema` برای پاسخ 400 (H-1) |
| `docs/product-inventory/MODULE_INVENTORY.md` | وضعیت F-04 به‌روز |
| `docs/product-inventory/IMPLEMENTATION_SEQUENCE.md` | یادداشت پیشرفت P4 |

**مهاجرت:** ندارد (عمداً). هیچ‌کدام از تغییرات schema لازم نداشت؛ `inventory_txn.txn_kind='sale_return_in'` از `0008` پشتیبانی می‌کند.

## ۴) راستی‌آزمایی

- محلی (بدون DB): tsc سبز (contracts/api-client/api) · unit **60 فایل / 984 passed / 1 skipped** (اعداد تحویل اولیه؛ با HARDEN به **999 passed / 1 skipped** رسید — H-4) · spec OK — 238 مسیر / 1348 پاسخ / 1335 schema compile · drift کلاینت صفر.
- **DB-backed (returns-resolution + returns.api) محلی اجرا نشدند** (اعداد تحویل اولیه) — بدون PostgreSQL محلی؛ داورِ DB = CI (`integration-db`) است. با HARDEN: بازتولید محلی با Postgres اختصاصی (stubِ صرفاً POSTGIS/EXCLUDE) انجام شد — returns-resolution ۲۷/۲۷، returns.api ۱۷/۱۷ — و CI روی headِ PR سبز است (H-4).

## ۵) شکاف‌های باقی‌مانده (تصمیمِ مالک / برش‌های بعدی)

1. اتصال `return_request` به **credit_note** و ردّ مالی/بستانکاری (الان `credit_note_id` فقط ساختاری است) — نیازمندِ مشخص‌کردنِ policy مالی.
2. بهای تمام‌شدهٔ مرجوعی (cost layer) — واحدِ `unit_cost` الان صفر ثبت می‌شود.
3. UI وب صفحهٔ دریافت (`/returns`) مقصدِ انبار را نمی‌پرسد؛ پیش‌فرضِ انبار main شعبه کار می‌کند؛ افزودنِ انتخابگر در صورت نیازِ عملیاتی.
4. سیاستِ «restock به انبار دیگر از همان شعبه» برای vehicle/transit عمداً باز گذاشته شده (هر انبار فعالِ شعبه صریحاً پذیرفته می‌شود).
5. باقیِ P4: یکپارچگیِ کاملِ اعتبار/موجودی/تأیید در ثبت (backorder/F-06)، تکمیلِ وصولیِ محل، G-05 مرکزِ اعلان (تصمیمِ مالک روی کانال‌ها)، E2E مرورگری (G-01).
6. EVIDENCE_INDEX.md به‌عمد لمس نشد (گیتِ ثبتِ شواهد با مالک است).

## ۶) تصمیماتِ مالک لازم

هیچ‌کدام برای این برش. (G-05 و اتصالِ credit_note در صورت انتخاب، نیازمندِ تصمیمِ مالک خواهند بود.)

---

# ضمیمه TASK-P4-R-HARDEN — سخت‌سازیِ برشِ receive (قبل از بازبینیِ مالک)

> این ضمیمه نتیجهٔ بررسیِ پیش‌از-بازبینی است؛ **جایگزین قطعیِ همهٔ اشارات «422» در بخش‌های ۲ تا ۴** است (آن‌ها صراحتاً تاریخی/منسوخ‌اند و فقط برای حفظ تاریخچه نگه‌داری می‌شوند).
> هیچ بازطراحیِ جریانِ مرجوعی انجام نشد؛ فقط یافته‌های verified اصلاح شدند.

## H-1) ریشه‌علت‌ها و اصلاحات

1. **قلم تکراری در ورودی ⇒ دو posting برای یک خط.** `planReturnPostings` روی آرایهٔ
   خطوط می‌چرخید و هر ردیف را پُست می‌کرد؛ سرویس هم `lines` را بدونِ چکِ تکرار رد می‌کرد.
   **اصلاح:** `findDuplicateIds` در هر دو لایه — سرویس (create ⇒ `400 duplicate_line`)
   و برنامه‌ریز خالص (دفاعی پنل: هرگز دو posting برای یک `product_id`).
   `assertReceiveEligibility` هم در مخزن (داخلِ تراکنش، پیش از هر نوشتن) تکراری بودنِ
   ورودی را `400 duplicate_line` رد می‌کند. دادهٔ ذخیره‌شدهٔ تکراری (دو ردیف یک کالا در
   `return_request_line`) ⇒ `409 duplicate_stored_lines` (fail-closed؛ مشکلِ داده است، نه کاربر).
2. **پوشش ناقصِ خطوط / «نصفهٔ» posted.** هیچ بررسی‌ای نبود که همهٔ خطوط قابلِ resolve در
   receive پوشش داده شوند؛ خط معتبر + خط جاافتاده ⇒ فقط خط معتبر پُست و سند posted می‌شد.
   **اصلاح:** «فعّال» = `qty_approved IS NULL` (چرخهٔ `partially_approved`). receive باید
   **همهٔ** خطوط فعّال را پوشش دهد؛ در غیرِ این صورت `400 incomplete_lines` با
   `details.missing_product_ids`. دریافتِ جزئی (partial shipment) **عمداً پشتیبانی نمی‌شود**
   — نه در مدل فعلی و نه در رودمپ؛ وضعیتِ جدیدی اختراع نشد.
   - قلم ارسالی ناموجود ⇒ `400 line_not_found`
   - قلم قبلاً حل‌شده در ورودی ⇒ `400 line_already_resolved`
   - همهٔ خطوط قبلاً حل شده ⇒ `409 nothing_to_receive`
   - ورودی خالی ⇒ `400 lines_required`
   - `qty <= 0` ⇒ `400 invalid_qty`؛ `qty > qty ثبت‌شده` ⇒ `400 qty_exceeds_requested`
     (با `details.requested`/`details.submitted`؛ قیدِ `ck_return_line_approved` فقط بکاپ است
     و `23514` اکنون `400 check_violation` نگاشت می‌شود — **نه** `422 rule_rejected`).
   - «یک خط ذخیره‌شده ⇒ حداکثر یک posting»: خط‌ها با `qty_approved is null` در UPDATE
     شرط می‌شوند؛ `rowCount ≠ 1` ⇒ کل تراکنش rollback می‌شود.
3. **اتمیک بودن حفظ شد و تقویت شد:** همهٔ بررسی‌ها داخلِ همان تراکنشند که سرخط را به
   `posted` می‌برد؛ هر رد ⇒ rollbackِ سرخط + خطوط + دفتر. double-receive همچنان
   `409 invalid_transition`. ردیف خط دقیقاً یک‌بار به‌روز می‌شود.
4. **قرارداد:** پاسخ `422` از receive حذف شد؛ receive فقط `400/401/403/404/409` دارد.
   کدهای جدید در توضیحاتِ Error مستند شدند (`details` اختیاری است؛ schema تغییری نکرد).
   کلاینت TS بازتولید شد؛ کلاینت Kotlin دستگاه/وضعیت‌کد نمی‌خواند (خطای ۴xx از راه exception
   با بدنهٔ `Error` مدیریت می‌شود) و از این تغییر اثرش صفر است.

## H-2) معنای `approved` و `partially_approved`

`approved` = همهٔ خطوط تأیید شده و هیچ‌کدام تعیین تکلیف (qty_approved) نشده‌اند.
`partially_approved` = وضعیتِ چرخهٔ نیمه‌حل‌شده در مدل وضعیت (از `0010`)؛ **هیچ مسیرِ
برنامه‌ای‌ای آن را تولید نمی‌کند** (receive همیشه posted و approve همیشه approved می‌سازد)؛
وجودش legacy/ground-model است و receive باید آن را درست بخواند: خطوط با
`qty_approved IS NULL` فعّال‌اند و باید همه پوشش داده شوند؛ خطوط حل‌شده دیگر قابلِ لمس نیستند.
رکوردِ receive روی partially_approved فقط باقیمانده‌ها را می‌بندد و سند را posted می‌کند.

## H-3) ارزش‌گذاری (unit_cost = 0) — یافتهٔ دقیق

- `fn_apply_stock_txn` فقط `qty_on_hand` را نگه می‌دارد؛ `qty_on_hand_value` و
  `product_cost (moving_avg)` و `cost_layer` **جداگانه و فقط در مسیرِ رسید خرید** به‌روز
  می‌شوند (`goods-receipt.repository.ts`). مسیر فروش (`sale_out`) هم value را به‌روز
  نمی‌کند؛ یعنی «کمیتِ موجودی» و «ارزش دفتری» از ابتدا دو مسیرِ جدا هستند و عارضهٔ
  فازی در این مخزن فقط برای purchase_in سیم‌کشی شده است.
- `sale_return_in` با `unit_cost=0` هیچ ارزش دفتری‌ای اضافه نمی‌کند ⇒ برای کالایی که
  `product_cost.method='moving_avg'` و `avg_cost>0` دارد، نمایِ `v_stock_valuation_variance
  (0016)` ردیف را **پرچم می‌زند** (همهٔ این ردیف‌ها حرکتِ هزینه‌نداشته را نشان می‌دهند) —
  این گزارش دارد همان کاری را می‌کند که باید: انحرافِ نامعلوم را نشان دهد.
- **این اصلاح، بهای جعلی اختراع نکرد.** واحدِ درستِ بها (بهای خطِ فاکتور مرجوعی؟ moving_avg
  لحظه؟ استاندارد؟) تصمیمِ سیاستِ حسابداری است؛ فرضِ آن بدونِ تصمیمِ مالک یعنی جعلِ سند.
  `unit_cost=0` بماند تا اتصالِ Phase-5 لایهٔ هزینه.
- **آنچه ۱۰۰٪ لازم است قبل از بستنِ دوره/گزارش سود-زیان:** یک مسیرِ ارزش برای
  `sale_return_in` (احتمالاً `value_document` با kind جدید مثلاً `return_value` + لایهٔ هزینه
  از روی خط فاکتور اصلی) — نیازمندِ تصمیمِ مالک و مهاجرت. تا آن زمان گزارش ارزش باز است.
- `scrap` و `return_to_supplier` اصلاً حرکتی نمی‌سازند ⇒ اثر ارزشی صفر دارند.

## H-4) متغیرهای تست (API/DB) — به CI وابسته است

بدونِ PostgreSQL محلی اجرا نشدند؛ داورِ نهایی jobِ `integration-db` است. محلی: typecheck،
unit (شامل suit جدید `assertReceiveEligibility`)، openapi:check، contract-drift همگی سبز.

## H-5) خطاهای موردِ انتظار پس از سخت‌سازی (برای تست‌ها)

| ورودی | کد | HTTP |
|---|---|---|
| lines خالی | `lines_required` | 400 |
| product_id تکراری در body | `duplicate_line` | 400 |
| product_id ناموجود در مرجوعی | `line_not_found` | 400 |
| پوشش ناقصِ خطوط فعّال | `incomplete_lines` (+missing_product_ids) | 400 |
| قلم قبلاً حل‌شده | `line_already_resolved` | 400 |
| هیچ خط فعّالی باقی نمانده | `nothing_to_receive` | 409 |
| تکرारी در دادهٔ ذخیره‌شده | `duplicate_stored_lines` | 409 |
| qty ≤ 0 | `invalid_qty` | 400 |
| qty > qty ثبت‌شده | `qty_exceeds_requested` | 400 |
| double-receive | `invalid_transition` | 409 |
