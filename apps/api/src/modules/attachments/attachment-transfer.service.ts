import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { AUDIT_SERVICE, type AuditService } from '../../common/audit.service';
import { withTransaction } from '../../common/transaction';
import type { RequestMeta } from '../../common/request-meta';
import { permissionMatches } from '../identity-rbac/permissions';
import { fingerprintFieldsFor } from '../rules-engine/entity-fingerprint';
import { ownerTenantSql } from './owner-scope';
import { STORAGE_SERVICE } from './tokens';
import type { StorageService } from './storage.service';
import {
  TRANSFER_APPROVAL_OPERATION,
  TRANSFER_AUDIT_ENTITY_TYPE,
  TRANSFER_EXECUTION_BLOCKED_FA,
  TRANSFER_MAX_FILES,
  TRANSFER_MAX_PACKAGE_BYTES,
  TRANSFER_MAX_SELECTIONS,
  TRANSFER_MAX_SINGLE_FILE_BYTES,
  TRANSFER_NOTE_FA,
  TRANSFER_OWNER_LABELS_FA,
  TRANSFER_OWNER_MODULE_PATHS,
  TRANSFER_OWNER_TYPES,
  TRANSFER_PREVIEW_TTL_MS,
  TRANSFER_SCHEMA,
  TransferManifest,
  TransferMappingOverride,
  TransferOwnerType,
  TransferPackageError,
  TransferPreviewItem,
  TransferApprovalBindingInput,
  canonicalJson,
  findForbiddenClientFields,
  isTransferOwnerType,
  isUuid,
  manifestSha256,
  sha256Hex,
  validateTwoPersonApprovalBinding,
} from './attachment-transfer.rules';
import {
  buildTransferPackage,
  inspectTransferPackage,
  type BuiltTransferPackage,
  type TransferPackageInspection,
} from './attachment-transfer.package';
import type {
  TransferActor,
  TransferExportPreview,
  TransferHistoryItem,
  TransferImportPreview,
  TransferManifestView,
  TransferOperationDetail,
  TransferOwnerRecord,
  TransferOwnerTypeOption,
  TransferRejectedFile,
  TransferSelection,
  TransferAuditEvent,
} from './attachment-transfer.types';

/** سرور ساخته است؛ کلاینت هرگز جدول، ستون، شرکت یا مسیر مالکیت تعیین نمیکند. */
const OWNER_DISCOVERY_SQL: Readonly<Record<TransferOwnerType, string>> = Object.freeze({
  product: `select p.id::text as owner_id, p.company_id::text as company_id,
                   p.code as reference, p.name as title_fa
              from product p
             where p.company_id = $1::uuid and p.deleted_at is null`,
  invoice: `select i.id::text as owner_id, b.company_id::text as company_id,
                   i.doc_number as reference, coalesce(i.status, '') as title_fa
              from invoice i join branch b on b.id = i.branch_id
             where b.company_id = $1::uuid`,
  sales_order: `select o.id::text as owner_id, b.company_id::text as company_id,
                       o.doc_number as reference, coalesce(o.status, '') as title_fa
                  from sales_order o join branch b on b.id = o.branch_id
                 where b.company_id = $1::uuid`,
  return_request: `select r.id::text as owner_id, b.company_id::text as company_id,
                          r.doc_number as reference, coalesce(r.status, '') as title_fa
                     from return_request r join branch b on b.id = r.branch_id
                    where b.company_id = $1::uuid`,
  stock_count: `select s.id::text as owner_id, b.company_id::text as company_id,
                       coalesce(s.doc_number, s.id::text) as reference, coalesce(s.status, '') as title_fa
                  from stock_count s join branch b on b.id = s.branch_id
                 where b.company_id = $1::uuid`,
  journal_entry: `select j.id::text as owner_id, j.company_id::text as company_id,
                         j.doc_number as reference, j.description as title_fa
                    from journal_entry j
                   where j.company_id = $1::uuid`,
  receipt: `select r.id::text as owner_id, b.company_id::text as company_id,
                   r.doc_number as reference, coalesce(r.status, '') as title_fa
              from payment_receipt r join branch b on b.id = r.branch_id
             where b.company_id = $1::uuid`,
  pod: `select p.id::text as owner_id, b.company_id::text as company_id,
               d.doc_number as reference, coalesce(d.status, '') as title_fa
          from pod p join delivery d on d.id = p.delivery_id
                     join branch b on b.id = d.branch_id
         where b.company_id = $1::uuid`,
});

interface AttachmentRowForTransfer extends QueryResultRow {
  id: string;
  owner_type: TransferOwnerType;
  owner_id: string;
  file_name: string;
  content_type: string;
  size_bytes: number;
  sha256: string;
  storage_key: string;
  created_at: string;
}

interface ImportPreviewState {
  operationId: string;
  companyId: string;
  initiatorUserId: string;
  createdAt: string;
  expiresAtMs: number;
  version: number;
  manifest: TransferManifest;
  inspection: TransferPackageInspection;
  overrides: TransferMappingOverride[];
  items: TransferPreviewItem[];
  mappingSha256: string;
  previewSha256: string;
  preview: TransferImportPreview;
  status: 'approval_blocked' | 'cancelled';
}

interface AuditEventRow extends QueryResultRow {
  id: string;
  entity_id: string;
  action: string;
  at: string;
  actor_user_id: string | null;
  actor_label: string | null;
  after_data: unknown;
}

interface SafeFailure {
  code: string;
  message_fa: string;
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled', 'blocked']);

const iso = (value: Date | string | number): string => new Date(value).toISOString();

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function statusCounts(items: readonly TransferPreviewItem[]): TransferImportPreview['counts'] {
  return {
    accepted: items.filter((i) => i.status === 'accepted').length,
    rejected: items.filter((i) => i.status === 'rejected').length,
    duplicate: items.filter((i) => i.status === 'duplicate').length,
    unresolved: items.filter((i) => i.status === 'unresolved').length,
  };
}

/**
 * سرویس «مرکز انتقال ضمائم چندموجودیتی» (TASK-PM-02-C4).
 *
 * ستون فقرات:
 *  - تنها هشت `owner_type` مصوب C1/C3 با `ownerTenantSql`؛ `other`، برند،
 *    دسته، انبار، واحد، دامنه و شرکت دیگر fail-closed رد میشوند.
 *  - مجوزهای موجود `attachment.view`، `attachment.upload` و `master.product.view`
 *    در گارد route و دوباره از روی DB؛ RBAC/RLS/FORCE RLS و `DomainBoundaryGuard`
 *    دستنخورده. مجوز/نقش/grant/مهاجرت/RLS تازهای وجود ندارد.
 *  - صدور: بستهٔ ZIP سرورساخته با manifest مالکمحور و SHA-256/Checksum؛ تاریخچه
 *    در `audit_log` همان تراکنش. دانلود همان بسته را با اختیار تازه بازسازی میکند
 *    (هیچ URL امضاشده، کلید استوریج یا شیء دائمی تازهای ساخته/نگهداری نمیشود).
 *  - ورود: فقط بارگذاری/بازرسی/پیشنمایش امن و نگاشت صریح به رکورد موجود. چون
 *    `rules-engine` برای `attachment.import.execute` سیاست و اثرانگشت مصوب
 *    ندارد، اجرا fail-closed است؛ هیچ اجرا، جایگزینی، ساخت مالک یا تأیید بدلی
 *    پیادهسازی نشده است.
 */
@Injectable()
export class AttachmentTransferService {
  /** فقط پیشنمایش کوتاهعمر در حافظه؛ هیچ بایت/بسته/سیاست نگهداشت پایدار اضافه نمیشود. */
  private readonly previews = new Map<string, ImportPreviewState>();

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  // ---------------- ورودیها و خطاها ----------------

  private bad(code: string, messageFa: string, details?: Record<string, unknown>): BadRequestException {
    return new BadRequestException({ code, message_fa: messageFa, ...(details ? { details } : {}) });
  }

  private assertClientPayload(raw: unknown, allowed: readonly string[]): Record<string, unknown> {
    const obj = asRecord(raw);
    if (!obj) throw this.bad('invalid_request_body', 'بدنهٔ درخواست باید شیء JSON معتبر باشد.');
    const forbidden = findForbiddenClientFields(obj);
    if (forbidden.length > 0) {
      throw this.bad('forbidden_client_field', 'فیلدهای مالکیت، اجاره، دامنه یا زیرساخت از کلاینت پذیرفته نمیشود.', {
        fields: forbidden,
      });
    }
    const allowedSet = new Set(allowed);
    const unsupported = Object.keys(obj).filter((k) => !allowedSet.has(k)).sort();
    if (unsupported.length > 0) {
      throw this.bad('unsupported_request_field', 'فیلدهای ارسالی در قرارداد تعریف نشدهاند.', {
        fields: unsupported,
      });
    }
    return obj;
  }

  private assertQuery(raw: unknown, allowed: readonly string[]): Record<string, unknown> {
    return this.assertClientPayload(raw && typeof raw === 'object' ? raw : {}, allowed);
  }

  private safeFailure(err: unknown): SafeFailure {
    if (err instanceof TransferPackageError) return { code: err.code, message_fa: err.messageFa };
    const response = asRecord((err as { getResponse?: () => unknown })?.getResponse?.());
    const code = asString(response?.code);
    const message = asString(response?.message_fa);
    if (code && message && !/https?:\/\//i.test(message) && !/storage_key|bucket|endpoint|secret/i.test(message)) {
      return { code, message_fa: message };
    }
    return {
      code: 'attachment_transfer_failed',
      message_fa: 'انجام عملیات انتقال ضمائم ممکن نشد؛ هیچ تغییری در ضمائم ثبت نشد.',
    };
  }

  private httpFailure(err: unknown): never {
    if (err instanceof TransferPackageError) {
      throw new BadRequestException({ code: err.code, message_fa: err.messageFa, details: err.details ?? null });
    }
    if (err instanceof BadRequestException || err instanceof ForbiddenException ||
        err instanceof NotFoundException || err instanceof ConflictException ||
        err instanceof ServiceUnavailableException) {
      throw err;
    }
    const safe = this.safeFailure(err);
    if (safe.code === 'storage_read_failed') {
      throw new ServiceUnavailableException({ code: safe.code, message_fa: safe.message_fa });
    }
    throw new BadRequestException({ code: safe.code, message_fa: safe.message_fa });
  }

  /** هیچ کلید استوریج، URL، توکن، رمز، bucket، endpoint یا شرکت در ممیزی/تاریخچه نشت نکند. */
  private assertSafeAuditValue(value: unknown, depth = 0): void {
    if (depth > 8) throw new Error('audit_payload_too_deep');
    if (typeof value === 'string') {
      if (/https?:\/\//i.test(value) || /(?:minio|s3|amazonaws|bucket|storage_key|access_key|secret_key|password|bearer\s)/i.test(value)) {
        throw new Error('unsafe_audit_value');
      }
      return;
    }
    if (value == null || typeof value !== 'object') return;
    const forbidden = /^(?:url|urls|storage_key|storage_url|signed_url|download_url|token|access_token|refresh_token|secret|password|credential|credentials|bucket|endpoint|access_key|secret_key|company_id|tenant_id|domain_id|domain_status|available|x-domain-id)$/i;
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 500)) this.assertSafeAuditValue(item, depth + 1);
      return;
    }
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (forbidden.test(key)) throw new Error('unsafe_audit_key');
      this.assertSafeAuditValue(nested, depth + 1);
    }
  }

  private async recordAudit(
    client: PoolClient,
    actor: TransferActor,
    operationId: string,
    action: string,
    payload: Record<string, unknown>,
    meta: RequestMeta,
  ): Promise<void> {
    this.assertSafeAuditValue(payload);
    await this.audit.recordRequired(
      {
        companyId: actor.companyId,
        actorUserId: actor.userId,
        action,
        entityType: TRANSFER_AUDIT_ENTITY_TYPE,
        entityId: operationId,
        after: payload,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
        requestId: meta.requestId ?? null,
      },
      client,
    );
  }

  private async recordFailure(
    actor: TransferActor,
    operationId: string,
    operationType: 'export' | 'import',
    safe: SafeFailure,
    meta: RequestMeta,
  ): Promise<void> {
    try {
      await withTransaction(this.pool, async (client) => {
        await client.query(
          `select set_config('app.company_id', $1, true), set_config('app.user_id', $2, true)`,
          [actor.companyId, actor.userId],
        );
        await this.recordAudit(client, actor, operationId, 'attachment_transfer.failure', {
          operation_id: operationId,
          operation_type: operationType,
          phase: 'failure',
          execution_status: 'failed',
          safe_failure: safe,
          file_count: 0,
          entity_types: [],
          counts: { accepted: 0, rejected: 0, duplicate: 0, unresolved: 0 },
        }, meta);
      });
    } catch {
      // خطای اصلی پوشانده نمیشود؛ شکست ممیزی هم به معنای موفقیت عملیات نیست.
    }
  }

  private async tenantTransaction<T>(
    actor: TransferActor,
    work: (client: PoolClient) => Promise<T>,
    readOnly = false,
  ): Promise<T> {
    return withTransaction(this.pool, async (client) => {
      // GUC تراکنش-محلی، پیش از هر پرسوجو: RLS/FORCE RLS همان شرکت نشست را میبیند.
      if (readOnly) {
        await client.query('set transaction isolation level repeatable read');
        await client.query('set transaction read only');
      }
      await client.query(
        `select set_config('app.company_id', $1, true), set_config('app.user_id', $2, true)`,
        [actor.companyId, actor.userId],
      );
      return work(client);
    });
  }

  private async assertPermissions(
    client: PoolClient,
    actor: TransferActor,
    required: readonly string[],
  ): Promise<void> {
    const { rows } = await client.query<{ code: string }>(
      `select distinct rp.permission_code as code from app_user u
         join person p on p.id = u.person_id
         join user_role ur on ur.app_user_id = u.id
         join role r on r.id = ur.role_id and r.company_id = p.company_id
         join role_permission rp on rp.role_id = r.id
        where u.id = $1 and p.company_id = $2 and not u.is_locked
          and u.access_level <> 'none' and (u.locked_until is null or u.locked_until <= now())`,
      [actor.userId, actor.companyId],
    );
    const granted = rows.map((r) => r.code);
    const missing = required.filter((need) => !granted.some((g) => permissionMatches(g, need)));
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: 'attachment_permission_denied',
        message_fa: `مجوز «${missing.join('، ')}» برای انتقال ضمائم لازم است.`,
      });
    }
  }

  private parseOwnerTypes(value: unknown): TransferOwnerType[] {
    const raw = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
    const values = raw.flatMap((v) => typeof v === 'string' ? v.split(',').map((s) => s.trim()) : []);
    if (values.length === 0) return [...TRANSFER_OWNER_TYPES];
    if (values.length > TRANSFER_OWNER_TYPES.length || new Set(values).size !== values.length) {
      throw this.bad('invalid_entity_types', 'فهرست انواع موجودیت نامعتبر یا تکراری است.');
    }
    return values.map((v) => {
      if (!isTransferOwnerType(v)) {
        throw this.bad('unsupported_owner_type', 'نوع مالک درخواستشده پشتیبانی نمیشود.', { owner_type: v });
      }
      return v;
    });
  }

  private parseSelections(value: unknown): TransferSelection[] {
    if (!Array.isArray(value) || value.length === 0 || value.length > TRANSFER_MAX_SELECTIONS) {
      throw this.bad('invalid_selection', 'باید بین ۱ تا ۵۰ رکورد مالک مجاز انتخاب شود.');
    }
    const seen = new Set<string>();
    return value.map((item) => {
      const obj = asRecord(item);
      if (!obj) throw this.bad('invalid_selection', 'رکورد انتخابشده نامعتبر است.');
      const keys = Object.keys(obj).sort();
      if (keys.length !== 2 || keys[0] !== 'owner_id' || keys[1] !== 'owner_type') {
        throw this.bad('unsupported_request_field', 'فیلدهای رکورد انتخابشده در قرارداد تعریف نشدهاند.');
      }
      if (!isTransferOwnerType(obj.owner_type) || !isUuid(obj.owner_id)) {
        throw this.bad('invalid_selection', 'نوع مالک یا شناسهٔ رکورد انتخابشده نامعتبر است.');
      }
      const key = `${obj.owner_type}:${String(obj.owner_id).toLowerCase()}`;
      if (seen.has(key)) throw this.bad('duplicate_selection', 'رکورد مالک تکراری انتخاب شده است.');
      seen.add(key);
      return { owner_type: obj.owner_type, owner_id: obj.owner_id };
    });
  }

  // ---------------- فهرست انواع و رکوردهای مجاز ----------------

  async ownerTypes(actor: TransferActor): Promise<{ items: TransferOwnerTypeOption[]; note_fa: string }> {
    await this.tenantTransaction(actor, (client) => this.assertPermissions(client, actor, ['attachment.view']), true);
    const items: TransferOwnerTypeOption[] = TRANSFER_OWNER_TYPES.map((ownerType) => ({
      owner_type: ownerType,
      label_fa: TRANSFER_OWNER_LABELS_FA[ownerType],
      module_path: TRANSFER_OWNER_MODULE_PATHS[ownerType],
      backend_supported: true,
      ui_module: ownerType === 'product'
        ? 'product_media'
        : ownerType === 'receipt' || ownerType === 'pod'
          ? 'backend_only'
          : 'operational_entity',
      note_fa: ownerType === 'product'
        ? 'نمای تصاویر و اسناد کالا (C1) حفظ شده و تکرار نشده است.'
        : ownerType === 'receipt' || ownerType === 'pod'
          ? 'مالکیت بکاند مصوب است؛ صفحهٔ اختصاصی کاربری برای مدیریت ضمائم این رکورد وجود ندارد.'
          : 'صفحهٔ عملیاتی موجود و پنل مشترک ضمائم C3 متصل است.',
    }));
    return { items, note_fa: TRANSFER_NOTE_FA };
  }

  async owners(
    actor: TransferActor,
    rawQuery: unknown,
  ): Promise<{ items: TransferOwnerRecord[]; note_fa: string }> {
    const query = this.assertQuery(rawQuery, ['entity_types', 'q', 'limit']);
    const entityTypes = this.parseOwnerTypes(query.entity_types);
    const q = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';
    const limit = query.limit == null ? 40 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw this.bad('invalid_limit', 'تعداد رکوردهای درخواستی نامعتبر است.');
    }
    return this.tenantTransaction(actor, async (client) => {
      await this.assertPermissions(client, actor, ['attachment.view']);
      if (entityTypes.includes('product')) {
        await this.assertPermissions(client, actor, ['master.product.view']);
      }
      const items: TransferOwnerRecord[] = [];
      for (const ownerType of entityTypes) {
        const base = OWNER_DISCOVERY_SQL[ownerType];
        // تنها فیلدهای ثابت/allowlist در SQL؛ q و limit پارامتربندیشدهاند.
        const sql = `with candidates as (${base})
          select c.owner_id, c.company_id, c.reference, c.title_fa,
                 (select count(*)::int from attachment a
                   where a.company_id = c.company_id::uuid
                     and a.owner_type = '${ownerType}'
                     and a.owner_id = c.owner_id::uuid) as attachment_count
            from candidates c
           where ($3::text = '' or concat_ws(' ', c.reference, c.title_fa, c.owner_id) ilike '%' || $3::text || '%')
           order by c.reference asc, c.owner_id asc
           limit $2::int`;
        const { rows } = await client.query<{
          owner_id: string; company_id: string; reference: string; title_fa: string; attachment_count: number;
        }>(sql, [actor.companyId, limit, q]);
        for (const row of rows) {
          if (row.company_id !== actor.companyId) continue; // افشای وجود رکورد شرکت دیگر ممنوع
          items.push({
            owner_type: ownerType,
            owner_id: row.owner_id,
            reference: row.reference ?? '—',
            title_fa: row.title_fa ?? '—',
            label_fa: TRANSFER_OWNER_LABELS_FA[ownerType],
            module_path: TRANSFER_OWNER_MODULE_PATHS[ownerType],
            attachment_count: Number(row.attachment_count) || 0,
          });
        }
      }
      return { items, note_fa: TRANSFER_NOTE_FA };
    }, true);
  }

  // ---------------- صدور ----------------

  private async assertOwnerInCompany(
    client: PoolClient,
    actor: TransferActor,
    ownerType: TransferOwnerType,
    ownerId: string,
  ): Promise<void> {
    const sql = ownerTenantSql(ownerType);
    if (!sql) throw new NotFoundException({ code: 'owner_not_found', message_fa: 'رکورد مالک یافت نشد.' });
    const { rows } = await client.query<{ company_id: string | null }>(sql, [ownerId]);
    const companyId = rows[0]?.company_id ?? null;
    if (!companyId || companyId !== actor.companyId) {
      // پاسخ یکسان برای «وجود ندارد» و «شرکت دیگر» ⇒ ضد enumerate.
      throw new NotFoundException({ code: 'owner_not_found', message_fa: 'رکورد مالک در شرکت شما یافت نشد.' });
    }
  }

  private async listAttachmentRows(
    client: PoolClient,
    actor: TransferActor,
    selection: TransferSelection,
  ): Promise<AttachmentRowForTransfer[]> {
    const { rows } = await client.query<AttachmentRowForTransfer>(
      `select id::text, owner_type, owner_id::text, file_name, content_type,
              size_bytes::int, sha256, storage_key, created_at::text
         from attachment
        where company_id = $1::uuid and owner_type = $2 and owner_id = $3::uuid
        order by created_at asc, id asc`,
      [actor.companyId, selection.owner_type, selection.owner_id],
    );
    return rows;
  }

  async exportPreview(
    actor: TransferActor,
    rawBody: unknown,
    meta: RequestMeta,
  ): Promise<TransferExportPreview> {
    const operationId = randomUUID();
    const body = this.assertClientPayload(rawBody, ['selections']);
    const selections = this.parseSelections(body.selections);
    const entityTypes = [...new Set(selections.map((s) => s.owner_type))].sort();
    try {
      const createdAt = iso(new Date());
      const built = await this.tenantTransaction(actor, async (client) => {
        await this.assertPermissions(client, actor, ['attachment.view']);
        if (entityTypes.includes('product')) {
          await this.assertPermissions(client, actor, ['master.product.view']);
        }
        const fileInputs: { attachment_id: string; owner_type: TransferOwnerType; owner_id: string; file_name: string; content_type: string; bytes: Buffer }[] = [];
        const rejected: TransferRejectedFile[] = [];
        for (const selection of selections) {
          await this.assertOwnerInCompany(client, actor, selection.owner_type, selection.owner_id);
          const rows = await this.listAttachmentRows(client, actor, selection);
          for (const row of rows) {
            const rejection = (code: string, messageFa: string): void => {
              rejected.push({
                owner_type: selection.owner_type,
                owner_id: selection.owner_id,
                attachment_id: row.id,
                file_name: row.file_name,
                reason_code: code,
                message_fa: messageFa,
              });
            };
            if (
              typeof row.file_name !== 'string' ||
              Number(row.size_bytes) <= 0 ||
              Number(row.size_bytes) > TRANSFER_MAX_SINGLE_FILE_BYTES ||
              typeof row.sha256 !== 'string' ||
              !/^[0-9a-f]{64}$/i.test(row.sha256)
            ) {
              rejection('invalid_attachment_metadata', 'فرادادهٔ ضمیمه برای بسته نامعتبر است.');
              continue;
            }
            if (fileInputs.length >= TRANSFER_MAX_FILES) {
              throw new TransferPackageError('too_many_entries', 'تعداد فایلهای صدور بیش از سقف مجاز است.');
            }
            let bytes: Buffer;
            try {
              bytes = await this.storage.get(row.storage_key, TRANSFER_MAX_SINGLE_FILE_BYTES);
            } catch (err) {
              throw new ServiceUnavailableException({
                code: 'storage_read_failed',
                message_fa: 'خواندن یکی از ضمائم ممکن نشد؛ بستهٔ ناقصی ساخته نشد.',
              });
            }
            try {
              // محتوا، پسوند، SHA-256 و سقف حجم دوباره از روی بایتهای واقعی سنجیده میشود.
              const { validateTransferBytes } = await import('./attachment-transfer.rules');
              validateTransferBytes(bytes, row.content_type, row.file_name, row.sha256);
              fileInputs.push({
                attachment_id: row.id,
                owner_type: selection.owner_type,
                owner_id: selection.owner_id,
                file_name: row.file_name,
                content_type: row.content_type,
                bytes,
              });
            } catch (err) {
              const safe = this.safeFailure(err);
              rejection(safe.code, safe.message_fa);
            }
          }
        }
        if (fileInputs.length === 0) {
          await this.recordAudit(client, actor, operationId, 'attachment_transfer.export', {
            operation_id: operationId,
            operation_type: 'export',
            phase: 'execution',
            execution_status: 'completed',
            created_at: createdAt,
            completed_at: createdAt,
            entity_types: entityTypes,
            selections,
            file_count: 0,
            total_bytes: 0,
            estimated_package_size_bytes: 0,
            rejected_count: rejected.length,
            rejected_files: rejected,
            manifest: null,
            checksums: null,
            counts: { accepted: 0, rejected: rejected.length, duplicate: 0, unresolved: 0 },
            safe_failure: null,
          }, meta);
          return { pkg: null as BuiltTransferPackage | null, rejected };
        }
        const pkg = buildTransferPackage({ operationId, createdAt, files: fileInputs });
        await this.recordAudit(client, actor, operationId, 'attachment_transfer.export', {
          operation_id: operationId,
          operation_type: 'export',
          phase: 'execution',
          execution_status: 'completed',
          created_at: createdAt,
          completed_at: createdAt,
          entity_types: entityTypes,
          selections,
          file_count: pkg.manifest.file_count,
          total_bytes: pkg.totalBytes,
          estimated_package_size_bytes: pkg.estimatedPackageSize,
          rejected_count: rejected.length,
          rejected_files: rejected,
          manifest: pkg.manifest,
          checksums: pkg.checksums,
          counts: { accepted: pkg.manifest.file_count, rejected: rejected.length, duplicate: 0, unresolved: 0 },
          safe_failure: null,
        }, meta);
        return { pkg, rejected };
      });
      return {
        operation_id: operationId,
        operation_type: 'export',
        phase: 'preview',
        execution_status: 'completed',
        created_at: createdAt,
        expires_at: iso(Date.now() + TRANSFER_PREVIEW_TTL_MS),
        entity_types: entityTypes,
        selections,
        file_count: built.pkg?.manifest.file_count ?? 0,
        total_bytes: built.pkg?.totalBytes ?? 0,
        estimated_package_size_bytes: built.pkg?.estimatedPackageSize ?? 0,
        rejected_count: built.rejected.length,
        rejected_files: built.rejected,
        manifest: built.pkg ? { ...built.pkg.manifest, checksums: built.pkg.checksums } : null,
        downloads_available: Boolean(built.pkg),
        note_fa: TRANSFER_NOTE_FA,
      };
    } catch (err) {
      await this.recordFailure(actor, operationId, 'export', this.safeFailure(err), meta);
      this.httpFailure(err);
    }
  }

  private manifestView(manifest: unknown, checksums: unknown): TransferManifestView | null {
    const m = asRecord(manifest);
    const c = asRecord(checksums);
    if (!m || !c) return null;
    this.assertSafeAuditValue(m);
    this.assertSafeAuditValue(c);
    return { ...(m as unknown as TransferManifest), checksums: c as unknown as TransferManifestView['checksums'] };
  }

  async exportPackage(
    actor: TransferActor,
    operationId: string,
    meta: RequestMeta,
  ): Promise<{ zip: Buffer; filename: string; packageSha256: string; size: number }> {
    if (!isUuid(operationId)) throw new NotFoundException({ code: 'operation_not_found', message_fa: 'عملیات یافت نشد.' });
    try {
      return await this.tenantTransaction(actor, async (client) => {
        await this.assertPermissions(client, actor, ['attachment.view']);
        const { rows } = await client.query<{ after_data: unknown }>(
          `select after_data from audit_log
            where company_id = $1::uuid and entity_type = $2 and entity_id = $3::uuid
              and action = 'attachment_transfer.export'
            order by id desc limit 1`,
          [actor.companyId, TRANSFER_AUDIT_ENTITY_TYPE, operationId],
        );
        const after = asRecord(rows[0]?.after_data);
        if (!after || after.operation_type !== 'export' || after.operation_id !== operationId) {
          throw new NotFoundException({ code: 'operation_not_found', message_fa: 'عملیات صدور یافت نشد.' });
        }
        this.assertSafeAuditValue(after);
        const entityTypes = asStringArray(after.entity_types);
        if (entityTypes.includes('product')) {
          await this.assertPermissions(client, actor, ['master.product.view']);
        }
        const manifest = asRecord(after.manifest);
        const checksums = asRecord(after.checksums);
        if (!manifest || !checksums || manifest.operation_id !== operationId || manifest.schema !== TRANSFER_SCHEMA) {
          throw new ConflictException({ code: 'package_manifest_missing', message_fa: 'manifest عملیات صدور یافت نشد.' });
        }
        this.assertSafeAuditValue(manifest);
        this.assertSafeAuditValue(checksums);
        const files = Array.isArray(manifest.files) ? manifest.files : [];
        if (files.length === 0 || files.length > TRANSFER_MAX_FILES) {
          throw new ConflictException({ code: 'package_manifest_missing', message_fa: 'فایلهای manifest نامعتبراند.' });
        }
        const createdAt = asString(manifest.created_at);
        const fileInputs: { attachment_id: string; owner_type: TransferOwnerType; owner_id: string; file_name: string; content_type: string; bytes: Buffer }[] = [];
        for (const raw of files) {
          const f = asRecord(raw);
          if (!f || !isTransferOwnerType(f.owner_type) || !isUuid(f.attachment_id) || !isUuid(f.owner_id)) {
            throw new ConflictException({ code: 'package_manifest_missing', message_fa: 'مرجع مالک manifest نامعتبر است.' });
          }
          await this.assertOwnerInCompany(client, actor, f.owner_type, f.owner_id);
          const { rows: attachmentRows } = await client.query<AttachmentRowForTransfer>(
            `select id::text, owner_type, owner_id::text, file_name, content_type,
                    size_bytes::int, sha256, storage_key, created_at::text
               from attachment
              where company_id = $1::uuid and id = $2::uuid
                and owner_type = $3 and owner_id = $4::uuid`,
            [actor.companyId, f.attachment_id, f.owner_type, f.owner_id],
          );
          const row = attachmentRows[0];
          if (!row || row.file_name !== f.file_name || row.content_type !== f.content_type ||
              Number(row.size_bytes) !== Number(f.size_bytes) || row.sha256 !== String(f.sha256).toLowerCase()) {
            throw new ConflictException({ code: 'package_integrity_changed', message_fa: 'فرادادهٔ ضمیمه از زمان صدور تغییر کرده است.' });
          }
          let bytes: Buffer;
          try {
            bytes = await this.storage.get(row.storage_key, TRANSFER_MAX_SINGLE_FILE_BYTES);
          } catch {
            throw new ServiceUnavailableException({
              code: 'storage_read_failed',
              message_fa: 'بازسازی بسته از ذخیرهسازی ممکن نشد؛ هیچ بستهٔ ناقصی تحویل نشد.',
            });
          }
          if (sha256Hex(bytes) !== row.sha256) {
            throw new ConflictException({ code: 'package_integrity_changed', message_fa: 'محتوای ضمیمه از زمان صدور تغییر کرده است.' });
          }
          fileInputs.push({
            attachment_id: row.id,
            owner_type: f.owner_type,
            owner_id: f.owner_id,
            file_name: row.file_name,
            content_type: row.content_type,
            bytes,
          });
        }
        const rebuilt = buildTransferPackage({ operationId, createdAt, files: fileInputs });
        const inspection = inspectTransferPackage(rebuilt.zip);
        if (
          inspection.packageSha256 !== String(checksums.package_sha256).toLowerCase() ||
          inspection.manifestSha256 !== String(checksums.manifest_sha256).toLowerCase() ||
          manifestSha256(rebuilt.manifest) !== manifestSha256(manifest as unknown as TransferManifest)
        ) {
          throw new ConflictException({ code: 'package_integrity_changed', message_fa: 'امضای بسته با سابقهٔ صدور همخوانی ندارد.' });
        }
        await this.recordAudit(client, actor, operationId, 'attachment_transfer.download', {
          operation_id: operationId,
          operation_type: 'export',
          phase: 'download',
          execution_status: 'completed',
          file_count: rebuilt.manifest.file_count,
          total_bytes: rebuilt.totalBytes,
          package_sha256: rebuilt.packageSha256,
          manifest_sha256: rebuilt.manifestSha256,
          entity_types: entityTypes,
          counts: { accepted: rebuilt.manifest.file_count, rejected: 0, duplicate: 0, unresolved: 0 },
          safe_failure: null,
        }, meta);
        return {
          zip: rebuilt.zip,
          filename: `attachments-${operationId.slice(0, 8)}.zip`,
          packageSha256: rebuilt.packageSha256,
          size: rebuilt.zip.length,
        };
      });
    } catch (err) {
      await this.recordFailure(actor, operationId, 'export', this.safeFailure(err), meta);
      this.httpFailure(err);
    }
  }

  // ---------------- ورود و پیشنمایش امن ----------------

  private approvalStatus(
    actor: TransferActor,
    packageSha: string,
    mappingSha: string,
    previewSha: string,
    invalidated: boolean,
  ): TransferImportPreview['approval'] {
    const fields = fingerprintFieldsFor(TRANSFER_APPROVAL_OPERATION);
    return {
      status: 'blocked',
      reason_code: 'approval_policy_missing',
      message_fa: TRANSFER_EXECUTION_BLOCKED_FA,
      operation: TRANSFER_APPROVAL_OPERATION,
      mechanism: 'RulesEngineService.submitForApproval → approval_policy → approval_binding → consumeApprovedBinding',
      fingerprint_supported: fields.length > 0,
      required_dependency_fa:
        'برای فعالسازی اجرا، تصمیم و امضای مصوب مالک برای افزودن عملیات، فیلدهای اثرانگشت دقیق بسته/نگاشت، ' +
        'سیاست ترکیب تأیید، موجودیت قابلقفل و آزمون دونفره لازم است. هیچیک ساخته یا حدس زده نشده است.',
      initiator_user_id: actor.userId,
      approver_user_id: null,
      approved_at: null,
      approved_package_sha256: null,
      approved_mapping_sha256: null,
      approved_preview_sha256: null,
      current_package_sha256: packageSha,
      current_mapping_sha256: mappingSha,
      current_preview_sha256: previewSha,
      approval_invalidated: invalidated,
      self_approval_forbidden: true,
    };
  }

  private mappingHash(manifest: TransferManifest, overrides: readonly TransferMappingOverride[]): string {
    const canonical = manifest.files.map((f) => ({
      path: f.path,
      owner_type: f.owner_type,
      owner_id: overrides.find((o) => o.path === f.path)?.owner_id ?? f.owner_id,
    }));
    return sha256Hex(Buffer.from(canonicalJson(canonical), 'utf8'));
  }

  private previewHash(packageSha: string, mappingSha: string, items: readonly TransferPreviewItem[]): string {
    return sha256Hex(Buffer.from(canonicalJson({ package_sha256: packageSha, mapping_sha256: mappingSha, items }), 'utf8'));
  }

  private parseOverrides(value: unknown, manifest: TransferManifest): TransferMappingOverride[] {
    if (value == null) return [];
    if (!Array.isArray(value) || value.length > manifest.files.length) {
      throw this.bad('invalid_mapping_overrides', 'نگاشتهای ارسالی نامعتبراند.');
    }
    const paths = new Set(manifest.files.map((f) => f.path));
    const seen = new Set<string>();
    return value.map((item) => {
      const obj = asRecord(item);
      if (!obj) throw this.bad('invalid_mapping_overrides', 'نگاشت ارسالی نامعتبر است.');
      const keys = Object.keys(obj).sort();
      if (keys.length !== 2 || keys[0] !== 'owner_id' || keys[1] !== 'path') {
        throw this.bad('unsupported_request_field', 'فقط path و owner_id در نگاشت مجازاند.');
      }
      if (typeof obj.path !== 'string' || !paths.has(obj.path) || seen.has(obj.path)) {
        throw this.bad('invalid_mapping_path', 'مسیر نگاشت نامعتبر یا تکراری است.');
      }
      seen.add(obj.path);
      if (!isUuid(obj.owner_id)) {
        throw this.bad('invalid_mapping_owner_id', 'شناسهٔ مالک نگاشت معتبر نیست.');
      }
      return { path: obj.path, owner_id: obj.owner_id };
    });
  }

  private async evaluateImport(
    client: PoolClient,
    actor: TransferActor,
    inspection: TransferPackageInspection,
    overrides: readonly TransferMappingOverride[],
  ): Promise<TransferPreviewItem[]> {
    const items: TransferPreviewItem[] = [];
    const inPackage = new Set<string>();
    for (const f of inspection.manifest.files) {
      const ownerId = overrides.find((o) => o.path === f.path)?.owner_id ?? f.owner_id;
      const base = {
        path: f.path,
        attachment_id: f.attachment_id,
        owner_type: f.owner_type,
        owner_id: ownerId,
        file_name: f.file_name,
        content_type: f.content_type,
        size_bytes: f.size_bytes,
        sha256: f.sha256,
      };
      const conflictKey = `${f.owner_type}:${ownerId}:${f.sha256}:${f.file_name.toLowerCase()}`;
      // وجود همان شناسهٔ ضمیمه = جلوگیری از بازنویسی؛ وجود همان محتوا/نام/مالک = تکراری.
      const { rows: existing } = await client.query<{ id: string }>(
        `select id::text from attachment
          where company_id = $1::uuid
            and (id = $2::uuid
                 or (owner_type = $3 and owner_id = $4::uuid and sha256 = $5
                     and lower(file_name) = lower($6)))
          limit 1`,
        [actor.companyId, f.attachment_id, f.owner_type, ownerId, f.sha256, f.file_name],
      );
      // رکورد مالک باید ازپیش موجود و دقیقاً متعلق به همین شرکت باشد.
      const ownerSql = ownerTenantSql(f.owner_type);
      const ownerResult = ownerSql
        ? await client.query<{ company_id: string | null }>(ownerSql, [ownerId])
        : { rows: [] as { company_id: string | null }[] };
      const ownerCompany = ownerResult.rows[0]?.company_id ?? null;
      let status: TransferPreviewItem['status'] = 'accepted';
      let reasonCode = 'accepted';
      let messageFa = 'فایل از نظر یکپارچگی و مالکیت قابل بررسی است.';
      if (!ownerCompany) {
        status = 'unresolved';
        reasonCode = 'owner_not_found';
        messageFa = 'رکورد مالک در شرکت شما یافت نشد؛ هیچ رکورد تازهای ساخته نمیشود.';
      } else if (ownerCompany !== actor.companyId) {
        status = 'rejected';
        reasonCode = 'owner_scope_rejected';
        messageFa = 'نگاشت به مالک خارج از شرکت نشست مجاز نیست.';
      } else if (existing.length > 0) {
        status = 'duplicate';
        reasonCode = 'duplicate_attachment';
        messageFa = 'ضمیمهٔ همسان یا شناسهٔ تکراری وجود دارد؛ بازنویسی انجام نمیشود.';
      } else if (inPackage.has(conflictKey)) {
        status = 'duplicate';
        reasonCode = 'duplicate_in_package';
        messageFa = 'این فایل در خود بسته تکراری است.';
      }
      inPackage.add(conflictKey);
      items.push({ ...base, status, reason_code: reasonCode, message_fa: messageFa });
    }
    return items;
  }

  private buildImportPreview(
    actor: TransferActor,
    operationId: string,
    createdAt: string,
    inspection: TransferPackageInspection,
    overrides: TransferMappingOverride[],
    items: TransferPreviewItem[],
    version: number,
    phase: 'preview' | 'approval',
    invalidated: boolean,
  ): TransferImportPreview {
    const mappingSha = this.mappingHash(inspection.manifest, overrides);
    const previewSha = this.previewHash(inspection.packageSha256, mappingSha, items);
    const entityTypes = [...new Set(inspection.manifest.files.map((f) => f.owner_type))].sort();
    return {
      operation_id: operationId,
      operation_type: 'import',
      phase,
      execution_status: 'blocked',
      status: 'approval_blocked',
      created_at: createdAt,
      expires_at: iso(Date.now() + TRANSFER_PREVIEW_TTL_MS),
      version,
      entity_types: entityTypes,
      file_count: inspection.manifest.file_count,
      total_bytes: inspection.totalBytes,
      package_sha256: inspection.packageSha256,
      manifest_sha256: inspection.manifestSha256,
      mapping_sha256: mappingSha,
      preview_sha256: previewSha,
      items,
      counts: statusCounts(items),
      manifest: { ...inspection.manifest, checksums: inspection.checksums },
      approval: this.approvalStatus(actor, inspection.packageSha256, mappingSha, previewSha, invalidated),
      execution: {
        allowed: false,
        reason_code: 'approval_policy_missing',
        message_fa: TRANSFER_EXECUTION_BLOCKED_FA,
      },
      note_fa: TRANSFER_NOTE_FA,
    };
  }

  async importPreview(
    actor: TransferActor,
    file: { buffer?: Buffer; mimetype?: string; originalname?: string; size?: number } | undefined,
    rawBody: unknown,
    meta: RequestMeta,
  ): Promise<TransferImportPreview> {
    const operationId = randomUUID();
    const body = this.assertClientPayload(rawBody ?? {}, []);
    void body; // فقط file مجاز است؛ فیلد متنی اضافی صریحاً رد شد.
    if (!file?.buffer || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw this.bad('package_required', 'فایل بستهٔ ZIP الزامی است.');
    }
    if (file.buffer.length > TRANSFER_MAX_PACKAGE_BYTES) {
      throw this.bad('invalid_package_size', 'حجم بسته بیش از سقف مجاز است.');
    }
    if (file.mimetype && !['application/zip', 'application/x-zip-compressed', 'application/octet-stream'].includes(file.mimetype)) {
      throw this.bad('unsupported_package_type', 'فایل بارگذاریشده باید بستهٔ ZIP باشد.');
    }
    if (file.originalname && !/\.zip$/i.test(file.originalname)) {
      throw this.bad('extension_mismatch', 'پسوند بسته باید zip باشد.');
    }
    try {
      const inspection = inspectTransferPackage(file.buffer);
      const createdAt = iso(new Date());
      // ارزیابی و ممیزی پیشنمایش در همان تراکنش تا هیچ پیشنمایش بیممیزی ثبت نشود.
      const { items, preview } = await this.tenantTransaction(actor, async (client) => {
        await this.assertPermissions(client, actor, ['attachment.view', 'attachment.upload']);
        if (inspection.manifest.entity_types.includes('product')) {
          await this.assertPermissions(client, actor, ['master.product.view']);
        }
        const evaluated = await this.evaluateImport(client, actor, inspection, []);
        const result = this.buildImportPreview(actor, operationId, createdAt, inspection, [], evaluated, 1, 'preview', false);
        await this.recordAudit(client, actor, operationId, 'attachment_transfer.preview', {
          operation_id: operationId,
          operation_type: 'import',
          phase: 'preview',
          execution_status: 'blocked',
          status: 'approval_blocked',
          created_at: createdAt,
          entity_types: result.entity_types,
          file_count: result.file_count,
          total_bytes: result.total_bytes,
          manifest: inspection.manifest,
          checksums: inspection.checksums,
          package_sha256: inspection.packageSha256,
          manifest_sha256: inspection.manifestSha256,
          mapping_sha256: result.mapping_sha256,
          preview_sha256: result.preview_sha256,
          counts: result.counts,
          items: result.items,
          approver_user_id: null,
          approval_status: 'blocked',
          safe_failure: null,
        }, meta);
        return { items: evaluated, preview: result };
      });
      this.prunePreviews();
      this.previews.set(operationId, {
        operationId,
        companyId: actor.companyId,
        initiatorUserId: actor.userId,
        createdAt,
        expiresAtMs: Date.now() + TRANSFER_PREVIEW_TTL_MS,
        version: 1,
        manifest: inspection.manifest,
        inspection,
        overrides: [],
        items,
        mappingSha256: preview.mapping_sha256,
        previewSha256: preview.preview_sha256,
        preview,
        status: 'approval_blocked',
      });
      return preview;
    } catch (err) {
      await this.recordFailure(actor, operationId, 'import', this.safeFailure(err), meta);
      this.httpFailure(err);
    }
  }

  private prunePreviews(): void {
    const now = Date.now();
    for (const [id, state] of this.previews) {
      if (state.expiresAtMs <= now || state.status === 'cancelled') this.previews.delete(id);
    }
    // سقف حافظه؛ پیشنمایشها پایدار و سیاست نگهداشت نیستند.
    while (this.previews.size > 24) {
      const oldest = this.previews.keys().next().value;
      if (oldest === undefined) break;
      this.previews.delete(oldest);
    }
  }

  private getPreview(actor: TransferActor, operationId: string): ImportPreviewState {
    if (!isUuid(operationId)) throw new NotFoundException({ code: 'operation_not_found', message_fa: 'عملیات یافت نشد.' });
    this.prunePreviews();
    const state = this.previews.get(operationId);
    if (
      !state ||
      state.companyId !== actor.companyId ||
      state.initiatorUserId !== actor.userId ||
      state.status === 'cancelled' ||
      state.expiresAtMs <= Date.now()
    ) {
      throw new NotFoundException({
        code: 'preview_expired',
        message_fa: 'پیشنمایش یافت نشد یا منقضی شده است؛ بسته را دوباره بارگذاری کنید.',
      });
    }
    return state;
  }

  async importStatus(actor: TransferActor, operationId: string): Promise<TransferImportPreview> {
    await this.tenantTransaction(actor, (client) => this.assertPermissions(client, actor, ['attachment.view']), true);
    return this.getPreview(actor, operationId).preview;
  }

  async updateMappings(
    actor: TransferActor,
    operationId: string,
    rawBody: unknown,
    meta: RequestMeta,
  ): Promise<TransferImportPreview> {
    const state = this.getPreview(actor, operationId);
    const body = this.assertClientPayload(rawBody, ['mapping_overrides']);
    const overrides = this.parseOverrides(body.mapping_overrides, state.manifest);
    const oldHash = state.mappingSha256;
    const newHash = this.mappingHash(state.manifest, overrides);
    if (oldHash === newHash) return state.preview;
    try {
      const version = state.version + 1;
      // نگاشت تازه و ابطال تأیید پیشین در همان تراکنش ممیزی میشوند.
      const { items, preview } = await this.tenantTransaction(actor, async (client) => {
        await this.assertPermissions(client, actor, ['attachment.view', 'attachment.upload']);
        if (state.inspection.manifest.entity_types.includes('product')) {
          await this.assertPermissions(client, actor, ['master.product.view']);
        }
        const evaluated = await this.evaluateImport(client, actor, state.inspection, overrides);
        const result = this.buildImportPreview(
          actor, operationId, state.createdAt, state.inspection, overrides, evaluated, version, 'approval', true,
        );
        await this.recordAudit(client, actor, operationId, 'attachment_transfer.approval', {
          operation_id: operationId,
          operation_type: 'import',
          phase: 'approval',
          execution_status: 'blocked',
          status: 'approval_blocked',
          version,
          entity_types: result.entity_types,
          manifest: state.manifest,
          checksums: state.inspection.checksums,
          package_sha256: state.inspection.packageSha256,
          manifest_sha256: state.inspection.manifestSha256,
          mapping_sha256: result.mapping_sha256,
          previous_mapping_sha256: oldHash,
          preview_sha256: result.preview_sha256,
          counts: result.counts,
          items: result.items,
          approver_user_id: null,
          approval_status: 'blocked',
          approval_invalidated: true,
          safe_failure: null,
        }, meta);
        return { items: evaluated, preview: result };
      });
      this.previews.set(operationId, {
        ...state,
        version,
        overrides,
        items,
        mappingSha256: preview.mapping_sha256,
        previewSha256: preview.preview_sha256,
        preview,
        expiresAtMs: Date.now() + TRANSFER_PREVIEW_TTL_MS,
      });
      return preview;
    } catch (err) {
      await this.recordFailure(actor, operationId, 'import', this.safeFailure(err), meta);
      this.httpFailure(err);
    }
  }

  /** تلاش اجرا: همیشه fail-closed؛ هیچ درج/بهروزرسانی/حذف attachment انجام نمیشود. */
  async execute(
    actor: TransferActor,
    operationId: string,
    rawBody: unknown,
    meta: RequestMeta,
  ): Promise<never> {
    this.assertClientPayload(rawBody ?? {}, []);
    const state = this.getPreview(actor, operationId);
    const binding: TransferApprovalBindingInput = {
      initiatorUserId: state.initiatorUserId,
      approverUserId: state.preview.approval.approver_user_id,
      approvedPackageSha256: state.preview.approval.approved_package_sha256,
      approvedMappingSha256: state.preview.approval.approved_mapping_sha256,
      approvedPreviewSha256: state.preview.approval.approved_preview_sha256,
      currentPackageSha256: state.preview.package_sha256,
      currentMappingSha256: state.preview.mapping_sha256,
      currentPreviewSha256: state.preview.preview_sha256,
      approvedAt: state.preview.approval.approved_at,
      expiresAt: state.preview.expires_at,
    };
    const check = validateTwoPersonApprovalBinding(binding);
    const safe: SafeFailure = check.ok === false
      ? { code: check.code, message_fa: check.message_fa }
      : { code: 'approval_policy_missing', message_fa: TRANSFER_EXECUTION_BLOCKED_FA };
    await this.tenantTransaction(actor, async (client) => {
      await this.assertPermissions(client, actor, ['attachment.view', 'attachment.upload']);
      await this.recordAudit(client, actor, operationId, 'attachment_transfer.execution', {
        operation_id: operationId,
        operation_type: 'import',
        phase: 'execution',
        execution_status: 'blocked',
        version: state.version,
        package_sha256: state.preview.package_sha256,
        mapping_sha256: state.preview.mapping_sha256,
        preview_sha256: state.preview.preview_sha256,
        entity_types: state.preview.entity_types,
        counts: state.preview.counts,
        file_count: state.preview.file_count,
        approver_user_id: null,
        approval_status: 'blocked',
        safe_failure: safe,
      }, meta);
    });
    throw new ConflictException({ code: safe.code, message_fa: safe.message_fa });
  }

  async cancel(
    actor: TransferActor,
    operationId: string,
    rawBody: unknown,
    meta: RequestMeta,
  ): Promise<{ operation_id: string; status: 'cancelled'; note_fa: string }> {
    this.assertClientPayload(rawBody ?? {}, []);
    const state = this.getPreview(actor, operationId);
    await this.tenantTransaction(actor, async (client) => {
      await this.assertPermissions(client, actor, ['attachment.view', 'attachment.upload']);
      await this.recordAudit(client, actor, operationId, 'attachment_transfer.cancellation', {
        operation_id: operationId,
        operation_type: 'import',
        phase: 'cancellation',
        execution_status: 'cancelled',
        version: state.version,
        package_sha256: state.preview.package_sha256,
        mapping_sha256: state.preview.mapping_sha256,
        entity_types: state.preview.entity_types,
        counts: state.preview.counts,
        file_count: state.preview.file_count,
        approver_user_id: null,
        safe_failure: null,
      }, meta);
    });
    // فقط ابطال پیشنمایش حافظه؛ هیچ حذف، بایگانی یا پاکسازی فیزیکهای انجام نمیشود.
    this.previews.delete(operationId);
    return {
      operation_id: operationId,
      status: 'cancelled',
      note_fa: 'پیشنمایش لغو شد؛ سابقهٔ ممیزی حفظ شد و هیچ فایل یا رکوردی حذف نشد.',
    };
  }

  // ---------------- تاریخچه و ممیزی ----------------

  private parseAfterData(value: unknown): Record<string, unknown> {
    if (typeof value === 'string') {
      try { return asRecord(JSON.parse(value)) ?? {}; } catch { return {}; }
    }
    return asRecord(value) ?? {};
  }

  private historyItemFromEvents(operationId: string, events: readonly AuditEventRow[]): TransferHistoryItem | null {
    if (events.length === 0) return null;
    const ordered = [...events].sort((a, b) => Number(a.id) - Number(b.id));
    const parsed = ordered.map((e) => ({ event: e, after: this.parseAfterData(e.after_data) }));
    const first = parsed[0]!;
    const last = parsed[parsed.length - 1]!;
    const initiator = first.event.actor_user_id;
    const initiatorLabel = first.event.actor_label ?? (initiator ? `کاربر ${initiator.slice(0, 8)}…` : '—');
    const status = asString(last.after.execution_status, 'unknown');
    const failureEntry = [...parsed].reverse().find((p) => p.after.safe_failure)?.after.safe_failure;
    const failureRecord = asRecord(failureEntry);
    const safeFailure = failureRecord && asString(failureRecord.code) && asString(failureRecord.message_fa)
      ? { code: asString(failureRecord.code), message_fa: asString(failureRecord.message_fa) }
      : null;
    const manifestRecord = asRecord(last.after.manifest);
    const checksums = asRecord(last.after.checksums);
    const entityTypes = asStringArray(last.after.entity_types)
      .filter(isTransferOwnerType)
      .sort();
    const counts = asRecord(last.after.counts) ?? {};
    const auditEvents: TransferAuditEvent[] = parsed.map(({ event, after }) => {
      const f = asRecord(after.safe_failure);
      return {
        event_id: String(event.id),
        action: event.action,
        phase: (asString(after.phase) || 'preview') as TransferAuditEvent['phase'],
        status: asString(after.execution_status) || asString(after.status) || 'unknown',
        at: iso(event.at),
        actor_user_id: event.actor_user_id,
        actor_label: event.actor_label ?? null,
        safe_failure: f && asString(f.code) && asString(f.message_fa)
          ? { code: asString(f.code), message_fa: asString(f.message_fa) }
          : null,
      };
    });
    return {
      operation_id: operationId,
      operation_type: asString(last.after.operation_type) === 'import' ? 'import' : 'export',
      phase: asString(last.after.phase, 'unknown'),
      execution_status: status,
      initiator_user_id: initiator,
      initiator_label: initiatorLabel,
      approver_user_id: null,
      approver_label: '—',
      package_schema: asString(manifestRecord?.schema) || asString(last.after.package_schema) || null,
      package_sha256: asString(checksums?.package_sha256) || asString(last.after.package_sha256) || null,
      manifest_sha256: asString(checksums?.manifest_sha256) || asString(last.after.manifest_sha256) || null,
      total_bytes: asNumber(last.after.total_bytes),
      estimated_package_size_bytes: asNumber(last.after.estimated_package_size_bytes),
      entity_types: entityTypes,
      file_count: asNumber(last.after.file_count),
      accepted_count: asNumber(counts.accepted),
      rejected_count: asNumber(counts.rejected),
      duplicate_count: asNumber(counts.duplicate),
      unresolved_count: asNumber(counts.unresolved),
      created_at: iso(first.event.at),
      completed_at: TERMINAL_STATUSES.has(status) ? iso(last.event.at) : null,
      safe_failure: safeFailure,
      events: auditEvents,
    };
  }

  private async loadHistoryRows(actor: TransferActor, operationId?: string): Promise<TransferHistoryItem[]> {
    return this.tenantTransaction(actor, async (client) => {
      await this.assertPermissions(client, actor, ['attachment.view']);
      const { rows } = await client.query<AuditEventRow>(
        `select a.id::text as id, a.entity_id::text as entity_id, a.action, a.at::text as at,
                a.actor_user_id::text as actor_user_id, a.after_data,
                nullif(trim(concat_ws(' ', p.first_name, p.last_name, p.legal_name, u.username)), '') as actor_label
           from audit_log a
           left join app_user u on u.id = a.actor_user_id
           left join person p on p.id = u.person_id and p.company_id = $1::uuid
          where a.company_id = $1::uuid and a.entity_type = $2
            and ($3::uuid is null or a.entity_id = $3::uuid)
            and a.action like 'attachment_transfer.%'
          order by a.at asc, a.id asc
          limit 2000`,
        [actor.companyId, TRANSFER_AUDIT_ENTITY_TYPE, operationId ?? null],
      );
      const byOperation = new Map<string, AuditEventRow[]>();
      for (const row of rows) {
        const list = byOperation.get(row.entity_id) ?? [];
        list.push(row);
        byOperation.set(row.entity_id, list);
      }
      return [...byOperation.entries()]
        .map(([id, events]) => this.historyItemFromEvents(id, events))
        .filter((item): item is TransferHistoryItem => item !== null)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 200);
    }, true);
  }

  async history(actor: TransferActor, rawQuery: unknown): Promise<{ items: TransferHistoryItem[]; note_fa: string }> {
    const query = this.assertQuery(rawQuery, ['limit']);
    const limit = query.limit == null ? 100 : Number(query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      throw this.bad('invalid_limit', 'تعداد رکوردهای تاریخچه نامعتبر است.');
    }
    const items = (await this.loadHistoryRows(actor)).slice(0, limit);
    return {
      items,
      note_fa: 'تاریخچه از audit_log تراکنشی همان شرکت خوانده میشود؛ کلید استوریج، URL امضاشده، توکن و جزئیات زیرساخت نمایش داده نمیشود.',
    };
  }

  async operationDetail(actor: TransferActor, operationId: string): Promise<TransferOperationDetail> {
    if (!isUuid(operationId)) throw new NotFoundException({ code: 'operation_not_found', message_fa: 'عملیات یافت نشد.' });
    const items = await this.loadHistoryRows(actor, operationId);
    const item = items.find((i) => i.operation_id === operationId);
    if (!item) throw new NotFoundException({ code: 'operation_not_found', message_fa: 'عملیات یافت نشد.' });
    let manifest: TransferManifestView | null = null;
    const rows = await this.tenantTransaction(actor, async (client) => {
      const result = await client.query<{ after_data: unknown }>(
        `select after_data from audit_log
          where company_id = $1::uuid and entity_type = $2 and entity_id = $3::uuid
            and (action = 'attachment_transfer.export' or action = 'attachment_transfer.preview')
          order by id desc limit 1`,
        [actor.companyId, TRANSFER_AUDIT_ENTITY_TYPE, operationId],
      );
      return result.rows;
    }, true);
    const after = asRecord(rows[0]?.after_data);
    if (after) {
      this.assertSafeAuditValue(after);
      manifest = this.manifestView(after.manifest, after.checksums);
    }
    return { ...item, manifest, note_fa: TRANSFER_NOTE_FA };
  }
}
