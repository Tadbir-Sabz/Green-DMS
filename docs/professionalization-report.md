# گزارشِ حرفه‌ای‌سازی — وضعیتِ نهاییِ ۱۳ پیشنهاد

> شاخهٔ `arena/63ef2061-green-dms` (همه push شده). این سند وضعیتِ هر ۱۳ پیشنهادِ
> نقشهٔ راه، شواهدِ راستی‌آزمایی، و یافته‌هایِ امنیتی را ثبت می‌کند. چهار موردِ
> مصوبِ این دور (پورتال، onboarding/billing، Playwright، بازطراحیِ محدود) انجام شد.

---

## ۱) خلاصه

از ۱۳ پیشنهاد: **۱۱ مورد انجام و راستی‌آزمایی شد**. دو مورد باقی‌مانده:
**P1-۷ اندروید** (مسدودِ محیطی — بدونِ Android SDK در سندباکس) و **P2-۱۲ i18n**
(بازآراییِ سراسری؛ در این دور جزوِ چهار موردِ مصوب نبود و به پیگیریِ جدا نیاز دارد).

**ماتریسِ راستی‌آزمایی (محلی، پس از همهٔ تغییرات):**

| بررسی | نتیجه |
|---|---|
| `openapi:check` | ✅ ۱۴۲ مسیر / ۲۰۷ عملیات / ۱۰۱ اسکیما / ۳ وب‌هوک |
| `contract-drift` | ✅ ۲۰۷/۲۰۷ هم‌تراز — صفرِ رانش |
| API `typecheck` + `build` | ✅ exit 0 |
| Web `typecheck` + `next build` | ✅ exit 0 — ۴۸ صفحه |
| تستِ بدونِ DB‌ِ API | ✅ **۶۹ pass** (۲۲ sms + ۱۶ attachment + ۶ bi + ۸ forecast + ۱۲ routing + ۵ portal-auth) |
| تستِ Web | ✅ **۵۰ pass** |
| مهاجرت‌ها | ✅ ۳۹ up / ۳۹ down (جفت‌شده) — ۰۰۳۷/۰۰۳۸/۰۰۳۹ افزوده شد |
| تست‌هایِ DB‌دار + Playwright + مهاجرت‌ها | ⏳ فقط در CI (بدونِ docker/PostGIS/مرورگر در سندباکس) |

---

## ۲) وضعیتِ ۱۳ پیشنهاد

### P0 (همه انجام‌شده)
- **۱ — CI با MinIO + تستِ یکپارچه‌سازیِ واقعی** ✅ `daa39cc`
- **۲ — اتصالِ ضمیمه به POD + بارگذارِ وب** ✅ `d54cd73`
- **۳ — سندِ بهره‌برداریِ یکپارچه‌سازی‌ها** ✅ `e041eab` (`docs/integrations-golive.md`)
- **۴ — RLS روی ضمیمه (۰۰۳۶)** ✅ `e041eab`

### P1
- **۵ — پورتالِ B2B** ✅ `a82b9fc` — هویتِ جداگانهٔ `portal_user`/`portal_session`
  (مهاجرت ۰۰۳۷) + JWT با `audience='portal'` و `typ='portal_access'` (جداسازیِ دوطرفه
  از توکنِ کارکنان). مسیرها: `POST /portal/auth/login|refresh|logout`،
  `GET /portal/me|invoices|orders|balance` (اسکوپِ customer)، و
  `POST /portal/users` (پروکسی توسطِ کارکنان، `master.customer.update`). داده‌ها فقط
  با `(company_id, customer_id)` نشست.
- **۶ — داشبوردِ BI** ✅ `2e8ffc7` + `de92b0b` — KPI + تحلیلِ ABC روی MVها + صفحهٔ وبِ `/bi`.
- **۷ — اندروید (آفلاین/push)** ⛔ مسدودِ محیطی — بدونِ Android SDK/Gradle/Maven در
  سندباکس؛ باید در CI با ایمیجِ اندروید یا محیطِ شما ساخته شود.
- **۸ — Onboarding + Billing** ✅ `5d16ddc` — طبقِ دامنهٔ مصوب: **فقط onboarding و
  مدیریتِ صورتحساب، بدونِ درگاهِ پرداخت و بدونِ اشتراکِ پولی.**
  - Onboarding: `fn_provision_company` (مهاجرت ۰۰۳۸) به‌صورت اتمی شرکت + شعبه +
    نقش‌ها (کپی از شرکتِ قالب یا bootstrap نقشِ ceo با همهٔ مجوزها برای اولین اجاره) +
    شخص و حسابِ مدیر (scrypt) + انتصابِ نقش را می‌سازد. `POST /onboarding/register` (عمومی).
  - Billing: جدولِ `billing_invoice` (مهاجرت ۰۰۳۹، ledger با وضعیت issued/void) +
    `GET /billing/invoices` و `/billing/invoices/{id}` (فقط خواندن، مجوزِ موجودِ `ar.ledger.view`).
- **۹ — تستِ E2E با Playwright** ✅ `28a3205` — سوئیتِ جریانِ تجاریِ واقعی + job ایزولهٔ
  CI (`.github/workflows/e2e.yml`) که پشتهٔ کامل را با docker compose بالا می‌آورد.

### P2
- **۱۰ — بهینه‌سازِ مسیر (TSP)** ✅ `3082d7a` — الگوریسمِ خالصِ هاورساین + نزدیک‌ترین
  همسایه + 2-opt روی مختصاتِ PostGIS مشتریان؛ `POST /routing/optimize`.
- **۱۱ — بازطراحیِ رابط (محدود)** ✅ `e0be421` — گامِ اول روی یک سطحِ کلیدی (داشبورد BI):
  نوارِ فرمانِ برند با توکن‌هایِ معناییِ v4؛ همهٔ منطق/داده/RTL حفظ شد.
- **۱۲ — i18n** ⏸️ به تعویق — در چهار موردِ مصوبِ این دور نبود؛ بازآراییِ سراسری
  (۴۸ صفحهٔ وب + اندروید + قراردادها) و نیازمندِ تعیینِ دامنه/زبانِ دوم.
- **۱۳ — پیش‌بینیِ فروش** ✅ `f077a7f` + `0058e13` — هموارسازیِ خطیِ هالت رویِ
  `mv_daily_sales`؛ `GET /bi/forecast` + کارتِ پیش‌بینی در داشبورد.

---

## ۳) یافته‌هایِ امنیتی

- **جداسازیِ توکنِ پورتال (مثبت):** `PortalAuthGuard` با `verify(..., { audience: 'portal' })`
  + بررسیِ `typ==='portal_access'`؛ توکنِ کارکنان (بدونِ این audience) و توکنِ پورتال
  (typ متفاوت) هرکدام روی API دیگری رد می‌شوند. با ۵ تستِ بدونِ DB اثبات شد.
- **اسکوپِ دادهٔ پورتال (مثبت):** هر کوئریِ پورتال با `company_id` (اجاره) و `customer_id`
  (حساب) فیلتر می‌شود؛ اینها فقط از نشست می‌آیند، هرگز از کلاینت. `POST /portal/users`
  پیش از ساخت، تعلقِ `customer_id` به `company_id` نشست را بررسی می‌کند.
- **⚠️ `POST /onboarding/register` عمومی و بدونِ احرازِ هویت است** (طراحیِ خودخدمت‌دهی).
  در تولید **باید** پشتِ نرخ‌گذاری (rate-limit)، CAPTCHA، کدِ دعوت یا صفِ تأیید قرار گیرد
  تا از ساختِ انبوه/سوءاستفاده جلوگیری شود. در کد و openapi مستند شده است.
- **هشِ رمز:** scrypt (N=16384,r=8,p=1) با `timingSafeEqual`؛ ورودِ پورتال برای کاربرِ
  ناموجود هم هزینهٔ معادل صرف می‌کند (ضدِ user enumeration) و پس از N تلاش ناموفق قفل می‌شود.
- **RLS:** روی `portal_user`/`portal_session`/`billing_invoice` (بدونِ FORCE؛ مالک=اپ
  bypass می‌کند و اعمالِ اصلی در ریپازیتوری با `company_id` است) — دفاع در عمق، هم‌راستا با ۰۰۳۶.
- **refresh چرخشی:** فقط `sha256(refresh)` ذخیره می‌شود؛ استفادهٔ مجدد از توکنِ باطل‌شده
  تشخیص و رد می‌شود.

---

## ۴) commits (از main = `8740256`)

```
e0be421 style(bi): scoped redesign of the BI dashboard command bar   [P2-11]
28a3205 test(e2e): Playwright suite + isolated CI environment         [P1-9]
5d16ddc feat(onboarding,billing): provisioning + invoice ledger       [P1-8]
a82b9fc feat(portal): B2B portal, separate identity + isolated JWT    [P1-5]
2826aa3 docs: professionalization progress report
0058e13 feat(bi): sales forecast on the BI dashboard                  [P2-13 web]
f077a7f feat(bi): sales forecast endpoint (Holt linear)              [P2-13]
3082d7a feat(routing): real TSP optimizer over PostGIS coords        [P2-10]
de92b0b feat(bi): web BI dashboard                                    [P1-6 web]
2e8ffc7 feat(bi): real BI module (KPI + ABC)                          [P1-6]
e041eab harden(attachments): RLS (0036) + integrations runbook        [P0-3,4]
d54cd73 feat(attachments): list-by-owner + web uploader               [P0-2]
daa39cc ci(attachments): MinIO in CI + live upload test               [P0-1]
70011aa feat(api): attachment upload pipeline on MinIO/S3
f8e4d08 fix(web): login behind proxy/preview (same-origin API base)
a8ee345 fix(api,db): close TOCTOU over-allocation race (0034)
b24daa1 fix(api): restore ValidationPipe on sales-chain DTOs
```

۸۴ فایل تغییر یافته (+۷۳۹۱/−۱۱۷). مهاجرت‌هایِ جدید: ۰۰۳۷ (پورتال)، ۰۰۳۸ (استقرار)،
۰۰۳۹ (صورتحساب). ماژول‌هایِ جدید: `portal`، `onboarding`، `billing`، `routing` (بازنویسی)،
`bi` (بازنویسی + forecast).

---

## ۵) مواردِ باقی‌مانده / پیشنهادِ پیگیری

1. **اندروید (P1-۷):** محیطِ ساختِ اندروید (CI با ایمیجِ SDK یا محیطِ شما) لازم است.
2. **i18n (P2-۱۲):** تعیینِ دامنه (وب/اندروید/قرارداد) و زبانِ دوم؛ پیشنهاد: `next-intl`
   برای وب در گامِ اول.
3. **بازطراحی (P2-۱۱):** گامِ اول روی داشبورد BI انجام شد؛ در صورتِ تأیید، همین زبانِ
   بصری به سایرِ سطوحِ کلیدی (ورود، فروش، داشبورد اصلی) گسترش می‌یابد.
4. **Billing:** افزودنِ صدور/پرداختِ اشتراک منوط به تصمیمِ درگاهِ پرداخت و مدلِ طرح است
   (طبقِ دامنهٔ مصوب، فعلاً فقط ledger).
5. **تستِ یکپارچه‌سازیِ DB‌دار برای portal/onboarding/billing:** در CI اجرا می‌شود؛
   افزودنِ `*.api.test.ts` اختصاصی برای این سه، پوششِ سمتِ DB را کامل‌تر می‌کند.
