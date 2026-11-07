-- مهاجرت 0048 — TASK-23: ترمیمِ افشای بین‌اجاره‌ای نماها + RLS دستگاه و حوزهٔ جغرافیایی
-- پایه: ادعاهای تأییدشدهٔ TASK-22RQ (F-1، R-01، R-02) — نه فرض.
--
-- شواهد (TASK-23 فاز ۱ — از کاتالوگِ زنده):
--   نماهای عمومی با مالکِ superuser و بدون security_invoker که dms_app/dms_readonly
--   بر آن‌ها SELECT داشتند: v_stock_valuation_variance، v_customer_exposure،
--   v_live_locations، v_trial_balance. زیرجدول‌های همهٔ این چهار نما (stock_balance،
--   product_cost، customer، customer_credit، invoice، cheque، staff، person، branch،
--   location_sample، gl_account، journal_line، journal_entry، fiscal_period و ...)
--   دارای RLSِ enabled+forced هستند ⇒ security_invoker برای هر چهار نما کافی و
--   درست است (RLS نقشِ فراخوان اعمال می‌شود؛ بدونِ زمینه fn_current_company_id
--   برمی‌گرداند NULL ⇒ صفر ردیف = fail-closed).
--   نمای v_document_line_display از 0047 از قبل security_invoker دارد (دست‌نخورده).
--   نماهای v_auth_* فقط مالکِ postgres هستند (بدونِ گرانت) — تغییر نمی‌یابند.
--   geography_columns/geometry_columns نماهای سیستمیِ PostGIS هستند — دست‌نخورده.
--
--   سه materialized view (mv_ar_aging، mv_daily_sales، mv_salesperson_performance)
--   جمع‌بندیِ چنداجاره‌ای با ستون company_id دارند؛ RLS روی matview پشتیبانی نمی‌شود
--   (ALTER ... ENABLE ROW LEVEL SECURITY = خطا) و گرانتِ dms_app=arwd داشتند
--   ⇒ هر نشستِ dms_app می‌توانست جمعِ مالیِ اجاره‌های دیگر را بخواند. ریمیدی:
--   نامِ matview به *_src تغییر می‌کند (REFRESH CONCURRENTLY روی همان *_src)،
--   نمای سایهٔ هم‌نام با قیدِ صریحِ اجاره ساخته می‌شود، و گرانتِ مستقیمِ matview
--   از همهٔ نقش‌های برنامه پس گرفته می‌شود. (قراردادِ عملیاتیِ REFRESH با نامِ
--   جدید *_src به‌روزرسانی می‌شود — در همین مهاجرت اعلان شده است.)
--
--   device و geofence (از 0012) هیچ RLS نداشتند و dms_app CRUD کامل داشت
--   (R-01/R-02 از TASK-22RQ — نقصِ از پیش موجود، نه پسرفتِ PR#9). سیاست‌ها از
--   مدلِ مالکیتِ واقعیِ ستون‌ها (نه FKهای راحت):
--     device.app_user_id → app_user (اجباری) ⇒ زنجیرهٔ والد: app_user → person
--       (سیاستِ 0043/0041). چون app_user_id اجباری است، الگوی null-or-exists
--       لازم نیست؛ «چسباندنِ والدِ بیگانه» با WITH CHECK همان EXISTS بسته می‌شود.
--       محرمانگی push_token: جداسازی سطریِ device کلیهٔ مسیرهای مستقیم/Join/نمایی
--       را می‌بندد؛ افشا از API در لایهٔ برنامه جداگانه بررسی و در صورتِ نیاز
--       کوچک‌ترین تغییرِ برنامه اعمال می‌شود (بدونِ اعتماد به frontend).
--     geofence: branch_id → branch (اجباری، زنجیره به company)، customer_id و
--       warehouse_id قابلِ NULL ⇒ الگوی هیبریدِ null-or-exists (0047) به‌صورتِ
--       صریح. created_by بدونِ FK است (برچسب، نه کلیدِ مالکیت) و در سیاست دخیل
--       نیست؛ ثبت شده تا سکوت تعبیر نشود.
--
-- قاعده: تماماً افزودنی/تقویتی — هیچ داده‌ای جابه‌جا یا حذف نمی‌شود؛ رفتارِ
-- همان‌اجاره‌ایِ مجاز دست‌نخورده می‌ماند (گردش‌های BI برایِ اجارهٔ جاری همان
-- ردیف‌ها را می‌بینند).

begin;

-- =====================================================================
-- §1  نماهای چهارگانه — security_invoker (تأیید موردی در هدر)
-- =====================================================================
alter view v_stock_valuation_variance set (security_invoker = true);
alter view v_customer_exposure         set (security_invoker = true);
alter view v_live_locations            set (security_invoker = true);
alter view v_trial_balance             set (security_invoker = true);

-- =====================================================================
-- §2  matviewها — قیدِ صریحِ اجاره + پس‌گیریِ گرانتِ مستقیم
-- =====================================================================
alter materialized view mv_ar_aging               rename to mv_ar_aging_src;
alter materialized view mv_daily_sales            rename to mv_daily_sales_src;
alter materialized view mv_salesperson_performance rename to mv_salesperson_performance_src;

create view mv_ar_aging as
  select * from mv_ar_aging_src where company_id = fn_current_company_id();
create view mv_daily_sales as
  select * from mv_daily_sales_src where company_id = fn_current_company_id();
create view mv_salesperson_performance as
  select * from mv_salesperson_performance_src where company_id = fn_current_company_id();

-- نمایِ سایه عمداً security_invoker نمی‌گیرد: بدنه باید *_src (بدونِ گرانتِ برنامه)
-- را بخواند؛ حفاظت = قیدِ صریحِ اجاره در بدنه + پنهان‌بودنِ *_src. (security_invoker
-- در matview بی‌اثر است چون RLS ندارند؛ تنها اثرش محروم‌کردنِ فراخوان از *_src بود.)

revoke all on mv_ar_aging_src               from public, dms_app, dms_readonly;
revoke all on mv_daily_sales_src            from public, dms_app, dms_readonly;
revoke all on mv_salesperson_performance_src from public, dms_app, dms_readonly;

revoke insert, update, delete on mv_ar_aging               from dms_app, dms_readonly;
revoke insert, update, delete on mv_daily_sales            from dms_app, dms_readonly;
revoke insert, update, delete on mv_salesperson_performance from dms_app, dms_readonly;
grant select on mv_ar_aging, mv_daily_sales, mv_salesperson_performance to dms_app, dms_readonly;

comment on materialized view mv_ar_aging_src is
  'TASK-23: منبعِ دادهٔ mv_ar_aging؛ فقط مالک/عملیات REFRESH — نمای هم‌نام، اجاره را اعمال می‌کند.';
comment on materialized view mv_daily_sales_src is
  'TASK-23: منبعِ دادهٔ mv_daily_sales؛ فقط مالک/عملیات REFRESH — نمای هم‌نام، اجاره را اعمال می‌کند.';
comment on materialized view mv_salesperson_performance_src is
  'TASK-23: منبعِ دادهٔ mv_salesperson_performance؛ فقط مالک/عملیات REFRESH — نمای هم‌نام، اجاره را اعمال می‌کند.';

-- =====================================================================
-- §3  device — RLS + FORCE (زنجیرهٔ والد از راه app_user)
-- =====================================================================
alter table device enable row level security;
alter table device force row level security;

create policy p_device_tenant on device for all
  using      (exists (select 1 from app_user au where au.id = device.app_user_id))
  with check (exists (select 1 from app_user au where au.id = device.app_user_id));

comment on policy p_device_tenant on device is
  'TASK-23: مالکیت از راه app_user_id→app_user (اجباری)؛ app_user زیرِ سیاستِ person (company_id) است. push_token با جداسازی سطری محرم می‌ماند.';

-- =====================================================================
-- §4  geofence — RLS + FORCE (هیبرید: branch اجباری + والدهای قابلِ NULL)
-- =====================================================================
alter table geofence enable row level security;
alter table geofence force row level security;

create policy p_geofence_tenant on geofence for all
  using      (exists (select 1 from branch b where b.id = geofence.branch_id)
              and (geofence.customer_id is null
                   or exists (select 1 from customer c where c.id = geofence.customer_id))
              and (geofence.warehouse_id is null
                   or exists (select 1 from warehouse w where w.id = geofence.warehouse_id)))
  with check (exists (select 1 from branch b where b.id = geofence.branch_id)
              and (geofence.customer_id is null
                   or exists (select 1 from customer c where c.id = geofence.customer_id))
              and (geofence.warehouse_id is null
                   or exists (select 1 from warehouse w where w.id = geofence.warehouse_id)));

comment on policy p_geofence_tenant on geofence is
  'TASK-23: branch اجباری (زنجیره به company)؛ customer_id/warehouse_id قابلِ NULL با قیدِ صریحِ null-or-exists. created_by بدون FK (برچسب) و خارج از سیاست.';

commit;
