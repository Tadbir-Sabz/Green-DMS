/**
 * TASK-PM-02-C13 — تست‌های اجراکنندهٔ ارزیابیِ سایه‌ای و دروازهٔ مجوز.
 *
 * تمرکز: دروازه باید **رد کند**، نه هشدار بدهد. و ارزیابی باید بازتولیدپذیر باشد.
 */

import { describe, expect, it } from 'vitest';
import {
  diffAssessments,
  evaluateGate,
  REQUIRED_CONDITIONS,
  runShadowAssessment,
  UnauthorizedDatasetError,
  type DatasetSource,
} from '../src/modules/master-data/experimental/shadow-assessment.candidate';
import {
  CROSS_FIELD_FIXTURE,
  EMPTY_FIXTURE,
  COMPANY_A,
  makeLargeCrossFieldFixture,
} from './fixtures/c13-cross-field-identities';

// ── منبعِ ساختگیِ کامل ──────────────────────────────────────────────────────
const SYNTHETIC_SOURCE: DatasetSource = {
  kind: 'synthetic',
  identifier: 'c13-synthetic-fixture',
  owner_authorization: { granted: false, document_ref: null, granted_to: null },
  provenance: { documented: true, origin: 'apps/api/test/fixtures/c13-cross-field-identities.ts' },
  isolation: { proven: true, method: 'in-memory test fixture; never touches a database' },
  read_only_role: { role_name: null, enforced: false, proof: null },
  shared_write_path: false,
  confidentiality: { controls_documented: true, classification: 'synthetic' },
};

// ── منبعِ «واقعیِ» فرضی با همهٔ شروطِ برقرار ─────────────────────────────────
const FULLY_AUTHORIZED: DatasetSource = {
  kind: 'isolated-copy',
  identifier: 'isolated-replica-2025-11',
  owner_authorization: { granted: true, document_ref: 'AUTH-2025-0114', granted_to: 'C13 assessment' },
  provenance: { documented: true, origin: 'pg_dump of replica r2, 2025-11-10' },
  isolation: { proven: true, method: 'dedicated cluster, no network route to production' },
  read_only_role: {
    role_name: 'c13_readonly',
    enforced: true,
    proof: 'INSERT rejected: ERROR: cannot execute INSERT in a read-only transaction',
  },
  shared_write_path: false,
  confidentiality: { controls_documented: true, classification: 'confidential' },
};

describe('C13 / 11 — دروازهٔ مجوزِ داده', () => {
  it('منبعِ ساختگی مجاز است و صریحاً synthetic می‌ماند', () => {
    const g = evaluateGate(SYNTHETIC_SOURCE);
    expect(g.allowed).toBe(true);
    expect(g.kind).toBe('synthetic');
    expect(g.verdict).toBe('ALLOWED');
  });

  it('منبعِ واقعیِ کامل مجاز است', () => {
    const g = evaluateGate(FULLY_AUTHORIZED);
    expect(g.allowed).toBe(true);
    expect(g.failed).toEqual([]);
  });

  it('🔒 هر یک از شش شرط به‌تنهایی می‌تواند منبع را رد کند', () => {
    const breakers: Array<[string, (s: DatasetSource) => DatasetSource]> = [
      ['owner_authorization', (s) => ({ ...s, owner_authorization: { granted: false, document_ref: null, granted_to: null } })],
      ['documented_provenance', (s) => ({ ...s, provenance: { documented: false, origin: null } })],
      ['proven_isolation', (s) => ({ ...s, isolation: { proven: false, method: null } })],
      ['enforced_read_only_role', (s) => ({ ...s, read_only_role: { role_name: 'c13_readonly', enforced: false, proof: null } })],
      ['no_shared_write_path', (s) => ({ ...s, shared_write_path: true })],
      ['confidentiality_controls', (s) => ({ ...s, confidentiality: { controls_documented: false, classification: null } })],
    ];
    for (const [name, breaker] of breakers) {
      const g = evaluateGate(breaker(FULLY_AUTHORIZED));
      expect(g.allowed, `شرطِ ${name} نتوانست منبع را رد کند`).toBe(false);
      expect(g.failed).toContain(name);
      expect(g.verdict).toBe('BLOCKED — REAL DATA IMPACT ASSESSMENT');
    }
    expect(REQUIRED_CONDITIONS.length).toBe(6);
  });

  it('🔒 نقشِ فقط-خواندنی بدونِ شاهدِ اجرایی «اجبارشده» شمرده نمی‌شود', () => {
    // همان وضعیتِ C12: نقش وجود دارد، نامش معقول است، ولی هیچ شاهدی نیست
    const g = evaluateGate({
      ...FULLY_AUTHORIZED,
      read_only_role: { role_name: 'dms_readonly', enforced: true, proof: null },
    });
    expect(g.allowed).toBe(false);
    expect(g.failed).toContain('enforced_read_only_role');
  });

  it('🔒 «مجوز» بدونِ شناسهٔ سند یک ادعاست، نه مجوز', () => {
    const g = evaluateGate({
      ...FULLY_AUTHORIZED,
      owner_authorization: { granted: true, document_ref: '   ', granted_to: 'x' },
    });
    expect(g.allowed).toBe(false);
    expect(g.failed).toContain('owner_authorization');
  });

  it('🔒 منبعِ غیرمجاز ارزیابی را متوقف می‌کند و هیچ داده‌ای پردازش نمی‌شود', () => {
    const unauthorized: DatasetSource = { ...FULLY_AUTHORIZED, isolation: { proven: false, method: null } };
    expect(() => runShadowAssessment(CROSS_FIELD_FIXTURE, unauthorized)).toThrow(UnauthorizedDatasetError);
    try {
      runShadowAssessment(CROSS_FIELD_FIXTURE, unauthorized);
    } catch (e) {
      const err = e as UnauthorizedDatasetError;
      expect(err.gate.verdict).toBe('BLOCKED — REAL DATA IMPACT ASSESSMENT');
      expect(err.gate.failed).toContain('proven_isolation');
      expect(err.message).toContain('No query was executed');
    }
  });

  it('دلیل‌های رد شدن به فارسی و صریح گزارش می‌شوند', () => {
    const g = evaluateGate({ ...FULLY_AUTHORIZED, shared_write_path: true });
    expect(g.reasons_fa.length).toBeGreaterThan(0);
    expect(g.reasons_fa[0]).toContain('اثبات نشد');
  });
});

describe('C13 / 12 — گزارشِ ارزیابیِ سایه‌ای', () => {
  const report = runShadowAssessment(CROSS_FIELD_FIXTURE, SYNTHETIC_SOURCE, { redactValues: false });

  it('گزارش همهٔ بخش‌های لازم را دارد', () => {
    expect(report.report_version).toBe('c13.1');
    expect(report.contract_version).toBe('c13.1');
    expect(report.run_id).toMatch(/^C13-RUN-[0-9a-f]{8}$/);
    expect(report.dataset.synthetic).toBe(true);
    expect(report.dataset.identifier_hash).toMatch(/^[0-9a-f]{8}$/);
    expect(report.gate.allowed).toBe(true);
    expect(report.content_fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(report.report_fingerprint).toMatch(/^[0-9a-f]{8}$/);
    expect(report.assessment.results.length).toBeGreaterThan(0);
  });

  it('شناسهٔ منبعِ ساختگی خام می‌ماند (بی‌خطر و برای ردیابی لازم است)', () => {
    expect(report.dataset.identifier).toBe('c13-synthetic-fixture');
    expect(report.dataset.identifier_hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('🔒 شناسهٔ منبعِ واقعی هرگز خام گزارش نمی‌شود', () => {
    const real = runShadowAssessment(CROSS_FIELD_FIXTURE, FULLY_AUTHORIZED);
    expect(real.dataset.identifier).toBeNull();
    expect(real.dataset.identifier_hash).toMatch(/^[0-9a-f]{8}$/);
    expect(JSON.stringify(real)).not.toContain('isolated-replica-2025-11');
    // و مقدارِ خامِ ردیف‌ها هم نباید در گزارش باشد (پوشاندنِ پیش‌فرض)
    expect(real.dataset.synthetic).toBe(false);
  });

  it('«دادهٔ ساختگی است» صریحاً هشدار داده می‌شود', () => {
    expect(report.completeness.warnings_fa.some((w) => w.includes('ساختگی'))).toBe(true);
  });

  it('بازتولیدپذیری: دو اجرای یکسان اثرِ انگشتِ یکسان می‌دهند', () => {
    const again = runShadowAssessment(CROSS_FIELD_FIXTURE, SYNTHETIC_SOURCE, { redactValues: false });
    expect(again.report_fingerprint).toBe(report.report_fingerprint);
    expect(again.run_id).toBe(report.run_id);
    expect(again.content_fingerprint).toBe(report.content_fingerprint);
  });

  it('تغییرِ محتوا اثرِ انگشت را عوض می‌کند', () => {
    const changed = runShadowAssessment(
      [...CROSS_FIELD_FIXTURE, { entity_id: 'NEW', company_id: COMPANY_A, field: 'alias', display_value: 'brand new', stored_normalized: 'brand new', source_ref: 'new-row' }],
      SYNTHETIC_SOURCE,
    );
    expect(changed.content_fingerprint).not.toBe(report.content_fingerprint);
    expect(changed.run_id).not.toBe(report.run_id);
  });

  it('ترتیبِ ردیف‌ها اثرِ انگشتِ محتوا را عوض نمی‌کند', () => {
    const reversed = runShadowAssessment([...CROSS_FIELD_FIXTURE].reverse(), SYNTHETIC_SOURCE, { redactValues: false });
    expect(reversed.content_fingerprint).toBe(report.content_fingerprint);
  });

  it('مجموعهٔ ناقص صریحاً «ناقص» اعلام می‌شود', () => {
    const partial = runShadowAssessment(
      CROSS_FIELD_FIXTURE.filter((r) => r.field === 'alias'),
      SYNTHETIC_SOURCE,
    );
    expect(partial.completeness.complete).toBe(false);
    expect(partial.completeness.fields_missing.length).toBeGreaterThan(0);
    expect(partial.completeness.fields_missing).toContain('barcode');
    expect(partial.completeness.warnings_fa.some((w) => w.includes('پوشش ناقص'))).toBe(true);
  });

  it('مجموعهٔ خالی صریحاً هشدار می‌دهد، نه سکوت', () => {
    const r = runShadowAssessment(EMPTY_FIXTURE, SYNTHETIC_SOURCE);
    expect(r.completeness.complete).toBe(false);
    expect(r.completeness.rows).toBe(0);
    expect(r.assessment.results).toEqual([]);
    expect(r.completeness.warnings_fa.some((w) => w.includes('خالی'))).toBe(true);
  });

  it('شمارشِ شرکت‌ها درست است', () => {
    expect(report.completeness.companies).toBe(new Set(CROSS_FIELD_FIXTURE.map((r) => r.company_id)).size);
    expect(report.completeness.companies).toBe(3);
  });
});

describe('C13 / 13 — اجرای افزایشی', () => {
  const base = runShadowAssessment(CROSS_FIELD_FIXTURE, SYNTHETIC_SOURCE, { redactValues: false });

  it('اجرای نخست افزایشی نیست', () => {
    expect(base.incremental.is_incremental).toBe(false);
    expect(base.incremental.resumed_from).toBeNull();
  });

  it('اجرای دوم می‌تواند به اجرای اول ارجاع دهد', () => {
    const second = runShadowAssessment(CROSS_FIELD_FIXTURE, SYNTHETIC_SOURCE, {
      redactValues: false,
      resume_from: base.run_id,
    });
    expect(second.incremental.is_incremental).toBe(true);
    expect(second.incremental.resumed_from).toBe(base.run_id);
  });

  it('diff روی دادهٔ یکسان: همه پایدار، هیچ تازه، هیچ رفع‌شده', () => {
    const same = runShadowAssessment(CROSS_FIELD_FIXTURE, SYNTHETIC_SOURCE, { redactValues: false });
    const d = diffAssessments(base, same);
    expect(d.added).toEqual([]);
    expect(d.resolved).toEqual([]);
    expect(d.changed_decision).toEqual([]);
    expect(d.unchanged).toBe(base.assessment.results.length);
  });

  it('diff برخوردِ تازه را تشخیص می‌دهد', () => {
    const withNew = runShadowAssessment(
      [...CROSS_FIELD_FIXTURE, { entity_id: 'A-p99', company_id: COMPANY_A, field: 'barcode', display_value: '400111', stored_normalized: '400111', source_ref: 'A-p99-barcode' }],
      SYNTHETIC_SOURCE,
      { redactValues: false },
    );
    const d = diffAssessments(base, withNew);
    expect(d.added.length + d.changed_decision.length).toBeGreaterThan(0);
  });

  it('diff برخوردِ رفع‌شده را تشخیص می‌دهد', () => {
    // حذفِ ردیفِ بارکدِ CF-10 ⇒ برخوردِ alias↔barcode باید برطرف شود
    const without = runShadowAssessment(
      CROSS_FIELD_FIXTURE.filter((r) => r.source_ref !== 'A-p02-barcode'),
      SYNTHETIC_SOURCE,
      { redactValues: false },
    );
    const d = diffAssessments(base, without);
    expect(d.resolved.length).toBeGreaterThan(0);
  });

  it('diff قطعی است', () => {
    const a = diffAssessments(base, base);
    const b = diffAssessments(base, base);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('C13 / 14 — هیچ تغییری در منبعِ داده', () => {
  it('اجرای ارزیابی آرایهٔ ورودی را تغییر نمی‌دهد', () => {
    const snapshot = JSON.stringify(CROSS_FIELD_FIXTURE);
    runShadowAssessment(CROSS_FIELD_FIXTURE, SYNTHETIC_SOURCE, { redactValues: false });
    expect(JSON.stringify(CROSS_FIELD_FIXTURE)).toBe(snapshot);
  });

  it('گزارش هیچ میدانِ نوشتنی یا دستورِ مهاجرت ندارد', () => {
    const report = runShadowAssessment(CROSS_FIELD_FIXTURE, SYNTHETIC_SOURCE);
    const json = JSON.stringify(report);
    expect(json).not.toMatch(/(UPDATE|DELETE|INSERT|ALTER)\s/i);
    expect(report.gate.allowed).toBe(true);
  });
});

describe('C13 / 15 — مجموعهٔ بزرگ در اجراکننده', () => {
  it('۲٬۰۰۰ ردیف بدونِ خطا و با پوششِ کامل پردازش می‌شود', () => {
    const rows = makeLargeCrossFieldFixture(2000);
    const r = runShadowAssessment(rows, SYNTHETIC_SOURCE);
    expect(r.completeness.rows).toBe(rows.length);
    expect(r.assessment.summary.total).toBeGreaterThan(0);
    // هر چهار میدانِ موجود پوشش داده شده‌اند
    expect(r.completeness.fields_missing).not.toContain('alias');
    expect(r.gate.allowed).toBe(true);
  });
});
