-- بازگردانیِ مهاجرت 0054 — TASK-24Z
--
-- ایمن برای داده: فقط ساختارهای همین مهاجرت را برمی‌دارد.
--   • ایندکسِ یکتایی حذف می‌شود (ساختار، نه داده).
--   • ستونِ `approval_decision.meta` **حذف نمی‌شود** اگر مقدار داشته باشد؛
--     زمینهٔ تفکیل بخشی از تاریخچهٔ حسابرسی است و نابودیِ آن مجاز نیست.
--     اگر همهٔ مقادیر NULL باشند، ستون حذف می‌شود تا rollback کامل باشد.
--
-- قاعدهٔ کلیِ 24Z: rollback هرگز دادهٔ حسابرسی را دور نمی‌ریزد.

begin;

drop index if exists uq_approval_binding_active;

do $$
begin
  if exists (select 1 from approval_decision where meta is not null) then
    -- دادهٔ ارزشمند: ستون می‌ماند. (rollback «ناقص» است، ولی داده گم نمی‌شود.)
    raise notice 'TASK-24Z: approval_decision.meta داده دارد؛ ستون حفظ شد (حذف نمی‌شود).';
  else
    alter table approval_decision drop column if exists meta;
  end if;
end $$;

commit;
