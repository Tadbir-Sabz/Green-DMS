#!/usr/bin/env bash
# S8-07 (R4): کمک‌های PID برای آزمون‌های P1/P2 پنجرهٔ مهاجرت (بدونِ PostgreSQL).
# منبعِ مشترک: scripts/test-migration-window.sh و scripts/test-window-pid-helpers.sh (آزمونِ محدودِ بدونِ DB).
# هیچ‌گاه از pg_stat_activity برای زنده‌بودنِ فرزند استفاده نمی‌شود: PostgreSQL تا پایانِ pg_sleep
# اتصالِ قطع‌شده را نمی‌بیند و همان ردیف را نشان می‌دهد.

# زنده‌بودنِ یک PID از /proc (زامبی = مرده). PID خالی یا ناموجود = مرده.
pid_alive() {
  local p="$1" st
  [[ -n "$p" && -r "/proc/$p/stat" ]] || return 1
  st="$(sed -E 's/^.*\) //' "/proc/$p/stat" 2>/dev/null | cut -d' ' -f1)"
  [[ -n "$st" && "$st" != "Z" ]]
}

# انتظارِ محدود (ثانیه) تا PID مرده شود؛ کد 0 یعنی مرده، کد ۱ یعنی پس از مهلت هنوز زنده است.
wait_pid_gone() {
  local p="$1" t="$2" i
  for ((i = 0; i < t; i++)); do
    pid_alive "$p" || return 0
    sleep 1
  done
  ! pid_alive "$p"
}

# PID فرزندِ مهاجرت از لاگِ JSON والد (رویدادِ migrate_child_started). خالی اگر نبود.
child_pid_of() { grep -o '"event":"migrate_child_started","pid":[0-9]*' "$1" 2>/dev/null | tail -n 1 | grep -o '[0-9]*$'; }
