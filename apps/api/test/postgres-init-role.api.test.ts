import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';

/**
 * TASK-15/16/17 — رگرسیونِ پایدار برایِ `docker/postgres-init/10-runtime-role.sh`.
 *
 * این فایل **خودِ اسکریپتِ مخزن** را با همان سازوکارِ entrypoint (bash + env) اجرا
 * می‌کند و نتیجه را از کاتالوگِ PostgreSQL می‌سنجد؛ یعنی آزمونِ رفتاری است، نه
 * تطبیقِ متن. با پیاده‌سازیِ TASK-14 (بدنهٔ `DO $$ … $$` با `:'role'`/`:'pass'`) این
 * آزمون‌ها **شکست می‌خوردند**، چون psql داخلِ بدنهٔ dollar-quoted هیچ متغیری را
 * جای‌گذاری نمی‌کند ⇒ نخستین بوت می‌مرد.
 *
 * سه نقصِ پیاپی که اینجا پوشش داده شده:
 *   TASK-15: جای‌گذاریِ متغیر داخلِ بدنهٔ dollar-quoted ⇒ `syntax error at or near ":"`.
 *   TASK-16: `-v pass=…` رمز را در argv می‌گذاشت (از `/proc/<pid>/cmdline` برایِ همه
 *            خوانا). تستِ F.
 *   TASK-17: حتی بدونِ argv، `format('%L', password)` رمزِ **plaintext** را داخلِ متنِ
 *            دستورِ SQL می‌برد ⇒ با `log_statement=ddl/mod/all` عیناً در لاگِ سرور
 *            ثبت می‌شود و در تشخیصِ خطا هم ظاهر می‌شود. تست‌های G و H.
 *
 * ایمنی: نقش‌ها با پسوندِ تصادفیِ یکتا ساخته می‌شوند (اجرایِ موازیِ CI تداخل نکند) و در
 * afterAll حذف می‌شوند. رمزها **ساختگی و یکبارمصرف‌اند** و هرگز رمزِ واقعی نیستند؛
 * درستیِ ذخیرهٔ رمز با بازسازیِ SCRAM-SHA-256/md5 در همین فایل اثبات می‌شود، بدونِ
 * اینکه رمز چاپ شود یا پیکربندیِ سرور عوض شود.
 *
 * ⚠️ نکتهٔ مهم دربارهٔ تشخیصِ نشتی: PostgreSQL یک literalِ رشته‌ای را در شکلِ
 * `E'…'` با `'` دوتایی و `\` دوتایی ثبت می‌کند، پس `grep` رویِ **رمزِ خام** حتی وقتی
 * رمز در لاگ هست صفر می‌دهد (PASS کاذب). تابعِ `sqlSpellings()` همهٔ شکل‌ها را
 * برمی‌گرداند و هر ادعایِ «نشتی ندارد» باید همهٔ آن‌ها را بسنجد.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const SCRIPT = path.join(ROOT, 'docker', 'postgres-init', '10-runtime-role.sh');
const PSQL = process.env.PSQL ?? 'psql';

const RUN = crypto.randomBytes(4).toString('hex');
const ROLE_NEW = `t15_init_role_${RUN}`;
const ROLE_EXISTING = `t15_pre_role_${RUN}`;
const ROLE_ARGV = `t15_argv_role_${RUN}`;
const ROLE_SQL = `t17_sql_role_${RUN}`;
const ROLE_VULN = `t17_vuln_role_${RUN}`;
const ROLE_FAIL = `t17_fail_role_${RUN}`;
const ROLE_NEWLINE = `t17_newline_role_${RUN}`;
const ROLE_ENV = `t18_env_role_${RUN}`;
const ROLE_ENVVULN = `t18_envvuln_role_${RUN}`;
const ROLE_ALIAS = `t18_alias_role_${RUN}`;
const ROLE_COLL = `t18_coll_role_${RUN}`;
/** رمزِ بدقلقِ ساختگی: نقلِقولِ تکی، فاصله، $، بک‌اسلش و نقلِقولِ دوتایی */
const PW_NEW = `SyNth'p"$$ w\\ord-${RUN}`;
const PW_EXISTING = `plain-${RUN}`;
/** رمزِ بدقلقِ ساختگی برایِ آزمونِ نشتِ argv (هرگز رمزِ واقعی نیست) */
const PW_ARGV = `a'rg$$ v\\w"x-${RUN}`;
/** رمزِ بدقلقِ ساختگی برایِ آزمونِ نشتِ متنِ SQL */
const PW_SQL = `s'ql$$ t\\u"v-${RUN}`;
/** رمزِ بدقلقِ ساختگی برایِ آزمونِ محیطِ ارثیِ فرآیندهایِ فرزند */
const PW_ENV = `e'nv$$ q\\r"s-${RUN}`;
/** نام‌هایی که باید در محیطِ هیچ فرزندی حاضر نباشند */
const SECRET_VAR_NAMES = ['APP_DB_PASSWORD', 'RUNTIME_PASSWORD', 'GREEN_DMS_RUNTIME_PASSWORD'];

const ALL_ROLES = [
  ROLE_NEW,
  ROLE_EXISTING,
  ROLE_ARGV,
  ROLE_SQL,
  ROLE_VULN,
  ROLE_FAIL,
  ROLE_NEWLINE,
  ROLE_ENV,
  ROLE_ENVVULN,
  ROLE_ALIAS,
  ROLE_COLL,
];

const adminUrl = new URL(process.env.DATABASE_URL ?? '');
const ADMIN_DB = adminUrl.pathname.replace(/^\//, '') || 'postgres';

/**
 * ابزارهایِ مشاهدهٔ محیطِ فرآیند (TASK-18). در سطحِ ماژول تعریف شده‌اند تا تست‌هایِ J و K
 * از یک تعریفِ واحد استفاده کنند و ادعاهایشان قابلِ مقایسه بماند.
 */

/** مسیرِ مطلقِ یک executable از PATH (رشتهٔ خالی اگر نبود). */
function realBin(name: string): string {
  try {
    return execFileSync('bash', ['-c', `command -v ${name}`], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

/**
 * یک wrapperِ اجرایی می‌سازد که محیطِ **واقعیِ** خودش را از دو راهِ مستقل ثبت می‌کند
 * (`/proc/<pid>/environ` و `env`) و سپس باینریِ واقعی را با همان آرگومان‌ها و همان stdin
 * اجرا می‌کند. چون مسیرِ باینریِ واقعی مطلق است، wrapper بازگشتی به خودش ندارد.
 */
function writeEnvWrapper(dir: string, name: string, real: string, log: string): void {
  fs.writeFileSync(
    path.join(dir, name),
    [
      '#!/bin/bash',
      '{',
      `  printf 'PID %s\\n' "$$"`,
      `  echo 'ENVPROC-BEGIN'; tr '\\0' '\\n' < "/proc/$$/environ"; echo 'ENVPROC-END'`,
      `  echo 'ENVCMD-BEGIN'; env; echo 'ENVCMD-END'`,
      `} >> '${log}'`,
      `exec '${real}' "$@"`,
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
}

/** یک بخشِ برچسب‌دارِ BEGIN/END را از فایلِ ثبتِ wrapper بیرون می‌کشد. */
function envSection(file: string, begin: string, end: string): string[] {
  const out: string[] = [];
  let on = false;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line === begin) {
      on = true;
      continue;
    }
    if (line === end) {
      on = false;
      continue;
    }
    if (on) out.push(line);
  }
  return out;
}

/** نامِ متغیرهایی که مقدارشان دقیقاً برابرِ `value` است. مقدار هرگز چاپ نمی‌شود. */
function namesWithValue(lines: string[], value: string): string[] {
  return [
    ...new Set(
      lines
        .filter((l) => l.includes('='))
        .map((l) => ({ name: l.slice(0, l.indexOf('=')), value: l.slice(l.indexOf('=') + 1) }))
        .filter((kv) => kv.value === value)
        .map((kv) => kv.name),
    ),
  ];
}

/**
 * پوشهٔ wrapper می‌سازد و psql/cat/setsid را می‌پوشاند؛ `children` فقط فرزندانی را
 * برمی‌گرداند که واقعاً wrapper دارند، تا برایِ فرزندِ مشاهده‌نشده ادعایِ بی‌اساس نشود.
 */
function makeEnvWrappers(tag: string): {
  dir: string;
  logs: Record<string, string>;
  children: Array<[string, string]>;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `t18-${tag}-wrap-`));
  const logs: Record<string, string> = {
    psql: path.join(dir, 'psql.log'),
    cat: path.join(dir, 'cat.log'),
    setsid: path.join(dir, 'setsid.log'),
  };
  const children: Array<[string, string]> = [];
  const realPsql = PSQL.includes('/') ? PSQL : realBin('psql');
  if (realPsql) {
    writeEnvWrapper(dir, 'psql', realPsql, logs.psql);
    children.push(['psql', logs.psql]);
  }
  const realCat = realBin('cat');
  if (realCat) {
    writeEnvWrapper(dir, 'cat', realCat, logs.cat);
    children.push(['cat (جانشینیِ فرآیند)', logs.cat]);
  }
  const realSetsid = realBin('setsid');
  if (realSetsid) {
    writeEnvWrapper(dir, 'setsid', realSetsid, logs.setsid);
    children.push(['setsid', logs.setsid]);
  }
  return { dir, logs, children };
}

/** اجرایِ واقعیِ اسکریپت؛ در صورتِ شکست همان خطایِ execFileSync پرتاب می‌شود */
function runScript(
  role: string,
  password: string,
  override: Record<string, string> = {},
  script: string = SCRIPT,
): string {
  const binDir = path.dirname(PSQL);
  const basePath = binDir === '.' ? process.env.PATH ?? '' : `${binDir}:${process.env.PATH ?? ''}`;
  // PATHِ آزمون (مثلاً پوشهٔ wrapperِ psql) باید «پیش از» مسیرِ واقعی بنشیند، ولی نباید
  // بقیهٔ PATH را حذف کند وگرنه خودِ bash پیدا نمی‌شود.
  const { PATH: extraPath, ...rest } = override;
  const env = {
    ...process.env,
    PGHOST: adminUrl.hostname || '127.0.0.1',
    PGPORT: override.PGPORT ?? (adminUrl.port || '5432'),
    POSTGRES_USER: adminUrl.username || 'postgres',
    POSTGRES_DB: ADMIN_DB,
    APP_DB_ROLE: role,
    APP_DB_PASSWORD: password,
    ...(adminUrl.password ? { PGPASSWORD: decodeURIComponent(adminUrl.password) } : {}),
    ...rest,
    PATH: extraPath ? `${extraPath}:${basePath}` : basePath,
  };
  return execFileSync('bash', [script], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * همهٔ شکل‌هایی که یک رمز می‌تواند در متنِ SQL / لاگِ PostgreSQL ظاهر شود.
 * PostgreSQL literalها را با `E'…'` و نقلِقولِ دوتایی/بک‌اسلشِ دوتایی ثبت می‌کند، پس
 * سنجشِ فقط «رمزِ خام» PASS کاذب می‌دهد.
 */
function sqlSpellings(password: string): string[] {
  const bs = password.replace(/\\/g, '\\\\');
  const q = password.replace(/'/g, "''");
  const both = bs.replace(/'/g, "''");
  return [...new Set([password, bs, q, both])].filter((s) => s.length > 0);
}

/** هیچ شکلی از رمز در متن حاضر نباشد */
function expectNoPasswordSpelling(text: string, password: string, where: string): void {
  // QA-B3: پیامِ شکست هرگز خودِ رمز یا املايی از آن را ندارد — فقط نامِ محل، شمارهٔ
  // املا و قضاوت. آزمونِ N همین را به‌عنوانِ رگرسیون می‌سنجد.
  sqlSpellings(password).forEach((spelling, idx) => {
    expect(text.includes(spelling), `${where} شاملِ شکلِ #${idx} از رمز است (مقدار سرکوب شده)`).toBe(
      false,
    );
  });
}

/**
 * مکانیزمِ پیش از TASK-17 — فقط به‌عنوانِ **کنترلِ منفی**. رمز را با `format('%L')`
 * داخلِ متنِ دستور می‌برد؛ اگر آشکارسازِ تست واقعاً کار کند، این نسخه باید لو بدهد.
 */
const VULNERABLE_SCRIPT = [
  '#!/bin/bash',
  '# pre-TASK-17 mechanism — NEGATIVE CONTROL ONLY, never used to provision.',
  'set -euo pipefail',
  'RUNTIME_ROLE="${APP_DB_ROLE:-dms_app}"',
  'RUNTIME_PASSWORD="${APP_DB_PASSWORD:-dms_app_local}"',
  'export GREEN_DMS_RUNTIME_ROLE="$RUNTIME_ROLE"',
  'export GREEN_DMS_RUNTIME_PASSWORD="$RUNTIME_PASSWORD"',
  'psql -v ON_ERROR_STOP=1 \\',
  '     --username "$POSTGRES_USER" \\',
  "     --dbname \"$POSTGRES_DB\" <<'EOSQL'",
  '\\set QUIET on',
  '\\getenv role GREEN_DMS_RUNTIME_ROLE',
  '\\getenv pass GREEN_DMS_RUNTIME_PASSWORD',
  'select format(',
  "         case when exists (select 1 from pg_roles where rolname = :'role')",
  "              then 'alter role %I login password %L'",
  "              else 'create role %I login password %L'",
  '         end,',
  "         :'role',",
  "         :'pass'",
  '       ) as ddl',
  '\\gexec',
  'EOSQL',
  '',
].join('\n');

/**
 * نسخهٔ پیش از TASK-18 — فقط به‌عنوانِ **کنترلِ منفیِ محیطی**. رمز را به درستی از
 * راهِ stdin و `\password` می‌رساند (یعنی نشتیِ SQL/لاگ ندارد)، ولی
 * `APP_DB_PASSWORD`ِ به‌ارث‌رسیده از compose را از محیط حذف نمی‌کند، پس همهٔ
 * فرآیندهایِ فرزند آن را در `/proc/<pid>/environ` خود دارند.
 */
const PRE_TASK18_SCRIPT = [
  '#!/bin/bash',
  '# pre-TASK-18 shape — NEGATIVE CONTROL ONLY, never used to provision.',
  'set -euo pipefail',
  'RUNTIME_ROLE="${APP_DB_ROLE:-dms_app}"',
  'RUNTIME_PASSWORD="${APP_DB_PASSWORD:-dms_app_local}"',
  'export GREEN_DMS_RUNTIME_ROLE="$RUNTIME_ROLE"',
  "printf '%s\\n%s\\n' \"$RUNTIME_PASSWORD\" \"$RUNTIME_PASSWORD\" |",
  "  psql -v ON_ERROR_STOP=1 --username \"$POSTGRES_USER\" --dbname \"$POSTGRES_DB\" -f <(cat <<'EOSQL'",
  '\\set QUIET on',
  '\\getenv role GREEN_DMS_RUNTIME_ROLE',
  "select format(case when exists (select 1 from pg_roles where rolname = :'role')",
  "                   then 'alter role %I login' else 'create role %I login' end, :'role') as ddl",
  '\\gexec',
  '\\password :"role"',
  'EOSQL',
  ')',
  '',
].join('\n');

/**
 * نسخهٔ TASK-18 (دارایِ معافیتِ نامیِ `PGPASSWORD|PGPASSFILE`) — فقط به‌عنوانِ
 * **کنترلِ منفیِ QA-B1**. scrub را انجام می‌دهد ولی PGPASSWORDِ هم‌مقدار با رمز را
 * عمداً معاف می‌گذارد؛ اگر آشکارسازِ تست‌هایِ L واقعاً کار کند، این نسخه باید
 * رمز را در محیطِ فرزندِ psql لو بدهد.
 */
const PRE_T18R_SCRIPT = [
  '#!/bin/bash',
  '# TASK-18 shape with the unconditional PGPASSWORD|PGPASSFILE exemption — NEGATIVE',
  '# CONTROL ONLY (QA-B1), never used to provision.',
  'set -euo pipefail',
  'RUNTIME_ROLE="${APP_DB_ROLE:-dms_app}"',
  'RUNTIME_PASSWORD="${APP_DB_PASSWORD:-dms_app_local}"',
  'unset APP_DB_PASSWORD',
  'unset GREEN_DMS_RUNTIME_PASSWORD',
  'export -n RUNTIME_PASSWORD',
  'for _t18_var in $(compgen -e); do',
  '  case "$_t18_var" in',
  '    PGPASSWORD | PGPASSFILE) continue ;;',
  '  esac',
  '  if [ "${!_t18_var-}" = "$RUNTIME_PASSWORD" ]; then',
  '    export -n "$_t18_var"',
  '  fi',
  'done',
  'unset _t18_var',
  'export GREEN_DMS_RUNTIME_ROLE="$RUNTIME_ROLE"',
  "printf '%s\\n%s\\n' \"$RUNTIME_PASSWORD\" \"$RUNTIME_PASSWORD\" |",
  "  psql -v ON_ERROR_STOP=1 --username \"$POSTGRES_USER\" --dbname \"$POSTGRES_DB\" -f <(cat <<'EOSQL'",
  '\\set QUIET on',
  '\\getenv role GREEN_DMS_RUNTIME_ROLE',
  "select format(case when exists (select 1 from pg_roles where rolname = :'role')",
  "                   then 'alter role %I login' else 'create role %I login' end, :'role') as ddl",
  '\\gexec',
  '\\password :"role"',
  'EOSQL',
  ')',
  '',
].join('\n');

/**
 * کاوشگرِ «اثرِ درون‌فرآیندیِ scrub». اثرِ پاک‌سازی رویِ خودِ فرآیند فقط از **درونِ**
 * همان فرآیند قابلِ مشاهده است، زیرا `/proc/<pid>/environ` در لحظهٔ exec ثابت می‌شود و
 * تغییراتِ بعدیِ همان فرآیند را نشان نمی‌دهد. پس اسکریپتِ واقعیِ مخزن `source` می‌شود و
 * سپس برایِ هر متغیر گزارش می‌شود که (الف) هنوز وجود دارد یا نه و (ب) آیا صفتِ export
 * دارد یا نه. فقط نام و صفت چاپ می‌شود، هرگز مقدار.
 */
const COLL_PROBE = [
  '#!/bin/bash',
  'source "$T18_SCRIPT" >"$T18_OUT" 2>"$T18_ERR"; RC=$?',
  'set +e +u',
  "printf 'coll_exit %s\\n' \"$RC\"",
  'for v in APP_DB_PASSWORD GREEN_DMS_RUNTIME_PASSWORD RUNTIME_PASSWORD T18_UNRELATED_SETTING OTHER_KEEP; do',
  '  e=${!v+set}; e=${e:-unset}',
  '  d=$(declare -p "$v" 2>/dev/null || true)',
  '  case "$d" in *"declare -x"*) x=exported;; *) x=not-exported;; esac',
  "  printf 'coll %s %s %s\\n' \"$v\" \"$e\" \"$x\"",
  'done',
  "printf 'coll_child_visible %s\\n' \"$(env | grep -cE '^(APP_DB_PASSWORD|RUNTIME_PASSWORD|GREEN_DMS_RUNTIME_PASSWORD|T18_ALIAS_PW|T18_UNRELATED_SETTING)=' || true)\"",
  "printf 'coll_other_keep_visible %s\\n' \"$(env | grep -c '^OTHER_KEEP=' || true)\"",
  '',
].join('\n');

/**
 * اثباتِ رمزنگارانهٔ اینکه «دقیقاً همان رمز» ذخیره شده است — بدونِ چاپِ رمز و بدونِ
 * تغییرِ پیکربندیِ سرور: verifierِ SCRAM-SHA-256 (یا md5) از کاتالوگ خوانده و در
 * همین‌جا بازسازی می‌شود.
 */
function storedPasswordMatches(stored: string | null, password: string, role: string): boolean {
  if (!stored) return false;
  if (stored.startsWith('md5')) {
    return stored === `md5${crypto.createHash('md5').update(password + role).digest('hex')}`;
  }
  const m = /^SCRAM-SHA-256\$(\d+):([^$]+)\$([^:]+):(.+)$/.exec(stored);
  if (!m) return false;
  const [, iterations, saltB64, storedKeyB64, serverKeyB64] = m;
  const salt = Buffer.from(saltB64, 'base64');
  const salted = crypto.pbkdf2Sync(password, salt, Number(iterations), 32, 'sha256');
  const clientKey = crypto.createHmac('sha256', salted).update('Client Key').digest();
  const storedKey = crypto.createHash('sha256').update(clientKey).digest();
  const serverKey = crypto.createHmac('sha256', salted).update('Server Key').digest();
  return (
    storedKey.equals(Buffer.from(storedKeyB64, 'base64')) &&
    serverKey.equals(Buffer.from(serverKeyB64, 'base64'))
  );
}

describe('TASK-15/16/17 · اسکریپتِ نخستین بوتِ نقشِ زمانِ اجرا', () => {
  let admin: pg.Client;
  const created: string[] = [];

  const roleRow = async (role: string) => {
    const { rows } = await admin.query(
      `select rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
         from pg_roles where rolname = $1`,
      [role],
    );
    return rows[0] as
      | {
          rolname: string;
          rolcanlogin: boolean;
          rolsuper: boolean;
          rolbypassrls: boolean;
          rolcreatedb: boolean;
          rolcreaterole: boolean;
        }
      | undefined;
  };
  const storedPassword = async (role: string): Promise<string | null> => {
    const { rows } = await admin.query(`select rolpassword from pg_authid where rolname = $1`, [role]);
    return (rows[0]?.rolpassword as string | null) ?? null;
  };
  const roleCount = async (role: string): Promise<number> => {
    const { rows } = await admin.query(`select count(*)::int n from pg_roles where rolname = $1`, [role]);
    return rows[0].n as number;
  };

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl.toString() });
    await admin.connect();
  });

  afterAll(async () => {
    for (const role of [...created, ...ALL_ROLES]) {
      await admin.query(`drop role if exists "${role}"`).catch(() => undefined);
    }
    await admin.end().catch(() => undefined);
  });

  it('A/B) بوتِ تازه: نقش ساخته می‌شود، LOGIN دارد و هیچ امتیازِ ممتازی نمی‌گیرد', () => {
    const out = runScript(ROLE_NEW, PW_NEW);
    created.push(ROLE_NEW);
    expect(out).not.toContain(PW_NEW); // رمز هرگز در لاگ نیست
    return (async () => {
      const row = await roleRow(ROLE_NEW);
      expect(row, 'نقش باید ساخته شده باشد').toBeTruthy();
      expect(row?.rolcanlogin).toBe(true);
      expect(row?.rolsuper).toBe(false);
      expect(row?.rolbypassrls).toBe(false);
      expect(row?.rolcreatedb).toBe(false);
      expect(row?.rolcreaterole).toBe(false);
      expect(storedPasswordMatches(await storedPassword(ROLE_NEW), PW_NEW, ROLE_NEW)).toBe(true);
    })();
  });

  it('C) نقشِ از پیش موجودِ NOLOGIN (سناریویِ واقعیِ dms_app در 0041): LOGIN می‌گیرد، تکراری ساخته نمی‌شود و امتیازی اضافه نمی‌شود', async () => {
    // نقشِ NOLOGIN بدونِ رمز — دقیقاً همان چیزی که مهاجرتِ 0041 برایِ dms_app می‌سازد
    await admin.query(
      `create role "${ROLE_EXISTING}" nologin nosuperuser nobypassrls nocreatedb nocreaterole`,
    );
    created.push(ROLE_EXISTING);
    expect((await roleRow(ROLE_EXISTING))?.rolcanlogin).toBe(false);

    runScript(ROLE_EXISTING, PW_EXISTING);
    const first = await roleRow(ROLE_EXISTING);
    expect(first?.rolcanlogin).toBe(true);
    expect(first?.rolsuper).toBe(false);
    expect(first?.rolbypassrls).toBe(false);

    // اجرایِ دوم ⇒ idempotent: بدونِ نقشِ تکراری و بدونِ خطا
    const out2 = runScript(ROLE_EXISTING, PW_EXISTING);
    expect(out2).not.toContain(PW_EXISTING);
    expect(await roleCount(ROLE_EXISTING)).toBe(1);
    expect((await roleRow(ROLE_EXISTING))?.rolcreaterole).toBe(false);
    expect(storedPasswordMatches(await storedPassword(ROLE_EXISTING), PW_EXISTING, ROLE_EXISTING)).toBe(
      true,
    );
  });

  it('D) رمزِ بدقلق با نقلِقول، فاصله، $ و بک‌اسلش دقیقاً درست ذخیره می‌شود', async () => {
    expect(PW_NEW).toMatch(/['"\\ $]/); // خودِ آزمون هم بررسی می‌کند ورودی واقعاً بدقلق است
    expect(storedPasswordMatches(await storedPassword(ROLE_NEW), PW_NEW, ROLE_NEW)).toBe(true);
    const wrong = storedPasswordMatches(await storedPassword(ROLE_NEW), `${PW_NEW}x`, ROLE_NEW);
    expect(wrong).toBe(false); // تابعِ اثبات، تشخیصِ درست دارد (نه همیشه‌درست)
  });

  it('F) رمز هرگز در آرگومانِ خطِ فرمانِ psql نیست و در محیطِ فرآیندِ فرزند هم export نمی‌شود', async () => {
    // TASK-16: `-v pass=...` رمز را در argv می‌گذاشت و argv رویِ لینوکس از راهِ
    // /proc/<pid>/cmdline برایِ همهٔ کاربرانِ محلی خواندنی است.
    // TASK-17: رمز دیگر export هم نمی‌شود (هیچ فرآیندِ فرزندی به آن نیاز ندارد) و تنها
    // کانالِ رساندنِ آن به psql، stdinِ همان فرآیند است (برایِ دو promptِ \password).
    // این آزمون با یک wrapperِ واقعیِ psql آرگومان‌ها، محیط و stdinِ واقعیِ فرآیند را
    // ضبط می‌کند — نه تطبیقِ متنِ منبع.
    const realPsql = PSQL.includes('/') ? PSQL : execFileSync('which', ['psql'], { encoding: 'utf8' }).trim();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't17-psql-wrap-'));
    const log = path.join(dir, 'argv.log');
    const stdinLog = path.join(dir, 'stdin.log');
    fs.writeFileSync(
      path.join(dir, 'psql'),
      [
        '#!/bin/bash',
        `tmp="$(mktemp '${dir}/stdin.XXXXXX')"`,
        'cat > "$tmp"',
        '{',
        "  printf 'INVOCATION\\n'",
        "  for a in \"$@\"; do printf 'ARG %s\\n' \"$a\"; done",
        `  if [ -n "\${GREEN_DMS_RUNTIME_PASSWORD:-}" ]; then echo 'env-pass-present:yes';`,
        `  else echo 'env-pass-present:no'; fi`,
        `} >> '${log}'`,
        // stdin (کانالِ رمز) در فایلِ جداگانه تا argv.log عاری از رمز بماند
        `cat "$tmp" >> '${stdinLog}'`,
        `exec '${realPsql}' "$@" < "$tmp"`,
        '',
      ].join('\n'),
      { mode: 0o755 },
    );
    try {
      const out = runScript(ROLE_ARGV, PW_ARGV, { PATH: dir });
      created.push(ROLE_ARGV);
      expect(out).not.toContain(PW_ARGV);

      const raw = fs.readFileSync(log, 'utf8');
      const lines = raw.split('INVOCATION\n').filter((l) => l.trim().length > 0);
      const args = lines[0]
        .split('\n')
        .filter((l) => l.startsWith('ARG '))
        .map((l) => l.slice(4));

      // ضدِ تهی‌بودن: wrapper واقعاً psql را دیده و آرگومان‌هایِ منتظره حاضرند
      expect(lines.length).toBeGreaterThan(0);
      expect(args.length).toBeGreaterThan(3);
      expect(args.join(' ')).toContain('ON_ERROR_STOP=1');
      expect(args.join(' ')).toContain('--username');

      // ⭐ خاصیتِ امنیتی: رمز در هیچ آرگومانی نیست و پرچمِ pass= هم وجود ندارد
      expect(args.some((a) => a.includes(PW_ARGV))).toBe(false);
      expect(args.some((a) => a.includes('pass=') || a.includes('role='))).toBe(false);
      expect(raw).not.toContain(PW_ARGV);
      expectNoPasswordSpelling(raw, PW_ARGV, 'لاگِ argv');
      // TASK-17: رمز دیگر در محیطِ فرآیندِ فرزند نیست (پیش‌تر env-pass-present:yes بود؛
      // حذفِ export یک **سخت‌گیریِ بیشتر** است، نه تضعیف: یک کانالِ کمتر)
      expect(raw).toContain('env-pass-present:no');

      // کانالِ واقعیِ تحویل: stdinِ خودِ psql، دقیقاً دو بار (دو promptِ \password)
      const stdinLines = fs.readFileSync(stdinLog, 'utf8').split('\n');
      expect(stdinLines.filter((l) => l === PW_ARGV)).toHaveLength(2);

      // و مکانیزم واقعاً کار می‌کند: نقش ساخته شد و رمزِ ذخیره‌شده دقیقاً همان است
      expect((await roleRow(ROLE_ARGV))?.rolcanlogin).toBe(true);
      expect(storedPasswordMatches(await storedPassword(ROLE_ARGV), PW_ARGV, ROLE_ARGV)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('G) متنِ SQLِ ارسال‌شده به سرور هیچ رمزی ندارد (ECHO all) — با کنترلِ منفی', async () => {
    // TASK-17: پیش از این، `format('%L', password)` رمزِ plaintext را داخلِ متنِ دستور
    // می‌گذاشت؛ با log_statement=ddl/mod/all همان متن عیناً در لاگِ سرور ثبت می‌شود.
    //
    // `PSQLRC` با `\set ECHO all` باعث می‌شود psql هر دستوری را که **به سرور می‌فرستد**
    // چاپ کند (از جمله خروجیِ \gexec)، پس می‌توان متنِ واقعیِ SQL را بدونِ دسترسی به
    // لاگِ سرور دید. این آزمون در CI هم اجراشدنی است.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't17-psqlrc-'));
    const rc = path.join(dir, 'psqlrc');
    const vuln = path.join(dir, 'vulnerable-variant.sh');
    fs.writeFileSync(rc, '\\set ECHO all\n');
    fs.writeFileSync(vuln, VULNERABLE_SCRIPT, { mode: 0o755 });
    try {
      const out = runScript(ROLE_SQL, PW_SQL, { PSQLRC: rc });
      created.push(ROLE_SQL);

      // ضدِ تهی‌بودن: ECHO واقعاً فعال بوده و DDLِ نقش دیده می‌شود
      expect(out).toContain('create role');
      expect(out).toContain(ROLE_SQL);
      expect(out).toContain('login');

      // ⭐ خاصیتِ امنیتی: هیچ شکلی از رمز در متنِ SQL نیست
      expectNoPasswordSpelling(out, PW_SQL, 'متنِ SQLِ echo‌شده');
      // و خودِ DDLِ نقش هیچ بندِ password ندارد. (کلمهٔ «password» در پیامِ توضیحیِ
      // \echo خودِ اسکریپت هم هست، پس به‌جایِ کلِ خروجی، دقیقاً خطوطِ DDL سنجیده می‌شود.)
      const ddlLines = out
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => /^(create|alter)\s+role\b/i.test(l));
      expect(ddlLines.length, 'باید حداقل یک دستورِ create/alter role دیده شود').toBeGreaterThan(0);
      for (const line of ddlLines) expect(line.toLowerCase()).not.toContain('password');

      // مکانیزم کار می‌کند: نقش با LOGIN و بدونِ امتیاز، و verifierِ درست
      const row = await roleRow(ROLE_SQL);
      expect(row?.rolcanlogin).toBe(true);
      expect(row?.rolsuper).toBe(false);
      expect(row?.rolbypassrls).toBe(false);
      expect(row?.rolcreatedb).toBe(false);
      expect(row?.rolcreaterole).toBe(false);
      const stored = await storedPassword(ROLE_SQL);
      expect(stored?.startsWith('SCRAM-SHA-256$') ?? stored?.startsWith('md5')).toBe(true);
      expect(storedPasswordMatches(stored, PW_SQL, ROLE_SQL)).toBe(true);

      // ⭐ کنترلِ منفی: همان آشکارساز باید نسخهٔ پیش از TASK-17 را بگیرد، وگرنه ادعایِ
      // بالا بی‌معناست. توجه: شکلِ **فرارِ** رمز (`E'…''…\\\\…'`) پیدا می‌شود، نه خام.
      const vulnOut = runScript(ROLE_VULN, PW_SQL, { PSQLRC: rc }, vuln);
      created.push(ROLE_VULN);
      const escapedForm = PW_SQL.replace(/\\/g, '\\\\').replace(/'/g, "''");
      // شکلِ **فرار** (همان چیزی که واقعاً در متنِ SQL و در لاگ می‌نشیند) پیدا می‌شود
      // ⇒ آشکارسازِ بالا تهی نیست.
      expect(
        vulnOut.includes(escapedForm),
        'کنترلِ منفی: شکلِ فرارِ رمز باید در متنِ SQLِ نسخهٔ آسیب‌پذیر دیده شود',
      ).toBe(true);
      // و دقیقاً به همین دلیل سنجشِ «رمزِ خام» به‌تنهایی PASS کاذب می‌داد:
      expect(vulnOut.includes(PW_SQL)).toBe(false);
      expect(sqlSpellings(PW_SQL).some((s) => vulnOut.includes(s))).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('H) مسیرِ شکست: خطایِ واقعیِ سمتِ سرور ⇒ خروجِ غیرصفر، بدونِ نقش، و بدونِ هیچ رمزی در تشخیصِ خطا', async () => {
    // محرکِ **قطعی در هر محیطی**: با PGOPTIONS یک خطایِ واقعیِ SQL سمتِ سرور تولید
    // می‌شود (25006 «cannot execute CREATE ROLE in a read-only transaction»؛
    // `default_transaction_read_only` دارایِ context=user است، پس به هویتِ دوم یا
    // قاعدهٔ خاصی در pg_hba نیاز ندارد — در CI که اتصال از پلِ docker می‌آید و
    // scram لازم است هم کار می‌کند).
    //
    // اهمیتِ این مسیر: اگر رمز بخشی از متنِ دستور باشد، با
    // `log_min_error_statement=verbose` همان متن در لاگِ سرور بازتاب می‌یابد. آن سمت
    // (لاگِ سرور) در scripts/verify-init-credential-hygiene.sh با کنترلِ منفی سنجیده
    // می‌شود؛ اینجا آنچه در هر CI قابلِ سنجش است بررسی می‌شود: خروجِ غیرصفر، نبودِ
    // نقش (بدونِ موفقِ کاذب) و نبودِ هیچ شکلی از رمز در تشخیصِ خطایِ قابلِ مشاهده.
    let status = 0;
    let combined = '';
    try {
      runScript(ROLE_FAIL, PW_SQL, { PGOPTIONS: '-c default_transaction_read_only=on' });
    } catch (err) {
      const e = err as { status?: number; stderr?: string; stdout?: string; message?: string };
      status = e.status ?? -1;
      combined = `${e.stdout ?? ''}${e.stderr ?? ''}${e.message ?? ''}`;
    }
    expect(status, `باید با خطا خارج شود؛ خروجی سرکوب شد (${combined.length} نویسه)`).not.toBe(0);
    expect(await roleCount(ROLE_FAIL)).toBe(0); // موفقِ کاذب نداریم
    expect(combined).toMatch(/read-only transaction|25006/);
    expectNoPasswordSpelling(combined, PW_SQL, 'تشخیصِ خطا');
  });

  it('I) پیکربندیِ نامعتبر: رمزِ دارایِ خطِ جدید ⇒ ردِ fail-closed، بدونِ نقش', async () => {
    // \password خط‌به‌خط می‌خواند، پس رمزِ چندخطی نمی‌تواند سالم برسد. اسکریپت باید
    // **پیش از** هر کاری رد کند تا نقشِ بی‌رمز یا با رمزِ بریده ساخته نشود.
    let status = 0;
    let message = '';
    try {
      runScript(ROLE_NEWLINE, `bad\npass-${RUN}`);
    } catch (err) {
      const e = err as { status?: number; stderr?: string; message?: string };
      status = e.status ?? -1;
      message = `${e.stderr ?? ''}${e.message ?? ''}`;
    }
    expect(status, `باید رد شود؛ خروجی سرکوب شد (${message.length} نویسه)`).not.toBe(0);
    expect(message).toMatch(/newline|carriage return/i);
    expect(await roleCount(ROLE_NEWLINE)).toBe(0);
    expectNoPasswordSpelling(message, `bad\npass-${RUN}`, 'خروجیِ ردِ رمزِ چندخطی');
  });

  it('J) محیطِ ارثیِ همهٔ فرآیندهایِ فرزند: هیچ متغیری با مقدارِ رمز وجود ندارد', async () => {
    // TASK-18: پیش از این فقط GREEN_DMS_RUNTIME_PASSWORD سنجیده می‌شد، در حالی که
    // APP_DB_PASSWORDِ به‌ارث‌رسیده از docker compose هنوز در محیطِ psql (و setsid و
    // catِ جانشینیِ فرآیند) حاضر بود و از /proc/<pid>/environ خوانده می‌شد.
    // اینجا محیطِ **واقعیِ** هر فرزند از دو راهِ مستقل خوانده می‌شود —
    // /proc/<pid>/environِ خودِ فرزند و دستورِ env — و سپس مقدارِ **همهٔ** متغیرها با
    // رمز مقایسه می‌شود، نه فقط چند نامِ انتخابی. در صورتِ شکست، تنها «نامِ» متغیرها
    // چاپ می‌شود، هرگز مقدارشان.
    const { dir, logs, children } = makeEnvWrappers('env');
    expect(children.length, 'دستِ کم psql و cat باید wrapper داشته باشند').toBeGreaterThanOrEqual(2);

    try {
      const out = runScript(ROLE_ENV, PW_ENV, { PATH: dir });
      created.push(ROLE_ENV);
      expect(out).toContain('runtime role is ready for LOGIN');

      for (const [child, file] of children) {
        const proc = envSection(file, 'ENVPROC-BEGIN', 'ENVPROC-END');
        const cmd = envSection(file, 'ENVCMD-BEGIN', 'ENVCMD-END');
        // ضدِ تهی‌بودن: محیطِ واقعی خوانده شده باشد، وگرنه ادعاهایِ پایین بی‌معناست
        expect(proc.length, `محیطِ فرزندِ ${child} از /proc/<pid>/environ خوانده نشد`).toBeGreaterThan(5);
        expect(cmd.length, `محیطِ فرزندِ ${child} از env خوانده نشد`).toBeGreaterThan(5);
        // ⭐ خاصیتِ امنیتی: هیچ متغیری، با هر نامی، مقدارِ رمز را ندارد
        expect(namesWithValue(proc, PW_ENV), `${child}: /proc/<pid>/environ`).toEqual([]);
        expect(namesWithValue(cmd, PW_ENV), `${child}: env`).toEqual([]);
        for (const name of SECRET_VAR_NAMES) {
          expect(
            proc.some((l) => l.startsWith(`${name}=`)),
            `${child} هنوز ${name} را به ارث می‌برد`,
          ).toBe(false);
        }
      }

      // و مکانیزم هنوز درست کار می‌کند: LOGIN + verifierِ دقیقاً همان رمز
      expect((await roleRow(ROLE_ENV))?.rolcanlogin).toBe(true);
      expect(storedPasswordMatches(await storedPassword(ROLE_ENV), PW_ENV, ROLE_ENV)).toBe(true);

      // ⭐ کنترلِ منفی: همان آشکارساز باید نسخهٔ پیش از TASK-18 را بگیرد، وگرنه
      // ادعاهایِ بالا تهی‌اند.
      const pre = path.join(dir, 'pre-task18.sh');
      fs.writeFileSync(pre, PRE_TASK18_SCRIPT, { mode: 0o755 });
      for (const file of Object.values(logs)) fs.writeFileSync(file, '');
      runScript(ROLE_ENVVULN, PW_ENV, { PATH: dir }, pre);
      created.push(ROLE_ENVVULN);
      const leaky = namesWithValue(envSection(logs.psql, 'ENVPROC-BEGIN', 'ENVPROC-END'), PW_ENV);
      expect(
        leaky,
        'کنترلِ منفی: نسخهٔ پیش از TASK-18 باید رمز را در محیطِ فرزندِ psql لو می‌داد',
      ).toContain('APP_DB_PASSWORD');
      const leakyCat = namesWithValue(envSection(logs.cat, 'ENVPROC-BEGIN', 'ENVPROC-END'), PW_ENV);
      expect(leakyCat, 'کنترلِ منفی: helperِ جانشینیِ فرآیند هم باید لو می‌داد').toContain('APP_DB_PASSWORD');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('K) نام‌هایِ مستعارِ خصمانه و برخوردِ تصادفیِ مقدار: ایزولاسیون حفظ می‌شود و حالتِ بی‌ربط نابود نمی‌شود', async () => {
    // دو خاصیتِ مکملِ TASK-18:
    //  ۱) تغییرِ نام راه‌حل نیست: اگر فراخوان همان رمز را زیرِ نام‌هایِ دیگر export
    //     کرده باشد، هیچ فرزندی نباید آن را ببیند — نه با مقدار، نه با نام.
    //  ۲) تطبیق بر اساسِ مقدار ذاتاً مبهم است: یک متغیرِ **بی‌ربط** که اتفاقی همان
    //     رشته را دارد نباید نابود شود. پیاده‌سازی تنها صفتِ export را برمی‌دارد؛ این
    //     دقیقاً همان خاصیتِ امنیتی را می‌دهد (فرزند فقط مجموعهٔ export‌شده را به ارث
    //     می‌برد) بدونِ اینکه حالتِ بی‌ربطِ درونِ فرآیند از بین برود.
    const { dir, logs, children } = makeEnvWrappers('coll');
    const probe = path.join(dir, 'collprobe.sh');
    fs.writeFileSync(probe, COLL_PROBE, { mode: 0o755 });

    try {
      // --- ۱) نام‌هایِ مستعارِ خصمانه، دقیقاً به همان شکلی که یک فراخوانِ بدخواه
      //        یا یک env-file قدیمی می‌سازد.
      runScript(ROLE_ALIAS, PW_ENV, {
        PATH: dir,
        RUNTIME_PASSWORD: PW_ENV,
        GREEN_DMS_RUNTIME_PASSWORD: PW_ENV,
        T18_ALIAS_PW: PW_ENV,
      });
      created.push(ROLE_ALIAS);
      for (const [child, file] of children) {
        const proc = envSection(file, 'ENVPROC-BEGIN', 'ENVPROC-END');
        expect(proc.length, `محیطِ فرزندِ ${child} خوانده نشد`).toBeGreaterThan(5);
        expect(namesWithValue(proc, PW_ENV), `${child}: هیچ نامِ مستعاری نباید به فرزند برسد`).toEqual([]);
        for (const name of [...SECRET_VAR_NAMES, 'T18_ALIAS_PW']) {
          expect(
            proc.some((l) => l.startsWith(`${name}=`)),
            `${child} هنوز ${name} را به ارث می‌برد`,
          ).toBe(false);
        }
      }
      expect((await roleRow(ROLE_ALIAS))?.rolcanlogin).toBe(true);

      // --- ۲) برخوردِ تصادفیِ مقدار؛ اثرِ درون‌فرآیندی با source کردنِ اسکریپتِ
      //        واقعی مشاهده می‌شود (نه از راهِ /proc، که در لحظهٔ exec ثابت است).
      for (const file of Object.values(logs)) fs.writeFileSync(file, '');
      const out = execFileSync('bash', [probe], {
        env: {
          ...process.env,
          PGHOST: adminUrl.hostname || '127.0.0.1',
          PGPORT: adminUrl.port || '5432',
          POSTGRES_USER: adminUrl.username || 'postgres',
          POSTGRES_DB: ADMIN_DB,
          ...(adminUrl.password ? { PGPASSWORD: decodeURIComponent(adminUrl.password) } : {}),
          APP_DB_ROLE: ROLE_COLL,
          APP_DB_PASSWORD: PW_ENV,
          T18_UNRELATED_SETTING: PW_ENV,
          OTHER_KEEP: 'keepme',
          T18_SCRIPT: SCRIPT,
          T18_OUT: path.join(dir, 'probe.out'),
          T18_ERR: path.join(dir, 'probe.err'),
          PATH: `${path.dirname(PSQL)}:${process.env.PATH ?? ''}`,
        },
        encoding: 'utf8',
      });
      created.push(ROLE_COLL);
      const lines = out.split('\n');
      const field = (prefix: string, index: number): string => {
        const line = lines.find((l) => l.startsWith(prefix));
        return line ? (line.split(' ')[index] ?? '') : '';
      };
      expect(field('coll_exit ', 1), 'اجرایِ برخورد باید موفق بماند').toBe('0');
      expect(field('coll APP_DB_PASSWORD ', 2)).toBe('unset');
      expect(field('coll GREEN_DMS_RUNTIME_PASSWORD ', 2)).toBe('unset');
      expect([field('coll RUNTIME_PASSWORD ', 2), field('coll RUNTIME_PASSWORD ', 3)], [
        'RUNTIME_PASSWORD باید مقدارش را برایِ رساندن از stdin نگه دارد ولی export نباشد',
      ]).toEqual(['set', 'not-exported']);
      expect(
        [field('coll T18_UNRELATED_SETTING ', 2), field('coll T18_UNRELATED_SETTING ', 3)],
        'متغیرِ بی‌ربطِ هم‌مقدار باید مقدارش را نگه دارد و فقط export نباشد',
      ).toEqual(['set', 'not-exported']);
      expect(
        [field('coll OTHER_KEEP ', 2), field('coll OTHER_KEEP ', 3)],
        'متغیرِ بی‌ربطی که هم‌مقدار نیست باید کاملاً دست‌نخورده بماند',
      ).toEqual(['set', 'exported']);
      expect(field('coll_child_visible ', 1), 'هیچ متغیرِ رمزدار به فرزند نرسد').toBe('0');
      expect(field('coll_other_keep_visible ', 1), 'ضدِ تهی‌بودن: یک متغیرِ معمولی به فرزند می‌رسد').toBe('1');
      expect(storedPasswordMatches(await storedPassword(ROLE_COLL), PW_ENV, ROLE_COLL)).toBe(true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('E) پیکربندیِ نامعتبر ⇒ خروجِ غیرصفر و «موفقِ کاذب» نداریم', async () => {
    const role = `t15_unreachable_${RUN}`;
    let status = 0;
    let message = '';
    try {
      runScript(role, 'whatever', { PGPORT: '1' }); // پورتِ غیرممکن ⇒ psql وصل نمی‌شود
    } catch (err) {
      const e = err as { status?: number; stderr?: string; message?: string };
      status = e.status ?? -1;
      message = `${e.stderr ?? ''}${e.message ?? ''}`;
    }
    expect(status, `اسکریپت باید با خطا خارج شود، نه صفر. خروجی سرکوب شد (${message.length} نویسه)`).not.toBe(0);
    expect(await roleCount(role)).toBe(0); // هیچ نقشی ساخته نشد ⇒ گزارشِ موفقِ کاذب نداریم
  });

  it('L) ماتریسِ PGPASSWORD/PGPASSFILE (QA-B1): مقدارِ غیرهم‌مقدار حفظ می‌شود، مقدارِ هم‌مقدار هرگز به فرزند نمی‌رسد', async () => {
    // TASK-18R: معافیتِ نامیِ PGPASSWORD|PGPASSFILE حذف شد؛ قضاوت فقط بر اساسِ مقدار.
    //  - PGPASSWORD غیرهم‌مقدار ⇒ حفظ (احرازِ مشروعِ libpq دست‌نخورده) و هیچ متغیری هم‌مقدارِ رمزِ runtime نیست
    //  - PGPASSWORD هم‌مقدار ⇒ از محیطِ هر فرزند حذف
    //  - PGPASSFILE مسیرِ غیرهم‌مقدار ⇒ حفظ · PGPASSFILE هم‌مقدار ⇒ حذف
    //  - هر دو حاضر/هم‌مقدار ⇒ هر کدام مستقل و هیچ‌کدام دور زده نمی‌شوند
    // ردیف‌هایِ «متغیرِ بی‌ربطِ هم‌مقدار/غیرهم‌مقدار» در تستِ K و هارنسِ 3e پوشش دارند.
    // رمزهایِ نقش ساختگی‌اند؛ برایِ احرازِ واقعی در مسیرِ «حفظ»، همان credentialِ مدیرِ از
    // پیش‌موجودِ DATABASE_URL به‌کار می‌رود (هرگز چاپ نمی‌شود) — مسیرِ scramِ CI را هم می‌پوشاند.
    const { dir, logs, children } = makeEnvWrappers('pgpass');
    expect(children.length, 'psql و cat باید wrapper داشته باشند').toBeGreaterThanOrEqual(2);
    const DIFFERS = adminUrl.password
      ? decodeURIComponent(adminUrl.password)
      : `qa-pgpass-diff-${RUN}`;
    const PGFILE = path.join(dir, `pgpass-synth-${RUN}`);
    fs.writeFileSync(PGFILE, '', { mode: 0o600 });
    const PW_L = `q'a$$ g\\p"ss-${RUN}`;
    const reset = () => {
      for (const file of Object.values(logs)) fs.writeFileSync(file, '');
    };
    const assertClean = (label: string) => {
      for (const [child, file] of children) {
        const proc = envSection(file, 'ENVPROC-BEGIN', 'ENVPROC-END');
        expect(proc.length, `${label}: محیطِ ${child} خوانده نشد`).toBeGreaterThan(5);
        expect(namesWithValue(proc, PW_L), `${label}: ${child} نباید متغیرِ هم‌مقدارِ رمز داشته باشد`).toEqual([]);
      }
    };
    const hasVar = (file: string, name: string) =>
      envSection(file, 'ENVPROC-BEGIN', 'ENVPROC-END').some((l) => l.startsWith(`${name}=`));
    const tryRun = (role: string, override: Record<string, string>) => {
      try {
        runScript(role, PW_L, { PATH: dir, ...override });
      } catch {
        /* در پیکربندِ احرازِ رمزی (CI) نسخه‌هایِ هم‌مقدار fail-closed رد می‌شوند؛ سنجهٔ این‌جا محیط است */
      }
      created.push(role);
    };

    try {
      // L1 — PGPASSWORD differs ⇒ preserved، و مکانیزمِ init کامل کار می‌کند
      reset();
      runScript(`t18r_pg1_${RUN}`, PW_L, { PATH: dir, PGPASSWORD: DIFFERS });
      created.push(`t18r_pg1_${RUN}`);
      assertClean('L1');
      expect(hasVar(logs.psql, 'PGPASSWORD'), 'L1: PGPASSWORDِ غیرهم‌مقدار باید حفظ شود').toBe(true);
      expect((await roleRow(`t18r_pg1_${RUN}`))?.rolcanlogin).toBe(true);
      expect(storedPasswordMatches(await storedPassword(`t18r_pg1_${RUN}`), PW_L, `t18r_pg1_${RUN}`)).toBe(true);

      // L2 — PGPASSWORD collides ⇒ هیچ فرزندی آن را نمی‌بیند
      reset();
      tryRun(`t18r_pg2_${RUN}`, { PGPASSWORD: PW_L });
      assertClean('L2');
      expect(hasVar(logs.psql, 'PGPASSWORD'), 'L2: PGPASSWORDِ هم‌مقدار نباید به فرزند برسد').toBe(false);

      // L3 — PGPASSFILE with a non-colliding path ⇒ preserved
      reset();
      runScript(`t18r_pg3_${RUN}`, PW_L, { PATH: dir, PGPASSFILE: PGFILE });
      created.push(`t18r_pg3_${RUN}`);
      assertClean('L3');
      expect(hasVar(logs.psql, 'PGPASSFILE'), 'L3: مسیرِ غیرهم‌مقدارِ PGPASSFILE باید حفظ شود').toBe(true);

      // L4 — PGPASSFILE value collides ⇒ dropped
      reset();
      tryRun(`t18r_pg4_${RUN}`, { PGPASSFILE: PW_L });
      assertClean('L4');
      expect(hasVar(logs.psql, 'PGPASSFILE'), 'L4: PGPASSFILEِ هم‌مقدار نباید به فرزند برسد').toBe(false);

      // L5 — both present, judged independently
      reset();
      runScript(`t18r_pg5_${RUN}`, PW_L, { PATH: dir, PGPASSWORD: DIFFERS, PGPASSFILE: PW_L });
      created.push(`t18r_pg5_${RUN}`);
      assertClean('L5');
      expect(hasVar(logs.psql, 'PGPASSWORD'), 'L5: جزءِ غیرهم‌مقدار باید حفظ شود').toBe(true);
      expect(hasVar(logs.psql, 'PGPASSFILE'), 'L5: جزءِ هم‌مقدار باید حذف شود').toBe(false);

      // L6 — both collide ⇒ neither may bypass sanitization
      reset();
      tryRun(`t18r_pg6_${RUN}`, { PGPASSWORD: PW_L, PGPASSFILE: PW_L });
      assertClean('L6');
      expect(hasVar(logs.psql, 'PGPASSWORD'), 'L6: PGPASSWORD نباید دور زده شود').toBe(false);
      expect(hasVar(logs.psql, 'PGPASSFILE'), 'L6: PGPASSFILE نباید دور زده شود').toBe(false);

      // L7 — کنترلِ منفی: نسخهٔ TASK-18 با معافیتِ نامی باید لو بدهد، وگرنه L2/L6 تهی‌اند
      reset();
      const pre = path.join(dir, 'pre-t18r.sh');
      fs.writeFileSync(pre, PRE_T18R_SCRIPT, { mode: 0o755 });
      try {
        runScript(`t18r_pg7_${RUN}`, PW_L, { PATH: dir, PGPASSWORD: PW_L }, pre);
      } catch {
        /* fail-closed قابلِ قبول است */
      }
      created.push(`t18r_pg7_${RUN}`);
      const leaky = namesWithValue(envSection(logs.psql, 'ENVPROC-BEGIN', 'ENVPROC-END'), PW_L);
      expect(leaky, 'کنترلِ منفی: نسخهٔ TASK-18 (معافیتِ نامی) باید PGPASSWORDِ هم‌مقدار را لو بدهد').toContain(
        'PGPASSWORD',
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('M) ردِ رمزِ نادرست با SQLSTATE ساختاریافتهٔ 28P01 از libpq (نه متنِ محلی‌پذیر) + احرازِ موفق با رمزِ دقیق', async () => {
    // نیازمندِ احرازِ رمزی در کانالِ host است (CI: scram روی سرویسِ docker؛ محلی: قاعدهٔ
    // scram-sha-256 برایِ 127.0.0.1 روی کلاسترِ یک‌بارمصرفِ آزمون). رمزها ساختگی‌اند.
    const role = `t18r_auth28_${RUN}`;
    const pw = `m'28$$ q\\r"t-${RUN}`;
    runScript(role, pw);
    created.push(role);
    const conn = (password: string) =>
      new pg.Client({
        host: adminUrl.hostname || '127.0.0.1',
        port: Number(adminUrl.port || '5432'),
        user: role,
        password,
        database: ADMIN_DB,
      });
    const okc = conn(pw);
    await okc.connect();
    const { rows } = await okc.query('select rolsuper from pg_roles where rolname = current_user');
    expect(rows[0]?.rolsuper, 'نقش نباید superuser باشد').toBe(false);
    await okc.end();
    const badc = conn(`${pw}-wrong`);
    const err: unknown = await badc.connect().then(
      () => null,
      (e: unknown) => e,
    );
    expect(err, 'اتصال با رمزِ نادرست باید رد شود').toBeTruthy();
    expect((err as { code?: string }).code, 'SQLSTATE ردِ احراز باید 28P01 باشد').toBe('28P01');
  });

  it('N) پیامِ شکستِ تشخیص‌دهنده‌ها هیچ املايی از رمز را چاپ نمی‌کند (QA-B3)', () => {
    // آشکارساز عمداً با متنِ حاویِ رمز فعال می‌شود؛ پیامِ شکستِ آن نباید نه رمزِ خام را
    // داشته باشد و نه هیچ‌کدام از چهار املايِ SQL را.
    const text = `LOG: statement: create role x login password E'${PW_ENV.replace(/'/g, "''")}'`;
    let msg = '';
    try {
      expectNoPasswordSpelling(text, PW_ENV, 'meta-probe');
    } catch (e) {
      msg = String((e as Error)?.message ?? e);
    }
    expect(msg.length, 'تشخیص‌دهنده واقعاً باید شکست می‌خورد').toBeGreaterThan(0);
    expect(msg.includes(PW_ENV), 'پیام نباید رمزِ خام را داشته باشد').toBe(false);
    for (const s of sqlSpellings(PW_ENV)) {
      expect(msg.includes(s), 'پیام نباید هیچ املايی از رمز را داشته باشد').toBe(false);
    }
  });
});
