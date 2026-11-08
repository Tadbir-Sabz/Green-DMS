-- مهاجرت 0053 — TASK-24Y: تکمیلِ معماریِ تأییدِ سازمانی
--
-- پیش‌نیازِ یافته‌های TASK-24X-IA (F-3): ستونِ `approval_request_id` روی ۸ جدول وجود
-- داشت ولی هیچ کدی آن را پر نمی‌کرد ⇒ عملاً هیچ عملیاتی (جز استثنای کفِ سود) دروازهٔ
-- تأیید نداشت. این مهاجرت **زیرساخت** را کامل می‌کند، نه خودِ سیاست‌ها:
--
--   ۱) سیاستِ تأیید در سطحِ عملیات (`approval_policy`) با سه دامنهٔ پیکربندی:
--        • central   — حاکمیتِ مرکزیِ شرکت؛ اجباری، قابلِ غیرفعال‌سازی نیست
--        • domain    — سیاستِ قلمروِ عملیاتی؛ می‌تواند سخت‌گیرانه‌تر باشد، نه سست‌تر
--        • operation — پیش‌فرضِ خودِ عملیات
--      (قانونِ حاکم: سیاستِ مرکزی آستانهٔ حداقلی را تعیین می‌کند و قلمرو اجازه دارد
--       خودش را سخت‌گیرانه‌تر کند؛ هرگز نمی‌تواند آن را دور بزند.)
--
--   ۲) نمونه‌سازیِ گردش: `approval_request` ستون‌های سخت‌گیرانه می‌گیرد
--        expires_at / escalated_at / escalation_of / entity_domain_id
--      و هزینهٔ بسته‌شدن به‌صورتِ صریح ثبت می‌شود.
--
--   ۳) تفکیل (delegation) با دامنهٔ صریح و انقضا — نه یک «وکیل» بی‌مرز.
--
--   ۴) جعبهٔ خروجیِ اعلان (outbox) — تا هشدار/یادآوری بدونِ وابستگی به سرویسِ
--      ایمیل در همان تراکنشِ کسب‌وکار نوشته شود (الگوی transactional outbox).
--
--   ۵) تاریخچهٔ تصمیم **تغییرناپذیر**: هیچ UPDATE/DELETE روی approval_decision مجاز نیست.
--
-- هیچ دادهٔ موجودی حذف یا بازنویسی نمی‌شود؛ ستون‌های تازه nullable‌اند و پیش‌فرضِ
-- backward-compatible دارند.

begin;

-- =====================================================================
-- §1  سیاستِ تأیید (approval_policy)
-- =====================================================================
-- یک ردیف = یک قانونِ قابلِ ارزیابی برای یک عملیات. چند سیاست بر اساسِ
-- (company, operation) یافت می‌شود و «سخت‌گیرانه‌ترین» برنده است.
create table approval_policy (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references company(id),
  -- عملیاتِ محافظت‌شده، مثلِ 'sales.order.approve' / 'pricing.margin_exception'
  operation       text not null,
  -- دامنهٔ پیکربندی: مرکزی یا قلمرو یا پیش‌فرضِ عملیات
  scope           text not null check (scope in ('central','domain','operation')),
  -- قلمروِ عملیاتی (اختیاری؛ فقط برای scope='domain')
  domain_id       uuid,
  -- آستانه‌های مقدار: اگر مبلغِ عملیات بیرونِ این بازه باشد، این سیاست اعمال نمی‌شود
  min_amount      numeric(19,2),
  max_amount      numeric(19,2),
  -- آستانهٔ ریسک (۰..۱۰۰)؛ عملیاتِ پرخطرتر آستانهٔ بالاتری دارد
  min_risk_score  smallint check (min_risk_score is null or (min_risk_score between 0 and 100)),
  -- زنجیره‌ای که این سیاست به آن ارجاع می‌دهد
  approval_chain_id uuid not null references approval_chain(id),
  -- مهلتِ تصمیم به ساعت؛ null = بی‌مهلت
  expires_in_hours  integer check (expires_in_hours is null or expires_in_hours > 0),
  -- پس از انقضا: escalate (به والد) یا auto_reject
  on_expiry       text not null default 'escalate' check (on_expiry in ('escalate','auto_reject')),
  -- آیا این سیاست اجباری است؟ (مرکزی همیشه اجباری است)
  is_active       boolean not null default true,
  priority        smallint not null default 100,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  row_version     integer not null default 1,
  constraint ck_approval_policy_amount
    check (min_amount is null or max_amount is null or max_amount >= min_amount),
  -- قلمرو فقط برای scope='domain' معنا دارد و مرکزی هرگز قلمرو ندارد
  constraint ck_approval_policy_domain
    check ((scope = 'domain') or (domain_id is null)),
  constraint ck_approval_policy_central_mandatory
    check (scope <> 'central' or is_active)
);

create index ix_approval_policy_lookup
  on approval_policy (company_id, operation, is_active, priority);

-- در هر شرکت و عملیات، حداکثر یک «سیاستِ مرکزی» فعال وجود دارد — تا حاکمیتِ مرکزی
-- چندپاره نشود و «سخت‌گیرانه‌ترین برنده» قابلِ پیش‌بینی بماند.
create unique index uq_approval_policy_central
  on approval_policy (company_id, operation)
  where scope = 'central' and is_active;

-- در هر شرکت/عملیات/قلمرو، حداکثر یک سیاستِ فعالِ قلمرو
create unique index uq_approval_policy_domain
  on approval_policy (company_id, operation, domain_id)
  where scope = 'domain' and is_active;

alter table approval_policy enable row level security;
alter table approval_policy force row level security;
create policy p_approval_policy_tenant on approval_policy
  for all
  using (exists (select 1 from company c where c.id = company_id))
  with check (exists (select 1 from company c where c.id = company_id));

-- =====================================================================
-- §2  گسترشِ approval_request: انقضا، ارتقا، قلمرو
-- =====================================================================
alter table approval_request
  add column if not exists expires_at      timestamptz,
  add column if not exists escalated_at    timestamptz,
  add column if not exists escalation_of   uuid references approval_request(id),
  add column if not exists entity_domain_id uuid,
  add column if not exists risk_score      smallint
    check (risk_score is null or (risk_score between 0 and 100)),
  add column if not exists policy_id       uuid references approval_policy(id);

-- جست‌وجوی کارآمدِ درخواست‌های منقضی‌شده (برای jobِ انقضا/ارتقا)
create index if not exists ix_approval_request_expiring
  on approval_request (expires_at)
  where status = 'pending' and expires_at is not null;

-- =====================================================================
-- §3  تفکیلِ تأیید (delegation)
-- =====================================================================
-- یک واگذاری = «فردِ A در بازهٔ [from,to] می‌تواند به‌جای B تصمیم بگیرد»،
-- محدود به یک عملیات/قلمرو و با دلیلِ صریح. منقضی‌شده هرگز اثر ندارد.
create table approval_delegation (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references company(id),
  delegator_id  uuid not null references app_user(id),
  delegate_id   uuid not null references app_user(id),
  -- دامنهٔ تفکیل: اگر operation خالی باشد، همهٔ عملیات‌ها
  operation     text,
  domain_id     uuid,
  valid_from    timestamptz not null default now(),
  valid_to      timestamptz not null,
  reason        text not null,
  is_active     boolean not null default true,
  created_by    uuid not null references app_user(id),
  created_at    timestamptz not null default now(),
  row_version   integer not null default 1,
  constraint ck_approval_delegation_not_self check (delegator_id <> delegate_id),
  constraint ck_approval_delegation_window check (valid_to > valid_from)
);

create index ix_approval_delegation_delegate
  on approval_delegation (company_id, delegate_id, is_active, valid_to);

alter table approval_delegation enable row level security;
alter table approval_delegation force row level security;
create policy p_approval_delegation_tenant on approval_delegation
  for all
  using (exists (select 1 from company c where c.id = company_id))
  with check (exists (select 1 from company c where c.id = company_id));

-- =====================================================================
-- §4  جعبهٔ خروجیِ اعلان (transactional outbox)
-- =====================================================================
-- اعلان در همان تراکنشِ تغییرِ وضعیت نوشته می‌شود و یک worker آن را می‌فرستد.
-- اگر ارسال شکست بخورد، وضعیتِ تأیید خراب نمی‌شود و اعلان گم نمی‌شود.
create table approval_notification (
  id                  bigint generated always as identity primary key,
  company_id          uuid not null references company(id),
  approval_request_id uuid references approval_request(id) on delete cascade,
  kind                text not null check (kind in
                        ('assigned','reminder','escalated','expired','decided','cancelled')),
  recipient_user_id   uuid references app_user(id),
  payload             jsonb not null default '{}'::jsonb,
  status              text not null default 'pending'
                        check (status in ('pending','sent','failed','skipped')),
  attempts            integer not null default 0,
  last_error          text,
  created_at          timestamptz not null default now(),
  sent_at             timestamptz
);

create index ix_approval_notification_pending
  on approval_notification (status, created_at)
  where status = 'pending';

alter table approval_notification enable row level security;
alter table approval_notification force row level security;
create policy p_approval_notification_tenant on approval_notification
  for all
  using (exists (select 1 from company c where c.id = company_id))
  with check (exists (select 1 from company c where c.id = company_id));

-- =====================================================================
-- §5  تاریخچهٔ تصمیمِ تغییرناپذیر
-- =====================================================================
-- تغییرناپذیری در سطحِ پایگاه‌داده است، نه در لایهٔ سرویس — تا هیچ مسیری
-- (API، کارگر، SQLِ دستی) نتواند تاریخچه را بازنویسی کند.
--
-- یک راهِ خروجِ صریح برای نگهداشت وجود دارد: اپراتور می‌تواند در همان نشست
-- `set local app.approval_history_maintenance = 'on'` را صدا بزند. این پرچم
-- **فقط در سطحِ نشست** اثر دارد، پیش‌فرض خاموش است و هیچ مسیرِ برنامه‌ای آن را
-- ست نمی‌کند؛ فقط برای پاک‌سازیِ داده‌های آزمون/آرشیوِ کنترل‌شده لازم است.
create or replace function approval_decision_immutable() returns trigger
language plpgsql as $$
begin
  if current_setting('app.approval_history_maintenance', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception using
    errcode = 'P0001',
    message = 'TASK-24Y: approval_decision تغییرناپذیر است؛ برای اصلاح، تصمیمِ جدید ثبت کنید.',
    hint = 'UPDATE/DELETE روی تاریخچهٔ تصمیم مجاز نیست.';
end $$;

create trigger approval_decision_no_update
  before update on approval_decision
  for each row execute function approval_decision_immutable();

create trigger approval_decision_no_delete
  before delete on approval_decision
  for each row execute function approval_decision_immutable();

-- =====================================================================
-- §6  فراخوانِ عملیاتِ محافظت‌شده (guarded operation binding)
-- =====================================================================
-- پیوندِ «درخواستِ تأیید ↔ موجودیتِ کسب‌وکار» به‌صورتِ صریح و قابلِ ممیزی،
-- تا یک تأیید نتواند به دو موجودیتِ مختلف تخصیص یابد.
create table approval_binding (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references company(id),
  approval_request_id uuid not null unique references approval_request(id) on delete cascade,
  operation           text not null,
  entity_type         text not null,
  entity_id           uuid not null,
  -- اثرانگشتِ وضعیتِ کسب‌وکار در لحظهٔ درخواست؛ در لحظهٔ اجرا بازاعتبارسنجی می‌شود
  entity_fingerprint  text,
  created_at          timestamptz not null default now(),
  consumed_at         timestamptz,
  constraint uq_approval_binding_entity unique (operation, entity_type, entity_id)
);

alter table approval_binding enable row level security;
alter table approval_binding force row level security;
create policy p_approval_binding_tenant on approval_binding
  for all
  using (exists (select 1 from company c where c.id = company_id))
  with check (exists (select 1 from company c where c.id = company_id));

comment on table approval_policy is
  'TASK-24Y: سیاستِ تأیید در سه دامنه (central/domain/operation). سیاستِ مرکزی اجباری است.';
comment on table approval_delegation is
  'TASK-24Y: تفکیلِ تأیید با دامنه و انقضای صریح؛ تفکیلِ منقضی هرگز اثر ندارد.';
comment on table approval_notification is
  'TASK-24Y: جعبهٔ خروجیِ اعلان — نوشتن در همان تراکنشِ تغییرِ وضعیتِ تأیید.';
comment on table approval_binding is
  'TASK-24Y: اتصالِ صریحِ درخواستِ تأیید به موجودیتِ محافظت‌شده با اثرانگشتِ بازاعتبارسنجی.';


-- =====================================================================
-- §7  سازندهٔ سند — پیش‌نیازِ اجراپذیرِ جداسازیِ وظایف
-- =====================================================================
-- یافتهٔ TASK-24Y: `sales_order` هیچ ستونِ سازنده‌ای نداشت (ستونِ 0010:141
-- متعلق به `invoice` است، نه `sales_order`). بدونِ آن «تأییدکننده نباید
-- سازنده باشد» قابلِ اعمال نیست — و کنترلی که نتواند اجرا شود، کنترل نیست.
-- `purchase_request` و `return_request` از قبل `requested_by` داشتند و همان
-- به‌کار می‌رود؛ فقط این دو جدول ستون نداشتند. (برچسبِ بدونِ FK، مثلِ ۰۰۱۰.)
alter table sales_order add column if not exists created_by uuid;
alter table purchase_order add column if not exists created_by uuid;

comment on column sales_order.created_by is
  'TASK-24Y: سازندهٔ سفارش — مبنای جلوگیری از خودتأییدی (بدونِ FK، برچسب).';
comment on column purchase_order.created_by is
  'TASK-24Y: سازندهٔ سفارشِ خرید — مبنای جلوگیری از خودتأییدی (بدونِ FK، برچسب).';

commit;
