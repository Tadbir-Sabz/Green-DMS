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
# ---------------------------------------------------------------------------
# WHY `\gexec` FOR THE ROLE DDL (TASK-15):
# psql never interpolates variables inside quoted SQL literals, and a
# dollar-quoted PL/pgSQL body IS such a literal. `:'role'` inside `$$ ... $$`
# reaches the server verbatim and first boot dies with:
#     ERROR:  syntax error at or near ":"
#     LINE 3:   v_role text := :'role';
# (psql exit code 3 ⇒ the postgres container aborts initialisation).
# Substitution must therefore happen OUTSIDE any dollar-quoted body: a plain
# SELECT builds the DDL with format('%I') — safe identifier quoting — and \gexec
# executes it.
#
# WHY THE PASSWORD IS NOT PART OF ANY SQL TEXT (TASK-17):
# The role statement used to carry the password as a SQL literal. Even after the
# password was moved out of psql's argv (TASK-16), `format('%L')` still put the
# PLAINTEXT into the statement text, so with log_statement set to ddl/mod/all the
# server log recorded e.g.
#     LOG:  statement: create role dms_app login password E'p''a$$ w\\o"rd-9'
# — a credential that outlives the process, is readable by anyone who can read
# the log, and is shipped off-host by every log collector. The same text also
# shows up in failure diagnostics when log_min_error_statement is verbose.
#
# psql's own `\password` closes the gap. It prompts for the password, hashes it
# CLIENT-SIDE and only ever sends
#     ALTER USER <role> PASSWORD 'SCRAM-SHA-256$4096:<salt>$<StoredKey>:<ServerKey>'
# (PostgreSQL 16 src/bin/psql/command.c, exec_command_password(), which calls
# PQencryptPasswordConn(pset.db, pw1, user, NULL)). The plaintext therefore never
# reaches the server: it cannot appear in log_statement output, in
# pg_stat_activity.query, or in an error diagnostic — on success OR on failure.
# What does travel is a verifier, i.e. a salted one-way hash, exactly as upstream
# psql does for every interactive password change.
#
# Automating `\password` with no terminal:
#   * simple_prompt_extended() opens /dev/tty and falls back to stdin/stderr when
#     that fails (PostgreSQL 16 src/common/sprompt.c). A container started by
#     `docker compose up` has no controlling terminal (the postgres service sets
#     no `tty:`), so stdin is used. `setsid --wait` makes this deterministic even
#     if a tty does exist: a new session has no controlling terminal, so
#     open("/dev/tty") fails with ENXIO. If setsid is unavailable AND a tty is
#     openable, we refuse to run rather than hang or let a human type a password.
#   * the two password lines are written with the bash BUILTIN printf, so the
#     value never appears in any process argv, and it is never placed in a
#     heredoc: bash implements heredocs with a temporary file, so only the
#     (secret-free) SQL script goes into one.
#   * psql reads its script from a process substitution, which keeps stdin free
#     for the two prompts.
#
# Fail-closed: ON_ERROR_STOP=1 aborts initialisation on any error; an empty
# password or one containing CR/LF is rejected before anything runs; and after
# `\password` a guard verifies a non-empty verifier was really stored, because an
# exhausted stdin would otherwise make \password apply an EMPTY password and
# still exit 0 (a silent false success).
# ---------------------------------------------------------------------------
set -euo pipefail

RUNTIME_ROLE="${APP_DB_ROLE:-dms_app}"
RUNTIME_PASSWORD="${APP_DB_PASSWORD:-dms_app_local}"

# --- fail-closed input guards ------------------------------------------------
# An empty password would be accepted by \password (it only compares the two
# prompts with each other) and would leave the runtime role passwordless.
if [ -z "$RUNTIME_PASSWORD" ]; then
  echo '10-runtime-role.sh: APP_DB_PASSWORD is empty; refusing to provision a passwordless runtime role.' >&2
  exit 1
fi
# simple_prompt reads one line per prompt, so CR/LF cannot survive the round trip.
case "$RUNTIME_PASSWORD" in
  *$'\n'* | *$'\r'*)
    echo '10-runtime-role.sh: APP_DB_PASSWORD must not contain a newline or carriage return; refusing to provision.' >&2
    exit 1
    ;;
esac

# Only the ROLE NAME is exported (not a secret) so that psql can read it with
# \getenv instead of receiving it in argv. The password is deliberately NOT
# exported: no child process needs it in its environment, and
# /proc/<pid>/environ of every child would otherwise carry it.
export GREEN_DMS_RUNTIME_ROLE="$RUNTIME_ROLE"

PSQL_CMD=(psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB")
HAVE_TTY=0
if (exec 9<> /dev/tty) 2>/dev/null; then
  HAVE_TTY=1
  exec 9<&- 9>&-
fi
if setsid --wait true >/dev/null 2>&1; then
  # New session ⇒ no controlling terminal ⇒ \password reads the stdin we pipe.
  PSQL_CMD=(setsid --wait "${PSQL_CMD[@]}")
elif [ "$HAVE_TTY" = '1' ]; then
  echo '10-runtime-role.sh: a controlling terminal is available and setsid(1) is missing; refusing to run so the password prompt cannot block or be typed interactively.' >&2
  exit 1
fi

printf '%s\n%s\n' "$RUNTIME_PASSWORD" "$RUNTIME_PASSWORD" |
  "${PSQL_CMD[@]}" -f <(cat <<'EOSQL'
\set QUIET on
-- The role name comes from the environment (\getenv), never from argv.
\getenv role GREEN_DMS_RUNTIME_ROLE
-- 1) create-or-update the role. There is NO PASSWORD in this statement, so its
--    text (and any log line or diagnostic quoting it) is credential-free.
select format(
         case when exists (select 1 from pg_roles where rolname = :'role')
              then 'alter role %I login'
              else 'create role %I login'
         end,
         :'role'
       ) as ddl
\gexec
-- 2) set the password. psql hashes it client-side and sends only the verifier.
--    The two prompts below are fed from stdin; they are not interactive.
\echo 'provisioning the runtime role password (client-side encrypted; the prompts below are fed from stdin)'
\password :"role"
-- 3) fail-closed guard: prove a non-empty verifier really was stored.
select exists (
         select 1 from pg_authid
          where rolname = :'role'
            and rolpassword is not null
            and rolpassword <> ''
       ) as pw_ok
\gset
\if :pw_ok
\echo 'runtime role is ready for LOGIN (local stack only)'
\else
\echo 'runtime role password was NOT stored; refusing to report success'
do $$ begin raise exception 'runtime role password was not stored (fail-closed)'; end $$;
\endif
EOSQL
)
