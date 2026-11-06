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
# WHY THE INHERITED ENVIRONMENT IS SCRUBBED FIRST (TASK-18):
# Compose exports APP_DB_PASSWORD into this script's environment, so without an
# explicit `unset` it is inherited by every child (setsid, the cat of the process
# substitution, psql) and sits in each child's /proc/<pid>/environ for that
# process's whole lifetime — readable by the process owner and by root, and long
# after the script has exited. TASK-17 only proved that no *additional* alias was
# exported; the inherited one was still there. The scrub therefore happens right
# after capture and validation and BEFORE any child is spawned: the known names
# are unset, RUNTIME_PASSWORD loses its export attribute via `export -n` (keeping
# its value), and any other inherited variable whose VALUE equals the password is
# dropped too, so a rename cannot smuggle it back in. Residual, stated plainly:
# this process's own /proc/<pid>/environ — and that of the entrypoint and the
# container, which Docker populated — cannot be rewritten after exec; removing the
# credential from those would require not passing a secret through the environment
# at all (e.g. a mounted Docker secret file), which is out of scope for this
# local-stack init script.
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

# --- strip the inherited credential BEFORE any child process exists -----------
# (TASK-18) docker-compose.yml hands APP_DB_PASSWORD to the postgres service, the
# official entrypoint runs this file with that environment, and bash imports an
# inherited variable as ALREADY EXPORTED. Copying it into a local variable does
# not remove the original, so every child we spawn inherited the plaintext in its
# own environment — measured on the pre-TASK-18 script, the `setsid`, `cat`
# (process substitution) and `psql` children all carried APP_DB_PASSWORD=<value>
# in /proc/<pid>/environ, for their whole lifetime.
#
# `unset` cannot clean THIS process's own /proc/<pid>/environ (that region is
# fixed at exec time, so the value Docker handed us stays visible to the owner of
# this process and to root) — but it does remove the variable from the
# environment every later child is exec'd with, which is what protects the
# children. Verified: after the unset, a child's own /proc/<pid>/environ contains
# no APP_DB_PASSWORD entry at all.
unset APP_DB_PASSWORD
# TASK-16 delivered the password under this alias. Drop it defensively so an
# operator's older env-file cannot reintroduce the secret through that name.
unset GREEN_DMS_RUNTIME_PASSWORD
# RUNTIME_PASSWORD keeps its VALUE but must never carry the export attribute —
# including when the caller exported a variable of that name before running us:
# assigning to an already-exported variable preserves the attribute, so `export -n`
# (remove the attribute, keep the value) is required rather than a mere assignment.
export -n RUNTIME_PASSWORD
# Defence in depth: also stop any OTHER inherited variable whose VALUE equals the
# password from reaching a child, whatever its name — renaming is not a fix, so
# aliases are matched by value, not by name. Only bash builtins are used (compgen,
# indirect expansion, export -n), so no external helper is exec'd before the
# environment is clean; the single command-substitution subshell runs a builtin
# and, by then, already has neither APP_DB_PASSWORD nor GREEN_DMS_RUNTIME_PASSWORD.
#
# PGPASSWORD/PGPASSFILE are NOT exempt from this loop (TASK-18R, QA-B1). A
# NON-colliding PGPASSWORD/PGPASSFILE is untouched — the value test below does not
# match it — so legitimate libpq authentication (the entrypoint's
# PGPASSWORD=$POSTGRES_PASSWORD, a CI client over TCP scram, an operator's
# PGPASSFILE path) keeps working exactly as before. But when such a variable's
# value EQUALS RUNTIME_PASSWORD it is the same secret under another name, and
# TASK-18's name-based `continue` used to hand it to every child anyway. PGPASSWORD
# carries a password value; PGPASSFILE carries a path string — both are compared by
# value like every other name. If a connection genuinely needs that exact password
# (TCP + scram with no trust rule), psql cannot connect once it is un-exported and
# ON_ERROR_STOP aborts the script: failing closed beats provisioning with the
# credential still exported. The supported first-boot path (official entrypoint,
# unix socket, `local all all trust`) needs no password and is unaffected.
#
# `export -n`, not `unset`, is the narrowest safe correction here. Matching by
# value is unavoidably ambiguous: an UNRELATED setting that merely happens to hold
# the same string cannot be told apart from a credential alias. Removing the export
# attribute satisfies the security property exactly — a child is exec'd with the
# exported set only, so a non-exported variable is invisible to psql/setsid/cat and
# to anything they spawn, and it is equally invisible to the server the entrypoint
# exec's afterwards — while leaving the value intact for this process, so no
# unrelated environment state is destroyed. The two names that ARE credentials
# (APP_DB_PASSWORD, GREEN_DMS_RUNTIME_PASSWORD) are unset above, and
# RUNTIME_PASSWORD must keep its value for the stdin delivery, so `export -n` is
# also the only behaviour that is correct for every name this loop can meet.
# Measured on bash 5.2.15: `export -n` on a READONLY variable SUCCEEDS (readonly
# protects the value, not the export attribute), so a readonly colliding variable
# is un-exported like any other; `unset` of a readonly name FAILS and `set -e`
# then aborts the script — that path is the fail-closed one (it can only occur when
# this script is sourced, since a fresh exec cannot inherit readonly).
for _t18_var in $(compgen -e); do
  if [ "${!_t18_var-}" = "$RUNTIME_PASSWORD" ]; then
    export -n "$_t18_var"
  fi
done
unset _t18_var

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
