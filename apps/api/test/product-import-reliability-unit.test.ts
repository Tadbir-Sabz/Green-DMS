import { describe, expect, it } from 'vitest';
import {
  buildImportResult,
  classifyDomainCode,
  classifyImportError,
  importIssue,
  normalizeImportIssue,
  summarizeImportBatches,
  type ImportBatchOutcome,
  type ImportRecord,
} from '../src/modules/master-data/product-import-reliability';

/** DB-free contract tests for deterministic import failure/outcome vocabulary. */
const batch = (overrides: Partial<ImportBatchOutcome> = {}): ImportBatchOutcome => ({
  batch_no: 1,
  status: 'committed',
  transaction_outcome: 'committed',
  failure_category: 'none',
  retryable: false,
  total_rows: 1,
  created_rows: 1,
  updated_rows: 0,
  failed_rows: 0,
  attempts: 1,
  report: [importIssue(2, 'created', 'کالا ایجاد شد.')],
  ...overrides,
});

const record = (overrides: Partial<ImportRecord> = {}): ImportRecord => ({
  id: '00000000-0000-4000-8000-000000000010',
  status: 'completed',
  total_rows: 1,
  created_rows: 1,
  updated_rows: 0,
  failed_rows: 0,
  report: [],
  failure_category: 'none',
  retryable: false,
  transaction_outcome: 'committed',
  last_batch_no: 1,
  completed_at: '2026-11-09T00:00:00Z',
  ...overrides,
});

describe('TASK-PM-01D-M2 — deterministic import reliability helpers (DB-free)', () => {
  it('separates validation, business, permission, concurrency and infrastructure failures', () => {
    expect(classifyDomainCode('missing_category')).toEqual({ failure_category: 'validation', retryable: false });
    expect(classifyDomainCode('duplicate_code')).toEqual({ failure_category: 'business', retryable: false });
    expect(classifyDomainCode('status_change_forbidden')).toEqual({ failure_category: 'permission', retryable: false });
    expect(classifyDomainCode('concurrency_conflict')).toEqual({ failure_category: 'concurrency', retryable: true });
    expect(classifyDomainCode('batch_failed')).toEqual({ failure_category: 'infrastructure', retryable: true });
  });

  it('maps PostgreSQL serialization/deadlock and duplicate constraints without leaking SQL text', () => {
    const serialization = classifyImportError({ code: '40001' });
    expect(serialization).toMatchObject({
      code: 'concurrency_conflict',
      failure_category: 'concurrency',
      retryable: true,
      transaction_outcome: 'rolled_back',
      auto_retry: true,
    });
    expect(serialization.message_fa).not.toMatch(/select|insert|update|constraint|SQL/i);

    const duplicate = classifyImportError({ code: '23505', constraint: 'uq_product_code' });
    expect(duplicate).toMatchObject({
      code: 'duplicate_code',
      failure_category: 'business',
      retryable: false,
      transaction_outcome: 'rolled_back',
      auto_retry: false,
    });
    const lostConnection = classifyImportError({ code: '08006' });
    expect(lostConnection).toMatchObject({
      code: 'infrastructure_error',
      failure_category: 'infrastructure',
      retryable: false,
      transaction_outcome: 'unknown',
      auto_retry: false,
    });

    // A service-generated unknown outcome stays unknown; it must never be
    // silently downgraded to a safely retryable rolled-back transaction.
    const domainUnknown = classifyImportError({
      response: { code: 'infrastructure_error', message_fa: 'نتیجه نامشخص است.' },
    });
    expect(domainUnknown).toMatchObject({
      retryable: false,
      transaction_outcome: 'unknown',
      auto_retry: false,
    });
  });

  it('preserves a Nest domain error while suppressing raw database text', () => {
    const failure = classifyImportError({
      response: {
        code: 'status_change_forbidden',
        message_fa: 'مجوز تغییر وضعیت وجود ندارد.',
      },
      message: 'raw SQL should never be shown',
    });
    expect(failure).toMatchObject({
      code: 'status_change_forbidden',
      message_fa: 'مجوز تغییر وضعیت وجود ندارد.',
      failure_category: 'permission',
      retryable: false,
      transaction_outcome: 'rolled_back',
    });
    expect(failure.message_fa).not.toContain('raw SQL');
  });

  it('never aggregates a partial or unknown outcome as a fully committed import', () => {
    const partial = summarizeImportBatches([
      batch(),
      batch({
        batch_no: 2,
        status: 'rolled_back',
        transaction_outcome: 'rolled_back',
        failure_category: 'business',
        created_rows: 0,
        failed_rows: 1,
        report: [importIssue(102, 'duplicate_code', 'کد تکراری است.')],
      }),
    ]);
    expect(partial).toMatchObject({
      created_rows: 1,
      failed_rows: 1,
      transaction_outcome: 'partial',
      failure_category: 'business',
      retryable: false,
      last_batch_no: 2,
    });

    const unknown = summarizeImportBatches([
      batch({
        batch_no: 3,
        status: 'failed',
        transaction_outcome: 'unknown',
        failure_category: 'infrastructure',
        retryable: false,
        created_rows: 0,
        failed_rows: 1,
        report: [importIssue(202, 'infrastructure_error', 'اتصال قطع شد.')],
      }),
    ]);
    expect(unknown.transaction_outcome).toBe('unknown');
    expect(unknown.retryable).toBe(false);
    expect(unknown.failure_category).toBe('infrastructure');
  });

  it('normalizes legacy report rows and builds a replay-safe result', () => {
    const legacy = normalizeImportIssue({ row: 3, code: 'not_found', message_fa: 'یافت نشد.' }, 'import-1');
    expect(legacy).toMatchObject({
      row: 3,
      import_id: 'import-1',
      status: 'failed',
      failure_category: 'business',
      transaction_outcome: 'rolled_back',
    });

    const result = buildImportResult(
      record({
        failed_rows: 1,
        report: [{ row: 3, status: 'failed', code: 'not_found', message_fa: 'یافت نشد.' }],
        last_batch_no: 0,
        transaction_outcome: 'committed',
        failure_category: 'none',
      }),
      [],
      true,
    );
    expect(result).toMatchObject({
      import_id: '00000000-0000-4000-8000-000000000010',
      idempotent_replay: true,
      status: 'completed',
      transaction_outcome: 'partial',
      failure_category: 'business',
      failed_rows: 1,
    });
    expect(result.errors[0]).toMatchObject({ row: 3, code: 'not_found' });
    expect(result.batches).toEqual([]);
  });

  it('keeps batch identity, product identity and transaction outcome on issues', () => {
    const issue = importIssue(7, 'duplicate_barcode', 'بارکد تکراری است.', {
      batch_no: 4,
      import_id: 'import-4',
      product_code: 'SKU-7',
      product_id: '00000000-0000-4000-8000-000000000007',
      status: 'rolled_back',
      failure_category: 'business',
      retryable: false,
      transaction_outcome: 'rolled_back',
    });
    expect(issue).toEqual({
      row: 7,
      code: 'duplicate_barcode',
      message_fa: 'بارکد تکراری است.',
      batch_no: 4,
      import_id: 'import-4',
      product_code: 'SKU-7',
      product_id: '00000000-0000-4000-8000-000000000007',
      status: 'rolled_back',
      failure_category: 'business',
      retryable: false,
      transaction_outcome: 'rolled_back',
    });
    expect(JSON.stringify(issue)).not.toContain('company_id');
  });
});
