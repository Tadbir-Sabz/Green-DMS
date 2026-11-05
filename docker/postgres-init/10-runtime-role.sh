#!/bin/bash
# ---------------------------------------------------------------------------
# LOCAL DEVELOPMENT ONLY — runs from /docker-entrypoint-initdb.d, i.e. only when
# the postgres data directory is EMPTY (the very first `docker compose up`).
# It can never execute against an already-initialised or production database, and
# it performs no REASSIGN OWNED / no privilege escalation: it only gives the
# runtime role LOGIN so the API can connect as a NON-privileged identity
# (migration 0041 hardens it to nosuperuser/nobypassrls/nocreatedb/nocreaterole
# and grants it least-privilege DML; RLS then really applies).
#
# The password comes from APP_DB_PASSWORD (default is a throwaway local value).
# No real credential belongs in source control — override it in production via
# `docker compose --env-file .env.production`.
# ---------------------------------------------------------------------------
set -euo pipefail

RUNTIME_ROLE="${APP_DB_ROLE:-dms_app}"
RUNTIME_PASSWORD="${APP_DB_PASSWORD:-dms_app_local}"

psql -v ON_ERROR_STOP=1 \
     --username "$POSTGRES_USER" \
     --dbname "$POSTGRES_DB" \
     -v role="$RUNTIME_ROLE" \
     -v pass="$RUNTIME_PASSWORD" <<'EOSQL'
do $$
declare
  v_role text := :'role';
  v_pass text := :'pass';
begin
  if not exists (select 1 from pg_roles where rolname = v_role) then
    execute format('create role %I login password %L', v_role, v_pass);
  else
    execute format('alter role %I login password %L', v_role, v_pass);
  end if;
  raise notice 'runtime role % is ready for LOGIN (local stack only)', v_role;
end
$$;
EOSQL
