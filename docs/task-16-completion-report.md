# گزارشِ پذیرشِ TASK-16 — سخت‌سازیِ اعتبارنامهٔ مقداردهیِ PostgreSQL و راستی‌آزماییِ نخستین بوتِ واقعیِ Docker

**شاخه:** `arena/63ef2061-green-dms` · **PR #5:** `OPEN`
**⛔ PR #5 ادغام نشد و هیچ استقرار، تغییرِ زیرساخت، دست‌کاریِ volume موجود یا دسترسی به پایگاه‌دادهٔ مشترک/production انجام نشد.**

| مورد | مقدار |
|---|---|
| HEADِ شروع | `c84bbfcdfaaee52f7820c8a0d145bba9f8d06e01` |
| HEADِ پایان | `af13195b68dd8aa85c50f10c34eb295e8b16e9f8` + کامیتِ به‌روزرسانیِ این سند |
| **SHA راستی‌آزمایی‌شده با CI** | **`af13195`** (نتایج در بخشِ ۹) |
| نسخهٔ PostgreSQLِ آزمایش‌شده | **16.15** (هم‌خانواده با `postgis/postgis:16-3.4` در compose) |
| حکمِ هدفِ ۱ (حذفِ رمز از argv) | **PASS** — با بازرسیِ آرگومانِ واقعیِ فرآیند |
| حکمِ هدفِ ۲ (چرخهٔ init رسمی) | **PASS برای چرخهٔ `docker-entrypoint.sh` رسمی** · **BLOCKED برای کانتینر/Compose واقعی** |

---

## ۱) خلاصهٔ یک‌خطی

`docker/postgres-init/10-runtime-role.sh` رمزِ پایگاه‌دادهٔ زمانِ اجرا را با
`-v pass="$RUNTIME_PASSWORD"` روی **خطِ فرمانِ `psql`** می‌گذاشت؛ argv در لینوکس از
`/proc/<pid>/cmdline` برای **هر کاربرِ محلی** خواناست و تا پایانِ عمرِ فرآیند
قابلِ خواندن می‌ماند. رمز اکنون از راهِ **متغیرِ محیطی** صادر و داخلِ psql با
**`\getenv`** خوانده می‌شود (`/proc/<pid>/environ` مجوزِ `0400` دارد و فقط برایِ
مالکِ فرآیند خواناست). بقیهٔ سازوکارِ TASK-15 (`format('%I'/'%L')` + `\gexec` +
`ON_ERROR_STOP=1` + idempotency + مقادیرِ پیش‌فرض) **بدونِ تغییر** باقی ماند.
درستیِ رفع با **ضبطِ argv واقعیِ فرآیند** (نه تطبیقِ متنِ سورس) و با اجرایِ
**`docker-entrypoint.sh` رسمیِ ایمیجِ postgres** رویِ سه PGDATA کاملاً تازه اثبات شد.

---

## ۲) فایل‌هایِ تغییرکرده (دقیق)

| فایل | تغییر |
|---|---|
| `docker/postgres-init/10-runtime-role.sh` | **رفعِ نقص** — حذفِ `-v role=` / `-v pass=` از خطِ فرمانِ psql؛ `export GREEN_DMS_RUNTIME_ROLE` / `GREEN_DMS_RUNTIME_PASSWORD` + `\getenv role …` / `\getenv pass …` داخلِ heredocِ نقل‌قول‌شده؛ توضیحِ «چرا argv نشتی است» |
| `apps/api/test/postgres-init-role.api.test.ts` | افزودنِ تستِ **F** (رمز هرگز در argv نیست) با **wrapper واقعیِ `psql`** که آرگومان‌هایِ فرآیند را ضبط می‌کند + ثابت‌هایِ `ROLE_ARGV`/`PW_ARGV` + import هایِ `fs`/`os` + اصلاحِ ترتیبِ `PATH` در `runScript`. شمارِ تست‌ها: **۴ → ۵** |
| `docs/task-16-completion-report.md` | همین سند |

`git diff --stat` پیش از کامیت:

```
 apps/api/test/postgres-init-role.api.test.ts | 66 ++++++++++++++++++++++++++--
 docker/postgres-init/10-runtime-role.sh      | 30 ++++++++++---
 2 files changed, 88 insertions(+), 8 deletions(-)
```

هیچ مهاجرتی بازنویسی/حذف نشد (`git diff --name-only c84bbfc..HEAD -- migrations/` تهی است)،
هیچ manifest/lockfile ای تغییر نکرد، هیچ سرویسِ بی‌ربطی دست نخورد، و هیچ تستی
skip/ضعیف/حذف نشد (شمارِ تست‌ها فقط **افزایش** یافت).

---

## ۳) چرا argv یک نشتیِ واقعی است، و سازوکارِ جای‌گزین

**پیش از رفع:**

```bash
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
     -v role="$RUNTIME_ROLE" -v pass="$RUNTIME_PASSWORD" <<'EOSQL'
```

- `/proc/<pid>/cmdline` رویِ لینوکس **world-readable** است ⇒ هر کاربرِ محلی،
  عاملِ پایش، `ps`، جمع‌کنندهٔ لاگِ کانتینر یا crash reporter می‌توانست رمزِ نقشِ
  زمانِ اجرا را در تمامِ مدتِ اجرایِ اسکریپتِ نخستین بوت بخواند.
- در محیطِ کانتینر این خطر بزرگ‌تر است: همهٔ فرآیندهایِ یک namespace معمولاً با
  یک UID اجرا می‌شوند و `ps auxww` درونِ کانتینر argv کامل را نشان می‌دهد.

**پس از رفع (فقط انتقالِ کانال، بدونِ هیچ تغییرِ معنایی):**

```bash
export GREEN_DMS_RUNTIME_ROLE="$RUNTIME_ROLE"
export GREEN_DMS_RUNTIME_PASSWORD="$RUNTIME_PASSWORD"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'EOSQL'
\set QUIET on
\getenv role GREEN_DMS_RUNTIME_ROLE
\getenv pass GREEN_DMS_RUNTIME_PASSWORD
select format(
         case when exists (select 1 from pg_roles where rolname = :'role')
              then 'alter role %I login password %L'
              else 'create role %I login password %L'
         end,
         :'role', :'pass'
       ) as ddl
\gexec
\echo 'runtime role is ready for LOGIN (local stack only)'
EOSQL
```

نکاتِ حفظ‌شده:

- `/proc/<pid>/environ` مجوزِ **0400** دارد (فقط مالکِ فرآیند) ⇒ کانالِ امن‌تر.
- `:'role'` / `:'pass'` همچنان **بیرونِ هر بدنهٔ dollar-quoted** جای‌گذاری می‌شوند
  (علتِ ریشه‌ایِ شکستِ نخستین بوت در TASK-15).
- `format('%I')` شناسه و `format('%L')` literalِ رمز را امن نقل‌قول می‌کند ⇒
  رمزهایِ دارایِ `'`، `"`، `$`، فاصله و `\` سالم می‌رسند.
- `\gexec` تنها سطرِ تولیدشده را اجرا می‌کند و **آن را چاپ نمی‌کند** ⇒ رمز به لاگ نمی‌رسد.
- `ON_ERROR_STOP=1` ⇒ هر خطا کلِ init را با کدِ غیرصفر شکست می‌دهد (موفقِ کاذب نداریم).
- idempotency: نقشِ موجود `ALTER ROLE … LOGIN PASSWORD …` می‌شود، نه `CREATE` تکراری.
- مرزِ init **تضعیف نشد**: اسکریپت همچنان فقط از `/docker-entrypoint-initdb.d`
  (یعنی فقط وقتی data directory خالی است) اجرا می‌شود، و هیچ امتیازِ ممتازی
  (`SUPERUSER`/`BYPASSRLS`/`CREATEDB`/`CREATEROLE`) نمی‌دهد.
- `\getenv` از **psql 14** به بعد موجود است؛ ایمیجِ compose نسخهٔ 16 است ⇒ سازگار.

---

## ۴) فازِ ۲ — تستِ واقعیِ «رمز در argv نیست» (نه تطبیقِ متن)

تستِ **F** در `apps/api/test/postgres-init-role.api.test.ts` یک `psql` **wrapper اجراییِ
واقعی** در یک دایرکتوریِ موقت می‌سازد، آن را در ابتدایِ `PATH` قرار می‌دهد، سپس
**خودِ اسکریپتِ مخزن** را اجرا می‌کند. wrapper برایِ هر فراخوانی:

1. همهٔ آرگومان‌هایِ واقعی (`"$@"`) را **جدا‌شده با NUL** در یک فایل ثبت می‌کند؛
2. فقط یک پرچمِ بولیِ `env-pass-present:yes|no` می‌نویسد (**مقدارِ رمز هرگز در
   لاگ نوشته نمی‌شود**)؛
3. با `exec` به **مسیرِ مطلقِ** psql واقعی می‌رود (تا بازگشتِ بی‌پایان رخ ندهد).

ادعاهایِ تست:

- wrapper واقعاً psql را رهگیری کرده است (تعدادِ آرگومان‌ها > ۳ و وجودِ
  `ON_ERROR_STOP=1` و `--username`) — بدونِ این، ادعایِ «رمز در argv نیست» **پوچ** بود؛
- **هیچ عنصرِ argv** شاملِ `PW_ARGV` (= ``a'rg$$ v\w"x-<run>``) نیست؛
- هیچ فلگِ `pass=` یا `role=` ارسال نشده است؛
- خودِ فایلِ argv.log عاری از رمز است؛
- `env-pass-present:yes` ⇒ رمز از راهِ محیط رسیده است؛
- نقش ساخته شده و **verifier ذخیره‌شدهٔ SCRAM/md5 با همان رمز می‌خواند**
  (درستیِ مقدار بدونِ چاپِ آن).

`runScript` اکنون `PATH` را **آخر** تنظیم می‌کند
(`const { PATH: extraPath, ...rest } = override`) تا override دایرکتوریِ wrapper را
**پیش‌افزایی** کند نه جای‌گزینیِ کلِ PATH (در غیر این صورت `spawnSync bash ENOENT`).

**کنترلِ منفی (مهم‌ترین بخشِ اعتبارِ تست):** با جای‌گذاریِ نسخهٔ پیشینِ اسکریپت
(`git show HEAD:docker/postgres-init/10-runtime-role.sh`) تستِ **F شکست می‌خورد**
(`AssertionError: expected true to be false` — یعنی رمز در argv **پیدا شد**) در حالی که
۴ تستِ دیگر پاس می‌مانند؛ با بازگرداندنِ فایلِ رفع‌شده دوباره **۵/۵ پاس**.
پس تست دقیقاً همان ویژگیِ امنیتی را می‌سنجد.

لیستِ نهاییِ تست‌ها (۵ مورد، همه پاس):

| # | عنوان |
|---|---|
| A/B | بوتِ تازه: نقش ساخته می‌شود، LOGIN دارد و هیچ امتیازِ ممتازی نمی‌گیرد |
| C | نقشِ از پیش موجودِ NOLOGIN (سناریویِ واقعیِ `dms_app` در 0041): LOGIN می‌گیرد، تکراری ساخته نمی‌شود |
| D | رمزِ بدقلق با نقلِقول، فاصله، `$` و بک‌اسلش دقیقاً درست ذخیره می‌شود |
| **F** | **رمز هرگز در آرگومانِ خطِ فرمانِ psql نیست (از راهِ env و `\getenv` می‌رسد)** |
| E | پیکربندیِ نامعتبر ⇒ خروجِ غیرصفر و «موفقِ کاذب» نداریم |

---

## ۵) فازِ ۳ — راستی‌آزماییِ چرخهٔ مقداردهیِ رسمیِ ایمیجِ PostgreSQL

**روش:** `docker-entrypoint.sh` **رسمیِ** مخزنِ `docker-library/postgres`
(مسیرِ `16/bookworm`، blob sha `8d507bc40798`، ۱۴۵۷۷ بایت — دریافت از
`api.github.com`) عیناً همان اسکریپتی است که ایمیجِ `postgis/postgis:16-3.4`
(بر پایهٔ همان ایمیجِ رسمیِ postgres:16) به‌عنوانِ ENTRYPOINT اجرا می‌کند. آن را با
باینری‌هایِ **PostgreSQL 16.15** و با اسکریپتِ مخزن که در
`/docker-entrypoint-initdb.d/10-runtime-role.sh` قرار گرفته بود، رویِ **PGDATA کاملاً
تازه** اجرا کردم. هیچ data directory یا volume موجودی بازاستفاده نشد.

### ۵-۱) بوتِ نخست (رمزِ پیش‌فرضِ compose)

```
initdb … Success.
waiting for server to start…. LOG:  starting PostgreSQL 16.15 …
LOG:  listening on Unix socket "/tmp/.s.PGSQL.55943"
server started
CREATE DATABASE
/docker-entrypoint-official.sh: running /docker-entrypoint-initdb.d/10-runtime-role.sh
runtime role is ready for LOGIN (local stack only)
waiting for server to shut down…. server stopped
PostgreSQL init process complete; ready for start up.
LOG:  listening on IPv4 address "127.0.0.1", port 55943
LOG:  database system is ready to accept connections
```

یعنی کلِ چرخهٔ رسمی — `initdb` → سرورِ موقت با `listen_addresses=''` →
`docker_setup_db` → `docker_process_init_files` → توقفِ سرورِ موقت → `exec postgres` —
**با موفقیت** پیموده شد (کدِ خروجِ init صفر).

راستی‌آزماییِ نقش:

| بررسی | نتیجه |
|---|---|
| وجودِ نقشِ `dms_app` | ✅ |
| `rolcanlogin` | ✅ `true` |
| `rolsuper` / `rolbypassrls` / `rolcreatedb` / `rolcreaterole` | ✅ همه `false` |
| شمارِ نقش‌هایِ غیرِ سیستمی | ✅ `2` (فقط `dms` و `dms_app`) |
| قالبِ verifier | ✅ `SCRAM-SHA-256$4096:…` |
| **لاگینِ واقعی با رمزِ `APP_DB_PASSWORD`** تحتِ `scram-sha-256` | ✅ `AUTH-OK dms_app superuser=false` |
| رمزِ اشتباه | ✅ `FATAL: password authentication failed for user "dms_app"` |
| **نبودِ رمز در لاگِ entrypoint** | ✅ `0` بار |

> نکتهٔ صداقت: `pg_hba.conf` تولیدیِ entrypoint رسمی برایِ `127.0.0.1/32` قاعدهٔ
> `trust` دارد (پیش از قاعدهٔ `host all all all scram-sha-256`)، بنابراینِ نخستین
> تلاشِ «رمزِ اشتباه رد شود» از طریقِ loopback **بی‌معنا** بود. برایِ سنجشِ واقعیِ
> verifier، قاعدهٔ `host all dms_app all scram-sha-256` **فقط رویِ این نمونهٔ
> یک‌بارمصرف** به ابتدایِ `pg_hba.conf` افزوده و `reload` شد؛ نتیجهٔ جدولِ بالا
> پس از آن به‌دست آمد. این تغییر هیچ فایلی در مخزن را دست نزد.

### ۵-۲) بوتِ دوم رویِ همان PGDATA (رمزِ متفاوت) — اثباتِ «دوباره init نمی‌شود»

خروجیِ entrypoint:

```
PostgreSQL Database directory appears to contain a database; Skipping initialization
LOG:  starting PostgreSQL 16.15 … listening on IPv4 address "127.0.0.1", port 55943
LOG:  database system is ready to accept connections
```

| بررسی | نتیجه |
|---|---|
| پیامِ `Skipping initialization` | ✅ |
| شمارِ `docker-entrypoint-initdb.d` در لاگِ بوتِ دوم | ✅ `0` |
| اثرانگشتِ `md5(rolpassword)` پیش از بوتِ دوم | `da8e08033dfb62adadb6fd019ac64f08` |
| اثرانگشتِ `md5(rolpassword)` پس از بوتِ دوم | `da8e08033dfb62adadb6fd019ac64f08` — **بایت‌به‌بایت یکسان** |
| لاگین با رمزِ بوتِ نخست | ✅ `OLD-PASSWORD-STILL-OK dms_app` |
| لاگین با رمزِ جدیدِ بوتِ دوم (`CHANGED-MUST-NOT-APPLY`) | ✅ رد شد |
| ویژگی‌هایِ نقش | ✅ بدونِ تغییر (`login=true super=false bypassrls=false createdb=false createrole=false`) |
| نبودِ هر دو رمز در لاگ | ✅ `0` بار |

چون SCRAM برایِ هر `ALTER ROLE … PASSWORD` **salt تصادفی** تولید می‌کند، یکسانِ
ماندنِ verifier اثبات می‌کند که اسکریپتِ init در بوتِ دوم **اصلاً اجرا نشده است**
(نه اینکه اجرا شده و همان رمز را گذاشته باشد).

### ۵-۳) بوتِ سوم — رمزِ خصمانه + ضبطِ argv در مسیرِ واقعیِ init

PGDATA تازهٔ دیگر، `APP_DB_PASSWORD` = `` p'a$$ w\o"rd-9 `` (شاملِ `'`، `"`، `$`،
فاصله، `\`، `-`) و یک wrapperِ ضبطِ argv در ابتدایِ `PATH`. entrypoint رسمی دوباره
کامل و موفق اجرا شد. **چهار فراخوانیِ psql** ثبت شد:

```
argv: [--version]
argv: [-v] [ON_ERROR_STOP=1] [--username] [dms] [--no-password] [--no-psqlrc] [--dbname] [postgres] [--set] [db=greendms] [--tuples-only]
argv: [-v] [ON_ERROR_STOP=1] [--username] [dms] [--no-password] [--no-psqlrc] [--dbname] [postgres] [--set] [db=greendms]
argv: [-v] [ON_ERROR_STOP=1] [--username] [dms] [--dbname] [greendms]      ← فراخوانیِ اسکریپتِ مخزن
```

| بررسی | نتیجه |
|---|---|
| حضورِ رمزِ خصمانه در هر عنصرِ argv.log | ✅ **نیست** |
| شمارِ فلگ‌هایِ `pass=` / `role=` | ✅ `0` / `0` |
| `env-pass-present:yes` | ✅ (رمز از راهِ محیط رسیده) |
| **لاگینِ واقعیِ SCRAM با همان رمزِ خصمانه** | ✅ `NASTY-PASSWORD-EXACT-OK dms_app` |
| ویژگی‌هایِ نقش | ✅ `login=true super=false bypassrls=false createdb=false createrole=false` |
| نبودِ رمز در لاگِ entrypoint | ✅ `0` بار |

سه فراخوانیِ نخست مربوط به خودِ entrypoint رسمی است (`--version` و
`docker_setup_db`/`CREATE DATABASE`) که آن‌ها هم رمز را در argv نمی‌گذارند؛
فراخوانیِ چهارم اسکریپتِ مخزن است و **هیچ رمز یا فلگِ حاویِ رمز ندارد**.

### ۵-۴) هارنسِ پوسته‌ایِ مستقل

پیش از اجراهایِ entrypoint، هارنسِ `/tmp/t16-run.sh` (۲۰ assertion رویِ کلاسترهایِ
تازهٔ PG 16.15، فقط socket، با `listen_addresses=''` و پورت/دایرکتوریِ یکتا) نتیجهٔ
**۲۰ PASS / ۰ FAIL** داد، شاملِ **کنترلِ منفی**: اسکریپتِ نسخهٔ TASK-15 ضمنِ
خروجِ صفر، رمز را **واردِ argv می‌کرد** و فلگِ `pass=` داشت، در حالی که اسکریپتِ
رفع‌شده ندارد. همچنین: پایگاهِ غیرقابلِ دسترس ⇒ خروجِ غیرصفر؛ فراخوانِ
غیر-superuser ⇒ خروجِ غیرصفر و **۰** نقشِ ساخته‌شده؛ `APP_DB_ROLE=''` ⇒ خروجِ صفر با
fallbackِ مستندِ `dms_app`.

---

## ۶) فازِ ۴ — Compose واقعی: **BLOCKED** (با مدرک، نه حدس)

هیچ runtime کانتینری در این sandbox وجود ندارد و امکانِ نصب هم نیست:

| بررسی | نتیجه |
|---|---|
| `docker`, `docker-compose`, `podman`, `nerdctl`, `containerd`, `runc`, `dockerd`, `buildah`, `skopeo` | همه **MISSING** |
| اجرایِ واقعیِ `docker version` | `bash: docker: command not found` |
| `/var/run/docker.sock` | `No such file or directory` |
| `https://registry-1.docker.io/v2/` | **HTTP 000** (غیرقابلِ دسترس) |
| `https://auth.docker.io/token` | **HTTP 000** |
| `https://download.docker.com/linux/static/stable/x86_64/` (باینریِ ایستایِ داکر) | **HTTP 000** |
| `https://deb.debian.org/debian/` (نصبِ بسته) | **HTTP 000** |
| `https://api.github.com` / `https://registry.npmjs.org` | `200` (تنها مسیرهایِ مجازِ sandbox) |

`sudo -n` بدونِ رمز کار می‌کند (uid 0) اما بی‌فایده است: بدونِ باینریِ runtime و بدونِ
دسترسی به registry، نه `postgis/postgis:16-3.4` قابلِ pull است نه `docker compose up`
قابلِ اجرا. **بنابراینِ بوتِ واقعیِ کانتینر و راه‌اندازیِ کاملِ stack در این sandbox
اجرا نشد و PASS اعلام نمی‌شود.**

نزدیک‌ترین جانشینِ ممکن — اجرایِ **خودِ `docker-entrypoint.sh` رسمیِ ایمیج** با
همان مسیرِ `/docker-entrypoint-initdb.d` و همان باینری‌هایِ 16.15 — انجام شد و
**PASS** است (بخشِ ۵). این همان کدی است که در کانتینر اجرا می‌شود، اما
**جانشینِ چرخهٔ واقعیِ کانتینر (image pull، namespace، healthcheck، شبکهٔ compose،
`depends_on`) نیست** و به‌عنوانِ آن ادعا نمی‌شود.

مواردِ باقی‌ماندهٔ فازِ ۴ که **UNVERIFIED** می‌مانند:

- healthcheck سرویسِ `postgres` در compose و در دسترس بودنِ نقشِ زمانِ اجرا برایِ کانتینرِ `api`؛
- بالا آمدنِ واقعیِ `api` با `APP_DATABASE_URL` و موفقیتِ `verifyRuntimeDatabaseIdentity` در محیطِ containerized؛
- رفتارِ `AUTO_MIGRATE=true` در نخستین بوتِ کانتینر.

این موارد در CI با سرویسِ `postgis/postgis:16-3.4` بخشی پوشش داده می‌شود، اما
**راه‌اندازیِ کاملِ compose همچنان پشتِ دروازهٔ BLOCKEDِ MinIO/e2e است** و هیچ تغییری
برایِ دور زدنِ آن انجام نشد.

---

## ۷) فازِ ۵ — نتیجهٔ بررسی‌ها

### محلی (این sandbox)

| بررسی | نتیجه |
|---|---|
| `bash -n docker/postgres-init/10-runtime-role.sh` | ✅ OK |
| `shellcheck` | ⚠️ در sandbox نصب نیست و نصب ممکن نبود (`deb.debian.org` ⇒ 000) |
| `npm run typecheck` (packages + api + web) | ✅ **RC=0** |
| `npm run openapi:check` | ✅ **RC=0** — ۱۴۲ مسیر / ۲۰۷ عملیات / ۱۰۱ اسکیما / ۳ وب‌هوک |
| `node scripts/contract-drift.mjs` | ✅ **RC=0** — قرارداد ۲۰۷ = کد ۲۰۷، کاملاً هم‌تراز |
| `npm run build` (packages + api + web/Next.js) | ✅ **RC=0** |
| `vitest run test/postgres-init-role.api.test.ts` رویِ PG 16.15 واقعی | ✅ **۵/۵ پاس** |
| کنترلِ منفیِ همان تست با اسکریپتِ پیشین | ✅ تستِ F شکست (۱ fail / ۴ pass) ⇒ تست واقعی است |
| تست‌هایِ بدونِ DB (`vitest run --exclude '**/*.api.test.ts'`) | ✅ **۱۲ فایل / ۱۹۵ تست** (بدونِ تغییر نسبت به TASK-15) |
| هارنسِ پوسته‌ایِ مستقل | ✅ **۲۰ PASS / ۰ FAIL** |
| چرخهٔ رسمیِ entrypoint (۳ بوت) | ✅ PASS |
| `vitest run test/db-privileges.api.test.ts` محلی | ⛔ **BLOCKED** — بیلدِ یک‌بارمصرفِ PG در sandbox افزونهٔ **PostGIS** ندارد (`extension "postgis" is not available` در `0001_extensions_and_functions.up.sql`، خطا در `beforeAll` ⇒ ۶۵ تست skip شدند). ایمیجِ CI `postgis/postgis:16-3.4` است و این تست آنجا پاس می‌شود. **این محدودیتِ محیطی است، نه رگرسیون:** دیفِ این TASK فقط دو فایلِ بالا است و هیچ‌کدام در مسیرِ `db-privileges` (مهاجرتِ 0041 و کدِ `runtime-identity`) قرار ندارند. هیچ تستی برایِ عبور از این محدودیت skip یا ضعیف نشد. |
| `npm run test:migrations` محلی | ⛔ **BLOCKED** — همان علتِ PostGIS؛ در CI با ایمیجِ درست اجرا می‌شود (TASK-15: ✅ ۴۵ up → down → up) |
| راه‌اندازیِ کاملِ stack محلی | ⛔ **BLOCKED** — نبودِ Docker و `redis-server` |

### نشتیِ اعتبارنامه

- رمز در **هیچ** لاگِ entrypoint، لاگِ سرور، argv.log یا فایلِ کامیت‌شده‌ای ظاهر نشد
  (شمارِ رخدادها در همه‌ی بررسی‌ها `0`).
- در این گزارش هم فقط **اثرانگشتِ md5** از verifier (که خود hash است) و رمزهایِ
  مصنوعی/پیش‌فرضِ مستندِ local-dev آمده است؛ هیچ اعتبارنامهٔ واقعی افشا نشد.
- هیچ نقشِ اضافیِ ممتازی ساخته نشد (`roles=2`).

---

## ۸) مرورِ امنیتیِ دیف (پیش از کامیت)

- ✅ هیچ secret جدیدی کامیت نشد؛ تنها رشتهٔ باقی‌ماندهٔ `-v pass=` داخلِ **توضیحِ
  کامنت** است که دلیلِ حذفِ آن را شرح می‌دهد.
- ✅ هیچ مهاجرتی بازنویسی/حذف نشد؛ `migrations/` دست‌نخورده.
- ✅ هیچ سرویس/پروژهٔ بی‌ربطی تغییر نکرد؛ فقط اسکریپتِ init + تستِ خودش + این سند.
- ✅ هیچ volume یا پایگاه‌دادهٔ موجودی تغییر نکرد؛ همهٔ آزمایش‌ها رویِ PGDATA هایِ
  تازه و یک‌بارمصرفِ `/tmp/t16-*-pgdata` با پورت‌هایِ یکتا انجام شد و سپس پاک می‌شود.
- ✅ هیچ تستی skip/ضعیف/حذف نشد؛ شمارِ تست‌ها ۴ → ۵ و DB-free ۱۹۵ بدونِ تغییر.
- ✅ امتیازهایِ نقشِ زمانِ اجرا محدودتر نشد و privilegi ای اضافه نشد
  (`nosuperuser/nobypassrls/nocreatedb/nocreaterole` در هر سه بوت تأیید شد).
- ✅ وابستگیِ تازه‌ای افزوده نشد؛ `package.json`/`package-lock.json` بدونِ تغییر.

---

## ۹) وضعیتِ CI و حکمِ نهایی

### ۹-۱) حکمِ اهداف

| گام | حکم |
|---|---|
| هدفِ ۱: رمز در argv نباشد | **PASS** — با ضبطِ argv واقعیِ فرآیند در هارنسِ پوسته، تستِ vitest و **مسیرِ init رسمیِ entrypoint** + کنترلِ منفی |
| هدفِ ۲ (الف): چرخهٔ init رسمیِ ایمیج | **PASS** — بوتِ نخست موفق، نقش با امتیازهایِ درست، رمزِ درست (لاگینِ واقعیِ SCRAM)، بدونِ نشتی در لاگ، بوتِ دوم init را تکرار نمی‌کند |
| هدفِ ۲ (ب): کانتینر/Compose واقعی | **BLOCKED** — نبودِ runtime کانتینر و دسترسیِ شبکه به registry (مدرک در بخشِ ۶) |
| دروازهٔ استاتیک (typecheck/openapi/drift/build) | **PASS** محلی و **PASS** در CI |
| تست‌هایِ DB-free | **PASS** (۱۲ فایل / ۱۹۵ تست محلی؛ در CI هم ✅) |
| تست‌هایِ یکپارچگیِ Postgres (شاملِ تستِ تازهٔ F) | **PASS** در CI |

### ۹-۲) نتایجِ واقعیِ CI رویِ SHA **`af13195`**

| Workflow / Job | نتیجه |
|---|---|
| `مهاجرت‌های پایگاه‌داده` — چرخهٔ up → down → up رویِ دیتابیسِ خالی | ✅ **success** |
| `CI` — Static checks (typecheck, OpenAPI, contract drift) | ✅ **success** |
| `CI` — Unit tests (no DB, no MinIO) | ✅ **success** |
| `CI` — **Integration (Postgres) — API + tenant isolation** | ✅ **success** |
| `CI` — Integration (MinIO) — attachment round-trip | ❌ **failure** (BLOCKEDِ از پیش موجود) |
| `e2e` — Playwright E2E (پشتهٔ ایزولهٔ docker) | ❌ **failure** (BLOCKEDِ از پیش موجود) |

- job یکپارچگیِ Postgres همهٔ `test/*.api.test.ts` را **به‌جزِ** `attachments.api.test.ts`
  اجرا می‌کند: **۲۸ فایل موجود ⇒ ۲۷ فایلِ منتخب**، و
  `postgres-init-role.api.test.ts` (شاملِ تستِ تازهٔ **F**) میانِ آن‌هاست ⇒ تستِ تازه در
  CI اجرا شد و job موفق بود. (شمارِ فایل‌ها محلی از فهرستِ فایل‌ها استخراج شده، چون
  لاگِ blob این job در sandbox قابلِ دریافت نیست.)
- دو annotation رویِ job موفقِ Postgres فقط هشدارِ «Node.js 20 is deprecated» و
  notice مربوط به `ubuntu-latest` است؛ هیچ خطایی ثبت نشده.
- علتِ شکستِ دو job دیگر **بی‌ربط به این TASK** و همان دروازهٔ شناخته‌شدهٔ
  S3/MinIO است. متنِ annotation:
  `BLOCKED-e2e-minio-image: No MinIO image could be pulled (quay.io/minio/minio → 401, minio/minio → pull access denied) … the compose stack was NOT started and ZERO Playwright browser tests were executed`.
  در job MinIO نیز probe جانشین‌هایِ S3 (`adobe/s3mock:3.9.1`، `chrislusf/seaweedfs:3.76`)
  همان رفتارِ پیشین را دارد.
- این الگو **دقیقاً هم‌پایهٔ SHA پیشینِ راستی‌آزمایی‌شده (`f7bcbd2` در TASK-15)** است ⇒
  **هیچ رگرسیونی** معرفی نشده و هیچ gate ای برایِ عبور skip یا ضعیف نشده است.
- طبقِ صورت‌مسئله، **ادعایِ PASS برایِ Docker/Compose یا E2E نمی‌شود**: compose هرگز بالا
  نیامد و هیچ تستِ مرورگری اجرا نشد.

**SHA راستی‌آزمایی‌شده با CI: `af13195b68dd8aa85c50f10c34eb295e8b16e9f8`**
(run id هایِ `42049679239` برایِ CI، `42049679220` برایِ مهاجرت‌ها و
`42049679273` برایِ e2e). PR #5 همچنان `OPEN`/`MERGEABLE` است و **ادغام نشد**.

---

## ۱۰) مواردِ بازِ باقی‌مانده (بدونِ تغییر نسبت به پیش از این TASK)

- ⛔ یکپارچگیِ S3/MinIO و تستِ E2E مرورگر — BLOCKED در این sandbox (بدونِ Docker).
- ⛔ بوتِ واقعیِ کانتینرِ `postgis/postgis:16-3.4` و `docker compose up` کامل — BLOCKED.
- ⚠️ rate limiting مبتنی بر Redis — UNVERIFIED (اجرایِ محلیِ `redis-server` ممکن نبود).
- ⚠️ `feature_flag.scope_type='user'` — در انتظارِ تصمیمِ محصول.
- ⚠️ بازیابیِ job هایِ `sending` مانده — DEFERRED (بدونِ اثباتِ امنیتِ تکرارِ
  عملیاتِ بیرونی).
- ⚠️ `location_sample.staff_id` بدونِ FK؛ ownership ها به `dms_owner` واگذار نشده
  (عمدی؛ `REASSIGN OWNED` اجرا نشد).
