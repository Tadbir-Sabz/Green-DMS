#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# verify-init-credential-hygiene.sh — TASK-17
#
# Proves, against a REAL and DISPOSABLE PostgreSQL server, that
# docker/postgres-init/10-runtime-role.sh never puts the runtime role's
# plaintext password into:
#   * psql's argv                     (world-readable /proc/<pid>/cmdline)
#   * any SQL statement text          (what log_statement records)
#   * the PostgreSQL server log       (with log_statement=all)
#   * failure diagnostics             (with log_min_error_statement=debug5)
# and that the role still gets LOGIN, no privileged attribute, and a password
# that really authenticates over SCRAM-SHA-256.
#
# Why a server log is needed: `log_statement=all` records exactly the statement
# strings the server receives, so it is the ground truth for "did the plaintext
# reach the server?". Client-side inspection alone cannot answer that.
#
# Every check is paired with a NEGATIVE CONTROL: a temporary "vulnerable" copy of
# the script that reproduces the pre-TASK-17 mechanism (`format('%L', password)`
# + `\gexec`). It MUST leak, otherwise the detector is vacuous and the PASS means
# nothing.
#
# Isolation: creates its own cluster in a fresh directory under TMPDIR with a
# free TCP port and a private unix-socket directory, binds only to 127.0.0.1, and
# removes everything on exit. It never touches an existing data directory,
# volume, service or database.
#
# Usage:
#   PG_BIN=/usr/lib/postgresql/16/bin scripts/verify-init-credential-hygiene.sh
# If PG_BIN is unset, initdb's directory on PATH is used, otherwise the newest
# /usr/lib/postgresql/*/bin is used.
# ---------------------------------------------------------------------------
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/docker/postgres-init/10-runtime-role.sh"

PASS=0
FAIL=0
ok()   { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
bad()  { FAIL=$((FAIL + 1)); printf 'FAIL  %s\n' "$1"; }
note() { printf '      %s\n' "$1"; }

# --- locate server + client binaries ----------------------------------------
if [ -n "${PG_BIN:-}" ]; then
  BINDIR="$PG_BIN"
elif command -v initdb >/dev/null 2>&1; then
  BINDIR="$(dirname "$(command -v initdb)")"
else
  BINDIR="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
fi
[ -n "$BINDIR" ] || { echo "no PostgreSQL binaries found (set PG_BIN)"; exit 2; }
for b in initdb pg_ctl postgres psql pg_isready; do
  [ -x "$BINDIR/$b" ] || { echo "missing $BINDIR/$b"; exit 2; }
done
export PATH="$BINDIR:$PATH"
# libpq/postgres may need their library path when running from a packaged build
if [ -n "${PG_LIB:-}" ]; then export LD_LIBRARY_PATH="$PG_LIB${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"; fi

PSQLV="$("$BINDIR/postgres" --version 2>&1 | head -1)"

# --- disposable cluster ------------------------------------------------------
WORK="${TMPDIR:-/tmp}/t17-hygiene-$$-$RANDOM"
PGDATA="$WORK/pgdata"
SOCK="$WORK/sock"
LOG="$WORK/server.log"
WRAP="$WORK/wrap"
mkdir -p "$SOCK" "$WRAP"

PORT=""
# pg_isready exits 0 only when something is already accepting connections on the
# port, so a non-zero exit means the port is free.
for p in $(shuf -i 55400-55999 -n 40 2>/dev/null || seq 55400 55440); do
  if ! "$BINDIR/pg_isready" -h 127.0.0.1 -p "$p" -q >/dev/null 2>&1; then PORT="$p"; break; fi
done
[ -n "$PORT" ] || { echo "no free port found"; exit 2; }

cleanup() {
  "$BINDIR/pg_ctl" -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT INT TERM

"$BINDIR/initdb" -D "$PGDATA" -U t17admin --auth-local=trust --auth-host=trust \
  -E UTF8 --no-locale >"$WORK/initdb.log" 2>&1 ||
  { echo "initdb failed:"; tail -20 "$WORK/initdb.log"; exit 2; }

# TCP requires SCRAM so real password authentication is exercised; the admin keeps
# using the unix socket (trust), exactly like the official entrypoint's temp server.
printf 'host all all 127.0.0.1/32 scram-sha-256\n' | cat - "$PGDATA/pg_hba.conf" >"$WORK/hba" &&
  mv "$WORK/hba" "$PGDATA/pg_hba.conf"

"$BINDIR/pg_ctl" -D "$PGDATA" -l "$LOG" -w start -o "\
-p $PORT -k $SOCK -c listen_addresses=127.0.0.1 \
-c log_statement=all -c log_min_error_statement=debug5 \
-c password_encryption=scram-sha-256 -c fsync=off" >"$WORK/start.log" 2>&1 ||
  { echo "server start failed:"; tail -30 "$LOG" "$WORK/start.log" 2>/dev/null; exit 2; }

# admin over the socket (trust) — never over TCP
adm() { "$BINDIR/psql" -h "$SOCK" -p "$PORT" -U t17admin -d postgres -Atq -c "$1"; }
# runtime-role login over TCP (scram-sha-256)
try_login() { # $1=role $2=password → prints psql output, returns its status
  PGPASSWORD="$2" "$BINDIR/psql" -h 127.0.0.1 -p "$PORT" -U "$1" -d postgres -Atq \
    -c "select current_user || ' super=' || (select rolsuper from pg_roles where rolname = current_user)::text" 2>&1
}

# --- child-process instrumentation ------------------------------------------
# Wraps EVERY external child the init script spawns — psql, setsid (when used) and
# the `cat` of the process substitution — and records for each one its real argv
# (psql), a copy of its stdin (psql; the channel under test) and its REAL
# inherited environment twice: from /proc/<pid>/environ and from `env`, i.e. two
# independent reads of the same process. Checking only one chosen variable NAME is
# not enough, so the harness scans the VALUE of every variable.
#
# The wrappers exec the real binaries by absolute path, so wrapping `cat` cannot
# recurse. Captured values live only inside the disposable $WORK directory that the
# EXIT trap deletes, and the report prints NAMES and counts, never values.
# NB: /proc/self/environ reads as 0 bytes through a shell redirect on some
# sandboxes, so the wrappers use the explicit /proc/$$/environ form.
REAL_CAT="$(command -v cat)"
REAL_SETSID="$(command -v setsid 2>/dev/null || true)"

cat >"$WRAP/psql" <<EOF
#!/bin/bash
tmp="\$(mktemp '$WRAP/stdin.XXXXXX')"
'$REAL_CAT' > "\$tmp"
{
  printf 'INVOCATION\n'
  for a in "\$@"; do printf 'ARG %s\n' "\$a"; done
  printf 'PROC-PID %s\n' "\$\$"
  echo 'ENVPROC-BEGIN'; tr '\\0' '\\n' < "/proc/\$\$/environ"; echo 'ENVPROC-END'
  echo 'ENVCMD-BEGIN'; env; echo 'ENVCMD-END'
  echo 'STDIN-BEGIN'; '$REAL_CAT' "\$tmp"; echo 'STDIN-END'
} >> '$WRAP/capture.log'
if [ -n "\${T18_WATCH_SLEEP:-}" ]; then sleep "\$T18_WATCH_SLEEP"; fi
exec '$BINDIR/psql' "\$@" < "\$tmp"
EOF
chmod +x "$WRAP/psql"

cat >"$WRAP/cat" <<EOF
#!/bin/bash
{
  printf 'CAT-PID %s\n' "\$\$"
  echo 'ENVPROC-BEGIN'; tr '\\0' '\\n' < "/proc/\$\$/environ"; echo 'ENVPROC-END'
  echo 'ENVCMD-BEGIN'; env; echo 'ENVCMD-END'
} >> '$WRAP/cat.log'
if [ -n "\${T18_WATCH_SLEEP:-}" ]; then sleep "\$T18_WATCH_SLEEP"; fi
exec '$REAL_CAT' "\$@"
EOF
chmod +x "$WRAP/cat"

if [ -n "$REAL_SETSID" ]; then
  cat >"$WRAP/setsid" <<EOF
#!/bin/bash
{
  printf 'SETSID-PID %s\n' "\$\$"
  echo 'ENVPROC-BEGIN'; tr '\\0' '\\n' < "/proc/\$\$/environ"; echo 'ENVPROC-END'
  echo 'ENVCMD-BEGIN'; env; echo 'ENVCMD-END'
} >> '$WRAP/setsid.log'
if [ -n "\${T18_WATCH_SLEEP:-}" ]; then sleep "\$T18_WATCH_SLEEP"; fi
exec '$REAL_SETSID' "\$@"
EOF
  chmod +x "$WRAP/setsid"
fi
reset_wraps() { : >"$WRAP/capture.log"; : >"$WRAP/cat.log"; : >"$WRAP/setsid.log"; }

# --- password forms ----------------------------------------------------------
# PostgreSQL logs a string literal in E'' form when it contains a backslash, so a
# grep for the raw password alone gives a FALSE PASS. Every form must be absent.
pw_forms() { # $1=password → prints all SQL-literal spellings, one per line
  local p="$1"
  printf '%s\n' "$p"
  printf '%s\n' "${p//\\/\\\\}"                     # backslashes doubled
  printf "%s\n" "${p//\'/\'\'}"                     # single quotes doubled
  local q="${p//\\/\\\\}"
  printf "%s\n" "${q//\'/\'\'}"                     # both (the real E'' form)
}
leak_count() { # $1=password $2=file → number of matching lines
  local n=0 f
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    n=$((n + $(grep -cF -- "$f" "$2" 2>/dev/null || true)))
  done < <(pw_forms "$1")
  printf '%s\n' "$n"
}

# Extract one labelled section (BEGIN/END) from a capture file.
section() { # $1=file $2=BEGIN-tag $3=END-tag
  sed -n "/^$2\$/,/^$3\$/p" "$1" 2>/dev/null | sed -e '1d' -e '$d'
}
# NAMES of environment variables whose VALUE equals the password, taken from both
# the /proc/<pid>/environ and the `env` sections. Values are never printed.
env_leak_names() { # $1=password $2=file
  { section "$2" ENVPROC-BEGIN ENVPROC-END; section "$2" ENVCMD-BEGIN ENVCMD-END; } |
    awk -F= -v pw="$1" 'NF >= 2 { n = $1; v = substr($0, length(n) + 2); if (v == pw) print n }' |
    sort -u
}
env_var_count() { # $1=file $2=BEGIN $3=END → how many variables were really captured
  section "$1" "$2" "$3" | grep -c '=' 2>/dev/null || true
}
# Report one child's environment. $1=label $2=file
check_child_env() {
  local label="$1" f="$2" n leaked
  if [ ! -s "$f" ]; then
    note "$label: not spawned in this run — UNVERIFIED for that child (no claim made)"
    return 0
  fi
  n=$(env_var_count "$f" ENVPROC-BEGIN ENVPROC-END)
  leaked="$(env_leak_names "$HOSTILE" "$f" | tr '\n' ' ')"
  if [ "$n" -lt 5 ]; then
    bad "$label: its real environment could not be read ($n variables) — check would be vacuous"
  elif [ -n "$leaked" ]; then
    bad "$label: environment carries the password value via: $leaked"
  else
    ok "$label: no variable of $n carries the password value (/proc/<pid>/environ and env agree)"
  fi
  local v
  for v in APP_DB_PASSWORD RUNTIME_PASSWORD GREEN_DMS_RUNTIME_PASSWORD; do
    if section "$f" ENVPROC-BEGIN ENVPROC-END | grep -q "^$v="; then
      bad "$label: still inherits $v"
    fi
  done
}

RUN="$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n')"
HOSTILE="p'a\$\$ w\\o\"rd-$RUN"        # quote, dollar, space, backslash, dquote
RUNROLE="t17h_run_$RUN"
PREROLE="t17h_pre_$RUN"
ARGVROLE="t17h_argv_$RUN"
FAILROLE="t17h_fail_$RUN"
NORMAL="t17h_normal_$RUN"

echo "== $PSQLV  ·  disposable cluster on 127.0.0.1:$PORT  ·  log_statement=all"
echo "== script under test: $SCRIPT"
echo

# ===========================================================================
# 1) NEGATIVE CONTROL — the pre-TASK-17 mechanism MUST leak into the log
# ===========================================================================
VULN="$WORK/vulnerable-variant.sh"
cat >"$VULN" <<'VEOF'
#!/bin/bash
# Reproduces the pre-TASK-17 implementation: password interpolated into the
# statement text with format('%L') and executed with \gexec.
set -euo pipefail
RUNTIME_ROLE="${APP_DB_ROLE:-dms_app}"
RUNTIME_PASSWORD="${APP_DB_PASSWORD:-dms_app_local}"
export GREEN_DMS_RUNTIME_ROLE="$RUNTIME_ROLE"
export GREEN_DMS_RUNTIME_PASSWORD="$RUNTIME_PASSWORD"
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'EOSQL'
\set QUIET on
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
EOSQL
VEOF
chmod +x "$VULN"

MARK=$(wc -c <"$LOG")
APP_DB_ROLE="t17h_vuln_$RUN" APP_DB_PASSWORD="$HOSTILE" \
  POSTGRES_USER=t17admin POSTGRES_DB=postgres PGHOST="$SOCK" PGPORT="$PORT" \
  bash "$VULN" >"$WORK/vuln.out" 2>&1
VULN_RC=$?
tail -c +$((MARK + 1)) "$LOG" >"$WORK/vuln.log"
VULN_LEAK=$(leak_count "$HOSTILE" "$WORK/vuln.log")
if [ "$VULN_RC" = '0' ] && [ "$VULN_LEAK" -gt 0 ]; then
  ok "negative control: the pre-TASK-17 mechanism DOES leak the plaintext into the server log ($VULN_LEAK line(s))"
  note "$(grep -m1 -F "create role" "$WORK/vuln.log" | sed 's/.*statement: /statement: /' | cut -c1-110)…"
else
  bad "negative control broken (rc=$VULN_RC leaks=$VULN_LEAK) — the log detector cannot be trusted"
fi
adm "drop role if exists \"t17h_vuln_$RUN\"" >/dev/null

# ===========================================================================
# 2) First boot: fresh role, hostile password
# ===========================================================================
MARK=$(wc -c <"$LOG")
out=$(APP_DB_ROLE="$RUNROLE" APP_DB_PASSWORD="$HOSTILE" \
  POSTGRES_USER=t17admin POSTGRES_DB=postgres PGHOST="$SOCK" PGPORT="$PORT" \
  bash "$SCRIPT" 2>"$WORK/run.err") && rc=0 || rc=$?
tail -c +$((MARK + 1)) "$LOG" >"$WORK/run1.log"

[ "$rc" = '0' ] && ok "first boot: script exits 0" || bad "first boot: exit code $rc ($(head -3 "$WORK/run.err"))"
attrs=$(adm "select rolcanlogin||','||rolsuper||','||rolbypassrls||','||rolcreatedb||','||rolcreaterole from pg_roles where rolname='$RUNROLE'")
[ "$attrs" = 'true,false,false,false,false' ] &&
  ok "role attributes: login=t super=f bypassrls=f createdb=f createrole=f" ||
  bad "role attributes wrong: '$attrs'"

# --- 2a) no plaintext in the server log, but the statement IS logged ---------
LEAK1=$(leak_count "$HOSTILE" "$WORK/run1.log")
[ "$LEAK1" = '0' ] && ok "server log (log_statement=all): no plaintext in any SQL-literal spelling" ||
  { bad "server log leaks the plaintext ($LEAK1 line(s))"; grep -F "rd-$RUN" "$WORK/run1.log" | head -3; }
if grep -qE "ALTER USER .* PASSWORD 'SCRAM-SHA-256" "$WORK/run1.log"; then
  ok "anti-vacuous: the password statement WAS logged and carries a SCRAM verifier, not the password"
  note "$(grep -m1 -oE "ALTER USER .* PASSWORD 'SCRAM-SHA-256.4096:.{0,12}" "$WORK/run1.log")…'"
else
  bad "anti-vacuous check failed: no ALTER USER … PASSWORD 'SCRAM-SHA-256…' line in the log — was logging active?"
fi
if grep -qE "statement: (create|alter) role .*password" "$WORK/run1.log"; then
  bad "the role DDL still carries a password clause"
else
  ok "role DDL is password-free ($(grep -m1 -oE 'statement: (create|alter) role [^ ]* login' "$WORK/run1.log"))"
fi
grep -qiF "$HOSTILE" "$WORK/run.err" && bad "stderr contains the plaintext" || ok "stderr contains no plaintext"
printf '%s' "$out" | grep -qF "$HOSTILE" && bad "stdout contains the plaintext" || ok "stdout contains no plaintext"

# --- 2b) real SCRAM authentication with the exact hostile password -----------
login=$(try_login "$RUNROLE" "$HOSTILE") && lrc=0 || lrc=$?
if [ "$lrc" = '0' ] && printf '%s' "$login" | grep -q "super=false"; then
  ok "real SCRAM-SHA-256 login succeeds with the exact hostile password (non-superuser)"
else
  bad "SCRAM login with the exact password failed: $login"
fi
wrong=$(try_login "$RUNROLE" "${HOSTILE}x") && wrc=0 || wrc=$?
[ "$wrc" != '0' ] && printf '%s' "$wrong" | grep -q "password authentication failed" &&
  ok "wrong password is rejected" || bad "wrong password was NOT rejected: $wrong"
empty=$(try_login "$RUNROLE" "") && erc=0 || erc=$?
[ "$erc" != '0' ] && ok "empty password is rejected (no fail-open)" || bad "empty password accepted!"

# ===========================================================================
# 3) argv / stdin / environment of the real psql process
# ===========================================================================
MARK=$(wc -c <"$LOG")
reset_wraps
APP_DB_ROLE="$ARGVROLE" APP_DB_PASSWORD="$HOSTILE" \
  POSTGRES_USER=t17admin POSTGRES_DB=postgres PGHOST="$SOCK" PGPORT="$PORT" \
  PATH="$WRAP:$PATH" bash "$SCRIPT" >"$WORK/argv.out" 2>"$WORK/argv.err" && arc=0 || arc=$?
tail -c +$((MARK + 1)) "$LOG" >"$WORK/argv.log"
CAP="$WRAP/capture.log"

if [ "$arc" = '0' ] && [ -s "$CAP" ] && grep -q 'ARG -v' "$CAP" && grep -q 'ARG --username' "$CAP"; then
  ok "wrapper really intercepted psql ($(grep -c '^ARG ' "$CAP") argv elements captured)"
else
  bad "wrapper did not intercept psql (rc=$arc, capture $(wc -c <"$CAP" 2>/dev/null || echo 0) bytes)"
fi
sed -n '/^ARG /p' "$CAP" | sed 's/^ARG //' >"$WORK/argv-only.txt"
ALEAK=$(leak_count "$HOSTILE" "$WORK/argv-only.txt")
[ "$ALEAK" = '0' ] && ok "psql argv: no plaintext in any spelling" || bad "psql argv leaks the plaintext ($ALEAK)"
grep -qE '^(pass|role)=' "$WORK/argv-only.txt" && bad "psql argv still carries pass=/role= variables" ||
  ok "psql argv carries no pass=/role= variables"
# --- TASK-18: the WHOLE inherited environment of EVERY child, not one name ----
# A check limited to GREEN_DMS_RUNTIME_PASSWORD misses APP_DB_PASSWORD, which
# compose exports and bash imports already-exported; the pre-TASK-18 script leaked
# the plaintext to psql, setsid and cat through that name.
check_child_env "psql child environment" "$CAP"
check_child_env "setsid child environment" "$WRAP/setsid.log"
check_child_env "cat (process-substitution) child environment" "$WRAP/cat.log"
# stdin must carry the password exactly twice — that is the delivery channel
STDIN_N=$(sed -n '/^STDIN-BEGIN$/,/^STDIN-END$/p' "$CAP" | grep -cxF "$HOSTILE" || true)
[ "$STDIN_N" = '2' ] && ok "delivery channel: the password reaches psql via stdin, exactly twice (two prompts)" ||
  bad "expected the password twice on psql's stdin, found $STDIN_N time(s)"
SLEAK=$(leak_count "$HOSTILE" "$WORK/argv.log")
[ "$SLEAK" = '0' ] && ok "server log for the argv run: no plaintext" || bad "server log for the argv run leaks ($SLEAK)"
adm "drop role if exists \"$ARGVROLE\"" >/dev/null

# negative control for the argv check: the vulnerable variant must be caught too
reset_wraps
APP_DB_ROLE="t17h_vuln2_$RUN" APP_DB_PASSWORD="$HOSTILE" \
  POSTGRES_USER=t17admin POSTGRES_DB=postgres PGHOST="$SOCK" PGPORT="$PORT" \
  PATH="$WRAP:$PATH" bash "$VULN" >/dev/null 2>&1 || true
if [ -s "$WRAP/capture.log" ]; then
  sed -n '/^ARG /p' "$WRAP/capture.log" | sed 's/^ARG //' >"$WORK/argv-vuln.txt"
  VARGS=$(leak_count "$HOSTILE" "$WORK/argv-vuln.txt")
  [ "$VARGS" != '0' ] &&
    ok "negative control: the TASK-16 mechanism leaks the password into psql's ENV/stdin-visible argv channel ($VARGS)" ||
    note "note: the TASK-16 mechanism already kept argv clean (that was TASK-16's fix); its leak is the SQL text, proven in check 1"
  _vl="$(env_leak_names "$HOSTILE" "$WRAP/capture.log" | tr '\n' ' ')"
  [ -n "$_vl" ] &&
    ok "negative control: the TASK-16 mechanism DOES expose the password to the psql child environment (via:$_vl)" ||
    bad "negative control: expected the TASK-16 variant to leak through the child environment"
else
  bad "negative control: wrapper captured nothing for the vulnerable variant"
fi
adm "drop role if exists \"t17h_vuln2_$RUN\"" >/dev/null

# ===========================================================================
# 3b) EXTERNAL read of /proc/<pid>/environ — observed by THIS harness rather than
#     reported by the child itself. The wrapper sleeps so there is a window. If the
#     observation cannot be made the aspect is reported UNVERIFIED, never PASS.
# ===========================================================================
reset_wraps
T18_WATCH_SLEEP=0.8 \
  APP_DB_ROLE="$ARGVROLE" APP_DB_PASSWORD="$HOSTILE" \
  POSTGRES_USER=t17admin POSTGRES_DB=postgres PGHOST="$SOCK" PGPORT="$PORT" \
  PATH="$WRAP:$PATH" bash "$SCRIPT" >"$WORK/watch.out" 2>&1 &
WATCH_PID=$!
: >"$WORK/extproc.txt"
for _i in $(seq 1 60); do
  _pid=$(awk '/^PROC-PID /{print $2; exit}' "$WRAP/capture.log" 2>/dev/null)
  if [ -n "${_pid:-}" ] && [ -r "/proc/$_pid/environ" ] && [ ! -s "$WORK/extproc.txt" ]; then
    tr '\0' '\n' <"/proc/$_pid/environ" >"$WORK/extproc.txt" 2>/dev/null || true
  fi
  [ -s "$WORK/extproc.txt" ] && break
  sleep 0.1
done
wait "$WATCH_PID" 2>/dev/null || true
if [ -s "$WORK/extproc.txt" ]; then
  xn=$(grep -c '=' "$WORK/extproc.txt" || true)
  xl=""
  while IFS= read -r _line; do
    _n="${_line%%=*}"; _v="${_line#*=}"
    [ "$_v" = "$HOSTILE" ] && xl="$xl $_n"
  done <"$WORK/extproc.txt"
  if [ "$xn" -lt 5 ]; then
    bad "external /proc/<pid>/environ of the psql child: only $xn variables readable"
  elif [ -n "$xl" ]; then
    bad "external /proc/<pid>/environ of the psql child leaks the password via:$xl"
  else
    ok "external read of /proc/<pid>/environ of the psql child: $xn variables, none carries the password"
  fi
  if grep -q '^APP_DB_PASSWORD=' "$WORK/extproc.txt"; then
    bad "external /proc read: APP_DB_PASSWORD is still inherited by psql"
  else
    ok "external /proc read: APP_DB_PASSWORD absent from the psql child environment"
  fi
else
  note "UNVERIFIED: /proc/<pid>/environ of the psql child could not be read from outside within the timing window"
fi
adm "drop role if exists \"$ARGVROLE\"" >/dev/null

# ===========================================================================
# 3c) NEGATIVE CONTROL for the environment checks: a variant with the pre-TASK-18
#     shape (captures APP_DB_PASSWORD but never removes it) MUST expose the
#     plaintext to the children, otherwise the checks above prove nothing.
# ===========================================================================
ENVVULN="$WORK/pre-task18-variant.sh"
cat >"$ENVVULN" <<'VEOF'
#!/bin/bash
# pre-TASK-18 shape — NEGATIVE CONTROL ONLY, never used to provision.
set -euo pipefail
RUNTIME_ROLE="${APP_DB_ROLE:-dms_app}"
RUNTIME_PASSWORD="${APP_DB_PASSWORD:-dms_app_local}"
export GREEN_DMS_RUNTIME_ROLE="$RUNTIME_ROLE"
printf '%s\n%s\n' "$RUNTIME_PASSWORD" "$RUNTIME_PASSWORD" |
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f <(cat <<'EOSQL'
\set QUIET on
\getenv role GREEN_DMS_RUNTIME_ROLE
select format(case when exists (select 1 from pg_roles where rolname = :'role')
                   then 'alter role %I login' else 'create role %I login' end, :'role') as ddl
\gexec
\password :"role"
EOSQL
)
VEOF
chmod +x "$ENVVULN"
reset_wraps
APP_DB_ROLE="t17h_envvuln_$RUN" APP_DB_PASSWORD="$HOSTILE" \
  POSTGRES_USER=t17admin POSTGRES_DB=postgres PGHOST="$SOCK" PGPORT="$PORT" \
  PATH="$WRAP:$PATH" bash "$ENVVULN" >"$WORK/envvuln.out" 2>&1 || true
VL="$(env_leak_names "$HOSTILE" "$WRAP/capture.log" | tr '\n' ' ')"
CL2="$(env_leak_names "$HOSTILE" "$WRAP/cat.log" | tr '\n' ' ')"
if [ -n "$VL" ]; then
  ok "negative control: the pre-TASK-18 variant DOES expose the password to the psql child environment (via:$VL)"
else
  bad "negative control broken: the pre-TASK-18 variant did not leak through the environment — the checks above would be vacuous"
fi
[ -n "$CL2" ] &&
  ok "negative control: the process-substitution helper inherited it too (via:$CL2)" ||
  note "negative control: the cat helper was not observed for the pre-TASK-18 variant"
if section "$WRAP/capture.log" ENVPROC-BEGIN ENVPROC-END | grep -q '^APP_DB_PASSWORD='; then
  ok "negative control: the leaking name is exactly APP_DB_PASSWORD (the one TASK-18 removes)"
else
  bad "negative control: APP_DB_PASSWORD not seen in the pre-TASK-18 psql child environment"
fi
adm "drop role if exists \"t17h_envvuln_$RUN\"" >/dev/null

# ===========================================================================
# 3d) HOSTILE ALIASES — the caller pre-exports the very same password under other
#     names, including the TASK-16 alias and RUNTIME_PASSWORD itself. Renaming is
#     not a fix, so the scrub has to catch them by VALUE while still provisioning.
# ===========================================================================
reset_wraps
ALIASROLE="t17h_alias_$RUN"
APP_DB_ROLE="$ALIASROLE" APP_DB_PASSWORD="$HOSTILE" \
  RUNTIME_PASSWORD="$HOSTILE" GREEN_DMS_RUNTIME_PASSWORD="$HOSTILE" T18_ALIAS_PW="$HOSTILE" \
  POSTGRES_USER=t17admin POSTGRES_DB=postgres PGHOST="$SOCK" PGPORT="$PORT" \
  PATH="$WRAP:$PATH" bash "$SCRIPT" >"$WORK/alias.out" 2>"$WORK/alias.err"
ARC=$?
[ "$ARC" = 0 ] && ok "hostile aliases pre-exported by the caller: the script still provisions (exit 0)" \
               || bad "hostile-alias run failed (exit=$ARC)"
check_child_env "alias-run psql child environment" "$WRAP/capture.log"
check_child_env "alias-run setsid child environment" "$WRAP/setsid.log"
check_child_env "alias-run cat (process-substitution) child environment" "$WRAP/cat.log"
AL=""
for f in "$WRAP/capture.log" "$WRAP/setsid.log" "$WRAP/cat.log"; do
  [ -s "$f" ] || continue
  an=$(env_leak_names "$HOSTILE" "$f" | tr '\n' ' ')
  [ -n "$an" ] && AL="$AL $(basename "$f"):value-via[$an]"
  for v in T18_ALIAS_PW RUNTIME_PASSWORD GREEN_DMS_RUNTIME_PASSWORD; do
    section "$f" ENVPROC-BEGIN ENVPROC-END | grep -q "^$v=" && AL="$AL $(basename "$f"):name[$v]"
  done
done
[ -z "$AL" ] && ok "no alias name and no value-matching variable reached any child in the alias run" \
             || bad "alias leakage:$AL"
adm "drop role if exists \"$ALIASROLE\"" >/dev/null

# ===========================================================================
# 3e) VALUE-COLLISION SAFETY — matching by value is inherently ambiguous: an
#     UNRELATED setting that merely happens to hold the same string cannot be told
#     apart from a credential alias. The scrub therefore removes only the EXPORT
#     ATTRIBUTE of such a variable (no child can inherit it) and keeps its value for
#     this process, rather than destroying unrelated environment state. This can
#     only be observed from INSIDE a process that ran the scrub — /proc/<pid>/environ
#     is fixed at exec and still shows what the parent passed in — so the real repo
#     script is *sourced* by a probe that then reports each variable's existence and
#     export attribute. Only names and attributes are printed, never values.
# ===========================================================================
cat >"$WORK/collprobe.sh" <<'CPEOF'
#!/bin/bash
source "$T18_SCRIPT" >"$T18_OUT" 2>"$T18_ERR"; RC=$?
set +e +u
printf 'coll_exit %s\n' "$RC"
for v in APP_DB_PASSWORD GREEN_DMS_RUNTIME_PASSWORD RUNTIME_PASSWORD T17_UNRELATED_SETTING OTHER_KEEP; do
  e=${!v+set}; e=${e:-unset}
  d=$(declare -p "$v" 2>/dev/null || true)
  case "$d" in *"declare -x"*) x=exported;; *) x=not-exported;; esac
  printf 'coll %s %s %s\n' "$v" "$e" "$x"
done
printf 'coll_child_visible %s\n' "$(env | grep -cE '^(APP_DB_PASSWORD|RUNTIME_PASSWORD|GREEN_DMS_RUNTIME_PASSWORD|T18_ALIAS_PW|T17_UNRELATED_SETTING)=' || true)"
printf 'coll_other_keep_visible %s\n' "$(env | grep -c '^OTHER_KEEP=' || true)"
CPEOF
COLLROLE="t17h_coll_$RUN"
reset_wraps
APP_DB_ROLE="$COLLROLE" APP_DB_PASSWORD="$HOSTILE" T17_UNRELATED_SETTING="$HOSTILE" OTHER_KEEP=keepme \
  POSTGRES_USER=t17admin POSTGRES_DB=postgres PGHOST="$SOCK" PGPORT="$PORT" PATH="$WRAP:$PATH" \
  T18_SCRIPT="$SCRIPT" T18_OUT="$WORK/coll.out" T18_ERR="$WORK/coll.err" \
  bash "$WORK/collprobe.sh" >"$WORK/coll.txt" 2>&1
cv() { awk -v k="$1" '$1=="coll" && $2==k {print $3}' "$WORK/coll.txt"; }
cx() { awk -v k="$1" '$1=="coll" && $2==k {print $4}' "$WORK/coll.txt"; }
ck() { awk -v k="$1" '$1==k {print $2}' "$WORK/coll.txt"; }
[ "$(ck coll_exit)" = 0 ] && ok "collision run: the script still provisions successfully (exit 0)" \
                          || bad "collision run: exit=[$(ck coll_exit)] $(head -c 160 "$WORK/coll.txt" | tr '\n' ' ')"
{ [ "$(cv APP_DB_PASSWORD)" = unset ] && [ "$(cv GREEN_DMS_RUNTIME_PASSWORD)" = unset ]; } \
  && ok "collision run: the two credential NAMES are removed from the environment outright" \
  || bad "collision run: APP_DB_PASSWORD=$(cv APP_DB_PASSWORD) GREEN_DMS_RUNTIME_PASSWORD=$(cv GREEN_DMS_RUNTIME_PASSWORD)"
{ [ "$(cv RUNTIME_PASSWORD)" = set ] && [ "$(cx RUNTIME_PASSWORD)" = not-exported ]; } \
  && ok "collision run: RUNTIME_PASSWORD keeps its value for the stdin delivery and is not exported" \
  || bad "collision run: RUNTIME_PASSWORD state=$(cv RUNTIME_PASSWORD) attr=$(cx RUNTIME_PASSWORD)"
{ [ "$(cv T17_UNRELATED_SETTING)" = set ] && [ "$(cx T17_UNRELATED_SETTING)" = not-exported ]; } \
  && ok "collision run: an UNRELATED variable that collides by value keeps its value and loses only the export attribute (narrowest safe correction — no unrelated state destroyed)" \
  || bad "collision run: unrelated colliding variable state=$(cv T17_UNRELATED_SETTING) attr=$(cx T17_UNRELATED_SETTING)"
{ [ "$(cv OTHER_KEEP)" = set ] && [ "$(cx OTHER_KEEP)" = exported ]; } \
  && ok "collision run: an unrelated variable that does NOT collide is completely untouched (still exported)" \
  || bad "collision run: OTHER_KEEP state=$(cv OTHER_KEEP) attr=$(cx OTHER_KEEP)"
[ "$(ck coll_child_visible)" = 0 ] && ok "collision run: a fresh child of that process sees none of the credential-carrying variables" \
                                   || bad "collision run: a child still sees $(ck coll_child_visible) credential-carrying variable(s)"
[ "$(ck coll_other_keep_visible)" = 1 ] && ok "collision run: anti-vacuous — a normal exported variable IS visible to the child, so the observation is meaningful" \
                                        || bad "collision run: anti-vacuous check failed (OTHER_KEEP not visible to the child)"
check_child_env "collision-run psql child environment" "$WRAP/capture.log"
check_child_env "collision-run cat (process-substitution) child environment" "$WRAP/cat.log"
adm "drop role if exists \"$COLLROLE\"" >/dev/null

# ===========================================================================
# 4) Pre-existing NOLOGIN role (what migration 0041 leaves behind) + idempotency
# ===========================================================================
adm "create role \"$PREROLE\" nologin nosuperuser nobypassrls nocreatedb nocreaterole" >/dev/null
MARK=$(wc -c <"$LOG")
APP_DB_ROLE="$PREROLE" APP_DB_PASSWORD="$HOSTILE" \
  POSTGRES_USER=t17admin POSTGRES_DB=postgres PGHOST="$SOCK" PGPORT="$PORT" \
  bash "$SCRIPT" >"$WORK/pre.out" 2>&1 && prc=0 || prc=$?
APP_DB_ROLE="$PREROLE" APP_DB_PASSWORD="$HOSTILE" \
  POSTGRES_USER=t17admin POSTGRES_DB=postgres PGHOST="$SOCK" PGPORT="$PORT" \
  bash "$SCRIPT" >>"$WORK/pre.out" 2>&1 && prc2=0 || prc2=$?
tail -c +$((MARK + 1)) "$LOG" >"$WORK/pre.log"
{ [ "$prc" = '0' ] && [ "$prc2" = '0' ]; } && ok "existing NOLOGIN role: two runs both exit 0" ||
  bad "existing NOLOGIN role runs failed ($prc/$prc2)"
n=$(adm "select count(*) from pg_roles where rolname='$PREROLE'")
[ "$n" = '1' ] && ok "no duplicate role created (count=$n)" || bad "duplicate roles: $n"
a2=$(adm "select rolcanlogin||','||rolsuper||','||rolbypassrls||','||rolcreatedb||','||rolcreaterole from pg_roles where rolname='$PREROLE'")
[ "$a2" = 'true,false,false,false,false' ] && ok "existing role gained LOGIN and nothing else" || bad "existing role attributes: '$a2'"
PLEAK=$(leak_count "$HOSTILE" "$WORK/pre.log")
[ "$PLEAK" = '0' ] && ok "existing-role path: server log has no plaintext" || bad "existing-role path leaks ($PLEAK)"
grep -qE "statement: alter role \"?$PREROLE\"? login\$" "$WORK/pre.log" &&
  ok "existing-role path uses ALTER ROLE … LOGIN (no password clause)" ||
  note "ALTER ROLE line not matched verbatim; log excerpt: $(grep -m1 -o 'statement: alter role.*' "$WORK/pre.log")"
login2=$(try_login "$PREROLE" "$HOSTILE") && l2=0 || l2=$?
[ "$l2" = '0' ] && ok "existing role authenticates with the exact password" || bad "existing role login failed: $login2"

# ===========================================================================
# 5) Failure diagnostics carry no plaintext, and never report false success
# ===========================================================================
# 5a) non-superuser caller: CREATE/ALTER ROLE must fail (42501). The role has no
# password on purpose — it connects over the trust socket — so this harness never
# writes a password literal into the log it is inspecting.
adm "create role \"$NORMAL\" login nosuperuser" >/dev/null
MARK=$(wc -c <"$LOG")
out=$(APP_DB_ROLE="$FAILROLE" APP_DB_PASSWORD="$HOSTILE" \
  POSTGRES_USER="$NORMAL" POSTGRES_DB=postgres PGHOST="$SOCK" PGPORT="$PORT" \
  bash "$SCRIPT" 2>&1) && frc=0 || frc=$?
tail -c +$((MARK + 1)) "$LOG" >"$WORK/fail.log"
[ "$frc" != '0' ] && ok "failure path (non-superuser caller): non-zero exit ($frc)" ||
  bad "failure path reported SUCCESS for a non-superuser caller"
nn=$(adm "select count(*) from pg_roles where rolname='$FAILROLE'")
[ "$nn" = '0' ] && ok "failure path created no role (no false success)" || bad "failure path created $nn role(s)"
printf '%s' "$out" | grep -qE "permission denied|must be superuser" &&
  ok "failure path surfaces the real error" || note "unexpected error text: $(printf '%s' "$out" | head -2)"
FLEAK=0
for f in "$WORK/fail.log"; do FLEAK=$((FLEAK + $(leak_count "$HOSTILE" "$f"))); done
printf '%s' "$out" >"$WORK/fail.out"
FLEAK=$((FLEAK + $(leak_count "$HOSTILE" "$WORK/fail.out")))
[ "$FLEAK" = '0' ] && ok "failure diagnostics (server log + stdout/stderr): no plaintext" ||
  bad "failure diagnostics leak the plaintext ($FLEAK)"
grep -q "ERROR" "$WORK/fail.log" && ok "anti-vacuous: the failure WAS logged with ERROR/statement detail" ||
  note "no ERROR line in the server log for the failure path"

# negative control for the failure path: the vulnerable variant must leak here too
MARK=$(wc -c <"$LOG")
APP_DB_ROLE="$FAILROLE" APP_DB_PASSWORD="$HOSTILE" \
  POSTGRES_USER="$NORMAL" POSTGRES_DB=postgres PGHOST="$SOCK" PGPORT="$PORT" \
  bash "$VULN" >"$WORK/vulnfail.out" 2>&1 || true
tail -c +$((MARK + 1)) "$LOG" >"$WORK/vulnfail.log"
VFLEAK=$(( $(leak_count "$HOSTILE" "$WORK/vulnfail.log") + $(leak_count "$HOSTILE" "$WORK/vulnfail.out") ))
[ "$VFLEAK" != '0' ] &&
  ok "negative control: the pre-TASK-17 mechanism leaks the plaintext into FAILURE diagnostics ($VFLEAK)" ||
  bad "negative control for failure diagnostics is vacuous"

# 5b) unreachable server
out=$(APP_DB_ROLE="$FAILROLE" APP_DB_PASSWORD="$HOSTILE" \
  POSTGRES_USER=t17admin POSTGRES_DB=postgres PGHOST=127.0.0.1 PGPORT=1 \
  bash "$SCRIPT" 2>&1) && urc=0 || urc=$?
[ "$urc" != '0' ] && ok "unreachable server: non-zero exit ($urc)" || bad "unreachable server reported success"
printf '%s' "$out" >"$WORK/unreach.out"
ULEAK=$(leak_count "$HOSTILE" "$WORK/unreach.out")
[ "$ULEAK" = '0' ] && ok "unreachable-server diagnostics contain no plaintext" || bad "unreachable-server diagnostics leak ($ULEAK)"

# 5c) invalid configuration
out=$(APP_DB_ROLE="$FAILROLE" APP_DB_PASSWORD='' \
  POSTGRES_USER=t17admin POSTGRES_DB=postgres PGHOST="$SOCK" PGPORT="$PORT" \
  bash "$SCRIPT" 2>&1) && erc2=0 || erc2=$?
# an empty APP_DB_PASSWORD falls back to the documented local default; assert that
dflt=$(adm "select count(*) from pg_roles where rolname='$FAILROLE'")
[ "$erc2" = '0' ] && [ "$dflt" = '1' ] &&
  ok "APP_DB_PASSWORD='' falls back to the documented default (exit 0, role created)" ||
  bad "empty APP_DB_PASSWORD behaved unexpectedly (rc=$erc2 roles=$dflt)"
adm "drop role if exists \"$FAILROLE\"" >/dev/null

nl_role="t17h_nl_$RUN"
out=$(APP_DB_ROLE="$nl_role" APP_DB_PASSWORD=$'bad\npass' \
  POSTGRES_USER=t17admin POSTGRES_DB=postgres PGHOST="$SOCK" PGPORT="$PORT" \
  bash "$SCRIPT" 2>&1) && nrc=0 || nrc=$?
nln=$(adm "select count(*) from pg_roles where rolname='$nl_role'")
{ [ "$nrc" != '0' ] && [ "$nln" = '0' ]; } &&
  ok "password containing a newline: refused with non-zero exit and no role created" ||
  bad "newline password not refused (rc=$nrc roles=$nln)"

# ===========================================================================
# 6) Second boot / idempotency of the whole script
# ===========================================================================
MARK=$(wc -c <"$LOG")
APP_DB_ROLE="$RUNROLE" APP_DB_PASSWORD="$HOSTILE" \
  POSTGRES_USER=t17admin POSTGRES_DB=postgres PGHOST="$SOCK" PGPORT="$PORT" \
  bash "$SCRIPT" >"$WORK/again.out" 2>&1 && grc=0 || grc=$?
tail -c +$((MARK + 1)) "$LOG" >"$WORK/again.log"
[ "$grc" = '0' ] && ok "re-run against the already-provisioned role exits 0" || bad "re-run failed ($grc)"
GLEAK=$(leak_count "$HOSTILE" "$WORK/again.log")
[ "$GLEAK" = '0' ] && ok "re-run: server log has no plaintext" || bad "re-run leaks ($GLEAK)"
a3=$(adm "select rolcanlogin||','||rolsuper||','||rolbypassrls from pg_roles where rolname='$RUNROLE'")
[ "$a3" = 'true,false,false' ] && ok "re-run leaves privileges unchanged" || bad "re-run changed privileges: '$a3'"
login3=$(try_login "$RUNROLE" "$HOSTILE") && l3=0 || l3=$?
[ "$l3" = '0' ] && ok "re-run keeps the exact password working" || bad "re-run broke authentication: $login3"

# ===========================================================================
# 7) No leftover privileged roles, no secret left on disk
# ===========================================================================
sup=$(adm "select count(*) from pg_roles where rolsuper and rolname not in ('t17admin')")
[ "$sup" = '0' ] && ok "no extra superuser was created" || bad "extra superusers: $sup"
byp=$(adm "select count(*) from pg_roles where rolbypassrls and rolname <> 't17admin'")
[ "$byp" = '0' ] && ok "no role has BYPASSRLS" || bad "BYPASSRLS roles: $byp"
leftover=0
for f in "$WORK/run.err" "$WORK/argv.err" "$WORK/argv.out" "$WORK/pre.out" "$WORK/again.out"; do
  [ -f "$f" ] && leftover=$((leftover + $(leak_count "$HOSTILE" "$f")))
done
[ "$leftover" = '0' ] && ok "no plaintext left in any captured output file" || bad "plaintext left in outputs ($leftover)"

echo
echo "== roles created by this harness (all dropped with the cluster): $RUNROLE, $PREROLE, $ARGVROLE, $NORMAL"
echo "== RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" = '0' ] || exit 1
exit 0
