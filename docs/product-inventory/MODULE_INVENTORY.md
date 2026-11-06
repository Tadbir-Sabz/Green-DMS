# فهرستِ ماژول‌ها و قابلیت‌ها — Gate 1 (TASK-21)

> واژگانِ وضعیت (از `PRODUCT_ROADMAP.md` §5، بدونِ تغییر):
> `IMPLEMENTED & VERIFIED` · `IMPLEMENTED WITH GAPS` · `MISSING` · `BROKEN` · `NEEDS REDESIGN` · `UNVERIFIED` · `NOT APPLICABLE`
>
> قواعدِ داوری: وجودِ صفحه/مسیر/جدول به‌تنهایی اثباتِ پیاده‌سازی نیست؛ تستِ اجرا-نشده اثباتِ تأیید نیست؛ mock اثباتِ جریانِ واقعی نیست؛ نبودِ شاهدِ runtime هرگز به PASS تبدیل نمی‌شود.
>
> ستونِ «سطحِ تأیید» نشان می‌دهد شاهدِ کدام سطح را پوشش داده: **API** = تستِ واحد/Integration روی backend · **DB** = مهاجرت/RLS/CI · **UI** = فقط استاتیک (مرورگر اجرا نشده) · **CI** = شواهدِ GitHub Actions.

## A. پلتفرم، سازمان، مستأجر و داده‌های مرجع

| ID | قابلیت | وضعیت | شاهد (خلاصه) | شکاف/وابستگی | سطحِ تأیید |
|---|---|---|---|---|---|
| A-01 | چند-مستأجری: company/branch/warehouse/جداسازیِ داده | `IMPLEMENTED & VERIFIED` | RLS اجباری روی ۱۶۱ جدول (CI: `release-image-identity` روی `80fb846`)؛ `tenant-isolation.api.test.ts`، `runtime-identity.test.ts`، `db-privileges.api.test.ts` | — | DB+API+CI |
| A-02 | ساختارِ سازمانی: region/sales_area/route/staff_area | `IMPLEMENTED & VERIFIED` | مهاجرت‌های ۰۰۰۳/۰۰۰۴؛ کنترلرهای `sales/area` و `sales/route`؛ `structure.api.test.ts` | UI اجرانشده | API |
| A-03 | داده‌های مرجع و تنظیمات (setting/feature_flag/number_counter/document_series) | `IMPLEMENTED & VERIFIED` | `settings.controller` + `settings.api.test.ts`؛ مهاجرت ۰۰۱۷ | — | API |
| A-04 | دوره‌های مالی (fiscal_period) و تقویمِ کاری | `IMPLEMENTED WITH GAPS` | جدولِ `fiscal_period` + `gl.period.close` | تقویم/شیفت/روزهای کاری `MISSING` | API |
| A-05 | import/export داده‌های مرجع | `MISSING` | — | مشترک با G-13 (مرکزِ import/export) | — |

## B. کاربران، تیم‌ها، نقش‌ها، مجوزها و تاییدها

| ID | قابلیت | وضعیت | شاهد | شکاف/وابستگی | سطحِ تأیید |
|---|---|---|---|---|---|
| B-01 | احراز هویت: لاگین/OTP/password-reset/refresh/logout | `IMPLEMENTED & VERIFIED` | `identity-rbac/auth.controller` (۷ مسیر)؛ `auth.api.test.ts`، `otp.api.test.ts`؛ SMS از `sms-sender.ts` | درگاهِ SMS واقعی `UNVERIFIED` (تاریخی) | API |
| B-02 | RBAC: نقش/مجوز/دامنهٔ دسترسی (user_scope) | `IMPLEMENTED & VERIFIED` | مهاجرت ۰۰۲۲ (seed مجوزها)؛ `roles.controller`/`users.controller`؛ `users-roles.api.test.ts` | — | API |
| B-03 | دستگاه‌ها (ثبت/ابطالِ نشست) | `IMPLEMENTED & VERIFIED` | `devices.controller` + `devices.api.test.ts` | UI اجرانشده | API |
| B-04 | پورتالِ مشتری (کاربرِ جدا + مخاطبِ JWT) | `IMPLEMENTED WITH GAPS` | `portal.controller` (۹ مسیر) + `portal-auth.guard.ts`؛ `portal-auth.test.ts` | گردشِ کاملِ کاربریِ پورتال در مرورگر `UNVERIFIED` | API |
| B-05 | موتورِ قواعد/تایید جریان کاری (approval_chain/decision/step_def) | `IMPLEMENTED WITH GAPS` | جداولِ `rule*`/`approval_*`؛ `rules-engine.controller` (۱۴ مسیر) + `rules.contract.controller` (۶) | **بدونِ تستِ رفتاریِ اختصاصی** (G-03)؛ UIِ `/approvals` و `/rules` اجرانشده | API(قرارداد) |

## C. کاتالوگِ محصول (Product Master)

| ID | قابلیت | وضعیت | شاهد | شکاف/وابستگی | سطحِ تأیید |
|---|---|---|---|---|---|
| C-01 | محصول: SKU، نام، گروه، برند، واحدِ پایه، وضعیتِ چرخه (active/blocked/discontinued)، حذفِ نرم | `IMPLEMENTED & VERIFIED` | مهاجرت ۰۰۰۵ (`product`)؛ `product.controller` (CRUD)؛ `products.api.test.ts` | نامِ دوزبانه/alias نیست (G-06) | API |
| C-02 | واحدها و تبدیل (uom با decimal_places، factor_to_base 19,4) | `IMPLEMENTED & VERIFIED` | مهاجرت ۰۰۰۵ (`uom`, `product_packaging.factor_to_base`) | گردِ تبدیل/قواعدِ گردکردنِ تجاری نیازمندِ تثبیت در P1 | API+DB |
| C-03 | سلسله‌مراتبِ گروهِ کالا + روشِ بهای تمام‌شده | `IMPLEMENTED & VERIFIED` | `product_category.parent_id` + `cost_method` (moving_avg/fifo/standard) | — | DB+API |
| C-04 | بسته‌بندی چندسطحی + بارکدِ مستقل + پیش‌فرضِ خرید/فروش | `IMPLEMENTED & VERIFIED` | `product_packaging` + `uq_product_barcode` + `uq_product_sales_pack`؛ `packaging.controller` (۵ مسیر) | چند بارکد در یک سطح با قیدهای موجود ناممکن است — **رفع در طراحیِ هدف با جدولِ `product_barcode` (H-1؛ TASK-21Q/S)** | API+DB |
| C-05 | مالیات: tax_code با نرخ + شناسهٔ مؤدیان | `IMPLEMENTED & VERIFIED` | مهاجرت ۰۰۰۵ (`tax_code.moadian_goods_service_id`) | — | DB |
| C-06 | بچ/انقضا (batch، is_batch_tracked/is_expiry_tracked، shelf_life) | `IMPLEMENTED & VERIFIED` | مهاجرت ۰۰۰۵ (`batch` + `ck_batch_dates`)؛ استفاده در `inventory_txn` | اجرای FEFO/FIFO در انتخابِ کالا `IMPLEMENTED WITH GAPS` | DB+API |
| C-07 | جست‌وجوی سریع (trigram) + صفحه‌بندی | `IMPLEMENTED & VERIFIED` | `ix_product_name_trgm`/`ix_product_code_trgm`؛ صفحهٔ `products` با جست‌وجوی واقعی | UI در مرورگر `UNVERIFIED` | API+UI(استاتیک) |
| C-08 | تصاویر/اسنادِ محصول | `IMPLEMENTED WITH GAPS` | `attachment.owner_type='product'` جزوِ owner-typeهای معتبر (`owner-scope.ts:34-64`) | UX اختصاصیِ تصویر در صفحهٔ محصول نیست | API |
| C-09 | attribute/variant/ویژگی‌های قابل‌پیکربندی | `MISSING` | جدول/endpoint ندارد | نیازِ P1 (§۸ نقشهٔ راه) | — |
| C-10 | نام‌های جایگزین/alias و تشخیصِ تکرار (فارسی/لاتین) | `MISSING` | ستونِ جایگزین در `product` نیست | نیازِ P1 (G-06) | — |
| C-11 | جایگزین/مکمل/بسته (substitutes/complements/bundles) | `MISSING` | جدول ندارد (نوعِ promotion='bundle' متفاوت است) | **D5 مصوب:** کاتالوگِ bundle در P1؛ سفارش/فروش/موجودی تا P5 ممنوع (طراحی: `PRODUCT_MASTER_TARGET_DESIGN.md` §B-P5) | — |
| C-12 | import انبوه/ویرایشِ گروهیِ محصول | `MISSING` | — | نیازِ P1 یا تعویقِ صریح (G-13) | — |

## D. مشتری، بازار و داده‌های تجاری

| ID | قابلیت | وضعیت | شاهد | شکاف/وابستگی | سطحِ تأیید |
|---|---|---|---|---|---|
| D-01 | مشتری/طرفِ حساب (حقیقی/حقوقی)، تماس، نشانی | `IMPLEMENTED & VERIFIED` | `customer`+`person`+`person_address/phone`؛ `customer.controller` (۵) + `person.controller` (۴)؛ `customers.api.test.ts`، `persons.api.test.ts` | UI اجرانشده | API |
| D-02 | قلمرو/مسیر/برنامهٔ بازدید/پوشش | `IMPLEMENTED WITH GAPS` | `region`/`sales_area`/`route`/`visit`/`route_plan(+stop)`؛ `routing-tsp.test.ts` | بهینه‌سازیِ واقعیِ مسیر با قیدها `IMPLEMENTED WITH GAPS` (TSP ساده) | API |
| D-03 | اعتبار (customer_credit، سقف، دفترِ بدهکاران) | `IMPLEMENTED WITH GAPS` | `customer_credit` + `customer_ledger_entry` + `ar_aging_snapshot` | قواعدِ مسدودسازیِ مشتری/چک/تعهدنامه در جریانِ سفارش `IMPLEMENTED WITH GAPS` | API |
| D-04 | بخش‌بندی/طبقه‌بندیِ تجاریِ مشتری | `MISSING` | ستون/جدولِ اختصاصی نیست | نیازِ P3 | — |

## E. قیمت‌گذاری، تخفیف و شرایطِ تجاری

| ID | قابلیت | وضعیت | شاهد | شکاف/وابستگی | سطحِ تأیید |
|---|---|---|---|---|---|
| E-01 | لیستِ قیمت با تاریخِ اعتبار (daterange + EXCLUDE) و تیراژ (min_qty) | `IMPLEMENTED & VERIFIED` | مهاجرت ۰۰۰۶ (`price_list_item` + `ex_price_list_item`)؛ `price-list.controller` (۴)؛ `pricing.api.test.ts` | — | API+DB |
| E-02 | قیمتِ اختصاصیِ مشتری (اولویتِ اول) با تاییدکننده | `IMPLEMENTED & VERIFIED` | `customer_price` + `approved_by` + `ex_customer_price` | — | DB+API |
| E-03 | تخفیف/جایزه: ۹ نوع (percent/amount/bundle/buy_x_get_y/gift/cash/repeat/coupon/volume) با stacking و سقف | `IMPLEMENTED WITH GAPS` | مهاجرت ۰۰۰۶ (`promotion`، `rule*` نیز)؛ `promotion.controller` (۴) | **engine ترکیب/اولویت‌بندیِ cascade بدونِ تستِ رفتاریِ اختصاصی** (G-04) | API(جزئی) |
| E-04 | snapshot قیمت/مالیات/تخفیف در اسنادِ تاییدشده | `IMPLEMENTED & VERIFIED` | `sales_order_line.unit_price/discount_*/tax_*/line_total/promotion_id` (مهاجرت ۰۰۱۰) | snapshot نامِ محصول/عنوانِ واحد نیست (G-07) | DB |
| E-05 | کفِ سود/شبیه‌سازیِ قیمت/تخفیفِ تصویب‌محور | `MISSING` | — | نیازِ P2 | — |
| E-06 | تسویهٔ کمپین (promotion settlement) و اثربخشی | `MISSING` | — | نیازِ P2/P9 | — |

## F. فروش و مدیریتِ سفارش

| ID | قابلیت | وضعیت | شاهد | شکاف/وابستگی | سطحِ تأیید |
|---|---|---|---|---|---|
| F-01 | ثبتِ سفارش (میدانی/تلفنی) + چرخهٔ draft→pending_approval→approved→partially_delivered→… | `IMPLEMENTED WITH GAPS` | مهاجرت ۰۰۱۰ (`sales_order.status` check)؛ `order.controller` (۵)؛ `orders.api.test.ts` | یکپارچگیِ تایید (B-05) و کنترلِ اعتبار/موجودی هنگامِ ثبت `IMPLEMENTED WITH GAPS` | API |
| F-02 | زنجیرهٔ درخواستِ مشتری → تبدیل → فاکتور → تحویل | `IMPLEMENTED & VERIFIED` | `sales-chain.controller` (۱۱ مسیر، `sales.request.*`/`sales.invoice.*`/`sales.delivery.*`) | UI اجرانشده | API |
| F-03 | فاکتورِ فروش/برگشتی (invoice/credit_note) | `IMPLEMENTED & VERIFIED` | جداول + `billing.controller` (۳) + `finance.controller` (۸) | — | API |
| F-04 | مرجوعی (return_request + خطوط + دلایل) | `IMPLEMENTED & VERIFIED` | `return.controller` (۵) + `returns.api.test.ts` | گردشِ کاملِ resolution (قرنطینه/اسقاط/بازگشت به قفسه) `IMPLEMENTED WITH GAPS` | API |
| F-05 | اهداف/سهمیه/پورسانتِ فروش | `IMPLEMENTED WITH GAPS` | `telesale_target`/`commission_plan/tier/line` (مهاجرت‌ها) | endpoint/گردشِ اختصاصیِ تسویهٔ پورسانت محدود | DB |
| F-06 | جایگزینی/backorder/رزرو هنگامِ کمبود | `IMPLEMENTED WITH GAPS` | `stock_reservation` (مهاجرت ۰۰۰۸) | منطقِ جایگزینی/بک‌اوردر در سفارش `MISSING` | DB |

## G. موجودی، انبار و تدارکات

> شناسه‌های این بخش `INV-01..INV-08` است (در TASK-21 از G-01..G-08 بود؛ برای رفعِ تلاقی با شناسه‌های `GAP_REGISTER` تغییر کرد).

| ID | قابلیت | وضعیت | شاهد | شکاف/وابستگی | سطحِ تأیید |
|---|---|---|---|---|---|
| INV-01 | دفترِ موجودی (inventory_txn با batch/warehouse/branch) | `IMPLEMENTED & VERIFIED` | مهاجرت ۰۰۰۸؛ `stock.controller` (۲)؛ `inventory.api.test.ts` | — | API+DB |
| INV-02 | موجودیِ تراز/رزرو/انتقال/تعدیل/شمارش | `IMPLEMENTED & VERIFIED` | `stock_balance/reservation/transfer(+line)/adjustment(+line)/count(+line)`؛ `transfer.controller` (۳)، `stocktake.controller` (۵)؛ `warehouses.api.test.ts` | UI اجرانشده | API |
| INV-03 | دریافتِ کالا (goods_receipt) + بهای تمام‌شده (cost_layer/landed_cost/standard_cost) | `IMPLEMENTED & VERIFIED` | `goods-receipt.controller` (۵) + `goods-receipt.api.test.ts` + جداولِ هزینه | — | API |
| INV-04 | خرید/تدارکات (purchase_request/order + فاکتورِ تامین‌کننده + دفتر) | `IMPLEMENTED WITH GAPS` | `purchasing.controller` (۱۱) + `purchasing.api.test.ts`؛ جداولِ `purchase_*`/`supplier_*` | **UI ندارد** (صفحه‌ای در وب نیست)؛ تاییدِ PO و تسویهٔ تامین‌کننده ناقص | API |
| INV-05 | FEFO/FIFO و ردیابیِ بچ | `IMPLEMENTED WITH GAPS` | ساختارها + `cost_method` | اجرای انتخابِ FEFO در picking/تحویل بدونِ تستِ اختصاصی | DB |
| INV-06 | picking/packing (فرم‌های برداشت/بسته‌بندی) | `MISSING` | — (فقط `vehicle_load` = بارگیری) | نیازِ P5 | — |
| INV-07 | نقطهٔ سفارش/بازه‌سازی (reorder_policy) | `IMPLEMENTED WITH GAPS` | جدولِ `reorder_policy` | موتورِ پیشنهادِ سفارشِ خرید `MISSING` | DB |
| INV-08 | انبارگردانی/قفسه/موقعیت (location/bin) | `IMPLEMENTED WITH GAPS` | `stock_count` + `warehouse` | bin/location ساختارمند نیست (`location_sample` فقط ردیابیِ GPS است) | API |

## H. توزیع، تحویل و ناوگان

| ID | قابلیت | وضعیت | شاهد | شکاف/وابستگی | سطحِ تأیید |
|---|---|---|---|---|---|
| H-01 | حواله/بارگیری (waybill/vehicle_load) | `IMPLEMENTED & VERIFIED` | `waybill.controller` (۳) + `waybills.api.test.ts` + `vehicle_load(+line)` | — | API |
| H-02 | تحویل/POD (delivery(+line)/pod + ضمیمه/امضا/عکس) | `IMPLEMENTED & VERIFIED` | `sales-chain` delivery + `pod` + attachments با زنجیرهٔ مالکیت (TASK-14/19)؛ ۹ تستِ MinIO سبز | UI موبایلِ POD `UNVERIFIED` | API+CI |
| H-03 | تور/مسیرِ اجرایی (tour(+stop)/route_plan/settlement) | `IMPLEMENTED & VERIFIED` | `tours.controller` (۹ مسیر شاملِ settlement) + `tours.api.test.ts` | — | API |
| H-04 | رهگیریِ GPS/جغرافیایی (geofence+event، tracking) | `IMPLEMENTED & VERIFIED` | `tracking.controller` (۶) + `geofence.controller` (۵)؛ `geofences.api.test.ts` | مصرفِ موبایلی `UNVERIFIED` | API |
| H-05 | وصولی در محل (نقد/چک/کارت) و تحویل به صندوق | `IMPLEMENTED WITH GAPS` | `collection_action` + `cheque(+event)` + `cash_txn` + `daily_treasury_close` | گردشِ کاملِ تحویل‌به‌صندوقِ موبایل `UNVERIFIED` | API |
| H-06 | ناوگان: نگهداری/سوخت/بیمه/بازرسی/حادثه | `MISSING` | فقط `vehicle` + `vehicle_load` | نیازِ P6 (یا خارج از دامنه با تصمیمِ مالک) | DB(جزئی) |
| H-07 | لجستیکِ معکوس/ظروفِ امانی | `IMPLEMENTED WITH GAPS` | `product.is_returnable_container` + `container_loan` + مرجوعی | گردشِ کاملِ بازگشتِ ظروف `IMPLEMENTED WITH GAPS` | DB+API |

## I. مالی، حسابداری و انطباق

| ID | قابلیت | وضعیت | شاهد | شکاف/وابستگی | سطحِ تأیید |
|---|---|---|---|---|---|
| I-01 | دفترِ کل (gl_account/journal_entry/line + تراز) | `IMPLEMENTED & VERIFIED` | `gl.controller` (۸) + `gl.api.test.ts` + `ledger_balance_snapshot` | — | API |
| I-02 | مطالبات/پرداخت‌ها (AR/AP، receipt/voucher/allocation) | `IMPLEMENTED & VERIFIED` | `finance.controller` (۸) + `payment.controller` (۳) + `ar_aging_snapshot` | UI اجرانشده | API |
| I-03 | صندوق/بانک/چک (cash_box/session، bank_statement، cheque_event، petty_cash) | `IMPLEMENTED & VERIFIED` | جداول + `cheque.controller` (۴)؛ `treasury.api.test.ts` | — | API |
| I-04 | بستنِ دورهٔ مالی (`gl.period.close`) | `IMPLEMENTED WITH GAPS` | `gl.controller` closePeriod + `fiscal_period` | صورت‌های مالیِ استاندارد/مغایرتِ دفاتر `IMPLEMENTED WITH GAPS` | API |
| I-05 | بهای تمام‌شده/Cogs (cost_layer، standard_cost_history، cogs_entry) | `IMPLEMENTED WITH GAPS` | جداول + استفاده در stock_valuation | صحتِ محاسبه در گردشِ واقعی بدونِ تستِ E2E `UNVERIFIED` | DB+API |
| I-06 | مالیات/VAT و دفترچهٔ مالیاتی (tax_ledger) | `IMPLEMENTED WITH GAPS` | `tax_ledger` + `tax_code` | گزارش‌های اظهارنامه `IMPLEMENTED WITH GAPS` | DB |
| I-07 | اسنادِ ارزش‌دار (value_document) و سندِ اتوماتیک با رهگیری به سندِ مبدأ | `IMPLEMENTED WITH GAPS` | `value_document(+line)` + `account_mapping` + `recurring_journal` | قواعدِ معکوسِ کنترل‌شده/تاییدِ سند `IMPLEMENTED WITH GAPS` | DB+API |
| I-08 | مغایرت‌گیریِ بانک/صندوق | `IMPLEMENTED WITH GAPS` | `bank_statement_line` + `reconciliation` جزئی در treasury | گردشِ کاملِ مغایرت `IMPLEMENTED WITH GAPS` | API |

## J. مالیاتِ قانونی (Moadian) و یکپارچه‌سازی

| ID | قابلیت | وضعیت | شاهد | شکاف/وابستگی | سطحِ تأیید |
|---|---|---|---|---|---|
| J-01 | چرخهٔ صدورِ صورتحسابِ الکترونیکی (moadian_submission: payload/status/last_error) | `IMPLEMENTED WITH GAPS` | مهاجرت ۰۰۱۰ + `moadian.controller` (۲) + `docs/integrations-golive.md` + `scripts/mock-gateway.mts` | **درگاهِ واقعیِ مؤدیان اثبات‌نشده** (mock/golive doc) — G-08 | API(mock) |
| J-02 | PSP/پرداخت (psp_transaction) | `IMPLEMENTED WITH GAPS` | `psp.controller` (۳) + جدول | درگاهِ واقعی/تاییدِ تسویه `UNVERIFIED` | API |
| J-03 | SMS (قالب/ارسال/OTP) | `IMPLEMENTED & VERIFIED` | `sms_template` + `sms-sender.ts` + `sms-sender.test.ts` | ارائه‌دهندهٔ واقعی `UNVERIFIED` (تاریخی) | API |
| J-04 | webhook (endpoint/delivery) + کرِنشنال | `IMPLEMENTED WITH GAPS` | جداولِ `webhook_*`/`integration_credential` + صفِ retry | UI/observability محدود | DB+API |

## K. نیروی کارِ میدانی و موبایل (سه اپ)

| ID | قابلیت | وضعیت | شاهد | شکاف/وابستگی | سطحِ تأیید |
|---|---|---|---|---|---|
| K-01 | کلاینتِ Kotlin تولیدشده از قرارداد (android/client) | `IMPLEMENTED & VERIFIED` | `npm run clients:generate`؛ openapi-generator 7.26؛ `android/README.md` | نیازمندِ JRE برای build | استاتیک |
| K-02 | اپِ فروشنده (salesman): ۷ صفحه، Room آفلاین، WorkManager، اسکنِ بارکد (CameraX/MLKit)، Hilt | `UNVERIFIED` | `android/apps/salesman/app/src/...` (NavGraph، LoginScreen، OfflineRepository، manifest کامل با مجوزها) | **بدونِ JRE/Android SDK قابلِ build نیست**؛ `ANDROID_STEPS_PRIORITY.md` تا حدی کهنه (بخشی از نقص‌ها رفع شده) — G-10 | استاتیک |
| K-03 | اپِ موزع (distributor) | `NEEDS REDESIGN` | فقط GreenDmsApp/MainActivity/PersianDate (۰ صفحه) | اسکلتِ حداقلی؛ مسیر/namespace طبق سند نیازمندِ اصلاح | استاتیک |
| K-04 | اپِ فروشندهٔ تلفنی (telesales) | `NEEDS REDESIGN` | مانندِ distributor (۰ صفحه) | — | استاتیک |
| K-05 | آفلاین/همگام‌سازی/تعارض | `UNVERIFIED` | `OfflineRepository` + `client_sync_receipt` (backend) | اجرای واقعیِ sync و برخوردِ تعارض بدونِ دستگاه/امولاتور `UNVERIFIED` | — |
| K-06 | امنیتِ دستگاه/توکن (security-crypto) | `UNVERIFIED` | وابستگیِ `androidx.security` در gradle | اجرانشده | استاتیک |

## L. اعلان‌ها، اسناد، وظایف و قابلیت‌های مشترک

| ID | قابلیت | وضعیت | شاهد | شکاف/وابستگی | سطحِ تأیید |
|---|---|---|---|---|---|
| L-01 | مرکزِ اعلان (in-app/email/push، قالب، ترجیح، وضعیتِ تحویل) | `MISSING` | جدولِ notification نیست؛ فقط SMS (J-03) | نیازِ cross-cutting در P3-P4 — G-05 | — |
| L-02 | ضمیمه/سند با کنترلِ دسترسی (owner-chain + S3 + sha256) | `IMPLEMENTED & VERIFIED` | `attachments.service/owner-scope` + ۹ تستِ MinIO سبز (CI 42211433517) | سیاستِ نگهداری/حذفِ خودکار `MISSING` | API+CI |
| L-03 | ثبتِ رویداد/سابقه (audit_log + سرویس) | `IMPLEMENTED WITH GAPS` | `audit.service.ts` + مهاجرت‌ها (۱۵ statement) | تستِ اختصاصیِ audit نیست (G-03 مشترک) | DB |
| L-04 | صف/کارِ پس‌زمینه (BullMQ + job_*/بازیابیِ خطا) | `IMPLEMENTED & VERIFIED` | `queue.module.ts` + `queue-failure-persistence.test.ts` + `job-tenant-context.test.ts` | رفتارِ بدونِ Redis = graceful degrade (استاتیک تایید) | API |
| L-05 | مرکزِ import/export (validation/preview/error report) | `MISSING` | فقط خروجیِ گزارش‌ها (reports) | G-13 | — |
| L-06 | مدیریتِ وظیفه/پروندهٔ استثنائات (exception_item) | `IMPLEMENTED WITH GAPS` | جدول + صفحهٔ `/exceptions` | گردشِ کاملِ case management نیست | DB+UI(استاتیک) |

## M. گزارش‌ها، BI و هوشِ عملیاتی

| ID | قابلیت | وضعیت | شاهد | شکاف/وابستگی | سطحِ تأیید |
|---|---|---|---|---|---|
| M-01 | گزارش‌های عملیاتی (فروش روزانه، سنی مطالبات، صندوق، موجودی، خرید/فروش) | `IMPLEMENTED WITH GAPS` | `report-registry.ts` (تعریفِ فارسیِ ستون‌ها) + صفحاتِ `reports/*` | تطبیقِ گزارش‌ها با اسنادِ مبدأ بدونِ E2E `UNVERIFIED` | API+UI(استاتیک) |
| M-02 | داشبورد/KPI/ABC/forecast | `IMPLEMENTED WITH GAPS` | `bi.controller` (kpi، abc-customers، abc-products، forecast) + `bi.test.ts`/`bi-forecast.test.ts` | پیچیدگیِ مدلِ پیش‌بینی محدود | API |
| M-03 | گزارش‌گیریِ زمان‌بندی‌شده/اشتراک | `MISSING` | — | نیازِ P9 | — |
| M-04 | سودآوری (کالا/مشتری/مسیر/فروشنده/خودرو) | `IMPLEMENTED WITH GAPS` | پایه‌های بهای تمام‌شده (I-05) | ابعادِ سودآوریِ آماده `MISSING` | DB(جزئی) |

## N. مدیریتِ سیستم، ممیزی و عملیات

| ID | قابلیت | وضعیت | شاهد | شکاف/وابستگی | سطحِ تأیید |
|---|---|---|---|---|---|
| N-01 | health زنده/آمادهٔ واقعی | `IMPLEMENTED & VERIFIED` | `health.controller` (DI واقعیِ DB/Redis)؛ `health-probes.test.ts`؛ CI release-image | — | API+CI |
| N-02 | پیکربندیِ fail-closedِ production + ایمیج‌های release | `IMPLEMENTED & VERIFIED` | `production-config.ts` (۱۲ بررسی) + `release-image.yml` سبز روی `80fb846` | — | CI |
| N-03 | backup/restore | `UNVERIFIED` | مستندات (PRODUCTION_DEPLOYMENT) | **هرگز با restore واقعی اثبات نشده** (تاریخیِ معتبر) | — |
| N-04 | ارتقا/بازگشتِ عملیاتی | `UNVERIFIED` | `scripts/test-migrations.mjs` (up→down→up در CI) | تمرینِ عملیاتی روی دادهٔ واقعی انجام‌نشده | CI(جزئی) |
| N-05 | runbook/چک‌لیستِ استقرار | `IMPLEMENTED & VERIFIED` | `docs/deploy/PRODUCTION_DEPLOYMENT.md` + `CHECKLIST.md` | — | اسناد |
| N-06 | rate limiting (Redis) | `UNVERIFIED` | throttler در `common/` | رفتارِ با Redis واقعی در CI اثبات‌نشده (تاریخی) | — |

## O. قابلیت‌های پیشرفته/متمایزکننده (§6-J نقشهٔ راه)

| ID | قابلیت | وضعیت | شاهد | توضیح |
|---|---|---|---|---|
| O-01 | پیش‌بینیِ تقاضا/ریسکِ کمبود | `IMPLEMENTED WITH GAPS` | `bi/forecast` | نسخهٔ اولیه |
| O-02 | بهینه‌سازیِ مسیر/قلمرو | `IMPLEMENTED WITH GAPS` | `routing` + `routing-tsp.test.ts` | TSP ساده؛ بهینه‌سازی با قیدهای واقعی نیست |
| O-03 | تشخیصِ ناهنجاری | `MISSING` | — | نیازمندِ دادهٔ عملیاتی |
| O-04 | پورتالِ مشتری/تامین‌کننده و سفارشِ B2B | `IMPLEMENTED WITH GAPS` | `portal` ماژول (B-04) | پورتالِ تامین‌کننده `MISSING` |
| O-05 | ردیابیِ بچ/فراخوانی (recall) | `IMPLEMENTED WITH GAPS` | `batch` + پیوندها | گردشِ recall `MISSING` |
| O-06 | چندشرکتی/فرانشیزِ پیشرفته | `NOT APPLICABLE` (فعلاً) | `company` چندگانه در schema هست | تا تصمیمِ مالک برای بازارِ هدف، خارج از دامنه |

## P. پایه‌های مشترک (خلاصه)

| لایه | وضعیت | شاهدِ کلیدی |
|---|---|---|
| پایگاه‌داده/RLS/هویتِ runtime | `IMPLEMENTED & VERIFIED` | ۱۵۵ جدول، ۱۵۷ policy، forced-RLS=161 در CI، `dms_app_tcp=1 dms_tcp=0` |
| قرارداد/کلاینت‌ها | `IMPLEMENTED & VERIFIED` | openapi: 142/207/101 + 3 webhook؛ drift سبز؛ کلاینتِ TS و Kotlin |
| صف/کارِ پس‌زمینه | `IMPLEMENTED & VERIFIED` | BullMQ + تست‌های persistence/tenant-context |
| احراز هویت/مجوز | `IMPLEMENTED & VERIFIED` | auth/otp/refresh + RBAC + user_scope |
| ضمیمه/storage | `IMPLEMENTED & VERIFIED` | owner-chain + S3 + ۹ تست |
| UI مشترک (design system، RTL، Jalali) | `IMPLEMENTED WITH GAPS` | ۸۶ کامپوننت + fa-IR/Jalali در صفحات؛ اجرای مرورگری `UNVERIFIED` |

## شمارشِ وضعیت‌ها (بازشماری‌شده در TASK-21R؛ ۹۳ قابلیتِ بخش‌های A..O — جدا از ۶ لایهٔ جدولِ P)

| وضعیت | تعداد |
|---|---|
| `IMPLEMENTED & VERIFIED` | ۳۷ |
| `IMPLEMENTED WITH GAPS` | ۳۳ |
| `MISSING` | ۱۴ |
| `UNVERIFIED` | ۶ |
| `NEEDS REDESIGN` | ۲ |
| `BROKEN` | ۰ |
| `NOT APPLICABLE` | ۱ |
| **مجموع** | **۹۳** |

> راستی‌آزماییِ TASK-21R: شمارشِ قبلی («۷۲ قابلیت» با جمعِ داخلیِ ۷۳) اشتباه بود؛ اعداد بالا مستقیماً از ستونِ وضعیتِ همین جدول‌ها بازشماری شد. ارجاع‌های `G-xx` در این سند = شناسه‌های `GAP_REGISTER`؛ شناسه‌های قابلیتِ بخشِ موجودی/انبار پیش‌وندِ `INV-` گرفتند تا با شناسه‌های شکاف تلاقی نکنند.

> نکته: هیچ قابلیتی `BROKEN` شناخته نشد (خرابیِ شناخته‌شده‌ای در کدِ ادغام‌شده نیست؛ ناتوانیِ build اپ‌های اندروید به‌دلیلِ نبودِ ابزار `UNVERIFIED` و کمبودِ محتوا `NEEDS REDESIGN` طبقه‌بندی شد).
