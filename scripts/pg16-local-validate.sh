#!/usr/bin/env bash
# S8-05: اعتبارسنجیِ بازتولیدپذیرِ PostgreSQL 16 + PostGIS روی یک خوشهٔ ایزوله و یکبارمصرف.
#
# هرگز به پایگاه‌داده‌های تولید یا مشترک وصل نمی‌شود. خوشه با initdb در پوشهٔ موقت ساخته می‌شود،
# فقط روی 127.0.0.1 گوش می‌دهد، رمز ابرکاربر آن تصادفی و SCRAM است، و پس از اجرا متوقف و پاک می‌شود.
# شواهد (لاگ، JSON، نسخه‌ها، checksum مهاجرت‌ها) در EVID_DIR می‌ماند؛ هیچ رمزی در آن نوشته نمی‌شود.
#
# ورودی‌ها (همه اختیاری):
#   PG_BIN       پوشهٔ bin نسخهٔ PostgreSQL 16 با PostGIS (پیش‌فرض: پیدا کردن از PATH)
#   EVID_DIR     پوشهٔ شواهد (پیش‌فرض: ~/s8-evidence-05/<UTC>)
#   PG_PORT      پورت TCP روی 127.0.0.1 (پیش‌فرض: یک پورت آزاد)
#
# خروجی: EVID_DIR/summary.json و کد خروج 0 فقط اگر همهٔ مراحلِ الزامی PASS باشند.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
EVID_DIR="${EVID_DIR:-$HOME/s8-evidence-05/$STAMP}"
mkdir -p "$EVID_DIR"
LOG="$EVID_DIR/run.log"
exec > >(tee -a "$LOG") 2>&1

if [[ -n "${PG_BIN:-}" ]]; then export PATH="$PG_BIN:$PATH"; fi
for bin in initdb pg_ctl psql pg_dump pg_restore node npm openssl; do
  command -v "$bin" >/dev/null || { echo "BLOCKED: «$bin» در PATH نیست"; exit 2; }
done
PG_LIB_DIR="$(dirname "$(command -v pg_config 2>/dev/null || command -v initdb)")/../lib"
export LD_LIBRARY_PATH="$(cd "$PG_LIB_DIR" 2>/dev/null && pwd):${LD_LIBRARY_PATH:-}"

WORK="$(mktemp -d "${TMPDIR:-/tmp}/dms-pg16-XXXXXX")"
PGDATA="$WORK/data"
PW_FILE="$WORK/pw"
PORT="${PG_PORT:-$(node -e 'const s=require("net").createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();})')}"
export PGPASSWORD=""
PG_PASS="$(openssl rand -hex 24)"
printf '%s' "$PG_PASS" > "$PW_FILE"
cleanup() {
  pg_ctl -D "$PGDATA" -m fast stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
  echo "cleanup: cluster stopped, work dir removed (credentials deleted)"
}
trap cleanup EXIT

RESULTS="$EVID_DIR/steps.jsonl"
: > "$RESULTS"
step_result() { # name status detail exitcode
  printf '{"step":"%s","status":"%s","exit":%s,"detail":%s}\n' "$1" "$2" "${4:-0}" \
    "$(node -e 'console.log(JSON.stringify(process.argv[1]))' "$3")" >> "$RESULTS"
  echo "== [$2] $1 — $3"
}

# ---------- نسخه‌ها و هویت محیط ----------
{
  echo "date_utc=$STAMP"
  echo "repo=$(git -C "$ROOT" rev-parse --show-toplevel 2>/dev/null)"
  echo "branch=$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null)"
  echo "head=$(git -C "$ROOT" rev-parse HEAD 2>/dev/null)"
  echo "node=$(node --version)"
  echo "npm=$(npm --version)"
  echo "pg_bin=$(command -v initdb)"
  echo "pg_config=$(pg_config --version 2>/dev/null || echo unknown)"
  echo "psql_client=$(psql --version)"
  echo "pg_dump=$(pg_dump --version)"
  echo "host=$(uname -srm)"
} > "$EVID_DIR/environment.txt"
git -C "$ROOT" status --porcelain > "$EVID_DIR/git-status.txt" 2>/dev/null || true
( cd migrations && sha256sum *.sql ) > "$EVID_DIR/migrations.sha256"
sha256sum scripts/real-login-security.sh scripts/test-migration-window.sh scripts/db-window.mjs \
  scripts/db-maintain.mjs scripts/migrate.mjs scripts/lib/db-identity.mjs > "$EVID_DIR/scripts.sha256"

# ---------- خوشهٔ ایزوله ----------
echo "== initdb (ایزوله، 127.0.0.1:$PORT، SCRAM)"
if initdb -D "$PGDATA" -U postgres --auth-host=scram-sha-256 --auth-local=trust --pwfile="$PW_FILE" \
     > "$EVID_DIR/initdb.log" 2>&1; then
  step_result initdb PASS "خوشهٔ تازه ساخته شد"
else
  step_result initdb FAIL "initdb شکست خورد؛ $EVID_DIR/initdb.log" 1
  exit 1
fi
cat >> "$PGDATA/postgresql.conf" <<EOF
listen_addresses = '127.0.0.1'
port = $PORT
unix_socket_directories = '$WORK'
max_connections = 60
fsync = off
synchronous_commit = off
logging_collector = off
log_min_messages = warning
log_line_prefix = '%m [%p] %u@%d '
EOF
cat > "$PGDATA/pg_hba.conf" <<EOF
local   all  all                      trust
host    all  all  127.0.0.1/32        scram-sha-256
EOF
if pg_ctl -D "$PGDATA" -l "$EVID_DIR/postgres.log" -w -t 60 start > "$EVID_DIR/pg_ctl.log" 2>&1; then
  step_result server-start PASS "PostgreSQL روی 127.0.0.1:$PORT"
else
  step_result server-start FAIL "start شکست خورد؛ $EVID_DIR/postgres.log" 1
  exit 1
fi

export ADMIN_DATABASE_URL="postgres://postgres:${PG_PASS}@127.0.0.1:${PORT}/postgres"
export PSQL=psql
export PG_DUMP=pg_dump
psql "$ADMIN_DATABASE_URL" -X -Atq -c "select 'server_version=' || current_setting('server_version') || ' ' || version()" > "$EVID_DIR/server-version.txt"
psql "$ADMIN_DATABASE_URL" -X -Atq -c "select 'postgis_available=' || count(*) from pg_available_extensions where name='postgis'" >> "$EVID_DIR/server-version.txt"
if ! grep -q 'server_version=16\.' "$EVID_DIR/server-version.txt"; then
  step_result server-version FAIL "نسخهٔ سرور PostgreSQL 16 نیست" 1
  exit 1
fi
if ! grep -q 'postgis_available=1' "$EVID_DIR/server-version.txt"; then
  step_result server-version FAIL "PostGIS در این خوشه موجود نیست (BLOCKED)" 1
  exit 1
fi
step_result server-version PASS "$(head -n 1 "$EVID_DIR/server-version.txt" | cut -c1-120)"

# ---------- helper: اجرای vitest با خروجی JSON ----------
vitest_suite() { # name file...
  local name="$1"; shift
  local out="$EVID_DIR/vitest-$name.json" log="$EVID_DIR/vitest-$name.log"
  ( cd apps/api && ../../node_modules/.bin/vitest run --reporter=json --outputFile="$out" "$@" ) > "$log" 2>&1
  local rc=$?
  local summary
  summary="$(node -e '
    const fs=require("fs"); const f=process.argv[1];
    if(!fs.existsSync(f)){console.log("no-json");process.exit(0);}
    const j=JSON.parse(fs.readFileSync(f,"utf8"));
    console.log(`files=${j.numTotalTestSuites} tests=${j.numTotalTests} passed=${j.numPassedTests} failed=${j.numFailedTests} skipped=${j.numPendingTests+j.numTodoTests}`);
  ' "$out" 2>/dev/null)"
  if [[ $rc -eq 0 && "$summary" == *"failed=0"* ]] && ! echo "$summary" | grep -q 'skipped=[1-9]'; then
    step_result "$name" PASS "$summary" 0
  else
    step_result "$name" FAIL "rc=$rc $summary" "$rc"
  fi
  return $rc
}

# ---------- ۱) مسیر کامل CI: bootstrap ⇒ up ⇒ real-login ⇒ rollback/reapply ⇒ window matrix ----------
echo "== real-login-security (bootstrap ⇒ migrate ⇒ real LOGIN ⇒ rollback ⇒ maintenance ⇒ window)"
REAL_LOGIN_DB="${REAL_LOGIN_DB:-greendms_real_login}" \
REAL_LOGIN_EVIDENCE_DIR="$EVID_DIR/real-login" \
  bash scripts/real-login-security.sh > "$EVID_DIR/real-login-security.log" 2>&1
rl=$?
if [[ $rl -eq 0 ]]; then
  step_result real-login-security PASS "$(grep -E 'REAL-LOGIN SECURITY: PASS|WINDOW-MATRIX' "$EVID_DIR/real-login-security.log" | tail -n 2 | tr '\n' ' ')" 0
else
  step_result real-login-security FAIL "rc=$rl؛ $EVID_DIR/real-login-security.log" "$rl"
fi
if [[ -f "$EVID_DIR/real-login/window/results.jsonl" ]]; then
  cp "$EVID_DIR/real-login/window/results.jsonl" "$EVID_DIR/window-matrix.jsonl"
fi

# ---------- ۲) مجموعهٔ آزمون‌های DB-دار (مالکیت، RLS، ledger، نگه‌داری) ----------
# این‌ها مانند CI (integration-db) با DATABASE_URL = ابرکاربرِ همین خوشهٔ ایزوله اجرا می‌شوند.
export DATABASE_URL="$ADMIN_DATABASE_URL"
vitest_suite db-privileges test/db-privileges.api.test.ts
vitest_suite ledger-integrity test/ledger-integrity.api.test.ts test/ledger-partition-protection.api.test.ts
vitest_suite inventory-ledger-http test/inventory-ledger-http.api.test.ts
vitest_suite audit-partition-recovery test/audit-partition-recovery.api.test.ts
vitest_suite tenant-isolation-rls test/tenant-isolation.api.test.ts

# migrations-security (non-api، با DATABASE_URL ابرکاربر و ساختِ پایگاه موقت خودش)
( cd apps/api && ../../node_modules/.bin/vitest run --reporter=json --outputFile="$EVID_DIR/vitest-migrations-security.json" test/migrations-security.test.ts ) > "$EVID_DIR/vitest-migrations-security.log" 2>&1
rc=$?
step_result migrations-security $([[ $rc -eq 0 ]] && echo PASS || echo FAIL) "rc=$rc (ابرکاربر، غیر-real-login)" $rc

# ---------- ۳) زنجیرهٔ کامل مهاجرت با ابرکاربر روی پایگاه ایزوله (migrations.yml) ----------
if [[ -f scripts/test-migrations.mjs ]]; then
  DATABASE_URL="$ADMIN_DATABASE_URL" node scripts/test-migrations.mjs > "$EVID_DIR/test-migrations.log" 2>&1
  rc=$?
  step_result test-migrations $([[ $rc -eq 0 ]] && echo PASS || echo FAIL) "rc=$rc" $rc
fi

# ---------- جمع‌بندی ----------
fails=$(grep -c '"status":"FAIL"' "$RESULTS" || true)
passes=$(grep -c '"status":"PASS"' "$RESULTS" || true)
node -e '
  const fs=require("fs");
  const steps=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  const out={ verdict: steps.every(s=>s.status==="PASS") ? "PASS" : "FAIL", steps,
    notes:["PGlite هرگز جایگزین این شواهد نیست.","ابرکاربر فقط برای مرزِ اعتماد/فیکسچر است؛ آزمون‌های real-login با نقش‌های LOGIN واقعی اجرا شده‌اند."] };
  fs.writeFileSync(process.argv[2], JSON.stringify(out,null,2));
' "$RESULTS" "$EVID_DIR/summary.json"
echo "SUMMARY: PASS=$passes FAIL=$fails  ->  $EVID_DIR/summary.json"
[[ $fails -eq 0 ]]
