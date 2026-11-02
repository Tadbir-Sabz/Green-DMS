"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.autoMigrateMode = void 0;
exports.prepareDatabase = prepareDatabase;
const node_child_process_1 = require("node:child_process");
const node_fs_1 = require("node:fs");
const node_path_1 = __importDefault(require("node:path"));
const pg_1 = __importDefault(require("pg"));
/**
 * اعمال خودکار مهاجرت‌ها پیش از بالا آمدن API — تا «مهاجرتِ اعمال‌نشده» هرگز
 * به شکل خطای 500 روی درخواست‌ها دیده نشود:
 *
 * - پیش‌فرض: `scripts/migrate.mjs up` همراه با خودِ برنامه اجرا می‌شود (همه‌چیز در همان
 *   ترتیب و با همان قواعدِ اسکریپت: تراکنش واحد، جدول schema_migrations و checksum).
 * - `AUTO_MIGRATE=false` فقط وضعیت را می‌خواند و هشدار می‌دهد (اجرای دستی با migrate up).
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
/** خواندن حالت از AUTO_MIGRATE؛ هر مقدار دیگری یعنی «اعمال کن» */
const autoMigrateMode = (raw) => raw && OFF_VALUES.has(raw.trim().toLowerCase()) ? 'check' : 'apply';
exports.autoMigrateMode = autoMigrateMode;
/** پیدا کردن scripts/migrate.mjs با بالا رفتن از cwd (هنگام اجرا cwd برابر apps/api است) */
const findMigrateScript = () => {
    let dir = process.cwd();
    for (let i = 0; i < 6; i += 1) {
        const candidate = node_path_1.default.join(dir, 'scripts', 'migrate.mjs');
        if ((0, node_fs_1.existsSync)(candidate))
            return candidate;
        const parent = node_path_1.default.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return null;
};
/** اجرای اسکریپت مهاجرت به‌صورت فرزنده‌ای و جمع‌آوری خروجی (stdout+stderr با هم) */
const runMigrateCli = (script, args) => new Promise((resolve, reject) => {
    const child = (0, node_child_process_1.spawn)(process.execPath, [script, ...args], {
        cwd: node_path_1.default.dirname(node_path_1.default.dirname(script)), // ریشهٔ پروژه (جایی که scripts/ است)
        env: process.env, // DATABASE_URL فعلی به فرزنده منتقل می‌شود
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });
    let out = '';
    child.stdout.on('data', (chunk) => (out += chunk.toString()));
    child.stderr.on('data', (chunk) => (out += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, out }));
});
/** چاپ خروجی اسکریپت با پیشوند [migrate] */
const logLines = (text) => {
    for (const line of text.split(/\r?\n/)) {
        if (line.trim())
            console.log(`[migrate] ${line}`);
    }
};
/**
 * خواندن تعداد مهاجرت‌های در انتظار از خروجی `status --json`
 * (خط JSON از میان بنرهای احتمالی محیط اجرا جدا می‌شود؛ null یعنی نتوانستیم بخوانیم)
 */
const readPendingCount = (out) => {
    const line = out.split(/\r?\n/).find((l) => l.trimStart().startsWith('{'));
    if (!line)
        return null;
    try {
        const parsed = JSON.parse(line);
        const pending = parsed.pending;
        return typeof pending === 'number' ? pending : null;
    }
    catch {
        return null;
    }
};
/**
 * آماده‌سازی پایگاه‌داده پیش از listen — خطاها را با پیام فارسی بالا می‌اندازد
 * تا فراخواننده (bootstrap) برنامه را متوقف کند.
 */
async function prepareDatabase() {
    const mode = (0, exports.autoMigrateMode)(process.env.AUTO_MIGRATE);
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
        throw new Error('DATABASE_URL تنظیم نیست؛ برنامه بالا نمی‌آید تا درخواست‌ها به 500 نخورند.');
    }
    const script = findMigrateScript();
    if (!script) {
        throw new Error('اسکریپت scripts/migrate.mjs پیدا نشد؛ اعمال مهاجرت‌ها ممکن نیست و برنامه بالا نمی‌آید.');
    }
    // قفل سراسری: چند نمونه هم‌زمان نباید یک مهاجرت را دوبار اجرا کنند
    const lock = new pg_1.default.Client({ connectionString: databaseUrl });
    try {
        await lock.connect();
    }
    catch (err) {
        throw new Error(`اتصال به پایگاه‌داده ناموفق نشد (${err.message.split('\n')[0]}); برنامه بالا نمی‌آید.`);
    }
    try {
        await lock.query(`set statement_timeout = '${LOCK_WAIT_SECONDS * 1000}'`);
        await lock.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
        if (mode === 'check') {
            const { code, out } = await runMigrateCli(script, ['status', '--json']);
            if (code !== 0)
                throw new Error(`خواندن وضعیت مهاجرت‌ها شکست خورد:\n${out}`);
            const pending = readPendingCount(out);
            if (pending === null) {
                console.warn(`[migrate] ⚠ وضعیت مهاجرت‌ها قابل خواندن نبود؛ دستی بررسی کنید:\n${out.trim()}`);
            }
            else if (pending > 0) {
                console.warn(`[migrate] ⚠ ${pending} مهاجرت در انتظار است و AUTO_MIGRATE خاموش است؛ ` +
                    'بدون اعمالشان بخشی از درخواست‌ها 500 می‌دهند. برای اعمال: node scripts/migrate.mjs up');
            }
            return;
        }
        const { code, out } = await runMigrateCli(script, ['up']);
        logLines(out);
        if (code !== 0) {
            throw new Error(`مهاجرت‌ها اعمال نشدند (کد ${code})؛ برنامه بالا نمی‌آید تا درخواست‌ها با 500 مواجه نشوند.\n${out.trim()}`);
        }
    }
    finally {
        try {
            await lock.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
        }
        catch {
            // اتصال از قبل قطع شده؛ نیازی به گزارش نیست
        }
        await lock.end().catch(() => undefined);
    }
}
