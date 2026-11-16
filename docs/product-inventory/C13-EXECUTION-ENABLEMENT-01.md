# C13-EXECUTION-ENABLEMENT-01 — گزارشِ توانمندسازیِ اجرای C13 (خط‌لولهٔ ارزیابی، آداپتورِ فقط‌خواندنی، محیطِ disposable)

**مأموریت:** عملیاتی‌سازیِ ارزیابیِ سایهٔ C13: خط‌لولهٔ قطعیِ ingest→verify→emit، آداپتورِ بازرسیِ DB فقط‌خواندنی با اثباتِ نگارش‌ناپذیری، تمایزِ منشأ (SYNTHETIC_FIXTURE / ISOLATED_RESTORED / AUTHORIZED_REPLICA)، وارسی‌هایِ machine-verifiable کامل‌بودن/یکپارچگی، و محیطِ disposable برای اجرای end-to-end روی دادهٔ مصنوعی.

| مورد | مقدار |
| --- | --- |
| تاریخ | 2026-11-13 |
| محیط | Linux (Debian 12 bookworm) — هیچ اعتباری برای Windows وجود ندارد |
| شاخه | `arena/c13-execution-enablement-01` (از `arena/3fdef0e8-green-dms` به‌مبنای `a72951f`) |
| PR | PR #15 دست‌نخورده؛ `main` دست‌نخورده؛ هیچ merge/deploy انجام نشد |
| Verdict | **SYNTHETIC مسیر کامل PASS است؛ REAL (replica/restored) UNVERIFIED** — عمداً |

## ۱) فایل‌های جدید/تغییر یافته

| فایل | نوع | محتوا |
| --- | --- | --- |
| `apps/api/src/modules/master-data/experimental/shadow-assessment-pipeline.candidate.ts` | جدید | خط‌لولهٔ ۶ مرحله‌ای (INGEST→VALIDATE_INPUT→GATE→EXECUTE→VERIFY_REPORT→EMIT)؛ `AssessmentPipelineError`؛ GATE با قواعدِ منشأ؛ VERIFY_REPORT با `validateShadowEvidence` + بازتولید؛ تطبیقِ `export ⊆ source` زیرِ زمینهٔ tenant |
| `apps/api/src/modules/master-data/experimental/shadow-db.candidate.ts` | جدید | آداپتورِ بازرسیِ DB: نقشِ `default_transaction_read_only=on` از rolconfig/SHOW + probeِ INSERT در تراکنشِ read-only (**فقط SQLSTATE 25006 پذیرفته می‌شود**)؛ کشفِ اسکیما؛ RLS؛ `schema_migrations`؛ خواندنِ per-company زیرِ RLS + شمارشِ tenant-scoped |
| `apps/api/src/modules/master-data/experimental/shadow-db-cli.candidate.ts` | جدید | CLI (`--dsn` فقط از env؛ هرگز argv): حالت/طبقه‌بندی/منبع/attestation؛ خروج‌هایِ مشخص (۰/۲/۳/۴/۵/۱۰)؛ sidecarِ وارسی (`c13-verify.1`) |
| `apps/api/test/c13-assessment-pipeline.test.ts` | جدید | ۲۳ تست (۲۲ واحد + ۱ E2Eِ gated با `C13_E2E_DSN`) |
| `apps/api/test/fixtures/c13-disposable-schema.sql` | جدید | DDL مصنوعیِ هم‌شکلِ 0046/0047 (با `enable`+`force row level security`) + دادهٔ تست (UPC/EAN هم‌ارزش، GTIN با رقمِ کنترلیِ غلط، داخلیِ هم‌ارزشِ بین‌شرکتی، legacy بسته‌بندی) |
| `scripts/c13-disposable-pg.mjs` | جدید | چرخهٔ عمرِ PostgreSQL یکبارمصرف (`provision`/`teardown`/`selftest`)؛ نقش‌های `c13_readonly`(فقط‌خواندنیِ سخت)/`c13_writer`؛ نگهبانِ marker؛ هرگز DB اشتراکی/سیستمی را لمس نمی‌کند |
| `apps/api/src/modules/master-data/experimental/shadow-evidence.candidate.ts` | تغییر | `ShadowAssessmentMode` + `assessment_mode` روی گزارش (builder می‌نویسد؛ validator الزام می‌کند و با طبقه‌بندی تطبیق می‌دهد) |
| `apps/api/test/c13-cross-type-policies.test.ts` | تغییر (افشایی) | **فقط فهرستِ سفیدِ ماژول‌های آزمایشی** برای پوششِ سه فایلِ candidate جدید (`shadow-db`، `shadow-assessment-pipeline`، `shadow-db-cli`)؛ هیچ assertionی حذف/ضعیف نشد و کدِ Production همچنان نمی‌تواند `experimental/` را import کند |
| `docs/product-inventory/evidence/task-pm-02/EVIDENCE-C13B-EVIDENCE.schema.json` | تغییر | `source.assessment_mode` (اختیاری، enum سه‌حالته) — نمونه‌های قدیمی c13b.1 همچنان معتبر می‌مانند |

`migrations/` بدونِ تغییر · RLS بدونِ تغییر · هیچ مسیرِ Production importی به این فایل‌ها نمی‌کند.

## ۲) قواعدِ ایمنی که اکنون enforced هستند

1. **REAL هرگز از synthetic ساخته نمی‌شود** — نه در GATE (نشانگرِ `synth` ⇒ پرتاب) و نه در validator (`REAL_AUTHORIZED_REPLICA` + `assessment_mode=SYNTHETIC_FIXTURE` ⇒ نامعتبر).
2. **گزارشِ synthetic authorization حمل نمی‌کند** — GATE ادعای مجوزِ ساختگی را رد می‌کند.
3. **گزارشِ REAL بدون شش attestation ساخته نمی‌شود** (قبل و بعد از این تسک).
4. **هیچ گزارشی بدون وارسی emit نمی‌شود** — شکست در هر مرحله (از جمله VERIFY_REPORT) ⇒ هیچ خروجی‌ای نوشته نمی‌شود.
5. **شمارشِ منبع باید tenant-scoped باشد** — `recordCounts` کورِ خواندن مردود است؛ `export > source` ⇒ VERIFY_REPORT FAIL.
6. **probeِ نگارش فقط با 25006 پاس می‌شود** — هر خطای دیگر (42501/23503/42P01/…) محیط را نامعتبر اعلام می‌کند (نه «فقط‌خواندنی اثبات‌شده»).
7. ردیف‌های نامعتبر کنار گذاشته و در `rows_invalid` + هشدار + verification ثبت می‌شوند — صفرِ یافته هرگز با دادهٔ ناقص خلط نمی‌شود.

## ۳) اجرای end-to-end روی محیطِ disposable (دادهٔ مصنوعی)

```bash
node scripts/c13-disposable-pg.mjs provision --work-dir /tmp/c13-ee01-demo --port 55439
export C13_ASSESSMENT_DSN=$(python3 -c "import json;print(json.load(open('/tmp/c13-ee01-demo/env.json'))['readonlyDsn'])")
cd apps/api && npx tsx src/modules/master-data/experimental/shadow-db-cli.candidate.ts \
  --mode SYNTHETIC_FIXTURE --classification SYNTHETIC --source /tmp/c13-ee01-demo/source.json \
  --out /tmp/c13-ee01-demo/evidence.json --sidecar /tmp/c13-ee01-demo/verify.json
node scripts/c13-disposable-pg.mjs teardown --work-dir /tmp/c13-ee01-demo   # همیشه در پایان
```

خروجیِ واقعی (نسخهٔ اجراشده): `exit=0` · `assessment_mode=SYNTHETIC_FIXTURE` · `outcome=FINDINGS_PRESENT` · `findings=50` · `rows_in=43 (invalid=0)` · `rls=product_family/alias/barcode: on+force` · `probe_write_rejected=true (code=25006)` · `record_counts == exported` (tenant-scoped: product ۷، family ۲، category ۲، alias ۴، barcode ۱۰، packaging ۶) · `verification=PASS` (۱۲ چک از جمله `export-within-source:*`، `fingerprint-reproducible`). `evidence.json` روی `EVIDENCE-C13B-EVIDENCE.schema.json` (draft 2020-12) **VALID** شد (jsonschema 4.26.0). یافته‌ها و وضعیتِ `real_data_status="UNVERIFIED — SYNTHETIC ONLY"` صادقانه‌اند: این «یافتهٔ» سازمان نیست.

## ۴) تست‌ها

- `node scripts/check-test-partition.mjs --check` ⇒ **OK** (پارتیشنِ محاسبه‌شده == مانیفست).
- پارتیشنِ unit (همان دستوری که CI می‌راند): **۵۰ فایل، ۸۳۶ تست PASS، ۱ skipped** (E2Eِ gated با `C13_E2E_DSN`؛ با DSN اجرا شد و PASS بود — ۲۳/۲۳).
- `c13-cross-type-policies.test.ts` (گاردِ ایزولاسیون): **PASS** بعد از افشایِ فهرستِ سفیدِ candidateها.
- `npm run typecheck` (ریشه) و `npm run build -w apps/api`: **۰ خطا**.
- سوئیتِ DB-backed (`*.api.test.ts` + ۱۸ فایل non-api) در این سندباکس **اجرا نشد** — سرویسِ PostgreSQLِ 16/PostGIS با اسکیمایِ کاملِ مهاجرت‌ها وجود ندارد؛ این تسک آن‌ها را ادعا نمی‌کند. (در CI با سرویسِ `postgis/postgis:16-3.4` اجرا می‌شوند.)

## ۵) محدودیت‌ها و ادعاهای نقیض‌نشده

- **REAL UNVERIFIED**: هیچ replica/ایزولهٔ بازیابی‌شدهٔ سازمانی در دسترس نبود؛ مسیرِ `ISOLATED_RESTORED`/`AUTHORIZED_REPLICA` فقط با تست‌های واحد (rows دستیِ بدون نشانگرِ synthetic) آزموده شد، نه روی دادهٔ سازمانی.
- محیطِ disposable فقط SYNTHETIC را اثبات می‌کند؛ دادهٔ synthetic هرگز با برچسبِ isolated/authorized گزارش نمی‌شود (GATE).
- validator نوع‌اسکریپتی `assessment_mode` را الزامی می‌کند ولی schema خارجی آن را اختیاری نگه می‌دارد (سازگاریِ نمونه‌های c13b.1) — تفاوتِ آگاهانه، نه خطا.
- مهاجرت‌های 0046/0047 عمداً replay نشدند (pgserver فقط `vector`+`plpgsql` دارد)؛ DDL مصنوعیِ هم‌شکل انتخاب شد — تصمیم بی‌اجازهٔ مالک نیست؛ اسکیمای مهاجرت‌ها دست‌نخورده است.
- یافته‌هایِ ۵۰‌گانهٔ نمونهٔ synthetic صرفاً اثباتِ مکانیک‌اند؛ هیچ ادعایی دربارهٔ دادهٔ تولید ندارند (D-C13-2/D-C13-3 همچنان UNKNOWN؛ صفر تصمیمِ مالک).

## ۶) گامِ بعدیِ مشخص

**جفت‌کردنِ آداپتور با یک replicaِ ایزولهٔ واقعی (یا backup بازیابی‌شده روی میزبانِ مجزا) و صدورِ اولین گزارشِ `ISOLATED_RESTORED` با اجرای چک‌لیست §۳ REV1 (شش attestation + ارجاعِ ticket) — یا، در غیابِ آن، اجرای dry-run روی لایوی stagingِ فقط‌خواندنی با تأییدِ مالک.** تا آن زمان، هر ادعای «C13 روی دادهٔ واقعی PASS است» نامعتبر است.
