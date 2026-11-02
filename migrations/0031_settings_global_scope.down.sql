-- بازگشت مهاجرت 0031 — حذف دامنهٔ global و ستون company_id از setting

-- fn_setting به تعریف پیشین (مهاجرت 0002) بازمی‌گردد
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
       or (s.scope_type = 'company' and s.scope_id = p_company))
   order by case s.scope_type when 'user' then 1 when 'area' then 2
                              when 'branch' then 3 else 4 end
   limit 1
$$;

-- بازگرداندن یکتایی پیشین و not-null روی scope_id
drop index if exists uq_setting_scope;
create unique index uq_setting_scope on setting (key, scope_type, scope_id);
alter table setting drop constraint if exists ck_setting_scope_id;
-- ردیف‌های global پیش از بازگرداندن not-null حذف می‌شوند (scope_id تهی دارند)
delete from setting where scope_type = 'global';
alter table setting alter column scope_id set not null;

drop index if exists ix_setting_company;
alter table setting drop column if exists company_id;

alter table setting drop constraint if exists setting_scope_type_check;
alter table setting add constraint setting_scope_type_check
  check (scope_type in ('company','branch','area','region','route','user'));
