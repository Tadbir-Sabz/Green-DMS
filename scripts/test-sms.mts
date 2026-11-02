/**
 * تست ارسال واقعی پیامک از درگاه پیکربندی‌شده در .env
 *
 *   npx tsx scripts/test-sms.mts [شماره-مقصد]
 *
 * شماره مقصد از آرگومان یا SMS_TEST_TO خوانده می‌شود. کلید API هرگز چاپ نمی‌شود؛
 * فقط وجود/نبودش و نتیجه ارسال گزارش می‌شود. خروجی غیرصفر یعنی ارسال انجام نشد.
 */
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { createSmsSender, HttpSmsSender, LogSmsSender } from '../apps/api/src/modules/identity-rbac/sms-sender';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });

const fail = (message: string): never => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

/** نمایش شماره با میان‌پنهان: 09123456789 → 0912***6789 */
const mask = (value: string): string =>
  value.length <= 7 ? value : `${value.slice(0, 5)}***${value.slice(-4)}`;

const gateway = (process.env.SMS_GATEWAY ?? 'generic').toLowerCase();
const sender = createSmsSender();

if (sender instanceof LogSmsSender) {
  fail(
    'SMS_PROVIDER=http نیست؛ پیام فقط در لاگ چاپ می‌شود. برای تست واقعی SMS_PROVIDER=http و ' +
      `SMS_GATEWAY=${gateway} و SMS_API_KEY را در .env تنظیم کنید.`,
  );
}
if (!(sender instanceof HttpSmsSender)) fail('درگاه ناشناخته ساخته شد.');

const key = process.env.SMS_API_KEY?.trim();
const to = process.argv[2] ?? process.env.SMS_TEST_TO?.trim();

const required: [string, string][] =
  gateway === 'farapayamak'
    ? [['SMS_USERNAME', 'نام کاربری پنل'], ['SMS_PASSWORD', 'رمز پنل']]
    : gateway === 'generic'
      ? [['SMS_API_URL', 'نشانی درگاه']]
      : [['SMS_API_KEY', 'کلید API']];

// همه کمبودها یک‌جا گزارش می‌شوند تا یک بار همه خطوط را پر کنید
const missing: string[] = [];
if (!to) missing.push('شماره مقصد (آرگومان یا SMS_TEST_TO در .env)');
for (const [name, hint] of required) {
  if (!process.env[name]?.trim()) missing.push(`${name} (${hint})`);
}
if (missing.length) {
  fail(
    `این موارد در .env تنظیم نیست:\n  - ${missing.join('\n  - ')}\n(راهنما: بخش پیامک در .env.example)`,
  );
}

const message = {
  to,
  body: `کد آزمایشی GreenDMS: 864207 — ارسال تست درگاه (${gateway}). این کد را در اختیار کسی قرار ندهید.`,
  username: 'sms_test',
  purpose: 'device_bind',
};

console.log(`درگاه: ${gateway}`);
console.log(`کلید API: ${key ? `تنظیم شده (${key.length} کاراکتر)` : 'تنظیم نشده'}`);
console.log(`مقصد: ${mask(to)}`);
console.log(`متن: ${message.body}`);

const startedAt = Date.now();
try {
  await sender.send(message);
  console.log(`✓ ارسال موفق در ${Date.now() - startedAt} میلی‌ثانیه — پیام را روی گوشی ${mask(to)} چک کنید.`);
} catch (err) {
  fail(`ارسال ناموفق پس از ${Date.now() - startedAt} میلی‌ثانیه — ${(err as Error).message}`);
}
