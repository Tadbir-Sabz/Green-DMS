# TASK-PM-01D-M4 — نگهداشت گروهی کنترل‌شدهٔ کالای مرکزی

این سند گزارش پیادهسازی، مرزهای امنیتی و شواهد اعتبارسنجی مایلستون M4 است.

> **یادداشت F:** این سند تاریخ M4 تا SHA `6bffef3` را حفظ میکند. برخی جزئیات
> §۴ دربارهٔ `request_id=operation_id`، `GET` تطبیقدهنده، DDL زمان اجرا و down بیقید
> بعدها در F اصلاح شدند؛ §۱۰ و `TASK-PM-01D-M4-F_IMPLEMENTATION.md` مرجع جاریاند.
مرجع نهایی رفتار، کد و تستهای مخزن است؛ متن صفحه، کش مرورگر و نتیجهٔ درون
حافظه معتبر نیستند. M4 فقط یک **عملیات محدود و همه یا هیچ** روی گزینش
کنونی کالاهای مرکزی اضافه میکند. این رفتار با اتمیّت «هر دسته» در import مصوب
§E، با تصمیم باز «همه یا هیچ بودن کل فایل» و با عضویت دامنهای عملیاتی اشتباه
گرفته نشود.

## ۱) نقطهٔ شروع و حفظ کار پیشین

- شروع تأییدشده و تمیز: `8509255f9154e328319dd323896316666140a8e0` (پایان M3 / ابتدای M4).
- شاخهٔ ثابت نشست: `arena/be5eaff3-green-dms`؛ PR #14 همچنان OPEN / DRAFT با base `main`.
- بستهٔ بازیابی M2، stash اولیه، شواهد M2/M3، مهاجرتهای `0060` و `0061`، قرارداد
  export، مسیر import و اسناد مالک بدون reset، force-push یا بازنویسی تاریخچه حفظ شدند.
- رگرسیون مبنا پیش از نوشتن کد M4: ۱۰ فایل API مبتنی بر DB / ۲۳۰ تست و ۱۵ فایل وب /
  ۸۲ تست سبز بودند.
- قبل از M4 نه commit، نه push، نه بهروزرسانی بدنهٔ PR و نه CI نهایی با SHA دقیق وجود داشت.

## ۲) مسئلهای که M4 حل میکند

ویرایش تکتک کالاها برای اصلاح یک ویژگی مشترک، کند و مستقل از هم بود؛ مسیر
import هم semantics مصوب «هر دسته ۱۰۰تایی + ادامه» دارد و نمیتوان بدون تصمیم
مالک به «همه یا هیچ کل فایل» تبدیل شود. M4 بنابراین یک مسیر جداگانه، همزمان
همزمان و سقفدار برای حداکثر ۱۰۰ کالا و حداکثر ۹ فیلد مرکزی میسازد:

1. سرور فهرست سفید فیلدها را اعلام میکند.
2. کاربر گزینش و مقادیر را میفرستد؛ سرور یک پیشنمایش فقطخواندنی، دقیق و
   دارای نسخهٔ `row_version` میسازد و در یک دفتر عملیات پایدار ثبت میکند.
3. کاربر صریحاً تأیید میکند؛ اجرا هیچ بدنهٔ فیلد تازهای نمیپذیرد و فقط
   `operation_id`، `preview_token` و `confirm=true` دریافت میکند.
4. تمام UPDATEها، تاریخچهٔ `0060`، ممیزی سطح عملیات و وضعیت نهایی دفتر در یک
   تراکنش واحد commit میشوند؛ در صورت تداخل یا خطا، هیچ ردیف محصولی تغییر نمیکند.
5. نتیجهٔ قطعی، replay امن، وضعیت `unknown` و تطبیق شواهد بدون اجرای مجدد
   کور در دسترس است.

این طراحی نیازی به BullMQ، صف، worker، backpressure یا مجوز/رجیستری دامنهای تازه
ندارد و چنین چیزی اضافه نکرد. سقفها عمداً کوچک و قابل اثباتاند:
`BULK_MAX_PRODUCTS=100`، `BULK_MAX_FIELDS=9`، `BULK_PREVIEW_TTL_MS=10*60*1000`،
`BULK_STATEMENT_TIMEOUT_MS=15000`، `BULK_LOCK_TIMEOUT_MS=5000`.

## ۳) مالکیت فیلدها و فهرست سفید سرور

فقط ستونهای `product` با مالکیت مرکزی روشن مجازاند:

| فیلد | معنی | نوع / مرز |
|---|---|---|
| `name` | نام کالا | متن غیرخالی، حداکثر ۲۵۵ |
| `name_latin` | نام لاتین | متن یا `null`، حداکثر ۲۵۵ |
| `brand_id` | برند همان شرکت | UUID یا `null`؛ وجود و همشرکت بودن در سرور بررسی میشود |
| `min_order_qty` | حداقل مقدار سفارش | عدد نامنفی |
| `weight_gr` | وزن (گرم) | عدد صحیح نامنفی یا `null` |
| `volume_cm3` | حجم (سانتیمتر مکعب) | عدد صحیح نامنفی یا `null` |
| `distribution_kind` | شرایط توزیع فیزیکی | `cold` / `warm` / `both` |
| `is_returnable_container` | ظرف بازگشتی | بولی |
| `requires_permit` | نیازمند مجوز | بولی |

شواهد مالکیت از ستونهای مرکزی `product` در `0005`/`0046` و جدول `brand` با
`company_id` در `0005` گرفته شد. صریحاً خارج از محدودهاند: هویت/کد/شرکت،
وضعیت و فیلدهای حساس D4، واحد پایه و کد مالیاتی، خانواده/گروه، variant،
بارکد/نام جایگزین/صفات/بستهها، موجودی/انبار/قیمت/شعبه/ناوگان، approval،
دامنه/عضویت دامنهای و ستونهای سروری مثل `row_version` و timestamps. `normalizeBulkChanges`
علاوه بر فهرست سفید، کلیدهای محافظتشده و `__proto__` / `constructor` / `prototype`
را رد میکند؛ سرویس پیش از ساخت DTO обновления دوباره همان فهرست سفید را اعمال
میکند. بنابراین درخواست دستساز نمیتواند `status`، `tax_code_id`، `base_uom_id`،
`code`، `family_id` یا `row_version` را قاچاق کند.

## ۴) معماری اجرا و شواهد پایدار

### مهاجرت `0062_product_bulk_maintenance`

دفتر `product_bulk_operation` افزودنی و برگشتپذیر است؛ هیچ ستون، trigger،
grant یا رفتاری از `product`، `0060` و `0061` تغییر نمیکند. ستونها شامل
`operation_id`، شرکت، actor، وضعیت/نتیجه، علت/پیام، هش درخواست/توکن/پیشنمایش،
`product_ids uuid[]`، تغییرات، نسخههای مورد انتظار، پیشنمایش، نتیجه، شمارشها،
`attempts` و زمانها هستند. RLS اجباری شرکت، ایندکس جستوجو، و grantهای
`SELECT/INSERT/UPDATE` بدون `DELETE` برای `dms_app` اعمال شد. قید `cardinality(product_ids)
between 1 and 100` و قید object/non-empty برای `changes` در SQL است؛ کران دقیق
۱ تا ۹ فیلد و انواع مقادیر در DTO/سرویس اعمال میشود، چون PostgreSQL در CHECK
نمیتواند subquery روی کلیدهای jsonb داشته باشد.

`audit_log` بهتنهایی نمیتوانست ادعای idempotency باشد: پارتیشنبندی شده،
`AuditService.record` پیشتر خطاها را میبلعید و ستون operation-id برای
`0060` وجود ندارد. M4 بهجای تغییر `0060`، یک ردیف ممیزی سطح عملیات با
`request_id = operation_id` مینویسد؛ شواهد قبل/بعد تکتک محصولات همچنان از
trigger تغییرناپذیر `0060` در همان تراکنش میآیند. `AuditService.recordRequired`
فقط برای M4 خطای ممیزی را پرتاب میکند تا «تغییر محصول بدون ممیزی» نسازد؛
`record` قدیمی برای سایر مسیرها همان رفتار بلعیدن خطا را حفظ کرد.

### پیشنمایش و execute

- `GET /products/bulk-maintenance/fields`، `POST .../preview`، `POST .../execute`
  و `GET .../operations/{operationId}` همگی `master.product.update` میخواهند.
  `master.product.view` و export CSV هیچکدام اجازهٔ نوشتن نمیدهند.
- پیشنمایش در `REPEATABLE READ` و بدون UPDATE محصول، بدون تاریخچه و بدون ممیزی
  محصول ساخته میشود؛ فقط رکورد دفتر در همان تراکنش درج میشود. توکن خام یکبار
  برگردانده میشود و فقط هش SHA-256 آن ذخیره میشود.
- `CatalogAccess.write` بهصورت افزودنی `isolation` و timeoutهای transaction-local
  میپذیرد؛ `set transaction` پیش از GUCهای شرکت/کاربر اجرا میشود. سایر تماسگیرندگان
  بدون آپشن، همان `READ COMMITTED` تاریخی را دارند.
- execute ابتدا قفل مشورتی بهازای `operation_id` و `SELECT ... FOR UPDATE` روی دفتر
  میگیرد، توکن و هش درخواست/پیشنمایش ذخیرهشده را بررسی میکند، سپس پیشنمایش تازه
  و نسخهها را دوباره میسازد. منقضی، stale، نبود کالای واجد تغییر، یا وجود حتی یک
  کالای نامعتبر پیش از هر UPDATE، عملیات را `rejected` میکند.
- بهازای هر کالا `ProductRepository.update` با `row_version` مورد انتظار و همان
  `Runner` تراکنش فراخوانی میشود. شکست یکی، تراکنش بیرونی را برگشت میدهد؛
  بنابراین UPDATEها و تاریخچهٔ کالاهای قبلی هم برمیگردند.
- پس از `COMMIT`، سرویس نتیجه را فقط از حافظه اعلام نمیکند: دفتر پایدار دوباره
  خوانده میشود و فقط وضعیت قطعی `committed` / `rejected` / `unknown` برگردانده
  میشود. اگر اثبات نهایی ممکن نباشد، `unknown` ثبت میشود و فقط شناسهٔ عملیات و
  کد خطا لاگ میشود؛ هیچ مقدار محصول/درخواستی لاگ نمیشود.
- `operationStatus` برای `unknown` و `accepted` تطبیق fail-closed انجام میدهد:
  یک ردیف صریح audit با همان `request_id`، history محصولات همان actor، تطبیق
  `after_data` با تغییرات، نسخههای قبل و تغییر نسخهها. فقط شواهد کافِی، وضعیت
  `committed` یا `rolled_back` را قطعی میکند؛ در غیر اینصورت `unknown` باقی
  میماند و اجرای مجدد کور انجام نمیشود. تطبیق `0060` بهترتیب trigger اصلاح شد:
  قید نسخهٔ بعدی حذف شد و نسخهٔ قبل/فهرست تغییرات/actor معیار ماند.

## ۵) قرارداد، کلاینت و رابط فارسی RTL

- `packages/contracts/openapi.yaml` چهار مسیر و schemaهای `BulkMaintenance*`
  را مستند کرد؛ `packages/api-client/src/schema.ts` با `npm run generate` و
  `npm run build` همتراز شد.
- `apps/web/src/app/products/bulk-maintenance/` شامل helperهای خالص، صفحهٔ
  گزینش / پیشنمایش / تأیید / اجرا / وضعیت و تستهای RTL است. لینک تازه از
  `/products` اضافه شد.
- صفحه پیش از هر فراخوانی، مجوز `master.product.update` را fail-closed بررسی
  میکند؛ فیلدها را از سرور میگیرد، diff قبل/بعد را فقط از سرور نشان میدهد،
  برای execute تأیید صریح میخواهد، عملیات منقضی/غیر واجد را غیرفعال میکند،
  نتیجه و لینک تاریخچهٔ هر کالا را نمایش میدهد و امکان «دریافت وضعیت» دارد.
- `brand_id` همچنان ورودی متن UUID است؛ در OpenAPI مسیر/اسکیمای فهرست برند
  وجود ندارد و M4 چنین endpoint تازهای نساخت. این یک یافتهٔ UX است، نه مجوز
  ساختگی دامنه.

## ۶) شواهد اعتبارسنجی محلی

همهٔ تستها روی PostgreSQL disposable محلی `127.0.0.1:55432` و بدون لمس
پایگاهدادهٔ production/اشتراکی اجرا شدند. این محیط PostGIS واقعی، pgcrypto
واقعی، MinIO و Redis ندارد؛ `ECONNREFUSED 127.0.0.1:6379` و خطاهای منفی
`ERROR/FATAL` در لاگها مربوط به همان محدودیتها یا تستهای منفیاند. معادل
خدمات واقعی فقط در CI نهایی با `postgis/postgis:16-3.4` بررسی میشود.

| دستور | نتیجه |
|---|---|
| `npm run openapi:check` | ۲۰۰ path / ۲۸۳ operation / ۱۵۳ schema / ۳ webhook؛ valid |
| `node scripts/contract-drift.mjs` | ۲۸۳/۲۸۳/۲۸۳؛ diff صفر |
| `node scripts/check-test-partition.mjs` | ۷۷ فایل؛ declared == computed |
| `npm run test -w apps/api -- $(... --print unit)` | ۲۶ فایل / ۳۳۸ تست PASS |
| `npm run test -w apps/api -- test/product-bulk-maintenance-unit.test.ts` | ۳/۳ PASS |
| تست DB هدفدار M4 | ۱۱/۱۱ PASS |
| تست DB انتخابی محصول/قرارداد/RLS/تاریخچه | ۱۲ فایل / ۲۴۴ تست PASS |
| تست DB گستردهٔ ۴۴ فایل مجاز محلی | ۴۴ فایل / ۹۲۵ تست PASS |
| `npm run test:web` | ۱۷ فایل / ۸۸ تست PASS |
| `npm run typecheck` و `npm run build` | PASS؛ build وب ۵۶ صفحه شامل `/products/bulk-maintenance` |
| `npm run test:migrations` | چرخهٔ سخت ۶۲ مهاجرت up/down/up؛ دو اجرا دقیقاً ۱۰۱۳ شیء یکسان |
| `npm run test -w apps/api -- test/migrations-security.test.ts` | ۳/۳ PASS |

یک اجرای گستردهتر ۴۷ فایل DBدار، ۴۴ فایل / ۹۷۰ تست سبز و ۳ فایل /
۱۲ تست قرمز داشت: `attachments.api.test.ts`،
`task24w-conversion-and-parity.api.test.ts`،
`task24y-approval-engine.api.test.ts`. همان ۱۲ شکست روی شاخهٔ کاری جداگانهٔ
مبنای دقیق `8509255` و همان کلاستر محلی نیز تکرار شد؛ بنابراین رگرسیون M4
نیست، بلکه وابستگی محیطی/حالت sandbox است. چهار فایل
`customers.api` / `geofences.api` / `postgres-init-role.api` / `tours.api`
نیز بهدلیل نبود PostGIS واقعی و trust auth از اجرای گستردهٔ محلی کنار گذاشته
شدند؛ در CI نهایی با سرویس واقعی اجرا میشوند. خلاصهٔ دقیق دستورات و شمارشها در
`docs/product-inventory/evidence/task-pm-01d-m4/VERIFICATION.txt` است.

## ۷) ماتریس پذیرش M4

| # | مورد | حکم | دلیل / مرز باقیمانده |
|---:|---|---|---|
| ۱ | حفظ مبنا، M2/M3 و عدم عملیات مخرب | PASS | بدون reset/force-push/تغییر `0060`/`0061`/دسترسیهای تاریخی |
| ۲ | مهاجرت افزودنی، برگشتپذیر، RLS و least privilege | PASS WITH FINDINGS | up/down/up و grant probe سبز؛ معادل PostGIS واقعی فقط CI |
| ۳ | فهرست سفید سرور و جلوگیری از قاچاق فیلد محافظتشده | PASS | DTO/سرویس/تست DB شامل crafted protected fields |
| ۴ | سقف ۱۰۰ کالا / ۹ فیلد و مقادیر نوعمند | PASS | تست DB و helper وب؛ `brand_id` هنوز ورودی UUID متنی است |
| ۵ | پیشنمایش فقطخواندنی، دقیق و دارای نسخه | PASS | بدون UPDATE/history/audit محصول در preview |
| ۶ | اجرا بدون بدنهٔ فیلد تازه و با تأیید صریح | PASS | تست no-confirm و crafted execute |
| ۷ | مجوز `master.product.update` و fail-closed UI/API | PASS WITH FINDINGS | ۴۰۱/۴۰۳ و gate وب سبز؛ بازبینی مستقل امنیتی UNVERIFIED |
| ۸ | همه یا هیچ در یک تراکنش واحد | PASS WITH FINDINGS | تداخل واقعی `row_version`، برگشت محصولات/تاریخچه؛ قطع واقعی شبکه UNVERIFIED |
| ۹ | همزمانی، stale/expired و idempotent replay | PASS WITH FINDINGS | قفل عملیات، replay و stale/expired سبز؛ بار اشباع pool UNVERIFIED |
| ۱۰ | ممیزی و تاریخچهٔ همتراز با COMMIT | PASS WITH FINDINGS | `recordRequired` و correlation تست شد؛ RLS والد/پارتیشنهای پویا وابسته به CI واقعی |
| ۱۱ | نتیجهٔ `unknown` و تطبیق بدون اجرای مجدد کور | PASS WITH FINDINGS | شواهد COMMIT/ROLLBACK و ابهام تست شد؛ مثبت کاذب و ACK-loss واقعی UNVERIFIED |
| ۱۲ | قرارداد، کلاینت typed، UI فارسی RTL | PASS WITH FINDINGS | OpenAPI/drift/typecheck/build/web tests سبز؛ responsive/a11y/console دستی UNVERIFIED |
| ۱۳ | تغییر ندادن semantics import و تصمیمهای مالک | PASS | §E هر دسته + ادامه حفظ شد؛ whole-file و PM-B1..PM-B8 همچنان OPEN |
| ۱۴ | پذیرش کامل Product Master / دامنهٔ عملیاتی | BLOCKED | تصمیمهای مالک، G-03 اتصال تأیید دونفره، رجیستری دامنه و review مستقل انجام نشدهاند |

**حکم مستقل مایلستون M4:** `PASS WITH FINDINGS`.
**حکم کلی Product Master / دامنهٔ عملیاتی:** `BLOCKED`.
**تصمیمهای PM-B1..PM-B8 و whole-file atomicity:** `OPEN / NOT APPROVED`.
**موارد فنی/عملیاتی بدون اثبات:** `UNVERIFIED` (real queue/worker، بار اشباع،
network partition/ACK loss واقعی، بررسی دستی responsive/a11y/console، Agent2
امنیتی، اتصال تأیید دونفره، پایگاهدادهٔ معادل production).

## ۸) مرزهای صریح

- M4 یک «عملیات نگهداشت گروهی محدود» است، نه پاسخ به «همه یا هیچ بودن کل فایل import».
- `master.product.export` وجود ندارد؛ `master.product.view` فقط خواندن/export را مجاز میکند.
- هیچ رجیستری دامنه، `domain_id`، provider، مجوز دامنهای، عضویت، lifecycle دامنهای
  یا cutover مصرفکننده اضافه نشد.
- هیچ صف/worker/BullMQ، مجوز RBAC تازه، تغییر `0041`، merge، deploy، یا تغییر
  production/DB اشتراکی انجام نشد.
- `0060` هیچ ستون `operation_id` تازهای نگرفت؛ `0061` و رفتار per-batch import
  بدون تغییر ماندند.
- نتیجهٔ CI دقیق SHA نهایی در بدنهٔ PR #14 و گزارش پایانی ثبت میشود؛ شواهد
  محلی بهتنهایی ادعای معادل production یا سبزشدن CI نیست (جزئیات در §۹).

## ۹) تشخیص شکست CI نخستین push و رفع وابستگی زمانی تستها

نخستین push مایلستون با SHA
`975c12f4533996f832c7639ee534c327a1c7df4d` در CI run `42709786143` / job
`129475954785` فقط در دو فایل رگرسیون قدیمی `task24w-conversion-and-parity`
و `task24y-approval-engine` قرمز شد: ۲ فایل ناموفق از ۵۰ فایل و ۱۰ تست ناموفق
از ۱۰۵۳ تست؛ ضمائم در CI سبز بود. این دو فایل «امروز» و `order_date` را با
`new Date().toISOString().slice(0,10)` (UTC) میساختند، در حالی که سرور از
`businessToday()` با منطقهٔ `Asia/Tehran` استفاده میکند. در بازهٔ ۲۰:۳۰ تا
۲۴:۰۰ UTC تاریخ UTC یک روز عقبتر از تاریخ کسبوکار است؛ بنابراین اسناد
«عقبگرد» محسوب و با ۴۰۳، `override_reason_required` بهجای `price_missing`
و مانند آن رد میشدند. اجرای CI در ساعت ۲۲:۱۲ UTC داخل همین پنجره بود. CI
پایهٔ M3 در `8509255` سبز بود ولی در ساعت ۱۹:۴۵ UTC اجرا شده بود و rerun آن
پذیرفته نشد. همان ۱۰ شکست در worktree ایزولهٔ پایه و در همان پنجرهٔ زمانی
محلی بازتولید شد؛ بنابراین این شکست وابسته به ساعت و پیشین است، نه رگرسیون
کد M4.

رفع: فقط این دو فایل تست به `businessToday` / `shiftBusinessDate` از
`src/common/business-date` منتقل شدند؛ هیچ کد production، مهاجرت، workflow یا
فایل `.github` تغییر نکرد. تایید محلی در همان پنجره: ۲ فایل هدف / ۴۸ تست و
۴۶ فایل DB-backed معادل CI / ۹۷۳ تست سبز شدند؛ typecheck ریشه، OpenAPI، drift،
پارتیشن و `git diff --check` نیز سبزاند. نتیجهٔ CI دقیق SHA نهایی، پس از push
این رفع، در بدنهٔ PR #14 و گزارش پایانی ثبت میشود؛ شواهد محلی ادعای معادل
production یا سبزشدن CI نیست.


## ۱۰) اصلاحات F پس از گزارش R

گزارش فقطخواندنی `TASK-PM-01D-M4-R` با حکم `FAIL` نشان داد هدر قابلجعل
`x-request-id` میتواند تطبیق M4 را فریب دهد، `recordRequired` زیر `dms_app`
تلاش DDL میکرد، `0062.down` دفتر پرشده را حذف میکرد و RLS/grantها در نقش
production-equivalent اثبات نشده بودند. F بدون بازنویسی تاریخ M4، این موارد را
در لایهٔ افزودنی `0063` و سرویس/تستها اصلاح کرد:

- شواهد `audit_log.bulk_operation_id`،
  `product_catalog_history.bulk_operation_id` و
  `product_bulk_history_event` جایگزین `request_id` کلاینت شدند؛
- `GET /operations/{id}` واقعاً فقطخواندنی شد و اکشن صریح
  `POST /operations/{id}/reconcile` اضافه شد؛
- `AuditService.recordRequired` دیگر `fn_ensure_partitions` صدا نمیکند؛ کمبود
  پارتیشن `AuditPartitionMissingError` و rollback کامل میدهد؛
- `0062.down` و `0063.down` روی دادهٔ پرشده fail-closed شدند؛
- قفل به `company+operation` محدود، توکن زمان-ثابت و GUC فقطتراکنشی شد؛
- سوئیت واقعی `dms_app`، OpenAPI/کلاینت/UI و اسناد F همتراز شدند.

شواهد دقیق، ماتریس حکم `PASS WITH FINDINGS` خودارزیابی، `UNVERIFIED`ها و اینکه
حکم R تا بازبینی مستقل پابرجاست، در `TASK-PM-01D-M4-F_IMPLEMENTATION.md` و
`evidence/task-pm-01d-m4-f/VERIFICATION.txt` است. SHA نهایی و CI دقیق F پس از
push در بدنهٔ PR #14 ثبت میشود؛ اینجا یک هش خودارجاعی کهنه درج نشده است.
