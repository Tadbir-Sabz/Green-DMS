-- مهاجرت 0050 — اصلاحاتِ هدفمندِ حسابرسیِ TASK-24R (TASK-24F)
--
-- هدف (هر بخش به شناسهٔ یافتهٔ Agent-2 نگاشت می‌شود):
--   §1  MEDIUM-4 — «دفترِ مصرفِ تشویق» واقعاً append-only می‌شود (تریگر + سلبِ
--        UPDATE/DELETE از نقشِ زمانِ اجرا). اصلاحِ اشتباه با «ردیفِ جبرانی» انجام
--        می‌شود، نه بازنویسیِ تاریخچه.
--   §2  HIGH-2/MEDIUM-1 — سیاستِ پایدارِ قیمت‌گذاریِ شرکت (`pricing_settings`):
--        سقفِ کلِ تخفیف (که پیش‌تر پارامترِ درخواست بود) و سقفِ پیش‌فرضِ تخفیفِ قلم،
--        اعمالِ خودکارِ تشویق روی سفارش، مجوزِ فروشِ زیرِ بهای تمام‌شده و عقب‌گردِ مجاز.
--   §3  مجوزهای جدیدِ RBAC: تنظیمِ سیاست، تاریخِ گذشته، لیستِ قیمتِ بین‌قلمرویی.
--
-- قاعدهٔ اجرا: افزودنی و برگشت‌پذیر؛ هیچ داده/ستونی از پیش حذف نمی‌شود.

begin;

-- =====================================================================
-- §1  دفترِ مصرفِ تشویق: تغییرناپذیریِ DB-enforced
-- =====================================================================
-- چرا: مقدارِ `discount_amount` مبنای سقفِ مصرف/گزارش/تسویه است؛ اگر نقشِ اجرا
-- بتواند آن را UPDATE/DELETE کند، سقف‌های مصرف بی‌اثر و تاریخچه غیرقابلِ اتکا می‌شود.
create or replace function fn_promotion_redemption_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'دفترِ مصرفِ تشویق تغییرناپذیر است (append-only)؛ برای اصلاح، ردیفِ جبرانی ثبت کنید.'
    using errcode = 'check_violation';
end $$;

drop trigger if exists trg_promotion_redemption_immutable on promotion_redemption;
create trigger trg_promotion_redemption_immutable
  before update or delete on promotion_redemption
  for each row execute function fn_promotion_redemption_immutable();

-- گرانتِ 0049 «select, insert, update, delete» بود؛ اکنون فقط خواندن/درج.
revoke update, delete on promotion_redemption from dms_app;

comment on function fn_promotion_redemption_immutable() is
  'append-only بودنِ promotion_redemption (TASK-24F · MEDIUM-4): UPDATE/DELETE مسدود است.';

-- =====================================================================
-- §2  سیاستِ پایدارِ قیمت‌گذاریِ شرکت
-- =====================================================================
create table pricing_settings (
  id                        uuid primary key default gen_random_uuid(),
  company_id                uuid not null unique references company(id),
  -- اعمالِ خودکارِ تشویق روی سفارش (پیش‌فرض خاموش = رفتارِ امروز تا مصوبهٔ مالک)
  apply_promotions_on_orders boolean not null default false,
  -- سقفِ کلِ تخفیفِ سند (NULL = بدونِ سقف؛ مقدار باید با مصوبهٔ مالک تعیین شود)
  max_total_discount_pct     numeric(5,2)
                              check (max_total_discount_pct is null or max_total_discount_pct between 0 and 100),
  -- سقفِ پیش‌فرضِ تخفیفِ هر قلم وقتی منبعِ قیمت سقفِ خودش را ندارد
  max_line_discount_pct      numeric(5,2)
                              check (max_line_discount_pct is null or max_line_discount_pct between 0 and 100),
  -- فروش زیرِ بهای تمام‌شده (پیش‌فرض ممنوع؛ فقط با استثنای محدود یا این سیاست)
  allow_loss_making_sales    boolean not null default false,
  -- حداکثر عقب‌گردِ مجازِ تاریخِ سفارش (NULL = فقط با مجوزِ pricing.backdate.apply)
  min_order_date_lookback_days integer
                              check (min_order_date_lookback_days is null or min_order_date_lookback_days >= 0),
  -- الزامِ ثبتِ دلیل برای قیمتِ دستی/عبور از سقف/تاریخِ گذشته
  require_override_reason    boolean not null default true,
  updated_by                 uuid,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  row_version                integer not null default 0
);

comment on table pricing_settings is
  'سیاستِ پایدارِ قیمت‌گذاریِ هر شرکت (TASK-24F): سقفِ تخفیف، اعمالِ تشویق، فروشِ زیرِ بهای تمام‌شده، عقب‌گرد.';

create trigger trg_pricing_settings_touch before update on pricing_settings
  for each row execute function fn_touch();

alter table pricing_settings enable row level security;
alter table pricing_settings force row level security;
drop policy if exists p_pricing_settings_tenant on pricing_settings;
create policy p_pricing_settings_tenant on pricing_settings
  for all
  using (pricing_settings.company_id = fn_current_company_id())
  with check (pricing_settings.company_id = fn_current_company_id());

grant select, insert, update, delete on pricing_settings to dms_app;
grant select on pricing_settings to dms_readonly;

-- =====================================================================
-- §3  مجوزهای RBAC (idempotent)
-- =====================================================================
insert into permission (code, module, title)
values
  ('pricing.settings.view',         'pricing', 'مشاهدهٔ سیاستِ قیمت‌گذاریِ شرکت'),
  ('pricing.settings.update',       'pricing', 'تعریف/ویرایشِ سیاستِ قیمت‌گذاریِ شرکت'),
  ('pricing.backdate.apply',        'pricing', 'ثبتِ سفارش با تاریخِ گذشته (با دلیل و ممیزی)'),
  ('pricing.price_list.cross_domain','pricing', 'استفاده از لیستِ قیمتِ قلمرویِ دیگر (با دلیل و ممیزی)')
on conflict (code) do nothing;

commit;
