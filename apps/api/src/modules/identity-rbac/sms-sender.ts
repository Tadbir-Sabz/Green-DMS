/** پیام خروجی به درگاه پیامک — کد در body است؛ در دیتابیس ذخیره نمی‌شود */
export interface SmsMessage {
  /** شماره مقصد (مشتری یا کاربر) */
  to: string;
  /** متن نهایی پیام (شامل کد OTP) */
  body: string;
  username: string;
  purpose: string;
}

/**
 * درگاه ارسال پیامک (Port) — وابستگی‌زدایی از ارائه‌دهنده:
 * سرویس فقط این قرارداد را می‌شناسد و تعویض ارائه‌دهنده در DI انجام می‌شود
 * (`SMS_SENDER` در ماژول identity-rbac)؛ تست‌ها همین توکن را override می‌کنند.
 */
export interface SmsSender {
  send(message: SmsMessage): Promise<void>;
}

/**
 * قالب استاندارد فارسی پیامک OTP — با SMS_TEXT_TEMPLATE در .env قابل بازنویسی است
 * و placeholderهای آن {code} {minutes} {purpose} {brand} هستند.
 */
export const DEFAULT_SMS_TEMPLATE =
  '{brand}: کد {purpose} {code} است؛ تا {minutes} دقیقه معتبر است. کد را در اختیار کسی قرار ندهید.';

/** برچسب فارسی دلیل ارسال برای متن پیام (purpose خام هرگز به کاربر نمی‌رود) */
const PURPOSE_LABELS: Record<string, string> = {
  login: 'ورود',
  password_reset: 'بازیابی رمز',
  device_bind: 'اتصال دستگاه',
};

export interface OtpBodyInput {
  /** کد یک‌بارمصرف */
  code: string;
  /** عمر کد بر حسب ثانیه — به دقیقه برای متن تبدیل می‌شود */
  ttlSeconds: number;
  /** دلیل ارسال (login/password_reset/device_bind) */
  purpose: string;
}

/** ساخت متن فارسی پیامک از روی قالب — فقط همین‌جا متن نهاییِ حاوی کد ساخته می‌شود */
export const renderOtpBody = ({ code, ttlSeconds, purpose }: OtpBodyInput): string => {
  const values: Record<string, string> = {
    code,
    minutes: String(Math.max(1, Math.round(ttlSeconds / 60))),
    purpose: PURPOSE_LABELS[purpose] ?? purpose,
    brand: env('SMS_BRAND')?.trim() || 'GreenDMS',
  };
  return (env('SMS_TEXT_TEMPLATE') ?? DEFAULT_SMS_TEMPLATE).replace(
    /\{(code|minutes|purpose|brand)\}/g,
    (_match, key: string) => values[key] ?? '',
  );
};

/**
 * پاک‌سازی کد از هر متنی که به لاگ/پیام خطا می‌رود: دنبالهٔ ۴ رقمی و بیشتر
 * (کد OTP، شمارهٔ موبایل، شناسه بلند درگاه) مخفی می‌شود تا در لاگ نماند.
 */
export const redactCode = (text: string): string => text.replace(/\d{4,}/g, '••••');

/** درگاه پیش‌فرض توسعه/تست: فقط در لاگ کنسول — هزینه و شبکه ندارد */
export class LogSmsSender implements SmsSender {
  async send(message: SmsMessage): Promise<void> {
    // کد هرگز در لاگ نمی‌ماند؛ فقط SMS_LOG_CODE=true (توسعه محلی) متن کامل را چاپ می‌کند
    const body =
      (env('SMS_LOG_CODE') ?? '').toLowerCase() === 'true' ? message.body : redactCode(message.body);
    console.log(`[sms] to=${message.to} purpose=${message.purpose} | ${body}`);
  }
}

/** نوع درگاه ایرانیِ انتخابی با SMS_GATEWAY؛ generic برای سرویس‌دهنده سفارشیِ هم‌شکلِ قدیمی */
export type SmsGateway = 'generic' | 'kavenegar' | 'smsir' | 'ghasedak' | 'farapayamak';

const GATEWAYS: SmsGateway[] = ['generic', 'kavenegar', 'smsir', 'ghasedak', 'farapayamak'];

/** خطا در ارسال — پیام فارسی؛ هرگز کلید API یا نشانی حاوی کلید در پیام نمی‌آید */
const sendFailed = (detail: string): Error => new Error(`درگاه پیامک: ${detail}`);

const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

const gatewayOf = (): SmsGateway => {
  const raw = (env('SMS_GATEWAY') ?? 'generic').toLowerCase();
  const found = GATEWAYS.find((g) => g === raw);
  if (!found) {
    throw sendFailed(`SMS_GATEWAY نامعتبر است («${raw}»)؛ مقدار مجاز: ${GATEWAYS.join('، ')}.`);
  }
  return found;
};

/** خواندن پاسخ JSON بدون شکستن جریان اگر درگاه متن خالی/HTML برگرداند */
const readJson = async (res: Response): Promise<Record<string, unknown> | null> => {
  const text = await res.text().catch(() => '');
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
};

/**
 * درگاه HTTP — اتصال به درگاه‌های واقعی ایرانی از طریق SMS_GATEWAY:
 *
 * | درگاه      | شیوه احراز            | درخواست                                   | سیگنال موفقیت در بدنه      |
 * |------------|------------------------|-------------------------------------------|----------------------------|
 * | kavenegar  | کلید در مسیر URL       | GET با query (receptor/sender/message)    | return.status == 200       |
 * | smsir      | هدر X-API-KEY          | POST JSON (lineNumber/messageText/mobiles)| status == 1                |
 * | ghasedak   | هدر ApiKey             | POST JSON (lineNumber/receptor/message)   | IsSuccess == true          |
 * | farapayamak| کاربر/رمز در بدنه      | POST form (username/password/to/from/text)| RetStatus == 1             |
 * | generic    | Bearer (SMS_API_KEY)   | POST JSON (to/text/from) فقط کد HTTP      | فقط res.ok                |
 *
 * نکته مهم: درگاه‌های ایرانی خطای منطقی را با HTTP 200 برمی‌گردانند؛ پس فقط
 * بررسی `res.ok` خطا را بی‌صدا بلعیده و کد OTP هرگز به کاربر نمی‌رسد.
 * فعال‌سازی: SMS_PROVIDER=http به‌همراه SMS_GATEWAY و SMS_API_KEY (و SMS_FROM).
 */
export class HttpSmsSender implements SmsSender {
  async send(message: SmsMessage): Promise<void> {
    const gateway = gatewayOf();
    const apiKey = env('SMS_API_KEY');
    const from = env('SMS_FROM');

    const res = await this.request(gateway, message, { apiKey, from });

    // همه پیام‌های خطا پیش از پرتاب redact می‌شوند: برخی درگاه‌ها متنِ پیام را
    // در پاسخ خطا echo می‌کنند و بدون این کار کد OTP وارد لاگ سرور می‌شد
    if (!res.ok) {
      const body = await readJson(res);
      throw sendFailed(redactCode(this.describe(gateway, res.status, body)));
    }

    const body = await readJson(res);
    const failure = this.failureOf(gateway, body);
    if (failure) throw sendFailed(redactCode(failure));
  }

  /** ساخت درخواست مخصوص هر درگاه — نشانی پیش‌فرض با SMS_API_URL قابل بازنویسی است */
  private request(
    gateway: SmsGateway,
    message: SmsMessage,
    creds: { apiKey?: string; from?: string },
  ): Promise<Response> {
    const timeout = AbortSignal.timeout(Number(env('SMS_TIMEOUT_MS') ?? 10_000));

    const need = (key: string, hint: string): string => {
      const value = env(key);
      if (!value) throw sendFailed(`${key} تنظیم نیست (${hint}).`);
      return value;
    };

    switch (gateway) {
      case 'kavenegar': {
        const key = need('SMS_API_KEY', 'کلید API کاوه‌نگار در مسیر درخواست می‌نشیند');
        // کاوه‌نگار احراز را از مسیر URL می‌خواند؛ در SMS_API_URL می‌توان با {KEY}
        // جای کلید را نشان داد تا با جایگزینی نشانی، احراز از دست نرود
        const base =
          env('SMS_API_URL')?.replaceAll('{KEY}', key) ??
          `https://api.kavenegar.com/v1/${key}/sms/send.json`;
        const url = new URL(base);
        url.searchParams.set('receptor', message.to);
        if (creds.from) url.searchParams.set('sender', creds.from);
        url.searchParams.set('message', message.body);
        // پارامترها در query می‌مانند چون مستندات کاوه‌نگار GET/POST را هر دو می‌پذیرد
        return fetch(url, { method: 'GET', signal: timeout });
      }

      case 'smsir': {
        const key = need('SMS_API_KEY', 'کلید API سامانه SMS.ir در هدر X-API-KEY می‌رود');
        const url = env('SMS_API_URL') ?? 'https://api.sms.ir/v1/send/bulk';
        return fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': key },
          body: JSON.stringify({
            lineNumber: creds.from && /^\d+$/.test(creds.from) ? Number(creds.from) : creds.from,
            messageText: message.body,
            mobiles: [message.to],
          }),
          signal: timeout,
        });
      }

      case 'ghasedak': {
        const key = need('SMS_API_KEY', 'کلید ApiKey قاصدک در هدر ApiKey می‌رود');
        const url = env('SMS_API_URL') ?? 'https://gateway.ghasedak.me/rest/api/v1/WebService/SendSingleSMS';
        return fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ApiKey: key },
          body: JSON.stringify({
            lineNumber: creds.from ?? '',
            receptor: message.to,
            message: message.body,
          }),
          signal: timeout,
        });
      }

      case 'farapayamak': {
        // این درگاه به‌جای کلید، نام کاربری و رمز پنل را در بدنه می‌فرستد
        const username = need('SMS_USERNAME', 'نام کاربری پنل فراپیامک');
        const password = need('SMS_PASSWORD', 'رمز پنل فراپیامک');
        const url = env('SMS_API_URL') ?? 'https://rest.payamak-panel.com/api/SendSMS/SendSMS';
        return fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            username,
            password,
            to: message.to,
            from: creds.from ?? '',
            text: message.body,
            isflash: 'false',
          }).toString(),
          signal: timeout,
        });
      }

      case 'generic':
      default: {
        const url = need('SMS_API_URL', 'نشانی درگاه سفارشی');
        return fetch(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(creds.apiKey ? { authorization: `Bearer ${creds.apiKey}` } : {}),
          },
          body: JSON.stringify({
            to: message.to,
            text: message.body,
            ...(creds.from ? { from: creds.from } : {}),
          }),
          signal: timeout,
        });
      }
    }
  }

  /** بررسی سیگنال موفقیتِ داخلِ بدنه — null یعنی موفق */
  private failureOf(gateway: SmsGateway, body: Record<string, unknown> | null): string | null {
    if (!body) return 'پاسخ خالی از درگاه دریافت شد.';
    if ('raw' in body) return `پاسخ غیرمنتظره درگاه: ${String(body.raw).slice(0, 200)}`;

    switch (gateway) {
      case 'kavenegar': {
        const ret = body.return as { status?: number; message?: string } | undefined;
        if (!ret) return 'ساختار پاسخ کاوه‌نگار ناشناخته است.';
        return ret.status === 200 ? null : `کاوه‌نگار status=${ret.status} (${ret.message ?? '—'})`;
      }
      case 'smsir':
        return body.status === 1
          ? null
          : `SMS.ir status=${String(body.status)} (${String(body.message ?? '—')})`;
      case 'ghasedak':
        return body.IsSuccess === true
          ? null
          : `قاصدک StatusCode=${String(body.StatusCode)} (${String(body.Message ?? '—')})`;
      case 'farapayamak':
        return body.RetStatus === 1
          ? null
          : `فراپیامک RetStatus=${String(body.RetStatus)} (${String(body.StrRetStatus ?? '—')})`;
      default:
        return null; // حالت generic فقط به کد HTTP اعتماد می‌کند (قرارداد قدیمی)
    }
  }

  /** توضیح خطا برای کد HTTP ناموفق — بدون نشانی درخواست (حاوی کلید است) */
  private describe(
    gateway: SmsGateway,
    status: number,
    body: Record<string, unknown> | null,
  ): string {
    const detail =
      body && !('raw' in body)
        ? String(body.message ?? body.Message ?? body.StrRetStatus ?? '').slice(0, 160)
        : '';
    return `${gateway} پاسخ HTTP ${status}${detail ? `: ${detail}` : ''}`;
  }
}

/**
 * انتخاب درگاه در لحظه تزریق (useFactory در ماژول) — نه در لودِ ماژول،
 * چون dotenv در main.ts پس از import ماژول‌ها اجرا می‌شود.
 */
export const createSmsSender = (): SmsSender =>
  (process.env.SMS_PROVIDER ?? 'log') === 'http' ? new HttpSmsSender() : new LogSmsSender();
