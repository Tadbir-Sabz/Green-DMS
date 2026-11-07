# TASK-23 — سخت‌سازی بین‌اجاره‌ای: نماها، دستگاه، حوزهٔ جغرافیایی و ثبتِ شکاف‌ها

> **وضعیت:** اجراشده — متوقف پس از گزارش؛ نیازمندِ بازبینیِ فقط‌خواندنیِ Agent-2 و تأییدِ صریحِ مالک.
> **شاخه:** `arena/2c11ac88-green-dms` · **پایه:** `3ffaabe` (= main، ادغامِ PR #9) · **تاریخ:** 2026-11-07
> **مهاجرتِ جدید:** `0048_cross_tenant_views_device_geofence` (+ down کامل و بازگشت‌پذیر)
> **تست‌های جدید:** `view-isolation` (۲۲) · `device-rls` (۱۱) · `geofence-rls` (۱۱) · `migrations-security` (۳) — مجموع ۴۷ سناریو

## ۱) پایه (G0) — راستی‌آزمایی‌شده، بدونِ فرض

- شاخهٔ کاری `arena/2c11ac88-green-dms` از `3ffaabe481a6a2c796c5ce053b63e740e8200591` (= mergeِ PR #9 روی main)؛ درخت تمیز؛ تاریخچهٔ PR #9 دست‌نخورده.
- ۴۷ مهاجرتِ موجود (0001..0047)؛ 0047 = الگوی سیاستِ مرجع.
- هیچ تغییرِ کاربریِ ذخیره‌نشده‌ای در مخزن نبود (پاک‌سازی/بازنشانی انجام نشد).

## ۲) فهرستِ کاملِ نماها (P1) — از کاتالوگِ زنده

| شیء | نوع | مالک | security_invoker | گرانتِ برنامه | نتیجه |
|---|---|---|---|---|---|
| v_stock_valuation_variance | v | postgres | **خیر** | dms_app/ro | نشتِ بین‌اجاره‌ای (اثباتِ TASK-22RQ: A ⇒ ۲ سطر) |
| v_customer_exposure | v | postgres | **خیر** | dms_app/ro | کاندیدِ نشت (زیرجدول‌های RLS‌دار) |
| v_live_locations | v | postgres | **خیر** | dms_app/ro | کاندیدِ نشت (موقعیتِ نیرو) |
| v_trial_balance | v | postgres | **خیر** | dms_app/ro | کاندیدِ نشت (GL) |
| v_document_line_display | v | postgres | **بله (0047)** | dms_app/ro | دست‌نخورده |
| v_auth_user/session/otp | v | postgres | خیر | **بدونِ گرانت** | فقط مالک — بدونِ تغییر |
| mv_ar_aging / mv_daily_sales / mv_salesperson_performance | m | postgres | — (RLS روی matview ناممکن است) | **dms_app=arwd** (default privileges) | جمعِ مالیِ چنداجاره‌ای قابلِ خواندن |
| geography_columns / geometry_columns | v | postgres | — | PUBLIC (استانداردِ PostGIS) | سیستمی — بدونِ تغییر |

- مسیرهای definer: همهٔ نماهای چهارگانه از جدول‌هایی با RLSِ enabled+forced می‌خوانند (۱۴ جدولِ زیرین راستی‌آزمایی شد) ⇒ `security_invoker` برای هر چهار **کافی و درست** است (نه کور، موردی).
- مسیرهای بازگشتی: subqueryهای داخلِ تعریفِ نما (invoice/cheque در v_customer_exposure و…) زیرِ RLSِ نقشِ فراخوان اجرا می‌شوند (در تستِ A پوشش داده شد).

## ۳) ریمیدیِ نماها (طراحیِ موردی)

- **چهار نمایِ چهارگانه:** `ALTER VIEW ... SET (security_invoker = true)` — رفتارِ همان‌اجاره‌ای دست‌نخورده؛ fail-closed (بدونِ زمینه ⇒ `fn_current_company_id()` برمی‌گرداند NULL ⇒ صفر ردیف؛ سیاستِ سخت‌گیرانهٔ `p_invoice_scope` خطا می‌دهد — هر دو بدونِ نشت).
- **سه matview:** چون RLS روی matview پشتیبانی نمی‌شود (خطای صریحِ PostgreSQL) و REFRESH بیرونی است:
  - تغییر نام به `mv_*_src` (عملیاتِ REFRESH CONCURRENTLY روی همان نامِ جدید — اعلان‌شده در مهاجرت؛ **تغییرِ قراردادِ عملیاتیِ اعلام‌شده**، نه تغییرِ قراردادِ API).
  - نمایِ سایهٔ **هم‌نام** با قیدِ صریحِ `company_id = fn_current_company_id()` — SQL برنامه (BI/reports/portal) بدونِ تغییر می‌ماند.
  - `REVOKE ALL` روی `*_src` از public/dms_app/dms_readonly + گرانتِ SELECT تنها روی نمایِ سایه.
  - نمایِ سایه عمداً **بدونِ** security_invoker است (بدنه باید `*_src`ِ بدون‌گرانت را بخواند؛ حفاظت = قیدِ صریح + پنهان‌بودنِ منبع). این «تعدیلِ آگاهانه» در کامنتِ مهاجرت مستند شده است.
- **بدونِ گرانتِ جدیدِ broad**؛ گرانت‌های نامربوط تغییر نکرد.

## ۴) RLS دستگاه و حوزه (P2) — از مدلِ مالکیتِ واقعی، نه FK راحت

- **device** (0012): `app_user_id` اجباری → `app_user` (سیاستِ زنجیره‌ای → `person` → company). سیاستِ `p_device_tenant` (FOR ALL، USING=WITH CHECK، enable+force). والدِ بیگانه ⇒ 42501؛ null-or-exists لازم نیست (کلید اجباری است).
- **geofence** (0012): `branch_id` اجباری (زنجیره به company) + `customer_id`/`warehouse_id` قابلِ NULL با قیدِ **صریحِ null-or-exists** (الگوی هیبریدِ 0047). `created_by` بدونِ FK (برچsetLabel) عمداً خارج از سیاست — در کامنت مستند شده.
- **محرمانگیِ push_token:** جداسازی سطریِ device کلیهٔ مسیرهای مستقیم/Join/نمایی/شمارشی را می‌بندد (تست‌های B). در لایهٔ API نیز همهٔ کوئری‌های `devices.repository` به `app_user_id` کاربرِ نشست مقیدند و `remove` مالکیت را با 404 یکسان راستی‌آزمایی می‌کند ⇒ **تغییرِ برنامه: صفر** (کوچک‌ترین تغییر = هیچ)؛ هیچ امنیتِ frontend-محور اضافه نشد.
- nullable refs: هر دو حالتِ NULL/مقدارِ بیگانه در تست‌های C جداگانه اثبات شد.

## ۵) مهاجرت 0048 — برگشت‌پذیری

- `up`: §1 چهار نما security_invoker · §2 rename+سایه+revokes/grants · §3 device RLS · §4 geofence RLS. تماماً افزودنی/تقویتی؛ هیچ داده‌ای جابه‌جا/حذف نمی‌شود.
- `down`: حذفِ سیاست‌ها، خاموشیِ RLS، حذفِ سایه‌ها، بازگردانیِ نام‌ها و گرانت‌های matview به حالتِ پیش‌فرض، خاموشیِ security_invoker.
- چرخهٔ up→down→up روی پایگاهِ اصلی و در `migrations-security.test.ts` (با راستی‌آزماییِ **داده** — ردیف‌های واقعی، نه شمارِ اشیاء) و `scripts/test-migrations.mjs` (۱۷۲۱ شیء یکسان در دو مسیرِ نصب/ارتقا) اثبات شد.

## ۶) تست‌های پایدار (P4) — نقشِ واقعیِ برنامه، دو اجاره

همه زیرِ نقشِ `dms_app` با رمزِ یکبارمصرف (rolsuper=f، rolbypassrls=f، غیرمالک — در تستِ A اثباتِ صریح)، با GUCهای برنامه (`set_config(...,false)` روی اتصالِ اختصاصی — الگوی tenant-context.ts):

| مجموعه | فایل | سناریوها |
|---|---|---|
| A — جداسازیِ نماها | `view-isolation.test.ts` | ۲۲: چهار نما × (دیدِ خودی/بیگانه/fail-closed) + مختصاتِ B + 0047 + matviewها (ممنوعیتِ `*_src`، سایهٔ اجاره‌محور، fail-closed، ردیفِ B) + **مسیرِ جایگزین** (هر نمایِ در دسترسِ dms_app) |
| B — device | `device-rls.test.ts` | ۱۱: سیاست، CRUD بین‌اجاره‌ای، والدِ بیگانه (42501)، همان‌اجاره، fail-closed (خواندن صفر/درج 42501)، push_token (مستقیم/Join/ویرایش/شمارش) |
| C — geofence | `geofence-rls.test.ts` | ۱۱: سیاست، CRUD بین‌اجاره‌ای، والدِ بیگانه (branch/customer/warehouse)، null-or-exists، ترکیبِ مجاز، مسیرهایِ هندسی، Join، fail-closed |
| D — رگرسیونِ PM/privileges | فایل‌های موجود | L-01 با `KNOWN_GAPS=[]` (هر شکافِ جدید = شکستِ CI)؛ D1–D5 دست‌نخورده |
| E — مهاجرت‌ها | `migrations-security.test.ts` | ۳: نصبِ تازهٔ ۴۸تایی، چرخهٔ down/up با حفظِ **داده**، بازگردانیِ سیاست/گرانت |

## ۷) رگرسیون (P5) — شمارش‌های دقیق

- **API (vitest، ۵۶ فایل):** ۱۰۵۹/۱۰۶۱ موفق؛ **۲ شکست = attachments (G-01)** — round-tripِ MinIO؛ هر دو **بدونِ 0048 هم بازتولید شدند** (طبقه‌بندی: از پیش موجود/محیطی، نه پسرفتِ TASK-23).
- **وب:** ۵۲/۵۲ · **typecheck:** پاک · **next build:** موفق.
- **مهاجرت‌ها:** `test-migrations.mjs` سبز (fresh/upgrade یکسان).
- **D1–D5:** شمارندهٔ SKU، یکتاییِ gs1، numeric(19,4)، confirm_sensitive، ممنوعیتِ خطِ سندِ bundle — همگی سبز (۱۰۵/۱۰۵ هستهٔ PM + مجموعه‌های import/security/snapshots).

## ۸) طبقه‌بندیِ شکست‌های محیط (بازتولید روی پایه)

سه شکستِ اولیه بازتولید و از کد جدا شدند؛ **هیچ‌کدام پسرفتِ TASK-23 نبود**:
1. **geofences.api (۷ شکست):** ریشه = نبودِ json-c در ساختِ PostGIS (`ST_GeomFromGeoJSON` ⇒ «You need JSON-C»)؛ با بازسازیِ PostGIS با `--with-jsondir` رفع و ۱۶۰/۱۶۰ سبز شد — بدونِ تغییرِ کدِ برنامه.
2. **D2 duplicate-check:** ریشه = انکودینگِ SQL_ASCII با ctype=C کلاستر (pg_trgm روی متنِ فارسی صفر trigram می‌ساخت)؛ بازسازیِ کلاستر با UTF-8/C.utf8 ⇒ سبز.
3. **postgres-init-role (۱ شکست):** ریشه = `trust` در pg_hba (رمزِ غلط رد نمی‌شد)؛ scram-sha-256 ⇒ سبز.
هر سه با «downِ 0048» نیز بازتولید شده/قابلِ تفکیک بودند.

## ۹) ثبتِ شکاف‌ها و اسناد (P3 — رفعِ F-2)

- **GAP_REGISTER:** سه ورودیِ واقعی با شناسه‌های واقعی — **G-20** (افشای نماهای definer)، **G-21** (RLS دستگاه)، **G-22** (RLS حوزه)؛ هر سه `RESOLVED (TASK-23)` با شاهد/رفع/توصیه؛ خلاصهٔ شمارش به‌روز شد (۲۲).
- **اصلاحِ ادعای نادرستِ «G-16/G-21 ثبت شد»** در `TASK-22R_RLS_REMEDIATION.md` §۶: آن ادعا نادرست بود (G-16 = تطبیقِ گزارش‌ها؛ G-21 وجود نداشت)؛ تفکیکِ صریحِ **TASK-22R-fixed / TASK-22RQ-verified / TASK-23-fixed / still-open** اضافه شد. تاریخچه حفظ شد (متنِ قبلی حذف نشد؛ اصلاحیه افزوده شد).

## ۱۰) مدلِ امنیتی حفظ شد

- مرزبندی همچنان **company** (بدونِ جدولِ domain/سلسله‌مراتب؛ بدونِ ادعای جداسازیِ دامنه) — معماریِ آینده مسدود نشد (سیاست‌ها از `fn_current_company_id` واحد می‌خوانند).
- **F-3 صریح باقی ماند:** GUC زمینهٔ **ادعاشده** است و احرازِ اعتبار نمی‌شود؛ `p_invoice_scope` سخت‌گیرانه است (نبودِ GUC ⇒ خطا) اما جعلِ GUC توسطِ نقشِ دارایِ `SET` ممکن است — این محدودیتِ مستندِ معماری است، نه چیزی که TASK-23 حل کرده باشد.

## ۱۱) تغییراتِ قرارداد

- **API:** هیچ (پاسخ‌ها/مسیرها/وضعیت‌ها دست‌نخورده — تست‌های قرارداد سبز).
- **عملیاتِ پایگاه:** `REFRESH MATERIALIZED VIEW` اکنون هدفِ `mv_*_src` را می‌گیرد (در مهاجرت اعلان‌شده)؛ نامِ `mv_*` برای برنامه همان است (نمایِ سایه).

## ۱۲) فایل‌های تغییریافته

- `migrations/0048_cross_tenant_views_device_geofence.{up,down}.sql` (جدید)
- `apps/api/test/view-isolation.test.ts` · `device-rls.test.ts` · `geofence-rls.test.ts` · `migrations-security.test.ts` (جدید)
- `apps/api/test/db-privileges.api.test.ts` (L-01: `KNOWN_GAPS=[]`)
- `docs/product-inventory/GAP_REGISTER.md` (G-20..G-22 + خلاصه) · `docs/product-inventory/TASK-22R_RLS_REMEDIATION.md` (§۶ اصلاحیه) · همین سند.

## ۱۳) محیطِ آزمون (بازسازی‌شده، ایزوله)

- PostgreSQL 16.2 (pgserver) + PostGIS 3.5.2 (GEOS 3.12.2/PROJ 9.3.1/json-c، بدون raster/sfcgal/protobuf) + pgcrypto/btree_gist/pg_trgm + Redis 7.2.7؛ کلاسترِ UTF-8 (C.utf8)؛ scram روی 127.0.0.1؛ صرفاً پایگاه‌های موقت با حذف در پایان.
- شواهد در `qa/task23/` (خارج از مخزن): `final-catalog.txt` (کاتالوگِ پایانی)، لاگ‌های vitest/مهاجرت.

## ۱۴) نتیجه و گامِ بعد

- همهٔ گیت‌های G0–G5 تکمیل؛ F-1 و R-01/R-02 رفع و اثبات‌شده؛ F-2 اصلاح شد؛ F-3 صریحاً باز ماند.
- **توقف در همین‌جا:** ادغام/استقرار انجام **نشد** — در انتظارِ بازبینیِ فقط‌خواندنیِ Agent-2 و **تأییدِ صریحِ مالک**.
