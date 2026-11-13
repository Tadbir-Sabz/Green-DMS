/**
 * TASK-C13-EXECUTION-ENABLEMENT-01 — اجراکنندهٔ ارزیابیِ C13 علیه یک پایگاه‌دادهٔ ایزولهٔ تأییدشده.
 *
 * ⚠️ **آزمایشی و غیردادنی.** هیچ مسیرِ تولیدی (runtime، API، صف) این فایل را import نمی‌کند.
 *
 * برخلافِ shadow-evidence-cli (فایل‌به‌فایل)، این CLI مستقیماً و **فقط‌خواندنی** از یک محیطِ ایزولهٔ
 * disposable/replica می‌خواند — ولی فقط وقتی همهٔ پیش‌شرط‌ها (نقش read-only، تستِ منفیِ INSERT، RLS،
 * اسکیما، مهاجرت) برقرار باشند؛ وگرنه هیچ چیز نمی‌خواند/نوشته نمی‌شود.
 *
 * ── استفاده (env) ───────────────────────────────────────────────────────────
 *   C13_ASSESSMENT_DSN=postgres://c13_readonly@127.0.0.1:PORT/c13_disposable \
 *   npx tsx src/modules/master-data/experimental/shadow-db-cli.candidate.ts \
 *     --mode SYNTHETIC_FIXTURE --classification SYNTHETIC \
 *     --source source.json [--attestation auth.json] \
 *     --out evidence.json --sidecar verify.json
 *
 * DSN همیشه از متغیرِ محیطی خوانده می‌شود — هرگز از argv (تا در historyِ shell ننشیند) و هرگز چاپ نمی‌شود.
 *
 * کدهای خروج: 0 موفق · 2 دروازهٔ طبقه‌بندی/اعتبارسنجی رد کرد · 3 ورودی نامعتبر (usage/JSON) ·
 *             4 پیش‌شرطِ محیط رد شد (نقش/اسکیما/RLS/مهاجرت) · 5 وارسیِ گزارش شکست خورد · 10 خطای غیرمنتظره.
 * هیچ مقدارِ خامِ داده‌ای (کد/نام/بارکد) هرگز چاپ نمی‌شود.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { argv, exit, stderr } from 'node:process';
import { inspectIsolatedDb, AssessmentPreconditionError } from './shadow-db.candidate';
import { runAssessmentPipeline, AssessmentPipelineError } from './shadow-assessment-pipeline.candidate';
import type { ShadowAuthorization, ShadowAssessmentMode, ShadowDataClassification, ShadowSourceSpec } from './shadow-evidence.candidate';

const DSN_ENV = 'C13_ASSESSMENT_DSN';

function parseArgs(args: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : 'true';
      out[key] = val;
      if (val !== 'true') i += 1;
    }
  }
  return out;
}

function readJson(path: string, what: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    stderr.write(`خطا در خواندنِ ${what} (${path}): ${(err as Error).message}\n`);
    exit(3);
  }
}

function main(): void {
  const args = parseArgs(argv.slice(2));
  const mode = (args.mode ?? 'SYNTHETIC_FIXTURE') as ShadowAssessmentMode;
  const classification = (args.classification ?? 'SYNTHETIC') as ShadowDataClassification;
  if (!['SYNTHETIC_FIXTURE', 'ISOLATED_RESTORED', 'AUTHORIZED_REPLICA'].includes(mode)) {
    stderr.write('--mode باید SYNTHETIC_FIXTURE | ISOLATED_RESTORED | AUTHORIZED_REPLICA باشد.\n');
    exit(3);
  }
  if (!['SYNTHETIC', 'REAL_AUTHORIZED_REPLICA'].includes(classification)) {
    stderr.write('--classification باید SYNTHETIC | REAL_AUTHORIZED_REPLICA باشد.\n');
    exit(3);
  }
  if (!args.source) {
    stderr.write('--source source.json لازم است (identity, snapshotTsIso, …).\n');
    exit(3);
  }
  const dsn = process.env[DSN_ENV];
  if (!dsn) {
    stderr.write(`متغیرِ محیطیِ ${DSN_ENV} تنظیم نشده است. (DSN هرگز از argv خوانده نمی‌شود.)\n`);
    exit(3);
  }

  const source = readJson(args.source, 'منبع') as Omit<ShadowSourceSpec, 'assessmentMode'>;
  const attestation = args.attestation
    ? (readJson(args.attestation, 'تصدیقِ مجوز') as ShadowAuthorization)
    : undefined;

  const t0 = Date.now();

  void (async () => {
    let inspection;
    try {
      inspection = await inspectIsolatedDb({
        dsn,
        sourceLabel: source.identity,
        provenance: source.provenance ?? `disposable:${mode}`,
        requireRls: args['allow-rls-missing'] !== 'true',
        requireMigrationState: args['allow-migration-state-missing'] !== 'true',
        probeWrite: args['no-probe'] !== 'true',
        requireStrictRole: args['allow-weak-role'] !== 'true',
        companies: typeof args.companies === 'string' && args.companies !== 'true'
          ? args.companies.split(',').map((s) => s.trim()).filter(Boolean)
          : undefined,
      });
    } catch (err) {
      if (err instanceof AssessmentPreconditionError) {
        stderr.write(`${err.message}\n`);
        exit(4);
      }
      throw err;
    }

    const durationMs = Date.now() - t0;
    const fullSource: ShadowSourceSpec = {
      ...source,
      engineVersion: source.engineVersion ?? inspection.engineVersion,
      schemaMigration: source.schemaMigration ?? inspection.schemaMigration ?? undefined,
      recordCounts: source.recordCounts ?? inspection.recordCounts,
      // سگمنت‌هایِ تکراریِ یکسان را حذف می‌کنیم (منشأِ منبع و برچسبِ بازرسی اغلب یکی‌اند)
      provenance: [...new Set([source.provenance, inspection.provenance].filter(Boolean))].join(' | ') || undefined,
      assessmentMode: mode,
    };

    try {
      const { report, verification } = runAssessmentPipeline({
        rows: inspection.rows,
        classification,
        assessmentMode: mode,
        source: fullSource,
        authorization: attestation,
        exportedCounts: inspection.exportedCounts,
        recordCounts: inspection.recordCounts,
        recordCountsTenantScoped: inspection.recordCountsTenantScoped,
        now: undefined,
      });
      const out = JSON.stringify(report, null, 2);
      if (args.out) writeFileSync(args.out, out + '\n', 'utf8');
      if (args.sidecar) writeFileSync(args.sidecar, JSON.stringify(verification, null, 2) + '\n', 'utf8');
      stderr.write(
        `assessment_mode=${mode} classification=${classification}\n` +
          `assessment_id=${report.assessment_id} outcome=${report.verdict.outcome} findings=${report.observed.findings_total}\n` +
          `input_fingerprint=${report.reproducibility.input_fingerprint.slice(0, 16)}… evidence_fingerprint=${report.reproducibility.evidence_fingerprint.slice(0, 16)}…\n` +
          `record_counts=${JSON.stringify(inspection.recordCounts)} (tenant-scoped) exported=${JSON.stringify(inspection.exportedCounts)}\n` +
          `rls=${inspection.rls.map((r) => `${r.table}:${r.relrowsecurity && r.relforcerowsecurity ? 'on+force' : 'OFF'}`).join(',')}\n` +
          `probe_write_rejected=${inspection.probeWrite.rejected} (code=${inspection.probeWrite.errorCode ?? 'n/a'})\n` +
          `duration_ms=${durationMs} verification=${verification.ok ? 'PASS' : 'FAIL'} rows_in=${report.completeness.rows_in} (invalid=${report.completeness.rows_invalid})\n`,
      );
      if (!args.out) process.stdout.write(out + '\n');
      exit(verification.ok ? 0 : 5);
    } catch (err) {
      if (err instanceof AssessmentPipelineError) {
        stderr.write(`${err.message}\n`);
        exit(err.stage === 'VERIFY_REPORT' ? 5 : 2);
      }
      throw err;
    }
  })().catch((err) => {
    stderr.write(`خطای غیرمنتظره: ${(err as Error).message}\n`);
    exit(10);
  });
}

main();
