/**
 * درگاه پیامک آزمایشیِ سازگار با کاوه‌نگار — فقط برای تست محلی بدون هزینه/شبکه.
 *
 *   npx tsx scripts/mock-gateway.mts [پورت=8899]
 *
 * همان مسیر و همان شکل پاسخ کاوه‌نگار را شبیه می‌کند:
 *   GET  /v1/<key>/sms/send.json?receptor=&message=&sender=   →  {"return":{"status":200,...}}
 *   هر پاسخ دیگری (کلید خالی، شماره خالی)                      →  {"return":{"status":...,"message":...}}
 *
 * کد OTP را از متن پیام بیرون می‌کشد و در خروجی چاپ می‌کند تا مرحلهٔ تأییدِ
 * scripts/test-otp-e2e.mts بدون گوشی قابل اجرا باشد. در production از این فایل استفاده نمی‌شود.
 */
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 8899);
const mask = (v: string): string => (v.length <= 7 ? v : `${v.slice(0, 5)}***${v.slice(-4)}`);

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
  const reply = (status: number, body: unknown): void => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };

  if (!/\/v1\/[^/]+\/sms\/send\.json$/.test(url.pathname)) {
    reply(404, { return: { status: 404, message: 'مسیر ناشناخته' } });
    return;
  }

  const key = url.pathname.split('/')[2] ?? '';
  const receptor = url.searchParams.get('receptor') ?? '';
  const message = url.searchParams.get('message') ?? '';

  if (!key) return reply(200, { return: { status: 401, message: 'کلید API وارد نشده است' } });
  if (!receptor) return reply(200, { return: { status: 400, message: 'شماره مقصد خالی است' } });

  const code = /(\d{4,8})/.exec(message)?.[1] ?? '';
  console.log(
    `[mock-gateway] ${new Date().toISOString()} receptor=${mask(receptor)} keyLen=${key.length} code=${code}`,
  );
  reply(200, { return: { status: 200, message: 'ارسال شد', remain: 90 } });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`[mock-gateway] kavenegar-compatible stub روی http://127.0.0.1:${port} آماده است`);
});
