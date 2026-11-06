/**
 * اعتبارسنجیِ پیکربندیِ امنِ production (TASK-19 — Phase 2B).
 *
 * قاعده: در production هیچ «رمزِ جای‌نگه‌دار»، «پیش‌فرضِ توسعه» یا «پیکربندیِ
 * آشکارا ناامن»ی پذیرفته نمی‌شود؛ برنامه باید **fail-closed** بالا نیاید و
 * پیامِ فارسیِ روشن بدهد. هیچ مقدارِ رمزی در هیچ پیام/خطایی چاپ نمی‌شود — فقط
 * نامِ متغیرها.
 *
 * دو دریچهٔ صریح (هر دو فقط برایِ پشتهٔ محلی/CI و در اسنادِ production ممنوع):
 *   - DMS_ACCEPT_INSECURE_LOCAL_SETUP=true → همهٔ این بررسی‌ها با هشدارِ بلند رد می‌شوند
 *     (پشتهٔ docker-compose محلی که NODE_ENV=production دارد ولی throwaway است).
 *   - SMS_ALLOW_LOG_PROVIDER=true → فقط برایِ SMS_PROVIDER=log.
 *
 * این ماژول «فقط می‌خواند»؛ هیچ رمزی جایگزین/تولید/تغییر داده نمی‌شود (برخلافِ
 * رفتارِ dev که auth.config برایِ توسعه کلیدِ موقت می‌سازد).
 */

import { isProductionEnv, type EnvLike } from '../database/runtime-identity';

/** مقادیرِ شناخته‌شدهٔ جای‌نگه‌دار/پیش‌فرضِ توسعه — هرگز نباید به production برسند */
export const KNOWN_UNSAFE_SECRET_VALUES: readonly string[] = [
  'CHANGE_ME_IN_PRODUCTION',
  'CHANGE_ME',
  'CHANGE_ME_DB_PASSWORD',
  'CHANGE_ME_APP_PASSWORD',
  'CHANGE_ME_MINIO_SECRET',
  'REPLACE_WITH_RANDOM_64_CHARS',
  'REPLACE_WITH_RANDOM_SECRET',
  'changeme',
  'change_me',
  'change-me',
  'secret',
  'password',
  'dms',
  'dms_app_local',
  'minioadmin',
  'minio123',
  'ci_only_secret_not_for_production',
];

/** حداقلِ طولِ قابلِ قبولِ JWT_SECRET در production */
export const MIN_JWT_SECRET_LENGTH = 32;

const isKnownUnsafe = (value: string): boolean => {
  const v = value.trim().toLowerCase();
  return KNOWN_UNSAFE_SECRET_VALUES.some((k) => v === k.toLowerCase());
};

/** آیا رشتهٔ اتصال، رمزِ جای‌نگه‌دار/پیش‌فرض دارد؟ (بدونِ برگرداندنِ رمز) */
const urlPasswordUnsafe = (url: string | undefined | null): boolean => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    const pw = decodeURIComponent(parsed.password ?? '');
    return pw.length === 0 || isKnownUnsafe(pw);
  } catch {
    return true; // رشتهٔ اتصالِ نامعتبر هم خودش مشکل است (اینجا فقط نشانه‌گذاری)
  }
};

const urlUnparsable = (url: string | undefined | null): boolean => {
  if (!url) return false;
  try {
    new URL(url);
    return false;
  } catch {
    return true;
  }
};

const envBool = (v: string | undefined): boolean =>
  (v ?? '').trim().toLowerCase() === 'true';

/**
 * فهرستِ مشکلاتِ پیکربندیِ production (فارسی، بدونِ هیچ مقدارِ رمزی).
 * خالی یعنی سالم. بیرونِ از production همیشه خالی است (راحتیِ توسعه حفظ می‌شود).
 */
export function collectProductionConfigProblems(env: EnvLike = process.env): string[] {
  if (!isProductionEnv(env)) return [];
  const problems: string[] = [];
  const e = env as NodeJS.ProcessEnv;

  // --- JWT_SECRET ---
  const jwt = e.JWT_SECRET?.trim() ?? '';
  if (!jwt) {
    problems.push('JWT_SECRET در محیطِ production تنظیم نیست.');
  } else {
    if (isKnownUnsafe(jwt)) {
      problems.push(
        'JWT_SECRET یک مقدارِ جای‌نگه‌دار/پیش‌فرضِ توسعه است؛ مقدارِ تصادفیِ قوی (≥۳۲ بایت) تولید کنید.',
      );
    }
    if (jwt.length < MIN_JWT_SECRET_LENGTH) {
      problems.push(
        `JWT_SECRET کوتاه‌تر از ${MIN_JWT_SECRET_LENGTH} نویسه است؛ حداقل ${MIN_JWT_SECRET_LENGTH} نویسهٔ تصادفی لازم است.`,
      );
    }
    if (new Set(jwt).size < 6) {
      problems.push('JWT_SECRET تنوعِ نویسه‌ای ندارد (تکرارِ یک نویسه)؛ برایِ امضای توکن ناامن است.');
    }
  }

  // --- رشته‌های اتصالِ پایگاه‌داده ---
  for (const name of ['APP_DATABASE_URL', 'DATABASE_URL'] as const) {
    const value = e[name];
    if (!value) continue; // الزامِ APP_DATABASE_URL در runtime-identity بررسی می‌شود
    if (urlUnparsable(value)) {
      problems.push(`${name} یک URL معتبرِ postgres نیست.`);
    } else if (urlPasswordUnsafe(value)) {
      problems.push(
        `${name} رمزِ ندارد یا رمزش یک مقدارِ پیش‌فرضِ شناخته‌شده است؛ رمزِ قویِ تصادفی تنظیم کنید.`,
      );
    }
  }

  // --- SMS: در production نباید «ظاهرسازیِ ارسال» با لاگ اتفاق بیفتد ---
  const smsProvider = (e.SMS_PROVIDER ?? '').trim().toLowerCase();
  const smsIsLog = smsProvider === '' || smsProvider === 'log';
  if (smsIsLog) {
    if (!envBool(e.SMS_ALLOW_LOG_PROVIDER)) {
      problems.push(
        [
          'SMS_PROVIDER در production رویِ «log» است (یا ست نشده): کدهای OTP فقط در لاگ نوشته می‌شوند',
          'و هیچ پیامکی واقعاً ارسال نمی‌شود؛ برنامه نباید طوری رفتار کند که انگار تحویلِ OTP پیکربندی شده.',
          'اقدام: SMS_PROVIDER=http و SMS_GATEWAY + SMS_API_KEY (یا SMS_USERNAME/SMS_PASSWORD) را ست کنید،',
          'یا برایِ محیطِ غیرِواقعی (دمو/CI) به‌صورتِ صریح SMS_ALLOW_LOG_PROVIDER=true بگذارید.',
        ].join('\n'),
      );
    }
  } else if (smsProvider === 'http') {
    if (!(e.SMS_GATEWAY ?? '').trim()) {
      problems.push('SMS_PROVIDER=http است ولی SMS_GATEWAY تنظیم نیست.');
    }
    const hasApiKey = !!(e.SMS_API_KEY ?? '').trim();
    const hasUserPass = !!(e.SMS_USERNAME ?? '').trim() && !!(e.SMS_PASSWORD ?? '').trim();
    if (!hasApiKey && !hasUserPass) {
      problems.push(
        'درگاهِ پیامک کامل نیست: SMS_API_KEY یا جفتِ SMS_USERNAME/SMS_PASSWORD را تنظیم کنید.',
      );
    }
  }

  // --- درگاه PSP: فقط وقتی فعال است که endpoint ست باشد ---
  if ((e.PSP_ENDPOINT ?? '').trim()) {
    const wh = e.PSP_WEBHOOK_SECRET?.trim() ?? '';
    if (!wh || isKnownUnsafe(wh)) {
      problems.push(
        'PSP_ENDPOINT فعال است ولی PSP_WEBHOOK_SECRET تنظیم نیست یا مقدارِ جای‌نگه‌دار است؛ اعتبارسنجیِ HMAC وب‌هوک بی‌اثر می‌شود.',
      );
    }
  }

  // --- آبجکت‌استوریج: فقط وقتی endpoint ست باشد ---
  if ((e.MINIO_ENDPOINT ?? '').trim()) {
    if (!(e.MINIO_ACCESS_KEY ?? '').trim()) {
      problems.push('MINIO_ENDPOINT فعال است ولی MINIO_ACCESS_KEY تنظیم نیست.');
    }
    const sk = e.MINIO_SECRET_KEY?.trim() ?? '';
    if (!sk || isKnownUnsafe(sk)) {
      problems.push(
        'MINIO_ENDPOINT فعال است ولی MINIO_SECRET_KEY تنظیم نیست یا مقدارِ پیش‌فرضِ شناخته‌شده است.',
      );
    }
  }

  return problems;
}

/**
 * اجرایِ اعتبارسنجی در bootstrap: در production هر مشکل ⇒ throw (fail-closed)،
 * مگر DMS_ACCEPT_INSECURE_LOCAL_SETUP=true که فقط با هشدارِ بلند رد می‌شود
 * (پشتهٔ throwaway محلی/CI). بیرونِ از production هیچ کاری نمی‌کند.
 */
export function assertProductionConfig(env: EnvLike = process.env): void {
  const problems = collectProductionConfigProblems(env);
  if (problems.length === 0) return;

  if (envBool((env as NodeJS.ProcessEnv).DMS_ACCEPT_INSECURE_LOCAL_SETUP)) {
    console.warn(
      [
        '⚠ [config] DMS_ACCEPT_INSECURE_LOCAL_SETUP=true ⇒ مشکلاتِ پیکربندیِ امنیتیِ production نادیده گرفته شد',
        '(فقط برایِ پشتهٔ محلی/CI مجاز است؛ در استقرارِ واقعی هرگز ست نکنید):',
        ...problems.map((p) => `  - ${p}`),
      ].join('\n'),
    );
    return;
  }

  throw new Error(
    [
      'راه‌اندازی متوقف شد: پیکربندیِ production ناامن یا ناقص است (fail-closed).',
      ...problems.map((p) => `  - ${p}`),
      'راهنما: .env.production.example و docs/deploy/PRODUCTION_DEPLOYMENT.md',
      '(برایِ پشتهٔ throwaway محلی: DMS_ACCEPT_INSECURE_LOCAL_SETUP=true — هرگز در production).',
    ].join('\n'),
  );
}
