-- Narrow pre-tenant capability, analogous to staff refresh lookup (0043).
-- No caller-supplied company; possession of the opaque refresh hash is required.
create function fn_portal_find_refresh(p_hash text)
returns table (id uuid, portal_user_id uuid, company_id uuid, customer_id uuid,
 email text, revoked_at timestamptz, expires_at timestamptz)
language sql stable security definer set search_path = public, pg_temp
as $$
 select s.id, s.portal_user_id, s.company_id, u.customer_id, u.email, s.revoked_at, s.expires_at
 from portal_session s join portal_user u on u.id = s.portal_user_id
 where s.refresh_hash = p_hash limit 1
$$;
revoke all on function fn_portal_find_refresh(text) from public;
grant execute on function fn_portal_find_refresh(text) to dms_app;
