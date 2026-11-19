#!/usr/bin/env bash
# S8-07 (R4): آزمونِ محدود و بدونِ PostgreSQL برای کمک‌های PID که P1/P2 از آن استفاده می‌کنند.
# همهٔ انتظارها سقف زمانی دارند؛ هیچ‌کدام بی‌نهایت منتظر نمی‌ماند.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=lib/window-pid.sh
source "$ROOT/scripts/lib/window-pid.sh"

T="$(mktemp -d)"
cleanup() { jobs -pr | xargs -r kill -KILL 2>/dev/null; rm -rf "$T"; }
trap cleanup EXIT

fails=0
ok()  { echo "PASS $1"; }
bad() { echo "FAIL $1"; fails=$((fails + 1)); }

# 1) فرایندِ زنده ⇒ زنده
sleep 60 & live=$!
if pid_alive "$live"; then ok "live pid is alive"; else bad "live pid reported dead"; fi

# 2) پس از KILL و reap ⇒ مرده، در مهلتِ محدود
kill -KILL "$live"; wait "$live" 2>/dev/null
if wait_pid_gone "$live" 5; then ok "killed+reaped pid gone within bound"; else bad "killed pid still alive after bound"; fi

# 3) PID خالی یا ناموجود ⇒ مرده
if pid_alive ""; then bad "empty pid reported alive"; else ok "empty pid is dead"; fi
if pid_alive 2147483646; then bad "nonexistent pid reported alive"; else ok "nonexistent pid is dead"; fi

# 4) زامبی (فرزندی که پدرش reap نمی‌کند) ⇒ مرده، نه زنده
bash -c 'sleep 0 & echo $! > "$1"; sleep 8' _ "$T/zombie.pid" & outer=$!
for _ in $(seq 1 50); do [[ -s "$T/zombie.pid" ]] && break; sleep 0.1; done
zp="$(cat "$T/zombie.pid" 2>/dev/null)"
sleep 1
st="$(sed -E 's/^.*\) //' "/proc/$zp/stat" 2>/dev/null | cut -d' ' -f1)"
if [[ "$st" == "Z" ]] && ! pid_alive "$zp"; then ok "zombie (state Z) treated as dead"; else bad "zombie state=${st:-none} alive=$(pid_alive "$zp" && echo yes || echo no)"; fi
kill -KILL "$outer" 2>/dev/null; wait "$outer" 2>/dev/null

# 5) مهلتِ محدود: فرایندِ زنده که نمی‌میرد ⇒ کد غیرصفر (نه انتظار بی‌نهایت)
sleep 60 & stuck=$!
start=$(date +%s)
if wait_pid_gone "$stuck" 2; then bad "wait_pid_gone returned success for a live process"; else ok "bounded wait returns failure for live process"; fi
elapsed=$(( $(date +%s) - start ))
if (( elapsed <= 6 )); then ok "bounded wait finished in ${elapsed}s"; else bad "bounded wait took ${elapsed}s"; fi
kill -KILL "$stuck" 2>/dev/null; wait "$stuck" 2>/dev/null

# 6) child_pid_of: آخرین رویدادِ شروعِ فرزند از لاگِ JSON
printf '%s\n' '{"event":"migrate_child_started","pid":1111}' '{"event":"x"}' '{"event":"migrate_child_started","pid":4242}' > "$T/log.jsonl"
if [[ "$(child_pid_of "$T/log.jsonl")" == "4242" ]]; then ok "child_pid_of returns latest child pid"; else bad "child_pid_of wrong"; fi
if [[ -z "$(child_pid_of "$T/absent.jsonl")" ]]; then ok "child_pid_of empty for missing log"; else bad "child_pid_of non-empty for missing log"; fi

echo "PID-HELPERS: fails=$fails"
[[ $fails -eq 0 ]]
