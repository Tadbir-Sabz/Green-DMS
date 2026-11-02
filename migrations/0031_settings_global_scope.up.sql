-- مهاجرت 0031 — افزودن دامنهٔ global به setting + کلید شرکت برای scoping
-- منبع: dms-design-report.md › ضمیمه G › G.۱۱ (تنظیمات) و openapi › schemas.SettingEntry
-- فاز توسعه: ۶ | ماژول/بخش: تنظیمات (ماژول ۱۱)
--
-- قرارداد (SettingEntry.scope_type) دامنهٔ «global» را می‌شناسد ولی DDL مهاجرت 0002
-- آن را در check ندارد. اینجا check بازنویسی می‌شود تا global مجاز شود.
-- چون setting ستون company_id ندارد و scope_id برای global بی‌معناست، ستون
-- company_id افزوده می‌شود تا تنظیمات سراسریِ هر شرکت (tenant) جدا بماند و
-- scoping به‌تفکیک شرکت ممکن شود.

alter table setting drop constraint if exists setting_scope_type_check;
alter table setting add constraint setting_scope_type_check
  check (scope_type in ('global','company','branch','area','region','route','user'));

-- company_id برای scoping چندشرکتی؛ برای ردیف‌های موجود از scope_type=company
-- با scope_id همان شرکت پر می‌شود، در غیر این صورت null (سراسری واقعی).
alter table setting add column if not exists company_id uuid references company(id);

update setting s
   set company_id = s.scope_id
 where s.company_id is null and s.scope_type = 'company';

create index if not exists ix_setting_company on setting (company_id, key);

-- تنظیم سراسری (global) شناسهٔ دامنه ندارد؛ scope_id برای آن nullable می‌شود.
-- برای دامنه‌های غیر global، scope_id همچنان الزامی است (قید زیر).
alter table setting alter column scope_id drop not null;
alter table setting drop constraint if exists ck_setting_scope_id;
alter table setting add constraint ck_setting_scope_id
  check (scope_type = 'global' or scope_id is not null);

-- یکتایی کلید در هر دامنه؛ برای global با scope_id تهی، از company_id استفاده می‌شود
-- تا دو تنظیم سراسریِ یک کلید در یک شرکت تکراری نشوند.
drop index if exists uq_setting_scope;
create unique index uq_setting_scope on setting (key, scope_type, coalesce(scope_id, company_id));

-- fn_setting با سلسله‌مراتب override بازنویسی می‌شود: user > area > branch > company > global
create or replace function fn_setting(p_key text, p_company uuid,
                                      p_branch uuid default null,
                                      p_area uuid default null,
                                      p_user uuid default null)
returns jsonb language sql stable as $$
  select s.value from setting s
   where s.key = p_key
     and ((s.scope_type = 'user'    and s.scope_id = p_user)
       or (s.scope_type = 'area'    and s.scope_id = p_area)
       or (s.scope_type = 'branch'  and s.scope_id = p_branch)
       or (s.scope_type = 'company' and s.scope_id = p_company)
       or (s.scope_type = 'global'  and (s.company_id = p_company or s.company_id is null)))
   order by case s.scope_type when 'user' then 1 when 'area' then 2
                              when 'branch' then 3 when 'company' then 4 else 5 end
   limit 1
$$;
