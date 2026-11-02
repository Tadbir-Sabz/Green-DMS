"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const node_http_1 = require("node:http");
const sms_sender_1 = require("../src/modules/identity-rbac/sms-sender");
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
(0, vitest_1.afterEach)(() => {
    for (const key of ENV_KEYS)
        delete process.env[key];
});
const message = {
    to: '09121234567',
    body: 'کد ورود DMS: 864207',
    username: 'sms_user',
    purpose: 'login',
};
/** سرور محلی با پاسخ دلخواه؛ آرگومان برای هر درخواست وضعیت و بدنه می‌سازد */
const withMockGateway = async (handler, run) => {
    let server;
    const captured = { headers: {}, raw: '' };
    try {
        server = (0, node_http_1.createServer)((req, res) => {
            let raw = '';
            req.on('data', (chunk) => (raw += chunk));
            req.on('end', () => {
                captured.method = req.method;
                captured.url = req.url;
                captured.headers = req.headers;
                captured.raw = raw;
                handler(req, res, raw);
            });
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        const { port } = server.address();
        await run({ url: `http://127.0.0.1:${port}/send`, captured });
    }
    finally {
        await new Promise((resolve) => (server ? server.close(() => resolve()) : resolve()));
    }
};
const json = (res, body, status = 200) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
};
(0, vitest_1.describe)('createSmsSender — انتخاب درگاه از env', () => {
    (0, vitest_1.it)('بدون SMS_PROVIDER درگاه لاگ می‌دهد و با http درگاه HTTP می‌دهد', () => {
        (0, vitest_1.expect)((0, sms_sender_1.createSmsSender)()).toBeInstanceOf(sms_sender_1.LogSmsSender);
        process.env.SMS_PROVIDER = 'http';
        (0, vitest_1.expect)((0, sms_sender_1.createSmsSender)()).toBeInstanceOf(sms_sender_1.HttpSmsSender);
    });
    (0, vitest_1.it)('SMS_GATEWAY نامعتبر خطای فارسی می‌دهد', async () => {
        process.env.SMS_PROVIDER = 'http';
        process.env.SMS_GATEWAY = 'ناموجود';
        await (0, vitest_1.expect)(new sms_sender_1.HttpSmsSender().send(message)).rejects.toThrow(/SMS_GATEWAY نامعتبر/);
    });
});
(0, vitest_1.describe)('kavenegar — کلید در مسیر و return.status در بدنه', () => {
    const configure = (base) => {
        process.env.SMS_PROVIDER = 'http';
        process.env.SMS_GATEWAY = 'kavenegar';
        process.env.SMS_API_KEY = 'TEST_KEY_DO_NOT_LEAK';
        process.env.SMS_FROM = '10004346';
        process.env.SMS_API_URL = base;
    };
    (0, vitest_1.it)('پارامترها در query می‌روند و status=200 موفق است', async () => {
        await withMockGateway((_req, res) => json(res, { entries: [{ messageid: 1 }], return: { status: 200, message: 'Confirm' } }), async ({ url, captured }) => {
            configure(url);
            await new sms_sender_1.HttpSmsSender().send(message);
            (0, vitest_1.expect)(captured.method).toBe('GET');
            const parsed = new URL(String(captured.url), url);
            (0, vitest_1.expect)(parsed.searchParams.get('receptor')).toBe(message.to);
            (0, vitest_1.expect)(parsed.searchParams.get('sender')).toBe('10004346');
            (0, vitest_1.expect)(parsed.searchParams.get('message')).toBe(message.body);
        });
    });
    (0, vitest_1.it)('خطای منطقی داخل HTTP 200 رد می‌شود (وگرنه کد OTP گم می‌شود)', async () => {
        await withMockGateway((_req, res) => json(res, { return: { status: 400, message: 'پارامتر نامعتبر' } }), async ({ url }) => {
            configure(url);
            await (0, vitest_1.expect)(new sms_sender_1.HttpSmsSender().send(message)).rejects.toThrow(/status=400/);
        });
    });
    (0, vitest_1.it)('کلید API در پیام خطا نمی‌آید', async () => {
        await withMockGateway((_req, res) => json(res, { message: 'Unauthorized' }, 401), async ({ url }) => {
            configure(url);
            const err = await new sms_sender_1.HttpSmsSender().send(message).catch((e) => e);
            (0, vitest_1.expect)(err.message).toMatch(/HTTP 401/);
            (0, vitest_1.expect)(err.message).not.toContain('TEST_KEY_DO_NOT_LEAK');
        });
    });
});
(0, vitest_1.describe)('smsir — هدر X-API-KEY و status داخل بدنه', () => {
    const configure = (base) => {
        process.env.SMS_PROVIDER = 'http';
        process.env.SMS_GATEWAY = 'smsir';
        process.env.SMS_API_KEY = 'SMSIR_KEY';
        process.env.SMS_FROM = '30004505000017';
        process.env.SMS_API_URL = base;
    };
    (0, vitest_1.it)('بدنه JSON و هدر درست ساخته می‌شود و status=1 موفق است', async () => {
        await withMockGateway((_req, res) => json(res, { status: 1, message: 'موفق', data: { messageIds: [42] } }), async ({ url, captured }) => {
            configure(url);
            await new sms_sender_1.HttpSmsSender().send(message);
            (0, vitest_1.expect)(captured.headers['x-api-key']).toBe('SMSIR_KEY');
            (0, vitest_1.expect)(JSON.parse(captured.raw)).toEqual({
                lineNumber: 30004505000017,
                messageText: message.body,
                mobiles: [message.to],
            });
        });
    });
    (0, vitest_1.it)('status غیر از 1 (مثلاً 116 شماره در بلک‌لیست) رد می‌شود', async () => {
        await withMockGateway((_req, res) => json(res, { status: 116, message: 'شماره در لیست مسدود است' }), async ({ url }) => {
            configure(url);
            await (0, vitest_1.expect)(new sms_sender_1.HttpSmsSender().send(message)).rejects.toThrow(/status=116/);
        });
    });
    (0, vitest_1.it)('پاسخ 401 بدون JSON هم پیام فارسی می‌دهد', async () => {
        await withMockGateway((_req, res) => json(res, { status: 10, message: 'کلید نامعتبر' }, 401), async ({ url }) => {
            configure(url);
            await (0, vitest_1.expect)(new sms_sender_1.HttpSmsSender().send(message)).rejects.toThrow(/HTTP 401/);
        });
    });
});
(0, vitest_1.describe)('ghasedak — هدر ApiKey و IsSuccess', () => {
    const configure = (base) => {
        process.env.SMS_PROVIDER = 'http';
        process.env.SMS_GATEWAY = 'ghasedak';
        process.env.SMS_API_KEY = 'GHASEDAK_KEY';
        process.env.SMS_FROM = '210002100';
        process.env.SMS_API_URL = base;
    };
    (0, vitest_1.it)('IsSuccess=true موفق است', async () => {
        await withMockGateway((_req, res) => json(res, { IsSuccess: true, StatusCode: 200, Message: 'با موفقیت انجام شد' }), async ({ url, captured }) => {
            configure(url);
            await new sms_sender_1.HttpSmsSender().send(message);
            (0, vitest_1.expect)(captured.headers.apikey).toBe('GHASEDAK_KEY');
            (0, vitest_1.expect)(JSON.parse(captured.raw)).toEqual({
                lineNumber: '210002100',
                receptor: message.to,
                message: message.body,
            });
        });
    });
    (0, vitest_1.it)('IsSuccess=false با شرح خطا رد می‌شود', async () => {
        await withMockGateway((_req, res) => json(res, { IsSuccess: false, StatusCode: 400, Message: 'خط در ارسال' }), async ({ url }) => {
            configure(url);
            await (0, vitest_1.expect)(new sms_sender_1.HttpSmsSender().send(message)).rejects.toThrow(/StatusCode=400/);
        });
    });
});
(0, vitest_1.describe)('farapayamak — کاربر/رمز در بدنه فرم', () => {
    const configure = (base) => {
        process.env.SMS_PROVIDER = 'http';
        process.env.SMS_GATEWAY = 'farapayamak';
        process.env.SMS_USERNAME = 'panel_user';
        process.env.SMS_PASSWORD = 'panel_pass';
        process.env.SMS_FROM = '50001234';
        process.env.SMS_API_URL = base;
    };
    (0, vitest_1.it)('RetStatus=1 موفق است و فرم فرم‌شده می‌رود', async () => {
        await withMockGateway((_req, res) => json(res, { Value: '1234', RetStatus: 1, StrRetStatus: 'Ok' }), async ({ url, captured }) => {
            configure(url);
            await new sms_sender_1.HttpSmsSender().send(message);
            (0, vitest_1.expect)(captured.headers['content-type']).toContain('application/x-www-form-urlencoded');
            const form = new URLSearchParams(captured.raw);
            (0, vitest_1.expect)(form.get('username')).toBe('panel_user');
            (0, vitest_1.expect)(form.get('password')).toBe('panel_pass');
            (0, vitest_1.expect)(form.get('to')).toBe(message.to);
            (0, vitest_1.expect)(form.get('from')).toBe('50001234');
            (0, vitest_1.expect)(form.get('text')).toBe(message.body);
        });
    });
    (0, vitest_1.it)('RetStatus=0 رد می‌شود', async () => {
        await withMockGateway((_req, res) => json(res, { RetStatus: 0, StrRetStatus: 'InvalidOriginator' }), async ({ url }) => {
            configure(url);
            await (0, vitest_1.expect)(new sms_sender_1.HttpSmsSender().send(message)).rejects.toThrow(/RetStatus=0/);
        });
    });
    (0, vitest_1.it)('نبود SMS_USERNAME با پیام فارسی متوقف می‌شود', async () => {
        process.env.SMS_PROVIDER = 'http';
        process.env.SMS_GATEWAY = 'farapayamak';
        await (0, vitest_1.expect)(new sms_sender_1.HttpSmsSender().send(message)).rejects.toThrow(/SMS_USERNAME/);
    });
});
(0, vitest_1.describe)('generic — قرارداد قدیمی JSON با Bearer', () => {
    (0, vitest_1.it)('بدنه to/text/from و هدر authorization درست است', async () => {
        await withMockGateway((_req, res) => json(res, { ok: true }), async ({ url, captured }) => {
            process.env.SMS_PROVIDER = 'http';
            process.env.SMS_API_URL = url;
            process.env.SMS_API_KEY = 'GENERIC_KEY';
            process.env.SMS_FROM = '10001234';
            await new sms_sender_1.HttpSmsSender().send(message);
            (0, vitest_1.expect)(captured.headers.authorization).toBe('Bearer GENERIC_KEY');
            (0, vitest_1.expect)(JSON.parse(captured.raw)).toEqual({
                to: message.to,
                text: message.body,
                from: '10001234',
            });
        });
    });
    (0, vitest_1.it)('HTTP غیرمجاز رد می‌شود و کلید در پیام نیست', async () => {
        await withMockGateway((_req, res) => json(res, { error: 'boom' }, 500), async ({ url }) => {
            process.env.SMS_PROVIDER = 'http';
            process.env.SMS_API_URL = url;
            process.env.SMS_API_KEY = 'GENERIC_KEY';
            const err = (await new sms_sender_1.HttpSmsSender().send(message).catch((e) => e));
            (0, vitest_1.expect)(err.message).toMatch(/HTTP 500/);
            (0, vitest_1.expect)(err.message).not.toContain('GENERIC_KEY');
        });
    });
    (0, vitest_1.it)('بدون SMS_API_URL پیام راهنما می‌دهد', async () => {
        process.env.SMS_PROVIDER = 'http';
        await (0, vitest_1.expect)(new sms_sender_1.HttpSmsSender().send(message)).rejects.toThrow(/SMS_API_URL/);
    });
});
(0, vitest_1.describe)('قالب پیامک فارسی و پنهان‌سازی کد در لاگ', () => {
    (0, vitest_1.it)('قالب پیش‌فرض: کد با متن فارسی استاندارد، برچسب فارسی دلیل و مدت اعتبار', () => {
        (0, vitest_1.expect)(sms_sender_1.DEFAULT_SMS_TEMPLATE).toContain('{code}');
        (0, vitest_1.expect)((0, sms_sender_1.renderOtpBody)({ code: '482913', ttlSeconds: 120, purpose: 'login' })).toBe('GreenDMS: کد ورود 482913 است؛ تا 2 دقیقه معتبر است. کد را در اختیار کسی قرار ندهید.');
    });
    (0, vitest_1.it)('هر سه دلیلِ auth برچسب فارسی می‌گیرند و عمر کد به دقیقه تبدیل می‌شود', () => {
        (0, vitest_1.expect)((0, sms_sender_1.renderOtpBody)({ code: '111111', ttlSeconds: 120, purpose: 'password_reset' })).toContain('کد بازیابی رمز');
        (0, vitest_1.expect)((0, sms_sender_1.renderOtpBody)({ code: '111111', ttlSeconds: 120, purpose: 'device_bind' })).toContain('کد اتصال دستگاه');
        (0, vitest_1.expect)((0, sms_sender_1.renderOtpBody)({ code: '111111', ttlSeconds: 300, purpose: 'login' })).toContain('تا 5 دقیقه');
    });
    (0, vitest_1.it)('SMS_TEXT_TEMPLATE و SMS_BRAND قالب را بازنویسی می‌کنند', () => {
        process.env.SMS_TEXT_TEMPLATE = '{brand} [{purpose}] {code} ({minutes} دقیقه)';
        process.env.SMS_BRAND = 'سبز';
        (0, vitest_1.expect)((0, sms_sender_1.renderOtpBody)({ code: '555123', ttlSeconds: 300, purpose: 'login' })).toBe('سبز [ورود] 555123 (5 دقیقه)');
    });
    (0, vitest_1.it)('LogSmsSender کد را در لاگ مخفی می‌کند و فقط با SMS_LOG_CODE=true متن کامل می‌دهد', async () => {
        const spy = vitest_1.vi.spyOn(console, 'log').mockImplementation(() => undefined);
        try {
            await new sms_sender_1.LogSmsSender().send(message);
            const logged = spy.mock.calls.map((call) => String(call[0])).join('\n');
            (0, vitest_1.expect)(logged).not.toContain('864207');
            (0, vitest_1.expect)(logged).toContain('••••');
            process.env.SMS_LOG_CODE = 'true';
            await new sms_sender_1.LogSmsSender().send(message);
            (0, vitest_1.expect)(String(spy.mock.calls.at(-1)?.[0])).toContain('864207');
        }
        finally {
            spy.mockRestore();
        }
    });
    (0, vitest_1.it)('redactCode فقط دنبالهٔ ۴ رقمی و بیشتر را مخفی می‌کند', () => {
        (0, vitest_1.expect)((0, sms_sender_1.redactCode)('کد 864207 در پیام آمد')).toBe('کد •••• در پیام آمد');
        (0, vitest_1.expect)((0, sms_sender_1.redactCode)('status=200 و ttl=120 دست‌نخورده می‌مانند')).toBe('status=200 و ttl=120 دست‌نخورده می‌مانند');
    });
    (0, vitest_1.it)('پاسخ خام درگاه که متن پیام را echo کرده در پیام خطا redact می‌شود', async () => {
        await withMockGateway((_req, res) => {
            res.writeHead(200, { 'content-type': 'text/html' });
            res.end(`<html>Rejected: ${message.body}</html>`);
        }, async ({ url }) => {
            process.env.SMS_PROVIDER = 'http';
            process.env.SMS_GATEWAY = 'kavenegar';
            process.env.SMS_API_KEY = 'TEST_KEY_DO_NOT_LEAK';
            process.env.SMS_API_URL = url;
            const err = (await new sms_sender_1.HttpSmsSender().send(message).catch((e) => e));
            (0, vitest_1.expect)(err.message).toMatch(/پاسخ غیرمنتظره/);
            (0, vitest_1.expect)(err.message).not.toContain('864207');
            (0, vitest_1.expect)(err.message).toContain('••••');
        });
    });
});
//# sourceMappingURL=sms-sender.test.js.map