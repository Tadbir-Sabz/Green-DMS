-- بازگردانیِ 0045: حذفِ توابعِ OTP، ویو، سیاست‌ها و خاموش‌کردنِ RLS رویِ auth_otp/feature_flag
begin;
drop function if exists fn_otp_find_pending(text);
drop function if exists fn_otp_rate(text, text, timestamptz);
drop function if exists fn_otp_issue(text, text, text, text, integer);
drop function if exists fn_otp_attempt(uuid);
drop function if exists fn_otp_consume(uuid);
drop view if exists v_auth_otp;

drop policy if exists p_auth_otp_deny_direct on auth_otp;
alter table auth_otp no force row level security;
alter table auth_otp disable row level security;

drop policy if exists p_feature_flag_tenant on feature_flag;
alter table feature_flag no force row level security;
alter table feature_flag disable row level security;
commit;
