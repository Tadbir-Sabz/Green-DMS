-- 0068 — سخت‌سازیِ دفترِ موجودی (inventory_txn): append-only، بدون تغییرِ داده، افزودنی و برگشت‌پذیر
--
-- یافته‌های پیش‌نیاز:
--   * 0041 به dms_app گرانت DML روی همهٔ جدول‌ها (و پیش‌فرض‌های آینده) می‌دهد؛ پس
--     dms_app می‌توانست سطرهای inventory_txn را UPDATE/DELETE کند و مانده را بی‌صدا
--     تغییر دهد.
--   * هیچ تریگر امتناعی روی inventory_txn نبود (0001 فقط روی جدول‌های دیگر است).
--   * اتصال برنامه ممکن است ابرکاربر/مالکِ جدول باشد؛ پس محافظت باید مستقل از
--     نقشِ اتصال باشد (تریگر برای همه نقش‌ها، از جمله مالک و ابرکاربر، اعمال می‌شود).
--
-- ترکیبِ لایه‌ها:
--   ۱) تریگر BEFORE UPDATE/DELETE (سطری) و BEFORE TRUNCATE (جمله‌ای) روی والد؛
--      PostgreSQL این تریگرها را به پارتیشن‌های موجود و آینده منتقل می‌کند.
--   ۲) REVOKE update/delete/truncate از dms_app روی والد و پارتیشن‌های موجود
--      (کنترل شیء؛ پارتیشن‌های آینده با پیش‌فرض‌های 0041 دوباره گرانت می‌گیرند،
--      پس تریگر (۱) همچنان لازم است).
--   ۳) مسیر نگه‌داشتِ صریح: fn_inventory_txn_maintenance_begin(reason, actor).
--      فقط مالکِ جدول اجازه دارد، تغییر را به‌صورت تراکنش‌محلی باز می‌کند و در
--      همان تراکنش یک سطر ممیزی می‌نویسد. دستور مستقیم بدون این تابع رد می‌شود.
--
-- این مهاجرت هیچ ردیف، RLS، یا مالکیتی را تغییر نمی‌دهد. RLS جدول (0042) دست‌نخورده است.

-- ---------------------------------------------------------------------------
-- ۱) تابع تریگر: امتناع، مگر در پنجرهٔ نگه‌داشتِ صریحِ مالک
-- ---------------------------------------------------------------------------
create or replace function fn_inventory_txn_guard() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_owner name;
begin
  select pg_get_userbyid(c.relowner) into v_owner
    from pg_class c
   where c.oid = 'public.inventory_txn'::regclass;

  if coalesce(current_setting('dms.inventory_txn_maintenance', true), '') = 'on'
     and current_user::text = v_owner::text then
    if tg_op = 'DELETE' then return old; end if;
    if tg_op = 'UPDATE' then return new; end if;
    return null;  -- TRUNCATE (جمله‌ای): اجازه داده می‌شود
  end if;

  raise exception 'inventory_txn یک دفتر فقط‌افزودنی است؛ % مجاز نیست (مسیر ممیزی‌شدهٔ fn_inventory_txn_maintenance_begin را ببینید).', tg_op
    using errcode = 'insufficient_privilege';
end $$;

comment on function fn_inventory_txn_guard() is
  'دفتر موجودی فقط‌افزودنی است: UPDATE/DELETE/TRUNCATE جز در پنجرهٔ نگه‌داشتِ مالک رد می‌شود.';

-- ---------------------------------------------------------------------------
-- ۲) تریگرها روی والد (و انتشار به پارتیشن‌ها)
-- ---------------------------------------------------------------------------
drop trigger if exists trg_inventory_txn_append_only on inventory_txn;
create trigger trg_inventory_txn_append_only
  before update or delete on inventory_txn
  for each row execute function fn_inventory_txn_guard();

drop trigger if exists trg_inventory_txn_no_truncate on inventory_txn;
create trigger trg_inventory_txn_no_truncate
  before truncate on inventory_txn
  for each statement execute function fn_inventory_txn_guard();

-- تریگرهای جمله‌ای (TRUNCATE) به پارتیشن‌ها منتقل نمی‌شوند؛ هر پارتیشنِ موجود را جداگانه
-- محافظت می‌کنیم. پارتیشن‌های آینده در یادداشت انتقال به‌عنوان محدودیت باقی‌مانده ثبت شده‌اند.
do $$
declare
  r record;
begin
  for r in
    select inhrelid::regclass as part
      from pg_inherits
     where inhparent = 'public.inventory_txn'::regclass
  loop
    execute format('drop trigger if exists trg_inventory_txn_no_truncate on %s', r.part);
    execute format(
      'create trigger trg_inventory_txn_no_truncate before truncate on %s '
      'for each statement execute function fn_inventory_txn_guard()', r.part);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- ۳) کنترل شیء: dms_app فقط INSERT/SELECT روی دفتر دارد
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  if exists (select 1 from pg_roles where rolname = 'dms_app') then
    revoke update, delete, truncate on inventory_txn from dms_app;
    for r in
      select inhrelid::regclass as part
        from pg_inherits
       where inhparent = 'public.inventory_txn'::regclass
    loop
      execute format('revoke update, delete, truncate on %s from dms_app', r.part);
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ۴) مسیر نگه‌داشتِ صریح و ممیزی‌شده (فقط مالک؛ محدودهٔ تراکنش)
-- ---------------------------------------------------------------------------
create or replace function fn_inventory_txn_maintenance_begin(
  p_reason text,
  p_actor  uuid default null
) returns void
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_owner name;
begin
  select pg_get_userbyid(c.relowner) into v_owner
    from pg_class c
   where c.oid = 'public.inventory_txn'::regclass;

  if current_user::text <> v_owner::text then
    raise exception 'فقط مالک inventory_txn می‌تواند پنجرهٔ نگه‌داشت باز کند.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_reason is null or char_length(btrim(p_reason)) < 10 then
    raise exception 'دلیل نگه‌داشت باید حداقل ۱۰ نویسه باشد.'
      using errcode = 'check_violation';
  end if;

  -- تراکنش‌محلی: با COMMIT/ROLLBACK پایان می‌یابد و به نشست‌های دیگر نشت نمی‌کند.
  perform set_config('dms.inventory_txn_maintenance', 'on', true);

  insert into audit_log (company_id, actor_user_id, action, entity_type, entity_id, after_data)
  values (null, p_actor, 'ledger_maintenance_begin', 'inventory_txn', null,
          jsonb_build_object('reason', btrim(p_reason), 'db_user', current_user::text));
end $$;

revoke all on function fn_inventory_txn_maintenance_begin(text, uuid) from public;

comment on function fn_inventory_txn_maintenance_begin(text, uuid) is
  'باز کردنِ پنجرهٔ نگه‌داشتِ تراکنش‌محلی برای دفتر موجودی (فقط مالک)؛ ممیزی در همان تراکنش.';
