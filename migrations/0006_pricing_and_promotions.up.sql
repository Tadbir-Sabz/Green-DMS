-- مهاجرت 0006 — لیست قیمت، قیمت مشتری، موتور تخفیف
-- منبع: dms-design-report.md › ضمیمه G › G.۴.۴
-- فاز توسعه: ۱ | ماژول/بخش: لیست قیمت، قیمت مشتری، موتور تخفیف

create table price_list (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  code       text not null,
  title      text not null,
  kind       text not null default 'general'
               check (kind in ('general','wholesale','retail','chain','cooperative','channel')),
  currency   char(3) not null default 'IRR',
  is_active  boolean not null default true,
  constraint uq_price_list_code unique (company_id, code)
);

-- دو قیمت هم‌زمان برای یک کالا در یک لیست، از نظر دیتابیس ناممکن است

create table price_list_item (
  id               uuid primary key default gen_random_uuid(),
  price_list_id    uuid not null references price_list(id) on delete cascade,
  product_id       uuid not null references product(id),
  price            numeric(19,4) not null check (price >= 0),
  min_qty          numeric(19,4) not null default 0 check (min_qty >= 0),
  max_discount_pct numeric(5,2) check (max_discount_pct between 0 and 100),
  valid            daterange not null,
  constraint ex_price_list_item exclude using gist
    (price_list_id with =, product_id with =, min_qty with =, valid with &&)
);

create index ix_price_list_item_lookup on price_list_item (price_list_id, product_id)
  where upper_inf(valid);

create table customer_price (                              -- قیمت اختصاصی مشتری (اولویت اول)
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null,                               -- FK در ادامه همین بخش
  product_id  uuid not null references product(id),
  price       numeric(19,4) not null check (price >= 0),
  valid       daterange not null,
  approved_by uuid,
  constraint ex_customer_price exclude using gist (customer_id with =, product_id with =, valid with &&)
);

create table promotion (                                   -- تخفیف و جایزه
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references company(id),
  code           text not null,
  title          text not null,
  kind           text not null check (kind in
                   ('percent_line','amount_line','bundle','buy_x_get_y','gift_item',
                    'cash_discount','repeat_order','coupon','volume_tier')),
  valid          daterange not null,
  priority       smallint not null default 100,
  allow_stacking boolean not null default false,
  max_discount_amount numeric(19,2),
  max_per_customer_per_day numeric(19,2),
  conditions     jsonb not null default '{}'::jsonb,       -- شرط‌های ساخت‌یافته (کالا/گروه/تعداد/کانال)
  benefit        jsonb not null default '{}'::jsonb,       -- درصد/مبلغ/کالای جایزه
  is_active      boolean not null default true,
  constraint uq_promotion_code unique (company_id, code)
);

create index ix_promotion_active on promotion (company_id, priority desc) where is_active;

create index ix_promotion_conditions on promotion using gin (conditions);
