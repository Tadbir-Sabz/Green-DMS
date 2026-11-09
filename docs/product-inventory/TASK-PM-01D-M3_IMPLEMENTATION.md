# TASK-PM-01D-M3 — تکمیل Product Master و آمادگی عملیاتی

**وضعیت:** یک برش عمودی تازه و قابل استفاده تحویل شد؛ مالکیت مرکزی کاتالوگ، RLS،
تاریخچه تغییرناپذیر، مجوزهای موجود و مرزهای fail-closed بدون تغییر مانده است.
تصمیم «همه‌یاهیچ بودن کل فایل import» و PM-B1 تا PM-B8 همچنان **OPEN / NOT APPROVED**
هستند. هیچ merge، استقرار، اتصال به پایگاه داده اشتراکی/تولیدی، تغییر شاخه محافظت‌شده،
force-push، بازنویسی تاریخچه یا شاخه/PR تازهای انجام نشد.

**مبنای دقیق:** `df6ff0ecde8985c95942b1f1942b000b19c126e3` (پایان M2 / آغاز M3).
SHA نهایی این commit در بدنه PR #14 و گزارش نهایی ثبت میشود؛ در خود commit قرار
نگرفته تا ارجاع به SHA خودcommit ناسازگار نشود. PR #14 همچنان `OPEN / DRAFT` است.

---

## ۱) حفظ مبنا و راستیآزمایی آغازین

| مورد | نتیجه |
|---|---|
| وضعیت کارtree | تمیز؛ `git status --short --branch` فقط شاخه `arena/be5eaff3-green-dms` |
| HEAD محلی / remote / PR #14 | هر سه `df6ff0ecde8985c95942b1f1942b000b19c126e3` |
| PR #14 | `pr_open`، OPEN/DRAFT، base `main`، headRef همان شاخه |
| شواهد PM-01A تا M2 | حفظ شد؛ پچ بازیابی `/tmp/pm01dm2-recovery-worktree.patch` و `stash@{0}` دستنخورده |
| رفتار import و مهاجرت `0061` | همان M2: دستههای ۱۰۰تایی، وضعیت/نتیجه/مکاننما/تلاش، RLS و grantهای `dms_app` |
| رگرسیون ورود گروهی پیش از تغییر | `product-master-import*.test.ts` = **۲۲/۲۲ PASS** روی PostgreSQL بومی ایزوله |
| قرارداد/کلاینت/UI محصول | ۱۲ کنترلر master-data، ۱۴ فایل وب محصول، ۱۹۵ مسیر OpenAPI پیش از M3 بررسی شد |
| یافته اولیه | هیچ `GET /products/export` و هیچ مسیر نگهداشت گروهی در مسیرهای محصول وجود نداشت |

---

## ۲) ارزیابی توانمندیهای واقعی Product Master

ارزیابی زیر از کد، مهاجرتها، قرارداد، UI و تستهای موجود استخراج شده است. capability
پیادهمشده دوباره بهعنوان «کمبود» گزارش نشده است.

| توانمندی | پیادهمشدهٔ موجود | کمبود واقعی پس از M3 | ارزش کسبوکار | وابستگیها | اثر امنیتی | آمادگی |
|---|---|---|---|---|---|---|
| هویت و اسکن کالا | CRUD، کد دستی/خودکار، یکتایی SKU، alias، بارکد نوعمحور، `scan`، `duplicate-check` | پروفایل کیفیت داده و قواعد تکمیل بودن فیلدها | کاهش اشتباه ورود و تکراری | جداول `0046`، `master.product.view/update` | resolution قطعی و جلوگیری از ابهام | **PASS WITH FINDINGS**؛ بررسی مرورگری UNVERIFIED |
| چرخه حیات مرکزی | وضعیت active/blocked/discontinued، حذف نرم، `row_version`، قفل D4، غیرفعالسازی خانواده، تاریخچه `0060` | اتصال قطعی تأیید دوم-person به G-03؛ چرخه عضویت دامنه | جلوگیری از تغییر حساس بیتأیید | `product-sensitivity.ts`، `AuditService`، تصمیم مالک | تأیید صریح فعلی جایگزین امضای شخص دوم نیست | **PASS WITH FINDINGS**؛ عضویت دامنه **BLOCKED** روی PM-B1..B8 |
| مدیریت کاتالوگ | خانواده/گروه، صفات/enum، روابط، بسته D5، بستهبندی، لیست قیمت، پروموشن | نگهداشت گروهی هدفمند فیلدهای غیرحساس با پیشنمایش و diff | صرفهجویی اپراتور در تغییرات انبوه | سرویس نوشت موجود، `CatalogAccess.write`، تاریخچه `0060` | باید D4 و قفل خوشبینانه حفظ شود | **PASS WITH FINDINGS**؛ برش بعدی پیشنهادی |
| قابلیت حمل داده / خروجی | **M3:** `GET /products/export`، snapshot فقطخواندنی، فیلتر، سقف، هشدار بریدگی، UI فارسی | خروجی چندجدولی شامل تاریخچه/صفات/روابط/بستهها؛ مرکز عمومی G-13 | پشتیبان قابل حمل، تطبیق و بازیابی | مجوز `master.product.view`، RLS، `AuditService` | ممیزی export، CSV injection mitigation، no-store | **PASS WITH FINDINGS**؛ خروجی فقط snapshot کالا است |
| ورود گروهی / پایش | validate، commit، idempotency، نتایج دستهبه دسته، گزارش، تلاش مجدد امن، توقف نتیجه نامشخص | فهرست سراسری importها، retry بخشی در UI، و **سیاست کل فایل** | کاهش ابهام اپراتور | `0061`، تصمیم مالک، BullMQ/صف در صورت تصویب | تاریخچه دستههای committed نباید بازنویسی شود | **PASS WITH FINDINGS**؛ کل فایل **OPEN / NOT APPROVED** |
| شواهد و مستندات محصول | تاریخچه مرکزی/هر کالا، API ضمائم با `owner_type=product` | UI بارگذاری/فهرست/دانلود مدرک محصول | ردیابی مدارک فنی/مالیاتی | attachments/MinIO، `attachment.upload/view` | نیازمند بررسی RLS و URL امضاشده | **UNVERIFIED**؛ API هست، جریان کاربری محصول نه |
| کنترل کیفیت / اعتبارسنجی | اعتبارسنجی import، D2 تکرار، D4 حساس، D5 بسته، `duplicate-check` | داشبورد کیفیت، امتیاز تکمیل، هشدار طبقهبندی قدیمی | پیشگیری از داده ناقص | سرویسهای خواندنی موجود | فقط خواندنی، بدون مجوز تازه | **UNVERIFIED** |
| حاکمیت دامنهای | دروازه fail-closed، وضعیت یکپارچگی، تاریخچه مرکزی allowlistشده | رجیستری دامنه، عضویت، مجوز دامنهای، چرخه حیات، cutover | توزیع عملیاتی واقعی | تصمیم PM-B1..B8 + IAM | بدون تصویب، هیچ هویت دامنهای اختراع نشود | **BLOCKED / NOT APPROVED** |
| UX فارسی RTL | فهرست، جزئیات، تنظیمات، تاریخچه، import، **export M3** | بازبینی دستی responsive/a11y/clean-console و راهنمای چاپی | پذیرش کاربر نهایی | مرورگر، فونت، Jalali در صورت نیاز | جلوگیری از افشای فیلتر در URL/cache | **PASS WITH FINDINGS**؛ بررسی دستی UNVERIFIED |

---

## ۳) برش انتخابشده: خروجی CSV کاتالوگ مرکزی

دلیل انتخاب: خروجی محصول وجود نداشت؛ برش فقطخواندنی است؛ به تصمیم PM-B1..B8
وابسته نیست؛ از مجوز، RLS، تاریخچه و حداقلدسترسی موجود استفاده میکند؛ و یک جریان
کامل «فیلتر → درخواست → snapshot سرور → دانلود → بازخورد» به کاربر میدهد. مرکز
عمومی import/export (G-13) همچنان ظرفیت آیندهٔ مستقل است و ادعا نمیشود پیاده شده است.

### تحویل واقعی

- `GET /api/v1/products/export` با همان فیلترهای `q`, `status`, `category_id`,
  `brand_id`, `sort` و سقف `limit` (پیشفرض/حداکثر ۱۰٬۰۰۰ ردیف؛ `limit=10001` رد میشود).
- Authorization لایهدوتایی: `AuthGuard` + `PermissionsGuard` با `master.product.view`،
  و `CatalogAccess.assert` درون همان تراکنش خواندنی. `companyId`/`userId` فقط از نشست.
- یک تراکنش `REPEATABLE READ READ ONLY` با GUCهای `app.company_id`/`app.user_id`؛
 joinهای گروه/خانواده/برند/واحد/مالیات و بارکد اصلی در همان snapshot خوانده میشوند.
  RLS و predicate صریح `company_id` هر دو باقی میمانند؛ قفل نوشتن کاتالوگ گرفته نمیشود.
- CSV قطعی با BOM UTF-8، CRLF، quoting RFC 4180 و خنثیسازی فرمولهای صفحه گسترده
  (`=`, `+`, `-`, `@`, tab/CR آغازین). ستونهای قابل مصرف import حفظ شدهاند؛ ستونهای
  تشخیصی اضافی توسط import نادیده گرفته میشوند.
- سربرگهای `X-Product-Export-Row-Count`، `X-Product-Export-Truncated`،
  `X-Product-Export-Max-Rows` و `Cache-Control: no-store`. اگر نتیجه بیش از سقف باشد،
  فایل بریده میشود ولی بریدگی بهصراحت اعلام میگردد؛ بریدگی بیصدا ممنوع است.
- ممیزی `audit_log` با `action='export'`, `entity_type='product_catalog'` و فقط
  Metadata فیلتر/تعداد، بدون محتوای ردیفها. ثبت ممیزی بیرون تراکنش خواندنی است و
  شکست آن خواندن موفق را باطل نمیکند (رفتار موجود `AuditService`).
- قرارداد OpenAPI، کلاینت TS تولیدشده، و دکمهٔ «خروجی CSV» در فهرست کالاها با اعمال
  همان فیلتر جاری، نام فایل امن، پیام فارسی کامل/ناقص و وضعیت بارگذاری.
- تستهای تازه: واحد سریالسازی CSV، واحد کمکی مرورگر، و تست DBبومی برای فیلتر،
 _projections مرجع، بارکد اصلی، بریدگی، جداسازی شرکت، ممیزی، ۴۰۰/۴۰۱/۴۰۳.

**غیر اهداف صریح:** خروجی شامل تاریخچه، صفات، روابط، بستهها، بستهبندی، عضویت
دامنهای یا فایل پشتیبان کامل پایگاه داده نیست. مجوز تازهای اختراع نشد؛ هیچ مهاجرت
پایگاه داده، صف، BullMQ worker، تغییر `0061` یا تغییر رفتار import اضافه نشد.

---

## ۴) تصمیم مالک دربارهٔ اتمیّت کل فایل: OPEN / NOT APPROVED

درخواست رسمی و پرسشهای دقیق در
[`TASK-PM-01D-M3_WHOLE_FILE_ATOMICITY_OWNER_DECISION.md`](./TASK-PM-01D-M3_WHOLE_FILE_ATOMICITY_OWNER_DECISION.md)
آمده است. خلاصهٔ تمایزها:

| مفهوم | معنی | وضعیت فعلی M2 |
|---|---|---|
| اتمیّت هر دسته | هر دستهٔ ۱۰۰تایی مستقلاً commit یا rollback میشود | **پیادهمشده و حفظشده** |
| اتمیّت کل فایل | شکست هر دسته ⇒ undo دستههای موفق پیشین؛ فایل یا همه یا هیچ | **تصمیم مالک، پیاده نشده** |
| موفقیت جزئی | دستههای موفق باقی میمانند، دستههای بعدی ادامه/شکست مییابند | **رفتار مصوب §E فعلی** |
| retry/recovery | همان `idempotency_key` نتیجهٔ قطعی را replay میکند؛ `processing` رهاشده resume؛ نتیجهٔ نامشخص ⇒ توقف بررسی اپراتور | **پیادهمشده**؛ retry صرفاً بخشی از UI و سیاست کل فایل تعریف نشده |

M3 هیچ تغییر بیتأییدی در رفتار مصوب «همهیاهیچ در هر دسته + ادامه» نداده است. بدون پاسخ مالک و
شواهد acceptance، هیچکس مجاز به علامتگذاری این تصمیم بهعنوان approved نیست.

---

## ۵) پیگیری قابلیتاطمینان import بر اساس معماری واقعی

| پرسش | یافته مبتنی بر کد | تصمیم M3 |
|---|---|---|
| آیا BullMQ برای import محصول لازم است؟ | `ProductMasterService.commitImport` بهصورت HTTP همزمان و درون همان درخواست اجرا میشود. `queue.module.ts` فقط صفهای `invoice-jobs`, `sms-jobs`, `report-jobs` را دارد؛ worker/صف محصول وجود ندارد. طراحی §E به job اشاره کرده ولی معماری پیادهمشده صف نیست. | **خیر**؛ صرفاً برای تطابق چکلیست زیرساخت اضافه نشد. |
| آیا اشباع صف/backpressure نیاز پیادهسازی دارد؟ | مسیر همزمان است، سقف §E برقرار است (≤۱۰٬۰۰۰ ردیف/≤۱MB، دستههای ۱۰۰تایی). بار سنجیدهای اندازهگیری نشده است. | **UNVERIFIED**؛ کنترل تازهای بدون سناریوی شکست واقعی اضافه نشد. |
| آیا قطع شبکه / commit مبهم کنترل بیشتر میخواهد؟ | M2 دارای atomic idempotency claim، outcome تراکنشی، resume `processing`، replay terminal و توقف اپراتور برای unknown است. شبکهپارتیشن واقعی و ACK loss آزمایش نشدهاند. | تضمینهای M2 برای معنای «هر دسته» کافیاند؛ برای semantic کل فایل کافی نیستند و به تصمیم مالک وابستهاند. |
| آیا تضمینهای retry/idempotency M2 کافیاند؟ | برای جلوگیری از اثر دوباره و جلوگیری از حدس نتیجهٔ مبهم، بله؛ برای «فایل کامل یا هیچ» و retry جزئی در UI، خیر. | **PASS WITH FINDINGS**؛ بدون ادعای معادل production/Redis/PostGIS واقعی. |

---

## ۶) شواهد اعتبارسنجی متناسب با تغییرات واقعی

تمام دستورها روی همان working tree اجرا شدند؛ SHA دقیق نهایی در گزارش نهایی و بدنه
PR ثبت میشود. محیط DB محلی: PostgreSQL 16.2 UTF8 ایزوله، `127.0.0.1:55432`،
بدون PostGIS واقعی؛ خطاهای `ECONNREFUSED 127.0.0.1:6379` از نبود Redis در محیط محلی،
غیرمسدودکننده و مطابق M2 هستند.

| دستور | نتیجه |
|---|---|
| `npm run openapi:check` | exit 0؛ **۱۹۶ مسیر / ۲۷۹ عملیات / ۱۴۱ اسکیما / ۳ وب هوک** |
| `npm run generate -w packages/api-client` + `npm run build -w packages/api-client` | exit 0؛ `schema.ts` و `dist` بازتولید شد |
| `node scripts/contract-drift.mjs` | exit 0؛ drift مسیر/enum/required = **۰** |
| `node scripts/check-test-partition.mjs` | exit 0؛ **۷۵ فایل**، manifest == partition محاسبهشده |
| `vitest run test/product-export-unit.test.ts test/product-export.api.test.ts test/product-master-import.test.ts test/product-master-import-reliability.test.ts` | **۴ فایل / ۳۰ تست PASS** |
| `vitest run test/contract.api.test.ts test/products.api.test.ts test/product-master-core.test.ts test/product-master-security.test.ts test/product-master-rls.test.ts test/product-catalog-foundation.test.ts test/product-master-import*.test.ts test/product-export*.test.ts` | **۱۰ فایل / ۲۳۰ تست PASS** |
| `--print unit` + `vitest run <unit files>` (بدون DATABASE_URL) | **۲۵ فایل / ۳۳۵ تست PASS** |
| `npm run test:web` | **۱۵ فایل / ۸۲ تست PASS** |
| `npm run typecheck` | exit 0 (contracts، api-client، API، Web) |
| `npm run build` | exit 0؛ ۵۵ صفحه Next.js |
| `git diff --check` | exit 0 |

رگرسیون ورود گروهی، قرارداد، مسیرهای محصول، امنیت Product Master، RLS، تاریخچه
کاتالوگ و ممیزی انجام شد؛ مجموعههای نامرتبط تکرار نشدند. CI دقیقاً روی SHA نهایی
پس از push بررسی و در بدنه PR / گزارش نهایی ثبت میشود.

---

## ۷) یافتههای امنیتی و مرزها

- مجوز `master.product.view` همان مجوز فهرست است؛ سقف و ممیزی اضافه شد، ولی
  **سیاست جداگانه «دانلود انبوه» تصویب نشده است**. اگر مالک بخواهد خروجی انبوه
  مجوز محدودتر/جداگانهای داشته باشد، این یک تصمیم IAM مستقل است و در M3 اختراع نشد.
- `Cache-Control: no-store`، عدم قرارگیری فیلتر در بدنه cache، خنثیسازی فرمول،
  نام فایل فقط basename و عدم افشای محتوای ردیفها در audit اعمال شد.
- تراکنش خواندنی فقطخواندنی است؛ قفل نوشتاری، تغییر تاریخچه، grant تازه، نقش
  دامنهای، `company_id` از کلاینت، یا دور زدن RLS اضافه نشد.
- PM-B1..PM-B8، تأیید دوم-person، بررسی مستقل Agent2، saturation-load، BullMQ
  واقعی، network-partition/ACK loss، و بازبینی دستی RTL/a11y/clean-console همچنان
  **OPEN / UNVERIFIED / BLOCKED** باقی ماندند.

---

## ۸) برآورد تکمیل و ماژول بعدی

برآورد صادقانه بر حسب کار باقیماندهٔ واقعی، نه درصد تقویمی:

1. **گذر مالک:** تصمیم کل فایل import + PM-B1..PM-B8 و امضای IAM/امنیت ⇒ **BLOCKED**.
2. **برشهای مستقل قابل اجرا بدون تصمیم مالک:** نگهداشت گروهی فیلدهای غیرحساس،
   شواهد/ضمائم محصول، داشبورد کیفیت داده، پایش سراسری import ⇒ حداقل ۳ تا ۴ برش
   عمودی همراه قرارداد/تست/UI.
3. **گیتهای کیفی:** اتصال تأیید دوم-person، تست بار اشباع، بررسی مرورگری دستی،
   بررسی مستقل ⇒ **UNVERIFIED**.
4. **دامنه عملیاتی:** پس از تصویب PM-B1..B8 ⇒ ماژول `TASK-PM-01E` وابسته به رجیستری،
   IAM و تاریخچه عضویت ⇒ **BLOCKED**.

بنابراین «عملیاتی کامل بودن کل Product Master» همچنان **BLOCKED** است؛ برش M3
**PASS WITH FINDINGS** و بهتنهایی یک قابلیت قابل استفاده است، نه اعلام ختم ماژول.

**ماژول بعدی پیشنهادی:** «نگهداشت گروهی کنترلشدهٔ کالا برای فیلدهای غیرحساس»
(انتخاب چند کالا، پیشنمایش diff، اعمال از همان `CatalogAccess.write`، قفل خوشبینانه،
تاریخچه `0060` و ممیزی). این برش به تصمیم PM-B1..B8 وابسته نیست، ولی باید فیلدهای
حساس D4 را حذف کند یا آنها را به گیت تأیید دوم-person تصویبشده موکول نماید.

---

## ۹) فایلها و پیوندها

- پیادهسازی: `product-export.{dto,controller,service}.ts`, `product-export.ts`,
  `product.repository.ts`, `master-data.module.ts`, `packages/contracts/openapi.yaml`,
  `packages/api-client/src/schema.ts`, `apps/web/src/app/products/page.tsx`,
  `apps/web/src/app/products/export.ts`.
- تستها: `apps/api/test/product-export-unit.test.ts`,
  `apps/api/test/product-export.api.test.ts`, `apps/web/src/app/products/export.test.ts`.
- راهنمای کاربر فارسی:
  [`PRODUCT_MASTER_OPERATOR_GUIDE_FA.md`](./PRODUCT_MASTER_OPERATOR_GUIDE_FA.md).
- درخواست تصمیم مالک:
  [`TASK-PM-01D-M3_WHOLE_FILE_ATOMICITY_OWNER_DECISION.md`](./TASK-PM-01D-M3_WHOLE_FILE_ATOMICITY_OWNER_DECISION.md).
