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
 * TASK-15 — رگرسیونِ پایدار برایِ `docker/postgres-init/10-runtime-role.sh`.
 *
 * این فایل **خودِ اسکریپتِ مخزن** را با همان سازوکارِ entrypoint (bash + env) اجرا
 * می‌کند و نتیجه را از کاتالوگِ PostgreSQL می‌سنجد؛ یعنی آزمونِ رفتاری است، نه
 * تطبیقِ متن. با پیاده‌سازیِ قبلی (بدنهٔ `DO $$ … $$` با `:'role'`/`:'pass'`) این
 * آزمون‌ها **شکست می‌خوردند**، چون psql داخلِ بدنهٔ dollar-quoted هیچ متغیری را
 * جای‌گذاری نمی‌کند و اسکریپت با `syntax error at or near ":"` و کدِ خروجِ ۳ می‌مرد
 * ⇒ نقشِ زمانِ اجرا هرگز ساخته نمی‌شد و نخستین بوتِ پشته شکست می‌خورد.
 *
 * ایمنی: نقش‌ها با پسوندِ تصادفیِ یکتا ساخته می‌شوند (اجرایِ موازیِ CI تداخل نکند) و در
 * afterAll حذف می‌شوند. رمزها **ساختگی و یکبارمصرف‌اند** و هرگز رمزِ واقعی نیستند؛
 * درستیِ ذخیرهٔ رمز با بازسازیِ SCRAM-SHA-256/md5 در همین فایل اثبات می‌شود، بدونِ
 * اینکه رمز چاپ شود یا پیکربندیِ سرور عوض شود.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
config({ path: path.join(ROOT, '.env'), quiet: true });

const SCRIPT = path.join(ROOT, 'docker', 'postgres-init', '10-runtime-role.sh');
const PSQL = process.env.PSQL ?? 'psql';

const RUN = crypto.randomBytes(4).toString('hex');
const ROLE_NEW = `t15_init_role_${RUN}`;
const ROLE_EXISTING = `t15_pre_role_${RUN}`;
const ROLE_ARGV = `t15_argv_role_${RUN}`;
/** رمزِ بدقلقِ ساختگی: نقلِقولِ تکی، فاصله، $، بک‌اسلش و نقلِقولِ دوتایی */
const PW_NEW = `SyNth'p"$$ w\\ord-${RUN}`;
const PW_EXISTING = `plain-${RUN}`;
/** رمزِ بدقلقِ ساختگی برایِ آزمونِ نشتِ argv (هرگز رمزِ واقعی نیست) */
const PW_ARGV = `a'rg$$ v\\w"x-${RUN}`;

const adminUrl = new URL(process.env.DATABASE_URL ?? '');
const ADMIN_DB = adminUrl.pathname.replace(/^\//, '') || 'postgres';

/** اجرایِ واقعیِ اسکریپتِ مخزن؛ در صورتِ شکست همان خطایِ execFileSync پرتاب می‌شود */
function runScript(role: string, password: string, override: Record<string, string> = {}): string {
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
  return execFileSync('bash', [SCRIPT], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

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

describe('TASK-15 · اسکریپتِ نخستین بوتِ نقشِ زمانِ اجرا', () => {
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

  beforeAll(async () => {
    admin = new pg.Client({ connectionString: adminUrl.toString() });
    await admin.connect();
  });

  afterAll(async () => {
    for (const role of [...created, ROLE_NEW, ROLE_EXISTING, ROLE_ARGV]) {
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
    const { rows } = await admin.query(`select count(*)::int n from pg_roles where rolname = $1`, [
      ROLE_EXISTING,
    ]);
    expect(rows[0].n).toBe(1);
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

  it('F) رمز هرگز در آرگومانِ خطِ فرمانِ psql نیست (از راهِ env و \\getenv می‌رسد)', async () => {
    // TASK-16: `-v pass=...` رمز را در argv می‌گذاشت و argv رویِ لینوکس از راهِ
    // /proc/<pid>/cmdline برایِ همهٔ کاربرانِ محلی خواندنی است. حالا رمز export می‌شود
    // و psql آن را با \\getenv می‌خواند. این آزمون با یک wrapperِ واقعیِ psql آرگومان‌هایِ
    // واقعیِ فرآیند را ضبط می‌کند — نه تطبیقِ متنِ منبع.
    const realPsql = PSQL.includes('/') ? PSQL : execFileSync('which', ['psql'], { encoding: 'utf8' }).trim();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't16-psql-wrap-'));
    const log = path.join(dir, 'argv.log');
    fs.writeFileSync(
      path.join(dir, 'psql'),
      [
        '#!/bin/bash',
        `printf 'INVOCATION\\n' >> '${log}'`,
        `{ for a in "$@"; do printf '%s\\0' "$a"; done; printf '\\n'; } >> '${log}'`,
        `if [ -n "\${GREEN_DMS_RUNTIME_PASSWORD:-}" ]; then echo 'env-pass-present:yes' >> '${log}';`,
        `else echo 'env-pass-present:no' >> '${log}'; fi`,
        `exec '${realPsql}' "$@"`,
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
      const args = lines[0].split('\n')[0].split('\0').filter(Boolean);

      // ضدِ تهی‌بودن: wrapper واقعاً psql را دیده و آرگومان‌هایِ منتظره حاضرند
      expect(lines.length).toBeGreaterThan(0);
      expect(args.length).toBeGreaterThan(3);
      expect(args.join(' ')).toContain('ON_ERROR_STOP=1');
      expect(args.join(' ')).toContain('--username');

      // ⭐ خاصیتِ امنیتی: رمز در هیچ آرگومانی نیست و پرچمِ pass= هم وجود ندارد
      expect(args.some((a) => a.includes(PW_ARGV))).toBe(false);
      expect(args.some((a) => a.includes('pass=') || a.includes('role='))).toBe(false);
      expect(raw).not.toContain(PW_ARGV);
      // رمز از راهِ محیطِ فرآیند رسیده است (نه argv)
      expect(raw).toContain('env-pass-present:yes');

      // و مکانیزم واقعاً کار می‌کند: نقش ساخته شد و رمزِ ذخیره‌شده دقیقاً همان است
      expect((await roleRow(ROLE_ARGV))?.rolcanlogin).toBe(true);
      expect(storedPasswordMatches(await storedPassword(ROLE_ARGV), PW_ARGV, ROLE_ARGV)).toBe(true);
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
    expect(status, `اسکریپت باید با خطا خارج شود، نه صفر. خروجی: ${message.slice(0, 200)}`).not.toBe(0);
    const { rows } = await admin.query(`select count(*)::int n from pg_roles where rolname = $1`, [role]);
    expect(rows[0].n).toBe(0); // هیچ نقشی ساخته نشد ⇒ گزارشِ موفقِ کاذب نداریم
  });
});
