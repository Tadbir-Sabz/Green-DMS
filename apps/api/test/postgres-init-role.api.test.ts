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
const ROLE_CALLER = `t17_caller_role_${RUN}`;
const ROLE_NEWLINE = `t17_newline_role_${RUN}`;
/** رمزِ بدقلقِ ساختگی: نقلِقولِ تکی، فاصله، $، بک‌اسلش و نقلِقولِ دوتایی */
const PW_NEW = `SyNth'p"$$ w\\ord-${RUN}`;
const PW_EXISTING = `plain-${RUN}`;
/** رمزِ بدقلقِ ساختگی برایِ آزمونِ نشتِ argv (هرگز رمزِ واقعی نیست) */
const PW_ARGV = `a'rg$$ v\\w"x-${RUN}`;
/** رمزِ بدقلقِ ساختگی برایِ آزمونِ نشتِ متنِ SQL */
const PW_SQL = `s'ql$$ t\\u"v-${RUN}`;

const ALL_ROLES = [
  ROLE_NEW,
  ROLE_EXISTING,
  ROLE_ARGV,
  ROLE_SQL,
  ROLE_VULN,
  ROLE_FAIL,
  ROLE_CALLER,
  ROLE_NEWLINE,
];

const adminUrl = new URL(process.env.DATABASE_URL ?? '');
const ADMIN_DB = adminUrl.pathname.replace(/^\//, '') || 'postgres';

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
  for (const spelling of sqlSpellings(password)) {
    expect(text.includes(spelling), `${where} شاملِ شکلِ «${spelling}» از رمز است`).toBe(false);
  }
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

  it('H) مسیرِ شکست: خروجِ غیرصفر، بدونِ نقش، و بدونِ هیچ رمزی در تشخیصِ خطا', async () => {
    // فراخوانِ غیرِابرکاربر ⇒ CREATE ROLE با 42501 شکست می‌خورد. اگر رمز در متنِ دستور
    // باشد، `log_min_error_statement` و پیامِ خطایِ psql همان متن را بازتاب می‌دهند.
    await admin.query(`create role "${ROLE_CALLER}" login nosuperuser`);
    created.push(ROLE_CALLER);

    let status = 0;
    let combined = '';
    try {
      runScript(ROLE_FAIL, PW_SQL, { POSTGRES_USER: ROLE_CALLER, PGPASSWORD: '' });
    } catch (err) {
      const e = err as { status?: number; stderr?: string; stdout?: string; message?: string };
      status = e.status ?? -1;
      combined = `${e.stdout ?? ''}${e.stderr ?? ''}${e.message ?? ''}`;
    }
    expect(status, `باید با خطا خارج شود؛ خروجی: ${combined.slice(0, 200)}`).not.toBe(0);
    expect(await roleCount(ROLE_FAIL)).toBe(0); // موفقِ کاذب نداریم
    expect(combined).toMatch(/permission denied|must be superuser|42501/);
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
    expect(status, `باید رد شود؛ خروجی: ${message.slice(0, 200)}`).not.toBe(0);
    expect(message).toMatch(/newline|carriage return/i);
    expect(await roleCount(ROLE_NEWLINE)).toBe(0);
    expectNoPasswordSpelling(message, `bad\npass-${RUN}`, 'خروجیِ ردِ رمزِ چندخطی');
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
    expect(status, `اسکریپت باید با خطا خارج شود، نه صفر. خروجی: ${message.slice(0, 200)}`).not.toBe(0);
    expect(await roleCount(role)).toBe(0); // هیچ نقشی ساخته نشد ⇒ گزارشِ موفقِ کاذب نداریم
  });
});
