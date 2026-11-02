-- مهاجرت 0005 — واحدها، گروه کالا، بارکد/بسته‌بندی، بچ
-- منبع: dms-design-report.md › ضمیمه G › G.۴.۳
-- فاز توسعه: ۱ | ماژول/بخش: واحدها، گروه کالا، بارکد/بسته‌بندی، بچ

create table uom (                                         -- واحد اندازه‌گیری
  id      uuid primary key default gen_random_uuid(),
  code    text not null unique,                            -- pcs | box | carton | kg
  title   text not null,
  decimal_places smallint not null default 0 check (decimal_places between 0 and 4)
);

create table product_category (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id),
  parent_id   uuid references product_category(id),
  code        text not null,
  name        text not null,
  cost_method text not null default 'moving_avg'
                check (cost_method in ('moving_avg','fifo','standard')),  -- ماژول ۹
  is_active   boolean not null default true,
  constraint uq_product_category_code unique (company_id, code)
);

create table brand (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  name       text not null,
  constraint uq_brand_name unique (company_id, name)
);

create table tax_code (                                    -- گروه مالیاتی (مشترک با ضمیمه A §A.۶)
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id),
  code        text not null,
  title       text not null,
  rate_pct    numeric(5,2) not null default 0 check (rate_pct between 0 and 100),
  moadian_goods_service_id text,                           -- شناسه کالا/خدمت مؤدیان
  is_exempt   boolean not null default false,
  constraint uq_tax_code unique (company_id, code)
);

create table product (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references company(id),
  code                text not null,
  name                text not null,
  category_id         uuid not null references product_category(id),
  brand_id            uuid references brand(id),
  base_uom_id         uuid not null references uom(id),
  tax_code_id         uuid references tax_code(id),
  is_batch_tracked    boolean not null default false,
  is_expiry_tracked   boolean not null default false,
  shelf_life_days     integer check (shelf_life_days > 0),
  is_returnable_container boolean not null default false,  -- ظروف امانی (بطری/قفس)
  requires_permit     boolean not null default false,      -- دارو، دخانیات، مواد غذایی خاص
  distribution_kind   text not null default 'both'
                        check (distribution_kind in ('cold','warm','both')),
  min_order_qty       numeric(19,4) not null default 0 check (min_order_qty >= 0),
  weight_gr           integer,
  volume_cm3          integer,
  status              text not null default 'active'
                        check (status in ('active','blocked','discontinued')),
  deleted_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  row_version         integer not null default 0,
  constraint uq_product_code unique (company_id, code),
  constraint ck_product_batch check (not is_expiry_tracked or is_batch_tracked)
);

create index ix_product_name_trgm on product using gin (name gin_trgm_ops);

create index ix_product_category on product (category_id) where status = 'active';

create index ix_product_code_trgm on product using gin (code gin_trgm_ops);

create table product_packaging (                           -- سطوح بسته‌بندی با بارکد مستقل
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references product(id) on delete cascade,
  uom_id        uuid not null references uom(id),
  factor_to_base numeric(19,4) not null check (factor_to_base > 0),
  barcode       text,
  is_sales_default boolean not null default false,
  is_purchase_default boolean not null default false,
  constraint uq_product_packaging unique (product_id, uom_id)
);

create unique index uq_product_barcode on product_packaging (barcode) where barcode is not null;

create unique index uq_product_sales_pack on product_packaging (product_id) where is_sales_default;

create table batch (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references product(id),
  batch_no     text not null,
  produced_on  date,
  expires_on   date,
  supplier_id  uuid,                                       -- FK در §G.۱۲
  constraint uq_batch unique (product_id, batch_no),
  constraint ck_batch_dates check (expires_on is null or produced_on is null or expires_on >= produced_on)
);

create index ix_batch_expiry on batch (expires_on) where expires_on is not null;
