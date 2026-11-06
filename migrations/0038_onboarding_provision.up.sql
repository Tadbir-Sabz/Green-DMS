-- مهاجرت 0038 — خودخدمت‌دهیِ استقرار (onboarding): تابعِ اتمیِ ساختِ اجارهٔ جدید
-- یک شرکتِ تازه + شعبهٔ پیش‌فرض + کاشت نقش‌ها/سمت‌ها/مجوزها + شخص و حسابِ مدیر را
-- در یک تراکنشِ پایگاه‌داده می‌سازد. هشِ رمز در لایهٔ برنامه (scrypt) تولید و به
-- تابع داده می‌شود تا تابع فقط SQL بماند. کاشت نقش‌ها از یک «شرکتِ قالب» کپی می‌شود
-- (DRY، هم‌راستا با 0022)؛ اگر هیچ شرکتِ دیگری نباشد (اولین اجاره)، فقط نقشِ ceo
-- ساخته و به همهٔ مجوزها نگاشت می‌شود.

create or replace function fn_provision_company(
  p_company_code        text,
  p_company_name        text,
  p_admin_username      text,
  p_admin_password_hash text,
  p_admin_first_name    text,
  p_admin_last_name     text
) returns table (company_id uuid, branch_id uuid, person_id uuid, app_user_id uuid)
language plpgsql
as $$
declare
  v_company  uuid;
  v_branch   uuid;
  v_person   uuid;
  v_user     uuid;
  v_template uuid;
begin
  insert into company (code, legal_name)
  values (p_company_code, p_company_name)
  returning id into v_company;

  insert into branch (company_id, code, name)
  values (v_company, 'HQ', 'مرکز')
  returning id into v_branch;

  -- یافتنِ یک شرکتِ قالب برای کپیِ ساختارِ نقش‌ها
  select c.id into v_template
    from company c
   where c.id <> v_company
   order by c.created_at
   limit 1;

  if v_template is not null then
    insert into job_position (company_id, code, title, department)
      select v_company, jp.code, jp.title, jp.department
        from job_position jp where jp.company_id = v_template
      on conflict (company_id, code) do nothing;

    insert into role (company_id, code, name, is_system)
      select v_company, r.code, r.name, r.is_system
        from role r where r.company_id = v_template
      on conflict (company_id, code) do nothing;

    insert into role_permission (role_id, permission_code)
      select nr.id, tp.permission_code
        from role nr
        join role tr on tr.code = nr.code and tr.company_id = v_template
        join role_permission tp on tp.role_id = tr.id
       where nr.company_id = v_company
      on conflict do nothing;
  else
    insert into role (company_id, code, name, is_system)
      values (v_company, 'ceo', 'مدیرعامل / مدیر', true)
      on conflict (company_id, code) do nothing;
  end if;

  -- تضمین: نقش ceo این شرکت همهٔ مجوزهای کاتالوگ را دارد (concrete codes، هم‌راستا با 0022)
  insert into role_permission (role_id, permission_code)
    select r.id, p.code
      from role r cross join permission p
     where r.company_id = v_company and r.code = 'ceo'
    on conflict do nothing;

  -- شخصِ مدیر و حسابِ کاربریِ او
  insert into person (company_id, code, legal_type, first_name, last_name)
  values (v_company, 'ADMIN', 'natural', p_admin_first_name, p_admin_last_name)
  returning id into v_person;

  insert into app_user (person_id, username, password_hash, access_level)
  values (v_person, p_admin_username, p_admin_password_hash, 'web')
  returning id into v_user;

  -- انتصابِ نقش ceo به مدیر
  insert into user_role (app_user_id, role_id)
  select v_user, r.id from role r
   where r.company_id = v_company and r.code = 'ceo'
   limit 1;

  return query select v_company, v_branch, v_person, v_user;
end
$$;
