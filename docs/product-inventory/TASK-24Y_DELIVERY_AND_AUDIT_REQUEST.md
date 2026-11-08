# TASK-24Y — گزارشِ تحویل و درخواستِ بازبینیِ مستقل (Agent-2)

**شاخه:** `arena/1246108f-green-dms` · **PR:** #13 · **HEAD تحتِ آزمون:** `c29bed2`
**وضعیت:** پیاده‌سازی کامل شد؛ در انتظارِ بازبینیِ **فقط-خواندنیِ** Agent-2
**حکمِ پیشنهادیِ خودارزیابی: PASS WITH FINDINGS** (دلایل در بند ۸)

---

## ۱. خلاصهٔ اجرایی

پیش از این کار، «تأیید» در Green-DMS یک زنجیره بود که فقط با `entity` پیدا می‌شد و
در عمل **یک** عملیات از آن استفاده می‌کرد. سه عملیاتِ مالیِ اصلی (سفارش فروش،
مرجوعی، سفارش خرید) با یک بررسیِ مجوز و یک `update` وضعیت تأیید می‌شدند: بدونِ
زنجیره، بدونِ جداسازیِ وظایف، بدونِ ثبتِ تصمیم.

اکنون یک **قابلیتِ تأییدِ قابلِ استفادهٔ مجدد** وجود دارد: سیاست‌محور، چندمرحله‌ای،
با تفکیل و انقضا، تکیه بر پایگاه‌داده برای تغییرناپذیری، و سه عملیات روی همان
دروازهٔ مشترک — **دونوشتنِ منطقِ تأییدِ تکراری**.

در جریانِ کار **پنج نقصِ واقعی** پیدا شد که هیچ‌کدام در گزارشِ حسابرسیِ قبلی نبودند
(بند ۴). سه‌تای اول از نوعی هستند که «ستون هست، کنترل نیست».

---

## ۲. نگاشتِ فازها به commit

| فاز | commit | محتوا |
|---|---|---|
| ۰ | (بدونِ commit) | بازبینیِ repo/PR/شاخه، حفاظت از کارِ موجود |
| ۱ | در `531729c` (بازسازی‌شده در merge) | F-1، F-2، F-4 |
| ۲ | `f9b31d9` | ماتریسِ ۹ عملیات (سند) |
| ۳ | `f9b31d9` | موتور: سیاست، تفکیل، انقضا، اعلان، اتصال |
| ۴ | `f9b31d9` → `0cacd27` | دروازه روی سه عملیات |
| ۵ | `909a09e`، `144ed65` | OpenAPI + رابطِ فارسی/RTL |
| ۶ | `2c48b7d`، `0cacd27` | ۲۷ آزمون + کنترل‌های منفی |
| ۷ | همین سند | درخواستِ بازبینیِ مستقل |
| fix | `c29bed2` | آزمونِ شمارِ مهاجرت‌ها (یافتهٔ CI) |
| merge | `813ed48` | ادغامِ تاریخِ TASK-24X (بند ۷) |

---

## ۳. آنچه ساخته شد

### ۳.۱ مهاجرت `0053_approval_architecture`

| شیء | نقش |
|---|---|
| `approval_policy` | سیاست در سه دامنه: `central` / `domain` / `operation` |
| `approval_delegation` | واگذاری با دامنهٔ صریح و بازهٔ اعتبار |
| `approval_notification` | جعبهٔ خروجیِ تراکنشی |
| `approval_binding` | اتصالِ صریحِ درخواست به موجودیت + اثرانگشت + `consumed_at` |
| `approval_request` + ۶ ستون | `expires_at`, `escalated_at`, `escalation_of`, `entity_domain_id`, `risk_score`, `policy_id` |
| تریگرهای `approval_decision` | UPDATE و DELETE با `P0001` مسدود |
| `sales_order.created_by`, `purchase_order.created_by` | پیش‌نیازِ جداسازیِ وظایف |

اعتبارسنجی: روی پایگاهِ تازه `0001..0053` اجرا، سپس `down`، سپس `up` دوباره —
هر سه بدونِ خطا. `down` **هیچ ردیفِ تأییدی حذف نمی‌کند**.

### ۳.۲ موتور

- **`approval-policy.ts`** — حل‌کنندهٔ خالص. تقدمِ سیاستِ مرکزی **ساختاری** است
  (`governanceTier`)، نه عددی؛ اگر هیچ سیاستی منطبق نباشد `null` و فراخوان
  fail-closed می‌کند.
- **`startApproval()`** — حلِ سیاست، ردِ زنجیرهٔ خالی، ثبتِ مهلت، اتصال، اعلان.
- **`requireApproved()`** — دروازهٔ مشترکِ عملیات. مصرفِ اتمیک از طریقِ
  `consumed_at`، پس یک تأیید دو عملیات را باز نمی‌کند.
- **`processExpired()`** — بستن یا ارتقای درخواست‌های گذشته از مهلت.

### ۳.۳ سه عملیاتِ تحتِ حاکمیت

| عملیات | موجودیت | منبعِ هویتِ سازنده |
|---|---|---|
| `sales.order.approve` | `sales_order` | `created_by` (در 0053 افزوده شد) |
| `sales.return.approve` | `return_request` | `requested_by` (ستون بود، **پر نمی‌شد**) |
| `ap.purchase.approve` | `purchase_order` | `created_by` (در 0053 افزوده شد) |

رفتار: بدونِ سیاست ⇒ رفتارِ پیشین حفظ می‌شود (سازگاریِ عقب‌رو)؛ با سیاست ⇒ اجرا
فقط پس از تأییدِ گردش. خودتأییدی در **هر دو** حالت رد می‌شود.

---

## ۴. پنج نقصِ واقعیِ یافت‌شده

| # | نقص | چرا مهم بود | شاهد |
|---|---|---|---|
| 1 | `sales_order` ستونِ سازنده **نداشت** (ستونِ `0010:141` مالِ `invoice` است) | جداسازیِ وظایف غیرقابلِ اجرا | O-1، NC-1 |
| 2 | `return_request.requested_by` **هرگز پر نمی‌شد** | ستونِ همیشه-null = کنترلِ ناموجود | R-1، NC-5 |
| 3 | `purchase_order` ستونِ سازنده نداشت | همان | P-7، NC-7 |
| 4 | `approvals/inbox` زیرِ `approvals/:id` ثبت شده بود | کارتابل ۴۰۴ می‌داد | I-2 |
| 5 | تقدمِ سیاستِ مرکزی **عددی** بود | آستانهٔ مبلغِ بزرگ در قلمرو، سیاستِ شرکت را کنار می‌زد | P-3، NC-4 |

**یادداشتِ روش‌شناسی (مهم برای بازبین):** در اجرای نخستِ NC-4 آزمون **سبز** ماند،
چون سیاستِ قلمرو با زمینه تطبیق نداشت و پیش از مرتب‌سازی فیلتر می‌شد؛ یعنی کنترلِ
منفی هرگز مقایسه را لمس نمی‌کرد. آزمون تقویت شد تا هر دو سیاست منطبق باشند. این
ثبت شده چون **کنترلِ منفیِ سبز بدتر از نداشتنِ کنترل است**.

---

## ۵. شواهدِ کنترلِ منفی

هر کنترل حذف شد، اجرا شد، و بازگردانده شد:

| # | حذف‌شده | شکستِ مورد انتظار | نتیجه |
|---|---|---|---|
| NC-1 | نگهبانِ خودتأییدیِ سفارش | O-1 | ۱ failed / ۲۳ passed ✓ |
| NC-2 | دروازهٔ تأیید | O-3، O-4، O-5 | ۳ failed ✓ |
| NC-3 | تریگرِ تغییرناپذیری | I-1 | ۱ failed ✓ |
| NC-4 | تقدمِ ساختاری | P-3 | ۱ failed ✓ |
| NC-5 | نگهبانِ خودتأییدیِ مرجوعی | R-1 | ۱ failed ✓ |
| NC-7 | دروازهٔ سیاستِ خرید | P-7 | ۱ failed ✓ |

---

## ۶. آزمون‌ها

| مجموعه | نتیجه |
|---|---|
| `task24y-approval-engine` | **۲۷/۲۷** |
| `task24x-remediation` | ۲۶/۲۶ |
| `orders` | ۱۵/۱۵ |
| `returns` | ۱۶/۱۶ |
| `purchasing` | ۲۴/۲۴ |
| `pricing-engine.api` | ۴۸/۴۸ |
| `treasury` | ۱۷/۱۷ |
| `rules-engine-behavior` | ۲۷/۲۷ |
| `contract` | ۸۰/۸۰ |
| `task24w-conversion-and-parity` | ✅ |
| **مجموع (۱۰ فایل، HEAD تحتِ آزمون)** | **۳۰۰/۳۰۰** |
| وب (`apps/web`) | ۵۲/۵۲ |
| typecheck (`apps/api`, `apps/web`) | تمیز |

### اجرای کاملِ `apps/api` — گزارشِ صادقانه

اجرای کلِ ۶۴ فایل: **۱۱۸۷ passed / ۲۵ failed / ۶۶ skipped**.
هر ۲۵ شکست **محیطی** است و در بندِ زیر اثبات شده — **به‌عنوانِ قبولی گزارش نمی‌شود**:

- `st_geomfromtext does not exist` — این sandbox بستهٔ PostGIS ندارد (با domain
  stand-in جبران شد، ولی توابعِ هندسی واقعی موجود نیست): `customers.api`،
  `geofences.api`، `geofence-rls`، `migrations-security` (یک آزمون).
- سرویسِ MinIO/S3 در دسترس نیست: `attachments.api`.
- `similarity()` واقعیِ `pg_trgm` — `product-master-core`.
- احرازِ رمزِ Postgres — این PG با `trust` راه‌اندازی شد: `postgres-init-role`.
- `tours.api`، `view-isolation` — پیش‌شرطِ هندسی/نمایشی.

**اثباتِ پیش‌موجود بودن:** `product-master-core` و `postgres-init-role` روی
worktreeِ تمیزِ `531729c` (پیش از هر تغییرِ من) **همان‌طور شکست خوردند**.

### CI

| workflow | `c29bed2` | `531729c` (پیشین) |
|---|---|---|
| CI | **success** (963 passed) | success |
| مهاجرت‌های پایگاه‌داده | **success** | success |
| release-image | **success** | success |
| Static checks / OpenAPI / contract drift | **success** | success |
| e2e | failure — `assert MinIO resolved (BLOCKED gate)` | **همان شکست** |

شکستِ e2e پیش‌موجود و محیطی است (gate عمداً BLOCKED است)، نه ناشی از این تغییرات.

**یافتهٔ CI که خودم مرتکب شدم:** `migrations-security.test.ts` شمارِ مهاجرت‌ها را
`52` هارد‌کد کرده بود، پس افزودنِ 0053 آن را شکست. اصلاح شد به: پیوستگیِ شماره‌ها،
آخرین مهاجرت به‌صورتِ صریح، و **الزامِ وجودِ `.down.sql` برای هر `.up.sql`** — کنترلی
که پیش‌تر وجود نداشت. commit `c29bed2`.

---

## ۷. دو رویدادِ مهندسی که بازبین باید بداند

### ۷.۱ شاخه از `d12dc2e` ساخته شده بود، نه از `531729c`

push اولیه به‌عنوان non-fast-forward رد شد. پیش از هر اقدامی **اثبات شد هیچ
محتوایی گم نشده**: هر مسیرِ موجود در `531729c` در درختِ من هم بود و diff فقط
افزودنی بود. سپس **merge** انجام شد (نه rebase، نه reset، نه force-push).

پنج تعارض، هر یک با بررسیِ **هر دو طرف** حل شد — نه با انتخابِ پیش‌فرضِ یک طرف:

| فایل | یافته | تصمیم |
|---|---|---|
| `order.service.ts` | بدنهٔ F-1 فقط در سمتِ من بود (در `531729c` صفر مورد) | نسخهٔ من، با پارامترِ پیش‌فرض برای سازگاریِ هر دو فراخوان |
| `master-data/pricing.service.ts` | `531729c` **همچنان** تاریخِ UTC می‌گیرد (F-4 اصلاح نشده) | اصلاحِ F-4 حفظ شد |
| `pricing-engine.service.ts` (۲ hunk) | `531729c` **همچنان** دو-تراکنشی است (نقصِ F-2) | مسیرِ اتمیک حفظ شد |
| `pricing-engine.repository.ts` | add/add | هر دو نگه داشته شدند |
| `rules-engine.controller.ts` | ترتیبِ مسیرها | بلوکِ من بالای `approvals/:id` — همان چیزی که ۴۰۴ را رفع می‌کند |

پس از merge: typecheck تمیز، صفر نشانهٔ تعارض، F-1/F-2/F-4 هر سه موجود، ۳۰۰/۳۰۰.

### ۷.۲ بازنشانیِ sandbox

sandbox دو بار بازنشانی شد و `/tmp` (PostgreSQL، Redis، clone آزمون) پاک شد.
harness از صفر بازسازی شد: PostgreSQL 16.2 از `pgserver`، و `pgcrypto`/`pg_trgm`/
`btree_gist` از **منبعِ contrib** ساخته شدند (شاملِ یک shimِ سازگاری برای دو نمادِ
OpenSSL که در محیط نبود). سپس workspace به `c29bed2` بازگردانده شد — **پس از اثباتِ
اینکه هر ۷۷ فایلِ dirty بایت‌به‌بایت با ریموت یکسان‌اند** (صفر تفاوت).

هیچ‌کدام از این‌ها روی محتوای تحویل اثر ندارد؛ ثبت شدند چون بازبین باید بتواند
اعداد را بازتولید کند.

---

## ۸. شکاف‌های باقی‌مانده — چرا حکم «PASS WITH FINDINGS» است

| # | شکاف | چرا باز است | اولویت |
|---|---|---|---|
| 1 | چهار عملیاتِ دیگر دروازه ندارند: `purchase_request`، `treasury_day_close`، `customer_price`، `price_change_log` | `requireApproved` آماده است؛ باید یکی‌یکی و با آزمون وصل شوند | P1 |
| 2 | `approval_request_id` در این سه جدول هم پر نمی‌شود | پیوند از `approval_binding` است؛ دو منبعِ حقیقت ساختن ممنوع | P2 |
| 3 | `entity_fingerprint` نوشته می‌شود ولی در لحظهٔ اجرا **مقایسه** نمی‌شود | نیازمندِ تعریفِ اثرانگشتِ هر موجودیت | P2 |
| 4 | کارگرِ cron برای انقضا | اکنون فقط `POST …/run-expiry` (دستی) | P2 |
| 5 | ارسالِ واقعیِ اعلان (ایمیل/SMS) | outbox نوشته می‌شود، تحویل نه | P2 |
| 6 | صفحهٔ مدیریتِ **سیاست** در وب | کارتابل و تفکیل ساخته شد، سیاست نه | P2 |
| 7 | باقیِ مسیرهای تاریخِ UTC (`tracking.service.ts:195`, `bi/forecast.ts:35`) | خارج از دامنهٔ F-4 | P3 |

**G-03 همچنان بسته نیست.** سه عملیاتِ تحتِ حاکمیت با جداسازیِ وظایفِ اثبات‌شده،
چهار عملیاتِ باز، و یک شکافِ UI یعنی قابلیت هنوز «کامل» نیست.

---

## ۹. درخواستِ بازبینیِ مستقل (Agent-2، فقط-خواندنی)

لطفاً روی `c29bed2` و **بدونِ تغییرِ کد** بررسی کنید:

**الف) امنیت — تلاش برای دور زدن**
1. آیا `POST /orders/:id/approve` را می‌توان بدونِ تأییدِ گردش دور زد؟ مسیرهای
   جایگزین: `PATCH /orders/:id`، `POST /requests/:id/convert`، هر مسیرِ داخلیِ
   سرویس که وضعیت را مستقیم عوض کند.
2. آیا خودتأییدی از راهِ تفکیل قابلِ دور زدن است؟ (واگذاری به خود رد می‌شود — D-1)
3. آیا `consumeBinding` واقعاً دوباره‌مصرف را می‌بندد؟ (O-4)
4. آیا تریگرِ تغییرناپذیری از مسیرِ اپلیکیشن دور خورده‌پذیر است؟ (I-1، NC-3)

**ب) جداسازی**
5. آیا کاربرِ شرکتِ دوم با همان مجوزها می‌تواند سیاست/کارتابل/اعلانِ شرکتِ اول را
   ببیند؟ (S-4، I-2، I-3)

**ج) مهاجرت**
6. `0053` را روی پایگاهی با داده اجرا کنید؛ سپس `down`؛ سپس `up`. آیا دادهٔ
   `approval_decision` باقی می‌ماند؟ آیا `down` چیزی حذف می‌کند که نباید؟

**د) صداقتِ ادعاها**
7. آیا هر ادعای `TASK-24Y_APPROVAL_CAPABILITY_MATRIX.md` شاهدِ اجراشدنی دارد؟
8. آیا شکافی هست که در بند ۸ ذکر نشده باشد؟

**ه) تعارض‌ها**
9. آیا حلِ پنج تعارضِ merge (بند ۷.۱) درست بود؟ به‌ویژه اینکه F-1/F-2/F-4 در
   `531729c` **نبودند** و از سمتِ من حفظ شدند.

---

## ۱۰. بازتولیدِ نتایج

```bash
npm ci
npx tsc -p apps/api --noEmit && npx tsc -p apps/web --noEmit
# نیازمندِ PostgreSQL با pgcrypto/pg_trgm/btree_gist و Redis روی ۶۳۷۹
export DATABASE_URL=postgres://postgres@127.0.0.1:55432/postgres
export PSQL=$(which psql) NODE_ENV=test; unset APP_DATABASE_URL
npx vitest run --root apps/api \
  test/task24y-approval-engine.api.test.ts test/task24x-remediation.api.test.ts \
  test/task24w-conversion-and-parity.api.test.ts test/orders.api.test.ts \
  test/pricing-engine.api.test.ts test/purchasing.api.test.ts \
  test/returns.api.test.ts test/treasury.api.test.ts \
  test/rules-engine-behavior.test.ts test/contract.api.test.ts   # ⇒ ۳۰۰/۳۰۰
npx vitest run --root apps/web                                     # ⇒ ۵۲/۵۲
```

---

## ۱۱. فایل‌های تحویل

```
migrations/0053_approval_architecture.{up,down}.sql
apps/api/src/modules/rules-engine/approval-policy.ts
apps/api/src/modules/rules-engine/rules-engine.{service,repository,controller,dto}.ts
apps/api/src/modules/sales/{order,return}.{service,repository,controller}.ts
apps/api/src/modules/purchasing/purchasing.{service,repository,controller,module}.ts
apps/api/test/task24y-approval-engine.api.test.ts        (۲۷ آزمون)
apps/web/src/app/approvals/inbox/page.tsx
packages/contracts/openapi.yaml                          (۹ مسیر، ۵ schema)
docs/product-inventory/TASK-24Y_APPROVAL_CAPABILITY_MATRIX.md
docs/product-inventory/TASK-24Y_DELIVERY_AND_AUDIT_REQUEST.md   (همین سند)
```
