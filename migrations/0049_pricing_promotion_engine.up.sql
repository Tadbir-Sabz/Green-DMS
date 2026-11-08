-- مهاجرت 0049 — تکمیلِ موتورِ قیمت/تخفیف (TASK-24 · G-04 · فاز P2)
--
-- هدف: افزودنِ داربستِ داده‌ایِ لازم برای «موتورِ قیمتِ قابلِ اتکا»:
--   §1  قلمروِ قیمت‌گذاری (pricing_domain) — اختیارِ قیمتِ دامنه‌ای بدونِ بازنویسیِ خاموش
--   §2  اولویت/پیش‌فرض/قلمرو روی price_list + سطوحِ تعدادی و سقفِ تخفیف روی اقلام
--   §3  قیمتِ مشتری: سطحِ تعداد، سقفِ تخفیف، مرجعِ تأییدِ دوم‌شخصی
--   §4  تشویق: قلمرو، گروهِ انحصار، سقفِ درصد، سقفِ مصرف، الزامِ کوپن
--   §5  کوپن، دفترِ مصرف (idempotency + سقفِ روزانه/مشتری)، کشِ ارزیابیِ تکراری
--   §6  سیاستِ کفِ سود + استثنای مجاز (تأییدِ شخصِ دوم)
--   §7  دفترِ تغییرِ قیمت (append-only) + دفترِ شبیه‌سازی (فقط audit، نه تراکنشِ کسب‌وکار)
--   §8  مجوزهای جدید (RBAC) + RLS اجباری روی همهٔ جدول‌های تازه
--
-- قاعدهٔ اجرا: تماماً ADDITIVE — هیچ ستون/ردیفی حذف یا بازنویسی نمی‌شود؛ ردیف‌های موجود
-- (price_list بدونِ domain_id، price_list_item بدونِ max_qty، promotion بدونِ سقفِ درصد)
-- دقیقاً رفتارِ امروز را حفظ می‌کنند. down = حذفِ همین افزودنی‌ها.
--
-- معناشناسیِ JSONB که موتور انتظار دارد (نه DDL — سندِ زندهٔ قرارداد):
--   promotion.conditions: { product_ids[], category_ids[], brand_ids[], packaging_ids[],
--                           channel[], customer_ids[], customer_group?, settlement_term_ids[],
--                           min_qty?, min_amount?, days_of_week[], first_order_only?,
--                           tiers[{min_qty, percent|amount}], buy_x{product_id,qty},
--                           bundle{product_ids[],qty_each?}, repeat{min_orders,within_days} }
--   promotion.benefit:    { percent?, amount?, per?:'line'|'unit'|'order', max_amount?,
--                           gift{product_id,qty}?, bundle_price?, free_qty? }
--   هر کلیدِ ناشناخته در conditions/benefit ⇒ تشویق «قابلِ اعمال نیست» (fail-closed) و
--   دلیلِ صریح در breakdown ثبت می‌شود؛ هرگز بی‌صدا نادیده گرفته نمی‌شود.

begin;

-- =====================================================================
-- §1  قلمروِ قیمت‌گذاری (اختیارِ دامنه‌ای)
-- =====================================================================
-- «قلمرو» = واحدِ عملیاتیِ مجاز برای نگه‌داشتنِ سیاستِ قیمتِ خودش (کانال/حوزه/شعبه).
-- قاعدهٔ ضدتعارض: قیمتِ قلمرو هرگز قیمتِ صریحِ مشتری را بازنویسی نمی‌کند و قیمتِ
-- سراسریِ شرکت هم قیمتِ قلمرو را بازنویسی نمی‌کند (اولویت‌ها در سرویس و تست‌ها قفل شده‌اند).
create table pricing_domain (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id),
  code        text not null,
  title       text not null,
  kind        text not null check (kind in ('channel', 'area', 'branch')),
  channel     text check (channel in ('retail', 'wholesale', 'chain', 'horeca', 'institution')),
  area_id     uuid references sales_area(id),
  branch_id   uuid references branch(id),
  priority    smallint not null default 100,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  row_version integer not null default 0,
  constraint uq_pricing_domain_code unique (company_id, code),
  constraint ck_pricing_domain_target check (
    (kind = 'channel' and channel is not null and area_id is null and branch_id is null)
    or (kind = 'area' and area_id is not null and channel is null and branch_id is null)
    or (kind = 'branch' and branch_id is not null and channel is null and area_id is null)
  )
);

-- هر هدف فقط یک قلمرو (جلوگیری از دو تفسیرِ ممکن برای یک مشتری)
create unique index uq_pricing_domain_channel on pricing_domain (company_id, channel)
  where kind = 'channel';
create unique index uq_pricing_domain_area on pricing_domain (company_id, area_id)
  where kind = 'area';
create unique index uq_pricing_domain_branch on pricing_domain (company_id, branch_id)
  where kind = 'branch';

create index ix_pricing_domain_active on pricing_domain (company_id, priority desc)
  where is_active;

-- =====================================================================
-- §2  لیستِ قیمت: قلمرو + اولویت + پیش‌فرض؛ اقلام: سقفِ تعداد + سقفِ درصدِ تخفیف
-- =====================================================================
alter table price_list
  add column domain_id  uuid references pricing_domain(id),
  add column priority   smallint not null default 100,
  add column is_default boolean not null default false,
  add column updated_at timestamptz not null default now(),
  add column row_version integer not null default 0;
-- NULL domain_id = لیستِ سراسریِ شرکت (رفتارِ ردیف‌های legacy؛ بدونِ مهاجرتِ داده)

-- فقط یک لیستِ پیش‌فرضِ سراسری برای هر شرکت
create unique index uq_price_list_default on price_list (company_id)
  where is_default and domain_id is null;

create index ix_price_list_domain on price_list (company_id, domain_id, priority desc)
  where is_active;

alter table price_list_item
  add column max_qty numeric(19,4),
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add column row_version integer not null default 0;
-- max_qty = NULL ⇒ سقفِ باز (رفتارِ legacy: فقط min_qty).
-- max_discount_pct از مهاجرت 0006 موجود است (سقفِ تخفیفِ همین قلم) — دست‌نخورده.
alter table price_list_item
  add constraint ck_price_list_item_qty
    check (max_qty is null or max_qty > min_qty);

-- سقفِ تعداد در قیدِ انحصاریِ موجود لحاظ نمی‌شود (هم‌پوشانیِ بازهٔ مقداری توسط موتور
-- با انتخابِ «بالاترین min_qty واجدِ شرط» حل می‌شود و در تست‌ها قفل شده است).

-- =====================================================================
-- §3  قیمتِ مشتری: سطحِ تعداد، سقفِ تخفیف، مرجعِ تأیید
-- =====================================================================
alter table customer_price
  add column min_qty numeric(19,4) not null default 0
    check (min_qty >= 0),
  add column max_qty numeric(19,4),
  add column max_discount_pct numeric(5,2)
    check (max_discount_pct is null or max_discount_pct between 0 and 100),
  add column approval_request_id uuid references approval_request(id),
  add column note text,
  add column created_by uuid,
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now(),
  add column row_version integer not null default 0;
alter table customer_price
  add constraint ck_customer_price_qty check (max_qty is null or max_qty > min_qty);

create index ix_customer_price_lookup on customer_price (customer_id, product_id);

-- قفلِ خوش‌بینانه برای «تغییرِ هم‌زمانِ قیمت» (نیازمندیِ ۱۸ TASK-24).
-- تریگرِ موجودِ fn_touch (مهاجرت 0001/0020) نسخه را افزایش می‌دهد؛ UPDATE با
-- row_version قدیمی صفر ردیف برمی‌گرداند ⇒ 409 version_conflict به‌جای بازنویسیِ خاموش.
create trigger trg_price_list_touch before update on price_list
  for each row execute function fn_touch();
create trigger trg_price_list_item_touch before update on price_list_item
  for each row execute function fn_touch();
create trigger trg_customer_price_touch before update on customer_price
  for each row execute function fn_touch();

-- =====================================================================
-- §4  تشویق: قلمرو، انحصار، سقف‌ها
-- =====================================================================
alter table promotion
  add column domain_id uuid references pricing_domain(id),
  add column exclusive_group text,
  add column max_discount_pct numeric(5,2)
    check (max_discount_pct is null or max_discount_pct between 0 and 100),
  add column max_uses_total integer check (max_uses_total is null or max_uses_total > 0),
  add column max_uses_per_customer integer
    check (max_uses_per_customer is null or max_uses_per_customer > 0),
  add column requires_coupon boolean not null default false;
-- NULL domain_id = تشویقِ سراسریِ شرکت (رفتارِ legacy)

create index ix_promotion_domain on promotion (company_id, domain_id, priority desc)
  where is_active;

-- =====================================================================
-- §5  کوپن، دفترِ مصرف، کشِ ارزیابیِ تکراری
-- =====================================================================
create table promotion_coupon (
  id                    uuid primary key default gen_random_uuid(),
  company_id            uuid not null references company(id),
  promotion_id          uuid not null references promotion(id) on delete cascade,
  code                  text not null,
  customer_id           uuid references customer(id),
  valid                 daterange not null,
  max_uses              integer check (max_uses is null or max_uses > 0),
  max_uses_per_customer integer check (max_uses_per_customer is null or max_uses_per_customer > 0),
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  constraint uq_promotion_coupon_code unique (company_id, code)
);

create index ix_promotion_coupon_promo on promotion_coupon (promotion_id)
  where is_active;

create table promotion_redemption (                    -- دفترِ مصرف؛ append-only از دیدِ سرویس
  id              bigint generated always as identity primary key,
  company_id      uuid not null references company(id),
  promotion_id    uuid not null references promotion(id),
  coupon_id       uuid references promotion_coupon(id),
  customer_id     uuid references customer(id),
  entity_type     text not null default 'order',
  entity_id       uuid,
  idempotency_key text not null,
  discount_amount numeric(19,2) not null check (discount_amount >= 0),
  redeemed_at     timestamptz not null default now(),
  redeemed_by     uuid,
  constraint uq_promotion_redemption_idem unique (company_id, idempotency_key, promotion_id)
);

create index ix_promotion_redemption_day
  on promotion_redemption (company_id, customer_id, promotion_id, redeemed_at);
create index ix_promotion_redemption_coupon on promotion_redemption (coupon_id)
  where coupon_id is not null;

create table promotion_evaluation (                    -- نتیجهٔ ارزیابی به‌ازای کلیدِ idempotency
  company_id      uuid not null references company(id),
  idempotency_key text not null,
  request_hash    text not null,
  result          jsonb not null,
  created_at      timestamptz not null default now(),
  primary key (company_id, idempotency_key)
);

-- =====================================================================
-- §6  کفِ سود + استثنای مجاز
-- =====================================================================
create table margin_policy (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references company(id),
  domain_id        uuid references pricing_domain(id),
  scope            text not null check (scope in ('company', 'category', 'product')),
  category_id      uuid references product_category(id),
  product_id       uuid references product(id),
  cost_basis       text not null default 'avg_cost'
                     check (cost_basis in ('avg_cost', 'standard_cost', 'last_purchase_cost')),
  min_margin_pct   numeric(7,4) not null check (min_margin_pct >= -1000 and min_margin_pct <= 100),
  on_unknown_cost  text not null default 'block'
                     check (on_unknown_cost in ('block', 'warn', 'ignore')),
  valid            daterange not null,
  priority         smallint not null default 100,
  is_active        boolean not null default true,
  created_by       uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  row_version      integer not null default 0,
  constraint ck_margin_policy_scope check (
    (scope = 'company' and category_id is null and product_id is null)
    or (scope = 'category' and category_id is not null and product_id is null)
    or (scope = 'product' and product_id is not null and category_id is null)
  ),
  -- یک سیاستِ فعال برای هر (شرکت، قلمرو، دامنهٔ هدف) در هر بازهٔ زمانی
  constraint ex_margin_policy exclude using gist (
    company_id with =,
    coalesce(domain_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
    scope with =,
    coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
    coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
    valid with &&
  )
);

create index ix_margin_policy_lookup on margin_policy (company_id, scope, product_id, category_id)
  where is_active;

create table margin_exception (                        -- استثنای مجاز (تصمیمِ شخصِ دوم)
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references company(id),
  policy_id           uuid references margin_policy(id),
  entity_type         text not null
                        check (entity_type in ('price_list_item', 'customer_price', 'sales_order', 'promotion')),
  entity_id           uuid,
  product_id          uuid references product(id),
  customer_id         uuid references customer(id),
  required_margin_pct numeric(7,4),
  effective_margin_pct numeric(7,4),
  granted_margin_pct  numeric(7,4),
  reason              text not null,
  status              text not null default 'pending'
                        check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  requested_by        uuid not null,
  decided_by          uuid,
  decided_at          timestamptz,
  decision_note       text,
  approval_request_id uuid references approval_request(id),
  valid_until         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  row_version         integer not null default 0,
  -- اصلِ «شخصِ دوم» در سطحِ DB: تأییدکننده نمی‌تواند همان درخواست‌دهنده باشد
  constraint ck_margin_exception_second_person
    check (decided_by is null or decided_by <> requested_by),
  constraint ck_margin_exception_decided
    check ((status in ('approved', 'rejected')) = (decided_by is not null))
);

create unique index uq_margin_exception_open on margin_exception (
  company_id, entity_type,
  coalesce(entity_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(customer_id, '00000000-0000-0000-0000-000000000000'::uuid)
) where status = 'pending';

create index ix_margin_exception_status on margin_exception (company_id, status, created_at desc);

-- =====================================================================
-- §7  دفترِ تغییرِ قیمت (append-only) + دفترِ شبیه‌سازی
-- =====================================================================
create table price_change_log (
  id                  bigint generated always as identity primary key,
  company_id          uuid not null references company(id),
  entity_type         text not null,
  entity_id           uuid,
  action              text not null,
  before_data         jsonb,
  after_data          jsonb,
  actor_user_id       uuid,
  approval_request_id uuid references approval_request(id),
  at                  timestamptz not null default now()
);

create index ix_price_change_log_entity on price_change_log (company_id, entity_type, entity_id, at desc);

-- تغییرناپذیری: هیچ UPDATE/DELETE روی دفترِ تغییرِ قیمت مجاز نیست (فقط درج).
create or replace function fn_price_change_log_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'دفترِ تغییرِ قیمت تغییرناپذیر است (append-only).'
    using errcode = 'check_violation';
end $$;

create trigger trg_price_change_log_immutable
  before update or delete on price_change_log
  for each row execute function fn_price_change_log_immutable();

create table price_simulation_log (                    -- فقط audit؛ هیچ سند/تراکنشِ کسب‌وکاری
  id            bigint generated always as identity primary key,
  company_id    uuid not null references company(id),
  actor_user_id uuid,
  request       jsonb not null,
  result        jsonb not null,
  created_at    timestamptz not null default now()
);

create index ix_price_simulation_log_company on price_simulation_log (company_id, created_at desc);

-- =====================================================================
-- §8  مجوزهای RBAC جدید (idempotent)
-- =====================================================================
insert into permission (code, module, title)
values
  ('pricing.simulation.run', 'pricing', 'اجرای شبیه‌سازیِ قیمت'),
  ('pricing.margin.view',    'pricing', 'مشاهدهٔ سیاست‌های کفِ سود'),
  ('pricing.margin.update',  'pricing', 'تعریف و ویرایشِ سیاستِ کفِ سود'),
  ('pricing.margin.override','pricing', 'تأییدِ استثنای کفِ سود (شخصِ دوم)'),
  ('pricing.audit.view',     'pricing', 'مشاهدهٔ تاریخچهٔ تغییرِ قیمت'),
  ('pricing.manual_price.apply', 'pricing', 'اعمالِ قیمتِ دستی روی قلم (عبور از قیمتِ سیستمی)'),
  ('pricing.discount.override',  'pricing', 'اعمالِ تخفیفِ دستی فراتر از سقفِ مجاز')
on conflict (code) do nothing;

-- =====================================================================
-- §9  RLS اجباری روی جدول‌های تازهٔ همین مهاجرت
-- =====================================================================
-- الگوی مستقیم (company_id در خودِ جدول) — همان قراردادِ 0041/0047.
alter table pricing_domain enable row level security;
alter table pricing_domain force row level security;
drop policy if exists p_pricing_domain_tenant on pricing_domain;
create policy p_pricing_domain_tenant on pricing_domain
  for all
  using (pricing_domain.company_id = fn_current_company_id())
  with check (pricing_domain.company_id = fn_current_company_id());

alter table promotion_coupon enable row level security;
alter table promotion_coupon force row level security;
drop policy if exists p_promotion_coupon_tenant on promotion_coupon;
create policy p_promotion_coupon_tenant on promotion_coupon
  for all
  using (promotion_coupon.company_id = fn_current_company_id()
         and exists (select 1 from promotion pr where pr.id = promotion_coupon.promotion_id))
  with check (promotion_coupon.company_id = fn_current_company_id()
              and exists (select 1 from promotion pr where pr.id = promotion_coupon.promotion_id));

alter table promotion_redemption enable row level security;
alter table promotion_redemption force row level security;
drop policy if exists p_promotion_redemption_tenant on promotion_redemption;
create policy p_promotion_redemption_tenant on promotion_redemption
  for all
  using (promotion_redemption.company_id = fn_current_company_id()
         and exists (select 1 from promotion pr where pr.id = promotion_redemption.promotion_id))
  with check (promotion_redemption.company_id = fn_current_company_id()
              and exists (select 1 from promotion pr where pr.id = promotion_redemption.promotion_id));

alter table promotion_evaluation enable row level security;
alter table promotion_evaluation force row level security;
drop policy if exists p_promotion_evaluation_tenant on promotion_evaluation;
create policy p_promotion_evaluation_tenant on promotion_evaluation
  for all
  using (promotion_evaluation.company_id = fn_current_company_id())
  with check (promotion_evaluation.company_id = fn_current_company_id());

alter table margin_policy enable row level security;
alter table margin_policy force row level security;
drop policy if exists p_margin_policy_tenant on margin_policy;
create policy p_margin_policy_tenant on margin_policy
  for all
  using (margin_policy.company_id = fn_current_company_id())
  with check (margin_policy.company_id = fn_current_company_id());

alter table margin_exception enable row level security;
alter table margin_exception force row level security;
drop policy if exists p_margin_exception_tenant on margin_exception;
create policy p_margin_exception_tenant on margin_exception
  for all
  using (margin_exception.company_id = fn_current_company_id())
  with check (margin_exception.company_id = fn_current_company_id());

alter table price_change_log enable row level security;
alter table price_change_log force row level security;
drop policy if exists p_price_change_log_tenant on price_change_log;
create policy p_price_change_log_tenant on price_change_log
  for all
  using (price_change_log.company_id = fn_current_company_id())
  with check (price_change_log.company_id = fn_current_company_id());

alter table price_simulation_log enable row level security;
alter table price_simulation_log force row level security;
drop policy if exists p_price_simulation_log_tenant on price_simulation_log;
create policy p_price_simulation_log_tenant on price_simulation_log
  for all
  using (price_simulation_log.company_id = fn_current_company_id())
  with check (price_simulation_log.company_id = fn_current_company_id());

-- گرانتِ صریح برای نقشِ زمانِ اجرا (مستقل از default privileges)
grant select, insert, update, delete
  on pricing_domain, promotion_coupon, promotion_redemption, promotion_evaluation,
     margin_policy, margin_exception, price_change_log, price_simulation_log
  to dms_app;
grant select
  on pricing_domain, promotion_coupon, promotion_redemption, promotion_evaluation,
     margin_policy, margin_exception, price_change_log, price_simulation_log
  to dms_readonly;
grant usage, select
  on promotion_redemption_id_seq, price_change_log_id_seq, price_simulation_log_id_seq
  to dms_app;

-- ترتیبِ ساختِ RLS/گرانت عمداً «جدول‌ها، دیده‌شدنِ والد، گرانت» است تا سیاستِ
-- promotion_coupon/redemption بتواند به promotion تکیه کند (RLSِ همان جدولِ موجود).

commit;
