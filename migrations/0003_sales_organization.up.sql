-- مهاجرت 0003 — حوزه فروش، منطقه، مسیر، انتساب ویزیتور
-- منبع: dms-design-report.md › ضمیمه G › G.۴.۱
-- فاز توسعه: ۱ | ماژول/بخش: حوزه فروش، منطقه، مسیر، انتساب ویزیتور

create table sales_area (                                  -- حوزه فروش (شعبه ← حوزه)
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references branch(id),
  parent_area_id uuid references sales_area(id),
  code           text not null,
  name           text not null,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  row_version    integer not null default 0,
  constraint uq_sales_area_code unique (branch_id, code),
  constraint ck_sales_area_no_self check (parent_area_id is null or parent_area_id <> id)
);

create table region (                                      -- محدوده جغرافیایی (geofence کاری)
  id          uuid primary key default gen_random_uuid(),
  area_id     uuid not null references sales_area(id),
  name        text not null,
  boundary    geography(MultiPolygon, 4326) not null,
  color       text,
  is_active   boolean not null default true,
  constraint uq_region_name unique (area_id, name)
);

create index ix_region_boundary on region using gist (boundary);

create table route (                                       -- مسیر فروش
  id            uuid primary key default gen_random_uuid(),
  area_id       uuid not null references sales_area(id),
  code          text not null,
  name          text not null,
  visit_weekday smallint check (visit_weekday between 0 and 6),  -- 6 = جمعه
  is_active     boolean not null default true,
  constraint uq_route_code unique (area_id, code)
);

create table route_salesperson (                           -- انتساب مسیر به ویزیتور (با تاریخ)
  route_id       uuid not null references route(id),
  salesperson_id uuid not null,                            -- FK در بند staff افزوده می‌شود
  valid          daterange not null,
  primary key (route_id, salesperson_id, valid)
);
