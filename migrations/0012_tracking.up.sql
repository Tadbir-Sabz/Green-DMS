-- مهاجرت 0012 — دستگاه، شیفت میدانی، موقعیت، geofence، مسیر
-- منبع: dms-design-report.md › ضمیمه G › G.۹
-- فاز توسعه: ۴ | ماژول/بخش: دستگاه، شیفت میدانی، موقعیت، geofence، مسیر

create table device (                                      -- ثبت دستگاه میدانی برای ابطال از راه دور
  id            uuid primary key default gen_random_uuid(),
  app_user_id   uuid not null references app_user(id),
  device_uuid   text not null,                             -- شناسه سخت‌افزاری
  platform      text not null check (platform in ('android')),
  app_kind      text not null check (app_kind in ('sales','delivery','telesales')),
  app_version   text,
  os_version    text,
  push_token    text,
  is_trusted    boolean not null default false,
  revoked_at    timestamptz,                               -- خروج/گم شدن گوشی
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  constraint uq_device unique (app_user_id, device_uuid)
);

create index ix_device_active on device (app_user_id) where revoked_at is null;

create table field_session (                               -- شیفت کاری میدانی
  id            uuid primary key default gen_random_uuid(),
  staff_id      uuid not null references staff(id),
  device_id     uuid references device(id),
  tour_id       uuid references tour(id),
  kind          text not null check (kind in ('sales','delivery','telesales')),
  started_at    timestamptz not null default now(),
  ended_at      timestamptz,
  start_geo     geography(Point, 4326),
  end_geo       geography(Point, 4326),
  start_odometer_km numeric(10,1),
  end_odometer_km   numeric(10,1),
  status        text not null default 'open' check (status in ('open','closed','abandoned')),
  constraint ck_field_session_time check (ended_at is null or ended_at >= started_at)
);

create index ix_field_session_open on field_session (staff_id) where status = 'open';

-- نمونه موقعیت: پرحجم‌ترین جدول سامانه (هدف NFR: ۵۰ میلیون در سال)

create table location_sample (
  id          bigint generated always as identity,
  staff_id    uuid not null,
  session_id  uuid,
  tour_id     uuid,
  geo         geography(Point, 4326) not null,
  accuracy_m  numeric(8,2),
  speed_mps   numeric(8,2),
  heading_deg numeric(6,2),
  battery_pct smallint check (battery_pct between 0 and 100),
  is_mocked   boolean not null default false,              -- موقعیت جعلی
  provider    text check (provider in ('gps','network','fused')),
  recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  primary key (id, recorded_at)
) partition by range (recorded_at);

create index ix_location_session_time on location_sample (session_id, recorded_at desc);

create index ix_location_staff_time on location_sample (staff_id, recorded_at desc);

create index brin_location_time on location_sample using brin (recorded_at);

create table geofence (                                    -- محدوده جغرافیایی کار/مشتری
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references branch(id),
  name        text not null,
  kind        text not null check (kind in ('work_area','customer','warehouse','restricted')),
  area        geography(MultiPolygon, 4326) not null,      -- هر شکل، از جمله دایره تبدیل‌شده به چندضلعی
  customer_id uuid references customer(id),
  warehouse_id uuid references warehouse(id),
  is_active   boolean not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  constraint ck_geofence_target check
    (kind <> 'customer' or customer_id is not null)
);

create index ix_geofence_area on geofence using gist (area);

create index ix_geofence_active on geofence (branch_id, kind) where is_active;

create table geofence_event (                              -- ورود/خروج ثبت‌شده
  id          bigint generated always as identity,
  geofence_id uuid not null references geofence(id),
  session_id  uuid references field_session(id),
  staff_id    uuid not null,
  event       text not null check (event in ('enter','exit','dwell')),
  geo         geography(Point, 4326) not null,
  at          timestamptz not null default now(),
  primary key (id)
);

create index ix_geofence_event_staff on geofence_event (staff_id, at desc);

create table route_plan (                                  -- نتیجه بهینه‌سازی مسیر
  id             uuid primary key default gen_random_uuid(),
  tour_id        uuid references tour(id),
  staff_id       uuid not null references staff(id),
  plan_date      date not null,
  provider       text not null check (provider in ('neshan','map_ir','osrm','google','manual')),
  objective      text not null default 'distance'
                   check (objective in ('distance','duration','balanced')),
  total_distance_m integer,
  total_duration_s integer,
  stop_count     smallint,
  request_params jsonb not null default '{}'::jsonb,       -- پنجره زمانی، ظرفیت، ترافیک
  geometry       geography(LineString, 4326),
  created_at     timestamptz not null default now()
);

create index ix_route_plan_tour on route_plan (tour_id, created_at desc);

create table route_plan_stop (
  id               uuid primary key default gen_random_uuid(),
  route_plan_id    uuid not null references route_plan(id) on delete cascade,
  seq              smallint not null check (seq > 0),
  customer_id      uuid not null references customer(id),
  eta              timestamptz,
  distance_from_prev_m integer,
  constraint uq_route_plan_stop unique (route_plan_id, seq)
);
