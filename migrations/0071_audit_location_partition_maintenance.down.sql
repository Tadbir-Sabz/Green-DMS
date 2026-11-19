-- بازگشت 0071 (S8-05، مدل C). فقط سوپرکاربر؛ برای هر هویتِ دیگر fail-closed با 42501.
-- این بازگشت مالکیتِ هیچ جدولی را تغییر نمی‌دهد (مدل C مالکیت را منتقل نمی‌کند).
-- پارتیشن‌های ساخته‌شده حذف نمی‌شوند (داده‌های ممیزی/موقعیت).

do $$
begin
  if not coalesce((select rolsuper from pg_roles where rolname = current_user), false) then
    raise exception 'بازگشت 0071 فقط با سوپرکاربر مجاز است؛ هویت «%» مجاز نیست.', current_user
      using errcode = 'insufficient_privilege';
  end if;
end $$;

drop function if exists fn_maintain_location_partitions(integer);
drop function if exists fn_maintain_audit_partitions(integer);
