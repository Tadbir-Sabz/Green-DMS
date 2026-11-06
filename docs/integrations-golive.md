# راهنمای زنده‌کردن یکپارچه‌سازی‌ها (مؤدیان، پرداخت، پیامک)

این سند «قدمِ P0 برای تبدیل شدن به نرم‌افزار فروش واقعی» است: کدِ یکپارچه‌سازی‌ها
**endpoint-driven و آماده** است؛ آنچه برای زنده‌شدن لازم است **اعتبارنامهٔ واقعیِ شما**
و پیکربندیِ درست است (نه کدِ بیشتر). اینجا دقیقاً چه چیزی، کجا، و چگونه تست شود آمده است.

## مدل پیکربندی (دو لایه)

1. **اعتبارنامهٔ هر شرکت** در جدول `integration_credential` (رمزنگاری‌شده):
   `(company_id, provider, secret_enc, is_active, valid_until)`.
   - `provider` یکی از: `moadian`، `psp` (pos/gateway)، `sms`.
   - `secret_enc` باید رمزنگاری‌شده نوشته شود (کلیدِ رمزنگاری در `.env`).
   - این ردیف‌ها هنگام provisioning شرکت (یا توسط ادمین) درج می‌شوند.
2. **endpointها و secretهای سراسری** در `.env` (نگاه به `.env.production.example`):
   `MOADIAN_ENDPOINT`, `PSP_ENDPOINT`, `PSP_WEBHOOK_SECRET`, `SMS_PROVIDER`, `SMS_GATEWAY`,
   `SMS_API_KEY`, `SMS_FROM`, و غیره.

وضعیتِ هر سرویس از `GET /api/v1/integrations` خوانده می‌شود (سالم = اعتبارنامهٔ فعالِ
رمزنگاری‌شده و منقضی‌نشده). آزمونِ هر سرویس: `POST /api/v1/integrations/{key}/test`.

> **صداقتِ مهم:** فعلاً `test` یک **بررسیِ پیکربندی** است (حضور اعتبارنامهٔ فعال و
> رمزنگاری‌شده و انقضای آن)، **نه handshake شبکه‌ای واقعی** — چون کلید/endpoint واقعی
> سرویس‌های بیرونی در محیط توسعه در دسترس نیست. به‌محض پیکربندیِ اعتبارنامهٔ واقعی،
> یک فراخوانیِ شبکه در متد `probe`/`test` افزوده می‌شود (الگوی از پیش آماده در
> `integrations-status.service.ts`).

---

## ۱) سامانهٔ مؤدیان (مالیات)

- **نیازها:** `MOADIAN_ENDPOINT` (آدرس درگاه مؤدیان — production یا sandbox سازمان امور مالیاتی)،
  کلید/گواهی امضای صورتحساب (در `integration_credential` با `provider='moadian'`)، و
  شناسهٔ یکتای حافظهٔ مالیاتی شرکت.
- **مسیرها:** `POST /integrations/moadian/invoice` (ارسال صورتحساب)، `GET /integrations/moadian/status`.
- **صف:** ارسال‌ها از صفِ مؤدیان (`moadian_submission`) با تلاش مجدد و ثبت `last_error` انجام می‌شود.
- **تست:** ابتدا در **sandbox** مؤدیان با اعتبارنامهٔ آزمایشی؛ سپس `POST /integrations/moadian/status`
  و بررسی `GET /integrations` برای `healthy=true`.

## ۲) درگاه پرداخت (PSP / POS)

- **نیازها:** `PSP_ENDPOINT`، کلید درگاه (در `integration_credential` با `provider='psp'`)، و
  `PSP_WEBHOOK_SECRET` (یک مقدارِ تصادفیِ قوی؛ بدون آن هیچ webhook پذیرفته نمی‌شود → 503).
- **مسیرها:** `POST /integrations/psp/pay` (ساخت تراکنش)، `GET /integrations/psp/reconcile`
  (تطبیق)، `POST /integrations/psp/webhook` (اعلان درگاه — بدون نشست، با امضای HMAC).
- **امنیت webhook:** امضا با `timingSafeEqual` و `PSP_WEBHOOK_SECRET` راستی‌آزمایی می‌شود؛
  آدرس webhook را در پنل درگاه ثبت کنید.
- **تست:** با درگاهِ تستی PSP؛ یک پرداخت آزمایشی → webhook → بررسی `GET /integrations` (`pos`/`gateway`).

## ۳) پیامک (OTP / اطلاع‌رسانی)

- **نیازها:** `SMS_PROVIDER` (برای تولید: `kavenegar` / `smsir` / `ghasedak` / `farapayamak` / `generic`)،
  `SMS_API_KEY`، `SMS_FROM` (شمارهٔ ارسال‌کننده)، و در صورت نیاز `SMS_USERNAME`/`SMS_PASSWORD`.
- **حالت توسعه:** `SMS_PROVIDER=log` کد را فقط لاگ می‌کند (بدون ارسال واقعی) — برای CI/توسسه.
- **مسیر/تست:** ارسال OTP از جریان ورود؛ `apps/api/test/sms-sender.test.ts` شکلِ درخواستِ هر
  ارائه‌دهنده را با سرورِ محلی شبیه‌سازی و راستی‌آزمایی می‌کند (بدون شبکهٔ واقعی).

---

## چک‌لیستِ استقرار (go-live)

- [ ] `integration_credential` برای هر شرکتِ فعال: ردیفِ رمزنگاری‌شدهٔ `moadian`/`psp`/`sms` با `is_active=true` و `valid_until` آینده.
- [ ] `.env` تولید: `MOADIAN_ENDPOINT`, `PSP_ENDPOINT`, `PSP_WEBHOOK_SECRET` (تصادفیِ قوی), `SMS_PROVIDER` + `SMS_API_KEY` + `SMS_FROM`.
- [ ] کلیدِ رمزنگاریِ `secret_enc` فقط در محیطِ امن (نه در مخزن).
- [ ] آدرس webhook در پنل PSP ثبت و از بیرون قابل‌دسترس باشد.
- [ ] `GET /api/v1/integrations` برای هر سه سرویس `healthy=true` برگرداند.
- [ ] افزودنِ handshake واقعی به `test`/`probe` (پس از در دسترس بودن اعتبارنامه) — اختیاری ولی توصیه‌شده.

## آبجکت‌استوریج (ضمیمه/POD)

برای آپلودِ ضمیمه (که در همین شاخه اضافه شد): `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`,
`MINIO_SECRET_KEY`, `MINIO_BUCKET` را در `.env` تولید ست کنید. سرویس MinIO در
`docker-compose.yml` تعریف شده و bucket هنگام اولین آپلود خودکار ساخته می‌شود.
