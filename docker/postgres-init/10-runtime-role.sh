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
#
# WHY `\gexec` INSTEAD OF A `DO $$ ... $$` BLOCK (TASK-15):
# psql never interpolates variables inside quoted SQL literals, and a
# dollar-quoted PL/pgSQL body IS such a literal. `:'role'` inside `$$ ... $$`
# reaches the server verbatim and first boot dies with:
#     ERROR:  syntax error at or near ":"
#     LINE 3:   v_role text := :'role';
# (psql exit code 3 ⇒ the postgres container aborts initialisation).
# Substitution must therefore happen OUTSIDE any dollar-quoted body: a plain
# SELECT builds the DDL with format('%I'/'%L') — safe identifier and password
# literal quoting — and \gexec executes it. The password is never echoed: psql
# does not echo script input by default and \gexec does not print the generated
# command, so nothing sensitive reaches the container log.
# ---------------------------------------------------------------------------
set -euo pipefail

RUNTIME_ROLE="${APP_DB_ROLE:-dms_app}"
RUNTIME_PASSWORD="${APP_DB_PASSWORD:-dms_app_local}"

# ---------------------------------------------------------------------------
# THE PASSWORD MUST NOT APPEAR IN THE psql COMMAND LINE (TASK-16).
#
# `-v pass="$RUNTIME_PASSWORD"` put the secret in argv, and argv is world-readable
# on Linux through /proc/<pid>/cmdline for the whole lifetime of the process: any
# local user (and anything that scrapes process lists - monitoring agents, `ps`,
# container log collectors, crash reporters) could read the runtime database
# password while the first-boot script ran. The process environment is NOT
# world-readable (/proc/<pid>/environ is 0400, owned by the process user), so the
# value is exported instead and read inside psql with \getenv.
#
# Everything else is unchanged: format('%I') still quotes the identifier,
# format('%L') still quotes the password literal, \gexec still executes the single
# generated row, ON_ERROR_STOP=1 still fails the whole initialisation on any error,
# and the role is still ALTERed when it already exists (idempotent).
# ---------------------------------------------------------------------------
export GREEN_DMS_RUNTIME_ROLE="$RUNTIME_ROLE"
export GREEN_DMS_RUNTIME_PASSWORD="$RUNTIME_PASSWORD"

psql -v ON_ERROR_STOP=1 \
     --username "$POSTGRES_USER" \
     --dbname "$POSTGRES_DB" <<'EOSQL'
\set QUIET on
-- \getenv متغیرها را از محیطِ فرآیند می‌خواند (نه از argv). جای‌گذاریِ :'role'/:'pass'
-- باید بیرونِ هر بدنهٔ dollar-quoted بماند، چون psql داخلِ literalها جای‌گذاری نمی‌کند
-- (همان علتِ شکستِ نخستین بوت در TASK-15).
\getenv role GREEN_DMS_RUNTIME_ROLE
\getenv pass GREEN_DMS_RUNTIME_PASSWORD
select format(
         case when exists (select 1 from pg_roles where rolname = :'role')
              then 'alter role %I login password %L'
              else 'create role %I login password %L'
         end,
         :'role',
         :'pass'
       ) as ddl
\gexec
\echo 'runtime role is ready for LOGIN (local stack only)'
EOSQL
