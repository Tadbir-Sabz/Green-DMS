-- بازگردانیِ 0043: حذفِ توابعِ پنجرهٔ پیش‌اجاره، ویوهایِ شکلِ خروجی، سیاست‌ها و خاموش‌کردنِ RLS
-- رویِ خوشهٔ هویت (به وضعیتِ TASK-11، یعنی بدونِ RLS رویِ این پنج جدول).
-- ترتیب: اول توابع (به ویو وابسته‌اند)، بعد ویوها، بعد سیاست‌ها.
begin;

drop function if exists fn_auth_find_user(text, uuid);
drop function if exists fn_auth_find_session(uuid, text);
drop function if exists fn_auth_roles_permissions(uuid);
drop function if exists fn_auth_find_primary_phone(text);
drop function if exists fn_auth_create_session(uuid, text, text, text, text, timestamptz);
drop function if exists fn_auth_revoke_session(uuid, text);
drop function if exists fn_auth_rotate_session(uuid, uuid);
drop function if exists fn_auth_revoke_device(text, text);
drop function if exists fn_auth_revoke_user_sessions(uuid, text, uuid);
drop function if exists fn_auth_login_success(uuid);
drop function if exists fn_auth_login_failure(uuid, integer, integer);
drop function if exists fn_auth_set_password(uuid, text);

drop view if exists v_auth_session;
drop view if exists v_auth_user;

drop policy if exists p_role_permission_tenant on role_permission;
alter table role_permission no force row level security;
alter table role_permission disable row level security;

drop policy if exists p_user_role_tenant on user_role;
alter table user_role no force row level security;
alter table user_role disable row level security;

drop policy if exists p_user_scope_tenant on user_scope;
alter table user_scope no force row level security;
alter table user_scope disable row level security;

drop policy if exists p_auth_session_tenant on auth_session;
alter table auth_session no force row level security;
alter table auth_session disable row level security;

drop policy if exists p_app_user_tenant on app_user;
alter table app_user no force row level security;
alter table app_user disable row level security;

commit;
