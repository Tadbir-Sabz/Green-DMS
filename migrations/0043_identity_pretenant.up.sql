-- 0043: امنیتِ هویتِ «پیش‌اجاره» — خوشهٔ app_user/auth_session/user_scope/user_role/role_permission
--
-- مسئله: این پنج جدول در TASK-11 عمداً بیرونِ RLS گذاشته شدند، چون ورودِ کارمند *پیش از* ست شدنِ
-- app.company_id اینها را می‌خواند (AuthRepository به person/staff/role هم join می‌زند که از 0041
-- زیرِ RLS هستند). نتیجهٔ واقعی فقط یک «خطرِ بالقوه» نبود: زیرِ نقشِ زمانِ اجرا (dms_app) همان
-- کوئریِ ورود **صفر ردیف** می‌گرفت، یعنی احرازِ هویتِ کارمند با هویتِ زمانِ اجرا اساساً کار نمی‌کرد.
--
-- راه‌حل (همان الگویی که برایِ پرتال در 0041 اثبات شد، نه دسترسیِ نامحدود و نه خاموش‌کردنِ RLS):
--   §1 سیاستِ RLS رویِ هر پنج جدول ⇒ در حالتِ «پس‌اجاره» کمینه‌امتیاز و دفاع در عمق برقرار است.
--   §2 پنجرهٔ پیش‌اجاره فقط از راهِ توابعِ SECURITY DEFINER با پارامترِ **الزامی** باز می‌شود:
--      search_path پین‌شده، کمینهٔ ستون‌ها، حداکثر یک ردیف، بدونِ پارامترِ company_id
--      (پس انتخابِ دلخواهِ اجاره ممکن نیست)، REVOKE ALL FROM PUBLIC و EXECUTE فقط برایِ dms_app.
--   §3 شکلِ خروجی از «نوعِ سطریِ یک ویو» می‌آید (returns setof v_...) نه فهرستِ دستیِ RETURNS TABLE،
--      تا تعریفِ ستون‌ها هرگز از اسکیمانِ واقعی جدا نیفتد؛ خودِ ویوها SELECT-grant ندارند، پس
--      تنها مسیرِ دسترسی همان تابع است.
--
-- تأثیر بر اجرا: مهاجرت با هویتِ مهاجرت (DATABASE_URL) اجرا می‌شود و توابع را مالک است؛ همان
-- مالکیت باعث می‌شود SECURITY DEFINER از RLS عبور کند — دقیقاً به همین دلیل پنجره با پارامترِ
-- الزامی و کمینهٔ ستون‌ها تنگ نگه داشته شده و اجرایِ عمومی از آن گرفته شده است.

begin;

-- =====================================================================
-- §1  RLS پس‌اجاره رویِ خوشهٔ هویت (الگویِ «دیده‌شدنِ والد» — همان 0042)
-- =====================================================================
-- app_user خودش ستونِ اجاره ندارد؛ مالکیتش از person می‌آید (app_user.person_id → person.company_id).
alter table app_user enable row level security;
alter table app_user force row level security;
create policy p_app_user_tenant on app_user
  for all
  using (exists (select 1 from person pp where pp.id = person_id))
  with check (exists (select 1 from person pp where pp.id = person_id));

-- auth_session و user_scope از راهِ app_user (که همین‌جا RLS گرفت) ⇒ جداسازیِ گذرا.
alter table auth_session enable row level security;
alter table auth_session force row level security;
create policy p_auth_session_tenant on auth_session
  for all
  using (exists (select 1 from app_user pp where pp.id = app_user_id))
  with check (exists (select 1 from app_user pp where pp.id = app_user_id));

alter table user_scope enable row level security;
alter table user_scope force row level security;
create policy p_user_scope_tenant on user_scope
  for all
  using (exists (select 1 from app_user pp where pp.id = user_scope.app_user_id))
  with check (exists (select 1 from app_user pp where pp.id = user_scope.app_user_id));

-- user_role و role_permission از راهِ role (که از 0041 RLS دارد).
alter table user_role enable row level security;
alter table user_role force row level security;
create policy p_user_role_tenant on user_role
  for all
  using (exists (select 1 from role pp where pp.id = user_role.role_id))
  with check (exists (select 1 from role pp where pp.id = user_role.role_id));

alter table role_permission enable row level security;
alter table role_permission force row level security;
create policy p_role_permission_tenant on role_permission
  for all
  using (exists (select 1 from role pp where pp.id = role_permission.role_id))
  with check (exists (select 1 from role pp where pp.id = role_permission.role_id));

-- =====================================================================
-- §2  ویوهایِ شکلِ خروجی (بدونِ GRANT برایِ dms_app — فقط تابع به آنها می‌رسد)
-- =====================================================================
create view v_auth_user as
  select u.id, u.username, u.password_hash, u.access_level, u.is_active, u.is_locked,
         u.locked_until, u.failed_attempts, u.last_login_at, u.created_at,
         p.company_id, p.is_active as person_active, s.id as staff_id
    from app_user u
    join person p on p.id = u.person_id
    left join staff s on s.person_id = p.id;

create view v_auth_session as
  select se.id, se.app_user_id, se.device_id, se.ip, se.user_agent,
         se.expires_at, se.revoked_at, se.revoked_reason,
         u.is_active, u.is_locked, u.locked_until,
         p.is_active as person_active, p.company_id
    from auth_session se
    join app_user u on u.id = se.app_user_id
    join person p on p.id = u.person_id;

revoke all on v_auth_user, v_auth_session from public;

-- =====================================================================
-- §3  توابعِ پنجرهٔ پیش‌اجاره
-- =====================================================================
-- ۳-۱ یافتنِ کاربر برایِ ورود: دقیقاً یکی از دو پارامتر لازم است. company_id پارامتر نیست،
--     پس تابع ابزارِ بازیابیِ دلخواهِ دادهٔ بین‌اجاره‌ای نیست؛ username یکتاست ⇒ حداکثر یک ردیف.
create or replace function fn_auth_find_user(p_username text, p_user_id uuid)
returns setof v_auth_user
language sql stable security definer
set search_path = public, pg_temp
as $$
  select v.*
    from v_auth_user v
   where (p_username is not null or p_user_id is not null)
     and (p_username is null or v.username = p_username)
     and (p_user_id  is null or v.id = p_user_id);
$$;

-- ۳-۲ یافتنِ نشست با شناسه یا hashِ توکنِ refresh (هر دو یکتا ⇒ حداکثر یک ردیف).
create or replace function fn_auth_find_session(p_session_id uuid, p_refresh_hash text)
returns setof v_auth_session
language sql stable security definer
set search_path = public, pg_temp
as $$
  select v.*
    from v_auth_session v
   where (p_session_id is not null or p_refresh_hash is not null)
     and (p_session_id is null or v.id = p_session_id)
     and (p_refresh_hash is null or v.refresh_token_hash = p_refresh_hash);
$$;

-- توجه: v_auth_session ستونِ refresh_token_hash را عمداً برنمی‌گرداند؛ خودِ hash هیچ‌گاه به
-- لایهٔ برنامه نمی‌رود (فقط برایِ تطبیق در داخلِ تابع استفاده می‌شود).

-- ۳-۲b شمارهٔ موبایلِ اصلیِ کاربر برایِ ارسالِ OTP — پیش از اجاره لازم است و به
--      app_user/person/person_phone می‌رسد (person_phone از 0042 زیرِ RLS است).
create or replace function fn_auth_find_primary_phone(p_username text)
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select pp.phone
    from app_user u
    join person p on p.id = u.person_id
    join person_phone pp on pp.person_id = p.id
   where u.username = p_username and p.is_active
   order by pp.is_primary desc, pp.id
   limit 1;
$$;

-- ۳-۳ نقش‌ها و مجوزهایِ یک کاربر (برایِ ساختِ ادعاهایِ توکن).
create or replace function fn_auth_roles_permissions(p_user_id uuid)
returns table(role_id uuid, role_code text, permission_code text)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select r.id, r.code, rp.permission_code
    from user_role ur
    join role r on r.id = ur.role_id
    left join role_permission rp on rp.role_id = r.id
   where ur.app_user_id = p_user_id;
$$;

-- ۳-۴ نوشتن‌هایِ چرخهٔ ورود/نشست. هر کدام «یک عملِ مشخص» هستند، نه یک به‌روزرسانیِ عام؛
--     هیچ‌کدام شناسهٔ اجاره یا نامِ ستون از بیرون نمی‌گیرند.
create or replace function fn_auth_create_session(
  p_app_user_id uuid, p_refresh_hash text, p_device_id text,
  p_ip text, p_user_agent text, p_expires_at timestamptz)
returns uuid
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare v_id uuid;
begin
  insert into auth_session (app_user_id, refresh_token_hash, device_id, ip, user_agent, expires_at)
  values (p_app_user_id, p_refresh_hash, p_device_id, p_ip::inet, p_user_agent, p_expires_at)
  returning id into v_id;
  return v_id;
end $$;

create or replace function fn_auth_revoke_session(p_id uuid, p_reason text)
returns void
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  update auth_session set revoked_at = now(), revoked_reason = p_reason
   where id = p_id and revoked_at is null;
end $$;

create or replace function fn_auth_rotate_session(p_old_id uuid, p_new_id uuid)
returns void
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  update auth_session
     set revoked_at = now(), revoked_reason = 'rotated', rotated_to = p_new_id
   where id = p_old_id and revoked_at is null;
end $$;

create or replace function fn_auth_revoke_device(p_device_id text, p_reason text)
returns integer
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  update auth_session set revoked_at = now(), revoked_reason = p_reason
   where device_id = p_device_id and revoked_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

create or replace function fn_auth_revoke_user_sessions(
  p_app_user_id uuid, p_reason text, p_except uuid)
returns integer
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  update auth_session
     set revoked_at = now(), revoked_reason = p_reason
   where app_user_id = p_app_user_id
     and revoked_at is null
     and id <> coalesce(p_except, '00000000-0000-0000-0000-000000000000'::uuid);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ۳-۵ چرخهٔ تلاشِ ورود: فقط سه ستونِ مشخصِ همان کاربر، بدونِ هیچ پارامترِ دلخواهِ دیگر.
create or replace function fn_auth_login_success(p_user_id uuid)
returns timestamptz
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare v_at timestamptz;
begin
  update app_user
     set failed_attempts = 0, locked_until = null, last_login_at = now()
   where id = p_user_id
   returning last_login_at into v_at;
  return v_at;
end $$;

create or replace function fn_auth_login_failure(
  p_user_id uuid, p_threshold integer, p_minutes integer)
returns table(failed_attempts integer, locked_until timestamptz)
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  return query
  update app_user
     set failed_attempts = app_user.failed_attempts + 1,
         locked_until = case when app_user.failed_attempts + 1 >= p_threshold
                             then now() + (p_minutes * interval '1 minute')
                             else locked_until end
   where id = p_user_id
   returning app_user.failed_attempts, app_user.locked_until;
end $$;

create or replace function fn_auth_set_password(p_user_id uuid, p_password_hash text)
returns boolean
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
declare v_count integer;
begin
  update app_user
     set password_hash = p_password_hash,
         failed_attempts = 0,
         locked_until = null,
         must_change_password = false
   where id = p_user_id;
  get diagnostics v_count = row_count;
  return v_count > 0;
end $$;

-- =====================================================================
-- §4  کمینه‌امتیاز: اجرایِ عمومی گرفته و فقط به نقشِ زمانِ اجرا داده می‌شود
-- =====================================================================
do $revoke$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('fn_auth_find_user','fn_auth_find_session','fn_auth_roles_permissions',
                         'fn_auth_find_primary_phone',
                         'fn_auth_create_session','fn_auth_revoke_session','fn_auth_rotate_session',
                         'fn_auth_revoke_device','fn_auth_revoke_user_sessions',
                         'fn_auth_login_success','fn_auth_login_failure','fn_auth_set_password')
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('revoke all on function %s from dms_readonly', f.sig);
    execute format('grant execute on function %s to dms_app', f.sig);
  end loop;
end $revoke$;

comment on function fn_auth_find_user(text, uuid) is
  'پنجرهٔ پیش‌اجارهٔ ورودِ کارمند: company_id پارامتر نیست ⇒ انتخابِ اجاره از بیرون ممکن نیست؛ SECURITY DEFINER با search_path پین‌شده و EXECUTE فقط برایِ dms_app (0043)';
comment on function fn_auth_find_session(uuid, text) is
  'یافتنِ نشست با شناسه یا hashِ refresh؛ hash هرگز برگردانده نمی‌شود (0043)';

commit;
