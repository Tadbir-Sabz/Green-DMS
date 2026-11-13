import { ForbiddenException, HttpException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Runner } from '../../common/transaction';
import { AuditService, AUDIT_SERVICE } from '../../common/audit.service';
import type { RequestMeta } from '../../common/request-meta';
import type { AuthContext } from '../identity-rbac/auth-context.decorator';
import { CatalogAccess, catalogTransaction } from './catalog-access.service';
import { ProductRepository } from './product.repository';
import { PRODUCT_REPOSITORY } from './tokens';
import type { UpdateProductDto } from './product.dto';
import {
  ProductBulkMaintenanceRepository,
  type BulkOperationRow,
  lockBulkOperation,
  setBulkOperationContext,
} from './product-bulk-maintenance.repository';
import {
  BULK_FIELD_BY_KEY,
  BULK_FIELD_DEFINITIONS,
  BULK_LOCK_TIMEOUT_MS,
  BULK_STATEMENT_TIMEOUT_MS,
  BulkMaintenanceInputError,
  BulkMaintenanceUnknownError,
  type BulkChanges,
  type BulkOperationItem,
  type BulkOperationResult,
  type BulkPreviewItem,
  type BulkPreviewPayload,
  type BulkPreviewRecord,
  type BulkProductSnapshot,
  buildBulkPreviewRecord,
  canonicalJson,
  hashBulkPreview,
  bulkPreviewTokensEqual,
  hashBulkPreviewToken,
  hashBulkRequest,
  newBulkOperationId,
  newBulkPreviewToken,
  normalizeBulkChanges,
  normalizeProductIds,
  previewExpiryIso,
} from './product-bulk-maintenance.types';
import type { BulkMaintenanceExecuteDto, BulkMaintenancePreviewDto } from './product-bulk-maintenance.dto';

const BULK_PERMISSION = 'master.product.update';

const iso = (value: Date | string | null | undefined): string | null =>
  value == null ? null : new Date(value).toISOString();

interface FailureClassification {
  kind: 'reject' | 'unknown';
  category: string;
  reasonCode: string;
  messageFa: string;
  outcome: 'not_started' | 'rolled_back' | 'unknown';
  errorCode: string;
}

interface TxOptions {
  isolation: 'repeatable read' | 'read committed';
}

/**
 * TASK-PM-01D-M4 — all-or-nothing central Product Master maintenance for a
 * bounded selection. Preview is read-only with respect to products; execution
 * is a single synchronous transaction with real row_version checks, a durable
 * operation ledger and no success claim before COMMIT is confirmed.
 *
 * Authorization uses the already-approved `master.product.update` permission
 * (CatalogAccess.assert, twice in write()). `master.product.view`/export does
 * not authorize these writes. No new RBAC vocabulary is introduced.
 */
@Injectable()
export class ProductBulkMaintenanceService {
  constructor(
    private readonly access: CatalogAccess,
    @Inject(PRODUCT_REPOSITORY) private readonly products: ProductRepository,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
    private readonly repo: ProductBulkMaintenanceRepository,
  ) {}

  /** CatalogAccess.write supplies tenant GUCs, company lock and RBAC assertions. */
  private async transaction<T>(
    user: AuthContext,
    options: TxOptions,
    work: (client: Runner) => Promise<T>,
  ): Promise<T> {
    return this.access.write(
      user.companyId,
      user.userId,
      BULK_PERMISSION,
      async () => {
        const client = catalogTransaction.getStore();
        if (!client) {
          throw new BulkMaintenanceUnknownError(
            'transaction_client_missing',
            'Bulk transaction client is unavailable.',
          );
        }
        return work(client);
      },
      {
        isolation: options.isolation,
        statementTimeoutMs: BULK_STATEMENT_TIMEOUT_MS,
        lockTimeoutMs: BULK_LOCK_TIMEOUT_MS,
      },
    );
  }

  private async validateBrandRefs(
    companyId: string,
    changes: BulkChanges,
    rows: readonly BulkProductSnapshot[],
    client: Runner,
  ): Promise<Map<string, string>> {
    const ids = new Set<string>();
    if (changes.brand_id != null) ids.add(String(changes.brand_id));
    for (const r of rows) if (r.brand_id != null) ids.add(r.brand_id);
    const names = await this.products.brandNames(companyId, [...ids], client);
    if (
      changes.brand_id != null &&
      !(await this.products.brandExists(companyId, String(changes.brand_id), client))
    ) {
      throw new BulkMaintenanceInputError(
        'invalid_reference',
        'برند انتخابشده یافت نشد یا به شرکت دیگری تعلق دارد.',
        { field: 'brand_id' },
      );
    }
    return names;
  }

  /** GET /fields — server-owned whitelist; no client-supplied field metadata. */
  async fields(user: AuthContext): Promise<{ supported_fields: typeof BULK_FIELD_DEFINITIONS }> {
    await this.access.assert(user.companyId, user.userId, BULK_PERMISSION);
    return { supported_fields: BULK_FIELD_DEFINITIONS };
  }

  /**
   * POST /preview — محصول، ممیزی و تاریخچهٔ ۰۰۶۰ تغییر نمیکنند؛ تنها یک ردیف
   * دفتر عملیات پایدار (ledger) در همان تراکنش درج میشود. بنابراین «پیشنمایش»
   * از نظر محصول فقطخواندنی است، نه یک GET خالص بدون اثر جانبی (TASK-PM-01D-M4-F).
   */
  async preview(dto: BulkMaintenancePreviewDto, user: AuthContext): Promise<BulkPreviewPayload> {
    const productIds = normalizeProductIds(dto.product_ids);
    const changes = normalizeBulkChanges(dto.changes);
    const operationId = newBulkOperationId();
    const previewToken = newBulkPreviewToken();
    const expiresAt = previewExpiryIso();

    return this.transaction(user, { isolation: 'repeatable read' }, async (client) => {
      const rows = await this.products.findByIdsForBulk(user.companyId, productIds, client);
      const brandNames = await this.validateBrandRefs(user.companyId, changes, rows, client);
      const record = buildBulkPreviewRecord(productIds, rows, changes, brandNames);
      await this.repo.insertPreview(
        {
          operationId,
          companyId: user.companyId,
          actorUserId: user.userId,
          requestHash: hashBulkRequest(productIds, changes),
          previewTokenHash: hashBulkPreviewToken(previewToken),
          previewHash: hashBulkPreview(record, changes),
          productIds,
          changes,
          preview: record,
          expiresAt,
        },
        client,
      );
      return {
        operation_id: operationId,
        preview_token: previewToken,
        expires_at: expiresAt,
        status: 'preview_created' as const,
        eligible_count: record.eligible_count,
        rejected_count: record.rejected_count,
        supported_fields: BULK_FIELD_DEFINITIONS,
        items: record.items,
      };
    });
  }

  /**
   * GET /operations/:id — واقعاً فقطخواندنی (TASK-PM-01D-M4-F). تطبیق شواهد و
   * هرگونه گذار وضعیت فقط از اکشن صریح POST /operations/:id/reconcile انجام میشود.
   */
  async operationStatus(operationId: string, user: AuthContext): Promise<BulkOperationResult> {
    return this.transaction(user, { isolation: 'repeatable read' }, async (client) => {
      const row = await this.repo.findStatus(user.companyId, operationId, user.userId, client);
      if (!row) {
        throw new NotFoundException({ code: 'operation_not_found', message_fa: 'عملیات یافت نشد.' });
      }
      if (row.status === 'preview_created') {
        return this.previewStateResult(row, client, false);
      }
      return this.resultFromRow(row, false, client);
    });
  }

  /** POST /operations/:id/reconcile — اکشن صریح تطبیق شواهد operation-bound. */
  async reconcileOperation(operationId: string, user: AuthContext): Promise<BulkOperationResult> {
    return this.transaction(user, { isolation: 'repeatable read' }, async (client) => {
      const row = await this.repo.findStatus(user.companyId, operationId, user.userId, client);
      if (!row) {
        throw new NotFoundException({ code: 'operation_not_found', message_fa: 'عملیات یافت نشد.' });
      }
      if (row.status === 'unknown' || row.status === 'accepted') {
        return this.reconcile(row, client, false);
      }
      if (row.status === 'preview_created') {
        return this.previewStateResult(row, client, false);
      }
      return this.resultFromRow(row, false, client);
    });
  }

  /** POST /execute — stable identity, token, explicit confirmation, single commit. */
  async execute(
    dto: BulkMaintenanceExecuteDto,
    user: AuthContext,
    meta: RequestMeta,
  ): Promise<BulkOperationResult> {
    if (!isUUID(dto.operation_id, '4')) {
      throw new BulkMaintenanceInputError('invalid_operation_id', 'شناسهٔ عملیات معتبر نیست.');
    }
    if (dto.confirm !== true) {
      throw new BulkMaintenanceInputError('confirmation_required', 'تأیید صریح پیش از اجرا لازم است.');
    }
    if (!/^[a-f0-9]{64}$/.test(dto.preview_token)) {
      throw new BulkMaintenanceInputError('invalid_preview_token', 'نشانهٔ پیشنمایش معتبر نیست.');
    }

    let started = false;
    let outcome: BulkOperationResult;
    try {
      outcome = await this.transaction(user, { isolation: 'read committed' }, async (client) => {
        started = true;
        return this.executeInTransaction(dto, user, meta, client);
      });
    } catch (err) {
      if (err instanceof NotFoundException) throw err;
      if (err instanceof ForbiddenException) {
        const body = err.getResponse() as { code?: string };
        if (body.code === 'invalid_preview_token') throw err;
      }
      if (!started) {
        if (err instanceof BulkMaintenanceUnknownError) {
          return this.finalizeUnknown(dto.operation_id, user, {
            kind: 'unknown',
            category: 'unknown',
            reasonCode: 'commit_outcome_unknown',
            messageFa: 'نتیجهٔ تراکنش نامشخص است؛ تنها بررسی اپراتور/مدیر مجاز است.',
            outcome: 'unknown',
            errorCode: err.code,
          });
        }
        throw err;
      }
      const classification = this.classifyFailure(err);
      return classification.kind === 'reject'
        ? this.finalizeReject(dto.operation_id, user, classification)
        : this.finalizeUnknown(dto.operation_id, user, classification);
    }

    // COMMIT resolved, but do not report success from an in-memory value alone:
    // re-read the durable ledger and fail closed if it is not in a terminal state.
    try {
      const confirmed = await this.transaction(user, { isolation: 'read committed' }, async (client) => {
        const row = await this.repo.findStatus(user.companyId, dto.operation_id, user.userId, client);
        return row ? this.resultFromRow(row, outcome.idempotent_replay ?? false, client) : null;
      });
      if (confirmed && ['committed', 'rejected', 'unknown'].includes(confirmed.status)) {
        return {
          ...confirmed,
          idempotent_replay: outcome.idempotent_replay ?? false,
          reconciled: outcome.reconciled ?? confirmed.reconciled,
          retryable: false,
        };
      }
    } catch (err) {
      console.error('bulk_maintenance_confirm_failed', {
        operation_id: dto.operation_id,
        error_code: (err as { code?: string })?.code ?? 'confirm_error',
      });
    }
    return this.finalizeUnknown(dto.operation_id, user, {
      kind: 'unknown',
      category: 'unknown',
      reasonCode: 'commit_outcome_unproved',
      messageFa: 'نتیجهٔ نهایی تراکنش اثبات نشد؛ تنها بررسی اپراتور/مدیر مجاز است.',
      outcome: 'unknown',
      errorCode: 'commit_outcome_unproved',
    });
  }

  private async executeInTransaction(
    dto: BulkMaintenanceExecuteDto,
    user: AuthContext,
    meta: RequestMeta,
    client: Runner,
  ): Promise<BulkOperationResult> {
    await lockBulkOperation(client, user.companyId, dto.operation_id);
    const row = await this.repo.findForUpdate(user.companyId, dto.operation_id, user.userId, client);
    if (!row) {
      throw new NotFoundException({ code: 'operation_not_found', message_fa: 'عملیات یافت نشد.' });
    }
    if (!bulkPreviewTokensEqual(hashBulkPreviewToken(dto.preview_token), row.preview_token_hash)) {
      throw new ForbiddenException({
        code: 'invalid_preview_token',
        message_fa: 'نشانهٔ پیشنمایش معتبر نیست.',
      });
    }
    if (row.status === 'committed' || row.status === 'rejected') {
      // Same identity never applies twice; token still required above.
      return this.resultFromRow(row, true, client);
    }
    if (row.status === 'unknown' || row.status === 'accepted') {
      // Fail closed: reconcile from durable evidence before any rerun.
      return this.reconcile(row, client, true);
    }
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      const rejected = await this.repo.markRejected(user.companyId, row.id, user.userId, {
        outcome: 'not_started',
        failureCategory: 'stale',
        reasonCode: 'preview_expired',
        messageFa: 'پیشنمایش منقضی شده است؛ پیشنمایش تازهای بسازید.',
      }, client);
      return this.resultFromRow(rejected ?? row, false, client);
    }

    // Re-validate stored values against the current server-owned whitelist.
    const changes = normalizeBulkChanges(row.changes);
    const productIds = normalizeProductIds(row.product_ids);
    if (hashBulkRequest(productIds, changes) !== row.request_hash) {
      throw new BulkMaintenanceInputError(
        'request_hash_mismatch',
        'درخواست ذخیرهشده تغییر کرده است؛ عملیات رد شد.',
      );
    }
    const storedPreview: BulkPreviewRecord = row.preview;
    if (hashBulkPreview(storedPreview, changes) !== row.preview_hash) {
      throw new BulkMaintenanceInputError(
        'preview_hash_mismatch',
        'پیشنمایش ذخیرهشده دستکاری شده است؛ عملیات رد شد.',
      );
    }
    const rows = await this.products.findByIdsForBulk(user.companyId, productIds, client);
    const brandNames = await this.validateBrandRefs(user.companyId, changes, rows, client);
    const fresh = buildBulkPreviewRecord(productIds, rows, changes, brandNames);
    const stale =
      hashBulkPreview(fresh, changes) !== row.preview_hash ||
      canonicalJson(fresh.expected_versions) !== canonicalJson(row.expected_versions);
    if (fresh.eligible_count === 0 || stale || fresh.rejected_count > 0) {
      const failureCategory = stale ? 'concurrency' : 'validation';
      const reasonCode = stale
        ? 'preview_stale'
        : fresh.eligible_count === 0
          ? 'no_eligible_products'
          : 'ineligible_selection';
      const messageFa = stale
        ? 'کالاها یا نسخههایشان پس از پیشنمایش تغییر کردهاند؛ پیشنمایش تازهای بسازید.'
        : fresh.eligible_count === 0
          ? 'هیچ کالای واجد تغییر معتبری برای اجرا وجود ندارد.'
          : 'یک یا چند کالا واجد شرایط نیستند؛ برای حفظ همهیا هیچ، هیچ تغییری ثبت نشد.';
      const rejected = await this.repo.markRejected(user.companyId, row.id, user.userId, {
        outcome: 'not_started',
        failureCategory,
        reasonCode,
        messageFa,
      }, client);
      return this.resultFromRow(rejected ?? row, false, client);
    }
    return this.atomicCommit(row, fresh, changes, user, meta, client);
  }

  private async atomicCommit(
    row: BulkOperationRow,
    fresh: BulkPreviewRecord,
    changes: BulkChanges,
    user: AuthContext,
    meta: RequestMeta,
    client: Runner,
  ): Promise<BulkOperationResult> {
    const accepted = await this.repo.markAccepted(
      user.companyId,
      row.id,
      user.userId,
      client,
    );
    if (!accepted) {
      throw new BulkMaintenanceInputError(
        'commit_state_conflict',
        'وضعیت عملیات همزمان تغییر کرده است؛ تراکنش برگشت خورد.',
      );
    }
    // تنها نقطهای که هویت عملیات را به تراکنش میسپارد: سرور، داخل همان
    // تراکنش، پس از accepted و پیش از نخستین UPDATE محصول. GUC فقط-تراکنشی است.
    await setBulkOperationContext(client, row.id);
    const eligible = fresh.items.filter((item) => item.status === 'eligible');
    const items: BulkOperationItem[] = [];
    const productIds: string[] = [];
    for (const item of eligible) {
      const expected = fresh.expected_versions[item.product_id];
      if (!Number.isInteger(expected)) {
        throw new BulkMaintenanceInputError(
          'missing_expected_version',
          'نسخهٔ مورد انتظار کالا یافت نشد.',
        );
      }
      const updateDto = this.toUpdateDto(changes, expected);
      const updated = await this.products.update(
        user.companyId,
        item.product_id,
        updateDto,
        expected,
        client,
      );
      if (!updated) {
        // One stale/concurrent product rejects the entire operation: the outer
        // transaction rolls back all earlier UPDATEs and their 0060 history.
        throw new BulkMaintenanceInputError(
          'version_conflict',
          'یک یا چند کالا همزمان تغییر کردهاند؛ هیچ تغییری ثبت نشد.',
        );
      }
      productIds.push(item.product_id);
      items.push({
        product_id: item.product_id,
        code: item.code,
        name: item.name,
        status: 'updated',
        row_version_before: expected,
        row_version_after: updated.row_version,
        message_fa: 'ثبت شد',
        product_url: `/products/${item.product_id}?tab=history`,
      });
    }

    // Transactional operation-level correlation. Per-product before/after
    // evidence comes from the 0060 trigger in the same transaction.
    await this.audit.recordRequired(
      {
        companyId: user.companyId,
        actorUserId: user.userId,
        action: 'update',
        entityType: 'product',
        entityId: null,
        before: null,
        after: {
          operation_id: row.id,
          fields: Object.keys(changes),
          product_ids: productIds,
          updated_count: items.length,
          source_request_id: meta.requestId ?? null,
        },
        ip: meta.ip,
        userAgent: meta.userAgent,
        // request_id کلاینت هرگز به ستون همبستگی نمیرود؛ فقط بهصورت تشخیصی
        // (غیرقابل اعتماد) در after_data نگهداری میشود.
        requestId: null,
        bulkOperationId: row.id,
      },
      client,
    );

    const rejected = fresh.items.filter((item) => item.status === 'rejected');
    const acceptedAt = iso(accepted.accepted_at) ?? new Date().toISOString();
    const committedAt = new Date().toISOString();
    const result: BulkOperationResult = {
      operation_id: row.id,
      status: 'committed',
      outcome: 'committed',
      lifecycle: [
        { state: 'preview_created', at: iso(row.created_at) ?? committedAt },
        { state: 'accepted', at: acceptedAt },
        { state: 'committed', at: committedAt },
      ],
      eligible_count: fresh.eligible_count,
      updated_count: items.length,
      rejected_count: fresh.rejected_count,
      failure_category: 'none',
      accepted_at: acceptedAt,
      committed_at: committedAt,
      expires_at: iso(row.expires_at),
      idempotent_replay: false,
      reconciled: false,
      retryable: false,
      items: [
        ...items,
        ...rejected.map((item) => ({
          product_id: item.product_id,
          code: item.code,
          name: item.name,
          status: 'rejected' as const,
          message_fa: item.message_fa ?? 'کالا واجد شرایط نبود.',
          product_url: `/products/${item.product_id}?tab=history`,
        })),
      ],
    };
    const committed = await this.repo.markCommitted(
      user.companyId,
      row.id,
      user.userId,
      items.length,
      result,
      client,
    );
    if (!committed) {
      throw new BulkMaintenanceInputError(
        'commit_state_conflict',
        'وضعیت عملیات همزمان تغییر کرده است؛ تراکنش برگشت خورد.',
      );
    }
    return result;
  }

  private toUpdateDto(changes: BulkChanges, expectedRowVersion: number): UpdateProductDto {
    const dto: Record<string, unknown> = { row_version: expectedRowVersion };
    for (const [key, value] of Object.entries(changes)) {
      if (!BULK_FIELD_BY_KEY.has(key)) {
        throw new BulkMaintenanceInputError('protected_field', `فیلد «${key}» مجاز نیست.`, {
          field: key,
        });
      }
      dto[key] = value;
    }
    return dto as unknown as UpdateProductDto;
  }

  private previewStateResult(
    row: BulkOperationRow,
    client: Runner,
    replay: boolean,
  ): Promise<BulkOperationResult> {
    return (async () => {
      const now = new Date().toISOString();
      const createdAt = iso(row.created_at) ?? now;
      const expiresAt = iso(row.expires_at);
      if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
        return {
          operation_id: row.id,
          status: 'preview_expired',
          outcome: 'not_started',
          lifecycle: [
            { state: 'preview_created', at: createdAt },
            { state: 'preview_expired', at: now },
          ],
          eligible_count: row.eligible_count,
          updated_count: 0,
          rejected_count: row.rejected_count + row.eligible_count,
          failure_category: 'stale',
          reason_code: 'preview_expired',
          message_fa: 'پیشنمایش منقضی شده است؛ پیشنمایش تازهای بسازید.',
          expires_at: expiresAt,
          idempotent_replay: replay,
          reconciled: false,
          retryable: false,
          items: [],
        };
      }
      const changes = normalizeBulkChanges(row.changes);
      const productIds = normalizeProductIds(row.product_ids);
      const rows = await this.products.findByIdsForBulk(row.company_id, productIds, client);
      const brandNames = await this.validateBrandRefs(row.company_id, changes, rows, client);
      const fresh = buildBulkPreviewRecord(productIds, rows, changes, brandNames);
      const stale =
        hashBulkPreview(fresh, changes) !== row.preview_hash ||
        canonicalJson(fresh.expected_versions) !== canonicalJson(row.expected_versions);
      if (stale) {
        return {
          operation_id: row.id,
          status: 'preview_stale',
          outcome: 'not_started',
          lifecycle: [
            { state: 'preview_created', at: createdAt },
            { state: 'preview_stale', at: now },
          ],
          eligible_count: row.eligible_count,
          updated_count: 0,
          rejected_count: row.rejected_count + row.eligible_count,
          failure_category: 'stale',
          reason_code: 'preview_stale',
          message_fa: 'اطلاعات کالاها پس از پیشنمایش تغییر کرده است؛ پیشنمایش تازهای بسازید.',
          expires_at: expiresAt,
          idempotent_replay: replay,
          reconciled: false,
          retryable: false,
          items: [],
        };
      }
      return this.resultFromRow(row, replay, client);
    })();
  }

  private resultFromRow(
    row: BulkOperationRow,
    replay: boolean,
    _client?: Runner,
  ): BulkOperationResult {
    const stored = row.result as unknown as BulkOperationResult | null;
    // وضعیت بایدار دفتر عملیات حاکم است: نتیجهٔ ذخیرهشدهٔ قدیمی (مثلاً committed)
    // نباید پس از unknownشدن دستی/خرابی، GET فقطخواندنی را فریب دهد.
    if (stored && row.status !== 'unknown' && row.status !== 'accepted' && row.status !== 'preview_created') {
      return {
        ...stored,
        status: row.status,
        outcome: row.outcome,
        idempotent_replay: replay,
        retryable: false,
        // فقط حالتهای قطعی committed/rejected از نتیجهٔ ذخیرهشده استفاده میکنند؛
        // بنابراین راهنمای «تطبیق نامشخص» اینجا معنا ندارد.
        reconciliation_hint_fa: null,
      };
    }
    const lifecycle: BulkOperationResult['lifecycle'] = [
      { state: 'preview_created', at: iso(row.created_at) ?? new Date().toISOString() },
    ];
    if (row.accepted_at) lifecycle.push({ state: 'accepted', at: iso(row.accepted_at)! });
    if (row.committed_at) lifecycle.push({ state: 'committed', at: iso(row.committed_at)! });
    if (row.status === 'rejected') {
      lifecycle.push({ state: 'rejected', at: iso(row.updated_at) ?? new Date().toISOString() });
    }
    if (row.status === 'unknown') {
      lifecycle.push({ state: 'unknown', at: iso(row.updated_at) ?? new Date().toISOString() });
    }
    return {
      operation_id: row.id,
      status: row.status,
      outcome: row.outcome,
      lifecycle,
      eligible_count: row.eligible_count,
      updated_count: row.updated_count,
      rejected_count:
        row.status === 'rejected' ? row.rejected_count + row.eligible_count : row.rejected_count,
      failure_category: row.failure_category,
      reason_code: row.reason_code,
      message_fa: row.message_fa,
      accepted_at: iso(row.accepted_at),
      committed_at: iso(row.committed_at),
      expires_at: iso(row.expires_at),
      idempotent_replay: replay,
      reconciled: false,
      retryable: false,
      reconciliation_hint_fa:
        row.status === 'unknown'
          ? 'نتیجهٔ تراکنش نامشخص است. تنها با اکشن صریح تطبیق شواهد عملیات بررسی شود؛ اجرای مجدد انجام ندهید.'
          : null,
      items: (row.preview.items as BulkPreviewItem[]).length > 0
        ? row.status === 'rejected'
          ? (row.preview.items as BulkPreviewItem[]).map((item) => ({
              product_id: item.product_id,
              code: item.code,
              name: item.name,
              status: 'rejected' as const,
              message_fa: item.message_fa ?? 'اجرا نشد',
              product_url: `/products/${item.product_id}?tab=history`,
            }))
          : []
        : [],
    };
  }

  /** Fail-closed reconciliation for unknown/accepted states; never blind reruns. */
  private async reconcile(
    row: BulkOperationRow,
    client: Runner,
    replay: boolean,
  ): Promise<BulkOperationResult> {
    const createdAt = iso(row.created_at) ?? new Date().toISOString();
    const ambiguous = (): BulkOperationResult => ({
      operation_id: row.id,
      status: 'unknown',
      outcome: 'unknown',
      lifecycle: [
        { state: 'preview_created', at: createdAt },
        ...(row.accepted_at ? [{ state: 'accepted' as const, at: iso(row.accepted_at)! }] : []),
        { state: 'unknown', at: new Date().toISOString() },
      ],
      eligible_count: row.eligible_count,
      updated_count: 0,
      rejected_count: 0,
      failure_category: 'unknown',
      reason_code: 'commit_outcome_unknown',
      message_fa: 'نتیجهٔ تراکنش نامشخص است؛ شواهد operation-bound کامل/سازگار نیستند و تنها اکشن صریح تطبیق یا بررسی اپراتور مجاز است.',
      expires_at: iso(row.expires_at),
      idempotent_replay: replay,
      reconciled: false,
      retryable: false,
      reconciliation_hint_fa: 'بدون تطبیق قطعی شواهد operation-bound اجرای مجدد انجام ندهید؛ از اکشن صریح تطبیق استفاده کنید.',
      items: [],
    });

    const actorUserId = row.actor_user_id;
    if (!actorUserId) return ambiguous();
    const changes = normalizeBulkChanges(row.changes);
    const productIds = normalizeProductIds(row.product_ids);
    const expectedCount = row.eligible_count;

    const rows = await this.products.findByIdsForBulk(row.company_id, productIds, client);
    const brandNames = await this.validateBrandRefs(row.company_id, changes, rows, client);
    const fresh = buildBulkPreviewRecord(productIds, rows, changes, brandNames);
    const versions = await this.repo.productVersions(row.company_id, productIds, client);
    const stillAtExpected =
      versions.size === Object.keys(row.expected_versions).length &&
      Object.entries(row.expected_versions).every(([id, v]) => versions.get(id) === v);

    // شواهد فقط از ستونهای سرور-کنترلشدهٔ ۰۰۶۳ خوانده میشوند: نه request_id،
    // نه after_data، نه بازیگر/شرکت استنتاجشده، نه شمارهٔ نسخه بهعنوان مالکیت.
    const audit = await this.repo.auditEvidenceStats(
      row.company_id,
      row.id,
      actorUserId,
      createdAt,
      client,
    );
    const evidence = await this.repo.boundEvidenceStats(
      row.company_id,
      row.id,
      actorUserId,
      productIds,
      createdAt,
      client,
    );

    const auditOk = audit.total === 1 && audit.valid === 1 && audit.invalid === 0;
    const evidenceComplete =
      evidence.history_rows === expectedCount &&
      evidence.history_distinct_products === expectedCount &&
      evidence.history_invalid === 0 &&
      evidence.history_unexpected_products === 0 &&
      evidence.evidence_rows === expectedCount &&
      evidence.evidence_distinct_products === expectedCount &&
      evidence.evidence_distinct_history === expectedCount &&
      evidence.evidence_invalid === 0 &&
      evidence.evidence_unexpected_products === 0 &&
      evidence.evidence_mismatch === 0 &&
      evidence.cross_operation_evidence === 0;

    // نسخهها فقط بهعنوان «بررسی منفی سازگاری» بهکار میروند، نه اثبات مالکیت:
    // اگر شاهد کامل باشد ولی ردیفها هنوز نسخهٔ پیش از عملیات باشند ⇒ ابهام.
    const committedEvidence = auditOk && evidenceComplete && !stillAtExpected;
    if (committedEvidence) {
      const items: BulkOperationItem[] = row.preview.items.map((item) => ({
        product_id: item.product_id,
        code: item.code,
        name: item.name,
        status: item.status === 'eligible' ? 'updated' : 'rejected',
        row_version_after: versions.get(item.product_id),
        message_fa: item.status === 'eligible' ? 'ثبت شد' : item.message_fa,
        product_url: `/products/${item.product_id}?tab=history`,
      }));
      const result: BulkOperationResult = {
        operation_id: row.id,
        status: 'committed',
        outcome: 'committed',
        lifecycle: [
          { state: 'preview_created', at: createdAt },
          ...(row.accepted_at ? [{ state: 'accepted' as const, at: iso(row.accepted_at)! }] : []),
          { state: 'committed', at: iso(row.committed_at) ?? new Date().toISOString() },
        ],
        eligible_count: row.eligible_count,
        updated_count: row.eligible_count,
        rejected_count: row.rejected_count,
        failure_category: 'none',
        committed_at: iso(row.committed_at) ?? new Date().toISOString(),
        expires_at: iso(row.expires_at),
        idempotent_replay: replay,
        reconciled: true,
        retryable: false,
        items,
      };
      await this.repo.markReconciledCommitted(
        row.company_id,
        row.id,
        actorUserId,
        result,
        client,
      );
      return result;
    }

    // برگشت قطعی: هیچ شاهد الزامی/تاریخچهایِ همبسته وجود ندارد، محصولات دستنخورده
    // و پیشنمایش همچنان معتبر است. هر چیز دیگری نامشخص میماند (fail-closed).
    const rolledBackEvidence =
      audit.total === 0 &&
      evidence.history_rows === 0 &&
      evidence.evidence_rows === 0 &&
      evidence.cross_operation_evidence === 0 &&
      stillAtExpected &&
      fresh.eligible_count === row.eligible_count;
    if (rolledBackEvidence) {
      const result: BulkOperationResult = {
        operation_id: row.id,
        status: 'rejected',
        outcome: 'rolled_back',
        lifecycle: [
          { state: 'preview_created', at: createdAt },
          ...(row.accepted_at ? [{ state: 'accepted' as const, at: iso(row.accepted_at)! }] : []),
          { state: 'rejected', at: new Date().toISOString() },
        ],
        eligible_count: row.eligible_count,
        updated_count: 0,
        rejected_count: row.rejected_count + row.eligible_count,
        failure_category: 'infrastructure',
        reason_code: 'transaction_rolled_back',
        message_fa: 'هیچ تغییری ثبت نشد؛ تراکنش با شواهد operation-bound بررسی و رد شد.',
        expires_at: iso(row.expires_at),
        idempotent_replay: replay,
        reconciled: true,
        retryable: false,
        items: [],
      };
      await this.repo.markReconciledRejected(
        row.company_id,
        row.id,
        actorUserId,
        result,
        client,
      );
      return result;
    }
    return ambiguous();
  }

  private classifyFailure(err: unknown): FailureClassification {
    if ((err as { code?: string })?.code === 'audit_partition_missing') {
      return {
        kind: 'reject',
        category: 'infrastructure',
        reasonCode: 'audit_partition_missing',
        messageFa:
          'پارتیشن ممیزی وجود نداشت؛ هیچ تغییری ثبت نشد. اپراتور باید خارج از برنامه و با هویت مالک اشیاء (همان DATABASE_URL که مهاجرتها را اعمال کرده است، نه dms_app و نه dms_migrator/dms_owner بیملکیت) دستور fn_ensure_partitions(2) را اجرا و در لاگ استقرار ثبت کند، سپس عملیات تازهای بسازد.',
        outcome: 'rolled_back',
        errorCode: 'audit_partition_missing',
      };
    }
    if (err instanceof BulkMaintenanceUnknownError) {
      return {
        kind: 'unknown',
        category: 'unknown',
        reasonCode: 'commit_outcome_unknown',
        messageFa: 'نتیجهٔ تراکنش نامشخص است؛ تنها بررسی اپراتور/مدیر مجاز است.',
        outcome: 'unknown',
        errorCode: err.code,
      };
    }
    if (err instanceof BulkMaintenanceInputError) {
      const code = err.code;
      if (code === 'commit_outcome_unknown' || code === 'commit_not_confirmed') {
        return {
          kind: 'unknown',
          category: 'unknown',
          reasonCode: 'commit_outcome_unknown',
          messageFa: 'نتیجهٔ تراکنش نامشخص است؛ تنها بررسی اپراتور/مدیر مجاز است.',
          outcome: 'unknown',
          errorCode: code,
        };
      }
      const concurrency = new Set([
        'version_conflict',
        'concurrency_serialization',
        'deadlock',
        'commit_state_conflict',
      ]);
      return {
        kind: 'reject',
        category: concurrency.has(code) ? 'concurrency' : 'validation',
        reasonCode: code === 'preview_stale' ? 'preview_stale' : code,
        messageFa: err.message_fa,
        outcome: concurrency.has(code) ? 'rolled_back' : 'not_started',
        errorCode: code,
      };
    }
    if (err instanceof HttpException) {
      const status = err.getStatus();
      const body = err.getResponse() as { code?: string; message_fa?: string };
      const code = body.code ?? `http_${status}`;
      if (status === 403 || status === 404 || status === 400) {
        return {
          kind: 'reject',
          category: status === 403 ? 'permission' : 'validation',
          reasonCode: code,
          messageFa: body.message_fa ?? 'درخواست پیش از ثبت رد شد.',
          outcome: 'not_started',
          errorCode: code,
        };
      }
    }
    const dbCode = (err as { code?: string })?.code ?? '';
    if (dbCode === '40001' || dbCode === '40P01') {
      return {
        kind: 'reject',
        category: 'concurrency',
        reasonCode: 'version_conflict',
        messageFa: 'تداخل همزمانی رخ داد؛ هیچ تغییری ثبت نشد. پیشنمایش تازهای بسازید.',
        outcome: 'rolled_back',
        errorCode: dbCode,
      };
    }
    if (['23505', '23514', '23503', '23502', '22001', '22P02'].includes(dbCode)) {
      return {
        kind: 'reject',
        category: 'validation',
        reasonCode: 'invalid_value',
        messageFa: 'یکی از مقادیر با قواعد پایگاهداده ناسازگار بود؛ هیچ تغییری ثبت نشد.',
        outcome: 'rolled_back',
        errorCode: dbCode,
      };
    }
    return {
      kind: 'unknown',
      category: 'unknown',
      reasonCode: 'commit_outcome_unknown',
      messageFa: 'نتیجهٔ تراکنش نامشخص است؛ تنها بررسی اپراتور/مدیر مجاز است.',
      outcome: 'unknown',
      errorCode: dbCode || 'infrastructure_error',
    };
  }

  private genericFailureResult(
    operationId: string,
    classification: FailureClassification,
    status: 'rejected' | 'unknown',
  ): BulkOperationResult {
    return {
      operation_id: operationId,
      status,
      outcome: classification.outcome,
      lifecycle: [{ state: status === 'unknown' ? 'unknown' : 'rejected', at: new Date().toISOString() }],
      eligible_count: 0,
      updated_count: 0,
      rejected_count: 0,
      failure_category: classification.category,
      reason_code: classification.reasonCode,
      message_fa: classification.messageFa,
      idempotent_replay: false,
      reconciled: false,
      retryable: false,
      reconciliation_hint_fa:
        status === 'unknown'
          ? 'بدون تطبیق قطعی شواهد operation-bound اجرای مجدد انجام ندهید؛ از اکشن صریح تطبیق استفاده کنید.'
          : null,
      items: [],
    };
  }

  private async finalizeReject(
    operationId: string,
    user: AuthContext,
    classification: FailureClassification,
  ): Promise<BulkOperationResult> {
    try {
      return await this.transaction(user, { isolation: 'read committed' }, async (client) => {
        const row = await this.repo.findStatus(user.companyId, operationId, user.userId, client);
        if (!row) return this.genericFailureResult(operationId, classification, 'rejected');
        if (row.status === 'committed' || row.status === 'rejected') {
          return this.resultFromRow(row, false, client);
        }
        const result: BulkOperationResult = {
          operation_id: row.id,
          status: 'rejected',
          outcome: classification.outcome,
          lifecycle: [
            { state: 'preview_created', at: iso(row.created_at) ?? new Date().toISOString() },
            ...(row.accepted_at ? [{ state: 'accepted' as const, at: iso(row.accepted_at)! }] : []),
            { state: 'rejected', at: new Date().toISOString() },
          ],
          eligible_count: row.eligible_count,
          updated_count: 0,
          rejected_count: row.rejected_count + row.eligible_count,
          failure_category: classification.category,
          reason_code: classification.reasonCode,
          message_fa: classification.messageFa,
          accepted_at: iso(row.accepted_at),
          committed_at: null,
          expires_at: iso(row.expires_at),
          idempotent_replay: false,
          reconciled: false,
          retryable: false,
          items: (row.preview.items as BulkPreviewItem[]).map((item) => ({
            product_id: item.product_id,
            code: item.code,
            name: item.name,
            status: 'rejected' as const,
            message_fa: item.message_fa ?? classification.messageFa,
            product_url: `/products/${item.product_id}?tab=history`,
          })),
        };
        const updated = await this.repo.markRejected(
          user.companyId,
          row.id,
          user.userId,
          {
            outcome: classification.outcome,
            failureCategory: classification.category,
            reasonCode: classification.reasonCode,
            messageFa: classification.messageFa,
            result,
          },
          client,
        );
        return {
          ...(updated ? this.resultFromRow(updated, false, client) : result),
          idempotent_replay: false,
          retryable: false,
        };
      });
    } catch (err) {
      console.error('bulk_maintenance_reject_finalize_failed', {
        operation_id: operationId,
        error_code: (err as { code?: string })?.code ?? 'finalize_error',
      });
      return this.genericFailureResult(
        operationId,
        { ...classification, kind: 'unknown', outcome: 'unknown', category: 'unknown', reasonCode: 'commit_outcome_unknown' },
        'unknown',
      );
    }
  }

  private async finalizeUnknown(
    operationId: string,
    user: AuthContext,
    classification: FailureClassification,
  ): Promise<BulkOperationResult> {
    // Never log request values or product data; only an operation id and code.
    console.error('bulk_maintenance_unknown_outcome', {
      operation_id: operationId,
      error_code: classification.errorCode,
    });
    try {
      return await this.transaction(user, { isolation: 'read committed' }, async (client) => {
        const row = await this.repo.findStatus(user.companyId, operationId, user.userId, client);
        if (!row) return this.genericFailureResult(operationId, classification, 'unknown');
        if (row.status === 'committed' || row.status === 'rejected') {
          return this.resultFromRow(row, false, client);
        }
        if (row.status !== 'unknown') {
          await this.repo.markUnknown(
            user.companyId,
            row.id,
            user.userId,
            'نتیجهٔ تراکنش نامشخص است؛ بدون تطبیق، اجرای مجدد مجاز نیست.',
            client,
          );
        }
        const updated = await this.repo.findStatus(user.companyId, operationId, user.userId, client);
        return {
          ...this.resultFromRow(updated ?? row, false, client),
          status: 'unknown',
          outcome: 'unknown',
          failure_category: 'unknown',
          reason_code: 'commit_outcome_unknown',
          message_fa: 'نتیجهٔ تراکنش نامشخص است؛ تنها بررسی اپراتور/مدیر مجاز است.',
          idempotent_replay: false,
          reconciled: false,
          retryable: false,
          reconciliation_hint_fa: 'بدون تطبیق قطعی شواهد operation-bound اجرای مجدد انجام ندهید؛ از اکشن صریح تطبیق استفاده کنید.',
          items: [],
        };
      });
    } catch (err) {
      console.error('bulk_maintenance_unknown_finalize_failed', {
        operation_id: operationId,
        error_code: (err as { code?: string })?.code ?? 'finalize_error',
      });
      return this.genericFailureResult(operationId, classification, 'unknown');
    }
  }
}
