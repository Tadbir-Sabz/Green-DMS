-- مهاجرت 0046 — Product Master (P1) — طبق PRODUCT_MASTER_TARGET_DESIGN.md و مصوبات D1–D5
-- منبع: docs/product-inventory/PRODUCT_MASTER_TARGET_DESIGN.md (TASK-21R/21Q/21S؛ PR #8)
-- فاز: P1 | ماژول: هویت/SKU، خانواده و variant، alias، بارکد (H-1)، صفات، روابط، bundle کاتالوگی (D5)،
--       snapshot اسناد (M-1/§D)، قیمتِ سطحِ بسته‌بندی (M-2)، import، مجوزها.
-- قاعده: تماماً افزودنی — هیچ داده‌ای جابه‌جا نمی‌شود؛ ستون‌های snapshot برای ردیف‌های قدیمی NULL می‌مانند
--        (هرگز backfill کور — «ساختنِ تاریخ جعلی» ممنوع).

-- =====================================================================
-- ۱) خانوادهٔ محصول و هویتِ variant (مدلِ A: SKU-per-variant با خانوادهٔ اختیاری)
-- =====================================================================
create table product_family (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  code       text not null,
  name       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_product_family_code unique (company_id, code)
);

alter table product
  add column name_latin text,
  add column family_id uuid references product_family(id),
  add column variant_signature text;

-- قیدِ قطعیِ تکرارِ variant (M-3/B2) — SKUهای بدون خانواده خارج از قید
create unique index uq_product_variant_signature
  on product (family_id, variant_signature)
  where variant_signature is not null;

-- =====================================================================
-- ۲) alias — تشخیصِ تکرار و جست‌وجوی جایگزین (§A)
-- =====================================================================
create table product_alias (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id),
  product_id uuid not null references product(id) on delete cascade,
  alias      text not null,
  alias_norm text not null,                      -- نرمال‌سازی‌شده (نرمال‌سازی در سرویس؛ قطعی)
  kind       text not null default 'brand_slang'
               check (kind in ('brand_slang','latin','code')),
  created_at timestamptz not null default now(),
  constraint uq_product_alias_norm unique (product_id, alias_norm)
);

create index ix_product_alias_norm_trgm on product_alias using gin (alias_norm gin_trgm_ops);
create index ix_product_alias_company on product_alias (company_id, alias_norm);

-- =====================================================================
-- ۳) صفات و مقادیر (B3 — L-1)
-- =====================================================================
create table product_attribute_def (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references company(id),
  code           text not null,
  title          text not null,
  kind           text not null check (kind in ('text','number','enum')),
  is_variant_axis boolean not null default false,
  is_required    boolean not null default false,
  sort_order     smallint not null default 0,
  created_at     timestamptz not null default now(),
  constraint uq_product_attribute_def_code unique (company_id, code)
);

create table product_attribute_enum_value (
  id         uuid primary key default gen_random_uuid(),
  def_id     uuid not null references product_attribute_def(id) on delete cascade,
  value      text not null,
  value_norm text not null,
  constraint uq_product_attribute_enum_value unique (def_id, value_norm)
);

create table product_attribute_value (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references product(id) on delete cascade,
  def_id     uuid not null references product_attribute_def(id) on delete cascade,
  value_text text,
  value_num  numeric(19,4),
  value_enum text,
  created_at timestamptz not null default now(),
  constraint uq_product_attribute_value unique (product_id, def_id),
  -- هم‌راستاییِ ستونِ مقدار با kind (B3)
  constraint ck_product_attribute_value_kind check (
    (value_text is not null)::int + (value_num is not null)::int + (value_enum is not null)::int = 1
  )
);

create index ix_product_attribute_value_def on product_attribute_value (def_id);

-- =====================================================================
-- ۴) جایگزین/مکمل (§A)
-- =====================================================================
create table product_relation (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id),
  product_id  uuid not null references product(id) on delete cascade,
  related_id  uuid not null references product(id) on delete cascade,
  kind        text not null check (kind in ('substitute','complement')),
  priority    smallint not null default 100,
  created_at  timestamptz not null default now(),
  constraint uq_product_relation unique (product_id, related_id, kind),
  constraint ck_product_relation_self check (product_id <> related_id)
);

create index ix_product_relation_related on product_relation (related_id);

-- =====================================================================
-- ۵) bundle — فقط کاتالوگ در P1 (D5 مصوب)
--    semantics عملیاتی (expansion/رزرو/تحویل/مرجوعی/بچ/COGS) منحصراً P5.
-- =====================================================================
create table product_bundle (
  bundle_product_id    uuid not null references product(id) on delete cascade,
  component_product_id uuid not null references product(id) on delete cascade,
  qty                  numeric(19,4) not null check (qty > 0),
  created_at           timestamptz not null default now(),
  constraint pk_product_bundle primary key (bundle_product_id, component_product_id),
  constraint ck_product_bundle_self check (bundle_product_id <> component_product_id)
);

create index ix_product_bundle_component on product_bundle (component_product_id);

-- قابلیتِ مشترکِ یکپارچگی: آیا این SKU بسته است؟ (ممنوعیتِ سفارش/فروش/موجودی تا P5)
create or replace function is_bundle_product(p_product_id uuid)
returns boolean language sql stable as $$
  select exists (select 1 from product_bundle where bundle_product_id = p_product_id);
$$;

comment on table product_bundle is 'ترکیبِ کاتالوگیِ بسته (P1) — طبق D5 تا P5 غیرقابل سفارش/فروش/حرکت موجودی';
comment on function is_bundle_product is 'D5: خطوط سفارش/فاکتور روی SKU بسته باید رد شوند (P1)';

-- hard-guard سطحِ DB (مرزِ نوشتن): خطِ سفارش/فاکتور/اعتباری/مرجوعی روی SKU بسته رد می‌شود.
-- service پیامِ فارسیِ صریح می‌دهد؛ این تریگر پشتیبانِ قطعی برای همهٔ مسیرهای نوشتن است (تا P5).
create or replace function fn_reject_bundle_line() returns trigger
language plpgsql as $$
begin
  if is_bundle_product(NEW.product_id) then
    raise exception using
      errcode = 'P0001',
      message = 'سفارش/فاکتور روی محصولِ «بسته» تا پیاده‌سازیِ semantics عملیاتی در P5 مجاز نیست (مصوبهٔ D5).';
  end if;
  return NEW;
end $$;

create trigger trg_sales_order_line_no_bundle before insert or update on sales_order_line
  for each row execute function fn_reject_bundle_line();
create trigger trg_invoice_line_no_bundle before insert or update on invoice_line
  for each row execute function fn_reject_bundle_line();
create trigger trg_credit_note_line_no_bundle before insert or update on credit_note_line
  for each row execute function fn_reject_bundle_line();
create trigger trg_return_request_line_no_bundle before insert or update on return_request_line
  for each row execute function fn_reject_bundle_line();

-- =====================================================================
-- ۶) بارکدِ اختصاصی (H-1 — آشتی TASK-21Q)
-- =====================================================================
create table product_barcode (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references company(id),          -- مالکیتِ tenant — حتی برای بارکدِ جهانی
  product_id   uuid not null references product(id) on delete cascade,
  packaging_id uuid references product_packaging(id) on delete cascade,
  barcode      text not null,                                  -- نرمال‌شده (سرویس: trim/ارقام/بدون فاصله)
  kind         text not null check (kind in
                 ('gs1_ean13','gs1_ean8','gs1_upc','gs1_itf14','internal','other')),
  is_primary   boolean not null default false,
  created_at   timestamptz not null default now(),
  constraint ck_product_barcode_nonempty check (length(barcode) > 0)
);

-- یکتاییِ نوع‌محور (D2): استانداردِ جهانی → یکتای سراسری؛ داخلی/سایر → یکتای در هر شرکت.
-- create unique index = حفاظتِ هم‌زمانی (race) در سطحِ DB.
create unique index uq_product_barcode_gs1
  on product_barcode (barcode)
  where kind in ('gs1_ean13','gs1_ean8','gs1_upc','gs1_itf14');

create unique index uq_product_barcode_internal
  on product_barcode (company_id, barcode)
  where kind in ('internal','other');

-- هر مقدارِ بارکد برای هر SKU فقط یک‌بار (چند بارکد در هر SKU/سطح مجاز؛ تکرارِ مقدار نه)
create unique index uq_product_barcode_product_value
  on product_barcode (product_id, barcode);

-- is_primary فقط یکی در هر (product, packaging) — coalesce برای سطحِ بدونِ بسته‌بندی
create unique index uq_product_barcode_primary
  on product_barcode (product_id, coalesce(packaging_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_primary;

create index ix_product_barcode_lookup on product_barcode (barcode);
create index ix_product_barcode_packaging on product_barcode (packaging_id) where packaging_id is not null;

-- انتقالِ بارکدهای موجود (کپی — ستونِ legacy تا P5 حذف نمی‌شود؛ طبق طرح)
insert into product_barcode (company_id, product_id, packaging_id, barcode, kind, is_primary)
select p.company_id,
       pp.product_id,
       pp.id,
       regexp_replace(translate(pp.barcode, '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'), '\s+', '', 'g'),
       'other',
       true
  from product_packaging pp
  join product p on p.id = pp.product_id
 where pp.barcode is not null and btrim(pp.barcode) <> ''
on conflict do nothing;

-- =====================================================================
-- ۷) شمارندهٔ کدِ خودکار (D1 — SKU دستی + تولیدِ خودکار)
-- =====================================================================
create table product_code_seq (
  company_id uuid primary key references company(id),
  next_seq   bigint not null default 1
);

-- =====================================================================
-- ۸) قیمتِ سطحِ بسته‌بندی + درمانِ قیدهای exclusion (M-2)
-- =====================================================================
alter table price_list_item
  add column packaging_id uuid references product_packaging(id);
-- NULL = واحدِ پایه/رفتارِ فعلیِ ردیف‌های legacy

alter table price_list_item drop constraint ex_price_list_item;
alter table price_list_item add constraint ex_price_list_item exclude using gist
  (price_list_id with =,
   product_id with =,
   coalesce(packaging_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
   min_qty with =,
   valid with &&);
-- semantics: هم‌پوشانی برای همان product+packaging مسدود؛ قیمتِ packagingهای متفاوت آزاد؛
-- ردیف‌های legacy با NULL دقیقاً رفتارِ امروز (sentinel مشترک).

alter table customer_price
  add column packaging_id uuid references product_packaging(id);

alter table customer_price drop constraint ex_customer_price;
alter table customer_price add constraint ex_customer_price exclude using gist
  (customer_id with =,
   product_id with =,
   coalesce(packaging_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
   valid with &&);

create index ix_price_list_item_packaging on price_list_item (packaging_id) where packaging_id is not null;
create index ix_customer_price_packaging on customer_price (packaging_id) where packaging_id is not null;

-- =====================================================================
-- ۹) snapshot اسناد (M-1/§D) — ستون‌های nullable؛ ردیف‌های قدیمی NULL می‌مانند
-- =====================================================================
-- sales_order_line (امروز qty_base/packaging_id دارد — ستون‌های snapshot افزوده می‌شوند)
alter table sales_order_line
  add column product_name     text,
  add column product_code     text,
  add column variant_display  text,
  add column packaging_label  text,
  add column tax_code         text,
  add column uom_title        text,
  add column packaging_factor numeric(19,4);

-- invoice_line — «امروز فقط qty»؛ لنگرهای واحد/تبدیل + snapshot
alter table invoice_line
  add column packaging_id     uuid references product_packaging(id),
  add column qty_base         numeric(19,4),
  add column product_name     text,
  add column product_code     text,
  add column variant_display  text,
  add column packaging_label  text,
  add column tax_code         text,
  add column uom_title        text,
  add column packaging_factor numeric(19,4);

-- credit_note_line
alter table credit_note_line
  add column packaging_id     uuid references product_packaging(id),
  add column qty_base         numeric(19,4),
  add column product_name     text,
  add column product_code     text,
  add column variant_display  text,
  add column packaging_label  text,
  add column tax_code         text,
  add column uom_title        text,
  add column packaging_factor numeric(19,4);

-- return_request_line
alter table return_request_line
  add column packaging_id     uuid references product_packaging(id),
  add column qty_base         numeric(19,4),
  add column product_name     text,
  add column product_code     text,
  add column variant_display  text,
  add column packaging_label  text,
  add column tax_code         text,
  add column uom_title        text,
  add column packaging_factor numeric(19,4);

-- purchase_order_line
alter table purchase_order_line
  add column product_name     text,
  add column product_code     text,
  add column uom_title        text,
  add column packaging_factor numeric(19,4);

-- goods_receipt_line
alter table goods_receipt_line
  add column product_name     text,
  add column product_code     text,
  add column uom_title        text,
  add column packaging_factor numeric(19,4);

-- stock_transfer_line
alter table stock_transfer_line
  add column product_name     text,
  add column product_code     text,
  add column uom_title        text,
  add column packaging_factor numeric(19,4);

-- waybill_line
alter table waybill_line
  add column product_name     text,
  add column product_code     text,
  add column uom_title        text,
  add column packaging_factor numeric(19,4);

-- delivery_line (فقط نام/کد برای چاپ/POD)
alter table delivery_line
  add column product_name     text,
  add column product_code     text;

-- stock_count_line
alter table stock_count_line
  add column product_name     text,
  add column product_code     text;

-- ---- تابعِ مشترکِ نوشتنِ snapshot (مرزِ نوشتنِ DB — همهٔ مسیرهای نوشتن) ----
-- قاعده: INSERT → همهٔ فیلدهای snapshot موجود در جدول پر می‌شوند؛
--        UPDATE → فقط فیلدهای هنوز NULL (هرگز بازنویسیِ snapshotِ ثبت‌شده = تغییرناپذیریِ تاریخ).
create or replace function fn_product_line_snapshot() returns trigger
language plpgsql as $$
declare
  rec          record;
  snap         jsonb;
  variant_disp text;
  v_new        jsonb := to_jsonb(NEW);
  v_product_id uuid;
  v_packaging  uuid;
begin
  v_product_id := (v_new->>'product_id')::uuid;
  v_packaging  := (v_new->>'packaging_id')::uuid;  -- در جدول‌های بدونِ این ستون NULL می‌ماند
  if v_product_id is null then
    return NEW;
  end if;

  select p.name,
         p.code,
         p.tax_code_id,
         p.base_uom_id,
         pk.id        as packaging_id,
         pk.factor_to_base as factor,
         pu.title     as packaging_uom_title,
         bu.title     as base_uom_title,
         tc.code      as tax_code_val
    into rec
    from product p
    left join product_packaging pk on pk.id = v_packaging
    left join uom pu on pu.id = pk.uom_id
    left join uom bu on bu.id = p.base_uom_id
    left join tax_code tc on tc.id = p.tax_code_id
   where p.id = v_product_id;

  if not found then
    return NEW;
  end if;

  -- نمایشِ محورهای variant (اختیاری؛ فقط اگر مقادیرِ محوری ثبت شده باشند)
  select string_agg(d.title || ': ' ||
           coalesce(v.value_text, v.value_enum, trim_scale(v.value_num)::text), '، ')
    into variant_disp
    from product_attribute_value v
    join product_attribute_def d on d.id = v.def_id
   where v.product_id = v_product_id and d.is_variant_axis;

  snap := jsonb_build_object(
    'product_name',     rec.name,
    'product_code',     rec.code,
    'variant_display',  variant_disp,
    'packaging_label',  case when rec.packaging_id is not null
                             then coalesce(rec.packaging_uom_title, '?') || ' (×' || trim_scale(rec.factor) || ')'
                             else null end,
    'tax_code',         rec.tax_code_val,
    'uom_title',        coalesce(rec.packaging_uom_title, rec.base_uom_title),
    'packaging_factor', coalesce(rec.factor, 1)
  );

  -- qty_base فقط هنگامِ درج و در صورتِ وجودِ ستون و مقدارِ خالی (D3: نوشتنِ یک‌بار، بدون بازمحاسبه)
  if TG_OP = 'INSERT' and v_new ? 'qty_base' and (v_new->>'qty_base') is null then
    snap := snap || jsonb_build_object(
      'qty_base', round(coalesce((v_new->>'qty')::numeric, 0) * coalesce(rec.factor, 1), 4));
  end if;

  if TG_OP = 'UPDATE' then
    -- فقط فیلدهای هنوز NULL پر شوند — snapshotِ موجود هرگز بازنویسی نمی‌شود
    snap := (select jsonb_object_agg(k, v) from jsonb_each(snap) as t(k, v)
              where (v_new->k) is null or (v_new->>k) is null);
    if snap is null or snap = '{}'::jsonb then
      return NEW;
    end if;
  end if;

  NEW := jsonb_populate_record(NEW, snap);
  return NEW;
end $$;

-- ---- تریگرها روی همهٔ جدول‌های خطِ سند (ماتریسِ §D) ----
create trigger trg_sales_order_line_snapshot before insert or update on sales_order_line
  for each row execute function fn_product_line_snapshot();
create trigger trg_invoice_line_snapshot before insert or update on invoice_line
  for each row execute function fn_product_line_snapshot();
create trigger trg_credit_note_line_snapshot before insert or update on credit_note_line
  for each row execute function fn_product_line_snapshot();
create trigger trg_return_request_line_snapshot before insert or update on return_request_line
  for each row execute function fn_product_line_snapshot();
create trigger trg_purchase_order_line_snapshot before insert or update on purchase_order_line
  for each row execute function fn_product_line_snapshot();
create trigger trg_goods_receipt_line_snapshot before insert or update on goods_receipt_line
  for each row execute function fn_product_line_snapshot();
create trigger trg_stock_transfer_line_snapshot before insert or update on stock_transfer_line
  for each row execute function fn_product_line_snapshot();
create trigger trg_waybill_line_snapshot before insert or update on waybill_line
  for each row execute function fn_product_line_snapshot();
create trigger trg_delivery_line_snapshot before insert or update on delivery_line
  for each row execute function fn_product_line_snapshot();
create trigger trg_stock_count_line_snapshot before insert or update on stock_count_line
  for each row execute function fn_product_line_snapshot();

-- ---- مدلِ خوانشِ مشترک (L-3): fallback یکسان برای همهٔ گزارش‌ها/چاپ‌ها ----
create or replace view v_document_line_display as
select 'sales_order'::text as document_type, l.id as line_id, l.product_id,
       coalesce(l.product_name, p.name) as product_name,
       coalesce(l.product_code, p.code) as product_code,
       l.variant_display, l.packaging_label, l.tax_code, l.uom_title, l.packaging_factor,
       case when l.product_name is not null then 'snapshot' else 'catalog' end as snapshot_source
  from sales_order_line l join product p on p.id = l.product_id
union all
select 'invoice', l.id, l.product_id,
       coalesce(l.product_name, p.name), coalesce(l.product_code, p.code),
       l.variant_display, l.packaging_label, l.tax_code, l.uom_title, l.packaging_factor,
       case when l.product_name is not null then 'snapshot' else 'catalog' end
  from invoice_line l join product p on p.id = l.product_id
union all
select 'credit_note', l.id, l.product_id,
       coalesce(l.product_name, p.name), coalesce(l.product_code, p.code),
       l.variant_display, l.packaging_label, l.tax_code, l.uom_title, l.packaging_factor,
       case when l.product_name is not null then 'snapshot' else 'catalog' end
  from credit_note_line l join product p on p.id = l.product_id
union all
select 'return_request', l.id, l.product_id,
       coalesce(l.product_name, p.name), coalesce(l.product_code, p.code),
       l.variant_display, l.packaging_label, l.tax_code, l.uom_title, l.packaging_factor,
       case when l.product_name is not null then 'snapshot' else 'catalog' end
  from return_request_line l join product p on p.id = l.product_id
union all
select 'purchase_order', l.id, l.product_id,
       coalesce(l.product_name, p.name), coalesce(l.product_code, p.code),
       null::text, null::text, null::text, l.uom_title, l.packaging_factor,
       case when l.product_name is not null then 'snapshot' else 'catalog' end
  from purchase_order_line l join product p on p.id = l.product_id
union all
select 'goods_receipt', l.id, l.product_id,
       coalesce(l.product_name, p.name), coalesce(l.product_code, p.code),
       null::text, null::text, null::text, l.uom_title, l.packaging_factor,
       case when l.product_name is not null then 'snapshot' else 'catalog' end
  from goods_receipt_line l join product p on p.id = l.product_id
union all
select 'stock_transfer', l.id, l.product_id,
       coalesce(l.product_name, p.name), coalesce(l.product_code, p.code),
       null::text, null::text, null::text, l.uom_title, l.packaging_factor,
       case when l.product_name is not null then 'snapshot' else 'catalog' end
  from stock_transfer_line l join product p on p.id = l.product_id
union all
select 'waybill', l.id, l.product_id,
       coalesce(l.product_name, p.name), coalesce(l.product_code, p.code),
       null::text, null::text, null::text, l.uom_title, l.packaging_factor,
       case when l.product_name is not null then 'snapshot' else 'catalog' end
  from waybill_line l join product p on p.id = l.product_id
union all
select 'delivery', l.id, l.product_id,
       coalesce(l.product_name, p.name), coalesce(l.product_code, p.code),
       null::text, null::text, null::text, null::text, null::numeric,
       case when l.product_name is not null then 'snapshot' else 'catalog' end
  from delivery_line l join product p on p.id = l.product_id
union all
select 'stock_count', l.id, l.product_id,
       coalesce(l.product_name, p.name), coalesce(l.product_code, p.code),
       null::text, null::text, null::text, null::text, null::numeric,
       case when l.product_name is not null then 'snapshot' else 'catalog' end
  from stock_count_line l join product p on p.id = l.product_id;

comment on view v_document_line_display is
  'مدلِ خوانشِ مشترکِ snapshot (L-3): COALESCE یکسان + snapshot_source ∈ {snapshot, catalog}';

-- =====================================================================
-- ۱۰) import محصول (§E) — نتیجه و گزارشِ ردیف‌به‌ردیف + idempotency
-- =====================================================================
create table product_import (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references company(id),
  idempotency_key text not null,
  mode           text not null check (mode in ('create','update','upsert')),
  total_rows     integer not null default 0,
  created_rows   integer not null default 0,
  updated_rows   integer not null default 0,
  failed_rows    integer not null default 0,
  report         jsonb not null default '[]'::jsonb,
  created_by     uuid,
  created_at     timestamptz not null default now(),
  constraint uq_product_import_idem unique (company_id, idempotency_key)
);

-- =====================================================================
-- ۱۱) مجوزها (§F — fallback پیش از G-03: RBAC + تأییدِ صریح + audit)
-- =====================================================================
insert into permission (code, module, title) values
  ('master.product.import', 'master', 'ورودِ انبوهِ کالا (CSV)'),
  ('master.product.status', 'master', 'تغییر وضعیت/توقف کالا (عملیاتِ حساس)')
on conflict (code) do nothing;

-- اعطا به نقش‌هایی که امروز «ویرایشِ کالا» دارند (الگوهای wildcard در 0022 باز شده‌اند)
insert into role_permission (role_id, permission_code)
select distinct r.id, v.code
  from role r
  join (values ('master.product.import'), ('master.product.status')) v(code) on true
 where exists (select 1 from role_permission rp
                where rp.role_id = r.id and rp.permission_code = 'master.product.update')
on conflict do nothing;
