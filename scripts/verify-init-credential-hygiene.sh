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

# --- argv/stdin capturing wrapper -------------------------------------------
# Records the REAL process arguments, whether the password is present in the
# child environment, and a copy of stdin (the channel under test), then execs the
# real psql with that stdin replayed. It never writes the password VALUE into the
# report; the copy only lives in the disposable $WORK directory, which the EXIT
# trap deletes. This wrapper is test instrumentation — the script under test
# creates no file of its own.
cat >"$WRAP/psql" <<EOF
#!/bin/bash
tmp="\$(mktemp '$WRAP/stdin.XXXXXX')"
cat > "\$tmp"
{
  printf 'INVOCATION\n'
  for a in "\$@"; do printf 'ARG %s\n' "\$a"; done
  if [ -n "\${GREEN_DMS_RUNTIME_PASSWORD:-}" ]; then echo 'ENV-PASS:yes'; else echo 'ENV-PASS:no'; fi
  echo 'STDIN-BEGIN'; cat "\$tmp"; echo 'STDIN-END'
} >> '$WRAP/capture.log'
exec '$BINDIR/psql' "\$@" < "\$tmp"
EOF
chmod +x "$WRAP/psql"

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
: >"$WRAP/capture.log"
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
grep -q '^ENV-PASS:no$' "$CAP" && ok "password is NOT in the psql child environment" ||
  bad "password IS exported into the psql environment"
# stdin must carry the password exactly twice — that is the delivery channel
STDIN_N=$(sed -n '/^STDIN-BEGIN$/,/^STDIN-END$/p' "$CAP" | grep -cxF "$HOSTILE" || true)
[ "$STDIN_N" = '2' ] && ok "delivery channel: the password reaches psql via stdin, exactly twice (two prompts)" ||
  bad "expected the password twice on psql's stdin, found $STDIN_N time(s)"
SLEAK=$(leak_count "$HOSTILE" "$WORK/argv.log")
[ "$SLEAK" = '0' ] && ok "server log for the argv run: no plaintext" || bad "server log for the argv run leaks ($SLEAK)"
adm "drop role if exists \"$ARGVROLE\"" >/dev/null

# negative control for the argv check: the vulnerable variant must be caught too
: >"$WRAP/capture.log"
APP_DB_ROLE="t17h_vuln2_$RUN" APP_DB_PASSWORD="$HOSTILE" \
  POSTGRES_USER=t17admin POSTGRES_DB=postgres PGHOST="$SOCK" PGPORT="$PORT" \
  PATH="$WRAP:$PATH" bash "$VULN" >/dev/null 2>&1 || true
if [ -s "$WRAP/capture.log" ]; then
  sed -n '/^ARG /p' "$WRAP/capture.log" | sed 's/^ARG //' >"$WORK/argv-vuln.txt"
  VARGS=$(leak_count "$HOSTILE" "$WORK/argv-vuln.txt")
  [ "$VARGS" != '0' ] &&
    ok "negative control: the TASK-16 mechanism leaks the password into psql's ENV/stdin-visible argv channel ($VARGS)" ||
    note "note: the TASK-16 mechanism already kept argv clean (that was TASK-16's fix); its leak is the SQL text, proven in check 1"
  grep -q '^ENV-PASS:yes$' "$WRAP/capture.log" &&
    ok "negative control: the TASK-16 mechanism DOES export the password to the child environment" ||
    bad "negative control: expected ENV-PASS:yes from the TASK-16 mechanism"
else
  bad "negative control: wrapper captured nothing for the vulnerable variant"
fi
adm "drop role if exists \"t17h_vuln2_$RUN\"" >/dev/null

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
