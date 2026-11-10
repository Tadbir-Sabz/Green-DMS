import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { type Runner, runner } from '../../common/transaction';
import type {
  BulkChanges,
  BulkOperationResult,
  BulkPreviewRecord,
} from './product-bulk-maintenance.types';

export interface BulkOperationRow extends QueryResultRow {
  id: string;
  company_id: string;
  actor_user_id: string | null;
  status: 'preview_created' | 'accepted' | 'committed' | 'rejected' | 'unknown';
  outcome: 'not_started' | 'committed' | 'rolled_back' | 'unknown';
  failure_category: string;
  reason_code: string | null;
  message_fa: string | null;
  request_hash: string;
  preview_token_hash: string;
  preview_hash: string;
  product_ids: string[];
  changes: BulkChanges;
  expected_versions: Record<string, number>;
  preview: BulkPreviewRecord;
  result: Record<string, unknown> | null;
  eligible_count: number;
  rejected_count: number;
  updated_count: number;
  attempts: number;
  expires_at: Date | string;
  accepted_at: Date | string | null;
  committed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface InsertPreviewInput {
  operationId: string;
  companyId: string;
  actorUserId: string;
  requestHash: string;
  previewTokenHash: string;
  previewHash: string;
  productIds: readonly string[];
  changes: BulkChanges;
  preview: BulkPreviewRecord;
  expiresAt: string;
}

export interface RejectInput {
  outcome: 'not_started' | 'rolled_back' | 'unknown';
  failureCategory: string;
  reasonCode: string;
  messageFa: string;
  result?: BulkOperationResult;
}

export interface AuditEvidenceStats {
  total: number;
  valid: number;
  invalid: number;
}

export interface BoundEvidenceStats {
  history_rows: number;
  history_distinct_products: number;
  history_invalid: number;
  history_unexpected_products: number;
  evidence_rows: number;
  evidence_distinct_products: number;
  evidence_distinct_history: number;
  evidence_invalid: number;
  evidence_unexpected_products: number;
  evidence_mismatch: number;
  cross_operation_evidence: number;
}

/** Durable, tenant-RLS ledger for M4 previews, acceptance, commits and reconciliation. */
@Injectable()
export class ProductBulkMaintenanceRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async insertPreview(input: InsertPreviewInput, client?: Runner): Promise<BulkOperationRow> {
    const { rows } = await runner(this.pool, client).query<BulkOperationRow>(
      `insert into product_bulk_operation
        (id, company_id, actor_user_id, status, outcome, failure_category,
         request_hash, preview_token_hash, preview_hash, product_ids, changes,
         expected_versions, preview, eligible_count, rejected_count, updated_count,
         attempts, expires_at)
       values ($1,$2,$3,'preview_created','not_started','none',
               $4,$5,$6,$7::uuid[],$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,0,0,$13)
       returning *`,
      [
        input.operationId,
        input.companyId,
        input.actorUserId,
        input.requestHash,
        input.previewTokenHash,
        input.previewHash,
        [...input.productIds],
        JSON.stringify(input.changes),
        JSON.stringify(input.preview.expected_versions),
        JSON.stringify(input.preview),
        input.preview.eligible_count,
        input.preview.rejected_count,
        input.expiresAt,
      ],
    );
    return rows[0];
  }

  async findForUpdate(
    companyId: string,
    operationId: string,
    actorUserId: string,
    client?: Runner,
  ): Promise<BulkOperationRow | null> {
    const { rows } = await runner(this.pool, client).query<BulkOperationRow>(
      `select * from product_bulk_operation
        where company_id = $1 and id = $2 and actor_user_id = $3
        for update`,
      [companyId, operationId, actorUserId],
    );
    return rows[0] ?? null;
  }

  async findStatus(
    companyId: string,
    operationId: string,
    actorUserId: string,
    client?: Runner,
  ): Promise<BulkOperationRow | null> {
    const { rows } = await runner(this.pool, client).query<BulkOperationRow>(
      `select * from product_bulk_operation
        where company_id = $1 and id = $2 and actor_user_id = $3`,
      [companyId, operationId, actorUserId],
    );
    return rows[0] ?? null;
  }

  async markAccepted(
    companyId: string,
    operationId: string,
    actorUserId: string,
    client?: Runner,
  ): Promise<BulkOperationRow | null> {
    const { rows } = await runner(this.pool, client).query<BulkOperationRow>(
      `update product_bulk_operation
        set status = 'accepted', outcome = 'not_started', failure_category = 'none',
            reason_code = null, message_fa = null,
            accepted_at = coalesce(accepted_at, now()), attempts = attempts + 1,
            updated_at = now()
        where company_id = $1 and id = $2 and actor_user_id = $3
          and status in ('preview_created','accepted')
        returning *`,
      [companyId, operationId, actorUserId],
    );
    return rows[0] ?? null;
  }

  async markCommitted(
    companyId: string,
    operationId: string,
    actorUserId: string,
    updatedCount: number,
    result: BulkOperationResult,
    client?: Runner,
  ): Promise<BulkOperationRow | null> {
    const { rows } = await runner(this.pool, client).query<BulkOperationRow>(
      `update product_bulk_operation
        set status = 'committed', outcome = 'committed',
            committed_at = now(), updated_count = $4, result = $5::jsonb,
            failure_category = 'none', reason_code = null, message_fa = null,
            updated_at = now()
        where company_id = $1 and id = $2 and actor_user_id = $3
          and status = 'accepted'
        returning *`,
      [companyId, operationId, actorUserId, updatedCount, JSON.stringify(result)],
    );
    return rows[0] ?? null;
  }

  async markRejected(
    companyId: string,
    operationId: string,
    actorUserId: string,
    input: RejectInput,
    client?: Runner,
  ): Promise<BulkOperationRow | null> {
    const { rows } = await runner(this.pool, client).query<BulkOperationRow>(
      `update product_bulk_operation
        set status = 'rejected', outcome = $4, failure_category = $5,
            reason_code = $6, message_fa = $7, result = $8::jsonb,
            updated_at = now()
        where company_id = $1 and id = $2 and actor_user_id = $3
          and status in ('preview_created','accepted')
        returning *`,
      [
        companyId,
        operationId,
        actorUserId,
        input.outcome,
        input.failureCategory,
        input.reasonCode,
        input.messageFa,
        input.result ? JSON.stringify(input.result) : null,
      ],
    );
    return rows[0] ?? null;
  }

  async markUnknown(
    companyId: string,
    operationId: string,
    actorUserId: string,
    messageFa: string,
    client?: Runner,
  ): Promise<BulkOperationRow | null> {
    const { rows } = await runner(this.pool, client).query<BulkOperationRow>(
      `update product_bulk_operation
        set status = 'unknown', outcome = 'unknown', failure_category = 'unknown',
            reason_code = 'commit_outcome_unknown', message_fa = $4,
            updated_at = now()
        where company_id = $1 and id = $2 and actor_user_id = $3
          and status in ('preview_created','accepted','unknown')
        returning *`,
      [companyId, operationId, actorUserId, messageFa],
    );
    return rows[0] ?? null;
  }

  async markReconciledCommitted(
    companyId: string,
    operationId: string,
    actorUserId: string,
    result: BulkOperationResult,
    client?: Runner,
  ): Promise<BulkOperationRow | null> {
    const { rows } = await runner(this.pool, client).query<BulkOperationRow>(
      `update product_bulk_operation
        set status = 'committed', outcome = 'committed',
            committed_at = coalesce(committed_at, now()), result = $4::jsonb,
            failure_category = 'none', reason_code = null,
            message_fa = 'نتیجه با شواهد ممیزی و تاریخچهای تطبیق داده شد.',
            updated_at = now()
        where company_id = $1 and id = $2 and actor_user_id = $3
          and status in ('accepted','unknown')
        returning *`,
      [companyId, operationId, actorUserId, JSON.stringify(result)],
    );
    return rows[0] ?? null;
  }

  async markReconciledRejected(
    companyId: string,
    operationId: string,
    actorUserId: string,
    result: BulkOperationResult,
    client?: Runner,
  ): Promise<BulkOperationRow | null> {
    const { rows } = await runner(this.pool, client).query<BulkOperationRow>(
      `update product_bulk_operation
        set status = 'rejected', outcome = 'rolled_back', result = $4::jsonb,
            failure_category = 'infrastructure', reason_code = 'transaction_rolled_back',
            message_fa = 'هیچ تغییری ثبت نشد؛ تراکنش با شواهد بررسی و رد شد.',
            updated_at = now()
        where company_id = $1 and id = $2 and actor_user_id = $3
          and status in ('accepted','unknown')
        returning *`,
      [companyId, operationId, actorUserId, JSON.stringify(result)],
    );
    return rows[0] ?? null;
  }

  /**
   * TASK-PM-01D-M4-F: ممیزی الزامی فقط با ستون سرور-کنترلشدهٔ
   * audit_log.bulk_operation_id سنجیده میشود. request_id کلاینت، مقادیر
   * after_data، بازیگر لحظهٔ خواندن و شمارهٔ نسخهها هرگز مبنای مالکیت نیستند.
   */
  async auditEvidenceStats(
    companyId: string,
    operationId: string,
    actorUserId: string,
    since: string,
    client?: Runner,
  ): Promise<AuditEvidenceStats> {
    const { rows } = await runner(this.pool, client).query<AuditEvidenceStats>(
      `select count(*)::int as total,
              count(*) filter (where company_id = $1 and actor_user_id = $3)::int as valid,
              count(*) filter (where company_id is distinct from $1
                                 or actor_user_id is distinct from $3)::int as invalid
         from audit_log
        where bulk_operation_id = $2 and entity_type = 'product' and action = 'update'
          and at >= $4::timestamptz`,
      [companyId, operationId, actorUserId, since],
    );
    return rows[0] ?? { total: 0, valid: 0, invalid: 0 };
  }

  /**
   * تمام شواهد ۰۰۶۰/۰۰۶۳ِ دقیقاً همین عملیات: کامل، سازگار، بدون تکرار،
   * بدون محصول ناخواسته، بدون اتصال به عملیات/شرکت/بازیگر دیگر.
   */
  async boundEvidenceStats(
    companyId: string,
    operationId: string,
    actorUserId: string,
    productIds: readonly string[],
    since: string,
    client?: Runner,
  ): Promise<BoundEvidenceStats> {
    const { rows } = await runner(this.pool, client).query<BoundEvidenceStats>(
      `with bound_history as (
         select * from product_catalog_history where bulk_operation_id = $2
       ), bound_evidence as (
         select * from product_bulk_history_event where bulk_operation_id = $2
       ), cross_evidence as (
         select count(*)::int as n
           from product_bulk_history_event e
           join bound_history h on h.id = e.history_id
          where e.bulk_operation_id <> $2
       )
       select
         (select count(*)::int from bound_history) as history_rows,
         (select count(distinct product_id)::int from bound_history) as history_distinct_products,
         (select count(*) filter (
            where company_id is distinct from $1 or actor_user_id is distinct from $3
               or product_id is null or entity_type <> 'product' or action <> 'UPDATE'
               or at < $5::timestamptz)::int from bound_history) as history_invalid,
         (select count(*) filter (
            where product_id is null or not (product_id = any($4::uuid[])))::int
            from bound_history) as history_unexpected_products,
         (select count(*)::int from bound_evidence) as evidence_rows,
         (select count(distinct product_id)::int from bound_evidence) as evidence_distinct_products,
         (select count(distinct history_id)::int from bound_evidence) as evidence_distinct_history,
         (select count(*) filter (
            where company_id is distinct from $1 or actor_user_id is distinct from $3
               or product_id is null or created_at < $5::timestamptz)::int
            from bound_evidence) as evidence_invalid,
         (select count(*) filter (
            where product_id is null or not (product_id = any($4::uuid[])))::int
            from bound_evidence) as evidence_unexpected_products,
         (select count(*)::int from bound_evidence e
            join bound_history h on h.id = e.history_id
           where e.company_id is distinct from h.company_id
              or e.actor_user_id is distinct from h.actor_user_id
              or e.product_id is distinct from h.product_id
              or e.bulk_operation_id is distinct from h.bulk_operation_id) as evidence_mismatch,
         (select n from cross_evidence) as cross_operation_evidence`,
      [companyId, operationId, actorUserId, [...productIds], since],
    );
    return rows[0] ?? {
      history_rows: 0,
      history_distinct_products: 0,
      history_invalid: 0,
      history_unexpected_products: 0,
      evidence_rows: 0,
      evidence_distinct_products: 0,
      evidence_distinct_history: 0,
      evidence_invalid: 0,
      evidence_unexpected_products: 0,
      evidence_mismatch: 0,
      cross_operation_evidence: 0,
    };
  }

  async productVersions(
    companyId: string,
    productIds: readonly string[],
    client?: Runner,
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (productIds.length === 0) return map;
    const { rows } = await runner(this.pool, client).query<{ id: string; row_version: number }>(
      `select id, row_version::int as row_version from product
        where company_id = $1 and deleted_at is null and id = any($2::uuid[])`,
      [companyId, [...productIds]],
    );
    for (const r of rows) map.set(r.id, r.row_version);
    return map;
  }
}

/** Company- و operation-scoped transaction lock; مکمل قفل شرکتی CatalogAccess. */
export const lockBulkOperation = async (
  client: Runner,
  companyId: string,
  operationId: string,
): Promise<void> => {
  await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `product-bulk:${companyId}:${operationId}`,
  ]);
};

/**
 * زمینهٔ فقط-تراکنشی و سرور-کنترلشدهٔ همبستگی. هیچ هدر/payload کلاینتی به
 * app.bulk_operation_id راه ندارد؛ با COMMIT/ROLLBACK خودبهخود پاک میشود.
 */
export const setBulkOperationContext = async (
  client: Runner,
  operationId: string,
): Promise<void> => {
  await client.query("select set_config('app.bulk_operation_id', $1, true)", [operationId]);
};

export const setBulkLocalTimeouts = async (client: Runner): Promise<void> => {
  await client.query("set local statement_timeout = '15s'");
  await client.query("set local lock_timeout = '5s'");
};
