-- مهاجرت 0048 (down) — بازگشتِ کاملِ وضعیتِ پیش از TASK-23
-- ترتیبِ معکوس: سیاست‌های device/geofence حذف، گرانت‌های matview به حالتِ
-- default privileges بازگردانده (از سرِ نو اعطا)، نماهای سایه حذف و نام‌هایِ
-- matview به حالتِ اول بازگردانده می‌شوند، و security_invoker نماهای چهارگانه
-- خاموش می‌شود. هیچ داده‌ای حذف نمی‌شود.

begin;

-- §4/§3 — حذفِ سیاست‌ها و خاموشیِ RLS (در جهتِ معکوسِ ساخت)
drop policy if exists p_geofence_tenant on geofence;
alter table geofence disable row level security;
alter table geofence no force row level security;

drop policy if exists p_device_tenant on device;
alter table device disable row level security;
alter table device no force row level security;

-- §2 — حذفِ نماهای سایه، بازگردانیِ نام‌ها و گرانت‌ها
drop view if exists mv_salesperson_performance;
drop view if exists mv_daily_sales;
drop view if exists mv_ar_aging;

alter materialized view if exists mv_salesperson_performance_src rename to mv_salesperson_performance;
alter materialized view if exists mv_daily_sales_src            rename to mv_daily_sales;
alter materialized view if exists mv_ar_aging_src               rename to mv_ar_aging;

comment on materialized view mv_ar_aging is null;
comment on materialized view mv_daily_sales is null;
comment on materialized view mv_salesperson_performance is null;

-- بازگشت به گرانتِ «کامل»ِ پیش‌فرض (همان چیزی که default privileges پیش از 0048
-- به matviewها داده بود: dms_app=arwd, dms_readonly=r).
grant insert, update, delete, select on mv_ar_aging               to dms_app;
grant select on mv_ar_aging                                       to dms_readonly;
grant insert, update, delete, select on mv_daily_sales            to dms_app;
grant select on mv_daily_sales                                    to dms_readonly;
grant insert, update, delete, select on mv_salesperson_performance to dms_app;
grant select on mv_salesperson_performance                        to dms_readonly;

-- §1 — خاموشیِ security_invoker
alter view v_trial_balance             set (security_invoker = false);
alter view v_live_locations            set (security_invoker = false);
alter view v_customer_exposure         set (security_invoker = false);
alter view v_stock_valuation_variance  set (security_invoker = false);

commit;
