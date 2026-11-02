import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createSmsSender,
  DEFAULT_SMS_TEMPLATE,
  HttpSmsSender,
  LogSmsSender,
  redactCode,
  renderOtpBody,
  type SmsMessage,
} from '../src/modules/identity-rbac/sms-sender';

/**
 * تست درگاه پیامک HTTP — بدون شبکه واقعی: سرور محلی پاسخ هر ارائه‌دهنده ایرانی را
 * شبیه‌سازی می‌کند تا هم شکل درخواست (هدر/query/بدنه) و هم «خطای منطقی داخل HTTP 200»
 * سنجیده شود؛ چون درگاه‌های ایرانی خطا را با status 200 برمی‌گردانند و بررسی فقط
 * res.ok باعث می‌شود کد OTP هرگز به کاربر نرسد.
 */

const ENV_KEYS = [
  'SMS_PROVIDER',
  'SMS_GATEWAY',
  'SMS_API_URL',
  'SMS_API_KEY',
  'SMS_FROM',
  'SMS_USERNAME',
  'SMS_PASSWORD',
  'SMS_TIMEOUT_MS',
  'SMS_TEXT_TEMPLATE',
  'SMS_BRAND',
  'SMS_LOG_CODE',
];

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

const message: SmsMessage = {
  to: '09121234567',
  body: 'کد ورود DMS: 864207',
  username: 'sms_user',
  purpose: 'login',
};

interface Captured {
  method?: string;
  url?: string;
  headers: IncomingMessage['headers'];
  raw: string;
}

interface Mock {
  /** نشانی کامل endpoint محلی (برای SMS_API_URL) */
  url: string;
  captured: Captured;
}

/** سرور محلی با پاسخ دلخواه؛ آرگومان برای هر درخواست وضعیت و بدنه می‌سازد */
const withMockGateway = async (
  handler: (req: IncomingMessage, res: ServerResponse, body: string) => void,
  run: (mock: Mock) => Promise<void>,
): Promise<void> => {
  let server: Server | undefined;
  const captured: Captured = { headers: {}, raw: '' };
  try {
    server = createServer((req, res) => {
      let raw = '';
      req.on('data', (chunk: string) => (raw += chunk));
      req.on('end', () => {
        captured.method = req.method;
        captured.url = req.url;
        captured.headers = req.headers;
        captured.raw = raw;
        handler(req, res, raw);
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    await run({ url: `http://127.0.0.1:${port}/send`, captured });
  } finally {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  }
};

const json = (res: ServerResponse, body: unknown, status = 200): void => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

describe('createSmsSender — انتخاب درگاه از env', () => {
  it('بدون SMS_PROVIDER درگاه لاگ می‌دهد و با http درگاه HTTP می‌دهد', () => {
    expect(createSmsSender()).toBeInstanceOf(LogSmsSender);
    process.env.SMS_PROVIDER = 'http';
    expect(createSmsSender()).toBeInstanceOf(HttpSmsSender);
  });

  it('SMS_GATEWAY نامعتبر خطای فارسی می‌دهد', async () => {
    process.env.SMS_PROVIDER = 'http';
    process.env.SMS_GATEWAY = 'ناموجود';
    await expect(new HttpSmsSender().send(message)).rejects.toThrow(/SMS_GATEWAY نامعتبر/);
  });
});

describe('kavenegar — کلید در مسیر و return.status در بدنه', () => {
  const configure = (base: string): void => {
    process.env.SMS_PROVIDER = 'http';
    process.env.SMS_GATEWAY = 'kavenegar';
    process.env.SMS_API_KEY = 'TEST_KEY_DO_NOT_LEAK';
    process.env.SMS_FROM = '10004346';
    process.env.SMS_API_URL = base;
  };

  it('پارامترها در query می‌روند و status=200 موفق است', async () => {
    await withMockGateway(
      (_req, res) =>
        json(res, { entries: [{ messageid: 1 }], return: { status: 200, message: 'Confirm' } }),
      async ({ url, captured }) => {
        configure(url);
        await new HttpSmsSender().send(message);

        expect(captured.method).toBe('GET');
        const parsed = new URL(String(captured.url), url);
        expect(parsed.searchParams.get('receptor')).toBe(message.to);
        expect(parsed.searchParams.get('sender')).toBe('10004346');
        expect(parsed.searchParams.get('message')).toBe(message.body);
      },
    );
  });

  it('خطای منطقی داخل HTTP 200 رد می‌شود (وگرنه کد OTP گم می‌شود)', async () => {
    await withMockGateway(
      (_req, res) => json(res, { return: { status: 400, message: 'پارامتر نامعتبر' } }),
      async ({ url }) => {
        configure(url);
        await expect(new HttpSmsSender().send(message)).rejects.toThrow(/status=400/);
      },
    );
  });

  it('کلید API در پیام خطا نمی‌آید', async () => {
    await withMockGateway(
      (_req, res) => json(res, { message: 'Unauthorized' }, 401),
      async ({ url }) => {
        configure(url);
        const err = await new HttpSmsSender().send(message).catch((e: Error) => e);
        expect((err as Error).message).toMatch(/HTTP 401/);
        expect((err as Error).message).not.toContain('TEST_KEY_DO_NOT_LEAK');
      },
    );
  });
});

describe('smsir — هدر X-API-KEY و status داخل بدنه', () => {
  const configure = (base: string): void => {
    process.env.SMS_PROVIDER = 'http';
    process.env.SMS_GATEWAY = 'smsir';
    process.env.SMS_API_KEY = 'SMSIR_KEY';
    process.env.SMS_FROM = '30004505000017';
    process.env.SMS_API_URL = base;
  };

  it('بدنه JSON و هدر درست ساخته می‌شود و status=1 موفق است', async () => {
    await withMockGateway(
      (_req, res) => json(res, { status: 1, message: 'موفق', data: { messageIds: [42] } }),
      async ({ url, captured }) => {
        configure(url);
        await new HttpSmsSender().send(message);

        expect(captured.headers['x-api-key']).toBe('SMSIR_KEY');
        expect(JSON.parse(captured.raw)).toEqual({
          lineNumber: 30004505000017,
          messageText: message.body,
          mobiles: [message.to],
        });
      },
    );
  });

  it('status غیر از 1 (مثلاً 116 شماره در بلک‌لیست) رد می‌شود', async () => {
    await withMockGateway(
      (_req, res) => json(res, { status: 116, message: 'شماره در لیست مسدود است' }),
      async ({ url }) => {
        configure(url);
        await expect(new HttpSmsSender().send(message)).rejects.toThrow(/status=116/);
      },
    );
  });

  it('پاسخ 401 بدون JSON هم پیام فارسی می‌دهد', async () => {
    await withMockGateway(
      (_req, res) => json(res, { status: 10, message: 'کلید نامعتبر' }, 401),
      async ({ url }) => {
        configure(url);
        await expect(new HttpSmsSender().send(message)).rejects.toThrow(/HTTP 401/);
      },
    );
  });
});

describe('ghasedak — هدر ApiKey و IsSuccess', () => {
  const configure = (base: string): void => {
    process.env.SMS_PROVIDER = 'http';
    process.env.SMS_GATEWAY = 'ghasedak';
    process.env.SMS_API_KEY = 'GHASEDAK_KEY';
    process.env.SMS_FROM = '210002100';
    process.env.SMS_API_URL = base;
  };

  it('IsSuccess=true موفق است', async () => {
    await withMockGateway(
      (_req, res) =>
        json(res, { IsSuccess: true, StatusCode: 200, Message: 'با موفقیت انجام شد' }),
      async ({ url, captured }) => {
        configure(url);
        await new HttpSmsSender().send(message);

        expect(captured.headers.apikey).toBe('GHASEDAK_KEY');
        expect(JSON.parse(captured.raw)).toEqual({
          lineNumber: '210002100',
          receptor: message.to,
          message: message.body,
        });
      },
    );
  });

  it('IsSuccess=false با شرح خطا رد می‌شود', async () => {
    await withMockGateway(
      (_req, res) => json(res, { IsSuccess: false, StatusCode: 400, Message: 'خط در ارسال' }),
      async ({ url }) => {
        configure(url);
        await expect(new HttpSmsSender().send(message)).rejects.toThrow(/StatusCode=400/);
      },
    );
  });
});

describe('farapayamak — کاربر/رمز در بدنه فرم', () => {
  const configure = (base: string): void => {
    process.env.SMS_PROVIDER = 'http';
    process.env.SMS_GATEWAY = 'farapayamak';
    process.env.SMS_USERNAME = 'panel_user';
    process.env.SMS_PASSWORD = 'panel_pass';
    process.env.SMS_FROM = '50001234';
    process.env.SMS_API_URL = base;
  };

  it('RetStatus=1 موفق است و فرم فرم‌شده می‌رود', async () => {
    await withMockGateway(
      (_req, res) => json(res, { Value: '1234', RetStatus: 1, StrRetStatus: 'Ok' }),
      async ({ url, captured }) => {
        configure(url);
        await new HttpSmsSender().send(message);

        expect(captured.headers['content-type']).toContain('application/x-www-form-urlencoded');
        const form = new URLSearchParams(captured.raw);
        expect(form.get('username')).toBe('panel_user');
        expect(form.get('password')).toBe('panel_pass');
        expect(form.get('to')).toBe(message.to);
        expect(form.get('from')).toBe('50001234');
        expect(form.get('text')).toBe(message.body);
      },
    );
  });

  it('RetStatus=0 رد می‌شود', async () => {
    await withMockGateway(
      (_req, res) => json(res, { RetStatus: 0, StrRetStatus: 'InvalidOriginator' }),
      async ({ url }) => {
        configure(url);
        await expect(new HttpSmsSender().send(message)).rejects.toThrow(/RetStatus=0/);
      },
    );
  });

  it('نبود SMS_USERNAME با پیام فارسی متوقف می‌شود', async () => {
    process.env.SMS_PROVIDER = 'http';
    process.env.SMS_GATEWAY = 'farapayamak';
    await expect(new HttpSmsSender().send(message)).rejects.toThrow(/SMS_USERNAME/);
  });
});

describe('generic — قرارداد قدیمی JSON با Bearer', () => {
  it('بدنه to/text/from و هدر authorization درست است', async () => {
    await withMockGateway(
      (_req, res) => json(res, { ok: true }),
      async ({ url, captured }) => {
        process.env.SMS_PROVIDER = 'http';
        process.env.SMS_API_URL = url;
        process.env.SMS_API_KEY = 'GENERIC_KEY';
        process.env.SMS_FROM = '10001234';
        await new HttpSmsSender().send(message);

        expect(captured.headers.authorization).toBe('Bearer GENERIC_KEY');
        expect(JSON.parse(captured.raw)).toEqual({
          to: message.to,
          text: message.body,
          from: '10001234',
        });
      },
    );
  });

  it('HTTP غیرمجاز رد می‌شود و کلید در پیام نیست', async () => {
    await withMockGateway(
      (_req, res) => json(res, { error: 'boom' }, 500),
      async ({ url }) => {
        process.env.SMS_PROVIDER = 'http';
        process.env.SMS_API_URL = url;
        process.env.SMS_API_KEY = 'GENERIC_KEY';
        const err = (await new HttpSmsSender().send(message).catch((e: Error) => e)) as Error;
        expect(err.message).toMatch(/HTTP 500/);
        expect(err.message).not.toContain('GENERIC_KEY');
      },
    );
  });

  it('بدون SMS_API_URL پیام راهنما می‌دهد', async () => {
    process.env.SMS_PROVIDER = 'http';
    await expect(new HttpSmsSender().send(message)).rejects.toThrow(/SMS_API_URL/);
  });
});

describe('قالب پیامک فارسی و پنهان‌سازی کد در لاگ', () => {
  it('قالب پیش‌فرض: کد با متن فارسی استاندارد، برچسب فارسی دلیل و مدت اعتبار', () => {
    expect(DEFAULT_SMS_TEMPLATE).toContain('{code}');
    expect(renderOtpBody({ code: '482913', ttlSeconds: 120, purpose: 'login' })).toBe(
      'GreenDMS: کد ورود 482913 است؛ تا 2 دقیقه معتبر است. کد را در اختیار کسی قرار ندهید.',
    );
  });

  it('هر سه دلیلِ auth برچسب فارسی می‌گیرند و عمر کد به دقیقه تبدیل می‌شود', () => {
    expect(renderOtpBody({ code: '111111', ttlSeconds: 120, purpose: 'password_reset' })).toContain(
      'کد بازیابی رمز',
    );
    expect(renderOtpBody({ code: '111111', ttlSeconds: 120, purpose: 'device_bind' })).toContain(
      'کد اتصال دستگاه',
    );
    expect(renderOtpBody({ code: '111111', ttlSeconds: 300, purpose: 'login' })).toContain(
      'تا 5 دقیقه',
    );
  });

  it('SMS_TEXT_TEMPLATE و SMS_BRAND قالب را بازنویسی می‌کنند', () => {
    process.env.SMS_TEXT_TEMPLATE = '{brand} [{purpose}] {code} ({minutes} دقیقه)';
    process.env.SMS_BRAND = 'سبز';
    expect(renderOtpBody({ code: '555123', ttlSeconds: 300, purpose: 'login' })).toBe(
      'سبز [ورود] 555123 (5 دقیقه)',
    );
  });

  it('LogSmsSender کد را در لاگ مخفی می‌کند و فقط با SMS_LOG_CODE=true متن کامل می‌دهد', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await new LogSmsSender().send(message);
      const logged = spy.mock.calls.map((call) => String(call[0])).join('\n');
      expect(logged).not.toContain('864207');
      expect(logged).toContain('••••');

      process.env.SMS_LOG_CODE = 'true';
      await new LogSmsSender().send(message);
      expect(String(spy.mock.calls.at(-1)?.[0])).toContain('864207');
    } finally {
      spy.mockRestore();
    }
  });

  it('redactCode فقط دنبالهٔ ۴ رقمی و بیشتر را مخفی می‌کند', () => {
    expect(redactCode('کد 864207 در پیام آمد')).toBe('کد •••• در پیام آمد');
    expect(redactCode('status=200 و ttl=120 دست‌نخورده می‌مانند')).toBe(
      'status=200 و ttl=120 دست‌نخورده می‌مانند',
    );
  });

  it('پاسخ خام درگاه که متن پیام را echo کرده در پیام خطا redact می‌شود', async () => {
    await withMockGateway(
      (_req, res) => {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<html>Rejected: ${message.body}</html>`);
      },
      async ({ url }) => {
        process.env.SMS_PROVIDER = 'http';
        process.env.SMS_GATEWAY = 'kavenegar';
        process.env.SMS_API_KEY = 'TEST_KEY_DO_NOT_LEAK';
        process.env.SMS_API_URL = url;
        const err = (await new HttpSmsSender().send(message).catch((e: Error) => e)) as Error;
        expect(err.message).toMatch(/پاسخ غیرمنتظره/);
        expect(err.message).not.toContain('864207');
        expect(err.message).toContain('••••');
      },
    );
  });
});
