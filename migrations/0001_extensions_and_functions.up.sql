-- مهاجرت 0001 — پیش‌نیازها، پسوندها و توابع مشترک
-- منبع: dms-design-report.md › ضمیمه G › G.۲.۱
-- فاز توسعه: ۱ | ماژول/بخش: پیش‌نیازها، پسوندها و توابع مشترک

create extension if not exists pgcrypto;   -- gen_random_uuid

create extension if not exists pg_trgm;    -- جست‌وجوی فازی نام کالا و مشتری

create extension if not exists btree_gist; -- EXCLUDE روی بازه تاریخ همراه با کلید

create extension if not exists postgis;    -- نقطه مشتری، چندضلعی حوزه، مسیر

-- قفل خوش‌بینانه و ممیزی زمان
create or replace function fn_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at  := now();
  new.row_version := coalesce(old.row_version, 0) + 1;
  return new;
end $$;

-- جلوگیری از تغییر اسناد ثبت‌شده (فقط ابطال مجاز است)

create or replace function fn_immutable_after_post() returns trigger
language plpgsql as $$
begin
  if old.status = 'posted' and new.status <> 'voided' then
    raise exception 'سند ثبت‌شده قابل ویرایش نیست؛ از سند معکوس استفاده کنید (کد %).', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
