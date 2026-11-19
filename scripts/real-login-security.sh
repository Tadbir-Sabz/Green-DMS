#!/usr/bin/env bash
# S8 / TASK-GDMS-INV-S8-FINAL-OPERATIONAL-CLOSURE-04 — مسیرِ کاملِ آزمونِ «ورودِ واقعی» (PG16 + PostGIS).
#
# این اسکریپت فقط روی یک پایگاه‌دادهٔ یکبارمصرف کار می‌کند که مدیرِ آن (ADMIN_DATABASE_URL)
# را فراهم می‌کند؛ هرگز روی پایگاه‌داده‌های تولید یا مشترک اجرا نشود.
#
# مراحل (هر شکست = کد خروج غیرصفر؛ هیچ مرحله‌ای skip نمی‌شود):
#   1. ساخت پایگاه‌دادهٔ تازه؛ رمزهای ephemeral برای سه نقشِ LOGIN (تولید می‌شوند و چاپ نمی‌شوند)
#   2. bootstrap یک‌باره (نقش‌ها، PostGIS، 0001..0041، انتقال مالکیتِ public به dms_migrator)
#   3. backup-gate ⇒ پنجرهٔ مهاجرت ⇒ up کامل (0042..0071) ⇒ verify
#   4. آزمون‌های real-login (TCP + SCRAM، نقش‌های LOGIN واقعی؛ skip ممنوع)
#   5. چرخهٔ break-glass A/B: backup ⇒ rollback 1 و 2 با سوپرکاربر ⇒ up ⇒ مقایسهٔ schema/ACL با پیش از چرخه
#   6. denial مهاجرِ غیرسوپرکاربر روی down جدیدترین مهاجرت با SQLSTATE 42501 (در پنجرهٔ باز، سپس revoke)
#   7. آزمون‌های real-login دوباره پس از چرخه
#   8. نگه‌داریِ پارتیشن‌ها (db-maintain با dms_maintainer)
#   9. آزمون‌های شکستِ پنجرهٔ مهاجرت (scripts/test-migration-window.sh)
#
# ورودی‌ها:
#   ADMIN_DATABASE_URL   (الزامی) سوپرکاربرِ پایگاه‌دادهٔ یکبارمصرف؛ فقط برای این اسکریپت
#   REAL_LOGIN_DB        (اختیاری) نام پایگاه‌داده، پیش‌فرض greendms_real_login
#   REAL_LOGIN_EVIDENCE_DIR (اختیاری) پوشهٔ شواهد؛ پیش‌فرض یک پوشهٔ موقت
#   PG_DUMP              (اختیاری) مسیر pg_dump با نسخهٔ >= سرور
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

: "${ADMIN_DATABASE_URL:?ADMIN_DATABASE_URL (سوپرکاربرِ پایگاه‌دادهٔ یکبارمصرف) لازم است}"
DB="${REAL_LOGIN_DB:-greendms_real_login}"
[[ "$DB" =~ ^[a-z][a-z0-9_]{2,40}$ ]] || { echo "نام پایگاه‌داده نامعتبر: $DB" >&2; exit 2; }
EVID="${REAL_LOGIN_EVIDENCE_DIR:-$(mktemp -d)}"
mkdir -p "$EVID"

# رمزهای ephemeral: فقط در حافظهٔ این فرایند؛ هرگز در لاگ یا فایل نوشته نمی‌شوند.
MIG_PW="$(openssl rand -hex 24)"
APP_PW="$(openssl rand -hex 24)"
MNT_PW="$(openssl rand -hex 24)"
export MIG_PW APP_PW MNT_PW

# ساختِ URLهای اتصال (بدون چاپِ رمز)
urls="$(node -e '
  const [admin, db, mig, app, mnt] = [process.env.ADMIN_DATABASE_URL, process.env.REAL_LOGIN_DB, process.env.MIG_PW, process.env.APP_PW, process.env.MNT_PW];
  const withDb = (base, name, user, pass) => { const u = new URL(base); u.pathname = "/" + name; if (user) { u.username = user; u.password = pass; } return u.toString(); };
  const out = {
    ADMIN_POSTGRES: withDb(admin, "postgres"),
    ADMIN_DB: withDb(admin, db),
    MIGRATOR: withDb(admin, db, "dms_migrator", mig),
    APP: withDb(admin, db, "dms_app", app),
    MAINT: withDb(admin, db, "dms_maintainer", mnt),
  };
  for (const [k, v] of Object.entries(out)) console.log(k + "=" + v);
' )"
url_of() { echo "$urls" | sed -n "s/^$1=//p"; }

psql_admin() { psql "$(url_of ADMIN_POSTGRES)" -X -q -v ON_ERROR_STOP=1 "$@"; }

echo "[1/9] پایگاه‌داده‌ی یکبارمصرف: $DB"
psql_admin -c "drop database if exists \"$DB\"" -c "create database \"$DB\""

export ADMIN_DATABASE_URL="$(url_of ADMIN_DB)"
export DATABASE_URL="$(url_of MIGRATOR)"
export APP_DATABASE_URL="$(url_of APP)"
export MAINTENANCE_DATABASE_URL="$(url_of MAINT)"
export DMS_BOOTSTRAP_CONFIRM=yes
export DMS_WINDOW_REASON="real-login CI: bootstrap + full chain (ephemeral DB)"

echo "[2/9] bootstrap یک‌باره"
node scripts/db-window.mjs bootstrap

echo "[3/9] backup-gate ⇒ پنجرهٔ مهاجرت ⇒ up کامل ⇒ verify"
node scripts/db-window.mjs backup --out "$EVID/pre-up.dump"
export DMS_BACKUP_FILE="$EVID/pre-up.dump"
export DMS_BACKUP_SHA256="$(cut -d' ' -f1 "$EVID/pre-up.dump.sha256")"
node scripts/db-window.mjs up
node scripts/db-window.mjs verify > "$EVID/verify-up.json"

# اجرای vitest و بررسیِ اینکه هیچ آزمونی skip یا نادیده گرفته نشده است
run_real_login() {
  local label="$1"
  local log="$EVID/real-login-$label.log"
  (
    cd apps/api
    REAL_LOGIN_EVIDENCE_FILE="$EVID/evidence-$label.json" \
      ../../node_modules/.bin/vitest run test/real-login-security.api.test.ts
  ) > "$log" 2>&1 || { sed -n '1,400p' "$log" | tail -n 120; echo "real-login ($label) شکست خورد" >&2; exit 1; }
  if grep -Eq '[0-9]+ skipped|skipped' "$log"; then
    echo "real-login ($label): آزمونِ skip‌شده وجود دارد؛ skip معادل PASS نیست" >&2; exit 1
  fi
  grep -E "Tests " "$log" | sed 's/\x1b\[[0-9;]*m//g'
}

echo "[4/9] آزمون‌های real-login (نقش‌های LOGIN واقعی، TCP + SCRAM)"
run_real_login before-cycle

# S8-07 (R1): بازگشتِ 0072 رد می‌شود (بدنهٔ 0070 در down، D1 را بازمی‌گرداند). این حلقه ثابت می‌کند که:
#   - rollback با سوپرکاربر رد می‌شود و پیام «رد شد» می‌دهد،
#   - schema پیش و پس از تلاشِ رد‌شده یکسان است (هیچ SQL‌ای اجرا نشده)،
#   - verify پس از رد شدن گذشته است.
# بازیابیِ واقعی فقط از پشتیبان است (docs/deploy/PRODUCTION_DEPLOYMENT.md بخش ۳-ج)؛ آن در این حلقه نیست.
rollback_refusal_probe() { # steps label
  local n="$1" label="$2" log="$EVID/rollback-refusal-$label.log"
  PG_DUMP_BIN="${PG_DUMP:-pg_dump}"
  "$PG_DUMP_BIN" --schema-only -f "$EVID/schema-before-$label.sql" "$ADMIN_DATABASE_URL"
  node scripts/db-window.mjs backup --out "$EVID/pre-rollback-$label.dump"
  export DMS_BACKUP_FILE="$EVID/pre-rollback-$label.dump"
  export DMS_BACKUP_SHA256="$(cut -d' ' -f1 "$EVID/pre-rollback-$label.dump.sha256")"
  export DMS_WINDOW_REASON="real-login CI: rollback refusal probe $label"
  set +e
  node scripts/db-window.mjs rollback "$n" > "$log" 2>&1
  local rc=$?
  set -e
  if [[ $rc -eq 0 ]] || ! grep -q 'بازگشتِ مهاجرت 0072 رد شد' "$log"; then
    echo "rollback($n) باید با رد شدنِ 0072 متوقف شود (کد $rc)؛ شواهد: $log" >&2; exit 1
  fi
  "$PG_DUMP_BIN" --schema-only -f "$EVID/schema-after-$label.sql" "$ADMIN_DATABASE_URL"
  if ! diff -u "$EVID/schema-before-$label.sql" "$EVID/schema-after-$label.sql" > "$EVID/schema-refusal-$label.diff"; then
    echo "رد شدنِ rollback($label) نباید schema را تغییر دهد — $EVID/schema-refusal-$label.diff" >&2; exit 1
  fi
  node scripts/db-window.mjs verify > "$EVID/verify-after-refusal-$label.json"
}

echo "[5/9] break-glass A (R1): rollback 1 باید برای 0072 رد شود؛ schema بدون تغییر"
rollback_refusal_probe 1 A
echo "[5b/9] break-glass B (R1): rollback 2 باید در 0072 رد شود؛ schema بدون تغییر"
rollback_refusal_probe 2 B

# مهاجرِ غیرسوپرکاربر روی down باید 42501 بدهد؛ نامِ فایلِ down از جدیدترین مهاجرتِ مخزن گرفته می‌شود
NEWEST="$(ls migrations/*.up.sql | sort | tail -n 1 | sed 's#.*/##; s#\.up\.sql$##')"
DOWN_FILE="migrations/${NEWEST}.down.sql"
[[ -f "$DOWN_FILE" ]] || { echo "down مهاجرت $NEWEST یافت نشد" >&2; exit 1; }

echo "[6/9] مهاجرِ غیرسوپرکاربر روی down ($NEWEST) ⇒ باید SQLSTATE 42501 بدهد"
export DMS_WINDOW_REASON="real-login CI: non-superuser down denial probe"
export DMS_BACKUP_FILE="$EVID/pre-rollback-B.dump"
export DMS_BACKUP_SHA256="$(cut -d' ' -f1 "$EVID/pre-rollback-B.dump.sha256")"
node scripts/db-window.mjs grant
set +e
{ echo '\set VERBOSITY verbose'; echo '\set ON_ERROR_STOP 1'; cat "$DOWN_FILE"; } > "$EVID/probe-down.sql"
psql "$DATABASE_URL" -X -f "$EVID/probe-down.sql" > "$EVID/probe-down.log" 2>&1
probe_rc=$?
set -e
node scripts/db-window.mjs revoke
node scripts/db-window.mjs verify > "$EVID/verify-after-probe.json"
if [[ $probe_rc -eq 0 ]] || ! grep -q 'ERROR:  42501' "$EVID/probe-down.log"; then
  echo "down به‌عنوان مهاجرِ غیرسوپرکاربر باید با 42501 رد شود؛ خروجی: $EVID/probe-down.log" >&2; exit 1
fi
echo "down($NEWEST, non-superuser) ⇒ 42501 ✓"

echo "[7/9] آزمون‌های real-login پس از چرخه"
run_real_login after-cycle

echo "[8/9] نگه‌داریِ پارتیشن‌ها با هویت dms_maintainer (inventory_txn، audit_log، location_sample)"
node scripts/db-maintain.mjs check > "$EVID/maintain-check.json"
node scripts/db-maintain.mjs partitions --months 2 > "$EVID/maintain-partitions.json"

echo "[9/9] مهاجرتِ پنجره: شکست در مهاجرت، پس از افزایش سطح، پس از راستی‌آزمایی، و بازیابی"
# S8-07 (R5): ماتریسِ پنجره باید همهٔ موارد manifest را «دقیقاً یک‌بار» ثبت کند. هر غیبت/تکرار/خطای ساختاری ⇒ FAIL.
# UNVERIFIED ⇒ کد 2؛ PASS فقط وقتی همهٔ موارد PASS باشند. هیچ fallback «خالی = PASS» وجود ندارد.
set +e
ADMIN_DATABASE_URL="$ADMIN_DATABASE_URL" DATABASE_URL="$DATABASE_URL" EVID="$EVID" \
  DMS_BACKUP_FILE="$EVID/pre-rollback-B.dump" DMS_BACKUP_SHA256="$(cut -d' ' -f1 "$EVID/pre-rollback-B.dump.sha256")" \
  bash scripts/test-migration-window.sh > "$EVID/window-matrix.log" 2>&1
MATRIX_RC=$?
set -e
node scripts/window-gate.mjs "$EVID/window/results.jsonl" scripts/window-expected-cases.txt > "$EVID/window-gate.json"
GATE_RC=$?
cat "$EVID/window-gate.json"
if [[ $GATE_RC -eq 2 ]]; then
  echo "REAL-LOGIN SECURITY: UNVERIFIED — موارد بدون آزمون در ماتریس پنجره (شواهد: $EVID)" >&2
  exit 2
fi
if [[ $GATE_RC -ne 0 || $MATRIX_RC -ne 0 ]]; then
  echo "REAL-LOGIN SECURITY: FAIL — دروازهٔ پنجره (کد $GATE_RC، ماتریس $MATRIX_RC؛ شواهد: $EVID)" >&2
  exit 1
fi
echo "REAL-LOGIN SECURITY: PASS (شواهد: $EVID)"
