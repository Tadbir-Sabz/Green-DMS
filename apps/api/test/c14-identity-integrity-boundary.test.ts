import { readdirSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as diagnostics from '../src/modules/master-data/experimental/identity-integrity-diagnostics.candidate';
import { diagnoseIdentityIntegrity, type DiagnosticRow } from '../src/modules/master-data/experimental/identity-integrity-diagnostics.candidate';

/**
 * TASK-PM-02-C14-IDENTITY-INTEGRITY-02 — دروازه‌های مرزیِ C14 (DB-free، قطعی).
 *
 * این تست قفل می‌کند که کارِ تشخیصیِ این تسک از مرزهای C14 عبور نکند:
 *  ۱. هیچ کدِ تولیدی (apps/api/src خارج از experimental/) ماژول‌های *.candidate را import نمی‌کند؛
 *  ۲. هیچ migration ارجاعی به یافته‌های این تسک ندارد (هیچ enforcement/DDL خودکار)؛
 *  ۳. ماژول‌های تشخیصی هیچ تابعِ «اعمال/تعمیر/ادغام/حذف» ندارند — تشخیص الزاماً انسان است؛
 *  ۴. فایل‌های جدیدِ این تسک هیچ متغیر محیطیِ enforcement نمی‌سازند؛
 *  ۵. گزارشِ تشخیصی بین‌شرکتی هیچ مقدارِ خامِ شرکتِ دیگر را افشا نمی‌کند.
 */

const SRC = path.resolve(__dirname, '../src');
const MIGRATIONS = path.resolve(__dirname, '../../../migrations');

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(ts|js)$/.test(entry)) out.push(full);
  }
  return out;
};

describe('C14 boundary — ایزولاسیونِ ماژول‌های آزمایشی', () => {
  const sourceFiles = walk(SRC).filter((f) => !f.includes(`${path.sep}experimental${path.sep}`));

  it('هیچ کدِ تولیدیِ خارج از experimental/ به *.candidate اشاره نمی‌کند', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const text = readFileSync(file, 'utf8');
      if (/experimental\//.test(text) || /\.candidate'/.test(text) || /identity-integrity-diagnostics/.test(text)) {
        offenders.push(path.relative(SRC, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('هیچ migration به قراردادهای این تسک ارجاع نمی‌دهد', () => {
    const offenders: string[] = [];
    for (const entry of readdirSync(MIGRATIONS)) {
      const full = path.join(MIGRATIONS, entry);
      if (statSync(full).isFile() && /\.sql$/.test(entry)) {
        const text = readFileSync(full, 'utf8');
        if (/CIDENT|identity-integrity-diagnostics|multilingual-normalize|import-code-index/.test(text)) {
          offenders.push(entry);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('ماژول تشخیصی هیچ APIِ اعمال/تعمیر/ادغام/حذف صادر نمی‌کند', () => {
    const exported = Object.keys(diagnostics);
    expect(exported.length).toBeGreaterThan(0);
    const banned = /^(apply|enforce|fix|merge|repair|delete|drop|rewrite|backfill|migrate)/i;
    expect(exported.filter((k) => banned.test(k))).toEqual([]);
    expect(exported).toContain('diagnoseIdentityIntegrity');
  });

  it('فایل‌های جدیدِ این تسک هیچ متغیر محیطی نمی‌خوانند (هیچ enforcement پنهان)', () => {
    const newFiles = [
      'experimental/identity-integrity-diagnostics.candidate.ts',
      'experimental/multilingual-normalize.candidate.ts',
      'import-code-index.ts',
    ].map((rel) => path.join(SRC, 'modules/master-data', rel));
    for (const file of newFiles) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/process\.env/);
    }
  });

  it('گزارشِ تشخیصی همیشه diagnostics_only=true است', () => {
    const report = diagnoseIdentityIntegrity([]);
    expect(report.diagnostics_only).toBe(true);
    expect(report.summary.total_findings).toBe(0);
  });
});

describe('C14 boundary — ایزولاسیونِ بین‌شرکت/بین‌دامنه در خروجی تشخیصی', () => {
  const A = 'company-synth-A';
  const B = 'company-synth-B';
  const GTIN = '4006381333931';

  const row = (entityId: string, companyId: string, sourceRef: string): DiagnosticRow => ({
    entity_id: entityId,
    entity_type: 'product',
    company_id: companyId,
    identity_type: 'barcode',
    subtype: 'gs1_ean13',
    display_value: GTIN,
    stored_normalized: GTIN,
    source_ref: sourceRef,
    packaging_id: null,
    provenance: 'SYNTHETIC_FIXTURE',
  });

  it('مقادیر خامِ شرکتِ دیگر هرگز در گزارش ظاهر نمی‌شوند', () => {
    const report = diagnoseIdentityIntegrity([row('p1', A, 'ref-a'), row('p2', B, 'ref-b')]);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain(GTIN);
  });

  it('هیچ یافتهٔ بین‌شرکتی تصمیم ALLOWED نمی‌گیرد و همه به بازبینی انسان می‌رسند', () => {
    const report = diagnoseIdentityIntegrity([row('p1', A, 'ref-a'), row('p2', B, 'ref-b')]);
    const cross = report.findings.filter((f) => f.crosses_company);
    expect(cross.length).toBeGreaterThanOrEqual(1);
    for (const f of cross) {
      expect(f.decision).not.toBe('ALLOWED');
      expect(f.classification).toBe('manual_review');
      expect(f.normalized_comparison_value).toBeNull();
      expect(f.crosses_domain).toBe(true);
    }
  });
});
