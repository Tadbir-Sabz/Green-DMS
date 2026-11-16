-- مهاجرت 0066 — P3: بخش‌بندیِ تجاریِ مشتری + مسدودیِ اعتبار + مجوزهای تازه
-- منبع: IMPLEMENTATION_SEQUENCE.md › P3 (مشتری/اعتبار/قلمرو) · MODULE_INVENTORY D-03/D-04
-- فقط افزودنی/برگشت‌پذیر: یک جدول تازه، سه ستون تازه روی customer/customer_credit،
-- دو مجوز RBAC (با اعطای هم‌تراز به نقش‌های دارای مجوز مرتبط) — هیچ داده‌ای backfill
-- نمی‌شود، هیچ قید/ایندکس موجودی لمس نمی‌شود.

begin;

-- =====================================================================
-- §1  جدولِ بخش‌بندی مشتری (D-04) — طرفِ شرکت، نه شاخه
-- =====================================================================
create table customer_segment (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id) on delete cascade,
  code        text not null,
  title       text not null,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  row_version integer not null default 0,
  constraint uq_customer_segment_code unique (company_id, code),
  constraint ck_customer_segment_code  check (code = btrim(code) and char_length(code) between 2 and 32),
  constraint ck_customer_segment_title check (btrim(title) <> '')
);

create trigger trg_touch before update on customer_segment
  for each row execute function fn_touch();

create index ix_customer_segment_company on customer_segment (company_id, is_active, code);

-- RLS اجباری — الگوی مستقیم (company_id در خودِ جدول) همان قرارداد 0041/0049
alter table customer_segment enable row level security;
alter table customer_segment force row level security;
drop policy if exists p_customer_segment_tenant on customer_segment;
create policy p_customer_segment_tenant on customer_segment
  for all
  using (customer_segment.company_id = fn_current_company_id())
  with check (customer_segment.company_id = fn_current_company_id());

-- =====================================================================
-- §2  customer.segment_id — انتساب اختیاری مشتری به یک بخش‌بندی
-- =====================================================================
alter table customer
  add column segment_id uuid references customer_segment(id) on delete set null;

create index ix_customer_segment_id on customer (segment_id) where segment_id is not null;

-- =====================================================================
-- §3  مسدودیِ اعتبار روی customer_credit (مکملِ credit_limit)
-- =====================================================================
-- credit_hold=true یعنی «به‌دستورِ مستقیمِ مسئولِ اعتبار» — مسیرِ سخت‌گیرانه است و
-- با استثنای per-order قابلِ عبور نیست؛ رفعِ آن فقط با endpointِ اختصاصی و ممیزی انجام می‌شود.
alter table customer_credit
  add column credit_hold boolean not null default false,
  add column hold_reason text,
  add column hold_set_at timestamptz,
  add column hold_set_by uuid,
  add constraint ck_customer_credit_hold_reason
    check (credit_hold = false or (hold_reason is not null and btrim(hold_reason) <> '')),
  add constraint ck_customer_credit_hold_meta
    check (credit_hold = false or (hold_set_at is not null and hold_set_by is not null)),
  add constraint ck_customer_credit_hold_clear
    check (credit_hold = true or (hold_reason is null and hold_set_at is null and hold_set_by is null));

-- =====================================================================
-- §4  مجوزهای تازه (idempotent) + اعطای هم‌تراز (الگوی 0046)
-- =====================================================================
insert into permission (code, module, title)
values
  ('master.customer_segment.manage', 'master', 'تعریف و ویرایش بخش‌بندی تجاری مشتری'),
  ('ar.credit.hold',                 'ar',     'مسدودسازی/رفعِ مسدودی اعتبار مشتری')
on conflict (code) do nothing;

-- اعطا به نقش‌هایی که امروز مجوز مرتبط دارند؛ نقش‌های سیستمی/ویلدکارد دست‌نخورده می‌مانند
-- (برای شرکت‌های تازه 0022 همچنان منبع wildcard است؛ این سطرها برای نقش‌های ازپیش‌سیدشده است).
insert into role_permission (role_id, permission_code)
select distinct r.id, v.code
  from role r
  join (values
         ('master.customer_segment.manage', 'master.customer.update'),
         ('ar.credit.hold',                 'ar.credit.approve')
       ) v(code, prereq) on true
 where exists (select 1 from role_permission rp
                where rp.role_id = r.id and rp.permission_code = v.prereq)
on conflict do nothing;

-- =====================================================================
-- §5  گرانتِ صریح برای نقشِ زمانِ اجرا (مستقل از default privileges)
-- =====================================================================
grant select, insert, update, delete on customer_segment to dms_app;
grant select on customer_segment to dms_readonly;

commit;
