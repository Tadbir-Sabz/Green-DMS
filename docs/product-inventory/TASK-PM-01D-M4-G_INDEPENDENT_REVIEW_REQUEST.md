# درخواست بازبینی مستقل فقطخواندنی — TASK-PM-01D-M4-G

> وضعیت: **آماده، اجرا نشده / UNVERIFIED**. این سند فقط دامنه، مبنا و معیارهای
> بازبینی را مشخص میکند. هیچ حکم مستقل، تأیید امنیتی، تأیید مالک، approve، merge،
> release یا deploy صادر نشده است. حکمهای پیشین `R = FAIL` و `F-R = FAIL`
> همچنان پابرجایند و با سبزشدن CI یا گزارش self-assessment تغییر نمیکنند.
> درخواستِ تاریخی F (`TASK-PM-01D-M4-F_INDEPENDENT_REVIEW_REQUEST.md`) عمداً
> دستنخورده و در وضعیت «اجرا نشده» باقی میماند؛ این سند جایگزین حکم آن نیست.

## ۱) مبنا، محدوده و اصل «فقطخواندنی»

- مبنای دقیق G (پیش از اصلاحات): `74e71172055d6cad482305db1834300c62fb53f5`.
- شاخه: `arena/be5eaff3-green-dms`؛ PR #14 همچنان `OPEN / DRAFT` با base `main`.
- **SHA دقیق نهایی و شناسههای CI دقیق** authoritative در **بدنهٔ PR #14** ثبت
  میشوند؛ بازبین باید ابتدا `git rev-parse HEAD`، `origin/...`، `headRefOid`
  PR و `head_sha`ـی runها را با آن SHA تطبیق دهد. داخل مخزن هش self-referential
  درج نشده است.
- بازبین **فقط** کد، تستها، مهاجرتها، اسناد، بدنهٔ PR، لاگها و متادیتای CI همان
  SHA نهایی را میخواند و روی DB **یکبارمصرف و ایزوله** آزمایش میکند. مجاز نیست:
  ویرایش/commit/push مخزن، تغییر PR، approve/merge/release/deploy، دسترسی یا
  تغییر DB تولیدی/اشتراکی، تغییر نقش/رمز/زیرساخت production، بازنویسی تاریخ،
  یا اجرای مهاجرت روی محیط مشترک.
- بازبینی نباید توسعهٔ جاری یا کار unrelated را مسدود کند؛ نتیجه بهصورت گزارش
  جداگانه تحویل میشود، نه قفلکردن شاخه/PR.
- خروجی مطلوب: برای **هر یافته** (`F-R-01`, `F-R-02`) جدول جداگانهای از
  `PASS` / `PASS WITH FINDINGS` / `FAIL` / `BLOCKED` / `UNVERIFIED`، همراه با
  تفکیک «بازرسی کد»، «تست ایستا»، «اجرای DB یکبارمصرف»، «اجرای هویت TCP واقعی»
  و «رفتار استنتاجشده». `RESOLVED` فقط با رفتار مستقل تأییدشده مجاز است؛
  پذیرش نهایی منوط به حل مستقل **هر دو** یافته است.

## ۲) F-R-01 — بازآزمایی اکسپلویت اصلی روی SQL نهایی

علت ریشهای: نسخهٔ F نگهبان خالیبودن را بدون قفل رابطهای، در `READ COMMITTED`،
پیش از `DROP`/`ALTER` اجرا میکرد؛ نویسندهٔ مستقل میتوانست پس از نگهبان و پیش
از DDLـی down، ردیف/شاهد operation-bound درج و `COMMIT` کند و DDL دادهٔ تازه را
خاموش حذف کند. اکسپلویت F-R قبلاً با کپیهای بیرونمخزنی down که فقط با
`pg_sleep(2)` پنجره را گشاد میکردند، چنین خروجی داده بود:
`ledger_dropped=true` و `evidence_gone=true / audit_col_gone=true`.

بازبین باید روی **SQL نهایی G** (نه نسخهٔ F) دوباره انجام دهد:

1. دو/چند اتصال PostgreSQL مستقل و قابلشناسایی (`application_name`)؛ down دقیقاً
   همان `migrations/0062_product_bulk_maintenance.down.sql` و
   `migrations/0063_product_bulk_evidence.down.sql` نهایی، در تراکنش واحد.
2. **کپی گشادشدهٔ بیرونمخزنی** (فقط در `/tmp` بازبین، هرگز داخل مخزن) از همان
   فایلها، با `pg_sleep` میان نگهبان و DDL، تا پنجرهٔ قدیمی دقیقاً بازسازی شود؛
   سپس اکسپلویت اصلی F-R (نویسندهٔ B پس از نگهبان/پیش از DDL) تکرار شود.
   انتظار: قفل `ACCESS EXCLUSIVE` پیش از نگهبان، نویسنده را مسدود کرده و هیچ
   ردیف commitشدهٔ بعدی حذف نشود.
3. **SQL واقعی بدون هیچ sleep** نیز با همگامسازی صریح (`pg_stat_activity`،
   `pg_locks`، witness جدول/ردیف) آزمایش شود: نویسندهٔ درحالاجرا ⇒ down منتظر
   قفل ⇒ پس از commit نویسنده، نگهبان `fail-closed` میدهد؛ نویسندهٔ پس از قفل
   ⇒ مسدود میشود و witnesses نشان دهد که هرگز commit نکرده است. ترتیب واقعی
   رویدادها ثبت شود.
4. تمام رابطههای وابسته پوشش داده شوند: `product_bulk_operation`،
   `product_catalog_history`، `product_bulk_history_event`، `audit_log` و تمام
   پارتیشنهای فرزند `audit_log`؛ موجودی ستونها، جداول، تریگرها، سیاستها،
   قیدها، ایندکسها، توابع و ردیفها بعد از هر شکست نگهبان برابر قبل باشد.
5. چرخهٔ خالی `0063.down → 0062.down → 0062.up → 0063.up`، اجرای مستقیم
   `0062.down` هنگامیکه `0063` هنوز وارونه نشده، و تکرار شکست/بازیابی، بدون
   تغییر نیمهاعمالشده بررسی شود.
6. بررسی شود که هیچ `pg_sleep`، فرض زمانی، قلاب تست، رفتار ویژهٔ production یا
   تضعیف نگهبان در SQL **مخزن** وجود ندارد؛ ترتیب قفلها در هر دو down یکسان و
   با مسیر نوشتن M4 (company+operation) همسو است تا بنبست نسازد.

مرجع خودارزیابی (نه حکم مستقل):
`apps/api/test/migration-rollback-race.test.ts` (A–G، ۸ تست تعیینکننده) و
`docs/product-inventory/TASK-PM-01D-M4-G_IMPLEMENTATION.md` §۲.

## ۳) F-R-02 — هویتهای PG واقعی، بدون `SET ROLE`

ادعای G: کمینهامتیازترین هویت قادر به `create table … partition of audit_log`
«مالک اشیاء» است (همان `DATABASE_URL` که مهاجرتها را اعمال کرده)؛ `dms_owner`
در مخزن مالک هیچ شیئی نیست و `CREATE` روی `public` ندارد، `dms_migrator` عضو
آن و مالک والدها نیست، `dms_app` فاقد `CREATE`/`DDL`/`EXECUTE` است و
`fn_ensure_partitions` اکنون `SECURITY INVOKER` با `search_path` پینشده،
پیششرط مالکیت و `EXECUTE` revoked است.

بازبین باید با **اتصال TCP واقعی** (`session_user` و `current_user` چاپ و
تأیید شوند؛ `SET ROLE` جایگزین نیست؛ ابرکاربر بهجای نقش کمینهامتیاز قبول
نمیشود) روی DB تازه و ایزوله بیازماید:

1. `dms_app`: `rolsuper=false`، `rolbypassrls=false`، مالک نبودن؛ `CREATE TABLE`،
   `CREATE TABLE … PARTITION OF public.audit_log` و `EXECUTE
   fn_ensure_partitions(12)` همگی رد شوند؛ حتی با `GRANT EXECUTE` آزمایشی،
   پیششرط مالکیت داخل تابع جلوی ساخت پارتیشن را بگیرد.
2. `dms_readonly`: عدم `EXECUTE` و عدم دسترسی به شواهد/دفتر محافظتشده M4؛
   `dms_migrator` و `dms_owner`: عدم `EXECUTE` و عدم ساخت پارتیشن.
3. هویت نگهداشت مجازِ **غیرابرکاربر** (در DB یکبارمصرف، مالکیت والدها به آن
   منتقل و `EXECUTE` صریح اعطا شود) پارتیشن گمشده را بسازد؛
   `relowner::regrole` والدها، `rolsuper` و `has_schema_privilege(...,'CREATE')`
   ثبت شوند.
4. ردیفهای تاریخی ممیزی واقعاً درج شوند (صفر ردیف کافی نیست): شمارش و جمع
   شناسه/پیش از و پس از ترمیم دقیقاً یکی باشد؛ پارتیشن موجود/ردیف موجود
   `DROP`/`UPDATE`/`DELETE` نشود؛ `FORCE ROW LEVEL SECURITY`، سیاست والد و
   گرانتهای `dms_app`/`dms_readonly` برقرار بمانند.
5. اجرای دوم همان تابع هیچ پارتیشن تکراری/ناسازگار نسازد؛ هویت مستند
   `DATABASE_URL` (مالک اشیاء) نیز همان رفتار بایدار را نشان دهد؛
   `0064.down` وضعیت `fn_ensure_partitions` (بدنه، `prosecdef=false`،
   `proconfig=NULL`، `proacl`، comment تابع/طرحواره) را دقیقاً به پس از `0042`
   بازگرداند؛ PGOPTIONS/`PGAPPNAME` وابستگی پنهانی ایجاد نکند.
6. `AuditPartitionMissingError` و پیام سرویس، هویت و رویه واقعاً پشتیبانیشده
   را نام ببرند؛ اسناد معماری/استقرار، `0041`/`0019`/`0042` و تستها با مدل
   اندازهگیریشده همخوان باشند. توپولوژی production اگر قابل دسترسی نیست
   صریحاً `UNVERIFIED` بماند، نه `PASS`.

مرجع خودارزیابی (نه حکم مستقل):
`apps/api/test/audit-partition-recovery.api.test.ts` (۷ تست)،
`apps/api/test/product-bulk-maintenance-security.api.test.ts`،
`apps/api/test/migrations-security.test.ts`،
`docs/db-privilege-architecture.md` §۲/§۲-الف،
`docs/deploy/PRODUCTION_DEPLOYMENT.md` §۳-الف.

## ۴) رگرسیون، مرزها و خروجی نهایی

- برقرار ماندن شواهد operation-bound، شناسهٔ سرور‑کنترلشده، GUC فقطتراکنشی،
  RLS اجباری/کمینهامتیاز، تطبیق fail-closed، `accepted` پایدار، GET فقطخواندنی،
  اکشن صریح `POST .../reconcile`، مقایسهٔ زمانثابت توکن، قفل
  company+operation، ممیزی الزامی، OpenAPI/کلاینت typed و RTL فارسی.
- چرخهٔ ۶۴ مهاجرت، امنیت مهاجرتها، تستهای هدفمند/واحد/وب/DB-backed و CI دقیق
  SHA نهایی جداگانه بررسی شوند؛ لاگ محلی با لاگ CI اشتباه نشود و تست اجرانشده
  `PASS` گزارش نشود.
- هیچ whole-file atomicity، رجیستری دامنه، واژگان RBAC، صف/worker، بایگانی
  خارجی، تصمیم PM-B1..PM-B8، تغییر production، تغییر `0060`/`0061`/`0041`،
  grant گسترده یا `SECURITY DEFINER` تازه برای دور زدن مالکیت مجاز/انجامشده
  نباشد. موفقیت فنی مجوز مالک، merge، release یا deploy تلقی نشود.
- گزارش بازبین باید شامل: SHA دقیق بررسیشده، محیط DB، اتصالها/هویتها، ترتیب
  واقعی رویدادهای رقابت، خروجیهای خام، شدت یافتههای تازه، حکم صریح
  `F-R-01` / `F-R-02` / کلی، و فهرست `UNVERIFIED` باشد. تا پیش از آن،
  خودارزیابی G حداکثر `PASS WITH FINDINGS` و پذیرش کلی `UNVERIFIED` است.
