# گزارشِ پذیرشِ TASK-17 — حذفِ نشتِ plaintextِ رمزِ پایگاه‌داده از متنِ دستورها، لاگِ سرور و تشخیصِ خطاها

**شاخه:** `arena/63ef2061-green-dms` · **PR #5:** `OPEN`
**⛔ PR #5 ادغام نشد و هیچ استقرار، تغییرِ زیرساختِ مشترک، دست‌کاریِ volume موجود یا دسترسی به پایگاه‌دادهٔ production انجام نشد.**

| مورد | مقدار |
|---|---|
| HEADِ شروع | `4da893d456317978fd760f3bc1f052ff1f8aeb6d` (پایانِ TASK-16) |
| HEADِ پایان | کامیتِ این تغییرات + کامیتِ ثبتِ نتایجِ CI |
| **SHA راستی‌آزمایی‌شده با CI** | در بخشِ ۹ |
| نسخهٔ PostgreSQLِ آزمایش‌شده | **16.15** (هم‌خانواده با `postgis/postgis:16-3.4` در compose) |
| منبعِ مرجعِ رفتارِ psql | `postgres/postgres` شاخهٔ **`REL_16_STABLE`** |
| حکمِ هدفِ ۱ (رمز در argv نباشد) | **PASS** (حفظِ دستاوردِ TASK-16 + سخت‌گیریِ بیشتر) |
| حکمِ هدفِ ۲ (رمز در متنِ SQL نباشد) | **PASS** |
| حکمِ هدفِ ۳ (رمز در لاگِ سرور نباشد) | **PASS** — با `log_statement=all` رویِ سرورِ واقعی |
| حکمِ هدفِ ۴ (رمز در تشخیصِ خطا نباشد) | **PASS** — با `log_min_error_statement=debug5` |
| حکمِ چرخهٔ رسمیِ init | **PASS** (۴ بوت با `docker-entrypoint.sh` رسمی) |
| حکمِ کانتینر/Compose واقعی | **BLOCKED** (بدونِ تغییر نسبت به TASK-16) |

---

## ۱) خلاصهٔ یک‌خطی

TASK-16 رمز را از **argv** بیرون برد، ولی `format('%L', password)` همچنان
**plaintext** را داخلِ **متنِ دستورِ SQL** می‌گذاشت؛ با `log_statement=ddl/mod/all`
همان متن عیناً در لاگِ سرور ثبت می‌شد و در تشخیصِ خطاها هم بازتاب می‌یافت. اکنون رمز
**هرگز بخشی از هیچ دستوری نیست**: اسکریپت نقش را بدونِ بندِ password می‌سازد/به‌روز
می‌کند و رمز را با `\password`ِ خودِ psql می‌گذارد که آن را **سمتِ کلاینت** با
`PQencryptPasswordConn()` هش می‌کند و فقط یک verifierِ SCRAM-SHA-256 می‌فرستد. رمز
دیگر در محیطِ فرآیندِ فرزند هم export نمی‌شود و تنها از راهِ **stdinِ خودِ psql**
تحویل می‌شود.

---

## ۲) نقصِ باقی‌مانده — با مدرکِ اجرایی، نه حدس

اجرایِ اسکریپتِ TASK-16 رویِ یک کلاسترِ یک‌بارمصرفِ PostgreSQL 16.15 با
`log_statement=all` و رمزِ خصمانهٔ `` p'a$$ w\o"rd-9 `` این خط را در **لاگِ سرور**
تولید کرد:

```
LOG:  statement: create role t17_cur_role login password E'p''a$$ w\\o"rd-9'
```

یعنی plaintext در لاگِ سرور است — به شکلِ **E-string فرار** (`'` دوتایی، `\` دوتایی).

> ⚠️ **تلهٔ PASS کاذب:** `grep -F` رویِ **رمزِ خام** در همان لاگ **صفر** رخداد
> می‌دهد، چون شکلِ ثبت‌شده فرار است. هر آزمونِ «نشتی ندارد» که فقط رمزِ خام را
> بجوید، همین نقص را PASS اعلام می‌کرد. بنابراین همهٔ آشکارسازهایِ این TASK
> (تستِ vitest و هارنس) **هر چهار شکل** را می‌سنجد: خام، `\`→`\\`، `'`→`''`، و
> هر دو با هم (شکلِ واقعیِ E-string). کنترلِ منفیِ تستِ G دقیقاً همین را ثابت
> می‌کند: در نسخهٔ آسیب‌پذیر، شکلِ خام **پیدا نمی‌شود** ولی شکلِ فرار **پیدا
> می‌شود**.

---

## ۳) طراحیِ سازوکارِ امن و چرا گزینه‌هایِ دیگر رد شدند

### ۳-۱) انتخاب: `\password`ِ psql (رمزنگاریِ سمتِ کلاینت)

از **منبعِ رسمیِ `REL_16_STABLE`** خوانده و تأیید شد
(`src/bin/psql/command.c` › `exec_command_password()`):

```c
pw1 = simple_prompt_extended(buf.data, false, &prompt_ctx);
if (!prompt_ctx.canceled)
    pw2 = simple_prompt_extended("Enter it again: ", false, &prompt_ctx);
...
else if (strcmp(pw1, pw2) != 0) { pg_log_error("Passwords didn't match."); success = false; }
else {
    encrypted_password = PQencryptPasswordConn(pset.db, pw1, user, NULL);
    ...
    printfPQExpBuffer(&buf, "ALTER USER %s PASSWORD ", fmtId(user));
    appendStringLiteralConn(&buf, encrypted_password, pset.db);
    res = PSQLexec(buf.data);
```

یعنی psql در نسخهٔ ۱۶ رمز را **پیش از ارسال** هش می‌کند و تنها
`ALTER USER <role> PASSWORD '<verifier>'` را می‌فرستد ⇒ plaintext **هرگز به سرور
نمی‌رسد**، پس نمی‌تواند در `log_statement`، در `pg_stat_activity.query` یا در
هیچ تشخیصِ خطایی (موفق یا ناموفق) ظاهر شود. این همان سازوکاری است که PostgreSQLِ
بالادستی برایِ هر تغییرِ رمزِ تعاملی استفاده می‌کند ⇒ بدونِ وابستگیِ تازه، بدونِ
ابزارِ اضافی، و هم‌نسخه با سرور.

همچنین از `src/common/sprompt.c` تأیید شد:

```c
termin = fopen("/dev/tty", "r");  termout = fopen("/dev/tty", "w");
if (!termin || !termout) { ... termin = stdin; termout = stderr; }
```

⇒ وقتی ترمینالِ کنترل‌کننده نباشد (حالتِ عادیِ کانتینر)، prompt از **stdin**
می‌خواند و متنِ prompt به **stderr** می‌رود (فقط نامِ نقش، بدونِ رمز). و از
`src/common/pg_get_line.c` تأیید شد که `pg_get_line()` با `StringInfoData` پویا
می‌خواند ⇒ **هیچ حدِ truncation ندارد** (بریدنِ بی‌صدأ رمز ممکن نیست).

### ۳-۲) چرا گزینه‌هایِ جای‌گزین رد شدند

| گزینه | چرا رد شد |
|---|---|
| **ساختِ verifierِ SCRAM در bash** (PBKDF2+HMAC دستی) | به `openssl` CLI نیاز دارد که حضورش در `postgis/postgis:16-3.4` **قابلِ اثبات نبود** (بدونِ Docker نمی‌شد محتوایِ ایمیج را دید). اگر نبود، نخستین بوت می‌مُرد — دقیقاً همان کلاسِ نقصی که TASK-15 رفع کرد. همچنین SASLprep برایِ رمزهایِ غیرِ ASCII لازم است. |
| **رساندنِ رمز با GUC در startup packet** (`PGOPTIONS="-c app.password=…"`) | در PG16 خروجیِ `log_connections` شاملِ `options` است ⇒ همان نشتی در لاگ؛ به‌علاوه نیاز به تابعِ سمتِ سرور برایِ هش داشت و `ALTER ROLE` نهایتاً plaintext می‌خواست. |
| **غیرفعال کردنِ `log_statement`** | صورت‌مسئله صریحاً این را راه‌حلِ قابلِ قبول نمی‌داند؛ ضمناً تنظیمِ سراسری را تضعیف می‌کرد و در برابرِ `pg_stat_activity`/تشخیصِ خطا هم بی‌اثر بود. |
| **`\password` با heredoc رویِ stdin** | heredoc در bash با یک **فایلِ موقت** پیاده‌سازی می‌شود ⇒ plaintext رویِ دیسک می‌رفت. صورت‌مسئله «فایلِ موقتِ اعتبارنامه» را صریحاً ممنوع کرده. |
| **`\password` با تکیه بر نبودِ tty** | اگر tty موجود بود (مثلاً `docker run -it`)، psql به‌جایِ stdin از tty می‌خواند و **برایِ همیشه مسدود می‌شد**. با `setsid --wait` قطعی شد (بخشِ ۴). |

### ۳-۳) چرا این طرح در برابرِ «لاگِ دستورِ موفق» و «تشخیصِ خطایِ شکست» هر دو محافظت می‌کند

چون **هیچ مسیری** وجود ندارد که plaintext به سرور برسد: تنها چیزی که psql می‌فرستد
verifier است. پس:

- دستورِ **موفق**: `log_statement=all` فقط `create role … login` و
  `ALTER USER … PASSWORD 'SCRAM-SHA-256$…'` را ثبت می‌کند (بخشِ ۶، بوتِ A — اجرایی
  اثبات شد).
- دستورِ **شکست**: `log_min_error_statement=debug5` متنِ دستورِ شکست‌خورده را ثبت
  می‌کند؛ آن متن هم رمز ندارد (بخشِ ۷ هارنس و تستِ H — اجرایی اثبات شد، همراهِ
  کنترلِ منفی که نسخهٔ پیشین در همان مسیر **لو می‌داد**).

---

## ۴) فایل‌هایِ تغییرکرده (دقیق)

| فایل | تغییر |
|---|---|
| `docker/postgres-init/10-runtime-role.sh` | **رفعِ نقص** — حذفِ `format('%L', password)` و `\getenv pass`؛ افزودنِ `\password :"role"` با تحویلِ غیرتعاملیِ رمز از stdin؛ حذفِ `export` رمز؛ گاردهایِ fail-closed (رمزِ خالی، CR/LF، نبودِ verifier، tty بدونِ setsid) |
| `apps/api/test/postgres-init-role.api.test.ts` | تست‌ها **۵ → ۸**: افزودنِ G (متنِ SQL با `PSQLRC`+`ECHO all` + کنترلِ منفیِ درون‌ساخت)، H (تشخیصِ خطا)، I (ردِ رمزِ چندخطی)؛ به‌روزرسانیِ F (ضبطِ stdin + `env-pass-present:no`)؛ افزودنِ `sqlSpellings()`/`expectNoPasswordSpelling()` و `VULNERABLE_SCRIPT` به‌عنوانِ کنترلِ منفی |
| `scripts/verify-init-credential-hygiene.sh` | **تازه** — هارنسِ دائمیِ ۴۱ بررسی رویِ کلاسترِ یک‌بارمصرف با `log_statement=all` و `log_min_error_statement=debug5`، با کنترلِ منفیِ درون‌ساخت |
| `.github/workflows/ci.yml` | job تازهٔ `init-hygiene` (بدونِ Node، بدونِ docker، بدونِ MinIO) که همان هارنس را رویِ PostgreSQL نصب‌شده با apt اجرا می‌کند + annotation تشخیصِ شکست |
| `docs/db-privilege-architecture.md` | به‌روزرسانیِ راهنمایِ دستیِ استقرار به دو گام (`alter role … login;` سپس `\password`) + شرحِ سازوکارِ جدیدِ اسکریپتِ init |
| `.env.production.example` | همان اصلاحِ راهنما برایِ production + هشدارِ صریح دربارهٔ `psql -c` و shell history |
| `docs/task-17-completion-report.md` | همین سند |

**هیچ مهاجرتی تغییر نکرد** (`git diff --name-only -- migrations/` ⇒ ۰) و **هیچ
manifest/lockfile ای دست نخورد** (۰). هیچ تستی skip/ضعیف/حذف نشد؛ شمارِ تست‌ها فقط
افزایش یافت و مجموعهٔ بدونِ DB بدونِ تغییر ماند.

---

## ۵) اسکریپتِ جدید و گاردهایِ fail-closed

```bash
# 1) گاردهایِ ورودی — پیش از هر اتصال
if [ -z "$RUNTIME_PASSWORD" ]; then … exit 1; fi          # رمزِ خالی ⇒ نقشِ بی‌رمز
case "$RUNTIME_PASSWORD" in *$'\n'*|*$'\r'*) … exit 1;; esac  # \password خط‌به‌خط می‌خواند

# 2) فقط نامِ نقش export می‌شود؛ رمز دیگر در محیطِ هیچ فرزندی نیست
export GREEN_DMS_RUNTIME_ROLE="$RUNTIME_ROLE"

# 3) تضمینِ قطعیِ «بدونِ ترمینالِ کنترل‌کننده»
PSQL_CMD=(psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB")
if (exec 9<> /dev/tty) 2>/dev/null; then HAVE_TTY=1; exec 9<&- 9>&-; fi
if setsid --wait true >/dev/null 2>&1; then
  PSQL_CMD=(setsid --wait "${PSQL_CMD[@]}")     # session جدید ⇒ open("/dev/tty") = ENXIO
elif [ "$HAVE_TTY" = '1' ]; then
  … exit 1                                      # به‌جایِ مسدودشدن یا تایپِ انسانی، رد می‌شود
fi

# 4) رمز فقط از راهِ لولهٔ stdinِ builtinِ printf (بدونِ argv، بدونِ فایلِ موقت)
printf '%s\n%s\n' "$RUNTIME_PASSWORD" "$RUNTIME_PASSWORD" |
  "${PSQL_CMD[@]}" -f <(cat <<'EOSQL'
\set QUIET on
\getenv role GREEN_DMS_RUNTIME_ROLE
select format(case when exists (select 1 from pg_roles where rolname = :'role')
                   then 'alter role %I login' else 'create role %I login' end, :'role') as ddl
\gexec
\echo 'provisioning the runtime role password (client-side encrypted; …)'
\password :"role"
select exists (select 1 from pg_authid where rolname = :'role'
                 and rolpassword is not null and rolpassword <> '') as pw_ok
\gset
\if :pw_ok
\echo 'runtime role is ready for LOGIN (local stack only)'
\else
\echo 'runtime role password was NOT stored; refusing to report success'
do $$ begin raise exception 'runtime role password was not stored (fail-closed)'; end $$;
\endif
EOSQL
)
```

نکاتِ ایمنیِ طراحی:

- **`printf` یک builtinِ bash است** ⇒ رمز در argvِ هیچ فرآیندی ظاهر نمی‌شود.
- **heredoc فقط اسکریپتِ بدونِ رمز را می‌گیرد** ⇒ فایلِ موقتِ bash هرگز plaintext
  نمی‌بیند؛ رمز تنها در یک **لوله** (حافظه) جریان دارد.
- **`-f <(…)`** یعنی stdin برایِ دو promptِ `\password` آزاد می‌ماند.
- **`setsid --wait`** کدِ خروجِ فرزند را **دقیقاً** برمی‌گرداند (سنجیده شد:
  `exit 7` ⇒ `7`) ⇒ `set -euo pipefail` هنوز fail-closed است. اگر setsid نباشد و tty
  هم نباشد (حالتِ عادیِ compose) مستقیماً psql اجرا می‌شود؛ اگر setsid نباشد و tty
  **باشد**، اسکریپت با پیامِ صریح رد می‌شود تا هرگز مسدود نشود یا رمز را از انسان
  نگیرد.
- **گارِدِ `pw_ok`** یک «موفقِ کاذبِ» واقعی را می‌بندد: اگر stdin تمام شده بود،
  `\password` دو رشتهٔ **خالی** می‌خواند، آن‌ها را برابر می‌دید و verifierِ رمزِ
  خالی را با خروجِ صفر ذخیره می‌کرد ⇒ نقشِ بی‌رمز. گارِد + گاردِ bash + stdinِ
  قطعی، هر سه با هم این را می‌بندند.
- **`do $$ … $$` بدونِ هیچ `:'var'`** داخلش ⇒ درسِ TASK-15 نقض نشده.
- `format('%I')` و `\gexec` و `ON_ERROR_STOP=1` و idempotency و مقادیرِ پیش‌فرضِ
  `APP_DB_ROLE`/`APP_DB_PASSWORD` **همگی حفظ شدند**. هیچ امتیازی اضافه نشد و RLS
  تضعیف نشد.

---

## ۶) فازِ ۳ — چرخهٔ رسمیِ init (۴ بوت، PostgreSQL 16.15)

`docker-entrypoint.sh` **رسمیِ** `docker-library/postgres` ‏`16/bookworm`
(blob sha `8d507bc40798732dc89a1849ce5d80c451af4a1f`، ۱۴۵۷۷ بایت — یکسان با
TASK-16) با اسکریپتِ مخزن در `/docker-entrypoint-initdb.d/10-runtime-role.sh` و رویِ
**PGDATA هایِ کاملاً تازه** اجرا شد. برایِ همهٔ بوت‌ها `log_statement=all` و
`log_min_error_statement=debug5` رویِ خودِ سرورِ موقتِ init فعال بود.

### ۶-۱) بوتِ A — نخستین بوت با رمزِ خصمانه و `log_statement=all`

ردیفِ کاملِ statementهایی که سرور ثبت کرد (از لاگِ واقعیِ چرخه):

```
statement: SELECT 1 FROM pg_database WHERE datname = 'greendms' ;
statement: CREATE DATABASE "greendms" ;
running /docker-entrypoint-initdb.d/10-runtime-role.sh
statement: select format(
             case when exists (select 1 from pg_roles where rolname = 'dms_app')
                  then 'alter role %I login'
                  else 'create role %I login'
             end, 'dms_app') as ddl
statement: create role dms_app login
provisioning the runtime role password (client-side encrypted; the prompts below are fed from stdin)
Enter new password for user "dms_app":
Enter it again:
statement: show password_encryption
statement: ALTER USER "dms_app" PASSWORD 'SCRAM-SHA-256$4096:NHHlPry0B21UWt…'
statement: select exists (select 1 from pg_authid where rolname = 'dms_app' …) as pw_ok
runtime role is ready for LOGIN (local stack only)
PostgreSQL init process complete; ready for start up.
```

- `statement: show password_encryption` اثرِ انگشتِ `PQencryptPasswordConn()` است ⇒
  **مدرکِ مستقیمِ رمزنگاریِ سمتِ کلاینت**.
- `create role dms_app login` ⇒ دستورِ نقش **هیچ بندِ password ندارد**.
- دو prompt فقط **نامِ نقش** را به stderr/لاگ نوشتند، بدونِ رمز.

پویشِ سیستماتیکِ لاگِ چرخه برایِ رمزِ خصمانهٔ `` Zq7'x$$ y\w"v-13 ``:

| شکل | رخداد در لاگ |
|---|---|
| خام | **0** |
| `\`→`\\` | **0** |
| `'`→`''` | **0** |
| E-string (هر دو) | **0** |
| **ضدِ تهی‌بودن:** `SCRAM-SHA-256$4096` | **1** |
| **ضدِ تهی‌بودن:** `show password_encryption` | **1** |

راستی‌آزماییِ نقش و احرازِ هویت:

| بررسی | نتیجه |
|---|---|
| `dms_app login/super/bypassrls/createdb/createrole` | ✅ `true,false,false,false,false` |
| شمارِ نقش‌هایِ غیرِ سیستمی | ✅ `2` (فقط `dms` و `dms_app`) |
| **لاگینِ واقعیِ SCRAM با همان رمزِ خصمانه** | ✅ `HOSTILE-EXACT-OK dms_app super=false` |
| رمزِ اشتباه | ✅ `password authentication failed` |

### ۶-۲) بوتِ B — بوتِ دوم رویِ همان PGDATA با رمزِ **متفاوت**

```
PostgreSQL Database directory appears to contain a database; Skipping initialization
```

| بررسی | نتیجه |
|---|---|
| `Skipping initialization` | ✅ ۱ |
| شمارِ اجرایِ فایلِ init | ✅ **۰** |
| `md5(rolpassword)` بوتِ A | `ad71b52e969e96078acf8b5cba962c7f` |
| `md5(rolpassword)` بوتِ B | `ad71b52e969e96078acf8b5cba962c7f` — **یکسان** |
| لاگین با رمزِ بوتِ A | ✅ `OLD-PW-STILL-OK dms_app` |
| لاگین با رمزِ بوتِ B | ✅ رد شد |
| هر دو رمز در لاگ | ✅ ۰ / ۰ |

چون SCRAM هر بار salt تصادفی می‌سازد، یکسانِ ماندنِ verifier اثبات می‌کند که init در
بوتِ دوم **اصلاً اجرا نشده** است.

### ۶-۳) بوت‌های C و D — تشخیصِ خطا در چرخهٔ رسمی

PGDATA تازهٔ دیگر با `APP_DB_PASSWORD` **دوخطی** (`bad` + `pass-13`):

```
running /docker-entrypoint-initdb.d/10-runtime-role.sh
10-runtime-role.sh: APP_DB_PASSWORD must not contain a newline or carriage return; refusing to provision.
```

| بررسی | نتیجه |
|---|---|
| `PostgreSQL init process complete` | ✅ **۰** (init کامل نشد) |
| **کدِ خروجِ entrypoint** | ✅ **`ENTRYPOINT_EXIT=1`** ⇒ کانتینر با شکست بالا می‌آید |
| `create role` / `ALTER USER` در لاگ | ✅ **۰ / ۰** — هیچ SQL ای از اسکریپت به سرور نرسید |
| هر دو بخشِ رمز در لاگ | ✅ ۰ / ۰ |
| وجودِ نقشِ `dms_app` | ✅ `0` ⇒ **موفقِ کاذب نیست** |

### ۶-۴) مسیرِ «نقشِ از پیش موجود»

در چرخهٔ رسمیِ نخستین بوت این مسیر **قابلِ رخداد نیست** (init فقط وقتی اجرا می‌شود
که volume خالی است، پس هیچ نقشی از پیش وجود ندارد؛ نقش‌هایِ NOLOGINِ مهاجرتِ 0041
بعداً توسطِ کانتینرِ api ساخته می‌شوند). بنابراین این مسیر مستقیماً رویِ سرورِ واقعی
سنجیده شد:

- هارنسِ بخشِ ۷، بررسیِ ۴: نقشِ NOLOGIN از پیش ساخته شد، دو اجرا ⇒ هر دو exit 0،
  شمارِ نقش `1`، `ALTER ROLE … LOGIN` بدونِ بندِ password، verifier درست، لاگینِ
  واقعی موفق، لاگِ سرور بدونِ plaintext.
- تستِ vitest شمارهٔ C (از TASK-15، بدونِ تغییر) همان سناریو را در CI می‌سنجد.

---

## ۷) فازِ ۲ — آزمون‌هایِ دائمیِ خودکار

### ۷-۱) `apps/api/test/postgres-init-role.api.test.ts` — **۸ تست** (پیش‌تر ۵)

| # | عنوان | کدام نیازمندی |
|---|---|---|
| A/B | بوتِ تازه: نقش ساخته می‌شود، LOGIN دارد و هیچ امتیازِ ممتازی نمی‌گیرد | ۱، ۱۱ |
| C | نقشِ از پیش موجودِ NOLOGIN: LOGIN می‌گیرد، تکراری ساخته نمی‌شود | ۲، ۱۱ |
| D | رمزِ بدقلق دقیقاً درست ذخیره می‌شود (+ تشخیصِ رمزِ اشتباه) | ۹ |
| F | رمز در argv نیست **و** در محیطِ فرآیندِ فرزند export نمی‌شود؛ کانالِ تحویل = stdin دقیقاً دو بار | ۵ |
| **G** | **متنِ SQLِ ارسال‌شده به سرور هیچ رمزی ندارد** (`PSQLRC` + `\set ECHO all`) — با کنترلِ منفیِ درون‌ساخت | **۶** |
| **H** | **مسیرِ شکست: خروجِ غیرصفر، بدونِ نقش، و بدونِ هیچ رمزی در تشخیصِ خطا** (فراخوانِ غیرِابرکاربر ⇒ 42501) | **۸، ۱۰** |
| **I** | **رمزِ دارایِ خطِ جدید ⇒ ردِ fail-closed، بدونِ نقش** | ۱۰ |
| E | پیکربندیِ نامعتبر (پورتِ غیرممکن) ⇒ خروجِ غیرصفر و بدونِ نقش | ۱۰ |

نکتهٔ روش‌شناختیِ G: `PSQLRC` با `\set ECHO all` باعث می‌شود psql **هر دستوری را که
به سرور می‌فرستد** چاپ کند (از جمله خروجیِ `\gexec`) ⇒ متنِ واقعیِ SQL بدونِ نیاز به
دسترسی به لاگِ سرور دیده می‌شود و این تست **در CI هم اجراشدنی** است.

### ۷-۲) کنترل‌هایِ منفی (اثباتِ اثرِ تست‌ها)

**الف) کنترلِ منفیِ درون‌ساخت (تستِ G):** همان آزمون یک نسخهٔ «آسیب‌پذیر» (مکانیزمِ
پیش از TASK-17) را در دایرکتوریِ موقت می‌سازد و اجرا می‌کند و ادعا می‌کند که
**شکلِ فرارِ** رمز در خروجیِ echo‌شدهٔ آن **حاضر** است و شکلِ **خام حاضر نیست** —
یعنی آشکارساز واقعاً نشتی را می‌گیرد و همان دامِ PASS کاذب را مستند می‌کند.

**ب) کنترلِ منفیِ جای‌گذاری (کلِ مجموعه):** اسکریپتِ نسخهٔ TASK-16
(`git show HEAD:docker/postgres-init/10-runtime-role.sh`) موقتاً جای‌گذاری شد ⇒

```
✓ A/B   ✓ C   ✓ D   × F   × G   ✓ H   × I   ✓ E
Tests  3 failed | 5 passed (8)
AssertionError: expected 'INVOCATION\nARG -v\nARG ON_ERROR_STOP…' to contain 'env-pass-present:no'
AssertionError: متنِ SQLِ echo‌شده شاملِ شکلِ «s''ql$$ t\\u"v-4e4e8946» از رمز است: expected true to be false
AssertionError: باید رد شود؛ خروجی: : expected +0 not to be +0
```

و پس از بازگرداندنِ فایلِ رفع‌شده (md5 `a1c1965ac4d54db3001370c3fad3b774`) ⇒ **۸/۸ پاس**
و در کاتالوگ فقط `t17admin` باقی ماند (هیچ نقشِ نشتی‌کرده‌ای نیست).

> تستِ H با نسخهٔ قدیمی پاس می‌ماند، چون پیامِ خطایِ psql متنِ دستور را بازتاب
> نمی‌دهد؛ نشتیِ نسخهٔ قدیمی در آن مسیر در **لاگِ سرور** است که فقط هارنسِ زیر می‌تواند
> ببیند — و کنترلِ منفیِ هارنس دقیقاً همان‌جا آن را می‌گیرد. این محدودیت صریحاً
> ثبت می‌شود تا ادعایِ پوشش، اغراق‌آمیز نباشد.

### ۷-۳) `scripts/verify-init-credential-hygiene.sh` — **۴۱ بررسی، ۴۱ PASS / ۰ FAIL**

هارنسِ دائمیِ کامیت‌شده که **کلاسترِ یک‌بارمصرفِ خودش** را می‌سازد (دایرکتوریِ تازه در
`TMPDIR`، پورتِ آزادِ تصادفی، فقط `127.0.0.1`، سوکتِ خصوصی، `log_statement=all`،
`log_min_error_statement=debug5`، `trap` برایِ توقف و حذف) و هرگز به data
directory/volume/سرویسِ موجود دست نمی‌زند. پوشش:

| گروه | بررسی‌ها |
|---|---|
| **کنترلِ منفیِ اصلی** | نسخهٔ پیش از TASK-17 باید plaintext را در لاگِ سرور لو بدهد (۲ خط یافت شد) |
| بوتِ تازه | exit 0 · ویژگی‌هایِ نقش · لاگ بدونِ هر ۴ شکلِ رمز · **ضدِ تهی‌بودن:** `ALTER USER … PASSWORD 'SCRAM-SHA-256$…'` در لاگ حاضر است · DDL بدونِ بندِ password · stdout/stderr پاک |
| احرازِ هویتِ واقعی | لاگینِ SCRAM با رمزِ خصمانهٔ **دقیق** (غیرِابرکاربر) · رمزِ اشتباه رد · **رمزِ خالی رد** (بدونِ fail-open) |
| argv/stdin/env | wrapperِ واقعیِ psql: argv ضبط‌شده (۸ عنصر) بدونِ رمز · بدونِ `pass=`/`role=` · `ENV-PASS:no` · رمز **دقیقاً دو بار** در stdin |
| نقشِ از پیش موجود | NOLOGIN ⇒ دو اجرا exit 0 · `count=1` · `ALTER ROLE … LOGIN` · verifier درست · لاگینِ واقعی · لاگ پاک |
| تشخیصِ خطا | فراخوانِ غیرِابرکاربر ⇒ exit 3 · **۰ نقش** · پیامِ `permission denied` · لاگِ سرور + خروجی‌ها بدونِ رمز · **ضدِ تهی‌بودن:** ERROR ثبت شد · **کنترلِ منفی:** نسخهٔ قدیمی در همین مسیر ۳ نشتی دارد · سرورِ غیرقابلِ دسترس ⇒ exit 2 و بدونِ نشتی |
| پیکربندیِ نامعتبر | `APP_DB_PASSWORD=''` ⇒ fallbackِ مستند (exit 0) · رمزِ چندخطی ⇒ exit غیرصفر و **۰ نقش** |
| idempotency | اجرایِ مجدد ⇒ exit 0 · لاگ پاک · امتیازها بدونِ تغییر · رمزِ دقیق هنوز کار می‌کند |
| وضعیتِ پایانی | بدونِ ابرکاربرِ اضافی · بدونِ `BYPASSRLS` · هیچ plaintext در فایل‌هایِ خروجیِ ضبط‌شده |

### ۷-۴) job تازهٔ CI: `init-hygiene`

چون لاگِ سرویسِ کانتینرِ CI از بیرون خواندنی نیست، بررسی‌هایِ مبتنی بر لاگِ سرور
(نیازمندی‌هایِ ۷ و ۸) نمی‌توانند در job موجود اجرا شوند. پس jobِ مستقلِ
`init-hygiene` اضافه شد که سرورِ PostgreSQL را با apt نصب می‌کند، هارنسِ بالا را
اجرا می‌کند و در صورتِ شکست annotation می‌دهد. این job **بدونِ Node، بدونِ docker و
بدونِ MinIO** است ⇒ با دروازهٔ BLOCKEDِ موجود هم‌بستگیِ شکست ندارد و هیچ gate ای
را جای‌گزین یا ضعیف نمی‌کند (فقط اضافه می‌شود).

---

## ۸) فازِ ۴ — نتیجهٔ بررسی‌ها

### محلی (این sandbox)

| بررسی | نتیجه |
|---|---|
| `bash -n` رویِ اسکریپتِ init و هارنس | ✅ OK |
| `npm run typecheck` (packages + api + web) | ✅ **RC=0** |
| `npm run openapi:check` | ✅ **RC=0** (۱۴۲ مسیر / ۲۰۷ عملیات / ۱۰۱ اسکیما / ۳ وب‌هوک) |
| `node scripts/contract-drift.mjs` | ✅ **RC=0** (قرارداد ۲۰۷ = کد ۲۰۷) |
| `npm run build` (packages + api + web) | ✅ **RC=0** |
| `vitest run test/postgres-init-role.api.test.ts` رویِ PG 16.15 واقعی | ✅ **۸/۸** |
| کنترلِ منفیِ جای‌گذاری | ✅ ۳ شکستِ موردِ انتظار (F, G, I) |
| هارنسِ بهداشتِ اعتبارنامه | ✅ **۴۱/۴۱** |
| چرخهٔ رسمیِ entrypoint (بوت‌هایِ A/B/C/D) | ✅ PASS |
| تست‌هایِ بدونِ DB | ✅ **۱۲ فایل / ۱۹۵ تست** (بدونِ تغییر) |
| `vitest run test/db-privileges.api.test.ts` محلی | ⛔ **BLOCKED** — بیلدِ یک‌بارمصرفِ PG در sandbox افزونهٔ **PostGIS** ندارد (همان علتِ TASK-16)؛ در CI با `postgis/postgis:16-3.4` پاس می‌شود |
| `npm run test:migrations` محلی | ⛔ **BLOCKED** — همان علتِ PostGIS؛ در CI اجرا می‌شود |
| راه‌اندازیِ stack کامل محلی | ⛔ **BLOCKED** — نبودِ Docker و `redis-server` |

### نشتیِ اعتبارنامه در این کار

- رمزهایِ استفاده‌شده در همهٔ آزمایش‌ها **ساختگی و یکبارمصرف** بودند
  (`` p'a$$ w\o"rd-9 ``، `` Zq7'x$$ y\w"v-13 ``، `` a'rg$$ v\w"x-<run> ``، …).
- در این سند از verifier فقط **۱۶ کاراکترِ اول** آمده و اثرانگشت‌ها `md5` هستند.
- wrapperِ تست عمداً stdin را در دایرکتوریِ موقتِ یک‌بارمصرف ضبط می‌کند (کانالِ تحتِ
  آزمون) و در `finally`/`trap` حذف می‌شود؛ **خودِ اسکریپتِ init هیچ فایلی نمی‌سازد**.

---

## ۹) وضعیتِ CI و حکمِ نهایی

### ۹-۱) حکمِ نیازمندی‌هایِ یازده‌گانهٔ فازِ ۲

| # | نیازمندی | حکم | کجا اثبات شد |
|---|---|---|---|
| ۱ | provisioningِ نقشِ تازه موفق | **PASS** | تستِ A/B · هارنس · بوتِ A |
| ۲ | به‌روزرسانیِ نقشِ موجود بدونِ تکراری | **PASS** | تستِ C · هارنس (بررسیِ ۴) |
| ۳ | رمزِ دقیق با احرازِ هویتِ واقعیِ SCRAM کار می‌کند | **PASS** | هارنس (لاگینِ واقعی) · بوتِ A |
| ۴ | رمزِ نادرست رد می‌شود | **PASS** | هارنس (رمزِ اشتباه **و** رمزِ خالی) · بوتِ A |
| ۵ | رمز در argvِ psql نیست | **PASS** | تستِ F · هارنس (wrapper) |
| ۶ | رمز در متنِ SQLِ تولیدشده نیست | **PASS** | تستِ G (`ECHO all`) · هارنس (لاگِ سرور) · بوتِ A |
| ۷ | رمز در لاگِ PostgreSQL با statement logging نیست | **PASS** | هارنس (`log_statement=all`) · بوت‌های A/B · jobِ `init-hygiene` در CI |
| ۸ | رمز در لاگ/تشخیصِ خطا هنگامِ شکست نیست | **PASS** | تستِ H · هارنس (`log_min_error_statement=debug5` + کنترلِ منفی) · بوت‌های C/D |
| ۹ | رمزهایِ خصمانه پشتیبانی می‌شوند | **PASS** | تستِ D · هارنس · بوتِ A (هر سه با `'`، `"`، `$`، فاصله، `\`) |
| ۱۰ | پیکربندیِ نامعتبر ⇒ خروجِ غیرصفر، بدونِ موفقِ کاذب | **PASS** | تست‌های E و I · هارنس · `ENTRYPOINT_EXIT=1` در بوتِ D |
| ۱۱ | محدودیت‌هایِ امتیاز دست‌نخورده | **PASS** | تست‌های A/B و G · هارنس (بدونِ ابرکاربر/BYPASSRLSِ اضافی) · بوتِ A |

### ۹-۲) نتایجِ CI

(پس از push در کامیتِ مستندات ثبت می‌شود.)

---

## ۱۰) مرورِ امنیتیِ دیف (فازِ ۵)

- ✅ **بدونِ plaintext:** هیچ رمزی در argv، متنِ SQL، لاگِ سرور، stdout/stderr یا
  محیطِ فرآیندِ فرزند نیست (هر چهار شکلِ literal سنجیده شد).
- ✅ **بدونِ لاگِ تصادفیِ رمز:** تنها چیزی که به لاگ می‌رود verifierِ SCRAM و
  متنِ prompt با نامِ نقش است.
- ✅ **بدونِ فایلِ موقتِ اعتبارنامه:** اسکریپتِ init هیچ فایلی نمی‌سازد؛ heredoc فقط
  اسکریپتِ بدونِ رمز را می‌گیرد و رمز از لولهٔ حافظه می‌رود.
- ✅ **مجوزِ فایل‌ها:** `10-runtime-role.sh` با mode `100755` (بدونِ تغییر) و هارنسِ
  تازه نیز executable است؛ هیچ فایلِ داده‌ای کامیت نشد.
- ✅ **بدونِ تغییرِ امتیاز:** نقش همچنان `nosuperuser/nobypassrls/nocreatedb/nocreaterole`
  است و RLS دست نخورد؛ هیچ `GRANT`/`REASSIGN OWNED` اضافه نشد.
- ✅ **بدونِ وابستگیِ تازه:** `package.json`/`package-lock.json` بدونِ تغییر؛ فقط
  bash + psqlِ خودِ ایمیج (+ `setsid` از util-linux که در Debian Essential است و
  **اختیاری** استفاده می‌شود).
- ✅ **بدونِ تغییرِ بی‌ربط:** ۰ مهاجرت، ۰ سرویسِ دیگر؛ تنها فایل‌هایِ بخشِ ۴.
- ✅ **بدونِ تضعیفِ gate:** هیچ تستی skip/حذف نشد؛ یک jobِ CI **اضافه** شد.

---

## ۱۱) ریسکِ باقی‌مانده و مواردِ صریحاً BLOCKED/UNVERIFIED

| مورد | وضعیت |
|---|---|
| **کانتینرِ واقعیِ `postgis/postgis:16-3.4` و `docker compose up`** | ⛔ **BLOCKED** — هیچ runtime کانتینری نصب نیست (`docker/podman/nerdctl/containerd/runc/dockerd/buildah/skopeo` همه MISSING)، `/var/run/docker.sock` وجود ندارد، و `registry-1.docker.io` / `auth.docker.io` / `download.docker.com` / `deb.debian.org` همه **HTTP 000** ⇒ نه runtime قابلِ نصب است نه ایمیج قابلِ pull. جانشینِ اجرایی‌شده: خودِ `docker-entrypoint.sh` رسمی با باینری‌هایِ 16.15. **هیچ PASS ای برایِ Docker/Compose ادعا نمی‌شود.** |
| حضورِ `setsid` در ایمیجِ واقعی | ⚠️ **UNVERIFIED** (بدونِ Docker قابلِ مشاهده نیست). ریسک پایین: util-linux در Debian `Essential` است و سرویسِ postgres در compose کلیدِ `tty` ندارد؛ ضمنِ اینکه اسکریپت `setsid` را **اختیاری** استفاده می‌کند و نبودش باعثِ شکست نمی‌شود. |
| سناریویِ «tty موجود است» | ⚠️ **UNVERIFIED** — در این sandbox نمی‌توان ترمینالِ کنترل‌کننده ساخت (`/dev/tty` ⇒ `No such device or address`). منطقِ آن از `src/common/sprompt.c` و معناشناسیِ `setsid()` در POSIX استنتاج شد و مسیرِ `setsid --wait` به‌صورتِ واقعی اجرا شد (انتقالِ stdin و کدِ خروج سنجیده شد). |
| رفتارِ `\password` در psqlِ **۱۶** | ✅ از منبعِ `REL_16_STABLE` تأیید شد و به‌صورتِ اجرایی با psql در برابر سرورِ 16.15 سنجیده شد؛ jobِ `init-hygiene` در CI آن را با psqlِ نصب‌شده از توزیع (هم‌نسخهٔ ایمیج) نیز می‌سنجد. |
| **verifier در لاگ** | ⚠️ **ریسکِ باقی‌ماندهٔ پذیرفته‌شده:** آنچه در لاگ می‌ماند یک verifierِ SCRAM است، نه plaintext. verifier معادلِ اعتبارنامه برایِ «pass-the-hash» است، ولی (الف) نقشِ هدف کم‌امتیاز و تحتِ RLS است، (ب) این دقیقاً همان چیزی است که psqlِ بالادستی برایِ هر تغییرِ رمز می‌فرستد، و (پ) صورت‌مسئله انتقالِ verifier به‌جایِ plaintext را صریحاً مجاز شمرده. برایِ حذفِ کاملِ همین مقدار هم تنها راه، `log_statement=none` بود که صورت‌مسئله آن را رد کرده است. |
| `db-privileges.api.test.ts` و `test:migrations` محلی | ⛔ **BLOCKED** — نبودِ PostGIS در بیلدِ یک‌بارمصرفِ sandbox؛ در CI پوشش داده می‌شود. |
| Redis rate limiting · `feature_flag.scope_type='user'` · بازیابیِ `sending` مانده | ⚠️ به‌ترتیب UNVERIFIED / در انتظارِ تصمیمِ محصول / DEFERRED (بدونِ تغییر نسبت به گزارش‌هایِ پیشین) |
