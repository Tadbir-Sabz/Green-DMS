-- مهاجرت 0009 — قوانین، گردش تأیید، صف استثناها
-- منبع: dms-design-report.md › ضمیمه G › G.۶
-- فاز توسعه: ۱ | ماژول/بخش: قوانین، گردش تأیید، صف استثناها

create table rule (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id),
  code        text not null,
  title       text not null,
  entity      text not null check (entity in
                ('sales_order','invoice','customer','product','staff','waybill','return_request',
                 'payment_receipt','purchase_order','tour','delivery')),
  event       text not null check (event in ('before_save','before_approve','after_save','on_schedule')),
  effect      text not null check (effect in ('block','warn','require_approval','set_field','notify')),
  priority    smallint not null default 100,               -- کوچک‌تر = زودتر اجرا
  message_fa  text not null,                               -- پیام فارسی قابل نمایش در اپ و وب
  valid       daterange not null default '[2026-01-01,)',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  row_version integer not null default 0,
  constraint uq_rule_code unique (company_id, code)
);

create index ix_rule_entity_active on rule (entity, event, priority) where is_active;

create table rule_condition (
  id         uuid primary key default gen_random_uuid(),
  rule_id    uuid not null references rule(id) on delete cascade,
  group_no   smallint not null default 1,                  -- OR بین گروه‌ها، AND داخل گروه
  field      text not null,                                -- سقف بدهی | qty | discount_pct | ...
  operator   text not null check (operator in
               ('eq','neq','gt','gte','lt','lte','in','not_in','between','is_null','contains')),
  value      jsonb not null,
  constraint ck_rule_condition_between check (operator <> 'between' or jsonb_typeof(value) = 'array')
);

create index ix_rule_condition_rule on rule_condition (rule_id, group_no);

create table rule_action (
  id          uuid primary key default gen_random_uuid(),
  rule_id     uuid not null references rule(id) on delete cascade,
  action_type text not null check (action_type in
                ('set_discount','set_price','block_order','require_approval','assign_supervisor',
                 'add_gift','send_sms','create_task','flag_customer')),
  params      jsonb not null default '{}'::jsonb
);

create table rule_scope (                                  -- قاعده فقط در این دامنه‌ها اعمال شود
  rule_id    uuid not null references rule(id) on delete cascade,
  scope_type text not null check (scope_type in ('company','branch','area','region','route','customer_group','customer')),
  scope_id   uuid not null,
  primary key (rule_id, scope_type, scope_id)
);

create table approval_chain (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id),
  code        text not null,
  entity      text not null,
  is_active   boolean not null default true,
  constraint uq_approval_chain unique (company_id, code)
);

create table approval_step_def (
  id                uuid primary key default gen_random_uuid(),
  approval_chain_id uuid not null references approval_chain(id) on delete cascade,
  step_no           smallint not null check (step_no > 0),
  approver_role_id  uuid references role(id),
  approver_staff_id uuid references staff(id),
  min_amount        numeric(19,2),
  max_amount        numeric(19,2),
  is_mandatory      boolean not null default true,
  constraint uq_approval_step_def unique (approval_chain_id, step_no),
  constraint ck_approval_amount check (min_amount is null or max_amount is null or max_amount >= min_amount)
);

create table approval_request (                            -- نمونه زنده یک گردش تأیید
  id             uuid primary key default gen_random_uuid(),
  approval_chain_id uuid not null references approval_chain(id),
  entity_type    text not null,
  entity_id      uuid not null,
  requested_by   uuid not null,
  amount         numeric(19,2),
  status         text not null default 'pending'
                   check (status in ('pending','approved','rejected','expired','cancelled')),
  current_step   smallint not null default 1,
  created_at     timestamptz not null default now(),
  closed_at      timestamptz
);

create index ix_approval_request_pending on approval_request (status, current_step) where status = 'pending';

create unique index uq_approval_request_open on approval_request (entity_type, entity_id)
  where status = 'pending';

create table approval_decision (
  id                  uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references approval_request(id) on delete cascade,
  step_no             smallint not null,
  decided_by          uuid not null,
  decision            text not null check (decision in ('approved','rejected','returned')),
  comment             text,
  decided_at          timestamptz not null default now()
);

create table exception_item (                              -- صف استثناها: مغایرت، تخفیف مشکوک، اختلاف قیمت
  id           uuid primary key default gen_random_uuid(),
  branch_id    uuid not null references branch(id),
  kind         text not null check (kind in
                 ('price_mismatch','stock_mismatch','credit_override','discount_override',
                  'cash_variance','count_variance','geofence_breach','sync_conflict','moadian_error')),
  severity     text not null default 'medium' check (severity in ('low','medium','high','critical')),
  entity_type  text,
  entity_id    uuid,
  payload      jsonb not null default '{}'::jsonb,
  status       text not null default 'open' check (status in ('open','in_review','resolved','ignored')),
  assigned_to  uuid,
  resolved_by  uuid,
  resolved_at  timestamptz,
  resolution   text,
  created_at   timestamptz not null default now()
);

create index ix_exception_open on exception_item (branch_id, severity desc, created_at)
  where status in ('open','in_review');
