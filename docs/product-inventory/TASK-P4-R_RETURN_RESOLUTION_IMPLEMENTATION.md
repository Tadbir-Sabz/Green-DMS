# TASK-P4-R — تکمیلِ گردشِ resolution مرجوعی (F-04)

**وضعیت:** پیاده‌سازی و آزمونِ محلیِ unit تحویل شد؛ آزمون‌های مبتنی بر DB به CI (`integration-db`) سپرده شد؛ روی main ادغام نشده — PR اختصاصی **Draft**. هیچ merge، استقرار، تغییر دادهٔ تولیدی یا بازنویسیِ تاریخچه انجام نشد.

**مبنای دقیق:** `5e24ababe597a3cefe74071d182c5e2826d0d222` (merge commit PR #17 — تأییدشده: main جاری و P3 هم‌نیا است).

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
- هر خطا (از جمله ردِ قیدِ `ck_return_line_approved` وقتی `qty` دریافتی از `qty` ثبت‌شده بیشتر باشد ⇒ `422 rule_rejected`) کل تراکنش را rollback می‌کند؛ وضعیت همچنان `approved` می‌ماند.
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
| `apps/api/src/modules/sales/return.service.ts` | نگاشت `ResolutionPlanError` → 400/409؛ `23514` در مسیر receive → `422 rule_rejected` |
| `apps/api/src/modules/sales/return.dto.ts` | `ReceiveReturnDto.warehouse_id?` (اختیاری، uuid) |
| `packages/contracts/openapi.yaml` | receive: `warehouse_id` اختیاری + پاسخ `422 RuleRejected`؛ توضیح رفتار قرنطینه |
| `packages/api-client/src/schema.ts` | بازتولید از قرارداد (drift = 0؛ `npm run generate` دوباره اجرا و بدون diff) |
| `apps/api/test/return-resolution.unit.test.ts` | **جدید** — ۱۷ سناریوی unit روی برنامه‌ریز خالص |
| `apps/api/test/returns-resolution.api.test.ts` | **جدید** — ۱۷ تستِ API/DB (restock پیش‌فرض/صریح، damaged→قرنطینه، scrap/supplier، fail-closedهای B و C، batch، double-receive، 422، 403/404 tenant) |
| `apps/api/test/returns.api.test.ts` | fixture انبار main+quarantine اضافه شد؛ بلاک جدید `422 rule_rejected` (پوشش خطای مستندشدهٔ 422) |
| `docs/product-inventory/MODULE_INVENTORY.md` | وضعیت F-04 به‌روز |
| `docs/product-inventory/IMPLEMENTATION_SEQUENCE.md` | یادداشت پیشرفت P4 |

**مهاجرت:** ندارد (عمداً). هیچ‌کدام از تغییرات schema لازم نداشت؛ `inventory_txn.txn_kind='sale_return_in'` از `0008` پشتیبانی می‌کند.

## ۴) راستی‌آزمایی

- محلی (بدون DB): tsc سبز (contracts/api-client/api) · unit **60 فایل / 984 passed / 1 skipped** (شامل فایل جدید؛ پارتیشن `partition OK`) · spec OK — 238 مسیر / 1348 پاسخ / 1335 schema compile · drift کلاینت صفر.
- **DB-backed (returns-resolution + returns.api) محلی اجرا نشدند** — بدون PostgreSQL محلی؛ داورِ DB = CI (`integration-db`) است. نتایج CI روی PR ثبت می‌شود.

## ۵) شکاف‌های باقی‌مانده (تصمیمِ مالک / برش‌های بعدی)

1. اتصال `return_request` به **credit_note** و ردّ مالی/بستانکاری (الان `credit_note_id` فقط ساختاری است) — نیازمندِ مشخص‌کردنِ policy مالی.
2. بهای تمام‌شدهٔ مرجوعی (cost layer) — واحدِ `unit_cost` الان صفر ثبت می‌شود.
3. UI وب صفحهٔ دریافت (`/returns`) مقصدِ انبار را نمی‌پرسد؛ پیش‌فرضِ انبار main شعبه کار می‌کند؛ افزودنِ انتخابگر در صورت نیازِ عملیاتی.
4. سیاستِ «restock به انبار دیگر از همان شعبه» برای vehicle/transit عمداً باز گذاشته شده (هر انبار فعالِ شعبه صریحاً پذیرفته می‌شود).
5. باقیِ P4: یکپارچگیِ کاملِ اعتبار/موجودی/تأیید در ثبت (backorder/F-06)، تکمیلِ وصولیِ محل، G-05 مرکزِ اعلان (تصمیمِ مالک روی کانال‌ها)، E2E مرورگری (G-01).
6. EVIDENCE_INDEX.md به‌عمد لمس نشد (گیتِ ثبتِ شواهد با مالک است).

## ۶) تصمیماتِ مالک لازم

هیچ‌کدام برای این برش. (G-05 و اتصالِ credit_note در صورت انتخاب، نیازمندِ تصمیمِ مالک خواهند بود.)
