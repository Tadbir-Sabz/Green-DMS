/**
 * TASK-PM-01D-M2 — deterministic, DB-free import reliability vocabulary.
 *
 * This module deliberately has no PostgreSQL or Nest dependency. It is the
 * single place that maps domain/DB failures to a stable technical category,
 * retryability and transaction outcome. Business rules (§E per-batch atomicity,
 * M-5 sensitive fields, D4) are NOT decided here.
 */

export type ImportStatus = 'processing' | 'completed' | 'failed';
export type ImportBatchStatus = 'committed' | 'rolled_back' | 'rejected' | 'failed';
export type ImportTransactionOutcome = 'committed' | 'rolled_back' | 'not_started' | 'unknown';
export type ImportAggregateOutcome = ImportTransactionOutcome | 'partial';
export type ImportFailureCategory =
  | 'none'
  | 'validation'
  | 'business'
  | 'permission'
  | 'concurrency'
  | 'infrastructure';
export type ImportRowStatus = 'created' | 'updated' | 'failed' | 'rejected' | 'rolled_back';

export interface ImportIssue {
  row: number;
  code: string;
  message_fa: string;
  batch_no?: number;
  import_id?: string;
  product_code?: string;
  product_id?: string;
  status?: ImportRowStatus;
  failure_category: ImportFailureCategory;
  retryable: boolean;
  transaction_outcome: ImportTransactionOutcome;
}

export interface ImportBatchOutcome {
  batch_no: number;
  status: ImportBatchStatus;
  transaction_outcome: ImportTransactionOutcome;
  failure_category: ImportFailureCategory;
  retryable: boolean;
  reason_code?: string;
  message_fa?: string;
  total_rows: number;
  created_rows: number;
  updated_rows: number;
  failed_rows: number;
  attempts: number;
  report: ImportIssue[];
}

export interface ImportRecord {
  id: string;
  status: ImportStatus;
  total_rows: number;
  created_rows: number;
  updated_rows: number;
  failed_rows: number;
  report: unknown;
  failure_category?: ImportFailureCategory;
  retryable?: boolean;
  transaction_outcome?: ImportAggregateOutcome;
  last_batch_no?: number;
  completed_at?: string | null;
}

export interface ImportResult {
  import_id: string;
  total_rows: number;
  created_rows: number;
  updated_rows: number;
  failed_rows: number;
  errors: ImportIssue[];
  idempotent_replay: boolean;
  status: ImportStatus;
  transaction_outcome: ImportAggregateOutcome;
  failure_category: ImportFailureCategory;
  retryable: boolean;
  batches: ImportBatchOutcome[];
  report: ImportIssue[];
}

export interface ImportFailure {
  code: string;
  message_fa: string;
  failure_category: ImportFailureCategory;
  retryable: boolean;
  transaction_outcome: ImportTransactionOutcome;
  auto_retry: boolean;
}

const VALIDATION_CODES = new Set([
  'missing_identity', 'duplicate_in_file', 'invalid_number', 'invalid_enum',
  'missing_category', 'missing_uom', 'unknown_category', 'unknown_uom',
  'unknown_tax_code', 'invalid_header', 'empty_file', 'file_too_large',
  'too_many_rows', 'invalid_data',
]);
const BUSINESS_CODES = new Set([
  'duplicate_code', 'not_found', 'sensitive_change_requires_confirmation',
  'duplicate_barcode', 'barcode_collision', 'invalid_barcode',
  'invalid_barcode_kind', 'barcode_save_failed', 'reference_conflict',
  'sku_generation_conflict',
]);
const PERMISSION_CODES = new Set([
  'status_change_forbidden', 'catalog_write_forbidden', 'catalog_context_mismatch',
]);
const CONCURRENCY_CODES = new Set(['concurrency_conflict', 'import_in_progress']);
const INFRASTRUCTURE_CODES = new Set(['batch_failed', 'import_failed', 'infrastructure_error']);

const CATEGORY_SEVERITY: Record<ImportFailureCategory, number> = {
  none: 0,
  validation: 1,
  business: 2,
  permission: 3,
  concurrency: 4,
  infrastructure: 5,
};

const BATCH_STATUSES = new Set<ImportBatchStatus>([
  'committed', 'rolled_back', 'rejected', 'failed',
]);
const TRANSACTION_OUTCOMES = new Set<ImportTransactionOutcome>([
  'committed', 'rolled_back', 'not_started', 'unknown',
]);
const AGGREGATE_OUTCOMES = new Set<ImportAggregateOutcome>([
  'committed', 'partial', 'rolled_back', 'not_started', 'unknown',
]);
const FAILURE_CATEGORIES = new Set<ImportFailureCategory>([
  'none', 'validation', 'business', 'permission', 'concurrency', 'infrastructure',
]);

/** Technical classification of a known domain code. Unknown codes are conservative. */
export function classifyDomainCode(code: string): {
  failure_category: ImportFailureCategory;
  retryable: boolean;
} {
  if (VALIDATION_CODES.has(code)) return { failure_category: 'validation', retryable: false };
  if (BUSINESS_CODES.has(code)) return { failure_category: 'business', retryable: false };
  if (PERMISSION_CODES.has(code)) return { failure_category: 'permission', retryable: false };
  if (CONCURRENCY_CODES.has(code)) return { failure_category: 'concurrency', retryable: true };
  if (INFRASTRUCTURE_CODES.has(code)) return { failure_category: 'infrastructure', retryable: true };
  return { failure_category: 'business', retryable: false };
}

/** A safe, fully classified row/batch issue. Never carries raw SQL or cross-company fields. */
export function importIssue(
  row: number,
  code: string,
  message_fa: string,
  options: Partial<Omit<ImportIssue, 'row' | 'code' | 'message_fa'>> = {},
): ImportIssue {
  const classified = classifyDomainCode(code);
  const status = options.status ?? (code === 'created' || code === 'updated' ? code : 'failed');
  const defaultOutcome: ImportTransactionOutcome =
    status === 'created' || status === 'updated'
      ? 'committed'
      : status === 'rejected'
        ? 'not_started'
        : status === 'rolled_back'
          ? 'rolled_back'
          : options.transaction_outcome ?? 'rolled_back';
  return {
    row,
    code,
    message_fa,
    ...(options.batch_no != null ? { batch_no: options.batch_no } : {}),
    ...(options.import_id ? { import_id: options.import_id } : {}),
    ...(options.product_code ? { product_code: options.product_code } : {}),
    ...(options.product_id ? { product_id: options.product_id } : {}),
    status,
    failure_category: options.failure_category ?? classified.failure_category,
    retryable: options.retryable ?? classified.retryable,
    transaction_outcome: options.transaction_outcome ?? defaultOutcome,
  };
}

/** Map a thrown domain/PostgreSQL error to a deterministic, non-leaking failure. */
export function classifyImportError(err: unknown): ImportFailure {
  const response = (err as { response?: { code?: unknown; message_fa?: unknown } })?.response;
  const domainCode = typeof response?.code === 'string' ? response.code : undefined;
  const domainMessage = typeof response?.message_fa === 'string' ? response.message_fa : undefined;
  const pg = err as { code?: string; constraint?: string };
  const sqlState = typeof pg.code === 'string' ? pg.code : '';
  const constraint = typeof pg.constraint === 'string' ? pg.constraint : '';

  if (sqlState === '40001' || sqlState === '40P01') {
    return {
      code: 'concurrency_conflict',
      message_fa: 'تداخل همزمانی در تراکنش؛ هیچ ردیفی ذخیره نشد و تلاش مجدد ایمن است.',
      failure_category: 'concurrency',
      retryable: true,
      transaction_outcome: 'rolled_back',
      auto_retry: true,
    };
  }
  if (sqlState === '23505') {
    const code = constraint.includes('barcode') ? 'duplicate_barcode' : 'duplicate_code';
    return {
      code,
      message_fa: domainMessage ?? (
        code === 'duplicate_barcode'
          ? 'این بارکد قبلاً ثبت شده است؛ دسته به طور کامل برگشت خورد.'
          : 'این کد کالا قبلاً ثبت شده است؛ دسته به طور کامل برگشت خورد.'
      ),
      failure_category: 'business',
      retryable: false,
      transaction_outcome: 'rolled_back',
      auto_retry: false,
    };
  }
  if (sqlState === '23503') {
    return {
      code: 'reference_conflict',
      message_fa: domainMessage ?? 'ارجاع داده‌های مرجع همزمان تغییر کرد؛ دسته برگشت خورد.',
      failure_category: 'business',
      retryable: false,
      transaction_outcome: 'rolled_back',
      auto_retry: false,
    };
  }
  if (sqlState === '23514') {
    return {
      code: 'invalid_data',
      message_fa: domainMessage ?? 'داده‌های ردیف با قید پایگاه داده ناسازگار بود؛ دسته برگشت خورد.',
      failure_category: 'validation',
      retryable: false,
      transaction_outcome: 'rolled_back',
      auto_retry: false,
    };
  }
  if (sqlState === '42501') {
    return {
      code: 'catalog_write_forbidden',
      message_fa: domainMessage ?? 'مجوز نوشتن کاتالوگ برای این عملیات معتبر نیست.',
      failure_category: 'permission',
      retryable: false,
      transaction_outcome: 'rolled_back',
      auto_retry: false,
    };
  }
  if (sqlState.startsWith('08')) {
    return {
      code: 'infrastructure_error',
      message_fa: 'اتصال پایگاه داده قطع شد؛ نتیجهٔ تراکنش نامشخص است و پخش خودکار مجاز نیست.',
      failure_category: 'infrastructure',
      retryable: false,
      transaction_outcome: 'unknown',
      auto_retry: false,
    };
  }
  if (domainCode === 'infrastructure_error' || domainCode === 'import_failed') {
    return {
      code: domainCode,
      message_fa: domainMessage ?? 'نتیجهٔ تراکنش نامشخص است؛ نیاز به بررسی اپراتور دارد.',
      failure_category: 'infrastructure',
      retryable: false,
      transaction_outcome: 'unknown',
      auto_retry: false,
    };
  }
  if (domainCode) {
    const classified = classifyDomainCode(domainCode);
    return {
      code: domainCode,
      message_fa: domainMessage ?? 'خطای قواعد کسب و کار؛ هیچ ردیفی از این دسته ذخیره نشد.',
      failure_category: classified.failure_category,
      retryable: classified.retryable,
      transaction_outcome: domainCode === 'import_in_progress' ? 'not_started' : 'rolled_back',
      auto_retry: false,
    };
  }
  return {
    code: 'batch_failed',
    message_fa: 'خطای سرویس یا پایگاه داده؛ نتیجهٔ تراکنش نامشخص است و نیاز به بررسی اپراتور دارد.',
    failure_category: 'infrastructure',
    retryable: false,
    transaction_outcome: 'unknown',
    auto_retry: false,
  };
}

/** Normalize persisted/legacy report entries without inventing business meaning. */
export function normalizeImportIssue(raw: unknown, importId?: string): ImportIssue | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const row = Number(source.row);
  if (!Number.isFinite(row) || row < 1) return null;
  const code = typeof source.code === 'string' && source.code.trim()
    ? source.code
    : 'batch_failed';
  const message = typeof source.message_fa === 'string' && source.message_fa.trim()
    ? source.message_fa
    : 'خطای ثبت‌شده‌ای برای این ردیف وجود دارد.';
  const classified = classifyDomainCode(code);
  const rawStatus = typeof source.status === 'string' ? source.status : undefined;
  const status: ImportRowStatus =
    rawStatus === 'created' || rawStatus === 'updated' || rawStatus === 'failed'
      || rawStatus === 'rejected' || rawStatus === 'rolled_back'
      ? rawStatus
      : code === 'created' || code === 'updated'
        ? code
        : 'failed';
  const category = FAILURE_CATEGORIES.has(source.failure_category as ImportFailureCategory)
    ? source.failure_category as ImportFailureCategory
    : classified.failure_category;
  const outcome = TRANSACTION_OUTCOMES.has(source.transaction_outcome as ImportTransactionOutcome)
    ? source.transaction_outcome as ImportTransactionOutcome
    : status === 'created' || status === 'updated'
      ? 'committed'
      : status === 'rejected'
        ? 'not_started'
        : 'rolled_back';
  return {
    row,
    code,
    message_fa: message,
    ...(Number.isFinite(Number(source.batch_no)) && Number(source.batch_no) > 0
      ? { batch_no: Number(source.batch_no) } : {}),
    ...(importId ? { import_id: importId } : {}),
    ...(typeof source.product_code === 'string' && source.product_code
      ? { product_code: source.product_code } : {}),
    ...(typeof source.product_id === 'string' && source.product_id
      ? { product_id: source.product_id } : {}),
    status,
    failure_category: category,
    retryable: typeof source.retryable === 'boolean' ? source.retryable : classified.retryable,
    transaction_outcome: outcome,
  };
}

export function normalizeImportReport(raw: unknown, importId?: string): ImportIssue[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => normalizeImportIssue(entry, importId))
    .filter((issue): issue is ImportIssue => issue !== null);
}

export function normalizeBatchOutcome(raw: unknown, importId?: string): ImportBatchOutcome | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = raw as Record<string, unknown>;
  const batchNo = Number(source.batch_no);
  if (!Number.isFinite(batchNo) || batchNo < 1) return null;
  const status = BATCH_STATUSES.has(source.status as ImportBatchStatus)
    ? source.status as ImportBatchStatus
    : 'failed';
  const transactionOutcome = TRANSACTION_OUTCOMES.has(source.transaction_outcome as ImportTransactionOutcome)
    ? source.transaction_outcome as ImportTransactionOutcome
    : status === 'committed' ? 'committed' : 'unknown';
  const reasonCode = typeof source.reason_code === 'string' ? source.reason_code : undefined;
  const category = FAILURE_CATEGORIES.has(source.failure_category as ImportFailureCategory)
    ? source.failure_category as ImportFailureCategory
    : reasonCode ? classifyDomainCode(reasonCode).failure_category : 'infrastructure';
  const report = normalizeImportReport(source.report, importId);
  const number = (key: string): number => {
    const value = Number(source[key]);
    return Number.isFinite(value) ? value : 0;
  };
  return {
    batch_no: batchNo,
    status,
    transaction_outcome: transactionOutcome,
    failure_category: category,
    retryable: typeof source.retryable === 'boolean'
      ? source.retryable
      : category === 'concurrency' || category === 'infrastructure',
    ...(reasonCode ? { reason_code: reasonCode } : {}),
    ...(typeof source.message_fa === 'string' && source.message_fa
      ? { message_fa: source.message_fa } : {}),
    total_rows: number('total_rows'),
    created_rows: number('created_rows'),
    updated_rows: number('updated_rows'),
    failed_rows: number('failed_rows'),
    attempts: Math.max(1, number('attempts')),
    report,
  };
}

export interface ImportSummary {
  created_rows: number;
  updated_rows: number;
  failed_rows: number;
  transaction_outcome: ImportAggregateOutcome;
  failure_category: ImportFailureCategory;
  retryable: boolean;
  last_batch_no: number;
}

/** Aggregate persisted batch outcomes; never treats a failed transaction as success. */
export function summarizeImportBatches(batches: ImportBatchOutcome[]): ImportSummary {
  const committed = batches.filter((b) => b.status === 'committed' && b.failed_rows === 0);
  const failed = batches.filter((b) => b.status !== 'committed' || b.failed_rows > 0);
  const rolledBack = batches.filter((b) => b.transaction_outcome === 'rolled_back');
  const unknown = batches.some((b) => b.transaction_outcome === 'unknown');
  let transaction_outcome: ImportAggregateOutcome;
  if (unknown) transaction_outcome = 'unknown';
  else if (committed.length > 0 && failed.length > 0) transaction_outcome = 'partial';
  else if (committed.length > 0) transaction_outcome = 'committed';
  else if (rolledBack.length > 0) transaction_outcome = 'rolled_back';
  else transaction_outcome = 'not_started';

  let failure_category: ImportFailureCategory = 'none';
  for (const batch of failed) {
    if (CATEGORY_SEVERITY[batch.failure_category] > CATEGORY_SEVERITY[failure_category]) {
      failure_category = batch.failure_category;
    }
  }
  if (failure_category === 'none' && failed.some((b) => b.failed_rows > 0)) {
    failure_category = 'validation';
  }
  const sum = (key: 'created_rows' | 'updated_rows' | 'failed_rows'): number =>
    batches.reduce((total, batch) => total + batch[key], 0);
  return {
    created_rows: sum('created_rows'),
    updated_rows: sum('updated_rows'),
    failed_rows: sum('failed_rows'),
    transaction_outcome,
    failure_category,
    retryable: failed.some((batch) =>
      batch.retryable && batch.transaction_outcome === 'rolled_back' && batch.status !== 'failed'),
    last_batch_no: batches.reduce((max, batch) => Math.max(max, batch.batch_no), 0),
  };
}

/** Build the public/report response from persisted state, including legacy rows. */
export function buildImportResult(
  record: ImportRecord,
  rawBatches: unknown,
  idempotentReplay: boolean,
): ImportResult {
  const batches = Array.isArray(rawBatches)
    ? rawBatches
      .map((batch) => normalizeBatchOutcome(batch, record.id))
      .filter((batch): batch is ImportBatchOutcome => batch !== null)
      .sort((a, b) => a.batch_no - b.batch_no)
    : [];
  const report = normalizeImportReport(record.report, record.id);
  const errors = report.filter((issue) => issue.status !== 'created' && issue.status !== 'updated');
  const summary = summarizeImportBatches(batches);
  const legacy = (record.last_batch_no ?? 0) === 0 && batches.length === 0;
  const transactionOutcome = legacy
    ? (record.failed_rows > 0 ? 'partial' : 'committed')
    : AGGREGATE_OUTCOMES.has(record.transaction_outcome as ImportAggregateOutcome)
      ? record.transaction_outcome as ImportAggregateOutcome
      : summary.transaction_outcome;
  const failureCategory = legacy
    ? (record.failed_rows > 0 ? 'business' : 'none')
    : record.failure_category ?? summary.failure_category;
  return {
    import_id: record.id,
    total_rows: Number(record.total_rows) || 0,
    created_rows: Number(record.created_rows) || 0,
    updated_rows: Number(record.updated_rows) || 0,
    failed_rows: Number(record.failed_rows) || 0,
    errors,
    idempotent_replay: idempotentReplay,
    status: record.status === 'processing' || record.status === 'failed' ? record.status : 'completed',
    transaction_outcome: transactionOutcome,
    failure_category: failureCategory,
    retryable: legacy ? false : record.retryable ?? summary.retryable,
    batches,
    report,
  };
}
