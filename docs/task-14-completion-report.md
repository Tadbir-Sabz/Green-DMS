# گزارشِ پذیرشِ TASK-14 — رفعِ سه یافتهٔ بازبینیِ مستقل و الزامِ جداسازیِ زمانِ اجرا

**شاخه:** `arena/63ef2061-green-dms` · **PR #5:** `OPEN` / `MERGEABLE`
**⛔ PR #5 ادغام نشد و هیچ استقرار یا تغییری رویِ پایگاه‌داده/زیرساختِ production انجام نشد.**

| مورد | مقدار |
|---|---|
| HEADِ نهایی | کامیتِ به‌روزرسانیِ همین سند رویِ `e1d12b5` |
| **SHA راستی‌آزمایی‌شده با CI (کد)** | **`e1d12b5`** — همهٔ چهار jobِ کدی سبز |
| SHA میانیِ راستی‌آزمایی‌شده | `c481c61` (محتوایِ کد یکسان، تنها تفاوت با `e1d12b5`: یک assertionِ تست + سند) |
| کامیت‌هایِ TASK-14 | `2f20aa1` (هر سه یافته + تست‌ها) → `c481c61` (شاهدِ Postgresِ واقعی برایِ GDM-13-03) → `e1d12b5` (اصلاحِ assertionِ تستِ پیشین + گزارشِ پذیرش) |
| نقطهٔ شروع | `e181767` (پایانِ TASK-12) — **هیچ مهاجرت یا کارِ تکمیل‌شده‌ای بازگردانی/بازنویسی نشد** |

---

## ۱) فایل‌هایِ تغییرکرده (دقیق)

**کدِ منبع**
* `apps/api/src/database/tenant-context.ts` — افزودنِ `releaseTenantClient()` + `TenantReleaseOutcome` + `ClientReleaser` (تنها مسیرِ آزادسازیِ ایمن)
* `apps/api/src/database/tenant-pool.ts` — `connect()`: پاک‌سازی/نابودی از راهِ helper؛ شکستِ `applyTenant` دیگر اتصال را checkout‌شده رها نمی‌کند
* `apps/api/src/database/job-context.ts` — `runAsJobTenant(..., options)` با `onConnectionDiscarded`؛ `finally` دیگر خطایِ پاک‌سازی را نمی‌بلعد
* `apps/api/src/database/runtime-identity.ts` — **فایلِ تازه**: `resolveDatabaseIdentity()` + `verifyRuntimeDatabaseIdentity()` + `isProductionEnv()`
* `apps/api/src/database/database.module.ts` — اتصال از `resolveDatabaseIdentity()` (حذفِ `?? DATABASE_URL` بی‌قید)
* `apps/api/src/main.ts` — راستی‌آزماییِ هویتِ مؤثر **پیش از** `app.listen`
* `apps/api/src/modules/integrations/queue/integrations.queue.ts` — `markFailure` با بررسیِ `rowCount`؛ `ProcessDueSummary`؛ `safeContext()`؛ `idempotency-key`

**پیکربندی/استقرار**
* `.env.production.example` — بخشِ `APP_DATABASE_URL` (الزامی در production) + تفکیکِ دو هویت + گامِ دستیِ `alter role dms_app login`
* `docker-compose.yml` — `APP_DATABASE_URL` برایِ سرویسِ api؛ mountِ `docker/postgres-init` و `APP_DB_PASSWORD` برایِ postgres
* `docker/postgres-init/10-runtime-role.sh` — **فایلِ تازه**: ساختِ نقشِ زمانِ اجرا با LOGIN، فقط رویِ volumeِ خالی

**تست‌ها**
* `apps/api/test/tenant-connection-lifecycle.test.ts` — **تازه** (۱۱ تست)
* `apps/api/test/queue-failure-persistence.test.ts` — **تازه** (۸ تست)
* `apps/api/test/runtime-identity.test.ts` — **تازه** (۹ تست)
* `apps/api/test/db-privileges.api.test.ts` — **+۴ تستِ Postgresِ واقعی** (نابودیِ اتصالِ آلوده، بازیابیِ استخر، ردِ هویتِ مدیریتی، پاس‌شدنِ `dms_app`)
* `apps/api/test/job-tenant-context.test.ts` — اصلاحِ تستی که انتظارِ قدیمیِ «بلعیدنِ خطایِ پاک‌سازی» را encode کرده بود (اکنون `release(err)` را می‌سنجد)

**سند**
* `docs/db-privilege-architecture.md` — الحاقیهٔ TASK-14 (جدولِ قواعدِ محیط‌ها، شش بررسیِ هویت، تفکیکِ دو هویت، خلاصهٔ رفتاریِ دو یافتهٔ دیگر)

---

## ۲) GDM-13-01 — استفادهٔ ناامنِ مجدد از اتصال وقتی پاک‌سازیِ زمینه شکست می‌خورد

**پیش از رفع (کدِ واقعی):**
```ts
// job-context.ts
await clearTenant(client).catch(() => undefined);   // خطا بلعیده می‌شد
client.release();                                    // اتصالِ آلوده به استخر بازمی‌گشت
// tenant-pool.ts
void clearTenant(client).catch(() => undefined).finally(() => originalRelease(err));
```
**رفتارِ پیشین:** اگر `clearTenant` شکست می‌خورد (اتصالِ مرده، یا تراکنشِ aborted با
`25P02`)، خطا دور ریخته می‌شد و اتصال **بدونِ آرگومانِ خطا** آزاد می‌شد ⇒ pg-pool آن را به
مجموعهٔ idle برمی‌گرداند در حالی که `app.company_id` هنوز رویِ اجارهٔ قبلی بود. borrower بعدی
(درخواستِ HTTP یا شغلِ دیگر) همان اتصال را می‌گرفت و پرس‌وجوهایش **داخلِ دامنهٔ RLSِ اجارهٔ
دیگری** اجرا می‌شد. علاوه بر این، شکستِ `applyTenant` در `TenantAwarePool.connect()` اتصالِ
checkout‌شده را هرگز آزاد نمی‌کرد ⇒ نشتِ اتصال.

**پس از رفع:** هر دو مسیر از `releaseTenantClient(client, release, reason?)` می‌گذرند:
1. پاک‌سازی **پیش از** آزادسازی؛
2. شکستِ پاک‌سازی ⇒ `release(err)` ⇒ در pg-pool `_release → _remove → client.end()`، یعنی
   **نابودیِ واقعیِ اتصال** (نه بازگشت به استخر)؛
3. خطایِ پاک‌سازی هرگز بلعیده نمی‌شود: در `outcome.error` به فراخوان برمی‌گردد، در
   `runAsJobTenant` به `onConnectionDiscarded` و در `TenantAwarePool` رویِ کانالِ `'error'`ِ خودِ
   pg منتشر می‌شود؛
4. شکستِ `applyTenant` ⇒ اتصال نابود **و** همان خطا منتشر (بدونِ نشتِ checkout)؛
5. helper هرگز پرتاب نمی‌کند ⇒ خطایِ اصلیِ بدنهٔ کار در `finally` پوشانده نمی‌شود؛
6. رفتارِ درخواست/شغل و سازگاریِ استخر بدونِ بازنویسیِ repositoryها حفظ شد.

**شاهدِ اجراییِ خواصِ امنیتی (نه فقط «release صدا زده شد»):**
* DB-free (`tenant-connection-lifecycle.test.ts`) با استخرِ ساختگی که **دقیقاً قراردادِ
  pg-pool** را دارد (`release(err)` ⇒ حذف + نابودی): حالتِ عادی (اتصالِ تمیز به idle)،
  پرتابِ بدنهٔ شغل، شکستِ پاک‌سازی (`destroyed=true, idle=false, idleCount=0, totalCount=0` و
  `release` دقیقاً یک بار **با خطا**)، شکستِ پاک‌سازی رویِ تراکنشِ aborted (کدِ `25P02` در
  آرگومانِ release)، شکستِ `applyTenant` (نابودی + `checkedOut=false` ⇒ بدونِ نشت)، و
  ⭐ **اثباتِ عدمِ استفادهٔ مجدد**: کلاینتِ آلوده (`guc.company_id='co-SECRET'`) نابود می‌شود و
  `connect()` بعدی کلاینتِ **متفاوتی** با `guc` خالی می‌گیرد؛ مسیرِ `TenantAwarePool.connect`
  (درخواستِ HTTP) هم همان چهار حالت + انتشارِ خطا رویِ `inner.emit('error', …)`.
* **Postgresِ واقعی زیرِ نقشِ `dms_app`** (`db-privileges.api.test.ts`): داخلِ شغل یک
  `set_config('app.probe','job-A-marker')` گذاشته و سپس تراکنش به aborted برده می‌شود ⇒
  `clearTenant` شکست می‌خورد ⇒ `inner.totalCount === 0` (تنها اتصالِ استخر حذف/نابود شد) و
  `onConnectionDiscarded` با `{companyId, stage:'clear', destroyed:true}` صدا زده می‌شود؛
  borrower بعدی اتصالِ **تازه** می‌گیرد که `app.probe` و `app.company_id` هر دو خالی‌اند و
  `select count(*) from app_user` صفر است؛ سپس استخر با اتصالِ سالم بازیابی می‌شود
  (`totalCount === 1`) و شغلِ بعدی رویِ همان استخر، زمینهٔ اجارهٔ درست و **دقیقاً یک** ردیفِ
  `app_user` همان اجاره را می‌بیند.

---

## ۳) GDM-13-02 — ماندنِ ابدیِ شغل در `sending` وقتی ثبتِ شکست صفر ردیف اثر می‌گذارد

**پیش از رفع:** `markFailure` نتیجهٔ `UPDATE` را نمی‌دید. صفر ردیف (دامنهٔ اجارهٔ اشتباه،
حذفِ ردیف، یا RLS) یعنی شغل در همان `sending` که claim ست کرده می‌ماند — و چون
`fn_job_claim_integration` فقط `queued/retrying` را برمی‌دارد، **هرگز** دوباره لمس نمی‌شد؛
هم‌زمان `processDue` مقدارِ `processed` را برمی‌گرداند، یعنی «موفقِ بی‌صدا».

**پس از رفع:**
1. `rowCount` باید **دقیقاً ۱** باشد؛
2. در غیرِ این صورت لاگِ `error` با **زمینهٔ امن** — نوعِ شغل، شناسهٔ شغل، شناسهٔ اجارهٔ
   مشتق‌شده از رکوردِ پایدار، شمارِ تلاش، وضعیتِ هدف، `rows_updated` و کدِ دلیل (حداکثر ۱۶۰
   نویسه). payload، شمارهٔ کارت، کلیدِ API و هر دادهٔ مشتری **هرگز** لاگ نمی‌شود (آزمونِ
   صریح دارد)؛
3. سپس `throw new Error('job_state_not_persisted_<table>')` ⇒ `runClaimed` خروجیِ
   `{ok:false, statePersisted:false}` می‌دهد و `processDue` آن را در `stateNotPersisted`
   می‌شمارد. `processed` یعنی «برداشته‌شده از صف»، نه «موفق»؛
4. خلاصهٔ تازهٔ `{processed, failed, stateNotPersisted}` **افزودنی** است (تست‌هایِ موجود که
   `processed` را می‌سنجیدند دست‌نخورده سبز ماندند).

**بازیابیِ شغل‌هایِ کهنهٔ `sending` — بررسی شد و عمداً پیاده نشد:**
بازگرداندنِ خودکار به صف مستلزمِ اثباتِ سه چیز بود: مالکیت (✓ از رکوردِ پایدار)، امنیتِ تلاشِ
مجدد، و رفتارِ عملیاتِ خارجیِ تکراری. دو موردِ آخر **قابلِ اثبات نبودند**: هیچ سازوکارِ
idempotency سمتِ گیرنده اثبات‌شده‌ای وجود ندارد و ستونِ `claimed_at`/`worker_id` هم در
اسکیمان نیست، پس «در حالِ اجرا رویِ نمونهٔ دیگر» از «رهاشده پس از crash» قابلِ تفکیک نیست ⇒
requeue می‌توانست **پرداخت/ارسالِ تکراریِ واقعی** بسازد. بنابراین کاری که انجام شد:
* کلیدِ `idempotency-key: <kind>:<job_id>` رویِ هر دو درخواستِ خارجی، ساخته‌شده از **رکوردِ
  پایدار** (نه payload) تا گیرنده بتواند تکرار را رد کند؛
* وضعیت‌هایِ پایانیِ صریح (`dead` پس از سقفِ تلاش) + گزارشِ بلندِ `stateNotPersisted` به‌جایِ
  reset/requeue بی‌صدا؛
* مسیرِ رفعِ باقی‌مانده مستند شد: افزودنِ `claimed_at`/`worker_id`، یک تابعِ
  `SECURITY DEFINER` برایِ جاروبِ بین‌اجاره‌ای، و اثباتِ idempotency سمتِ گیرنده.

**شاهدِ اجرایی:** `queue-failure-persistence.test.ts` — `rowCount=1` ⇒ `retrying` و بدونِ خطایِ
عملیاتی؛ `rowCount=0` ⇒ `stateNotPersisted=1` + پرتابِ `job_state_not_persisted_psp_transaction`
+ لاگ شاملِ `job_type/job_id/tenant_id/rows_updated/target_status`؛ «امن» بودنِ لاگ (نبودِ
شمارهٔ کارت، کلیدِ API و `branch_id` جعلیِ payload)؛ خطایِ پایگاه‌داده هنگامِ ثبتِ شکست ⇒ همان
`stateNotPersisted=1`؛ سقفِ تلاش ⇒ `dead` با `next_retry_at = null` و پارامترهایِ دقیق؛
شکستِ پاک‌سازیِ زمینه در میانهٔ کار ⇒ release **با خطا** (نابودیِ اتصال) + هشدار + ثبتِ وضعیتِ
شغل رویِ اتصالِ تازه (`stateNotPersisted=0`، دو بار `connect`)؛ کلیدِ یکتایی از رکوردِ پایدار؛
و «UPDATE موفقیت با صفر ردیف ⇒ شغل موفق گزارش نمی‌شود».

---

## ۴) GDM-13-03 — بازگشتِ بی‌صدایِ production به هویتِ پایگاه‌دادهٔ ممتاز

**پیش از رفع:** `connectionString: process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL`
⇒ در production بدونِ `APP_DATABASE_URL` کلِ API با نقشِ مدیریتی/ابرکاربر اجرا می‌شد و چون
ابرکاربر، `BYPASSRLS` و «مالکِ جدول» هر سه بیرونِ RLS هستند، همهٔ سیاست‌هایِ
۰۰۲۱/۰۰۴۱/۰۰۴۲/۰۰۴۳ **بی‌اثر** می‌شدند — بدونِ هیچ خطا یا هشداری.

**پس از رفع (fail-closed در production، راحت در توسعه):**

| محیط | قاعده |
|---|---|
| `NODE_ENV=production` | `APP_DATABASE_URL` **الزامی**؛ نبودِ آن ⇒ خطایِ فارسیِ راهنمادار و بالا نیامدنِ برنامه. بازگشت به `DATABASE_URL` ممنوع |
| `NODE_ENV=production` | یکی‌بودنِ نقشِ زمانِ اجرا با نقشِ مهاجرت ⇒ «جداسازیِ هویت‌ها نقض شده» و fail-closed |
| سایر محیط‌ها | بازگشت به `DATABASE_URL` مجاز (راحتیِ توسعه) ولی با **هشدارِ صریح** که اتصالِ ممتاز محافظتِ واقعیِ RLS نیست |

`verifyRuntimeDatabaseIdentity()` در `main.ts` **پیش از** `app.listen` رویِ اتصالِ واقعی اجرا
می‌شود و شش چیز را می‌سنجد: (۱) `rolsuper` نباشد؛ (۲) `rolbypassrls` نباشد؛ (۳) شمارِ جدول‌هایِ
`public` با `pg_get_userbyid(relowner) = current_user` **صفر** باشد؛ (۴) شمارِ رابطه‌هایِ
`public` با `relrowsecurity AND relforcerowsecurity` بزرگ‌تر از صفر باشد (یعنی مهاجرت‌ها واقعاً
اعمال شده‌اند)؛ (۵) `current_setting('app.company_id', true)` در لحظهٔ راه‌اندازی خالی باشد؛
(۶) شاهدِ عملی: `select count(*) from branch` **بدونِ زمینهٔ اجاره** صفر ردیف بدهد. حتی
«راستی‌آزماییِ ناموفق» (پایگاه‌داده در دسترس نیست) در production ⇒ fail-closed. این ماژول فقط
کاتالوگ **می‌خواند**: هیچ `ALTER ROLE`، هیچ `REASSIGN OWNED` و هیچ عملیاتِ ممتازِ خودکار رویِ
پایگاه‌دادهٔ موجود انجام نمی‌شود.

**پیکربندیِ همراه:** `.env.production.example` دو هویت را جدا مستند کرد (`DATABASE_URL` =
مهاجرت، `APP_DATABASE_URL` = زمانِ اجرا) با گامِ دستیِ یک‌بارهٔ
`alter role dms_app login password '<generated>'` (عمداً داخلِ مهاجرت نیست: نقش‌ها
cluster-wideاند و آزمون‌هایِ موازی هم‌زمان مهاجرت اجرا می‌کنند). `docker-compose.yml` برایِ
سرویسِ api مقدارِ `APP_DATABASE_URL` گرفت (چون `NODE_ENV: production` دارد و بدونِ آن طبقِ
قاعدهٔ تازه بالا نمی‌آید) و نقشِ `dms_app` با LOGIN از راهِ
`docker/postgres-init/10-runtime-role.sh` ساخته می‌شود — این اسکریپت توسطِ imageِ postgres
**فقط وقتی volume خالی است** (نخستین `compose up`) اجرا می‌شود، پس هرگز رویِ پایگاه‌دادهٔ
موجود/production نمی‌رود؛ رمزِ پیش‌فرض یک مقدارِ دورانداختنیِ محلی است و با
`APP_DB_PASSWORD` جای‌گزین می‌شود (هیچ رمزِ واقعی در مخزن نیست).

**شاهدِ اجرایی:** ۹ تستِ DB-free (`runtime-identity.test.ts`) برایِ قواعدِ محیطی و هر شش
بررسی + دو تستِ **Postgresِ واقعی**: (الف) دقیقاً همان سوءپیکربندیِ یافته —
`APP_DATABASE_URL` رویِ نقشِ مدیریتی — زیرِ `NODE_ENV=production` با پیامِ «ابرکاربر» **رد
می‌شود**، و برایِ مقایسه همان هویت **بدونِ زمینهٔ اجاره ردیفِ اجاره‌محور می‌خواند**
(`visibleTenantRowsWithoutContext > 0`) یعنی RLS دربارهٔ او واقعاً بی‌اثر است؛ بیرون از
production پرتاب نمی‌کند ولی مشکلات را گزارش می‌دهد. (ب) نقشِ مقصودِ `dms_app` هر شش بررسی را
پاس می‌کند: `isSuperuser=false`، `bypassRls=false`، `ownedTables=0`،
`rlsForcedTables>100`، `tenantGucAtStartup=''` و خواندنِ بی‌زمینهٔ جدولِ اجاره‌محور **صفر ردیف**.

---

## ۵) فرمان‌هایِ آزمون و خروجیِ واقعی

شمارِ دقیقِ تست‌هایِ TASK-14 (خروجیِ واقعیِ `vitest`):
`tenant-connection-lifecycle` **۱۱**، `queue-failure-persistence` **۸**، `runtime-identity` **۹**
(مجموعاً ۲۸ تستِ تازهٔ DB-free) و `db-privileges.api.test.ts` از ۶۱ به **۶۵** بلوکِ `it` رسید
(۴ شاهدِ Postgresِ واقعی).

> **یادداشتِ تطبیقِ TASK-15:** شمارِ تستِ `runtime-identity.test.ts` در نسخهٔ نخستِ این گزارش
> در یک جا «۱۰» و در جایِ دیگر «۹» نوشته شده بود. در TASK-15 از دو راهِ مستقل راستی‌آزمایی شد:
> شمارِ بلوک‌هایِ `it(` در منبع = **۹**، و خروجیِ اجرایِ تازهٔ vitest =
> `✓ test/runtime-identity.test.ts (9 tests)`. عددِ درست **۹** است و در هر دو جا یکسان شد.
> نتایجِ تاریخیِ TASK-14 (۱۲ فایل / ۱۹۵ تستِ DB-free) دست‌نخورده باقی ماند؛ TASK-15
> **۴ تستِ وابسته به پایگاه‌داده** در فایلِ جداگانهٔ
> `apps/api/test/postgres-init-role.api.test.ts` افزود که جزوِ شمارِ DB-free نیستند.

```bash
$ npx tsc -p apps/api/tsconfig.json --noEmit
(بدونِ خروجی، exit 0)

$ cd apps/api && npx vitest run --exclude '**/*.api.test.ts'
 Test Files  12 passed (12)
      Tests  195 passed (195)          # پیش از TASK-14: ۹ فایل / ۱۶۷ تست

$ git status --porcelain
(تمیز)
```

## ۶) نتایجِ CI رویِ `e1d12b5` (و `c481c61` با محتوایِ کدِ یکسان)

| Workflow / Job | نتیجه |
|---|---|
| مهاجرت‌های پایگاه‌داده (up→down→up، ۴۵ مهاجرت) | ✅ **success** — بدونِ تغییر نسبت به TASK-12 |
| CI › Static checks (typecheck, OpenAPI, contract drift) | ✅ **success** |
| CI › Unit tests (no DB, no MinIO) | ✅ **success** — ۱۲ فایل / ۱۹۵ تست |
| CI › Integration (Postgres) — API + tenant isolation | ✅ **success** — با ۶ تستِ تازهٔ TASK-14 |
| CI › Integration (MinIO) — attachment round-trip | ❌ **BLOCKED** (بدونِ تغییر: `s3_roundtrip=FAILED`) |
| e2e (Playwright) | ❌ **BLOCKED** در گیت ⇒ **۰ تستِ مرورگر اجرا شد** |

دو اجرایِ پی‌درپی (`c481c61` و `e1d12b5`) همین نتیجه را دادند: هر چهار jobِ کدی سبز و فقط
دو گیتِ BLOCKEDِ میراثی قرمز. هیچ‌کدام از این دو شکست به تغییراتِ TASK-14 مربوط نیست و
دقیقاً همان تشخیصِ TASK-12 را تکرار می‌کند
(`image=adobe/s3mock:3.9.1 pulled_and_started=yes s3_roundtrip=FAILED`).

هیچ تستی skip، حذف یا سست نشد؛ دو گیتِ BLOCKED دست‌نخورده حفظ شدند. **هیچ ادعایِ موفقیّتِ S3
یا Playwright وجود ندارد** — round-tripِ واقعیِ ضمیمه و تستِ مرورگری در این دور هم اجرا نشد.

---

## ۷) باقی‌مانده‌ها (BLOCKED / UNVERIFIED)

| مورد | وضعیت | دلیل و مسیرِ رفع |
|---|---|---|
| round-tripِ S3 و تست‌هایِ Playwright | **BLOCKED** | `adobe/s3mock:3.9.1` بالا می‌آید ولی هیچ‌چیز رویِ پورت پاسخ نمی‌دهد (`root_http=000`)؛ چهار نامزدِ دیگر در pull شکست می‌خورند. نیازمندِ secretِ رجیستری برایِ MinIO یا تصویبِ imageِ مشخص با چرخهٔ تشخیصیِ لاگِ startup |
| بوتِ واقعیِ پشتهٔ compose با `dms_app` | **UNVERIFIED** | در این sandbox هیچ docker/postgres محلی نیست؛ قواعد با تستِ Postgresِ واقعی زیرِ همان نقش اثبات شد، ولی «بالا آمدنِ کانتینرِ api» اجرا نشد |
| ردیفِ `exit(1)` در سطحِ فرآیند (`main.ts`) | **UNVERIFIED** | `verifyRuntimeDatabaseIdentity` با Postgresِ واقعی سنجیده شد؛ خودِ `bootstrap()` در CI اجرا نمی‌شود (تست‌ها `app.init()` می‌کنند، نه `main.ts`) |
| بازیابیِ خودکارِ شغل‌هایِ کهنهٔ `sending` | **عمداً پیاده نشد** | امنیتِ تلاشِ مجدد و رفتارِ عملیاتِ خارجیِ تکراری قابلِ اثبات نیست؛ نیازمندِ `claimed_at`/`worker_id` + جاروبِ `SECURITY DEFINER` + idempotencyِ سمتِ گیرنده |
| اثرِ `fn_job_mark_dead` (نوعِ بازگشتی `void`) | **UNVERIFIED از سطحِ برنامه** | چون `SECURITY DEFINER` و `void` است، `rowCount` به فراخوان نمی‌رسد؛ تغییرِ امضا یعنی مهاجرتِ تازه که در حیطهٔ این دور نبود. شغل در این مسیر «موفق» شمرده نمی‌شود |
| نرخ‌گذاریِ چندنمونه‌ای (میراثِ TASK-12) | **UNVERIFIED** | شمارنده درون‌فرآیندی است ⇒ در چند replica سقفِ مؤثر ≈ حد × replica. Redis وابستگیِ قطعیِ سامانه است، پس مسیر روشن است ولی پیاده نشد |
| `feature_flag.scope_type='user'` (میراثِ TASK-12) | **BLOCKED** | fail-closed؛ نیازمندِ تصمیمِ محصولی دربارهٔ معناشناسیِ `scope_id` |
| `REASSIGN OWNED` / انتقالِ مالکیتِ جدول‌ها | **انجام نشد** | نیازمندِ رویهٔ جداگانهٔ تصویب‌شده با پشتیبانِ بازگشت‌پذیر |

---

## ۸) انطباق با قواعدِ ایمنیِ الزامی

دسترسی به پایگاه‌دادهٔ production: **نداشت** · تغییرِ پایگاه‌دادهٔ مشترک: **نداشت** (همهٔ
آزمون‌ها رویِ پایگاهِ دوراندختنیِ `greendms_db_privileges_test`) · رمز/secret در کد یا سند:
**نداشت** · `REASSIGN OWNED`: **اجرا نشد** · restartِ سرویس یا تغییرِ زیرساخت: **نداشت** ·
تغییرِ ماژول‌هایِ بی‌ربط: **نداشت** (فقط سه محلِ سه یافته + تست و سندِ همان‌ها) · انتقالِ
مالکیتِ مهاجرت: **انجام نشد** · کامیت‌ها و شواهدِ پیشین: **حفظ شد** · وابستگیِ تازه:
**نصب نشد** (بدونِ تغییرِ manifest/lockfile) · جداسازیِ تست: **اثبات شد** (دو استخرِ
دورانداختنیِ جدا در همان فایلِ harnessِ موجود) · ادعایِ PASS بدونِ شاهدِ اجرا: **نداشت**.
