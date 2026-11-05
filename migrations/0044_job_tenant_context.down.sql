-- بازگردانیِ 0044: حذفِ توابعِ صف. کارگر به رفتارش پیش از 0044 (UPDATE مستقیم بدونِ زمینهٔ
-- اجاره) برمی‌گردد؛ هیچ سیاستِ RLS یا امتیازی در این مهاجرت تغییر نکرده بود.
begin;
drop function if exists fn_job_mark_dead(text, uuid, text);
drop function if exists fn_job_claim_integration(integer);
commit;
