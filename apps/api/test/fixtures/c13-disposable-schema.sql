-- TASK-C13-EXECUTION-ENABLEMENT-01 — اسکیمای حداقلیِ مصنوعی برای محیطِ disposableِ C13.
-- ⚠️ ۱۰۰٪ ساختگی. هیچ ستون/ردیفِ واقعی؛ هیچ مهاجرتی از مخزن اجرا/تغییر داده نمی‌شود.
-- این فایل فقط برای تستِ خودکارِ خط‌لوله به کار می‌رود (disposable؛ پس از تست حذف می‌شود).
-- شبیه‌سازیِ کنترل‌های Track B: RLS enable+force روی جدول‌های هویتی + نقشِ فقط‌خواندنی (بیرون از این فایل ساخته می‌شود).

begin;

-- ── schema_migrations ─────────────────────────────────────────────
create table schema_migrations (
  version    text primary key,
  name       text not null,
  checksum   text not null default 'fixture',
  applied_at timestamptz not null default now()
);
insert into schema_migrations (version, name) values ('0065', 'fixture_minimal_0065');

-- ── company / product_category / product_family ───────────────────
create table company (
  id   text primary key,
  name text not null
);

create table product_category (
  id         text primary key,
  company_id text not null references company(id),
  code       text not null,
  name       text not null,
  constraint uq_fixture_category_code unique (company_id, code)
);

create table product_family (
  id         text primary key,
  company_id text not null references company(id),
  code       text not null,
  name       text not null,
  constraint uq_fixture_family_code unique (company_id, code)
);

create table product (
  id                text primary key,
  company_id        text not null references company(id),
  code              text not null,
  name              text not null,
  name_latin        text,
  variant_signature text,
  family_id         text references product_family(id),
  category_id       text references product_category(id),
  deleted_at        timestamptz,
  constraint uq_fixture_product_code unique (company_id, code)
);

create table product_alias (
  id         text primary key,
  company_id text not null references company(id),
  product_id text not null references product(id),
  alias      text not null,
  alias_norm text not null,
  kind       text not null default 'brand_slang',
  constraint uq_fixture_alias_norm unique (product_id, alias_norm)
);

create table product_packaging (
  id                  text primary key,
  product_id          text not null references product(id),
  uom_id              text,
  factor_to_base      numeric not null default 1,
  barcode             text,
  is_sales_default    boolean not null default false,
  is_purchase_default boolean not null default false,
  constraint uq_fixture_packaging unique (product_id, uom_id)
);

create table product_barcode (
  id           text primary key,
  company_id   text not null references company(id),
  product_id   text not null references product(id),
  packaging_id text references product_packaging(id),
  barcode      text not null,
  kind         text not null check (kind in ('gs1_ean13','gs1_ean8','gs1_upc','gs1_itf14','internal','other')),
  is_primary   boolean not null default false
);
create unique index uq_fixture_barcode_gs1 on product_barcode (barcode) where kind in ('gs1_ean13','gs1_ean8','gs1_upc','gs1_itf14');
create unique index uq_fixture_barcode_internal on product_barcode (company_id, barcode) where kind in ('internal','other');

-- ── RLS enable+force روی جدول‌های هویتی (آینهٔ 0047) ───────────────
alter table product_family enable row level security;
alter table product_family force row level security;
alter table product_alias enable row level security;
alter table product_alias force row level security;
alter table product_barcode enable row level security;
alter table product_barcode force row level security;

create policy p_product_family_tenant on product_family
  for select using (company_id = current_setting('app.company_id', true));
create policy p_product_alias_tenant on product_alias
  for select using (company_id = current_setting('app.company_id', true));
create policy p_product_barcode_tenant on product_barcode
  for select using (company_id = current_setting('app.company_id', true));

-- ── دادهٔ مصنوعی — شرکت‌های ساختگی ─────────────────────────────────
-- همهٔ مقادیر بی‌معنا و ساختگی‌اند؛ هیچ بارکدِ واقعیِ ثبت‌شده استفاده نشده.
insert into company values ('synth-company-1', 'شرکتِ آزمایشی ۱'), ('synth-company-2', 'شرکتِ آزمایشی ۲');

insert into product_category values
  ('synth-cat-1', 'synth-company-1', 'CAT-SYN-1', 'دستهٔ ساختگی ۱'),
  ('synth-cat-2', 'synth-company-2', 'CAT-SYN-2', 'دستهٔ ساختگی ۲');

insert into product_family values
  ('synth-fam-1', 'synth-company-1', 'FAM-SYN-1', 'خانوادهٔ ساختگی ۱'),
  ('synth-fam-2', 'synth-company-2', 'FAM-SYN-2', 'خانوادهٔ ساختگی ۲');

-- کالاها (شرکت ۱ و ۲)
insert into product (id, company_id, code, name, name_latin, variant_signature, family_id, category_id) values
  ('synth-p-001', 'synth-company-1', 'SKU-9',      'کالای ساختگی الف', 'Synthetic Alpha', 'sig-A', 'synth-fam-1', 'synth-cat-1'),
  ('synth-p-002', 'synth-company-1', 'sku-9',      'کالای ساختگی ب',   null,              null,     'synth-fam-1', 'synth-cat-1'),
  ('synth-p-003', 'synth-company-1', 'SYN-100',    'کالای ساختگی پ',  'Synthetic P3',    null,     null,         'synth-cat-1'),
  ('synth-p-004', 'synth-company-1', 'SYN-200',    'کالای ساختگی ت',  null,              'sig-D',  null,         null),
  ('synth-p-005', 'synth-company-2', 'SYN-300',    'کالای ساختگی ث',  'Synthetic Five',  null,     'synth-fam-2', 'synth-cat-2'),
  ('synth-p-006', 'synth-company-2', 'SYN-400',    'کالای ساختگی ج',  null,              null,     null,         'synth-cat-2'),
  ('synth-p-007', 'synth-company-1', 'SYN-500',    'کالای ساختگی چ',  null,              null,     null,         'synth-cat-1');

-- تستِ حساسیتِ حروف: SKU-9 و sku-9 در همان شرکت (برخوردِ CI-insensitive) ✓

-- بارکدهای کانونی — همه با محدودیت‌های واقعیِ نوع‌محور سُازگارند (سناریوهایِ «storable»)
insert into product_barcode (id, company_id, product_id, packaging_id, barcode, kind, is_primary) values
  -- gs1 کانونی روی p-001(c1) — رقمِ کنترلیِ معتبر
  ('synth-b-001', 'synth-company-1', 'synth-p-001', null, '4006381333931', 'gs1_ean13', true),
  -- همان ارقام به‌صورتِ internal در همان شرکت (p-002) — حفرهٔ cross-kindِ امروز؛ قابلِ ذخیره
  ('synth-b-002', 'synth-company-1', 'synth-p-002', null, '4006381333931', 'internal',  false),
  -- همان ارقام به‌صورتِ other در شرکتِ دیگر (p-005) — گروهِ XKINDِ بین‌شرکتی؛ قابلِ ذخیره
  ('synth-b-010', 'synth-company-2', 'synth-p-005', null, '4006381333931', 'other',     false),
  -- UPC و EANِ هم‌ارزش (یک بارکدِ فیزیکی، دو kind، دو کالا) — POL-UPC-EAN-PAD-01
  ('synth-b-003', 'synth-company-1', 'synth-p-003', null, '036000291452',  'gs1_upc',   true),
  ('synth-b-004', 'synth-company-1', 'synth-p-004', null, '0036000291452', 'gs1_ean13', true),
  -- رقمِ کنترلیِ غلط — POL-GS1-CHECKDIGIT-01
  ('synth-b-005', 'synth-company-1', 'synth-p-007', null, '4006381333932', 'gs1_ean13', true),
  -- مقدارِ داخلیِ یکسان در دو شرکت — مجاز؛ باید بدونِ یافته بماند (دامنهٔ شرکت)
  ('synth-b-006', 'synth-company-1', 'synth-p-001', null, '90000001',      'internal',  false),
  ('synth-b-007', 'synth-company-2', 'synth-p-006', null, '90000001',      'internal',  false),
  -- GTIN-14 معتبر در شرکتِ دیگر — برای مسیرِ cross-company در POL-PACKAGING-CANON-01
  ('synth-b-008', 'synth-company-2', 'synth-p-006', null, '12345678901231','gs1_itf14', true),
  -- کپیِ کانونیِ «اشتباه‌کالا»: legacyِ p-001 مقدار '5550001' دارد؛ کانونیِ همان مقدار روی p-003 گره خورده
  ('synth-b-009', 'synth-company-1', 'synth-p-003', null, '5550001',       'other',     false);

-- بسته‌بندی‌های legacy (بدون هیچ قیدِ یکتایی — مثل دنیای واقعی)
insert into product_packaging (id, product_id, uom_id, barcode, is_sales_default) values
  ('synth-pk-1', 'synth-p-001', 'unit',  '5550001',        true),   -- کانونی برای همین کالا نیست + کانونی روی کالای دیگر هست → missing + conflicting (همان شرکت)
  ('synth-pk-2', 'synth-p-003', 'carton','036000291452',   false),  -- کانونیِ همان کالا موجود → هم‌سو
  ('synth-pk-3', 'synth-p-004', 'unit',  '0036000291452',  false),  -- کانونیِ همان کالا موجود → هم‌سو
  ('synth-pk-4', 'synth-p-007', 'unit',  '12345678901231', false),  -- کانونی فقط در شرکتِ دیگر (gs1_itf14 معتبر) → missing_canonical_copy (+ conflict cross-company)
  ('synth-pk-5', 'synth-p-002', 'unit',  '7770000999',     false),  -- هیچ کپیِ کانونی → missing_canonical_copy
  ('synth-pk-6', 'synth-p-006', 'unit',  '55500006',       false);  -- هیچ کپیِ کانونی → missing_canonical_copy (داخلیِ p-006: '90000001' نیست)

-- aliasها
insert into product_alias (id, company_id, product_id, alias, alias_norm, kind) values
  ('synth-a-1', 'synth-company-1', 'synth-p-001', 'آلفا-عمومی', 'alfa-omowmi', 'brand_slang'),
  ('synth-a-2', 'synth-company-1', 'synth-p-002', 'آلفا عمومی', 'alfa-omowmi',  'brand_slang'),  -- همان norm، کالای متفاوت → POL-ALIAS-COMPANY-01
  ('synth-a-3', 'synth-company-1', 'synth-p-003', 'پرابزار',     'p-abzar',     'latin'),
  ('synth-a-4', 'synth-company-2', 'synth-p-005', 'پنج',         'panj',        'brand_slang');

commit;
