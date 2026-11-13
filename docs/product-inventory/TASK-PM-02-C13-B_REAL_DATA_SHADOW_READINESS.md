# TASK-PM-02-C13-B — آمادگی و رویهٔ ارزیابیِ سایه روی دادهٔ واقعی
### Real-Data Shadow Assessment Readiness and Closure (Track B)

**نوع:** مشخصاتِ آماده‌سازی + چک‌لیستِ دریافتِ مجاز + رویهٔ اجرا + شماتیکِ شواهد + آزمون‌ها. **هیچ دادهٔ واقعی خوانده نشد. هیچ قیدی اعمال نشد. هیچ چیزی مرج نشد.**

| مورد | مقدار |
| --- | --- |
| مبنا (baseline) | `0a06445eb974f8164e20d0464a8a835e2bbda28b` (C13XT Track A، پذیرفته‌شده) |
| شاخه | `arena/3fdef0e8-green-dms` — **فعال**؛ Track A دست‌نخورده باقی ماند |
| قراردادِ مقایسه | `c13xt.1` (سوار بر `c13.1` / نرمال‌سازیِ `c11.1`) |
| محیطِ اجرا | **Linux 6.1.158+ x86_64 (Debian 12)** — **نه Windows**؛ Node `v22.22.3` |
| پایگاه‌داده | **در دسترس نیست** (sandbox بدونِ Docker/PostgreSQL) — §۸ |
| PR | **باز نشد** (بدونِ مجوزِ صریح) · Track A مرج نشد · Track B مرج نشد |
| وضعیت نهایی | **PASS** (مستندات و اعتبارسنجیِ synthetic) · **BLOCKED** (replicaٔ مجاز) · **UNVERIFIED** (رفتارِ دادهٔ واقعی) — §۹ |

---

## بخش ۰ — خلاصهٔ مدیریتی

> **هدف.** بدونِ نیاز به دسترسی به Production، یک رویهٔ **کامل، ممیزی‌پذیر و تکرارپذیر**
> برای انجامِ ارزیابیِ سایه روی دادهٔ واقعی **در زمانی که یک replicaٔ ایزولهٔ مجاز در دسترس باشد**
> آماده و اعتبارسنجی شود — به‌طوری که غیابِ پایگاه‌داده مانعِ آماده‌سازیِ فنی نشود.
>
> **آنچه تحویل شد:** مشخصاتِ کاملِ replica (§۲)، چک‌لیستِ دریافتِ مجاز (§۳)، رویهٔ گام‌به‌گامِ اجرا
> (§۴)، شماتیکِ شواهدِ `c13b.1` (§۵)، نمونه گزارشِ **کاملاً SYNTHETIC** (§۵.۳)، ماژولِ سازنده و
> اعتبارسنجِ شواهد + CLIِ فایل‌به‌فایل (§۶)، ۳۹ تستِ خودکار (§۷)، و فهرستِ صریحِ مواردِ مسدود (§۸).
>
> **آنچه تحویل نشد (و نمی‌توانست تحویل شود):** هیچ یافتهٔ دادهٔ واقعی؛ هیچ گزارشِ REAL؛ هیچ اعمالِ
> قید؛ هیچ تغییرِ داده‌ای. سندِ شواهدِ نمونهٔ این تسک از fixtureهایِ مصنوعی ساخته شده و
> **SYNTHETIC** برچسب خورده است.

### سه اصلِ غیرقابلِ مذاکره (از درس‌های C11/C12/C13)

1. **صفرِ یافته ≠ دادهٔ سالم.** چهار حالتِ متمایزِ verdict تعریف شده: `ZERO_INPUT` ·
   `INCOMPLETE_DATA` · `ZERO_FINDINGS_COMPLETE` · `FINDINGS_PRESENT`. یک snapshotِ ناقص
   هرگز به‌عنوان «دادهٔ پاک» گزارش نمی‌شود (در کد اجرا شد و تست دارد).
2. **هیچ گزارشی بدونِ دروازهٔ شش‌شرطی ساخته نمی‌شود.** `buildShadowEvidence` برای طبقه‌بندیِ
   `REAL_AUTHORIZED_REPLICA` بدونِ attestation کاملِ شش‌گانه پرتاب می‌کند — پیش از هر محاسبه.
3. **observed با simulated خلط نمی‌شود.** بخشِ `simulated_policies` فرضی است و نیازمندِ
   تصمیمِ صریحِ مالک (D-C13X-1..3) است؛ هیچ‌چیز اعمال نمی‌شود.

---

## بخش ۱ — وضعیتِ مخزن و مبنا (اندازه‌گیری‌شده)

- شاخه: `arena/3fdef0e8-green-dms`؛ HEAD در شروعِ کار دقیقاً **`0a06445`** (Track A، بدونِ تغییر؛ `git diff` با remote خالی).
- نکتهٔ عملیاتی: پس از بازیابیِ snapshot، `HEAD` محلی روی `d14395a` بود در حالی که محتوای working tree
  بایت‌به‌بایت با `origin/arena/3fdef0e8-green-dms` یکسان بود (sha256 برای هر ۹ فایلِ Track A بررسی شد)؛
  سپس با `git reset --hard origin/arena/3fdef0e8-green-dms` شاخه دقیقاً روی `0a06445` قرار گرفت.
  **هیچ محتوایی از Track A گم یا بازنویسی نشد.**
- `git fetch origin` پیش از شروع انجام شد؛ `origin/main` همچنان `d14395a`.
- PRِ بازِ `#15` (`task/pm-02-c14-identity-attribute-readiness`، فقط یک فایلِ `.md`) **هیچ هُمْپوشانی‌ای با Track B ندارد**؛ دست‌نخورده باقی ماند.
- محیط: `Debian GNU/Linux 12`، هستهٔ `6.1.158+`، x86_64، Node `v22.22.3`، npm `10.9.8`. **Windows در دسترس نیست** — همان‌طور که در C13 ثبت شد، هیچ ادعایِ اعتبارسنجیِ Windows نشده است.
- **هیچ اتصالِ پایگاه‌داده‌ای در این محیط برقرار نشد؛ هیچ پرس‌وجویی روی هیچ منبعی اجرا نشد.**
---

## بخش ۲ — مشخصاتِ آماده‌سازیِ Replica (Replica Readiness Specification)

### ۲٫۱ موتور و نسخه

| الزام | مقدارِ پیشنهادی | یادداشت |
| --- | --- | --- |
| موتور | **PostgreSQL** — همان موتورِ Production | هرگز موتورِ متفاوت (مثلاً SQLite/MySQL) برای شبیه‌سازیِ row-level؛ semanticsِ RLS و قیدها متفاوت‌اند |
| نسخهٔ فرعی | ≥ Production (توصیه: 16.x هم‌تراز با Production) | از `select version();` ثبت شود؛ در evidence در فیلدِ `source.engine_version` |
| نوعِ منبع | **streaming read replica** یا **PITR/export در تاریخِ معلوم** | هرگز خودِ Primary Production |
| RLS | باید **همان** سیاست‌هایِ تولید را داشته باشد (`ENABLE` + `FORCE`) | وجودِ RLS در replica الزامی است؛ خاموش‌کردنِ RLS «برای راحتی» ممنوع است |
| منطقِ tenant | تابعِ `fn_current_company_id()` (خواندنِ GUCِ `app.company_id`) دست‌نخورده | §۲٫۴ — مدل دیدِ operator |

### ۲٫۲ حداقلِ اسکیما و مهاجرت‌ها

همهٔ مهاجرت‌هایِ `migrations/` باید روی replica اعمال شده باشند؛ نسخهٔ مرجع: **`0065`**. حداقل‌هایِ C13B:

| مهاجرت | چرا لازم است |
| --- | --- |
| `0002` (company) | شرکت‌ها برای دامنهٔ شرکتی و تستِ cross-company |
| `0005_product_catalog` (product, product_packaging, product_category, uom) | کد/نام/بارکدِ بسته‌بندی (مخزنِ **legacy**) |
| `0046_product_master` (product_family, product_alias, product_barcode, product code seq…) | خانواده/alias/**بارکدِ کانونی**؛ + انتقالِ ۰۰۴۶ (`on conflict do nothing`) که drift امروز را ساخته |
| `0047_product_master_rls` | اجبارِ RLSِ جداولِ هویت — همان دامنهٔ مرئیِ operator |
| `0041_db_privileges` (`dms_readonly`) | نقشِ فقط‌خواندنیِ آماده (با یادداشتِ زیر) |
| `0065` (آخرین مهاجرتِ موجود در این مخزن) | **نسخهٔ واقعیِ اسکیمایِ replica را ثبت کنید، نه این عدد را** — §۵ |

اعتبارسنجیِ اسکیما روی replica (همهٔ این‌ها read-only‌اند):

```sql
select version();                                     -- موتور و نسخه
select max(name) from schema_migrations;              -- یا جدولِ مهاجرتِ پروژه؛ نسخهٔ اعمال‌شده
select table_name, relrowsecurity, relforcerowsecurity
  from pg_class c join information_schema.tables t using (table_name)
  where table_schema = 'public' and table_name in
    ('product','product_family','product_packaging','product_alias','product_barcode','product_category');
select polname, polrelid::regclass from pg_policy
  where polrelid::regclass::text in ('product','product_family','product_packaging','product_alias','product_barcode','product_category');
```

اگر هرکدام غایب/متفاوت بود ⇒ replica آماده نیست؛ **اجرا متوقف شود** و `schema_migration` در evidence ثبت نشود (خودِ `validateShadowEvidence` این نقیصه را می‌بیند، ولی تصمیم با انسان است).

### ۲٫۳ جداول، ستون‌ها و روابطِ موردنیاز (برای هر نوعِ هویت)

| نوعِ هویت (registry) | جدول(ها) | ستون(ها) | نوعِ کلید در replica | دامنه |
| --- | --- | --- | --- | --- |
| `product_code` | `product` | `code` | `uq_product_code (company_id, code)` | شرکتی |
| `product_name` | `product` | `name` | شاخص trgm؛ **قیدی نیست** | شرکتی |
| `product_name_latin` | `product` | `name_latin` | **قیدی نیست** | شرکتی |
| `family_code` | `product_family` | `code` | `uq_product_family_code (company_id, code)` | شرکتی |
| `category_code` | `product_category` | `code` | `uq_product_category_code (company_id, code)` | شرکتی |
| `variant_signature` | `product` | `variant_signature` | `uq_product_variant_signature (family_id, variant_signature)` | خانوادگی |
| `alias` | `product_alias` | `alias` (خام) + `alias_norm` (نرمال‌شده) | `uq_product_alias_norm (product_id, alias_norm)` | شرکتی |
| `barcode` | `product_barcode` | `barcode`, `kind ∈ gs1_ean13/gs1_ean8/gs1_upc/gs1_itf14/internal/other`, `packaging_id` (NULL = سطحِ پایه) | `uq_product_barcode_gs1` / `uq_product_barcode_internal (company_id, barcode)` | gs1: جهانی · internal/other: شرکتی |
| `packaging_barcode` | `product_packaging` | `barcode` (legacy) **و** `product_barcode.packaging_id IS NOT NULL` (کانونی) | `uq_product_barcode` روی legacy (۰۰۰۵)؛ کانونی مطابق بالا | جهانی (legacy) |

روابطِ لازم: `product.company_id → company.id` · `product.category_id → product_category.id` · `product.family_id → product_family.id` · `product_alias.product_id → product.id` · `product_barcode.product_id → product.id` · `product_barcode.packaging_id → product_packaging.id` · `product_packaging.product_id → product.id` · **soft-delete:** `product.deleted_at` باید در export **در نظر گرفته شود** (ردیف‌هایِ حذف‌شده را چطور برچسب می‌زنید؟ در `provenance` ثبت کنید؛ حذف خودکار ممنوع).

**بارکدهای مهاجرتِ ۰۰۴۶:** انتقال با `on conflict do nothing` ردیف‌هایِ برخوردی را بی‌صدا جا انداخت؛ بنابراین **drift بینِ `product_packaging.barcode` و `product_barcode` یک واقعیتِ شناخته‌شده است** و دقیقاً موضوعِ `POL-PACKAGING-CANON-01` است — در replica این drift را **دست‌نخورده** می‌بینید؛ هیچ «پاک‌سازی»ای قبل از ارزیابی مجاز نیست.

### ۲٫۴ منشأِ داده و مدل دیدِ operator (یک تصمیم مالکی)

دو الگوی مشروع؛ انتخاب با مالکِ داده است و باید در `source.provenance` و `source.owner_ref` ثبت شود:

| الگو | سازوکار | سقف |
| --- | --- | --- |
| **الف) حلقهٔ per-company** | برای هر `company.id`: `SET app.company_id = '<uuid>'`؛ export؛ report جدا؛ aggregsation در سطحِ سند | با `dms_readonly` سازگار است؛ ولی **برخوردِ بین‌شرکتی gs1/internal دیده نمی‌شود** — در evidence باید `provenance` این محدودیت را تصریح کند و cross-company در آن اجرا `UNVERIFIED` بماند |
| **ب) مسیرِ خواندنیِ cross-companyِ مصوب** | نقش/مسیرِ صریحاً مصوبِ مالک برای خواندنِ چند-شرکتی (مثلاً export با نقشِ مهاجرِ read-only در پنجرهٔ نگهداری) | نیازمند **تصدیقِ محرمانگیِ صریح** برای مقایسهٔ بین‌شرکتی؛ مقادیر در evidence پوشانده/هش می‌شوند؛ بدونِ این تصدیق اجرا ممنوع است |

هرگز: غیرفعال‌سازیِ RLS «برای اینکه همه‌چیز دیده شود» · grantِ `BYPASSRLS` موقت · استفاده از `dms_owner`/`dms_migrator` برای خواندن · `SET row_security = off` — هیچ‌کدام مجاز نیست.

### ۲٫۵ الزاماتِ مجوز (شش شرط — همان دروازهٔ C13)

1. مجوزِ کتبیِ مالک با **شناسهٔ سند** (شمارهٔ تیکت/نامه) — در `authorization.ticketRef`.
2. منشأِ مستندِ داده (replica از چه منبعی، با چه lag، با چه روشِ export) — در `source.provenance`.
3. ایزولاسیونِ اثبات‌شده (شبکه/هاست/نگهداری) — در `authorization.isolationAttestation`.
4. نقشِ فقط‌خواندنیِ **اجبارشده** با شاهدِ اجرایی (نه نام) — در `authorization.readOnlyAttestation` (§۲٫۷).
5. نبودِ مسیرِ نوشتنِ مشترک (هیچ راهی برای نوشتن به prod/replica از این نشست نیست) — در `authorization.noSharedWritePathAttestation`.
6. کنترل‌هایِ محرمانگی (پوشانش، retention، عدم اشتراک‌گذاری) — در `authorization.confidentialityAttestation`.

هر شش شرط + `authorizedBy` الزامی است؛ نقصِ هر یک ⇒ CLI کدِ خروجِ `2` می‌دهد و **هیچ گزارشی ساخته نمی‌شود**.

### ۲٫۶ حساس‌داده و پوشانش

- مقادیرِ خام (کد/نام/بارکد/alias) **هرگز** در evidence، log، commit message، issue یا چت وارد نمی‌شوند.
- evidence فقط حمل می‌کند: شمارش‌ها، توزیع‌ها، هش‌ها (`sha256` کوتاه)، `source_ref`های هش‌شده، `space_key`هایِ مقایسه. **توجه:** `space_key` می‌تواند شاملِ مقدارِ هنجارشده باشد؛ برای REAL، طرف‌ها پوشانده می‌شوند (`redaction_enforced: true` — اجباری و غیرقابلِ خاموش‌سازی؛ کد این را enforce می‌کند).
- خروجیِ CLI فقط `assessment_id`، `outcome`، `findings` و هش چاپ می‌کند — هرگز مقادیر.
- فایل‌هایِ میانی (`rows.json`، `evidence.json` قبل از انتقال) روی **میزبانِ ایزوله** نگهداری و پس از انتقال/ممیزی **حذف** شوند؛ retention شواهد: حداکثر ۱۴ روز در فضایِ ممیزی‌شده، سپس پاک‌سازی (ثبتِ پاک‌سازی در سندِ اجرا).
- دادهٔ شخصی نداریم (فقط هویتِ کالا)، ولی دادهٔ **حساسِ کسب‌وکاری** است — همان انضباطِ PII اعمال می‌شود.
### ۲٫۷ نقشِ فقط‌خواندنی و شاهدِ اجرایی آن

`dms_readonly` در مهاجرتِ ۰۰۴۱ با `nologin nosuperuser nobypassrls nocreatedb nocreaterole` و `grant select` ساخته می‌شود — **ولی** (درسِ C12) `rolconfig` آن `NULL` است؛ یعنی `default_transaction_read_only` تنظیم نیست و نام، تضمین نیست. اجرایِ C13B فقط با این شرایط پذیرفته است:

```sql
-- ① هویت و پرچم‌ها
select rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication, rolconfig
  from pg_roles where rolname = 'dms_readonly';
-- موردِ انتظار: false, false, false, false, false, rolconfig شاملِ default_transaction_read_only=on
--   (یا حداقلْ "statement_timeout" و "default_transaction_read_only=on")

-- ② اگر rolconfig خالی است، session-level اجبار و تستِ منفی الزامی است:
begin;
set transaction read only;
insert into product (company_id, code, name, category_id, base_uom_id) values (…);  -- باید خطا بدهد
-- انتظار: ERROR: cannot execute INSERT in a read-only transaction
rollback;

-- ③ حداقل‌های توصیه‌ای برای نقشِ ممیزیِ C13B (با توافق مالک/DBA):
alter role dms_readonly
  set default_transaction_read_only = on,
      set statement_timeout = '60s',
      set lock_timeout = '2s',
      set idle_in_transaction_session_timeout = '10s';
```

**شاهدی که در evidence ثبت می‌شود:** متنِ خودِ خروجیِ کوئریِ ① (پرچم‌ها) + نتیجهٔ تستِ منفیِ ② (متنِ خطا) — در `authorization.readOnlyAttestation`. هیچ‌کدام از این‌ها نباید در گزارشِ عمومی قرار گیرد.

**هشدارِ RLS:** بدونِ `app.company_id` معتبر، سیاست‌ها صفر ردیف برمی‌گردانند؛ «۰ ردیف خوانده شد» به‌خودیِ‌خود خطا نیست — در export حلقهٔ الف (§۲٫۴) این طبیعی است؛ در evidence این حالت باید با `completeness.rows_in = 0` و outcome `ZERO_INPUT` دیده شود، نه به‌عنوان «دادهٔ پاک».

### ۲٫۸ شبکه و ایزولاسیونِ زیرساخت

- replica در **همان VPC/شبکهٔ خصوصی**، با ACLِ ورودی فقط از **میزبانِ اجراکنندهٔ C13B** (IP/security group) روی پورتِ 5432؛ هیچ دسترسیِ عمومی/اینترنت.
- میزبانِ اجراکننده: ایزوله، دیسکِ رمزنگاری‌شده، بدونِ agentهایِ ناشناس، لاگِ دسترسی فعال.
- مسیرِ replica ← primary فقط replicationِ معمول است؛ **هیچ** کاربر/برنامه‌ای حقِ نوشتن به replica ندارد (replica به‌خودیِ‌خود read-only است ولی اتکا به آن کافی نیست — §۲٫۷).
- استقرارِ replica: دست‌کم فاصلهٔ **حداقلِ ممکن با lag مستند**؛ `pg_last_xact_replay_timestamp()` در زمانِ export ثبت شود.
- پس از پایان: اتصال بسته، `rows.json`/`evidence.json` مطابقِ §۲٫۶ رفتار شود؛ snapshot موقت نگه‌داشته نمی‌شود مگر با تصریحِ مالک.

### ۲٫۹ تازگی، ماندگاری و بازتولیدپذیری

| الزام | حداقل |
| --- | --- |
| تازگی | lagِ replication ثبت شود (`pg_last_xact_replay_timestamp()` / `pg_is_in_recovery()`); بیشینهٔ مجاز: **۵ دقیقه** (یا عددِ مصوبِ مالک، در `freshness_seconds`) |
| نقطه‌زمانی | `snapshot_ts_iso` دقیق (UTC) در evidence |
| بازتولید | همان snapshot + همان commit (`reproducibility` ثبت می‌کند) ⇒ همان `input_fingerprint` و `evidence_fingerprint`؛ هر انحراف = عدمِ تکرارپذیری و باید بررسی شود |
| آمارِ مخزن | شمارشِ ردیف‌هایِ هر جدولِ منبع **قبل از export** در `source.record_counts` (اگر export با `record_counts` ناقص باشد، `validateShadowEvidence` هشدار می‌دهد) |
| نسخهٔ اسکیما | `source.schema_migration` = نسخهٔ اعمال‌شدهٔ replica (از `schema_migrations`) + `source.migration_source` (مثلاً «خروجیِ `git log migrations/`») |

### ۲٫۱۰ داده‌های «ناقص» و «ناموجود» — تعریفِ عملیاتی

| حالت | تعریف | نتیجهٔ verdict |
| --- | --- | --- |
| snapshot خالی / همهٔ ردیف‌ها نامعتبر | `rows_in = 0` یا `rows_valid = 0` | `ZERO_INPUT` (+هشدار؛ **هرگز** «سالم» تلقی نشود) |
| برخی نوع‌هایِ هویت غایب | دست‌کم یکی از ۹ نوع نیست | `INCOMPLETE_DATA` (+هشدارِ مجزا برای هر نوعِ غایب) |
| کامل ولی همهٔ ردیف‌ها نامعتبر | `rows_in > 0` و `rows_valid = 0` | `ZERO_INPUT` با هشدارِ `rows_invalid > 0` |
| کامل و بدون یافته | ۹/۹ حاضر، `findings_total = 0` | `ZERO_FINDINGS_COMPLETE` — **فقط برای همین snapshot صادق است**؛ هیچ مجوزی برای تغییرِ قید نیست |
| کامل و با یافته | ۹/۹ حاضر، `findings_total > 0` | `FINDINGS_PRESENT` |

---

## بخش ۳ — چک‌لیستِ دریافتِ مجاز (Authorized Acquisition Checklist)

> این چک‌لیست **پیش از** هر اتصال چاپ و قلم‌به‌قلم تیک می‌خورد. هر ردیف بدونِ «شاهد» = انجام‌نشده.
> امضای نهاییِ مالک روی این چک‌لیست، پیوستِ الزام به سندِ اجرا است.

| # | گام | شاهدِ موردنیاز |
| --- | --- | --- |
| A1 | مجوزِ کتبیِ مالک با شناسهٔ سند (تیکت/نامه) برای «ارزیابیِ shadow فقط‌خواندنی» | شمارهٔ تیکت در `authorization.ticketRef` |
| A2 | محدودهٔ داده: شرکت‌ها/تاریخ/نوع‌هایِ هویت + این‌که آیا الگویِ §۲٫۴-الف یا §۲٫۴-ب است | پیوستِ محدوده؛ ثبت در `source.provenance` |
| A3 | replicaٔ ایزوله آماده است (§۲٫۱/۲٫۸): lag ≤ ۵ دقیقه، شبکهٔ خصوصی، بدونِ routeِ عمومی | خروجیِ `pg_is_in_recovery()` و `pg_last_xact_replay_timestamp()` |
| A4 | نسخهٔ اسکیما روی replica ثبت شد (§۲٫۲) — همهٔ مهاجرت‌ها اعمال‌اند | خروجیِ کوئری‌هایِ §۲٫۲ (`pg_class` / `pg_policy`) |
| A5 | شمارشِ رکوردِ هر جدولِ منبع قبل از export گرفته شد | اعداد در `source.record_counts` |
| A6 | نقش `dms_readonly` (یا معادلِ مصوب) **با rolconfig صحیح** و تستِ منفیِ نوشتن | خروجی‌هایِ §۲٫۷ در `authorization.readOnlyAttestation` |
| A7 | هیچ مسیرِ نوشتنِ مشترکی وجود ندارد (نه از این نشست، نه از replica به primary) | `authorization.noSharedWritePathAttestation` (امضایِ DBA/مالک) |
| A8 | کنترل‌هایِ محرمانگی توافق شد (پوشانش، retention ≤ ۱۴ روز، حذفِ واسطه‌ها) | `authorization.confidentialityAttestation` |
| A9 | میزبانِ اجراکننده: دیسکِ رمزنگاری، لاگِ دسترسی، بدونِ ابزارِ ضبطِ صفحه | تصدیقِ زیرساخت (ایمیل/تیکت) |
| A10 | پنجرهٔ اجرا: تاریخ/ساعت UTC + تأییدِ freezeِ تغییراتِ اسکیما تا پایانِ export | پنجره در سندِ اجرا ثبت شود |
| A11 | شخصِ پاسخگو و روشِ تشدید (escalation) تعیین شد | نام/کانالِ تماس در سندِ اجرا |
| A12 | پس از اجرا: `rows.json` حذف شد؛ evidence فقط در فضایِ ممیزی‌شده قرار گرفت | رسیدِ حذف/انتقال پیوست شد |

**توقفِ سخت:** نبودِ هر ردیف ⇒ اجرا صورت نمی‌گیرد. "انجام می‌دهم بعداً ثبت می‌کنم" پذیرفته نیست.
---

## بخش ۴ — رویهٔ اجرای Shadow (Shadow Execution Procedure)

> پیش‌نیازها: چک‌لیستِ §۳ کامل و امضاشده · شاخه/commit مشخص (`git rev-parse HEAD`) · میزبانِ ایزوله · replica آماده (§۲).
> تمرین (dry-run) روی دادهٔ **SYNTHETIC** پیش از اجرای واقعی الزامی است — با همان CLI و همان پرچم‌ها.

### ۴٫۱ خروجی‌های این رویه

یک فایل `EVIDENCE-C13B-<assessment_id>.json` مطابقِ `EVIDENCE-C13B-EVIDENCE.schema.json`، حاویِ: `observed` (واقعیتِ ثبت‌شده روی همین snapshot)، `simulated_policies` (**فرضی**)، `completeness` (با هشدارهایِ صریح)، و `reproducibility` (دو اثرِ انگشت). هیچ‌چیز خارج از این فایل ادعا نمی‌شود.

### ۴٫۲ گام‌ها

**گام ۰ — اثباتِ مبنا.** روی میزبانِ اجرا:
```bash
git -C Green-DMS fetch origin
git -C Green-DMS rev-parse HEAD        # باید دقیقاً SHAِ تصویب‌شده باشد (مثلاً 0a06445 + commitِ Track B)
git -C Green-DMS status --short        # باید خالی باشد
npm ci && npm run typecheck            # سالم‌ترین راه برای اثباتِ سازگاریِ ابزار
```

**گام ۱ — سلامتِ replica (read-only):**
```sql
select pg_is_in_recovery();                                        -- باید t
select now() - pg_last_xact_replay_timestamp() as lag;             -- ≤ ۵ دقیقه (یا مصوبِ مالک)
select count(*) from product;                                      -- شروعِ شمارش
```

**گام ۲ — کنترل‌های §۲٫۷** (rolconfig + تستِ منفیِ INSERT → خطای read-only) → ثبت در `readOnlyAttestation`.

**گام ۳ — export ردیف‌ها** (حلقهٔ per-company برای الگوی الف؛ تک‌نشستِ cross-company برای الگوی ب با تصدیقِ صریح):
نمونهٔ الگوی الف (برای هر company): `set app.company_id = '<uuid>';`
```sql
-- product_code / product_name / product_name_latin / variant_signature (از product)
--    select id as entity_id, company_id, code as display_value, code as stored_normalized,
--           'product_code' as identity_type, family_id, category_id, variant_signature
--    from product where deleted_at is null;
-- product_name:      name  ·  product_name_latin: name_latin (null را رد کنید)
-- family_code:       select id, company_id, code, code from product_family;
-- category_code:     select id, company_id, code, code from product_category;
-- alias:             select product_id, company_id, alias, alias_norm, kind
--                      from product_alias;
-- barcode (کانونی):  select product_id, company_id, barcode, kind
--                      from product_barcode;   -- packaging_id IS NULL → base · NOT NULL → packaging representation
-- packaging_barcode (هر دو مخزن):
--    select product_id, (select company_id from product p where p.id = product_packaging.product_id),
--           barcode, 'packaging:legacy'
--      from product_packaging where barcode is not null;
```
نگاشتِ دقیقِ ستون‌ها به سطرِ `CrossTypeRow` (با `identity_type` مطابقِ registry و `source_ref`ی که **به منبع اشاره کند ولی خودِ منبع را لو ندهد** — مثلاً `<table>:<id>`):
`entity_id` ← `product/family/category.id` · `entity_type` ← `product|product_family|product_category` · `subtype` ← kind (برای alias/barcode) · `category_id`/`family_id` ← همان ستون‌ها · `stored_normalized` ← `alias_norm`/`barcode`/کدِ خام · `display_value` ← مقدارِ نگه‌داشته‌شده.
خروجی: `rows.json` (آرایهٔ JSON). **کدِ شناساییِ شخصی/تجاری در source_ref قرار ندهید.**

**گام ۴ — شمارش و تطابق:** `recordCounts` (از گام ۱) در برابرِ `rows_in`؛ اختلاف ⇒ علت را پیدا کنید (فیلترِ `deleted_at`؟ RLS؟) و در `provenance` ثبت کنید؛ سپس `completeness` در evidence خودش هشدار می‌دهد.

**گام ۵ — dry-run مصنوعی** (همان پرچم‌ها، با `--classification SYNTHETIC` و یک rows.jsonِ کوچک از fixture) تا CLI و مسیرِ نوشتن تأیید شود.

**گام ۶ — اجرای واقعی:**
```bash
npx tsx apps/api/src/modules/master-data/experimental/shadow-evidence-cli.candidate.ts \
  --rows rows.json \
  --source source.json \          # ShadowSourceSpec: identity, snapshot_ts_iso, engine_version,
                                  # schema_migration, record_counts, freshness_seconds, provenance, owner_ref
  --attestation attestation.json \ # ShadowAuthorization: شش فیلد (§۲٫۵)
  --classification REAL_AUTHORIZED_REPLICA \
  --out EVIDENCE-C13B-real.json
```
کدهای خروج: `0` موفق · `2` ردِ دروازه/اعتبارسنجی · `3` ورودی نامعتبر.
CLI هیچ اتصالِ پایگاه‌داده‌ای ندارد؛ ردیف‌ها را فقط از فایل می‌خواند و هرگز مقدارِ نمایشی چاپ نمی‌کند.

**گام ۷ — اعتبارسنجیِ صریح:** خروجی باید `اعتبارسنجی: OK` باشد؛ در غیر این صورت فایل شواهد **تلقی نمی‌شود** (§۵.۲).

**گام ۸ — بازتولید (توصیه‌شده):** اجرای دوم؛ `evidence_fingerprint` باید **بایت‌به‌بایت** یکسان باشد (اگر `now` ثابت نشده باشد، `generated_at_iso` متفاوت می‌شود — این قابل‌انتظار است؛ اثرِ انگشت به `generated_at_iso` وابسته نیست).

**گام ۹ — ثبت و تحویل:** فایل به فضایِ ممیزی‌شده منتقل؛ `EVIDENCE_INDEX.md` به‌روز؛ `rows.json` و `attestation.json` محلی **حذف** (§۲٫۶)؛ گزارش به مالک با خودِ فایل + خلاصهٔ verdict + محدودیت‌ها.

**گام ۱۰ — تفسیرِ verdict برای مالک:** جدولِ §۲٫۱۰. هر `INCOMPLETE_DATA` باید با «کدام نوعِ هویتی غایب است» و «چرا» همراه باشد. `ZERO_FINDINGS_COMPLETE` مجوزِ هیچ تغییری نیست؛ `FINDINGS_PRESENT` فهرستِ یافته‌ها را برای **تصمیمِ انسانی** تحویل می‌دهد — نه برای اقدامِ خودکار.

### ۴٫۳ تفکیکِ observed از simulated_policies (الزامِ صریح)

| بخش | منشأ | معنا | اقدام مجاز |
| --- | --- | --- | --- |
| `observed` | موتورِ `c13xt.1` روی همین snapshot | «امروز چه برخوردهایی ثبت شده‌اند» | بررسیِ انسانی؛ هیچ تغییری خودکار نیست |
| `simulated_policies` | همان snapshot + ۶ سیاستِ آینده (`POL-*`) | «اگر سیاستِ آینده اعمال بود چه می‌شد» | **فقط** ورودیِ تصمیماتِ `D-C13X-1..3`؛ هیچ سیاستی اعمال نمی‌شود |
| `scan_resolution_shadow` | تحلیلِ سایهٔ اسکن | «کدام کالاها از مسیرِ اسکن پنهان می‌شوند» | تحلیلِ دستی؛ توصیهٔ اجرایی نه |

هرگز این سه را در سندِ واحدی که برچسبِ «یافتهٔ نهایی» دارد ادغام نکنید.

### ۴٫۴ مقایسهٔ صفر-یافته با دادهٔ ناموجود

اصولِ عملیاتی: (۱) `rows_in = 0` ⇒ `ZERO_INPUT`؛ (۲) بخشی از نوع‌ها غایب ⇒ `INCOMPLETE_DATA`؛ (۳) نوع‌ها کامل و `findings_total = 0` ⇒ `ZERO_FINDINGS_COMPLETE`؛ (۴) نوع‌ها کامل و findings > 0 ⇒ `FINDINGS_PRESENT`. اعتبارسنج (`validateShadowEvidence`) هر گزارشی که این تلازم‌ها را نقض کند رد می‌کند؛ CLI کدِ `2` می‌دهد.

---

## بخش ۵ — Evidence Schema (`c13b.1`)

### ۵.۱ فایل‌ها

| فایل | نقش |
| --- | --- |
| `docs/product-inventory/evidence/task-pm-02/EVIDENCE-C13B-EVIDENCE.schema.json` | JSON Schema (Draft 2020-12) — قراردادِ ساختاریِ گزارش |
| `docs/product-inventory/evidence/task-pm-02/EVIDENCE-C13B-SYNTHETIC-SAMPLE.json` | نمونهٔ **کاملاً مصنوعی** ساخته‌شده با خودِ سازنده (§۵.۳) |
| `apps/api/src/modules/master-data/experimental/shadow-evidence.candidate.ts` | سازنده + اعتبارسنج (inert) |
| `apps/api/src/modules/master-data/experimental/shadow-evidence-cli.candidate.ts` | CLI فایل‌به‌فایل (inert) |
| `apps/api/test/c13-shadow-evidence.test.ts` | ۳۹ تستِ خودکار (§۷) |

### ۵.۲ فیلدهای الزام و قواعدِ ثبات

`required` در schema = فهرستِ `EVIDENCE_REQUIRED_TOP_LEVEL` در کد (تست، تطابقِ دقیقِ این دو را تضمین می‌کند). قواعدِ اصلیِ `validateShadowEvidence`:

- `schema_version = c13b.1` · `task = TASK-PM-02-C13B` · `evidence_kind = shadow_assessment`
- `SYNTHETIC` ⇒ `authorization = null` (مجوزِ جعلی ممنوع) · `contains_organizational_data = false` · `verdict.real_data_status = UNVERIFIED — SYNTHETIC ONLY`
- `REAL_AUTHORIZED_REPLICA` ⇒ هر شش attestation غیرخالی؛ `contains_organizational_data = true`؛ `redaction_enforced = true`؛ `verdict.real_data_status = ASSESSED`
- `completeness.complete ⇔ (rows_valid > 0 ∧ missing = ∅)` — و validator گزارشِ دارایِ `missing ≠ ∅` با outcomeِ `ZERO_FINDINGS_COMPLETE` را رد می‌کند
- `observed.by_decision` باید دقیقاً روی `observed.findings_total` جمع شود؛ `verdict.outcome` با آن‌ها سازگار باشد
- `evidence_fingerprint`/`input_fingerprint` الگویِ `^[0-9a-f]{64}$`؛ نسخه‌های قرارداد (`c13xt.1`/`c13.1`/`c11.1`) باید با ماژول یکی باشند
- `simulated_policies.note_fa` باید صریح کند که بخش فرضی و نیازمندِ تصمیمِ مالک است

### ۵.۳ نمونهٔ گزارشِ SYNTHETIC (خلاصه)

فایل: `EVIDENCE-C13B-SYNTHETIC-SAMPLE.json` — تولیدشده با سازنده از fixture `c13-cross-type-identities.ts`؛
برچسب‌ها: `data_classification=SYNTHETIC`، `synthetic=true`، `contains_organizational_data=false`،
`source.identity=synthetic-fixture:c13-cross-type-identities`، `verification: validateShadowEvidence ⇒ []`.

| میدان | مقدارِ نمونه |
| --- | --- |
| `assessment_id` | `C13B-b7861c58` |
| `verdict.outcome` | `FINDINGS_PRESENT` |
| `completeness` | rows_in=78 · rows_valid=73 · rows_invalid=5 · duplicates_suppressed=1 · ۹/۹ نوع حاضر |
| `observed.findings_total` | 115 (به‌تفکیکِ decision/rule/space/pair در خودِ فایل) |
| `simulated_policies.findings_total` | در فایل؛ **فرضی** |
| `reproducibility.evidence_fingerprint` | `cb72310a1671e0267d87b739914eee8415f0563e636dec894f81240891858509` |
| `generated_at_iso` | `2026-11-13T00:00:00.000Z` (pinned برای بازتولید) |

**هشدارِ صریح:** همهٔ اعدادِ این نمونه از دادهٔ مصنوعی‌اند؛ **هیچ تعمیمی به دادهٔ واقعی ندارند** و اثباتِ چیزی دربارهٔ تولید نیستند. «SYNTHETIC» در این فایل برچسبِ صریح دارد و هرگز نباید با گزارشِ REAL ترکیب/جایگزین شود.
---

## بخش ۶ — ماژول و CLI (هر دو inert)

### ۶.۱ `shadow-evidence.candidate.ts`

| تابع/ثابت | امضا | قاعده |
| --- | --- | --- |
| `buildShadowEvidence(rows, params)` | `(rows, ShadowEvidenceParams) → ShadowEvidenceReport` | فقط ردیف‌ها را پردازش می‌کند؛ در حالت REAL بدونِ attestation کامل پرتاب می‌کند (پیش از هر محاسبه)؛ پوشانش اجباری؛ `includeDisplayValues` فقط برای synthetic |
| `validateShadowEvidence(report)` | `→ string[]` | فهرستِ تخلف‌ها؛ خالی = معتبر. قواعد در §۵٫۲ |
| `collectProvenanceWarnings(rows, classification)` | هشدارهایِ provenance | refِ تکراریِ ناسازگار · source_refِ خالی · نشانگرِ `synth` در حالت REAL |
| `assessCompleteness(...)` | شمارشِ by_type + پیش‌فرضِ ۹ نوع | complete ⇔ همهٔ ۹ نوع حاضر + rows_valid > 0 |
| `canonicalJson` / `sha256Hex` | قطعیت | JSON canonical (کلیدها مرتب) + sha256 |
| `EVIDENCE_REQUIRED_TOP_LEVEL` | فهرستِ کلیدها | باید دقیقاً با `required` در schema یکی باشد (تست) |

### ۶.۲ `shadow-evidence-cli.candidate.ts`

ورودی: سه فایل JSON · خروجی: یک فایل + کدِ خروج. عمداً **بدونِ هیچ اتصالِ پایگاه‌داده**:
```bash
npx tsx apps/api/src/modules/master-data/experimental/shadow-evidence-cli.candidate.ts \
  --rows rows.json --source source.json --classification REAL_AUTHORIZED_REPLICA \
  [--attestation attestation.json] [--out EVIDENCE-C13B.json]
```
- کد خروج: `0` موفق · `2` ردِ دروازه/اعتبارسنجی · `3` ورودیِ نامعتبر.
- `--out` اختیاری است؛ بدونِ آن گزارش فقط روی stdout می‌رود و چیزی روی دیسک نمی‌نشیند.
- ردیف‌های نامعتبر (بدونِ فیلدِ الزامی یا `identity_type` ناشناخته) **بی‌صدا دور ریخته نمی‌شوند**؛ شمارش و هشدار چاپ می‌شود.
- این فایل هرگز مقادیرِ خام چاپ نمی‌کند؛ هیچ مسیرِ تولیدی آن را import نمی‌کند (گاردهایِ §۷٫۳).

---

## بخش ۷ — اعتبارسنجی (Validation)

### ۷.۱ دستورات و نتایجِ واقعی (این محیط، ۲۰۲۶-۱۱-۱۳)

| دستور | نتیجه |
| --- | --- |
| `npm ci` | rc=0؛ ۶۰۷ پکیج (node_modules در snapshot حذف شده بود؛ با registry بازسازی شد) |
| `npx tsc -p tsconfig.json --noEmit` (apps/api) | **۰ خطا** (پس از دو رفعِ نوع در ماژولِ Track B) |
| `npm run typecheck` (contracts · api-client · api · web) | **همهٔ پاس** |
| `npx vitest run test/c13-shadow-evidence.test.ts` | **۳۹/۳۹ PASS** |
| `npx vitest run` (کلِ پارتیشنِ unit؛ `scripts/check-test-partition.mjs --print unit`) | **۷۹۶/۷۹۶ PASS** · ۴۸/۴۸ فایل |
| `node scripts/check-test-partition.mjs` | `partition OK: declared manifest == computed partition` |
| گاردهایِ ایزولاسیونِ C11/C12/C13 (۴ فایل) | **PASS** (allowlist با `shadow-evidence(-cli)?` به‌روز شد — مصرف‌کنندهٔ داخلیِ آزمایشی) |

### ۷.۲ آنچه این اعتبارسنجی **نیست**

- **هیچ تستی روی دادهٔ واقعی اجرا نشد.** همهٔ اعداد از fixtureهای SYNTHETIC‌اند.
- کاراییِ PostgreSQL (قفل‌ها، IO، lag) اندازه‌گیری **نشد** — محیط DB ندارد.
- «796 پاس» یعنی ابزار درست است، نه اینکه دادهٔ تولید سالم است.

### ۷.۳ گاردهایِ ایزولاسیون (آزمایشی ≠ تولید)

Track B دقیقاً مانندِ C11/C12/C13 زیرِ `src/modules/master-data/experimental/` زندگی می‌کند؛ هیچ مسیرِ تولیدی آن را import نمی‌کند. گاردهایِ موجود (که برای ماژول‌های C13XT معرفی شده بودند) با نام‌هایِ `shadow-evidence` و `shadow-evidence-cli` به‌روز شدند تا این مصرف‌کنندهٔ داخلیِ آزمایشی را بپذیرند؛ تستِ strengthِ guardها (`c11/۸`، `c12/۱۱`، `c13/22`، guardِ Track A) همگی PASS‌اند.

### ۷.۴ تکرارپذیری

- همان fixture + همان پارامترها (به‌جز `now`) ⇒ **همان** `evidence_fingerprint` (تست دارد).
- جابه‌جاییِ ترتیبِ ردیف‌ها ⇒ **همان** fingerprint (تست دارد؛ اثرِ انگشتِ ورودی روی ردیف‌هایِ مرتب‌شده محاسبه می‌شود).
- Test برایِ `by_decision` مجموعِ `findings_total` (تست دارد).

---

## بخش ۸ — مواردِ مسدود (Blocked) — صریح، با مالک و شرطِ رفع

| # | مورد | وضعیت | مالکِ رفع | شرطِ رفع |
| --- | --- | --- | --- | --- |
| B-1 | **اجرای واقعی روی replicaٔ مجاز** — هیچ دادهٔ واقعی در دسترس نیست | **BLOCKED** | مالکِ داده + DBA + امنیت | replicaٔ ایزوله مطابقِ §۲ + چک‌لیستِ §۳ امضاشده |
| B-2 | **رفتارِ collision روی دادهٔ واقعی** (چند برخوردِ gs1/internal/packaging امروز؟) | **UNVERIFIED** | B-1 | اجرای کاملِ §۴ روی replica |
| B-3 | سنجشِ **freshness** واقعیِ replication و driftِ ۰۰۴۶ در تولید | **UNVERIFIED** | DBA | B-1 + ثبتِ `pg_last_xact_replay_timestamp()` |
| B-4 | تصمیماتِ `D-C13X-1..3` (رزروِ دوطرفه، UPC↔EAN، مخزنِ packaging) | **OPEN** (صفر تصویب) | مالکِ کسب‌وکار | تصمیمِ کتبی؛ سپس طراحیِ قید (خارج از دامنهٔ C13) |
| B-5 | مدل دید cross-company (الگوی §۲٫۴-ب) | **نیازمندِ تصدیقِ مالک** | مالکِ داده + امنیت | تصدیقِ محرمانگیِ صریح؛ وگرنه فقط الگوی الف و cross-company = UNVERIFIED |
| B-6 | بازبینیِ مستقلِ Agent-2 | **UNVERIFIED** (در دسترس نیست؛ **جعل نشد**) | تیم | دسترسیِ Agent-2 و ممیزیِ مجزا |
| B-7 | محیطِ مرجعِ «Agent-1 — Windows» | **BLOCKED** (اجرا روی Debian انجام شد؛ هیچ ادعایِ Windows نیست) | زیرساخت | دسترسیِ به میزبانِ Windows و تکرارِ §۷٫۱ آنجا |
| B-8 | CI روی این شاخه پس از push | در انتظارِ مشاهده | مالکِ مخزن | سبز شدنِ jobهایِ static/unit روی PRِ آینده (PR باز نشد) |
| B-9 | ادغامِ Track A/B به `main` | **عمداً انجام نشد** | مالکِ مخزن | مجوزِ صریح |
| B-10 | پاک‌سازیِ فایل‌هایِ میانی و snapshotهایِ موقت پس از هر اجرای واقعی | فرآیندی | مجری | گامِ §۴.۲-۹ |

---

## بخش ۹ — وضعیتِ نهایی (سه‌حالته)

| محور | وضعیت | معنا |
| --- | --- | --- |
| **PASS** — مستندات و اعتبارسنجیِ فنی | ✅ | شماتیکِ شواهد، سازنده/اعتبارسنج، CLI، ۳۹ تست، ۷۹۶/۷۹۶ unit، نمونهٔ synthetic، گاردها — همه ساخته و سنجیده شدند |
| **BLOCKED** — replicaٔ مجاز | ⛔ | بدونِ replica و چک‌لیستِ امضاشدهٔ §۳ هیچ اجرایی صورت نگرفت؛ هیچ یافتهٔ دادهٔ واقعی تولید نشد |
| **UNVERIFIED** — رفتارِ دادهٔ واقعی | ❓ | هیچ ادعایی دربارهٔ وجود/عدمِ برخورد در دادهٔ تولید نمی‌شود؛ `real_data_status` در نمونهٔ synthetic عمداً `UNVERIFIED — SYNTHETIC ONLY` است |

**NOT DONE (عمداً):** هیچ پرس‌وجویی روی هیچ منبعِ واقعی اجرا نشد · هیچ اتصالِ DB برقرار نشد · هیچ قید/RLS/مهاجرت/اسکیما تغییر نکرد · هیچ داده‌ای تغییر نکرد · Track A دست‌نخورده · merge/approve/PR انجام نشد · Agent-2 جعل نشد.

---

## بخش ۱۰ — فایل‌هایِ تغییر یافته و بازتولید

### فایل‌های جدید / تغییر یافته (Track B)

```
A  docs/product-inventory/TASK-PM-02-C13-B_REAL_DATA_SHADOW_READINESS.md   ← همین سند
A  docs/product-inventory/evidence/task-pm-02/EVIDENCE-C13B-EVIDENCE.schema.json
A  docs/product-inventory/evidence/task-pm-02/EVIDENCE-C13B-SYNTHETIC-SAMPLE.json
A  apps/api/src/modules/master-data/experimental/shadow-evidence.candidate.ts
A  apps/api/src/modules/master-data/experimental/shadow-evidence-cli.candidate.ts
A  apps/api/test/c13-shadow-evidence.test.ts
M  apps/api/test/c13-cross-type-policies.test.ts   (allowlist گارد: + shadow-evidence(-cli))
M  apps/api/test/c13-cross-field.test.ts          (allowlist گارد: + shadow-evidence(-cli))
M  docs/product-inventory/EVIDENCE_INDEX.md        (افزودنِ بخشِ C13-B)
```

### بازتولیدِ دقیق

```bash
git checkout arena/3fdef0e8-green-dms
npm ci
npm run typecheck                                        # ۰ خطا
node scripts/check-test-partition.mjs                    # partition OK
cd apps/api
npx vitest run test/c13-shadow-evidence.test.ts          # 39/39
npx vitest run $(node ../../scripts/check-test-partition.mjs --print unit)   # 796/796
```

### چک‌پوینت

Track A: commit `0a06445` (بدونِ تغییر). Track B: همین commitِ جدید روی همان شاخه.
چک‌پوینت‌هایِ قدیمیِ `c13xt-checkpoint-*.{bundle,tar.gz}` در `/home/user/` نگه‌داشته شدند (حاویِ فقطِ نهاییِ `d14395a`؛ اکنون با Git کامل پوشش داده می‌شوند و **قابلِ حذف‌اند** — تصمیم با شما).
