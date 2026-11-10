-- TASK-PM-01D-M4-F — شواهدِ مقاوم در برابر جعل برای تطبیق نگهداشت گروهی.
--
-- مهاجرت ۰۰۶۰/۰۰۶۱/۰۰۶۲ دستنخورده میمانند (اصل «فقط افزودنی»). این مهاجرت:
--   ۱) ستونِ سرور-کنترل‌شدهٔ bulk_operation_id را به تاریخچهٔ ۰۰۶۰ و audit_log
--      اضافه میکند؛ ردیفهای تاریخی NULL میمانند (سازگاری عقبرو).
--   ۲) جدولِ شواهدِ تراکنشی product_bulk_history_event میسازد: دقیقاً یک ردیف
--      بهازای هر رویداد ۰۰۶۰ِ همان عملیات، با شرکت/بازیگر/محصول/شناسهٔ تاریخچه.
--   ۳) نوشتنِ شواهد را به مسیرِ تریگرِ SECURITY DEFINER موجودِ ۰۰۶۰ محدود میکند؛
--      dms_app فقط SELECT دارد و نمیتواند با PATCH معمولی، هدر یا payload سند بسازد.
--   ۴) dms_readonly را صریحاً از دفتر/شواهد M4 محروم میکند (کمینهامتیازی).
--   ۵) ایندکس انقضا و ایندکس شواهد را برای پاکسازی امن و تطبیق سریع میافزاید.
--
-- هیچ تابع SECURITY DEFINER تازهای معرفی نمیشود: دو تریگر تازه SECURITY INVOKERاند
-- و فقط درونِ همان تراکنشی اجرا میشوند که تریگر ۰۰۶۰ (از پیش SECURITY DEFINER)
-- درج تاریخچه را انجام میدهد. search_path آنها پین شده، EXECUTE از PUBLIC گرفته
-- شده و مالکیت/گرانتها در مستندات F مرور شده است.

-- ---------------------------------------------------------------------------
-- ۱) همبستگی سرور-کنترلشده روی ممیزی (والد پارتیشنشدهٔ audit_log)
-- ---------------------------------------------------------------------------
alter table audit_log
  add column if not exists bulk_operation_id uuid;

comment on column audit_log.bulk_operation_id is
  'شناسهٔ عملیات M4؛ فقط سرور در همان تراکنش محصول مینویسد. request_id کلاینت هرگز مبنای تطبیق نیست.';

create index if not exists ix_audit_log_bulk_operation
  on audit_log (bulk_operation_id);

-- ---------------------------------------------------------------------------
-- ۲) همبستگی سرور-کنترلشده روی تاریخچهٔ ۰۰۶۰
-- ---------------------------------------------------------------------------
alter table product_catalog_history
  add column if not exists bulk_operation_id uuid;

comment on column product_catalog_history.bulk_operation_id is
  'شناسهٔ عملیات نگهداشت گروهی؛ فقط سرور در همان تراکنش بهروزرسانی کالا مینویسد. NULL یعنی رویداد تاریخی/غیرگروهی (سازگاری با ۰۰۶۰).';

create index if not exists ix_product_catalog_history_bulk_operation
  on product_catalog_history (bulk_operation_id)
  where bulk_operation_id is not null;

-- ---------------------------------------------------------------------------
-- ۳) جدول شواهد: نوشتن فقط از مسیر تریگر ۰۰۶۰، خواندن فقط dms_app با RLS
-- ---------------------------------------------------------------------------
create table if not exists product_bulk_history_event (
  id                 uuid primary key default gen_random_uuid(),
  bulk_operation_id  uuid not null,
  product_id         uuid not null,
  company_id         uuid not null,
  actor_user_id      uuid not null,
  history_id         bigint not null unique,
  created_at         timestamptz not null default now(),
  constraint uq_product_bulk_history_event_operation_product
    unique (bulk_operation_id, product_id)
);

comment on table product_bulk_history_event is
  'شاهد الزامی هر رویداد تاریخچه در همان تراکنش عملیات M4؛ dms_app فقط میخواند، نوشتن انحصاراً توسط تریگر ۰۰۶۰ با هویت مهاجرت انجام میشود.';
comment on column product_bulk_history_event.bulk_operation_id is
  'کلید غیرقابل جعل عملیات؛ هر ردیف دقیقاً به همان عملیات، شرکت و بازیگر وصل است.';

create index if not exists ix_product_bulk_history_event_operation
  on product_bulk_history_event (bulk_operation_id, product_id);
create index if not exists ix_product_bulk_history_event_actor
  on product_bulk_history_event (company_id, actor_user_id, created_at);

alter table product_bulk_history_event enable row level security;
alter table product_bulk_history_event force row level security;

-- 0041 default privileges به dms_app روی جدولهای تازه INSERT/UPDATE/DELETE و به
-- dms_readonly SELECT میدهد. همه را صریحاً پس میگیریم؛ فقط SELECT به dms_app میماند.
revoke all on product_bulk_history_event from public, dms_app, dms_readonly;
grant select on product_bulk_history_event to dms_app;

-- dms_readonly نباید دفتر عملیات/شواهد M4 را ببیند: اینها وضعیت کنترل عملیاتاند،
-- نه دادهٔ گزارشگیری. 0062 فقط از public,dms_app REVOKE کرده بود.
revoke all on product_bulk_operation from dms_readonly;

drop policy if exists product_bulk_history_event_select on product_bulk_history_event;
create policy product_bulk_history_event_select on product_bulk_history_event
  for select to public
  using (
    company_id = fn_current_company_id()
    and actor_user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and exists (
      select 1 from product_bulk_operation o
      where o.id = product_bulk_history_event.bulk_operation_id
        and o.company_id = product_bulk_history_event.company_id
        and o.actor_user_id = product_bulk_history_event.actor_user_id
    )
  );

-- سیاست درج فقط برای نقش صاحب/مهاجرت (که تریگر ۰۰۶۰ با آن اجرا میشود) قابل
-- دسترسی است: dms_app اصلاً GRANT INSERT ندارد، پس حتی با GUC جعلی هم نمینویسد.
drop policy if exists product_bulk_history_event_insert on product_bulk_history_event;
create policy product_bulk_history_event_insert on product_bulk_history_event
  for insert to public
  with check (
    bulk_operation_id = nullif(current_setting('app.bulk_operation_id', true), '')::uuid
    and company_id = fn_current_company_id()
    and actor_user_id = nullif(current_setting('app.user_id', true), '')::uuid
    and exists (
      select 1 from product_bulk_operation o
      where o.id = bulk_operation_id
        and o.company_id = company_id
        and o.actor_user_id = actor_user_id
        and o.status = 'accepted'
    )
  );

-- ---------------------------------------------------------------------------
-- ۴) تریگرهای همبستگی: مقدار GUC فقط توسط سرویس M4 در همان تراکنش ست میشود
-- ---------------------------------------------------------------------------
create or replace function fn_product_catalog_history_bind_bulk() returns trigger
language plpgsql
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_op uuid;
  v_actor uuid;
begin
  v_op := nullif(current_setting('app.bulk_operation_id', true), '')::uuid;
  if v_op is null then
    new.bulk_operation_id := null;
    return new;
  end if;

  -- در تراکنش M4 فقط بهروزرسانی محصول مجاز است؛ هر رویداد دیگر fail-closed.
  if new.entity_type <> 'product'
     or new.action <> 'UPDATE' then
    raise exception 'M4 operation % attempted to bind a non-product history event', v_op
      using errcode = 'integrity_constraint_violation';
  end if;

  v_actor := nullif(current_setting('app.user_id', true), '')::uuid;
  if not exists (
    select 1 from product_bulk_operation o
    where o.id = v_op
      and o.company_id = new.company_id
      and o.actor_user_id = v_actor
      and o.status = 'accepted'
  ) then
    raise exception 'M4 operation % is not an accepted operation for this company/actor', v_op
      using errcode = 'integrity_constraint_violation';
  end if;

  new.bulk_operation_id := v_op;
  return new;
end $$;

create or replace function fn_product_bulk_history_evidence() returns trigger
language plpgsql
set search_path = public, pg_catalog, pg_temp
as $$
begin
  if new.bulk_operation_id is null then
    return null;
  end if;
  insert into product_bulk_history_event
    (bulk_operation_id, product_id, company_id, actor_user_id, history_id)
  values
    (new.bulk_operation_id, new.product_id, new.company_id, new.actor_user_id, new.id);
  return null;
end $$;

revoke all on function fn_product_catalog_history_bind_bulk() from public, dms_app, dms_readonly;
revoke all on function fn_product_bulk_history_evidence() from public, dms_app, dms_readonly;

drop trigger if exists trg_product_catalog_history_bind_bulk on product_catalog_history;
create trigger trg_product_catalog_history_bind_bulk
  before insert on product_catalog_history
  for each row execute function fn_product_catalog_history_bind_bulk();

drop trigger if exists trg_product_bulk_history_evidence on product_catalog_history;
create trigger trg_product_bulk_history_evidence
  after insert on product_catalog_history
  for each row execute function fn_product_bulk_history_evidence();

-- ---------------------------------------------------------------------------
-- ۵) ایندکس انقضا برای پاکسازی امن (بدون حذف شواهد حلنشده)
-- ---------------------------------------------------------------------------
create index if not exists ix_product_bulk_operation_expires
  on product_bulk_operation (expires_at);

comment on index ix_product_bulk_operation_expires is
  'پاکسازی امن فقط ردیفهای preview_created منقضیشده را بایگانی/رد میکند؛ هرگز unknown/committed یا ردیف دارای شاهد ۰۰۶۳ حذف نمیشود.';
