import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

/**
 * اعمال خودکار مهاجرت‌ها پیش از بالا آمدن API — تا «مهاجرتِ اعمال‌نشده» هرگز
 * به شکل خطای 500 روی درخواست‌ها دیده نشود:
 *
 * - پیش‌فرض: `scripts/migrate.mjs up` همراه با خودِ برنامه اجرا می‌شود؛ مهاجرتِ owner-دار (S8-07) در این مسیر
 *   هرگز اعمال نمی‌شود و فقط با scripts/db-window.mjs up ممکن است (DMS_MIGRATE_CALLER=api-auto). (همه‌چیز در همان
 *   ترتیب و با همان قواعدِ اسکریپت: تراکنش واحد، جدول schema_migrations و checksum).
 * - `AUTO_MIGRATE=false` فقط وضعیت را می‌خواند و هشدار می‌دهد (اجرای دستی: scripts/db-window.mjs up برای مهاجرت‌های مالکانه).
 * - شکست در اتصال یا اعمال مهاجرت ⇒ خطای روشن و خروج غیرصفر؛ برنامه بالا نمی‌آید،
 *   چون بالا آمدنِ نیمه‌کاره همان 500های بعدی است.
 * - با pg_advisory_lock جلوی اجرای هم‌زمان چند نمونه (مثلاً restart در nest --watch)
 *   در یک پایگاه‌داده گرفته می‌شود؛ هر تلاش حداکثر ۳۰ ثانیه صبر می‌کند.
 *
 * منطق اجرای SQL در اسکریپت مهاجرت می‌ماند (بدون دوباره‌کاری)؛ اینجا فقط راه‌اندازی،
 * قفل و گزارش فارسی آن انجام می‌شود.
 */

/** کلید قفل سراسری — ثابت تا همه نمونه‌ها روی همان قفل بروند */
const MIGRATION_LOCK_KEY = 773_412_091;
/** حداکثر انتظار برای گرفتن قفل (ثانیه) */
const LOCK_WAIT_SECONDS = 30;

const OFF_VALUES = new Set(['false', '0', 'off', 'no']);

export type AutoMigrateMode = 'apply' | 'check';

/** خواندن حالت از AUTO_MIGRATE؛ هر مقدار دیگری یعنی «اعمال کن» */
export const autoMigrateMode = (raw?: string): AutoMigrateMode =>
  raw && OFF_VALUES.has(raw.trim().toLowerCase()) ? 'check' : 'apply';

/** پیدا کردن scripts/migrate.mjs با بالا رفتن از cwd (هنگام اجرا cwd برابر apps/api است) */
const findMigrateScript = (): string | null => {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(dir, 'scripts', 'migrate.mjs');
    if (existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
};

/** اجرای اسکریپت مهاجرت به‌صورت فرزنده‌ای و جمع‌آوری خروجی (stdout+stderr با هم) */
const runMigrateCli = (
  script: string,
  args: string[],
): Promise<{ code: number; out: string }> =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: path.dirname(path.dirname(script)), // ریشهٔ پروژه (جایی که scripts/ است)
      // DATABASE_URL فعلی به فرزنده منتقل می‌شود. S8-07: فرزند با DMS_MIGRATE_CALLER=api-auto
      // بدانی می‌شود که مهاجرتِ owner-دار را هرگز اعمال نکند (حتی اگر پنجره باز باشد).
      env: { ...process.env, DMS_MIGRATE_CALLER: 'api-auto' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let out = '';
    child.stdout.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (out += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, out }));
  });

/** چاپ خروجی اسکریپت با پیشوند [migrate] */
const logLines = (text: string): void => {
  for (const line of text.split(/\r?\n/)) {
    if (line.trim()) console.log(`[migrate] ${line}`);
  }
};

/**
 * خواندن تعداد مهاجرت‌های در انتظار از خروجی `status --json`
 * (خط JSON از میان بنرهای احتمالی محیط اجرا جدا می‌شود؛ null یعنی نتوانستیم بخوانیم)
 */

/**
 * آماده‌سازی پایگاه‌داده پیش از listen — خطاها را با پیام فارسی بالا می‌اندازد
 * تا فراخواننده (bootstrap) برنامه را متوقف کند.
 */
export async function prepareDatabase(): Promise<void> {
  const mode = autoMigrateMode(process.env.AUTO_MIGRATE);

  // S8-06: حالت «check» (AUTO_MIGRATE خاموش) هیچ اتصالی به پایگاه‌داده نمی‌زند:
  // نه با DATABASE_URL (هویتِ مهاجرت/مدیریتی) و نه با هیچ هویتِ دیگری. API هنگامِ بوت
  // DDL نمی‌زند و به اعتبارنامهٔ مهاجرت نیاز ندارد. راستی‌آزماییِ مهاجرت/دفتر خارج از API
  // با scripts/db-window.mjs verify انجام می‌شود.
  if (mode === 'check') {
    console.warn(
      '[migrate] AUTO_MIGRATE خاموش است؛ وضعیت مهاجرت‌ها هنگامِ بوت بررسی نمی‌شود. ' +
        'راستی‌آزمایی: node scripts/db-window.mjs verify (مهاجرت: scripts/db-window.mjs up).',
    );
    return;
  }
  // اعمالِ خودکار هرگز در production مجاز نیست (همچنین در production-config اجباری است).
  // استثنا: پشتهٔ محلیِ throwaway که NODE_ENV=production دارد و DMS_ACCEPT_INSECURE_LOCAL_SETUP=true
  // (همان اذعانِ production-config) دارد. هرگز در production واقعی.
  const localThrowaway = (process.env.DMS_ACCEPT_INSECURE_LOCAL_SETUP ?? '').trim().toLowerCase() === 'true';
  if (process.env.NODE_ENV === 'production' && !localThrowaway) {
    throw new Error('AUTO_MIGRATE برای اعمال مهاجرت در production مجاز نیست (S8-06).');
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL تنظیم نیست؛ برنامه بالا نمی‌آید تا درخواست‌ها به 500 نخورند.');
  }

  const script = findMigrateScript();
  if (!script) {
    throw new Error(
      'اسکریپت scripts/migrate.mjs پیدا نشد؛ اعمال مهاجرت‌ها ممکن نیست و برنامه بالا نمی‌آید.',
    );
  }

  // قفل سراسری: چند نمونه هم‌زمان نباید یک مهاجرت را دوبار اجرا کنند
  const lock = new pg.Client({ connectionString: databaseUrl });
  try {
    await lock.connect();
  } catch (err) {
    throw new Error(
      `اتصال به پایگاه‌داده ناموفق نشد (${(err as Error).message.split('\n')[0]}); برنامه بالا نمی‌آید.`,
    );
  }

  try {
    await lock.query(`set statement_timeout = '${LOCK_WAIT_SECONDS * 1000}'`);
    await lock.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);

    const { code, out } = await runMigrateCli(script, ['up']);
    logLines(out);
    if (code !== 0) {
      throw new Error(
        `مهاجرت‌ها اعمال نشدند (کد ${code})؛ برنامه بالا نمی‌آید تا درخواست‌ها با 500 مواجه نشوند.\n${out.trim()}`,
      );
    }
  } finally {
    try {
      await lock.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    } catch {
      // اتصال از قبل قطع شده؛ نیازی به گزارش نیست
    }
    await lock.end().catch(() => undefined);
  }
}
