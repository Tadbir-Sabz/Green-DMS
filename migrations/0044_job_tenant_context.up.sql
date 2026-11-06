-- 0044: زمینهٔ اجاره برایِ کارگرِ پس‌زمینه — صفِ یکپارچه‌سازی‌ها (moadian/psp)
--
-- مسئلهٔ واقعی (نه بالقوه): IntegrationsQueue هر ۵ ثانیه با PG_POOL و «بدونِ هیچ زمینهٔ اجاره»
-- رویِ moadian_submission و psp_transaction UPDATE ... FOR UPDATE SKIP LOCKED می‌زند. هر دو جدول
-- اکنون RLS دارند (psp_transaction از 0041 و moadian_submission از 0042 با زنجیرهٔ
-- invoice_id → invoice → branch). زیرِ نقشِ زمانِ اجرا (dms_app) یعنی کارگر **صفر ردیف** می‌گیرد:
-- شغل‌ها هرگز پردازش نمی‌شوند و بی‌صدا «موفق» به نظر می‌رسند.
--
-- راه‌حلِ دو بخشی:
--   §1 تابعِ SECURITY DEFINER برایِ «برداشتنِ» شغلِ سررسیده — پنجرهٔ جهانیِ نگهداری، تنگ و
--      صریح: فقط شغل‌هایِ سررسیدِ دو جدولِ مشخص، با lock اتمیک، و بدونِ پذیرفتنِ هیچ فیلترِ
--      دلخواهی از بیرون جز سقفِ تعداد.
--   §2 همان تابع، اجارهٔ هر شغل را از «رکوردِ پایدارِ قابلِ اعتماد» مشتق می‌کند
--      (moadian_submission.invoice_id → invoice.branch_id → branch.company_id و
--       psp_transaction.branch_id → branch.company_id) و آن را برمی‌گرداند. سپس کارگر بقیهٔ
--      کارِ همان شغل را داخلِ زمینهٔ همان اجاره اجرا می‌کند.
--
-- دو قاعدهٔ امنیتیِ کلیدی:
--   * company_id هرگز از payloadِ شگل گرفته نمی‌شود (payload فقط به سرویسِ بیرونی می‌رود)؛
--     دستکاریِ payload نمی‌تواند دامنهٔ اجاره را عوض کند.
--   * اگر اجاره قابلِ اشتقاق نباشد (LEFT JOIN ⇒ company_id تهی)، شغل «مرده» ثبت می‌شود و
--     خطایش برایِ ممیزی می‌ماند؛ هرگز بی‌صدا موفق یا رها نمی‌شود (fail-closed).

begin;

-- =====================================================================
-- §1  برداشتنِ اتمیکِ شغل‌هایِ سررسیده + اشتقاقِ اجاره از رکوردِ پایدار
-- =====================================================================
create or replace function fn_job_claim_integration(p_limit integer)
returns table(kind text, job_id uuid, company_id uuid, branch_id uuid,
              attempt_count integer, payload text)
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with claim as (
    update moadian_submission set status = 'sending'
     where moadian_submission.id in (
       select id from moadian_submission
        where status in ('queued', 'retrying')
          and (next_retry_at is null or next_retry_at <= now())
        order by next_retry_at nulls first, id
        limit p_limit
        for update skip locked)
     returning moadian_submission.id, moadian_submission.invoice_id,
              moadian_submission.attempt_count, moadian_submission.payload)
  -- attempt_count در moadian_submission از نوع smallint است؛ بدونِ این cast خطایِ
  -- «structure of query does not match function result type» می‌داد (42804).
  select 'moadian'::text, c.id, b.company_id, i.branch_id, c.attempt_count::integer, c.payload::text
    from claim c
    left join invoice i on i.id = c.invoice_id
    left join branch  b on b.id = i.branch_id;

  return query
  with claim as (
    update psp_transaction set status = 'sending'
     where psp_transaction.id in (
       select id from psp_transaction
        where status in ('queued', 'retrying')
          and (next_retry_at is null or next_retry_at <= now())
        order by next_retry_at nulls first, id
        limit p_limit
        for update skip locked)
     returning psp_transaction.id, psp_transaction.branch_id,
              psp_transaction.attempt_count, psp_transaction.raw_payload)
  select 'psp'::text, c.id, b.company_id, c.branch_id, c.attempt_count::integer, c.raw_payload::text
    from claim c
    left join branch b on b.id = c.branch_id;
end $$;

-- =====================================================================
-- §2  پایانِ صریحِ شغلی که اجاره‌اش قابلِ اشتقاق نیست
-- =====================================================================
-- این شغل‌ها در هیچ زمینهٔ اجاره‌ای دیده نمی‌شوند (دقیقاً به همین دلیل گرفتارند)، پس ثبتِ
-- وضعیتِ نهایی‌شان نیازمندِ همان پنجرهٔ تنگِ SECURITY DEFINER است. پارامترِ kind فقط بینِ دو
-- مقدارِ ثابت سوییچ می‌شود و نامِ جدول از بیرون نمی‌آید.
create or replace function fn_job_mark_dead(p_kind text, p_job_id uuid, p_error text)
returns void
language plpgsql volatile security definer
set search_path = public, pg_temp
as $$
begin
  if p_kind = 'moadian' then
    update moadian_submission
       set status = 'dead', last_error = p_error, next_retry_at = null,
           attempt_count = moadian_submission.attempt_count + 1
     where id = p_job_id;
  elsif p_kind = 'psp' then
    update psp_transaction
       set status = 'dead', last_error = p_error, next_retry_at = null,
           attempt_count = psp_transaction.attempt_count + 1
     where id = p_job_id;
  else
    raise exception 'unknown integration job kind: %', p_kind using errcode = '22023';
  end if;
end $$;

-- =====================================================================
-- §3  کمینه‌امتیاز
-- =====================================================================
revoke all on function fn_job_claim_integration(integer) from public;
revoke all on function fn_job_claim_integration(integer) from dms_readonly;
grant execute on function fn_job_claim_integration(integer) to dms_app;

revoke all on function fn_job_mark_dead(text, uuid, text) from public;
revoke all on function fn_job_mark_dead(text, uuid, text) from dms_readonly;
grant execute on function fn_job_mark_dead(text, uuid, text) to dms_app;

comment on function fn_job_claim_integration(integer) is
  'برداشتنِ اتمیکِ شغلِ سررسیدهٔ یکپارچه‌سازی + اشتقاقِ اجاره از رکوردِ پایدار (نه از payload)؛ company_id تهی یعنی اجاره قابلِ اشتقاق نیست ⇒ fail-closed (0044)';
comment on function fn_job_mark_dead(text, uuid, text) is
  'ثبتِ وضعیتِ مرده برایِ شغلی که اجاره‌اش قابلِ اشتقاق نیست؛ تنها نوشتنی که بیرونِ زمینهٔ اجاره مجاز است (0044)';

commit;
