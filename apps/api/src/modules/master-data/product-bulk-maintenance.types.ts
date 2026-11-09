import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { QueryResultRow } from 'pg';
import { BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';

/**
 * TASK-PM-01D-M4 — field policy, bounded values and deterministic preview
 * helpers for controlled central Product Master bulk maintenance.
 *
 * This file is DB-free. Ownership evidence for the selected fields is recorded
 * in TASK-PM-01D-M4_IMPLEMENTATION.md; protected fields are rejected here and
 * again in the service before any write transaction is opened.
 */
export const BULK_MAX_PRODUCTS = 100;
export const BULK_MAX_FIELDS = 9;
export const BULK_PREVIEW_TTL_MS = 10 * 60 * 1000;
export const BULK_STATEMENT_TIMEOUT_MS = 15_000;
export const BULK_LOCK_TIMEOUT_MS = 5_000;

export type BulkFieldKey =
  | 'name'
  | 'name_latin'
  | 'brand_id'
  | 'min_order_qty'
  | 'weight_gr'
  | 'volume_cm3'
  | 'distribution_kind'
  | 'is_returnable_container'
  | 'requires_permit';

export type BulkFieldKind =
  | 'text'
  | 'nullable_text'
  | 'uuid'
  | 'number'
  | 'nullable_integer'
  | 'enum'
  | 'boolean';

export interface BulkFieldDefinition {
  key: BulkFieldKey;
  label_fa: string;
  kind: BulkFieldKind;
  nullable: boolean;
  max_length?: number;
  enum_values?: string[];
}

/** Only `product` columns with clear central-catalog ownership and no D4/Domain semantics. */
export const BULK_FIELD_DEFINITIONS: readonly BulkFieldDefinition[] = [
  { key: 'name', label_fa: 'نام کالا', kind: 'text', nullable: false, max_length: 255 },
  { key: 'name_latin', label_fa: 'نام لاتین', kind: 'nullable_text', nullable: true, max_length: 255 },
  { key: 'brand_id', label_fa: 'برند', kind: 'uuid', nullable: true },
  { key: 'min_order_qty', label_fa: 'حداقل مقدار سفارش', kind: 'number', nullable: false },
  { key: 'weight_gr', label_fa: 'وزن (گرم)', kind: 'nullable_integer', nullable: true },
  { key: 'volume_cm3', label_fa: 'حجم (سانتیمتر مکعب)', kind: 'nullable_integer', nullable: true },
  {
    key: 'distribution_kind',
    label_fa: 'شرایط توزیع فیزیکی',
    kind: 'enum',
    nullable: false,
    enum_values: ['cold', 'warm', 'both'],
  },
  { key: 'is_returnable_container', label_fa: 'ظرف بازگشتی', kind: 'boolean', nullable: false },
  { key: 'requires_permit', label_fa: 'نیازمند مجوز', kind: 'boolean', nullable: false },
];

export const BULK_FIELD_KEYS = new Set<string>(BULK_FIELD_DEFINITIONS.map((f) => f.key));
export const BULK_FIELD_BY_KEY = new Map<string, BulkFieldDefinition>(
  BULK_FIELD_DEFINITIONS.map((f) => [f.key, f]),
);

/** Explicitly excluded: identity, D4, variant immutability, domain/inventory/pricing, server columns. */
export const PROTECTED_BULK_FIELDS = new Set<string>([
  'id', 'company_id', 'code', 'status', 'tax_code_id', 'base_uom_id', 'family_id',
  'factor_to_base', 'bundle_components', 'category_id', 'is_batch_tracked',
  'is_expiry_tracked', 'shelf_life_days', 'variant_signature', 'row_version',
  'created_at', 'updated_at', 'deleted_at', 'barcode', 'alias', 'attributes',
  'domain', 'domain_id', 'availability', 'inventory', 'stock', 'price', 'warehouse',
  'branch', 'fleet', 'approval', 'authority',
]);

export type BulkChanges = Partial<Record<BulkFieldKey, string | number | boolean | null>>;

export interface BulkProductSnapshot extends QueryResultRow {
  id: string;
  code: string;
  name: string;
  name_latin: string | null;
  brand_id: string | null;
  min_order_qty: number;
  weight_gr: number | null;
  volume_cm3: number | null;
  distribution_kind: string;
  is_returnable_container: boolean;
  requires_permit: boolean;
  status: string;
  tax_code_id: string | null;
  base_uom_id: string;
  row_version: number;
}

export interface BulkDiff {
  field: BulkFieldKey;
  label_fa: string;
  before: unknown;
  after: unknown;
  before_label: string;
  after_label: string;
  changed: boolean;
}

export type BulkPreviewItemStatus = 'eligible' | 'rejected';

export interface BulkPreviewItem {
  product_id: string;
  code: string;
  name: string;
  row_version: number;
  status: BulkPreviewItemStatus;
  reason_code?: string | null;
  message_fa?: string | null;
  changes: BulkDiff[];
}

export interface BulkMaintenanceFieldsResponse {
  supported_fields: readonly BulkFieldDefinition[];
}

export interface BulkPreviewPayload {
  operation_id: string;
  preview_token: string;
  expires_at: string;
  status: 'preview_created';
  eligible_count: number;
  rejected_count: number;
  supported_fields: readonly BulkFieldDefinition[];
  items: BulkPreviewItem[];
}

export interface BulkLifecycleEvent {
  state:
    | 'preview_created'
    | 'preview_stale'
    | 'preview_expired'
    | 'accepted'
    | 'committed'
    | 'rejected'
    | 'unknown';
  at: string;
}

export interface BulkOperationItem {
  product_id: string;
  code: string;
  name: string;
  status: 'updated' | 'rejected';
  row_version_before?: number;
  row_version_after?: number;
  message_fa?: string | null;
  product_url: string;
}

export interface BulkOperationResult {
  operation_id: string;
  status:
    | 'preview_created'
    | 'preview_stale'
    | 'preview_expired'
    | 'accepted'
    | 'committed'
    | 'rejected'
    | 'unknown';
  outcome: 'not_started' | 'committed' | 'rolled_back' | 'unknown';
  lifecycle: BulkLifecycleEvent[];
  eligible_count: number;
  updated_count: number;
  rejected_count: number;
  failure_category: string;
  reason_code?: string | null;
  message_fa?: string | null;
  accepted_at?: string | null;
  committed_at?: string | null;
  expires_at?: string | null;
  idempotent_replay?: boolean;
  reconciled?: boolean;
  retryable?: boolean;
  reconciliation_hint_fa?: string | null;
  items: BulkOperationItem[];
}

export interface BulkPreviewRecord {
  items: BulkPreviewItem[];
  expected_versions: Record<string, number>;
  eligible_count: number;
  rejected_count: number;
}

export class BulkMaintenanceInputError extends BadRequestException {
  readonly code: string;
  readonly message_fa: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message_fa: string, details?: Record<string, unknown>) {
    super({ code, message_fa, message: message_fa, details });
    this.code = code;
    this.message_fa = message_fa;
    this.details = details;
    this.name = 'BulkMaintenanceInputError';
  }
}

/** Internal marker: commit outcome cannot be proved; never rerun blindly. */
export class BulkMaintenanceUnknownError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'BulkMaintenanceUnknownError';
  }
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Stable JSON with sorted object keys, used for request/preview hashes. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export const sha256 = (value: string): string =>
  createHash('sha256').update(value, 'utf8').digest('hex');

export const newBulkOperationId = (): string => randomUUID();
export const newBulkPreviewToken = (): string => randomBytes(32).toString('hex');

export function normalizeProductIds(raw: string[]): string[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > BULK_MAX_PRODUCTS) {
    throw new BulkMaintenanceInputError(
      'invalid_selection_size',
      `تعداد کالاهای انتخابشده باید بین ۱ و ${BULK_MAX_PRODUCTS} باشد.`,
    );
  }
  const invalid = raw.find((id) => typeof id !== 'string' || !isUUID(id, '4'));
  if (invalid !== undefined) {
    throw new BulkMaintenanceInputError('invalid_product_id', 'یکی از شناسههای کالا معتبر نیست.');
  }
  const unique = [...new Set(raw)];
  if (unique.length !== raw.length) {
    throw new BulkMaintenanceInputError('duplicate_product_ids', 'شناسههای کالا تکراری هستند.');
  }
  return unique.sort();
}

/** Validate the dynamic change object against the server-owned field whitelist. */
export function normalizeBulkChanges(raw: unknown): BulkChanges {
  if (!isPlainObject(raw)) {
    throw new BulkMaintenanceInputError('invalid_changes', 'فیلدهای تغییر باید یک شیء معتبر باشند.');
  }
  const keys = Object.keys(raw);
  if (keys.length < 1 || keys.length > BULK_MAX_FIELDS) {
    throw new BulkMaintenanceInputError(
      'invalid_changes_size',
      `حداقل یک و حداکثر ${BULK_MAX_FIELDS} فیلد قابل تغییر است.`,
    );
  }
  const out: BulkChanges = {};
  for (const key of keys) {
    if (PROTECTED_BULK_FIELDS.has(key) || ['__proto__', 'constructor', 'prototype'].includes(key)) {
      throw new BulkMaintenanceInputError(
        'protected_field',
        `فیلد «${key}» محافظتشده است و در نگهداشت گروهی مجاز نیست.`,
        { field: key },
      );
    }
    const def = BULK_FIELD_BY_KEY.get(key);
    if (!def) {
      throw new BulkMaintenanceInputError(
        'unsupported_field',
        `فیلد «${key}» در نگهداشت گروهی پشتیبانی نمیشود.`,
        { field: key },
      );
    }
    const rawValue = raw[key];
    switch (def.kind) {
      case 'text': {
        if (typeof rawValue !== 'string' || rawValue.trim().length < 1 || rawValue.length > (def.max_length ?? 255)) {
          throw new BulkMaintenanceInputError('invalid_value', `مقدار «${def.label_fa}» معتبر نیست.`, { field: key });
        }
        out[key as BulkFieldKey] = rawValue.trim();
        break;
      }
      case 'nullable_text': {
        if (rawValue == null || rawValue === '') {
          out[key as BulkFieldKey] = null;
        } else if (typeof rawValue === 'string' && rawValue.length <= (def.max_length ?? 255)) {
          out[key as BulkFieldKey] = rawValue.trim() || null;
        } else {
          throw new BulkMaintenanceInputError('invalid_value', `مقدار «${def.label_fa}» معتبر نیست.`, { field: key });
        }
        break;
      }
      case 'uuid': {
        if (rawValue == null || rawValue === '') {
          out[key as BulkFieldKey] = null;
        } else if (typeof rawValue === 'string' && isUUID(rawValue, '4')) {
          out[key as BulkFieldKey] = rawValue;
        } else {
          throw new BulkMaintenanceInputError('invalid_value', `مقدار «${def.label_fa}» معتبر نیست.`, { field: key });
        }
        break;
      }
      case 'number': {
        if (typeof rawValue !== 'number' || !Number.isFinite(rawValue) || rawValue < 0 || rawValue > 1_000_000_000) {
          throw new BulkMaintenanceInputError('invalid_value', `مقدار «${def.label_fa}» باید عددی نامنفی و معقول باشد.`, { field: key });
        }
        out[key as BulkFieldKey] = rawValue;
        break;
      }
      case 'nullable_integer': {
        if (rawValue == null || rawValue === '') {
          out[key as BulkFieldKey] = null;
        } else if (typeof rawValue === 'number' && Number.isInteger(rawValue) && rawValue >= 0 && rawValue <= 2_000_000_000) {
          out[key as BulkFieldKey] = rawValue;
        } else {
          throw new BulkMaintenanceInputError('invalid_value', `مقدار «${def.label_fa}» باید عدد صحیح نامنفی باشد.`, { field: key });
        }
        break;
      }
      case 'enum': {
        if (typeof rawValue !== 'string' || !(def.enum_values ?? []).includes(rawValue)) {
          throw new BulkMaintenanceInputError('invalid_value', `مقدار «${def.label_fa}» خارج از گزینههای مجاز است.`, { field: key });
        }
        out[key as BulkFieldKey] = rawValue;
        break;
      }
      case 'boolean': {
        if (typeof rawValue !== 'boolean') {
          throw new BulkMaintenanceInputError('invalid_value', `مقدار «${def.label_fa}» باید بله/خیر باشد.`, { field: key });
        }
        out[key as BulkFieldKey] = rawValue;
        break;
      }
    }
  }
  return out;
}

const DIST_LABEL_FA: Record<string, string> = { cold: 'سرد', warm: 'گرم', both: 'سرد و گرم' };

export function bulkValueLabel(field: BulkFieldKey, value: unknown, brandNames?: Map<string, string>): string {
  if (value == null || value === '') return '—';
  if (field === 'distribution_kind') return DIST_LABEL_FA[String(value)] ?? String(value);
  if (field === 'brand_id') return brandNames?.get(String(value)) ?? String(value);
  if (typeof value === 'boolean') return value ? 'بله' : 'خیر';
  return String(value);
}

const valuesEqual = (a: unknown, b: unknown): boolean => canonicalJson(a) === canonicalJson(b);

export function buildBulkDiffs(
  row: BulkProductSnapshot,
  changes: BulkChanges,
  brandNames?: Map<string, string>,
): BulkDiff[] {
  return BULK_FIELD_DEFINITIONS.filter((def) => Object.prototype.hasOwnProperty.call(changes, def.key)).map(
    (def) => {
      const before = row[def.key];
      const after = changes[def.key];
      return {
        field: def.key,
        label_fa: def.label_fa,
        before,
        after,
        before_label: bulkValueLabel(def.key, before, brandNames),
        after_label: bulkValueLabel(def.key, after, brandNames),
        changed: !valuesEqual(before, after),
      };
    },
  );
}

export function buildBulkPreviewRecord(
  productIds: readonly string[],
  rows: readonly BulkProductSnapshot[],
  changes: BulkChanges,
  brandNames?: Map<string, string>,
): BulkPreviewRecord {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const expectedVersions: Record<string, number> = {};
  const items: BulkPreviewItem[] = productIds.map((id) => {
    const row = byId.get(id);
    if (!row) {
      return {
        product_id: id,
        code: '—',
        name: '—',
        row_version: -1,
        status: 'rejected',
        reason_code: 'not_found',
        message_fa: 'کالا یافت نشد یا به شرکت دیگری تعلق دارد.',
        changes: [],
      };
    }
    expectedVersions[id] = row.row_version;
    const diffs = buildBulkDiffs(row, changes, brandNames);
    const changed = diffs.some((d) => d.changed);
    return {
      product_id: id,
      code: row.code,
      name: row.name,
      row_version: row.row_version,
      status: changed ? 'eligible' : 'rejected',
      reason_code: changed ? null : 'no_change',
      message_fa: changed ? null : 'مقادیر پیشنهادی با مقادیر فعلی یکساناند؛ تغییری اعمال نمیشود.',
      changes: diffs,
    };
  });
  return {
    items,
    expected_versions: Object.fromEntries(Object.entries(expectedVersions).sort(([a], [b]) => a.localeCompare(b))),
    eligible_count: items.filter((i) => i.status === 'eligible').length,
    rejected_count: items.filter((i) => i.status === 'rejected').length,
  };
}

export const hashBulkRequest = (productIds: readonly string[], changes: BulkChanges): string =>
  sha256(canonicalJson({ product_ids: [...productIds].sort(), changes }));

export const hashBulkPreview = (record: BulkPreviewRecord, changes: BulkChanges): string =>
  sha256(canonicalJson({ preview: record.items, expected_versions: record.expected_versions, changes }));

export const hashBulkPreviewToken = (token: string): string => sha256(token);

export const previewExpiryIso = (now: Date = new Date()): string =>
  new Date(now.getTime() + BULK_PREVIEW_TTL_MS).toISOString();
