-- 0045: بستنِ دو شکافِ باقی‌مانده از طبقه‌بندیِ TASK-11 — auth_otp و feature_flag
--
-- TASK-11 این دو جدول را در دستهٔ «دادهٔ مرجعِ سراسری» گذاشت. بازبینیِ اسکیمان نشان داد آن
-- طبقه‌بندی برایِ هر دو **نادرست** است:
--   * auth_otp برایِ هر username (بدونِ FK، عمداً) یک code_hash و «شمارهٔ موبایل» نگه می‌دارد؛
--     خواندنِ بی‌قیدِ آن یعنی افشایِ PII و زمان‌بندیِ درخواستِ OTPِ کاربرانِ همهٔ اجاره‌ها.
--   * feature_flag ستونِ scope_type/scope_id دارد و scope_id **NOT NULL** است و هیچ مقدارِ
--     'global' در قیدِ آن نیست ('company','branch','area','user') ⇒ هیچ رکوردِ سراسریِ مشروعی
--     وجود ندارد و هر رکورد به یک دامنهٔ اجاره‌ای گره خورده است.
--
-- §۱ auth_otp: پنجرهٔ آن کاملاً «پیش‌اجاره» است (ورود/بازیابیِ رمز با OTP). پس سیاستِ RLS
--    عمداً «ردِ کامل» است و تنها مسیرِ دسترسی، پنج تابعِ SECURITY DEFINER با پارامترِ الزامی،
--    search_path پین‌شده و EXECUTE فقط برایِ dms_app. این دقیقاً همان الگویِ 0043 است:
--    نه دسترسیِ نامحدود به جدول، نه خاموش‌کردنِ RLS.
--    طراحیِ «درخواست برای نامِ ناشناخته باید بی‌اثر و بی‌صدا بماند» حفظ می‌شود: تابع برایِ
--    usernameِ ناموجود صفر ردیف می‌دهد و خطا نمی‌دهد.
-- §۲ feature_flag: سیاست از سه دامنهٔ «راستی‌آزمایی‌شده» ساخته می‌شود (company/branch/area).
--    توجه: sales_area ستونِ company_id ندارد (از راهِ branch_id به branch و سپس company می‌رسد)،
--    پس دامنهٔ 'area' با همان زنجیرهٔ راستی‌آزمایی‌شده سنجیده می‌شود.
--    دامنهٔ 'user' عمداً رد می‌شود (fail-closed) چون اسکیمان مشخص نمی‌کند scope_id در این حالت
--    app_user.id است یا person.id؛ حدس‌زدنِ آن می‌توانست پرچمِ یک کاربرِ اجارهٔ دیگر را به یک
--    اجارهٔ دیگر نشان بدهد. این یک ابهامِ واقعیِ محصولی است و در گزارش با مسیرِ رفع آمده.

begin;

-- =====================================================================
-- §۱  auth_otp — ردِ کاملِ دسترسیِ مستقیم + پنجرهٔ تنگِ تابعی
-- =====================================================================
alter table auth_otp enable row level security;
alter table auth_otp force row level security;
create policy p_auth_otp_deny_direct on auth_otp
  for all
  using (false)
  with check (false);

create view v_auth_otp as
  select id, code_hash, sent_at, expires_at, attempts, consumed_at, purpose
    from auth_otp;
revoke all on v_auth_otp from public;
revoke all on v_auth_otp from dms_app, dms_readonly, dms_migrator;

-- ۱-۱ آخرین کدِ در انتظارِ همان username (حداکثر یک ردیف)
create or replace function fn_otp_find_pending(p_username text)
returns setof v_auth_otp
language sql stable security definer
set search_path = public, pg_temp
as $$
  select id, code_hash, sent_at, expires_at, attempts, consumed_at, purpose
    from auth_otp
   where username = p_username and consumed_at is null
   order by sent_at desc
   limit 1;
$$;

-- ۱-۲ نرخ‌گیریِ پنجره‌ای: آخرین زمانِ ارسال و تعدادِ ارسال‌ها از یک لحظه به بعد
--     (یک تابع برایِ هر دو پرس‌وجو تا پنجرهٔ پیش‌اجاره کوچک بماند)
create or replace function fn_otp_rate(p_username text, p_purpose text, p_since timestamptz)
returns table(last_sent_at timestamptz, count_since bigint)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select max(auth_otp.sent_at),
         count(*) filter (where p_since is null or auth_otp.sent_at > p_since)
    from auth_otp
   where auth_otp.username = p_username and auth_otp.purpose = p_purpose;
$$;

-- ۱-۳ صدورِ کدِ تازه + پاک‌سازیِ نگهداریِ کوتاه‌مدت (هر دو نوشتنِ پیش‌اجاره در یک پنجره)
create or replace function fn_otp_issue(
  p_username text, p_phone text, p_purpose text, p_code_hash text, p_ttl_seconds integer)
returns void
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  insert into auth_otp (username, phone, purpose, code_hash, expires_at)
  values (p_username, p_phone, p_purpose, p_code_hash,
          now() + (p_ttl_seconds * interval '1 second'));
  delete from auth_otp where auth_otp.sent_at < now() - interval '7 days';
end $$;

-- ۱-۴ شمارشِ تلاشِ ناموفقِ تأیید
create or replace function fn_otp_attempt(p_id uuid)
returns integer
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare v_attempts integer;
begin
  update auth_otp set attempts = auth_otp.attempts + 1 where auth_otp.id = p_id
  returning auth_otp.attempts into v_attempts;
  return coalesce(v_attempts, 0);
end $$;

-- ۱-۵ مصرفِ اتمیک: فقط اولین تأییدِ موفق برنده است (رقابتِ هم‌زمان ⇒ false)
create or replace function fn_otp_consume(p_id uuid)
returns boolean
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  update auth_otp set consumed_at = now()
   where auth_otp.id = p_id and auth_otp.consumed_at is null;
  get diagnostics v_count = row_count;
  return v_count > 0;
end $$;

-- =====================================================================
-- §۲  feature_flag — سه دامنهٔ راستی‌آزمایی‌شده؛ 'user' رد می‌شود
-- =====================================================================
alter table feature_flag enable row level security;
alter table feature_flag force row level security;
create policy p_feature_flag_tenant on feature_flag
  for all
  using (
       (scope_type = 'company' and scope_id = fn_current_company_id())
    or (scope_type = 'branch'  and scope_id in (select id from branch
                                                 where company_id = fn_current_company_id()))
    or (scope_type = 'area'    and scope_id in (select sa.id from sales_area sa
                                                 join branch b on b.id = sa.branch_id
                                                 where b.company_id = fn_current_company_id()))
  )
  with check (
       (scope_type = 'company' and scope_id = fn_current_company_id())
    or (scope_type = 'branch'  and scope_id in (select id from branch
                                                 where company_id = fn_current_company_id()))
    or (scope_type = 'area'    and scope_id in (select sa.id from sales_area sa
                                                 join branch b on b.id = sa.branch_id
                                                 where b.company_id = fn_current_company_id()))
  );

-- =====================================================================
-- §۳  کمینه‌امتیاز
-- =====================================================================
do $revoke$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('fn_otp_find_pending','fn_otp_rate','fn_otp_issue',
                         'fn_otp_attempt','fn_otp_consume')
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('revoke all on function %s from dms_readonly', f.sig);
    execute format('grant execute on function %s to dms_app', f.sig);
  end loop;
end $revoke$;

comment on policy p_auth_otp_deny_direct on auth_otp is
  'دسترسیِ مستقیم به auth_otp برایِ همه رد می‌شود؛ تنها مسیرِ مجاز پنج تابعِ fn_otp_* با EXECUTE مخصوصِ dms_app است (0045)';
comment on policy p_feature_flag_tenant on feature_flag is
  'سه دامنهٔ company/branch/area راستی‌آزمایی‌شده‌اند؛ دامنهٔ user تا تعیینِ اینکه scope_id app_user است یا person رد می‌شود (fail-closed، 0045)';

commit;
