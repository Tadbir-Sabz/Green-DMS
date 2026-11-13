/**
 * TASK-PM-02-C13B — اجراکنندهٔ خط‌فرمانِ «شواهدِ ارزیابیِ سایه» (فایل‌به‌فایل؛ بدونِ اتصال به DB).
 *
 * ⚠️ **آزمایشی و غیرفعال.** هیچ مسیرِ تولیدی (runtime، API، صف) این فایل را import نمی‌کند.
 *
 * این CLI عمداً هیچ‌گونه اتصالِ پایگاه‌داده ندارد: نسخهٔ مستقل از داده (export فقط‌خواندنیِ
 * تأییدشده) را از فایل می‌خواند و شواهد را روی فایل می‌نویسد. خواندنِ خودِ داده از replica،
 * تنها با مجوزِ مستند و با نقشِ فقط‌خواندنی (بخش ۴ سندِ Track B) مجاز است — نه توسطِ این ابزار.
 *
 * ── استفاده ──────────────────────────────────────────────────────────────────
 *   npx tsx src/modules/master-data/experimental/shadow-evidence-cli.candidate.ts \
 *     --rows rows.json            # آرایهٔ CrossTypeRow (export تأییدشده)
 *     --source source.json        # ShadowSourceSpec (JSON)
 *     [--attestation auth.json]   # ShadowAuthorization — الزامی برای REAL_AUTHORIZED_REPLICA
 *     --classification SYNTHETIC|REAL_AUTHORIZED_REPLICA
 *     [--out evidence.json]       # بدونِ این پرچم فقط چاپ می‌کند؛ چیزی روی دیسک نمی‌نشیند
 *
 * کدهای خروج: 0 موفق · 2 دروازهٔ مجوز رد کرد · 3 ورودی نامعتبر است.
 * مقادیرِ نمایشی هرگز چاپ نمی‌شوند.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { argv, exit, stderr, stdout } from 'node:process';
import {
  buildShadowEvidence,
  validateShadowEvidence,
  ShadowEvidenceAuthorizationError,
  type ShadowAuthorization,
  type ShadowDataClassification,
  type ShadowSourceSpec,
} from './shadow-evidence.candidate';
import { IDENTITY_TYPES, type CrossTypeRow } from './cross-type-collision.candidate';

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

const REQUIRED_ROW_STRINGS = [
  'entity_id',
  'entity_type',
  'identity_type',
  'display_value',
  'source_ref',
  'company_id',
  'stored_normalized',
] as const;

function sanitizeRows(raw: unknown): { rows: CrossTypeRow[]; dropped: number } {
  if (!Array.isArray(raw)) {
    stderr.write('rows.json باید یک آرایه باشد.\n');
    exit(3);
  }
  const validTypes = new Set<string>(IDENTITY_TYPES as readonly string[]);
  const rows: CrossTypeRow[] = [];
  let dropped = 0;
  for (const item of raw) {
    const r = item as Partial<CrossTypeRow> | null;
    const okShape =
      r !== null &&
      typeof r === 'object' &&
      REQUIRED_ROW_STRINGS.every((k) => typeof r[k] === 'string' && (r[k] as string).length >= 0) &&
      typeof r.identity_type === 'string' &&
      validTypes.has(r.identity_type);
    if (!okShape) {
      dropped += 1;
      continue;
    }
    rows.push({
      ...(r as CrossTypeRow),
      subtype: typeof r.subtype === 'string' ? r.subtype : null,
      category_id: typeof r.category_id === 'string' ? r.category_id : null,
      family_id: typeof r.family_id === 'string' ? r.family_id : null,
      domain_id: typeof r.domain_id === 'string' ? r.domain_id : undefined,
      stored_normalized: r.stored_normalized as string,
    });
  }
  return { rows, dropped };
}

function main(): void {
  const args = parseArgs(argv.slice(2));
  if (!args.rows || !args.source || !args.classification) {
    stderr.write('استفاده: --rows rows.json --source source.json --classification SYNTHETIC|REAL_AUTHORIZED_REPLICA [--attestation auth.json] [--out evidence.json]\n');
    exit(3);
  }
  const classification = args.classification as ShadowDataClassification;
  if (classification !== 'SYNTHETIC' && classification !== 'REAL_AUTHORIZED_REPLICA') {
    stderr.write('--classification باید SYNTHETIC یا REAL_AUTHORIZED_REPLICA باشد.\n');
    exit(3);
  }

  const { rows, dropped } = sanitizeRows(readJson(args.rows, 'ردیف‌ها'));
  if (dropped > 0) {
    stderr.write(`هشدار: ${dropped} ردیفِ نامعتبر کنار گذاشته شد (ساختار یا identity_type).\n`);
  }
  const source = readJson(args.source, 'منبع') as ShadowSourceSpec;
  const attestation = args.attestation
    ? (readJson(args.attestation, 'تصدیقِ مجوز') as ShadowAuthorization)
    : undefined;

  const t0 = Date.now();
  let report;
  try {
    report = buildShadowEvidence(rows, {
      dataClassification: classification,
      source,
      authorization: attestation,
      executionDurationMs: undefined, // پس از محاسبه پر می‌شود
    });
  } catch (err) {
    if (err instanceof ShadowEvidenceAuthorizationError) {
      stderr.write(`رد شد: ${err.message}\n`);
      exit(2);
    }
    throw err;
  }
  const durationMs = Date.now() - t0;
  // بازسازی با duration (قطعیّتِ fingerprint حفظ می‌شود چون duration در fingerprint نیست)
  report = buildShadowEvidence(rows, {
    dataClassification: classification,
    source,
    authorization: attestation,
    executionDurationMs: durationMs,
    assessmentId: report.assessment_id,
  });

  const problems = validateShadowEvidence(report);
  const out = JSON.stringify(report, null, 2);
  if (args.out) {
    writeFileSync(args.out, out + '\n', 'utf8');
    stderr.write(`شواهد نوشته شد: ${args.out}\n`);
  } else {
    stdout.write(out + '\n');
  }
  stderr.write(
    `assessment_id=${report.assessment_id} outcome=${report.verdict.outcome} ` +
      `findings=${report.observed.findings_total} fingerprint=${report.reproducibility.evidence_fingerprint.slice(0, 16)}… ` +
      `duration_ms=${durationMs}\n` +
      (problems.length > 0 ? `اعتبارسنجی: ${problems.length} تخلف — ${problems.join(' | ')}\n` : 'اعتبارسنجی: OK\n'),
  );
  if (problems.length > 0) exit(2);
}

main();
