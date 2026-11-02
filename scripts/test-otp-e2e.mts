/**
 * تست end-to-end ورود OTP از طریق درگاه پیامک واقعی (HTTP):
 *
 *   مرحله ۱ — درخواست کد:   npx tsx scripts/test-otp-e2e.mts [--username admin] [--phone 0912...]
 *   مرحله ۲ — تأیید کد:     npx tsx scripts/test-otp-e2e.mts --code 123456 [--username admin]
 *
 * چه چیزی سنجیده می‌شود:
 *   ۱) پیش‌نیازها: SMS_PROVIDER=http + کلید درگاه (SMS_API_KEY برای kavenegar/smsir/ghasedak)،
 *      در دسترس بودن API و وجود شمارهٔ موبایلِ اولیه برای کاربر هدف
 *   ۲) POST /api/v1/auth/otp/request → 202 یعنی درگاه واقعاً پیام را پذیرفت
 *   ۳) POST /api/v1/auth/otp/verify  → 200 یعنی کدِ دریافتی از گوشی درست بود
 *   ۴) GET  /api/v1/auth/me با توکن صادرشده → 200 یعنی نشست واقعاً کار می‌کند
 *
 * امنیت: کلید API هرگز چاپ نمی‌شود (فقط طولش)، شماره‌ها ماسک می‌شوند و کد OTP فقط
 * از --code/SMS_TEST_CODE می‌آید تا در لاگ نماند. نتیجه با exit code غیرصفر گزارش می‌شود.
 */
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import pg from 'pg';
import { HttpSmsSender, LogSmsSender, createSmsSender } from '../apps/api/src/modules/identity-rbac/sms-sender';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

const fail = (message: string): never => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

const arg = (name: string): string | undefined => {
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  // شکل فاصله‌دار هم پذیرفته می‌شود: --code 123456
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  return undefined;
};

/** 09123456789 → 0912***6789 */
const mask = (value: string): string =>
  value.length <= 7 ? value : `${value.slice(0, 5)}***${value.slice(-4)}`;

const username = arg('username') ?? 'admin';
const code = arg('code') ?? process.env.SMS_TEST_CODE?.trim();
const phoneArg = arg('phone');
const API = process.env.API_URL ?? 'http://localhost:4000';
const API_BASE = `${API}/api/v1`;

const gateway = (process.env.SMS_GATEWAY ?? 'generic').toLowerCase();
const required: [string, string][] =
  gateway === 'farapayamak'
    ? [
        ['SMS_USERNAME', 'نام کاربری پنل فراپیامک'],
        ['SMS_PASSWORD', 'رمز پنل فراپیامک'],
      ]
    : gateway === 'generic'
      ? [['SMS_API_URL', 'نشانی درگاه سفارشی']]
      : [['SMS_API_KEY', `کلید API ${gateway}`]];

// ---------------- ۱) پیش‌نیازها ----------------
console.log(`درگاه: ${gateway} | API: ${API} | کاربر: ${username}`);
if ((process.env.SMS_PROVIDER ?? 'log') !== 'http') {
  fail('SMS_PROVIDER=http نیست؛ پیام فقط در لاگ چاپ می‌شود. در .env مقدار SMS_PROVIDER=http را بگذارید.');
}
const missing = required.filter(([name]) => !process.env[name]?.trim());
if (missing.length) {
  fail(
    `این موارد در .env تنظیم نیست:\n  - ${missing
      .map(([n, hint]) => `${n} (${hint})`)
      .join('\n  - ')}\n(کلید را خودتان در .env بگذارید؛ در چت لازم نیست و .env در git نیست)`,
  );
}
const sender = createSmsSender();
if (!(sender instanceof HttpSmsSender) || sender instanceof LogSmsSender) {
  fail('سازنده درگاه به HttpSmsSender نرسید.');
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? '', max: 1 });
const phoneOf = async (): Promise<string | null> => {
  const { rows } = await pool.query<{ phone: string }>(
    `select pp.phone
       from app_user u
       join person p on p.id = u.person_id
       join person_phone pp on pp.person_id = p.id
      where u.username = $1
      order by pp.is_primary desc, pp.id
      limit 1`,
    [username],
  );
  return rows[0]?.phone ?? null;
};

// API باید بالا باشد (درگاهِ خودِ API است، نه اسکریپت)
try {
  const health = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(3000) });
  if (!health.ok) fail(`API پاسخ ${health.status} داد (${API}/api/health).`);
} catch {
  fail(`API در ${API} در دسترس نیست؛ اول npm run dev:api را اجرا کنید.`);
}

// --phone: شمارهٔ اولیهٔ کاربر هدف را برای همین تست عوض می‌کند (دیتابیس محلی توسعه)
if (phoneArg) {
  const before = await phoneOf();
  await pool.query(
    `update person_phone set phone = $1
      where person_id = (select person_id from app_user where username = $2)
        and is_primary`,
    [phoneArg, username],
  );
  console.log(`شمارهٔ اولیهٔ «${username}»: ${before ? mask(before) : '—'} ← ${mask(phoneArg)}`);
}

const phone = await phoneOf();
if (!phone) {
  await pool.end();
  fail(`کاربر «${username}» شمارهٔ موبایل اولیه ندارد؛ با --phone 0912... شمارهٔ خود را ثبت کنید.`);
}
console.log(`مقصد پیامک (شماره اولیهٔ کاربر): ${mask(phone)}`);
const key = process.env.SMS_API_KEY ?? process.env.SMS_USERNAME;
if (key) console.log(`کلید درگاه: تنظیم شده (${key.trim().length} کاراکتر)`);

// ---------------- ۲) درخواست کد (ارسال واقعی) ----------------
if (!code) {
  const startedAt = Date.now();
  const res = await fetch(`${API_BASE}/auth/otp/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, purpose: 'login' }),
    signal: AbortSignal.timeout(15_000),
  });
  const elapsed = Date.now() - startedAt;
  if (res.status !== 202) {
    const body = await res.text().catch(() => '');
    await pool.end();
    fail(`درخواست کد پاسخ ${res.status} داد (${body.slice(0, 300)}) — ${elapsed} میلی‌ثانیه`);
  }
  console.log(`✓ درگاه درخواست را پذیرفت (202) در ${elapsed} میلی‌ثانیه — کد باید به ${mask(phone)} رسیده باشد.`);
  console.log(
    `مرحله بعد (ظرف ${process.env.OTP_TTL_SECONDS ?? 120} ثانیه؛ فاصلهٔ ارسال مجدد ${process.env.OTP_RESEND_SECONDS ?? 60} ثانیه):\n` +
      `  npx tsx scripts/test-otp-e2e.mts --code <کد-دریافتی> --username ${username}`,
  );
  await pool.end();
  process.exit(0);
}

// ---------------- ۳) تأیید کد ----------------
const verifyStartedAt = Date.now();
const verifyRes = await fetch(`${API_BASE}/auth/otp/verify`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username, code }),
  signal: AbortSignal.timeout(15_000),
});
const session = (await verifyRes.json().catch(() => ({}))) as {
  access_token?: string;
  user?: { username?: string };
  expires_in?: number;
};
if (verifyRes.status !== 200 || !session.access_token) {
  await pool.end();
  fail(
    `تأیید کد پاسخ ${verifyRes.status} داد در ${Date.now() - verifyStartedAt} میلی‌ثانیه — ${JSON.stringify(session).slice(0, 300)}`,
  );
}
console.log(
  `✓ کد تأیید شد و نشست صادر شد (${Date.now() - verifyStartedAt} میلی‌ثانیه) برای «${session.user?.username ?? username}»؛ عمر توکن ${session.expires_in ?? '—'} ثانیه.`,
);

// ---------------- ۴) نشست باید همان لحظه کار کند ----------------
const meRes = await fetch(`${API_BASE}/auth/me`, {
  headers: { authorization: `Bearer ${session.access_token}` },
  signal: AbortSignal.timeout(10_000),
});
const me = (await meRes.json().catch(() => ({}))) as {
  user?: { username?: string };
  roles?: string[];
  permissions?: string[];
};
if (meRes.status !== 200) {
  await pool.end();
  fail(`نشست صادرشده /auth/me را نگرفت (${meRes.status}) — ${JSON.stringify(me).slice(0, 200)}`);
}
console.log(
  `✓ /auth/me با همان توکن 200 داد: کاربر «${me.user?.username ?? '—'}»، نقش‌ها [${(me.roles ?? []).join(', ')}]، ${me.permissions?.length ?? 0} مجوز.`,
);
console.log('end-to-end کامل شد: درخواست ← ارسال واقعی ← دریافت کد روی گوشی ← تأیید ← نشست.');
await pool.end();
process.exit(0);
