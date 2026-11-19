#!/usr/bin/env bash
# S8-05: آزمون‌های شکستِ «پنجرهٔ مهاجرت» روی PostgreSQL واقعی (یک پایگاه‌دادهٔ یکبارمصرف).
#
# پیش‌نیاز: پایگاه‌داده پس از bootstrap و up کامل است (همان حالتِ پایان scripts/real-login-security.sh).
# این اسکریپت هیچ مهاجرتِ مخزن را تغییر نمی‌دهد؛ مهاجرت‌های شکست‌خورده فقط در MIGRATIONS_DIR موقتی
# (کپیِ migrations/ به‌علاوهٔ فیکسچرهای 9001..9003) هستند.
#
# نتیجهٔ هر حالت: PASS | FAIL | UNVERIFIED (با دلیل). «skip» هرگز PASS نیست.
#
# ورودی‌ها: ADMIN_DATABASE_URL, DATABASE_URL (dms_migrator), EVID (پوشهٔ شواهد)
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
: "${ADMIN_DATABASE_URL:?لازم است}"
: "${DATABASE_URL:?لازم است}"
EVID="${EVID:?EVID (پوشهٔ شواهد) لازم است}"
W="$EVID/window"
mkdir -p "$W"
PSQL="${PSQL:-psql}"
RESULTS="$W/results.jsonl"
: > "$RESULTS"
export DMS_WINDOW_REASON="S8-05 window-failure matrix (disposable DB)"
export DMS_BACKUP_FILE="${DMS_BACKUP_FILE:?}"
export DMS_BACKUP_SHA256="${DMS_BACKUP_SHA256:?}"
export DMS_BACKUP_SHA256

admin_q() { "$PSQL" "$ADMIN_DATABASE_URL" -X -Atq -v ON_ERROR_STOP=1 -c "$1"; }

record() { # case status detail
  local c="$1" s="$2" d="$3"
  printf '{"case":"%s","status":"%s","detail":%s}\n' "$c" "$s" "$(node -e 'console.log(JSON.stringify(process.argv[1]))' "$d")" >> "$RESULTS"
  echo "[$s] $c — $d"
}

window_closed() { # برای «بسته است»: هیچ عضویت مستقیمی و SET روی dms_owner برای dms_migrator نیست
  [[ "$(admin_q "select count(*) from pg_auth_members m join pg_roles a on a.oid=m.roleid join pg_roles b on b.oid=m.member where a.rolname='dms_owner' and b.rolname='dms_migrator'")" == "0" ]] \
    && [[ "$(admin_q "select pg_has_role('dms_migrator','dms_owner','SET')")" == "f" ]]
}

applied_count() { admin_q "select count(*) from schema_migrations"; }

# S8-07 (R4): کمک‌های PID (pid_alive، wait_pid_gone، child_pid_of) از scripts/lib/window-pid.sh
source "$ROOT/scripts/lib/window-pid.sh"

# انتظارِ محدود تا فرزندِ مهاجرت زنده و pg_sleep در حال اجرا باشد (شرط شروع آزمون)
wait_child_running() { # log
  local log="$1" i cp
  for ((i = 0; i < 60; i++)); do
    cp="$(child_pid_of "$log")"
    if [[ -n "$cp" ]] && pid_alive "$cp" && [[ "$(admin_q "select count(*) from pg_stat_activity where application_name='dms-migrate' and query like '%pg_sleep%'")" != "0" ]]; then
      return 0
    fi
    sleep 1
  done
  return 1
}

# نگه‌داشتنِ قفلِ پنجره توسط یک نشستِ دیگر (برای آزمون‌های R1/R2)
hold_window_lock() { # seconds
  "$PSQL" "$ADMIN_DATABASE_URL" -X -Atq -c "select pg_advisory_lock(hashtext('dms-db-window')); select pg_sleep($1);" > /dev/null 2>&1
}

fixture_dir() { # name ⇒ مسیرِ کپیِ migrations با فیکسچرهای داده‌شده
  local d="$W/fixtures-$1"; rm -rf "$d"; mkdir -p "$d"; cp migrations/*.sql "$d"/
  echo "$d"
}

node_db() { node scripts/db-window.mjs "$@"; }

# ---------- W1: پنجرهٔ باز مانده (اپراتور GRANT کرده و فراموش کرده) ----------
echo "== W1 accidental open window"
node_db grant > "$W/w1-grant.log" 2>&1 || { record W1-verify-detects-open FAIL "grant اجرا نشد؛ آزمون معتبر نیست"; }
if node_db verify > "$W/w1-verify-open.log" 2>&1; then
  record W1-verify-detects-open FAIL "verify پنجرهٔ باز را تشخیص نداد"
else
  record W1-verify-detects-open PASS "verify با پنجرهٔ باز شکست خورد (کد غیرصفر)"
fi
before=$(applied_count)
if node_db up > "$W/w1-up-refused.log" 2>&1; then
  record W1-up-refused-when-open FAIL "up با پنجرهٔ باز اجرا شد"
else
  if grep -q 'پیش‌پرواز' "$W/w1-up-refused.log" && [[ "$(applied_count)" == "$before" ]]; then
    record W1-up-refused-when-open PASS "up پیش از هر تغییری رد شد؛ schema_migrations بدون تغییر"
  else
    record W1-up-refused-when-open FAIL "up شکست خورد اما علت/تغییرِ ledger نامطمئن است"
  fi
fi
if node_db recover > "$W/w1-recover.log" 2>&1 && window_closed; then
  record W1-recover-closes PASS "recover پنجرهٔ مانده را بست؛ عضویت و SET برداشته شد"
else
  record W1-recover-closes FAIL "recover پنجره را نبست یا راستی‌آزمایی ناموفق بود"
fi

# ---------- W2: قطعیِ کامل (SIGKILL گروه فرایند) در میانهٔ مهاجرتِ دارای پنجرهٔ باز ----------
echo "== W2 SIGKILL during migration (after elevation)"
d2=$(fixture_dir w2)
cat > "$d2/9001_window_kill_probe.up.sql" <<'SQL'
-- فیکسچرِ آزمون: قطع‌شدنِ وسطِ مهاجرت؛ باید هیچ اثری در پایگاه‌داده نگذارد.
select pg_sleep(120);
SQL
cat > "$d2/9001_window_kill_probe.down.sql" <<'SQL'
select 1;
SQL
set +e
MIGRATIONS_DIR="$d2" setsid bash -c "exec node '$ROOT/scripts/db-window.mjs' up" > "$W/w2-up.log" 2>&1 &
pid=$!
set -e
seen=0
for _ in $(seq 1 60); do
  if [[ "$(admin_q "select count(*) from pg_stat_activity where application_name='dms-migrate' and query like '%pg_sleep%'")" != "0" ]]; then seen=1; break; fi
  sleep 1
done
if [[ $seen -eq 1 ]]; then
  elevated=$(admin_q "select pg_has_role('dms_migrator','dms_owner','SET')")
  kill -KILL -- "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null; true
  sleep 2
  if [[ "$elevated" == "t" ]]; then
    record W2-elevated-during-migration PASS "مهاجرت در حال اجرا با SET روی dms_owner دیده شد (پنجره باز بود)"
  else
    record W2-elevated-during-migration FAIL "در حالِ مهاجرت SET دیده نشد"
  fi
  if [[ "$(admin_q "select count(*) from schema_migrations where version='9001'")" == "0" ]]; then
    record W2-killed-migration-rolled-back PASS "مهاجرتِ قطع‌شده ثبت نشد (تراکنش برگشت خورد)"
  else
    record W2-killed-migration-rolled-back FAIL "مهاجرتِ قطع‌شده در schema_migrations ثبت شده"
  fi
  if ! window_closed; then
    record W2-window-left-open-after-kill PASS "پس از SIGKILL پنجرهٔ مانده است (ورودیِ بازیابی لازم است)"
    if node_db recover > "$W/w2-recover.log" 2>&1 && window_closed && node_db verify > "$W/w2-verify.log" 2>&1; then
      record W2-recover-after-kill PASS "recover پس از قطعیِ کامل، پنجره را بست و verify گذشت"
    else
      record W2-recover-after-kill FAIL "recover یا verify پس از قطعی ناموفق بود"
    fi
  else
    record W2-window-left-open-after-kill FAIL "SIGKILL پنجره را باز نگذاشت؛ آزمون معتبر نیست"
  fi
else
  kill -KILL -- "-$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  record W2-elevated-during-migration FAIL "مهاجرتِ 9001 هرگز در pg_stat_activity دیده نشد"
fi
# اگر پنجره هنوز باز است (مثلاً kill ناکام)، صریحاً بازیابی کن تا حالت بعدی آلوده نشود
window_closed || node_db recover > "$W/w2-cleanup.log" 2>&1 || true

# ---------- W3: شکستِ SQL داخل مهاجرت ----------
echo "== W3 migration SQL failure"
d3=$(fixture_dir w3)
printf 'select 1/0;\n' > "$d3/9002_fail_probe.up.sql"
printf 'select 1;\n' > "$d3/9002_fail_probe.down.sql"
before=$(applied_count)
if MIGRATIONS_DIR="$d3" node_db up > "$W/w3-up.log" 2>&1; then
  record W3-migration-failure-rejected FAIL "مهاجرتِ شکسته پذیرفته شد"
else
  if [[ "$(applied_count)" == "$before" && "$(admin_q "select count(*) from schema_migrations where version='9002'")" == "0" ]] && window_closed; then
    record W3-migration-failure-rejected PASS "خطای SQL: ledger بدون تغییر، پنجره بسته، کد خروج غیرصفر"
  else
    record W3-migration-failure-rejected FAIL "پس از خطای SQL ledger یا پنجره در وضعیت نامعتبر است"
  fi
fi
node_db verify > "$W/w3-verify.log" 2>&1 && record W3-verify-after-failure PASS "verify پس از شکست گذشت" || record W3-verify-after-failure FAIL "verify پس از شکست ناموفق بود"

# ---------- W4: شکستِ راستی‌آزماییِ پس از مهاجرت (drift که مهاجرت ایجاد کرده) ----------
echo "== W4 post-verify failure (drift introduced by migration)"
d4=$(fixture_dir w4)
printf 'grant update on audit_log to dms_app;\n' > "$d4/9003_drift_probe.up.sql"
printf 'revoke update on audit_log from dms_app;\n' > "$d4/9003_drift_probe.down.sql"
if MIGRATIONS_DIR="$d4" node_db up > "$W/w4-up.log" 2>&1; then
  record W4-postcheck-catches-drift FAIL "راستی‌آزمایی پس از مهاجرت drift را نگرفت"
else
  if window_closed && [[ "$(admin_q "select count(*) from schema_migrations where version='9003'")" == "1" ]]; then
    record W4-postcheck-catches-drift PASS "مهاجرت اجرا و ثبت شد (9003)، سپس راستی‌آزمایی drift را گرفت؛ پنجره بسته است"
  else
    record W4-postcheck-catches-drift FAIL "خطا رخ داد اما پنجره/علت نامطمئن است"
  fi
fi
# بازیابیِ drift توسط سوپرکاربر و پاک‌کردنِ ردیفِ فیکسچر (فقط پایگاه یکبارمصرف)
admin_q "revoke update on audit_log from dms_app" > /dev/null
admin_q "delete from schema_migrations where version='9003'" > /dev/null
if node_db verify > "$W/w4-verify-after-fix.log" 2>&1; then
  record W4-verify-after-remediation PASS "پس از رفعِ drift، verify گذشت"
else
  record W4-verify-after-remediation FAIL "پس از رفعِ drift هنوز ناسالم است"
fi

# ---------- P1: SIGKILL فقط روی والد (فرزند باید از طریق IPC قطع‌شدن خارج شود) ----------
echo "== P1 parent-only SIGKILL (child must exit via IPC disconnect; migration must not commit)"
d8=$(fixture_dir w8)
printf 'select pg_sleep(120);\n' > "$d8/9004_parent_kill_probe.up.sql"
printf 'select 1;\n' > "$d8/9004_parent_kill_probe.down.sql"
MIGRATIONS_DIR="$d8" setsid bash -c "exec node '$ROOT/scripts/db-window.mjs' up" > "$W/w8-up.log" 2>&1 &
pid8=$!
if wait_child_running "$W/w8-up.log"; then
  cpid8="$(child_pid_of "$W/w8-up.log")"
  kill -KILL "$pid8" 2>/dev/null || true       # فقط والد؛ فرزند باید خودش خارج شود
  wait "$pid8" 2>/dev/null || true
  if wait_pid_gone "$cpid8" 60; then
    record P1-child-exits-on-parent-sigkill PASS "فرزندِ مهاجرت (pid $cpid8) پس از SIGKILL والد خارج شد (سنجش با /proc)"
  else
    record P1-child-exits-on-parent-sigkill FAIL "فرزندِ مهاجرت (pid $cpid8) پس از SIGKILL والد هنوز زنده است"
  fi
  if [[ "$(admin_q "select count(*) from schema_migrations where version='9004'")" == "0" ]]; then
    record P1-migration-not-committed PASS "مهاجرت 9004 ثبت نشد (تراکنش بدون COMMIT برگشت می‌خورد)"
  else
    record P1-migration-not-committed FAIL "مهاجرت 9004 با وجود قطعیِ والد ثبت شده است"
  fi
  # والد هرگز closeWindow را اجرا نکرده و GRANT پیش از شروعِ فرزند انجام شده است؛ پس عضویتِ GRANT باید
  # پس از قطعیِ والد بماند (پنجره باز). بسته‌بودن یعنی آزمون معتبر نیست؛ هرگز PASS نمی‌شود.
  if window_closed; then
    record P1-window-state-after-parent-kill FAIL "پنجره پس از SIGKILL والد بسته است؛ انتظار: باز (آزمون معتبر نیست)"
    record P1-recover-after-parent-kill FAIL "آزمون معتبر نیست (پنجره باز نماند)"
  else
    record P1-window-state-after-parent-kill PASS "پنجره پس از SIGKILL والد باز مانده (وضعیتِ مستند) و از بیرون دیده می‌شود"
    if node_db recover > "$W/w8-recover.log" 2>&1 && window_closed; then
      record P1-recover-after-parent-kill PASS "recover پس از قطعیِ والد پنجره را بست"
    else
      record P1-recover-after-parent-kill FAIL "recover پس از قطعیِ والد پنجره را نبست"
    fi
  fi
else
  kill -KILL "$pid8" 2>/dev/null || true; wait "$pid8" 2>/dev/null || true
  record P1-child-exits-on-parent-sigkill FAIL "فرزند مهاجرت (pid) یا pg_sleep هرگز دیده نشد (آزمون معتبر نیست)"
  record P1-migration-not-committed FAIL "آزمون معتبر نیست (فرزند شروع نشد)"
  record P1-window-state-after-parent-kill FAIL "آزمون معتبر نیست (فرزند شروع نشد)"
  record P1-recover-after-parent-kill FAIL "آزمون معتبر نیست (فرزند شروع نشد)"
fi
window_closed || node_db recover > "$W/w8-cleanup.log" 2>&1 || true

# ---------- P2: SIGTERM فقط روی والد (باید به فرزند فوروارد و تا خروجِ فرزند صبر شود) ----------
echo "== P2 parent-only SIGTERM (forwarded to child; window closed; exit 130)"
d9=$(fixture_dir w9)
printf 'select pg_sleep(120);\n' > "$d9/9005_parent_term_probe.up.sql"
printf 'select 1;\n' > "$d9/9005_parent_term_probe.down.sql"
MIGRATIONS_DIR="$d9" setsid bash -c "exec node '$ROOT/scripts/db-window.mjs' up" > "$W/w9-up.log" 2>&1 &
pid9=$!
if wait_child_running "$W/w9-up.log"; then
  cpid9="$(child_pid_of "$W/w9-up.log")"
  kill -TERM "$pid9" 2>/dev/null || true       # فقط والد؛ والد باید به فرزند فوروارد کند
  # انتظارِ محدود برای خروجِ والد (۹۰ ثانیه)؛ پس از آن SIGKILL و شکستِ آزمون
  parent_gone=0
  for _ in $(seq 1 90); do
    if ! pid_alive "$pid9"; then parent_gone=1; break; fi
    sleep 1
  done
  if [[ $parent_gone -eq 0 ]]; then kill -KILL "$pid9" 2>/dev/null || true; fi
  wait "$pid9" 2>/dev/null; rc9=$?
  if wait_pid_gone "$cpid9" 60; then
    record P2-child-stopped-on-parent-sigterm PASS "فرزند (pid $cpid9) پس از SIGTERM والد متوقف شد (سنجش با /proc)"
  else
    record P2-child-stopped-on-parent-sigterm FAIL "فرزند (pid $cpid9) پس از SIGTERM والد هنوز زنده است"
  fi
  window_closed && record P2-window-closed-after-sigterm PASS "پنجره پس از SIGTERM بسته شد" \
    || record P2-window-closed-after-sigterm FAIL "پنجره پس از SIGTERM باز ماند"
  if [[ $parent_gone -eq 1 && "$rc9" == "130" ]]; then
    record P2-exit-code-130 PASS "کد خروج والد 130"
  else
    record P2-exit-code-130 FAIL "کد خروج $rc9 (انتظار 130؛ والد در وقت مقرر خارج شد: $parent_gone)"
  fi
  [[ "$(admin_q "select count(*) from schema_migrations where version='9005'")" == "0" ]] \
    && record P2-migration-not-committed PASS "مهاجرت 9005 ثبت نشد" || record P2-migration-not-committed FAIL "مهاجرت 9005 ثبت شد"
else
  kill -KILL "$pid9" 2>/dev/null || true; wait "$pid9" 2>/dev/null || true
  record P2-child-stopped-on-parent-sigterm FAIL "فرزند مهاجرت یا pg_sleep هرگز دیده نشد (آزمون معتبر نیست)"
  record P2-window-closed-after-sigterm FAIL "آزمون معتبر نیست (فرزند شروع نشد)"
  record P2-exit-code-130 FAIL "آزمون معتبر نیست (فرزند شروع نشد)"
  record P2-migration-not-committed FAIL "آزمون معتبر نیست (فرزند شروع نشد)"
fi
window_closed || node_db recover > "$W/w9-cleanup.log" 2>&1 || true

# ---------- R1: rollback زیرِ قفلِ پنجره؛ قفلِ نگه‌داشته‌شده ⇒ رد شدن ----------
echo "== R1 rollback waits for the window lock and refuses when it is held"
hold_window_lock 45 &
holder=$!
sleep 3
if DMS_BACKUP_FILE="$DMS_BACKUP_FILE" DMS_BACKUP_SHA256="$DMS_BACKUP_SHA256" node_db rollback 1 > "$W/w10-rollback.log" 2>&1; then
  record R1-rollback-refused-while-locked FAIL "rollback با قفلِ پنجرهٔ نگه‌داشته‌شده اجرا شد"
else
  grep -q 'قفلِ پنجرهٔ مهاجرت' "$W/w10-rollback.log" && record R1-rollback-refused-while-locked PASS "rollback با قفلِ نگه‌داشته‌شده رد شد (زیرِ قفلِ پنجره اجرا می‌شود)" \
    || record R1-rollback-refused-while-locked FAIL "rollback شکست خورد اما نه به‌خاطرِ قفل (log: $W/w10-rollback.log)"
fi
wait "$holder" 2>/dev/null || true

# ---------- R2: مهاجرتِ owner-دار برای سوپرکاربر و مسیرِ API هم فقط با قفلِ نشستِ دیگر ----------
echo "== R2 owner-requiring migration: superuser direct, API caller, external lock"
d10=$(fixture_dir r2)
printf "select 'dms_owner';\n" > "$d10/9006_owner_probe.up.sql"
printf 'select 1;\n' > "$d10/9006_owner_probe.down.sql"
if ! window_closed; then
  record R2-superuser-direct-up-refused FAIL "پیش‌شرط: پنجره بسته نیست"
  record R2-api-auto-owner-migration-refused FAIL "پیش‌شرط: پنجره بسته نیست"
  record R2-external-lock-allows-owner-migration FAIL "پیش‌شرط: پنجره بسته نیست"
else
  before10=$(applied_count)
  # (الف) سوپرکاربر، بدونِ هیچ قفل: باید رد شود و ledger تغییر نکند
  if DATABASE_URL="$ADMIN_DATABASE_URL" MIGRATIONS_DIR="$d10" node scripts/migrate.mjs up > "$W/r2a.log" 2>&1; then
    record R2-superuser-direct-up-refused FAIL "مهاجرتِ owner-دار با سوپرکاربرِ مستقیم (بدونِ پنجره) اجرا شد"
  else
    if grep -q 'dms-db-window' "$W/r2a.log" && [[ "$(applied_count)" == "$before10" ]]; then
      record R2-superuser-direct-up-refused PASS "سوپرکاربرِ مستقیم رد شد؛ ledger بدون تغییر"
    else
      record R2-superuser-direct-up-refused FAIL "رد شد اما علت/ledger نامطمئن است"
    fi
  fi
  # (ب) قفلِ نشستِ دیگر وجود دارد، ولی فراخوان API است: رد شود (مسیرِ جایگزین ممنوع)
  hold_window_lock 25 &
  holder10=$!
  sleep 3
  if DMS_MIGRATE_CALLER=api-auto DATABASE_URL="$ADMIN_DATABASE_URL" MIGRATIONS_DIR="$d10" node scripts/migrate.mjs up > "$W/r2b.log" 2>&1; then
    record R2-api-auto-owner-migration-refused FAIL "فراخوانِ api-auto مهاجرتِ owner-دار را اعمال کرد"
  else
    if grep -q 'اعمالِ خودکارِ API' "$W/r2b.log" && [[ "$(applied_count)" == "$before10" ]]; then
      record R2-api-auto-owner-migration-refused PASS "api-auto رد شد حتی با قفلِ خارجی؛ ledger بدون تغییر"
    else
      record R2-api-auto-owner-migration-refused FAIL "رد شد اما علت/ledger نامطمئن است"
    fi
  fi
  # (پ) قفلِ نشستِ دیگر + سوپرکاربرِ مستقیم (غیر-API): مجاز است
  if DATABASE_URL="$ADMIN_DATABASE_URL" MIGRATIONS_DIR="$d10" node scripts/migrate.mjs up > "$W/r2c.log" 2>&1 \
     && [[ "$(applied_count)" == "$((before10 + 1))" ]]; then
    record R2-external-lock-allows-owner-migration PASS "قفلِ نشستِ دیگر: مهاجرتِ owner-دار برای سوپرکاربر اجرا و ثبت شد"
    admin_q "delete from schema_migrations where version='9006'" > /dev/null
  else
    record R2-external-lock-allows-owner-migration FAIL "با قفلِ نشستِ دیگر مهاجرت اجرا نشد (log: $W/r2c.log)"
  fi
  wait "$holder10" 2>/dev/null || true
fi

# ---------- W5/W6/D4: قلاب‌های آزمایشی (فقط در محیط آزمون؛ DMS_TEST_HOOKS) ----------
echo "== W5/W6/D4 fault hooks (test-only; disabled by default and in production)"
HOOK_ENV="DMS_TEST_HOOKS=I-UNDERSTAND-TEST-ONLY"
d5=$(fixture_dir w5)
printf 'select 1;\n' > "$d5/9007_revoke_transient_probe.up.sql"
printf 'select 1;\n' > "$d5/9007_revoke_transient_probe.down.sql"
printf 'select 1;\n' > "$d5/9008_revoke_persistent_probe.up.sql"
printf 'select 1;\n' > "$d5/9008_revoke_persistent_probe.down.sql"
# (الف) یک شکستِ گذرا در REVOKE ⇒ closeWindow تلاشِ مجدد می‌کند؛ پنجره بسته و کد خروج 0
env $HOOK_ENV DMS_TEST_FAULT=revoke:1 MIGRATIONS_DIR="$d5" node scripts/db-window.mjs up > "$W/w5a-up.log" 2>&1
rc5a=$?
if [[ $rc5a -eq 0 ]] && grep -q '"event":"window_close_retry"' "$W/w5a-up.log" && window_closed; then
  record W5-revoke-transient-retried PASS "REVOKE گذرا شکست خورد، closeWindow دوباره تلاش کرد؛ پنجره بسته، کد 0"
else
  record W5-revoke-transient-retried FAIL "کد $rc5a؛ تلاشِ مجدد یا بسته‌شدنِ پنجره تأیید نشد"
fi
admin_q "delete from schema_migrations where version='9007'" > /dev/null
# (ب) شکستِ دائمی در REVOKE ⇒ پنجره باز می‌ماند؛ کد خروج باید 3 بماند (D4) و recover باید ببندد
env $HOOK_ENV DMS_TEST_FAULT=revoke:always MIGRATIONS_DIR="$d5" node scripts/db-window.mjs up > "$W/w5b-up.log" 2>&1
rc5b=$?
if [[ $rc5b -eq 3 ]] && ! window_closed; then
  if node_db recover > "$W/w5b-recover.log" 2>&1 && window_closed; then
    record W5-revoke-persistent-window-open PASS "REVOKE دائماً شکست خورد؛ پنجره باز ماند (کد 3) و recover بست"
  else
    record W5-revoke-persistent-window-open FAIL "پنجرهٔ باز مانده را recover نبست"
  fi
else
  record W5-revoke-persistent-window-open FAIL "انتظار: کد 3 و پنجرهٔ باز؛ کد $rc5b"
fi
if [[ $rc5b -eq 3 ]]; then
  record D4-exit-code-3-preserved PASS "کد خروجِ بستنِ ناموفق (3) توسط خطای بعدی بازنویسی نشد"
else
  record D4-exit-code-3-preserved FAIL "کد خروج $rc5b (انتظار 3)"
fi
admin_q "delete from schema_migrations where version='9008'" > /dev/null
# (پ) شکست پس از GRANT (بررسی SET) ⇒ پنجره باید بسته شود؛ مهاجرت اجرا نشود؛ کد غیرصفر
d6=$(fixture_dir w6)
printf 'select 1;\n' > "$d6/9009_grant_check_probe.up.sql"
printf 'select 1;\n' > "$d6/9009_grant_check_probe.down.sql"
env $HOOK_ENV DMS_TEST_FAULT=grant-check:1 MIGRATIONS_DIR="$d6" node scripts/db-window.mjs up > "$W/w6-up.log" 2>&1
rc6=$?
if [[ $rc6 -ne 0 ]] && window_closed && [[ "$(admin_q "select count(*) from schema_migrations where version='9009'")" == "0" ]]; then
  record W6-grant-check-failure-revokes PASS "شکست پس از GRANT: پنجره بسته شد، مهاجرت اجرا نشد، کد $rc6"
else
  record W6-grant-check-failure-revokes FAIL "پس از شکست GRANT پنجره یا ledger نامعتبر است (کد $rc6)"
fi
# (ت) نشانهٔ بی‌اثر: بدونِ DMS_TEST_HOOKS، DMS_TEST_FAULT باید رد شود (قلاب هرگز بی‌صدا فعال نشود)
# (از مسیرِ up با مخزنِ اصلی: قلاب پیش از هر GRANT رد می‌شود؛ اگر رد نشود، هیچ مهاجرتِ معلقی ندارد)
if DMS_TEST_FAULT=revoke:1 node scripts/db-window.mjs up > "$W/w5-hook-disabled.log" 2>&1; then
  record W5-hook-disabled-without-ack FAIL "DMS_TEST_FAULT بدونِ تأیید پذیرفته شد"
else
  grep -q 'قلاب' "$W/w5-hook-disabled.log" && record W5-hook-disabled-without-ack PASS "بدونِ تأیید، DMS_TEST_FAULT رد شد" \
    || record W5-hook-disabled-without-ack FAIL "رد شد اما علت نامطمئن است"
fi
admin_q "delete from schema_migrations where version in ('9007','9008','9009')" > /dev/null
window_closed || node_db recover > "$W/w5-cleanup.log" 2>&1 || true

# ---------- W7: بازیابی بدونِ امتیازِ دائمیِ owner ----------
echo "== W7 recovery leaves no permanent owner privilege"
if window_closed && [[ "$(admin_q "select count(*) from pg_auth_members m join pg_roles a on a.oid=m.roleid join pg_roles b on b.oid=m.member where a.rolname='dms_owner' and b.rolname in ('dms_app','dms_maintainer')")" == "0" ]]; then
  record W7-no-permanent-owner-privilege PASS "dms_migrator بدون SET؛ dms_app/dms_maintainer عضوِ dms_owner نیستند"
else
  record W7-no-permanent-owner-privilege FAIL "امتیازِ owner پس از بازیابی باقی مانده است"
fi

fails=$(grep -c '"status":"FAIL"' "$RESULTS" || true)
pass=$(grep -c '"status":"PASS"' "$RESULTS" || true)
unv=$(grep -c '"status":"UNVERIFIED"' "$RESULTS" || true)
echo "WINDOW-MATRIX: PASS=$pass FAIL=$fails UNVERIFIED=$unv (نتایج: $RESULTS)"
echo "دروازهٔ manifest: node scripts/window-gate.mjs $RESULTS scripts/window-expected-cases.txt"
[[ "$fails" == "0" ]]
