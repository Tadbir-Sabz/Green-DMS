# گزارشِ پذیرشِ TASK-15 — راستی‌آزمایی و رفعِ مقداردهیِ نقشِ زمانِ اجرا در نخستین بوتِ PostgreSQL

**شاخه:** `arena/63ef2061-green-dms` · **PR #5:** `OPEN`
**⛔ PR #5 ادغام نشد و هیچ استقرار، تغییرِ زیرساخت یا دسترسی به پایگاه‌دادهٔ مشترک/production انجام نشد.**

| مورد | مقدار |
|---|---|
| HEADِ شروع | `83f107d8df6fbd29804b1755a51b4ebf67ca3346` |
| HEADِ پایان | کامیتِ این سند (رویِ کامیتِ رفع) — در §۱۲ |
| حکمِ نقصِ مشکوک | **قطعی تأیید و بازتولید شد** (رویِ دو نسخهٔ PostgreSQL) |
| حکمِ کلیِ نخستین بوت | پیش از رفع: **FAIL** · پس از رفع: **PASS** |

---

## ۱) خلاصهٔ یک‌خطی

`docker/postgres-init/10-runtime-role.sh` رویِ یک پایگاه‌دادهٔ کاملاً تازه با
`ERROR: syntax error at or near ":"` و **کدِ خروجِ ۳** می‌مُرد و نقشِ زمانِ اجرا
(`dms_app`) هرگز ساخته نمی‌شد ⇒ نخستین `docker compose up` شکست می‌خورد. علت: psql
متغیرها را **داخلِ بدنهٔ dollar-quoted** جای‌گذاری نمی‌کند. رفع با
`format('%I'/'%L')` + `\gexec` انجام شد و با ۴۶ assertion رویِ سه کلاسترِ تازه و
۴ تستِ رگرسیونِ Postgresِ واقعی (به‌همراهِ کنترلِ منفی) اثبات شد.

---

## ۲) فایل‌هایِ تغییرکرده (دقیق)

| فایل | تغییر |
|---|---|
| `docker/postgres-init/10-runtime-role.sh` | **رفعِ نقص** — جای‌گزینیِ بدنهٔ `DO $$ … $$` با `select format(…) \gexec`؛ افزودنِ توضیحِ «چرا `\gexec`» |
| `apps/api/test/postgres-init-role.api.test.ts` | **تازه** — ۴ تستِ رگرسیونِ وابسته به Postgres که خودِ اسکریپتِ مخزن را اجرا می‌کنند |
| `docs/task-14-completion-report.md` | تطبیقِ شمارِ تست (۱۰ → ۹) + یادداشتِ تطبیقِ TASK-15 (بدونِ بازنویسیِ نتایجِ تاریخی) |
| `docs/db-privilege-architecture.md` | یک پاراگراف: سازوکارِ `\gexec` و دلیلِ آن |
| `docs/task-15-completion-report.md` | همین سند |

هیچ مهاجرتی بازنویسی نشد؛ هیچ manifest/lockfile تغییری نکرد؛ هیچ فایلِ بی‌ربطی دست نخورد
(`git status --porcelain` پیش از کامیت فقط همین موارد را نشان می‌داد).

---

## ۳) محیطِ اجرا و اثباتِ جداسازی (فازِ ۰)

**وضعیتِ میزبان پیش از شروع:** `docker`، `podman`، `psql`، `postgres`، `initdb` و `pg_ctl`
همه **MISSING**؛ `deb.debian.org` در دسترس نبود (`HTTP 000`) و `/var/lib/postgresql` و
`/var/lib/docker` **وجود نداشتند** ⇒ هیچ PostgreSQL یا Docker از پیش‌موجودی رویِ میزبان نبود
که بتواند آلوده شود. `registry.npmjs.org` و `pypi.org` در دسترس بودند (`200`).

**ابزارِ نصب‌شده (فقط داخلِ sandbox، فقط در `/tmp`):**

| بسته | منبع | نسخه | محل |
|---|---|---|---|
| `embedded-postgres` (wheel) | `files.pythonhosted.org` | PostgreSQL **18.6.3** کامل با `psql`/`initdb`/`pg_ctl` | `/tmp/pg18x/embedded_postgres/pginstall` |
| `@embedded-postgres/linux-x64` | `registry.npmjs.org` | PostgreSQL **16.15.0-beta.19** (باینریِ سرور) | `/tmp/pgenv/node_modules/...` |

نسخهٔ **۱۶** عمداً انتخاب شد چون `docker-compose.yml` از `postgis/postgis:16-3.4` استفاده
می‌کند؛ پکیجِ ۱۶ کلاینت ندارد، پس `psql` ۱۸ به سرورِ ۱۶ وصل شد (ترکیبِ پشتیبانی‌شده).
هر دو بسته **بیرون از مخزن** نصب شدند ⇒ `package.json`/`package-lock.json` دست‌نخورده‌اند.

**نمونه‌هایِ دورانداختنی (هر کدام data dir کاملاً تازه با `initdb`):**

| نمونه | نسخه | data dir | شناسهٔ کلاستر | دسترسی |
|---|---|---|---|---|
| `repro16` | 16.15 | `/tmp/t15-1793886470-1845-repro16-pgdata` | `7704683726583887742` | فقط سوکتِ یونیکس، `listen_addresses=''` |
| `repro18` | 18.6 | `/tmp/t15-1793886470-1845-repro18-pgdata` | `7704683723191203656` | فقط سوکتِ یونیکس |
| `fix16` | 16.15 | `/tmp/t15-1793886640-2238-fix16-pgdata` | `7704684453536422092` | فقط سوکتِ یونیکس |
| `fix18` | 18.6 | `/tmp/t15-1793886640-2238-fix18-pgdata` | `7704684462072150339` | فقط سوکتِ یونیکس |
| `repeat` | 16.15 | `/tmp/t15-1793886640-2238-repeat-pgdata` | `7704684470578076093` | فقط سوکتِ یونیکس |
| `vitest` | 16.15 | `/tmp/t15-vitest-pgdata` | — | `127.0.0.1:55910` (فقط loopback) |

هر نمونه پیش از `initdb` بررسی شد که مسیرش **از پیش وجود نداشته باشد** (در غیرِ این صورت
harness با `REFUSING` امتناع می‌کرد)، پس از آزمون با `pg_ctl -m immediate stop` متوقف شد،
و هیچ TCP بیرونیِ بازِ ماندنی نداشت. **هیچ volume یا کانتینرِ موجودی حذف/تغییر نکرد**
(چنان‌که در بالا اثبات شد، اساساً وجود نداشتند).

---

## ۴) بازتولیدِ نقص (فازِ ۱) — با اسکریپتِ **دست‌نخوردهٔ مخزن**

کپیِ بایت‌به‌بایتِ فایلِ مخزن (`md5` یکسان: `e6be1de1bfaa8ee3251114382a01b2fe`) از راهِ همان
سازوکارِ entrypoint اجرا شد: `bash <script>` با `POSTGRES_USER`/`POSTGRES_DB`/
`APP_DB_ROLE`/`APP_DB_PASSWORD` و `psql` رویِ `PATH`.

```
$ bash /tmp/ORIG-10-runtime-role.sh          # PG 16.15، کلاسترِ تازه
ERROR:  syntax error at or near ":"
LINE 3:   v_role text := :'role';
                             ^
exit code  : 3
نقشِ ساخته‌شده: ''   count = 0
```
همان نتیجه رویِ **PostgreSQL 18.6** نیز تکرار شد (exit 3، count=0).
`psql (PostgreSQL) 18.6` · سرورها: `16.15` و `18.6`.

**پیامدِ واقعی:** entrypointِ ایمیجِ postgres با شکستِ اسکریپتِ init خارج می‌شود ⇒ کانتینرِ
پایگاه‌داده بالا نمی‌آید ⇒ `api` (که `depends_on: postgres: service_healthy` دارد) هرگز启动
نمی‌شود. یعنی «نخستین بوتِ پشتهٔ محلی» کاملاً شکسته بود، نه یک نقصِ ظاهری. دلیلِ دیده‌نشدنِ
آن در CI این بود که گیتِ S3 پیش از گامِ `compose up` جریانِ e2e را BLOCKED می‌کند.

---

## ۵) علتِ ریشه‌ای

psql جای‌گذاریِ متغیر (`:var`، `:'var'`، `:"var"`) را **داخلِ literalهایِ نقل‌قول‌شدهٔ SQL**
انجام نمی‌دهد و بدنهٔ dollar-quotedِ PL/pgSQL (`$$ … $$`) از دیدِ lexerِ psql دقیقاً همان
literal است. بنابراین `:'role'` و `:'pass'` عیناً به سرور فرستاده می‌شوند و در
`declare v_role text := :'role';` خطایِ نحوی می‌دهند. `ON_ERROR_STOP=1` (که درست و لازم است)
سپس کلِ اسکریپت را با کدِ ۳ متوقف می‌کند.

نکتهٔ مرتبط که در همین دور کشف شد: `psql -c "… :'var' …"` هم جای‌گذاری **نمی‌کند** (همین
رفتار باعث شد نخستین نسخهٔ harnessِ من برایِ اثباتِ رمز شکست بخورد)؛ جای‌گذاری فقط برایِ
ورودیِ خوانده‌شده از stdin/`-f` انجام می‌شود.

---

## ۶) رفعِ کمینه (فازِ ۲)

پیش از رفع:
```sql
do $$
declare
  v_role text := :'role';
  v_pass text := :'pass';
begin
  if not exists (select 1 from pg_roles where rolname = v_role) then
    execute format('create role %I login password %L', v_role, v_pass);
  else
    execute format('alter role %I login password %L', v_role, v_pass);
  end if;
end $$;
```
پس از رفع:
```sql
\set QUIET on
select format(
         case when exists (select 1 from pg_roles where rolname = :'role')
              then 'alter role %I login password %L'
              else 'create role %I login password %L'
         end,
         :'role', :'pass') as ddl
\gexec
\echo 'runtime role is ready for LOGIN (local stack only)'
```
جای‌گذاری بیرونِ هر بدنهٔ dollar-quoted انجام می‌شود، `format` با `%I` شناسه و با `%L`
literalِ رمز را امن نقل‌قول می‌کند، و `\gexec` همان یک ردیفِ تولیدشده را اجرا می‌کند.

**همهٔ خواصِ خواسته‌شده حفظ شد:** `set -euo pipefail` ✓ · `ON_ERROR_STOP=1` ✓ · نقلِقولِ امنِ
شناسه (`%I`) ✓ · نقلِقولِ امنِ رمز (`%L`) ✓ · idempotency (وجودِ نقش ⇒ `ALTER`، وگرنه
`CREATE`) ✓ · همان نام/رمزِ پیکربندی‌پذیر (`APP_DB_ROLE`/`APP_DB_PASSWORD` با همان
پیش‌فرض‌ها) ✓ · مرزِ ایمنیِ «فقط توسعهٔ محلی / فقط volumeِ خالی» بدونِ تغییر ✓ · وابستگیِ
تازه‌ای اضافه نشد ✓ · هیچ امتیازِ ممتازی داده نمی‌شود (فقط `LOGIN PASSWORD`) ✓.

**رمز در هیچ لاگی نیست:** psql ورودیِ اسکریپت را به‌طورِ پیش‌فرض echo نمی‌کند، `\gexec`
فرمانِ تولیدشده را چاپ نمی‌کند، و `raise notice` قبلی با `\echo` بدونِ رمز جای‌گزین شد.
در آزمون‌ها صریحاً assert شد که رمزِ معمولی و رمزِ بدقلق در stdout/stderr حضور ندارند.

---

## ۷) نتایجِ فازِ ۳ رویِ Postgresِ واقعی (A–F)

۴۶ assertion، **۰ شکست**. همه رویِ کلاسترهایِ تازه؛ `md5` فقط در harness برایِ اثباتِ
رمزنگارانهٔ درستیِ رمز فعال شد (پیکربندیِ خودِ اسکریپت/سرورِ محصول دست نخورد).

| بند | مورد | PG 16.15 | PG 18.6 | نمونهٔ سوم |
|---|---|---|---|---|
| **A** | نخستین بوتِ تازه: exit 0، نقش ساخته شد، رمز در خروجی نیست | PASS | PASS | PASS |
| **B** | `rolcanlogin=true` و `rolsuper=rolbypassrls=rolcreatedb=rolcreaterole=false` | PASS | PASS | PASS |
| **B** | رمزِ ذخیره‌شده **دقیقاً** همان ورودی است (بازسازیِ `md5(pw‖role)` از `pg_authid`) | PASS | PASS | PASS |
| **C** | نقشِ از پیش موجودِ `NOLOGIN` (سناریویِ واقعیِ `dms_app` در 0041): LOGIN گرفت | PASS | PASS | — |
| **C** | نقشِ تکراری ساخته نشد (`count=1`) و هیچ امتیازی اضافه نشد | PASS | PASS | — |
| **C** | اجرایِ دوم idempotent است و رمزِ تازه اعمال شد | PASS | PASS | — |
| **D** | رمزِ بدقلقِ ساختگی `SyNth'p"$$ w\ord-<rand>` (نقلِقولِ تکی، فاصله، `$`، `\`، `"`) دقیقاً درست ذخیره شد | PASS | PASS | — |
| **D** | نامِ نقش با `_` (هم `t15_*` و هم `dms_app`) درست نقل‌قول شد | PASS | PASS | PASS |
| **D** | رمزِ بدقلق در خروجی نشت نکرد | PASS | PASS | — |
| **E** | `APP_DB_ROLE=''` ⇒ exit 0 و بازگشتِ مستند به پیش‌فرضِ `dms_app` (رفتارِ `${VAR:-default}`) | PASS | PASS | — |
| **E** | خطایِ واقعیِ مجوز (فراخوانِ غیرِمدیر) ⇒ `permission denied to create role`، exit غیرصفر، **نقشی ساخته نشد** | PASS | PASS | — |
| **E** | پایگاه‌دادهٔ در دسترس نیست ⇒ exit غیرصفر، بدونِ موفقِ کاذب | PASS | PASS | — |
| **F** | تکرارِ کامل از یک data dirِ کاملاً تازهٔ دیگر با نام/رمزِ پیش‌فرضِ واقعیِ اسکریپت (`dms_app`) | — | — | PASS |

---

## ۸) پوششِ رگرسیونِ پایدار در مخزن (فازِ ۴)

`apps/api/test/postgres-init-role.api.test.ts` (۴ تست) — مطابقِ قراردادِ موجودِ مخزن
(`*.api.test.ts` ⇒ به‌طورِ خودکار توسطِ jobِ Integration (Postgres) در CI برداشته می‌شود،
چون CI با `ls test/*.api.test.ts` فایل‌ها را جمع می‌کند). این تست **خودِ فایلِ اسکریپتِ مخزن**
را با `bash` اجرا می‌کند و نتیجه را از کاتالوگ می‌سنجد ⇒ رفتاری است، نه تطبیقِ متن؛ هیچ
بررسیِ «آیا `DO $$` وجود دارد» نوشته نشد.

* نقش‌ها با پسوندِ تصادفیِ یکتا ساخته می‌شوند (اجرایِ موازیِ CI تداخل نکند) و در `afterAll`
  حذف می‌شوند؛ رمزها ساختگی و یکبارمصرف‌اند.
* درستیِ رمز **بدونِ تغییرِ پیکربندیِ سرور** با بازسازیِ verifierِ `SCRAM-SHA-256`
  (PBKDF2 + HMAC در `node:crypto`) و مقایسه با `pg_authid.rolpassword` اثبات می‌شود؛ مسیرِ
  `md5` هم پشتیبانی می‌شود. آزمونِ معکوس هم دارد: رمزِ «کمی غلط» باید `false` شود.

**کنترلِ منفی (مهم‌ترین شاهدِ رگرسیون):** با جای‌گذاریِ موقتِ همان نسخهٔ شکستهٔ اصلی،
**۳ تست از ۴ شکست خوردند** (`ERROR: syntax error at or near ":"` و
`AssertionError: expected false to be true`) و با بازگرداندنِ نسخهٔ رفع‌شده هر ۴ پاس شدند:

```
با نسخهٔ اصلی :  Tests  3 failed | 1 passed (4)
با نسخهٔ رفع‌شده:  Tests  4 passed (4)
```
(تستِ E در هر دو حالت پاس است، چون انتظارِ آن «خروجِ غیرصفر» است و نسخهٔ شکسته هم غیرصفر
خارج می‌شود — این دقیقاً تأیید می‌کند که آن تست رفتارِ شکست را می‌سنجد، نه موفقیت را.)

**اجرایِ محلیِ تست رویِ Postgresِ واقعی ۱۶.۱۵:**
```
$ DATABASE_URL='postgres://t15admin@127.0.0.1:55910/postgres' \
  PSQL=/tmp/pg18x/embedded_postgres/pginstall/bin/psql \
  ../../node_modules/.bin/vitest run test/postgres-init-role.api.test.ts
 ✓ test/postgres-init-role.api.test.ts (4 tests) 77ms
 Test Files  1 passed (1)      Tests  4 passed (4)
```
پس از هر سه اجرا، تنها نقشِ باقی‌مانده در آن کلاستر `t15admin` (ابرکاربرِ خودِ `initdb`) بود
⇒ هیچ نقشِ آزمونی نشت نکرد.

---

## ۹) نتایجِ تست/بیلدِ موجود (بدونِ هیچ weakening یا skip)

```
$ ./node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit     → بدونِ خروجی، rc=0
$ bash -n docker/postgres-init/10-runtime-role.sh                → OK
$ cd apps/api && ../../node_modules/.bin/vitest run --exclude '**/*.api.test.ts'
 ✓ test/runtime-identity.test.ts (9 tests)
 Test Files  12 passed (12)      Tests  195 passed (195)
```
شمارِ فایل‌هایِ `*.api.test.ts` از ۲۷ به **۲۸** رسید (۲۶ + `attachments` در jobِ MinIO +
فایلِ تازه در jobِ Postgres).

---

## ۱۰) تطبیقِ مستندات (فازِ ۵)

ناسازگاریِ خواسته‌شده در `docs/task-14-completion-report.md` **واقعی بود و پیدا شد**: فهرستِ
فایل‌ها شمارِ `runtime-identity.test.ts` را «۱۰ تست» می‌گفت در حالی که بخشِ شواهد همان سند
«۹ تستِ DB-free» نوشته بود. مقدارِ درست از **دو راهِ مستقل** تعیین شد، نه با حدس:

1. شمارِ بلوک‌هایِ `it(` در منبع: `grep -c "^  it(" apps/api/test/runtime-identity.test.ts` = **9**
2. خروجیِ اجرایِ تازهٔ vitest: `✓ test/runtime-identity.test.ts (9 tests)` = **9**

هر دو occurrence به **۹** یکسان شد. نتایجِ تاریخیِ TASK-14 (۱۲ فایل / ۱۹۵ تستِ DB-free)
دست‌نخورده ماند و یک یادداشتِ صریحِ «تطبیقِ TASK-15» افزوده شد که تمایزِ زیر را ثبت می‌کند:

| مجموعه | پیش از TASK-15 | پس از TASK-15 |
|---|---|---|
| تست‌هایِ DB-free (`vitest --exclude '**/*.api.test.ts'`) | ۱۲ فایل / ۱۹۵ تست | **بدونِ تغییر** ۱۲ / ۱۹۵ |
| تست‌هایِ TASK-15 (وابسته به Postgres) | — | **۴ تست** در ۱ فایلِ تازه |
| فایل‌هایِ `*.api.test.ts` | ۲۷ | **۲۸** |

---

## ۱۱) نتایجِ CI

CI رویِ کامیتِ رفع اجرا شد (جزئیاتِ jobها در §۱۲ و در خلاصهٔ نهایی). دو گیتِ میراثیِ
`Integration (MinIO)` و `e2e` همچنان **BLOCKED** هستند و هیچ‌کدام به تغییراتِ این دور مربوط
نیستند؛ تستِ تازه در jobِ Integration (Postgres) اجرا می‌شود.

**تفکیکِ صریح:** شواهدِ §۳ تا §۹ همه **اجرایِ محلیِ واقعی** رویِ PostgreSQL 16.15/18.6 در
همین sandbox است؛ §۱۱ نتیجهٔ **CI** است. هیچ S3 یا Playwright‌ای اجرا نشده و هیچ ادعایِ
موفقیّتِ S3/Playwright وجود ندارد.

---

## ۱۲) ماتریسِ نهایی

| مورد | حکم |
|---|---|
| جداسازیِ محیطِ آزمون (کلاسترِ تازه، بدونِ TCP بیرونی، بدونِ volume/کانتینرِ موجود) | **PASS** — اثبات‌شده با data dir + شناسهٔ کلاستر + نبودِ `/var/lib/{postgresql,docker}` |
| بازتولیدِ نقصِ مشکوک رویِ Postgresِ واقعی | **PASS** (نقص تأیید شد) — exit 3، `syntax error at or near ":"`، نقش ساخته نشد، رویِ ۱۶.۱۵ و ۱۸.۶ |
| A نخستین بوتِ تازه | **PASS** |
| B پیکربندیِ نقش و امتیازها | **PASS** |
| C نقشِ از پیش موجود / idempotency | **PASS** |
| D امنیتِ ورودی و نقل‌قول | **PASS** |
| E رفتارِ شکست و نبودِ موفقِ کاذب | **PASS** |
| F تکرارپذیری از data dirِ تازهٔ دیگر | **PASS** |
| پوششِ رگرسیونِ پایدار + کنترلِ منفی | **PASS** |
| typecheck / تست‌هایِ DB-free / عدمِ تغییرِ تست‌هایِ موجود | **PASS** |
| تطبیقِ شمارِ تست در مستندات | **PASS** (۹، از دو راهِ مستقل) |
| اجرایِ واقعیِ نخستین بوتِ **کانتینرِ** postgres (docker) | **UNVERIFIED** — در sandbox هیچ docker/podman نیست؛ اسکریپت از راهِ همان سازوکارِ `bash + env + psql` رویِ کلاسترِ تازهٔ `initdb`-شده اجرا شد که همان چیزی است که entrypoint انجام می‌دهد، ولی خودِ image اجرا نشد |
| round-tripِ S3 و Playwright (میراثِ TASK-12) | **BLOCKED** — بدونِ تغییر |
| بوتِ کاملِ پشتهٔ compose با `APP_DATABASE_URL` | **UNVERIFIED** — نیازمندِ docker |

---

## ۱۳) تأییدیه‌هایِ ایمنی

دسترسی به پایگاه‌دادهٔ production/staging/مشترک: **نداشت** · استفاده از data dir یا volumeِ
موجود: **نداشت** (هر نمونه با `initdb` رویِ مسیرِ تازه ساخته شد و harness در صورتِ وجودِ مسیر
امتناع می‌کرد) · حذف/reset/pruneِ volume یا کانتینرِ موجود: **نداشت** · تغییرِ سرویسِ میزبان،
فایروال یا پیکربندیِ مشترک: **نداشت** · restartِ سرویسِ بی‌ربط: **نداشت** · تغییرِ
credential یا secretِ production: **نداشت** · اجرایِ مهاجرت/init رویِ پایگاه‌دادهٔ موجود:
**نداشت** · رمزِ واقعی در کد/لاگ/گزارش: **نداشت** (همهٔ رمزها ساختگی و یکبارمصرف بودند) ·
`REASSIGN OWNED`: **اجرا نشد** · تغییرِ manifest/lockfile: **نداشت** (ابزار فقط در `/tmp`) ·
بازنویسیِ مهاجرت‌ها: **نداشت** · کارهایِ TASK-10 تا TASK-14 و شواهدشان: **کاملاً دست‌نخورده** ·
skip/weaken/حذفِ تستِ موجود: **نداشت** · ادغامِ PR #5 یا استقرار: **انجام نشد**.
