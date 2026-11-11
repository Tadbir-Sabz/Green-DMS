# TASK-PM-02-C2 — مدیریت دادههای مرجع کالا (برند / واحد / دسته)

> وضعیت: **توسعهٔ مستقل `PASS`** · پذیرش کامل Product Master همچنان **`BLOCKED`** ·
> استقرار تولید **`NOT AUTHORIZED`** · PR #14 همچنان `OPEN / DRAFT`.
> این سند جایگزین گزارش C1 یا مصوبات D1–D5/§A/§F نیست؛ پیوستی افزوده است.

---

## ۱) مبنا، شاخه و حفظ شواهد

| مورد | مقدار |
| --- | --- |
| مبنای C2 / آخرین SHA پیش از کار | `aa0028a02631728383533fbcd18461017fe29037` |
| شاخه | `arena/be5eaff3-green-dms` · PR #14 `OPEN / DRAFT` · base `main` |
| کامیت پیادهسازی C2 | `8199a6f8aa89480cd4f97d8ff51f93c3c99146ba` (معمولی، ۲۷ فایل / ۵۷۹۱+/۱۰۱−) |
| چکپوینت قابل بازیابی | `/home/user/pm02-c2-checkpoint.tar.gz` · sha256 `47e27a3cea42bc1bb309c0c61f96ddb6f47358d508c4af2dca19c2b41de408f4` · ۲۸۵۴ فایل · ۰ مغایرت |
| بدنهٔ PR پیش از C2 | ۹۰٬۲۳۴ نویسه / ۹۵٬۱۴۰ بایت · sha256 `158ab809b2af4034584c04e8ffc2685816a05ce9d9eac161b630bd56d47ee984` |
| محیط | Node `v22.22.3` · npm `10.9.8` · PostgreSQL بومی `16.2` (trust-auth، `127.0.0.1:55432`) |

`git fetch` / `git pull --ff-only` در مبنا `Already up to date` و `git diff --check=0` بود.
همهٔ کامیتها معمولی و pushها fast-forward به **همان شاخه** انجام شد؛ هیچ amend،
force-push، reset، rebase، merge، approve، release، deploy، تغییر CI/secret یا دسترسی
به پایگاهداده/زیرساخت تولید انجام نشد. چکپوینت C2 از پیش موجود بود و بازسازی نشد.

---

## ۲) واجدشرایطبودن و همسنجی با پیوست C1

C2 بند بازماندهٔ `GAP_REGISTER.md` G-06 یعنی **«مدیریت کامل UI برای
uom/category/brand»** را هدف گرفت. مستندات بالادستی این کار را جزو کارهای مرکزی
مستقل میدانند، نه تصمیم دامنهای:

- `PRODUCT_MASTER_TARGET_DESIGN.md` §A: «گروه/برند … موجود … بدونِ تغییر» و §۰:
  بقیهٔ موارد §۸ (از جمله تصویر و دادههای کاتالوگ) «تصمیمِ دامنهای نمیخواهند».
- همان سند §F: «سایر فیلدها (… برند/گروه …) = RBAC عادی `master.product.*` +
  audit»؛ «واحدِ پایه و فاکتور تبدیل» حساس D4اند. C2 **رکورد مرجع** واحد را
  مدیریت میکند، ولی حساسیت `base_uom_id` و `factor_to_base` را تغییر نمیدهد.
- `GAP_REGISTER.md` یادداشت C1 صریحاً نوشته بود G-06 همچنان باز است، چون
  «مدیریت کامل UI برای uom/category/brand» و G-13 باقیاند.

**همسنجی مهم:** جدول انتهای `TASK-PM-02-C1_IMPLEMENTATION.md` و جملهٔ پایانی
پیوست C1 در `PRODUCT_MASTER_TARGET_DESIGN.md` عبارت «برند/UOM … `BLOCKED`
(عمداً انجام نشد)» را در **محدودهٔ C1** ثبت کردهاند. آن عبارت یک حکم مالک،
یک `PM-B*` یا مصوبهٔ دامنهای نیست؛ فقط اعلام «خارج از محدودهٔ C1» است. C2
همین کار مرکزی را طبق §A/§F و G-06 انجام داد، بدون آنکه متن تاریخی C1 بازنویسی
شود یا تصمیم مالکی مصرف گردد. `TASK-PM-02_OWNER_DECISION_REGISTER.md` §7 این
همسنجی را نیز ثبت میکند.

---

## ۳) طراحی، مرزها و تصمیمات

| تصمیم | نتیجه |
| --- | --- |
| مهاجرت | `0065_reference_data_admin.{up,down}.sql` — **افزودنی و reversible**؛ ستونهای `code/name_latin/is_active/created_at/updated_at` برای `brand`، `name_latin/created_at/updated_at` برای `product_category`، `symbol/title_latin/is_active/created_at/updated_at` برای `uom`، ایندکس جزئی `uq_brand_code(company_id,code) where code is not null`، ایندکس کد/والد فعال و commentها. قید `uq_brand_name`، یکتایی کد دسته، `uom.code` و چک `decimal_places 0..4` حفظ شد. |
| مالکیت | `brand` و `product_category` شرکت-محور با RLS موجود ۰۰۴۱؛ `uom` سراسری، بدون `company_id` و بدون RLS (وضعیت پیشین). هیچ backfillـی برای ردیفهای قدیمی `brand.code=NULL` انجام نشد. |
| مجوز | خواندن = `master.product.view`؛ نوشتن = `master.product.update` از مسیر `CatalogAccess.write`؛ **هیچ نقش/مجوز/seed/RLS/grant تازهای** ساخته نشد. |
| ممیزی | `AuditService.recordRequired` در همان تراکنش برای create/update/delete؛ `GET /reference-data/history` فقطخواندنی و شرکت-محور. |
| مرز B2 | `DomainBoundaryGuard` روی همهٔ مسیرها؛ `x-domain-id` و پارامتر/بدنهٔ ناشناخته بهترتیب `400` صریح میگیرند، نه حذف خاموش. |
| قواعد | نرمالسازی متن/کد، سقف `limit=200` / پیشفرض ۵۰، `offset` امن، عمق حداکثر ۱۲، `decimal_places` فقط `۰..۴` (D3)، کد واحد تغییرناپذیر و lowercase، جلوگیری از حلقهٔ دسته، والد/مقصد انتساب فقط فعال، حذف رکورد درحالاستفاده ممنوع، `reassign_to` ایمن برای کالاها و زیردستهها. |
| یکپارچگی محصول | `ProductService.assertReferences` حالا **دسته/برند/واحد فعال** و همشرکتی را سرورسمت راستیآزمایی میکند (`invalid_category` / `invalid_brand` / `invalid_uom`). D4، قفل خوشبینانه، `confirm_sensitive` و snapshotهای اسناد دستنخوردهاند. |
| ممنوعیتها | بدون تبدیل ضمنی واحد، بدون `domain_id`/عضویت/چرخهٔ حیات/دسترسپذیری، بدون مالکیت دامنهای برای دسته، بدون حذف ناامن، بدون کنترل تزئینی/نمایشی، بدون اسکیمای جدید خارج از قرارداد. |

---

## ۴) فایلها و تحویل واقعی

**بکاند:** `reference-data.{rules,repository,service,controller}.ts`، سیمکشی در
`master-data.module.ts`، `activeCategoryExists`/`activeBrandExists`/`activeUomExists`
در `product.repository.ts`، `assertReferences` در `product.service.ts`، مهاجرت ۰۰۶۵.
هفت خانوادهٔ مسیر `/reference-data/*`: `history`، `brands`، `brands/{id}`،
`units`، `units/{id}`، `categories`، `categories/{id}` (در شمارش OpenAPI هفت مسیر،
با GET/POST/PATCH/DELETE مربوطه).

**قرارداد/کلاینت:** `packages/contracts/openapi.yaml` و
`packages/api-client/src/schema.ts` (تولیدشده با `openapi-typescript 7.13.0`،
+۷۲۶ خط). هیچ مسیر قدیمی حذف یا تغییر معنا نیافت.

**فرانتاند RTL:** صفحهٔ چهارتبهٔ `/products/reference-data`
(برندها / واحدها / دستهها / تاریخچه)، جستوجو، فیلتر وضعیت، فیلتر ریشه،
صفحهبندی سرورمحور، جزئیات + کالاهای متصل، فرم ساخت/ویرایش، فعال/غیرفعالسازی،
حذف با dialog تأیید و انتساب اجباری وابستگان، نمایش عمق/مسیر درختی RTL،
برچسبهای فارسی، اعداد فارسی، حالتهای بارگذاری/خطا/خالی/تلاش مجدد، و گیت
`master.product.view|update`. `ReferenceSelectors` در `/products/new` و
`/products/{id}` سه انتخابگر واقعی گروه/واحد/برند را با قرارداد تازه پر میکند؛
در حالت ساخت فقط مراجع فعال، در حالت ویرایش مقدار تاریخی غیرفعال قابلنمایش ولی
غیرقابلانتخاب مجدد. فهرست کالاها ستونهای برند و واحد پایه و پیوند مدیریت را گرفت؛
`settings` نیز به صفحهٔ جدید پیوند خورد. هیچ انتخابگر دامنهای ساختگی اضافه نشد.

**تستها/شواهد:** `apps/api/test/reference-data-rules.test.ts`،
`reference-data.api.test.ts`، `apps/api/test/migrations-security.test.ts`
(بهروزرسانی آگاهانهٔ آخرین مهاجرت)، `apps/api/test/setup-pg-guard.ts`
(نگهبان رویداد `57P01` در teardown)، سه فایل تست وب، و
`evidence/task-pm-02/VERIFICATION-C2-LIVE.txt`.

---

## ۵) رفتار API و پایگاهداده

- **برند:** فهرست با `q/is_active/limit/offset` و `product_count`؛ ساخت/ویرایش
  کد/نام/نام لاتین/وضعیت؛ یکتایی نام و کد در شرکت؛ جزئیات شامل کالاهای متصل؛
  حذف فقط وقتی `product_count=0`، وگرنه `brand_in_use` + پیشنهاد غیرفعالسازی.
- **واحد:** فهرست سراسری با `decimal_places` و `product_count`/`packaging_count`؛
  ساخت/ویرایش عنوان/نماد/لاتین/دقت/وضعیت؛ کد پس از ساخت تغییرناپذیر؛ دقت `۵`
  رد میشود؛ حذف تنها بدون ارجاع کالا/بستهبندی (`unit_in_use`)؛ بدون تبدیل ضمنی.
- **دسته:** فهرست با `q/is_active/root/limit/offset`، `parent_id`/`parent_name`،
  `child_count`/`product_count`؛ جزئیات شامل `ancestors`/`children`/`products`؛
  ساخت/جابهجایی با جلوگیری از حلقه و عمق؛ والد یا مقصد انتساب غیرفعال
  `invalid_parent_id` / `invalid_reassign_to`؛ حذف درحالاستفاده بدون
  `reassign_to` = `category_in_use`، با مقصد فعال = انتقال اتمی کالاها و فرزندان.
- **خطاها:** بدنهٔ ناشناخته پیش از ValidationPipe = `unsupported_request_field`؛
  پارامتر ناشناخته = `unsupported_query_parameter`؛ پیامهای فارسی ساختگیافته؛
  بدون نشت `company_id` از کلاینت.
- **محصول:** ساخت/ویرایش کالا با دسته/برند/واحد ناموجود، غیرفعال یا شرکت دیگر
  `400` صریح میگیرد؛ ویرایش سایر فیلدها روی کالای قدیمی، مرجع تاریخیاش را
  بیدلیل بازنویسی نمیکند.

---

## ۶) فرانتاند و دسترسپذیری ساختاری

صفحه و انتخابگرها `dir="rtl"`، برچسبهای فارسی، `aria-label`/`role="tablist"`/
`role="dialog"`، پیمایش تبها با کلیدهای چپ/راست، focus_ring، `role="alert"`/
`role="status"`، `caption` و `sr-only` برای جدول/عمق دارند. کنترلهای نوشتن برای
نشست فقطخواندنی رندر نمیشوند؛ خطا/تلاش مجدد/خالی/درحالبارگذاری همگی واقعیاند.
هیچ اسکرینشات ساختگی، کنترل غیرفعال بیربط یا انتخابگر دامنهای تزئینی ساخته نشد.
**بازبینی دستی مرورگر، a11y عملی و خطاهای کنسول همچنان `UNVERIFIED`** است، زیرا
باینری مرورگر Playwright در سندباکس موجود نیست؛ بهجای آن ۱۷ تست jsdom و شاهد
زندهٔ همانمبدأ ارائه شد.

---

## ۷) تستها و نتایج واقعی

| دروازه | نتیجه | شاهد / فرمان |
| --- | --- | --- |
| تستهای متمرکز C2 (قواعد + HTTP) | **PASS** ۱۶/۱۶ | `cd apps/api && npx vitest run test/reference-data-rules.test.ts test/reference-data.api.test.ts` → ۲ فایل، ۷+۹ تست؛ `/tmp/pm02c2-api-tests6.log` |
| تستهای متمرکز وب C2 | **PASS** ۱۷/۱۷ | `cd apps/web && npx vitest run src/app/products/reference-data/*.test.*` → ۶+۴+۷؛ `/tmp/pm02c2-web-tests3.log` |
| مجموعهٔ کامل وب | **PASS** ۲۲ فایل / ۱۱۸ تست | `npx vitest run`؛ مبنای C1 ۱۹/۱۰۱؛ `/tmp/pm02c2-web-full.log` |
| واحد بیدادهٔ کامل API | **PASS** ۳۲ فایل / ۳۸۹ تست | `check-test-partition --print unit` + Vitest؛ مبنای C1 ۳۱/۳۸۲؛ `/tmp/pm02c2-api-unit-final.log` |
| قرارداد اجراشده | **PASS** ۸۰/۸۰ | `npx vitest run test/contract.api.test.ts`؛ `/tmp/pm02c2-contract-api-final.log` |
| OpenAPI / drift / کلاینت | **PASS** | ۲۱۱ مسیر / ۳۰۴ عملیات / ۱۷۴ اسکیما / ۳ webhook؛ drift=۰ (۳۰۴/۳۰۴)؛ `schema.ts` +۷۲۶؛ `/tmp/pm02c2-static-checks.log` |
| پارتیشن تست / diffcheck | **PASS** | ۹۰ فایل declared==computed؛ `git diff --check=0` |
| `npm run typecheck` | **PASS** | تمام ورکاسپیسها؛ `/tmp/pm02c2-typecheck-final.log` |
| `npm run build` | **PASS** | packages + API + Next production؛ `/tmp/pm02c2-build-final.log` |
| مهاجرت up → down → up | **PASS** | ۱۰۳۳ شیء یکسان در دو `up`؛ `TEST_DB=greendms_c2_migtest`؛ `/tmp/pm02c2-migrations-final.log` |
| `migrations-security` | **PASS** ۸/۸ | آخرین مهاجرت آگاهانه `0065` شد؛ چرخهٔ ۰۰۶۴ با مبنای شامل ۰۰۶۵ نیز بایتبهبایت بازگشت؛ `/tmp/pm02c2-migsec.log` |
| مجموعهٔ کامل DB-backed API | **PASS عدم رگرسیون** / **FAIL محیط محلی** | ۹۰ فایل / ۱۵۲۴ تست → ۸۵ فایل و ۱۵۰۵ تست PASS؛ ۵ فایل / ۱۹ تست FAIL؛ `/tmp/pm02c2-api-full2.log` |
| کنترل مبنای پاک `aa0028a…` | **PASS** `identical=True` | همان ۵ فایل و همان ۱۹ عنوان شکست در worktree detached؛ PostGIS/trust-auth/قرارداد Tour/نبود MinIO واقعی؛ `/tmp/pm02c2-baseline-tests.log` |
| شاهد زندهٔ همانمبدأ | **PASS** | login، ساخت/ویرایش/غیرفعالسازی برند و واحد، سلسلهمراتب/حلقه، ساخت کالا با سه مرجع، رد برند غیرفعال، حذف امن + `reassign_to`، ممیزی، رد پارامتر/بدنه/هدر دامنهای؛ `evidence/task-pm-02/VERIFICATION-C2-LIVE.txt` و `/tmp/pm02c2-live7.log` |

**خطای حلشده و ثبتشده:** نخستین اجرای کامل DB بهدلیل `migrations-security.test.ts`
که آخرین مهاجرت را `0064` فرض کرده بود ۶ فایل / ۲۶ شکست داشت. این یک ناسازگاری
واقعی تست با مهاجرت تازه بود؛ تست آگاهانه به `0065` بهروز شد و اجرای دوم دقیقاً
به همان ۵/۱۹ شکست محیطی مبنا برگشت. همچنین انتظار نرمالسازی `\u0649→\u06CC`
در تست قواعد با واقعیت `normalizeText` همراستا شد، کد واحد پیش از regex lowercase
شد، و نگهبان `pg.Client` خطای `57P01` teardown را بیاثر کرد. هیچکدام پنهان
نشدهاند.

---

## ۸) محدودیتها، CI و مرز مالک

- **CI روی SHA نهایی:** شناسهٔ دقیق، شش نمای SHA و نتیجهٔ workflowها در بدنهٔ
  PR #14 و گزارش نهایی چت ثبت میشود تا از خودارجاعی مخزن پرهیز شود. تا اجرای
  واقعی، `queued` / `conclusion=null` هرگز `PASS` گزارش نمیشود. CI نهایی C1
  (`aa0028a…`) همچنان `UNVERIFIED / PENDING` است؛ هیچ کامیت مصنوعی برای trigger
  ساخته نشد.
- **مرورگر دستی / a11y / console:** `UNVERIFIED`؛ **round-trip production
  MinIO/S3:** `UNVERIFIED`؛ PostgreSQL محلی trust-auth و بدون PostGIS/Redis
  معادل CI/تولید نیست.
- **PM-B1..PM-B8 / Q1..Q5 / G-03 / دامنه:** `BLOCKED` و بدون تغییر. هیچ سند
  امضاشده، مرجع تصویب، امضای IAM/Security، نمونهٔ پذیرش یا سیاست
  cutover/backfill تازهای پدیدار نشد. `OPERATIONAL_DOMAIN_AUTHORITY` ثبت نشده،
  `DomainCatalogGate` و مسیرهای ۴۰۰/۵۰۳ fail-closedاند.
- **پذیرش کامل Product Master:** `BLOCKED`؛ **استقرار تولید:**
  `NOT AUTHORIZED`؛ PR #14 `OPEN / DRAFT`؛ بدون merge/approve/release/deploy.
- **بدنهٔ PR #14:** بخش C2 بهصورت **افزودنی** و با حفظ بایتبهبایت تمام
  ۹۰٬۲۳۴ نویسه / ۹۵٬۱۴۰ بایت شواهد پیشین اضافه میشود.

---

## ۹) ماژول منطقی بعدی

**پیشنهاد صریح و بدون مجوز مالک:** `TASK-PM-02-C3 — گسترش نمای محصولمحور
ضمائم به سایر موجودیتها` (همان نیمهٔ دوم پیشنهاد C1)، با بازاستفاده از زنجیرهٔ
مالکیت `attachment`، RBAC موجود، ممیزی تراکنشی و مرز B2؛ بدون مهاجرت، بدون
حذف/سیاست بایگانی خودساخته، بدون `is_primary` دستی و بدون معنای دامنهای.
این تنها **توصیه** است و مصوبه نیست.

**گام بعدیِ مسدود:** پس از بستهٔ امضاشدهٔ مالک (جدول ۷ ستونی PM-B1/PM-B2/PM-B4
+ امضای IAM/Security + نمونهها + cutover/backfill + تستهای پذیرش)، ابتدا
registry شرکت-محور، چرخهٔ حیات و انتساب actor→domain با RLS/grants و شواهد
up/down/up، سپس عضویت/دسترسپذیری و مسیرهای ۴۰۰/۵۰۳. G-13 / import round-trip
کامل و whole-file atomicity همچنان وابسته به Q1..Q5اند و نباید زودتر از تصویب
آغاز شوند.

---

## ۱۰) جدول احکام جداگانه

| موجودیت | حکم توسعه/تست | توضیح محدودکننده |
| --- | --- | --- |
| **برند (Brand)** | **PASS** | بکاند + قرارداد + UI + تست HTTP/وب + شاهد زنده PASS. حذف درحالاستفاده `BLOCKED` بهصورت عمدی و ایمن؛ معادل تولید/مرورگر دستی/CI نهایی `UNVERIFIED`. |
| **واحد (Unit/UOM)** | **PASS** | دقت D3 `۰..۴`، کد تغییرناپذیر، بدون تبدیل ضمنی، تست HTTP/وب/زنده PASS. `base_uom_id` محصول همچنان حساس D4؛ معادل production `UNVERIFIED`. |
| **دسته (Category)** | **PASS** | سلسلهمراتب/حلقه/عمق/ریشه/انتساب امن/جزئیات/UI/تستها/شاهد زنده PASS. مالکیت دامنهای و عضویت عمداً `BLOCKED`؛ مرورگر دستی `UNVERIFIED`. |
| **FAIL** | **هیچ** | خطای `migrations-security` و تست قواعد شناسایی و اصلاح شد؛ اجرای نهایی همهٔ دروازههای کدی PASS است. |
| **BLOCKED** | PM-B1..PM-B8 / Q1..Q5 / G-03 / پذیرش کامل / deploy | بدون تصمیم امضاشدهٔ مالک و بدون مجوز استقرار. |
| **UNVERIFIED** | CI نهایی دقیقSHA، مرورگر دستی/a11y/console، MinIO production، معادل CI/تولید | بهجای ادعا، شاهد jsdom/curl/همانمبدأ و کنترل مبنای پاک ارائه شد. |

---

**شواهد ساختیافته:** `VERIFICATION-C2.json` / `VERIFICATION-C2.txt`؛
**شاهد زنده:** `evidence/task-pm-02/VERIFICATION-C2-LIVE.txt`؛
**شاخص:** `EVIDENCE_INDEX.md` پیوست C2.
