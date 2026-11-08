# TASK-24V — گزارشِ نهاییِ دروازهٔ راستی‌آزمایی و حسابرسیِ مستقل

> **نوعِ کار:** دروازهٔ راستی‌آزمایی (verification gate) — نه دورِ تازهٔ توسعه.
> **نتیجهٔ نهایی (پس از اصلاحِ G-23 و اجرای دوبارهٔ CI):** **PASS برای merge** — هر ۵ jobِ CI سبز
> (`42452304238` @`090c78b`)، مهاجرت‌ها و release-image سبز. دو یافتهٔ بازِ کارکردی
> (`HIGH-1-R1`، `HIGH-2-R1`) و پرسش‌های مالک باقی می‌مانند ولی **مسدودکنندهٔ merge نیستند**؛
> e2e و Kotlin همچنان `UNVERIFIED/BLOCKED` (محدودیتِ زیرساخت) است.
> **هیچ merge، deploy، force-push، تغییرِ branch-protection یا پاک‌سازیِ مخرب انجام نشد.**

---

## ۱) هویتِ دقیقِ نسخهٔ حسابرسی‌شده

| مورد | مقدار |
|---|---|
| مخزن | `Tadbir-Sabz/Green-DMS` |
| شاخه | `arena/1246108f-green-dms` |
| نسخهٔ حسابرسی‌شده (TASK-24F) | `00f7f12ca655a90e0e3ff043ae89e0bed19366de` · tree `e102b2b1aa056ce5493f799df0341bbeac0da4b0` · `protected:false` · `2026-11-07T18:39:31Z` |
| نسخهٔ پیاده‌سازیِ TASK-24F | `1e361085ae89bbd1ba42c625073b2adf5dd36168` (parent `5203d3f`) |
| commitهای دروازهٔ راستی‌آزمایی (TASK-24V) | `c1c9a3e` (ترمیمِ نحوی/هم‌ترازیِ آزمون‌های قیمت) · `75728e8` (هم‌ترازیِ آزمون‌های G-03/مهاجرت + آزمونِ RLS) |
| نسخهٔ رفعِ G-23 | `090c78b` — اصلاحِ `rules-engine.service.ts` + ۳ آزمونِ رگرسیونِ تازه |
| HEAD فعلیِ شاخه | `090c78b` (فقط روی همین شاخه push شد) — پیش از آن `2354d04`, `7e9bdbf`, `75728e8`, `c1c9a3e` |
| PR | **#13 (draft)** — فقط برای اجرای workflowهای موجود روی PR؛ **merge نشده** |
| وضعیتِ worktree | پاک (پیش از commitهای مستندات) |

**تأییدِ هویت پیش از هر کار:** `git fetch` + `rev-parse HEAD`/`^{tree}` + `gh api` (شاخه و commitها) ⇒
`local == remote`، ۲۶۱۳/۲۶۱۳ blob یکسان با نسخهٔ گزارش‌شده. ادعاهای هویتیِ گزارش‌های پیشین پذیرفته نشد؛
خودشان راستی‌آزمایی شدند.

**اتفاقِ محیطی (افشا):** در میانهٔ کار، سندباکس بازنشانی شد و `/tmp` (پایگاه‌دادهٔ موقت، harness، shim)
از دست رفت؛ HEAD به `d12dc2e` عقب رفت ولی محتوایِ worktree حفظ شده بود. بازیابی: پشتیبانِ
`/home/user/task24v-worktree-backup.tar.gz` + `git reset --mixed origin/arena/1246108f-green-dms`
(فقط index؛ بدونِ `checkout -f`/`clean`/`reset --hard`/force-push). شواهدِ DB-محوری که پیش از
بازنشانی اجرا شده بودند در §۲ ثبت‌اند؛ از آن پس، اجرای معتبر = CI (که خودش PostGIS واقعی دارد).

---

## ۲) نتایجِ Agent-1 — CI و پایگاه‌دادهٔ ایزوله

### ۲-۱) پایگاه‌دادهٔ ایزوله (پیش از بازنشانی سندباکس)

هویتِ DB اثبات‌شده: `PostgreSQL 17.6`، `inet_server_addr()=127.0.0.1/32`، پورت `55432`،
`data_directory=/tmp/pgdata24`، کاربر `postgres` با `trust`، بدونِ PostGIS، **بدونِ هیچ اتصال به DB
اشتراکی/تولیدی**. مالکیتِ یک‌بارمصرف: دیتابیسِ `mig_probe` در همان کلاسترِ موقت ساخته و در پایان
حذف شد.

| گام | نتیجه |
|---|---|
| اعمالِ همهٔ `migrations/*.up.sql` در یک تراکنش (`psql -1`) | **exit 0** |
| فهرستِ اشیای 0050 | `pricing_settings` (۱۱ ستون، RLS `relrowsecurity=true`/`relforcerowsecurity=true`)، سیاستِ `p_pricing_settings_tenant`، ۴ مجوزِ تازه (`pricing.settings.view/update`، `pricing.backdate.apply`، `pricing.price_list.cross_domain`)، `dms_app`: `SELECT=true`/`INSERT=true`/`UPDATE=false`/`DELETE=false` |
| فهرستِ اشیای 0051 | ایندکسِ یکتای `uq_approval_decision_step` موجود؛ `trg_promotion_redemption_immutable` موجود |
| چرخهٔ 0051 down→up | ایندکس `1→0→1` (پاک) |
| چرخهٔ 0050 down→up | جدول/مجوزها/تریگر `حذف→بازگشت`؛ `dms_app` پس از down `UPDATE=true` و پس از up `false` (پاک) |
| RLSِ `pricing_settings` با نقشِ `dms_app` | با `app.company_id=A`: **۱ ردیف** (فقط A) · درج برای B: **`42501`** · بدونِ زمینه: **۰ ردیف** (fail-closed) · `dms_readonly`: SELECT ✓ |

> این اجراها روی کپیِ harness با مهاجرت‌های «PostGIS-پچ‌شده» انجام شد (تصویرِ embedded-postgres
> فاقدِ PostGIS است). هیچ‌کدام به‌عنوانِ «تأییدِ تولیدی» ارائه نمی‌شود؛ نسخهٔ معتبر با PostGIS واقعی
> همان workflow «مهاجرت‌های پایگاه‌داده» است (§۲-۲).

### ۲-۲) CI — ترجیحِ workflowهای موجود (بدونِ افزودنِ pipeline تازه)

`ci.yml` فقط روی `push/PR` به `main` اجرا می‌شود؛ پس شاخهٔ کار **هیچ‌گاه** CI ندیده بود. برای اجرای
همان workflowهای موجود، PR **#13 (draft)** از همین شاخه به `main` باز شد (بدونِ merge).

| workflow | Run ID | commit | نتیجه |
|---|---|---|---|
| مهاجرت‌های پایگاه‌داده (up→down→up + مقایسهٔ دقیقِ اشیا) | `42402374930` | `00f7f12` | ✅ success |
| مهاجرت‌های پایگاه‌داده | `42450239490` | `75728e8` | ✅ success |
| release-image (build+boot+migrations+health+login+proxy+secret-scan+fail-closed) | `42450239575` | `75728e8` | ✅ success |
| e2e (Playwright) | `42450239526` | `75728e8` | ⛔ **BLOCKED** — `quay.io/minio/minio` 401 و `minio/minio` pull access denied ⇒ **صفر آزمونِ مرورگری اجرا نشد** (محدودیتِ زیرساخت، نه محصول) |
| CI @ `c1c9a3e` | `42404284138` | `c1c9a3e` | ❌ failure — integration-db: **۱۳ fail / ۸۷۴ pass / ۱ expected-fail (۸۸۸)** در ۴۱ فایل |
| **CI @ `75728e8`** | `42450239559` | `75728e8` | ❌ failure — integration-db: **۱ fail / ۸۸۷ pass / ۱ expected-fail (۸۸۹)**، ۴۰/۴۱ فایل سبز |
| CI @ `7e9bdbf` | `42450639729` | `7e9bdbf` | ❌ failure — همان یک شکستِ G-23 بدونِ تغییر |
| **CI @ `090c78b` (HEAD — پس از رفعِ G-23)** | `42452304238` | `090c78b` | ✅ **success — هر ۵ job سبز** (static · unit · Integration (Postgres) · Integration (MinIO) · init-hygiene) |
| مهاجرت‌های پایگاه‌داده @ HEAD | `42452304177` | `090c78b` | ✅ success |
| release-image @ HEAD | `42452304402` | `090c78b` | ✅ success |
| e2e @ HEAD | `42452304218` / `42452625588` | `090c78b` / `9b8bf87` | ⛔ BLOCKED (بدونِ ایمیجِ MinIO؛ صفر آزمونِ مرورگری). **پیش‌موجود، نه رگرسیونِ این شاخه:** e2e روی `main` هم پیش از این کار در ۴ اجرای متوالی (`42372429275`، `42372091303`، `42349918251`، `42250552238`) شکست خورده است |

**تفکیکِ jobهای CI @ `75728e8`:** static ✅ · unit (DB-free) ✅ · Integration (MinIO) ✅ ·
Init credential hygiene ✅ · **Integration (Postgres) ❌ (۱ شکست)**.

**سه شکستِ یافته‌شده در `c1c9a3e` و سرنوشتشان:**

1. `rules-engine-behavior.test.ts` (۷ شکست) — الگویِ سفارش `unit_price` بدونِ `price_override_reason`
   می‌ساخت؛ مسیرِ یگانهٔ موتور (HIGH-1) قیمتِ دستیِ واگرا را بدونِ دلیل رد می‌کند → **انتظارِ کهنه**، دلیل افزوده شد.
2. `rules-engine-behavior.test.ts` (۳ شکست) — TASK-24F تأییدِ خود را ممنوع کرد و آزمون‌ها با همان
   درخواست‌دهنده تصمیم می‌گرفتند → **انتظارِ کهنه**، تصمیم‌گیرندهٔ دوم (`rb_admin2`) اضافه شد.
3. `migrations-security.test.ts` (۳ شکست) — شمارشِ مهاجرت‌ها ثابت روی ۴۹ مانده بود و 0050/0051
   افزوده شده بودند (`expected 51 to be 49`) → **انتظارِ کهنه**، به ۵۱ به‌روز شد.

**شکستِ چهارم — نقصِ واقعیِ محصول، شناسایی و رفع شد:** `rules-engine-behavior.test.ts > G03-13..19 >
تأییدِ دومرحله‌ای…` ⇒ مرحلهٔ ۲: **`409 Conflict`** با `amount_band_mismatch`. ریشه: بازمحاسبهٔ گام از
باندِ مبلغ در لحظهٔ تصمیم (§۵-الف، `G-23`). با commit `090c78b` رفع شد و CI روی همان commit **کامل سبز** است.

### ۲-۳) آزمون‌های DB-محورِ قیمت — نتیجه

| مجموعه | نتیجهٔ معتبر |
|---|---|
| `pricing-engine.api.test.ts` (PE-1..PE-12، ۴۶ مورد) | ✅ در CI: **۴۵ pass + ۱ expected-fail** (`it.fails` برای نقصِ بازِ HIGH-2) — شاملِ PE-12 تازه (RLS) |
| `orders.api.test.ts` + `pricing.api.test.ts` (۳۱ مورد) | ✅ **۳۱/۳۱** |
| `pricing-remediation.unit.test.ts` (DB-free) | ✅ ۱۶/۱۶ |
| کلِ suite در CI | **۸۸۹+/۸۸۹+ سبز** در run نهاییِ `42452304238` (پس از افزودنِ ۳ آزمونِ رگرسیونِ G-23؛ ۸۸۷ pass + ۱ expected-fail پیش از آن) |

---

## ۳) Kotlin — تولیدِ کلاینت از قرارداد

اجرای `npm run clients:generate`:

```
▸ تولید کلاینت Kotlin → android/client
▸ دانلود openapi-generator-cli
  دانلود https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/7.26.0/...jar
✗ شکست تولید کلاینت‌ها: fetch failed
```

⇒ **`UNVERIFIED`**. شبکهٔ محیط فقط GitHub/npm/PyPI را می‌گذراند؛ `repo1.maven.org`, `api.adoptium.net`
مسدودند و `tools/openapi-generator-cli.jar`/JRE در مخزن نیست. کلاینتِ TypeScript بازتولید شد ولی
**هیچ ادعایی از آن برای Kotlin استنتاج نمی‌شود** (طبقِ محدودیتِ صریحِ کار). وضعیت: بدونِ تغییر.

---

## ۴) Agent-2 — داوریِ یافته‌به‌یافته (read-only)

> روش: مطالعهٔ کدِ همان commitِ حسابرسی‌شده (`00f7f12` = `1e36108` + مستندات)، اجرای آزمون‌ها در
> CI، و یک probeِ موقتِ API روی DB ایزوله (بدونِ تغییرِ فایل‌های مخزن).

| شناسه | موضوع | داوری | شاهد |
|---|---|---|---|
| **HIGH-1** | مسیرِ یگانه و اجباریِ موتورِ قیمت برای سفارش | **PARTIAL** | `order.service.ts:105-117` (`quoteViaEngine` برای create/update)، تنها مسیرِ درجِ `sales_order` = `order.repository.ts` ⇒ همهٔ مسیرها یکتا شدند. **اما:** `sales-chain.service.ts:130` سفارش را با `this.orders.create(companyId, orderDto)` می‌سازد (بدونِ actor/permissions) و `requested_price` را به‌عنوان `unit_price` می‌دهد ⇒ probe: `POST /requests/{id}/convert` با `requested_price == قیمتِ سیستمی (1500)` ⇒ **`403 manual_price_not_authorized`**. یعنی هر درخواستِ مشتری که قیمتِ درخواستی دارد، دیگر به سفارش تبدیل نمی‌شود. نقصِ یکپارچگیِ تازه (`HIGH-1-R1`). |
| **HIGH-2** | سقف‌های تخفیف از سیاستِ پایدار (`pricing_settings`) | **PARTIAL** | `pricing-engine.service.ts:366-410` (ساختِ `options` فقط از `opts`)، `getSettings/updateSettings` تعریف‌شده‌اند و مسیرِ **سفارش** آن‌ها را می‌خواند (PE-3/PASS)، ولی `POST /pricing/quote` و `simulate` نمی‌خوانند ⇒ «هم‌سانیِ سند و شبیه‌سازی» برقرار نیست. اثباتِ اجرایی: `it.fails` در `pricing-engine.api.test.ts` (سقفِ ۵٪ ذخیره می‌شود ولی quote تخفیفِ ۴۰٪ = ۳۴۰ می‌دهد). |
| **HIGH-3** | ممیزیِ قیمتِ دستی (actor/قیمتِ سیستمی/دلیل) | **FIXED** | `price_change_log` با `before_data.system_unit_price`، `after_data.unit_price`، `reason`، `actor_user_id`؛ PE-10 (۵ سناریو) در CI سبز. آزمون اکنون قیمتِ سیستمیِ مرجع را از خودِ موتور و با **تاریخِ مؤثرِ سفارش** می‌خواند (نه تاریخِ سند) — تصحیحِ آزمون، نه loosen کردنِ assert. |
| **HIGH-4** | تخصیص/هدیه/دفترِ مصرف در موتور | **FIXED** | PE-3 (سقف/هدیه) و PE-11 (هم‌خوانیِ دفتر، فقط-افزودنی، idempotency) سبز؛ ۱۶ آزمونِ واحدِ remediation. |
| **MEDIUM-1** | استثنای کفِ سود: شخصِ دوم، دامنه، انقضا | **FIXED** | `assertId`/`requested_by !== actor` (403 `second_person_required`)، `valid_until`، `entity` scope؛ PE-4 (۲ سناریو) سبز. تصمیمِ دومرحله‌ایِ استثنا نیز به وضعیتِ `approved` درخواستِ تأیید گره خورده است. |
| **MEDIUM-2** | لیستِ قیمتِ بین‌قلمرویی | **FIXED** | PE-9 (۳ سناریو: ممنوع ۴۰۳، با مجوز+دلیل ۲۰۱، لیستِ شرکت‌گستر بدونِ ممیزی) سبز؛ `pricing.price_list.cross_domain` + `cross_domain_use` در `price_change_log`. |
| **MEDIUM-3** | هم‌ترازیِ قرارداد/کلاینت/وب | **FIXED** | `openapi:check`: ۱۷۳ مسیر/۲۵۱ عملیات/۱۲۶ schema/۳ webhook؛ `contract-drift`: ۰؛ `check-test-partition`: OK؛ `typecheck` (API+Web): ۰؛ schema.ts بازتولید شد **بدونِ diff**. |
| **MEDIUM-4** | فقط-افزودی‌بودنِ دفترِ مصرف | **FIXED** | مهاجرت 0050: `dms_app` روی `promotion_redemption` فقط `SELECT/INSERT`؛ تریگر `trg_promotion_redemption_immutable`؛ کد فقط INSERT (`pricing-engine.repository.ts:426`)؛ PE-11 سبز. |
| **MEDIUM-5** | idempotency و replayِ قیمت | **FIXED** | `hash = canonical({dto, cacheableOptions(opts)})` + `request_hash` mismatch ⇒ 409، `ttl` + برابریِ `pricing_date`؛ PE-7/PE-11 سبز. |
| **G-03** | سخت‌سازیِ موتورِ تأیید | **PARTIAL + پس‌رفت** | (الف) زنجیرهٔ خالی ⇒ 409 ✓ (ب) `requested_by` از نشست ✓ (ج) منعِ خودتأییدی ✓ (د) یکتاییِ تصمیم در هر مرحله ✓ — **ولی** بررسیِ تازهٔ `amount_band_mismatch` گردشِ چندمرحله‌ای را می‌شکند (§۵-الف) ⇒ `VERIFIED = NO`. |

### ۴-۱) ادعایِ «عملیاتِ حساسِ قیمت به موتورِ تأییدِ ناقص وصل نیست»

**دقیق نیست؛ باید اصلاح شود.** `pricing-engine.service.ts:838-857` هنگام ساختِ استثنای کفِ سود، اگر
زنجیرهٔ فعالِ `pricing.margin_exception` وجود داشته باشد `createApprovalRequest` می‌سازد و
`decideMarginException` (L899-912) تا `status === 'approved'` شدنِ آن درخواست، تصمیمِ شخصِ دوم را
با `409 approval_pending` متوقف می‌کند. یعنی: **استثنای کفِ سود — یک عملیاتِ حساسِ قیمت — به‌صورتِ
سیاستی/اختیاری به موتورِ تأییدِ ناقص گره خورده است**، و با نقصِ §۵-الف عملاً در زنجیره‌های دومرحله‌ای
قفل می‌شود. بقیهٔ عملیاتِ حساس (نوشتنِ قیمت، سقف‌ها، عقب‌گرد، override دستی) به موتورِ تأیید وصل
**نیستند** و فقط با مجوز/دلیل/ممیزی کنترل می‌شوند. این تفکیک باید در مستندات و تصمیمِ مالک روشن شود
(`Q-24-11`).

---

## ۵) شکاف‌های باقی‌مانده

### ۵-الف) ✅ رفع‌شده (G-23) — گردشِ تأییدِ چندمرحله‌ای در گامِ ۲ قفل می‌شد

- **وضعیت:** `RESOLVED @ 090c78b` — تأیید با CI سبز (`42452304238`).
- **کشف:** CI run `42450239559` روی `75728e8`: `Tests 1 failed | 887 passed | 1 expected fail (889)`،
  `expected 201 "Created", got 409 "Conflict"` در `rules-engine-behavior.test.ts:495`.
- **ریشه (کدِ `1e36108`):** `apps/api/src/modules/rules-engine/rules-engine.service.ts` در **هر**
  تصمیم، گام را با `findCurrentStep(steps, amount)` بازمحاسبه و با `stepNo` مقایسه می‌کرد. آن تابع
  «**نخستین** گامِ سازگار با مبلغ» را برمی‌گرداند؛ برای هر زنجیره‌ای که گامِ ۱ بی‌باند است (یا مبلغ در
  باندِ گامِ ۱ می‌افتد) همیشه `1` می‌دهد ⇒ گامِ ۲ با `409 amount_band_mismatch` برای همیشه قفل، و
  هیچ زنجیرهٔ ≥۲ مرحله‌ای کامل نمی‌شد (تأییدِ سفارشِ `require_approval` و استثنای کفِ سود).
- **اصلاح (حداقلی، یک فایل):** باند فقط «گامِ ورود» را در لحظهٔ **ثبتِ درخواست** تعیین می‌کند. در زمانِ
  تصمیم، تنها **پیش از نخستین تصمیم** یک بار بررسی می‌شود که گامِ جاری هنوز همان گامِ متناظر با مبلغ
  باشد (ضدِ دستکاریِ مبلغ پس از ثبت). پیشرویِ متوالی با `stepNo = req.current_step` و به‌روزرسانیِ
  شرطیِ `expected: {status:'pending', currentStep}` تضمین می‌شود؛ گام‌های بعدی با باند سنجیده نمی‌شوند
  (زنجیرهٔ تشدیدِ `0..1000 / 1000..5000 / 5000..∞` با مبلغِ ۲۵۰۰ در همهٔ گام‌ها پیش می‌رود).
- **آزمون‌های رگرسیونِ افزوده (۳):**
  1. زنجیرهٔ بی‌باندِ دومرحله‌ای تا انتها پیش می‌رود (`pending/step 2` ⇒ `approved`)، بدونِ `409`.
  2. زنجیرهٔ تشدیدِ سه‌گامی با مبلغِ ۲۵۰۰: ورود در گامِ ۲ ⇒ گامِ ۳ ⇒ `approved`.
  3. مبلغِ دستکاری‌شده پس از ثبت (`update approval_request set amount`): نخستین تصمیم ⇒
     `409 amount_band_mismatch` با `expected_step` — کنترلِ ضدِ دستکاری حفظ شد.
- **نتیجه:** `Integration (Postgres)` سبز؛ `G-23` از `OPEN (blocking)` به `RESOLVED` رفت.

### ۵-ب) 🟠 `HIGH-1-R1` — تبدیلِ درخواستِ مشتری به سفارش با `requested_price` می‌شکند

`sales-chain.service.ts:114-131` ⇒ `orders.create(companyId, orderDto)` بدونِ `actorUserId`/`permissions`
و بدونِ `price_override_reason`. probe: `403 manual_price_not_authorized` (حتی وقتی قیمتِ درخواستی **برابر**
قیمتِ سیستمی است، چون قاعده حضور-محور است: `pricing-engine.ts:530-536`). **هیچ آزمونِ DB-محوری برای
`sales-chain` وجود ندارد** (grep در `apps/api/test` ⇒ صفر). پیشنهاد: انتقالِ `@CurrentUser` از کنترلر به
`convert()` و افزودنِ `price_override_reason` اختیاری/الزامی + یک آزمونِ API.

### ۵-ج) 🟡 `HIGH-2-R1` — `quote`/`simulate` سیاستِ پایدار را نمی‌خوانند (هم‌سانیِ سند/شبیه‌سازی)

مستند و آزمون‌شده با `it.fails`. نیاز به تصمیمِ مالک: آیا شبیه‌سازی باید دقیقاً مثلِ سفارش سیاست‌محور باشد؟

### ۵-د) G-03 — شکاف‌های ساختاریِ باقی‌مانده (بدونِ تغییر نسبت به ۲۴F)

1. `approval_request` ستونِ `company_id` ندارد؛ جداسازی از طریقِ `join approval_chain` انجام می‌شود
   (`rules-engine.repository.ts:459-471`) ⇒ **mitigated، نه closed** (defense-in-depth).
2. مسیرِ `GET /approvals/{id}` روی mountِ قراردادی وجود ندارد؛ جزئیات فقط زیرِ
   `GET /rules-engine/approvals/{id}` (مستند) است ⇒ ناسازگاریِ مسیر، نه نبودِ قابلیت.
3. اتصالِ استثنای کفِ سود به زنجیرهٔ تأیید، سیاستی و ناقص است (§۴-۱) — با §۵-الف مسدودکننده می‌شود.
4. `POST /approvals` قراردادی (بدونِ `step_no` در DTO) همچنان به `current_step` تکیه می‌کند؛ با اصلاحِ
   §۵-الف باید بازآزمایی شود.

---

## ۶) تصمیم‌های بازِ مالک (بدونِ تغییر؛ هیچ‌کدام توسطِ این دروازه حل نشد)

| شناسه | موضوع | وضعیت |
|---|---|---|
| Q-24-01 | سیاستِ پیش‌فرضِ اعمالِ تشویق روی سفارش (`apply_promotions_on_orders`) | **باز** |
| Q-24-02 | سقفِ پیش‌فرضِ تخفیف/کفِ سودِ شرکت (مقادیرِ `pricing_settings`) | **باز** |
| Q-24-03 | دامنهٔ مجوزِ `pricing.price_list.cross_domain` (شرکت‌گستر یا قلمرویی) | **باز** |
| Q-24-04 | الزامِ دلیل برای قیمتِ دستیِ **واگرا** — vs الزام برای هر قیمتِ دستی | **موقت/باز** (پایهٔ فعلی: واگرا) |
| Q-24-05 | سیاستِ عقب‌گرد (`backdate_*`): پنجره، سطحِ مجوز، الزامِ دلیل | **باز** |
| Q-24-07 | رفتارِ idempotency سفارش (سفارشِ دومِ مستقل vs همان سفارش) | **باز** |
| Q-24-08 | نمایش/عدمِ نمایشِ قیمتِ سیستمی به کاربرِ بدونِ مجوز | **باز** |
| Q-24-09 | الزامِ دلیل برای تاریخِ گذشته به‌طورِ عام (اثر: هر کلاینتِ قدیمی با تاریخِ گذشته ۴۰۰ می‌گیرد) | **باز** (رفتارِ کنونی: الزامی) |
| Q-24-10 | گردشِ تأییدِ قیمتِ دستی (اتصال یا عدمِ اتصال به موتورِ تأیید) | **باز** |
| Q-24-11 | اتصالِ استثنای کفِ سود به زنجیرهٔ تأیید: اجباری/اختیاری/حذف | **باز (توصیه: اجباری پس از رفعِ §۵-الف)** |
| Q-24-12 | منعِ خودتأییدی در همهٔ زنجیره‌ها (تغییرِ رفتاریِ ۲۴F) | **باز (توصیه: حفظ؛ مستند شود)** |

> Q-24-06 منسوخ است. هیچ تصمیمِ کسب‌وکاری در این دور گرفته نشد.

---

## ۷) به‌روزرسانیِ ارجاع‌ها

- `docs/product-inventory/EVIDENCE_INDEX.md` — بخشِ **۱۰) TASK-24V** افزوده شد (SHA/run ID/شمارش‌ها).
- `docs/product-inventory/TASK-24_PRICING_ENGINE.md` — بخشِ **§۹ TASK-24V** افزوده شد (وضعیتِ نهاییِ
  موردها + نقصِ مسدودکننده + اثر بر G-03).
- `docs/product-inventory/GAP_REGISTER.md` — ردیفِ تازهٔ **G-23** (پس‌رفتِ گردشِ تأییدِ چندمرحله‌ای) و
  ارجاعِ متقابل در G-03؛ **هیچ یافتهٔ تاریخی بازنویسی نشد**.

---

## ۸) داوریِ کلی

**PASS** (با باقیماندهٔ مستند) — دروازه ابتدا **FAIL** داد و همان FAIL به یک نقصِ واقعیِ محصول انجامید
که رفع و با CI سبز تأیید شد:

- ✅ **CI کامل سبز** روی `090c78b` (`42452304238`): static · unit · **Integration (Postgres)** ·
  Integration (MinIO) · init credential hygiene — هر ۵ job.
- ✅ مهاجرت‌ها (0049/0050/0051) با PostGIS واقعی، چرخهٔ up→down→up + مقایسهٔ اشیا: **سبز**
  (`42452304177`).
- ✅ release-image (build+boot+migrations+health+login+proxy+secret-scan+fail-closed): **سبز**
  (`42452304402`).
- ✅ **G-23 رفع شد**: گردشِ تأییدِ چندمرحله‌ای دیگر قفل نمی‌شود؛ ۳ آزمونِ رگرسیونِ تازه + آزمون‌های موجود.
- ✅ RLSِ `pricing_settings` (PE-12) سبز؛ آزمون‌های قیمت (PE-1..PE-12) سبز با ۱ expected-failِ مستند.
- 🟠 دو یافتهٔ بازِ **غیرِ مسدودکننده**: `HIGH-1-R1` (تبدیلِ درخواست→سفارش با `requested_price` ⇒ ۴۰۳)
  و `HIGH-2-R1` (ناهم‌سانیِ `quote`/`simulate` با سیاستِ پایدار) — هر دو نیازِ تصمیم/کارِ بعدیِ مالک.
- ⛔ e2e: **BLOCKED** (نبودِ ایمیجِ MinIO) — صفر آزمونِ مرورگری؛ G-01 همچنان باز. به محصول نسبت داده نشد.
- ⛔ Kotlin: **UNVERIFIED** (شبکهٔ Maven).

---

## ۹) توصیهٔ صریح دربارهٔ merge

**از نظرِ دروازهٔ فنی: PASS** — هیچ نقصِ مسدودکننده‌ای باقی نمانده و همهٔ workflowهای قابلِ اجرا سبزند.
پیش از merge، این دو تصمیم در اختیارِ مالک است (هیچ‌کدام از جنسِ شکستِ CI نیستند):

1. **§۵-ب `HIGH-1-R1`** — تبدیلِ `POST /requests/{id}/convert` به سفارش وقتی `requested_price` دارد
   با ۴۰۳ `manual_price_not_authorized` شکست می‌خورد (رفتارِ fail-closed، اما یک قابلیت را می‌بندد).
   گزینه‌ها: (الف) انتقالِ actor/permissions از کنترلر + الزامِ `price_override_reason`، (ب) پذیرشِ
   موقت + ثبت در بدهیِ فنی و مستندسازی، (ج) بازگرداندنِ مسیرِ ویژه (توصیه نمی‌شود).
2. **§۵-ج `HIGH-2-R1`** — آیا شبیه‌سازی/`quote` باید دقیقاً مثلِ سفارش سیاست‌محور باشد؟ (آزمونِ `it.fails`
   رفتارِ فعلی را مستند کرده است؛ تغییرِ رفتار نیازِ تصمیمِ مالک دارد.)

پس از این دو تصمیم، merge توسطِ **انسان** انجام می‌شود؛ این دروازه هیچ merge/deploy انجام نمی‌دهد.
تصمیم‌های بازِ کسب‌وکاری (Q-24-01..05، Q-24-07..12) مستقل از merge قابلِ پیگیری‌اند.

**هیچ merge، deploy یا تغییرِ تنظیماتِ شاخه انجام نشد؛ منتظرِ مجوزِ مالک.**

---

## ۱۰) پیوست — وضعیتِ دو یافتهٔ باز پس از TASK-24W

| یافتهٔ این گزارش | وضعیتِ TASK-24V | وضعیتِ فعلی (TASK-24W @`f5c89b6`) |
|---|---|---|
| **§۵-ب `HIGH-1-R1`** — تبدیلِ درخواست با `requested_price` ⇒ `403` | OPEN (غیرِ مسدودکننده) | **CLOSED** — actor/مجوز/دلیل/ممیزی + ضدِ هم‌زمانی؛ ۱۱ سناریوی آزمونِ DB-محور |
| **§۵-ج `HIGH-2-R1`** — `quote`/`simulate` سیاستِ پایدار را نمی‌خوانند | OPEN (`it.fails` مستند) | **CLOSED** — `pricedPolicyRun` مسیرِ واحد؛ `it.fails` به آزمونِ واقعی تبدیل شد |
| §۵-الف `G-23` | RESOLVED @`090c78b` | RESOLVED (بدونِ تغییر) |
| `G-03` | PARTIAL / VERIFIED=(a),(c),(d) | **بدونِ تغییر — عمداً کامل اعلام نشد** (جدولِ سطحِ قابلیت در `TASK-24_PRICING_ENGINE.md` §۱۰-۴) |
| e2e | BLOCKED (MinIO) | BLOCKED (پیش‌موجود روی `main`) |
| Kotlin | UNVERIFIED (Maven) | UNVERIFIED (بدونِ تغییر) |

**شواهدِ اجرا (TASK-24W):** CI `42458240290` @`f5c89b6` — هر ۵ job سبز؛ مهاجرت‌ها `42458240314` سبز؛
release-image `42458240295` سبز؛ e2e `42458240364` BLOCKED.
آزمون‌های محلی روی DB ایزوله: `task24w` ۲۱/۲۱ · `pricing-engine.api` ۴۷/۴۷ ·
`rules-engine-behavior` ۲۷/۲۷ · واحدها ۶۹/۶۹ · وب ۵۲/۵۲ · `openapi:check` ۱۷۳/۲۵۱/۱۲۷/۳ · drift = ۰.

**حسابرسیِ مستقلِ Agent-2:** انجام نشده — درخواست در
`docs/product-inventory/TASK-24W_INDEPENDENT_AUDIT_REQUEST.md` ثبت شده و وضعیت
`AWAITING INDEPENDENT AUDIT` است. **Agent-1 کارِ خود را تأیید نمی‌کند.**

