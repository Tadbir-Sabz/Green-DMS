import {
  BadRequestException,
  ConflictException,
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type { RequestMeta } from '../../common/request-meta';
import { AUDIT_SERVICE, type AuditService } from '../../common/audit.service';
import type { Runner } from '../../common/transaction';
import type { AuthContext } from '../identity-rbac/auth-context.decorator';
import { permissionMatches } from '../identity-rbac/permissions';
import { CatalogAccess, catalogTransaction } from './catalog-access.service';
import { PRODUCT_REPOSITORY } from './tokens';
import type { ProductRepository, ProductRow } from './product.repository';
import type { UpdateProductDto } from './product.dto';
import { assertSensitiveConfirmed, detectSensitiveProductChanges } from './product-sensitivity';
import {
  PRODUCT_LIFECYCLE_DOWNSTREAM_NOTES_FA,
  PRODUCT_LIFECYCLE_OWNER_DECISIONS_FA,
  PRODUCT_LIFECYCLE_STATE_LABELS_FA,
  PRODUCT_LIFECYCLE_STATUSES,
  PRODUCT_LIFECYCLE_TRANSITIONS,
  PRODUCT_LIFECYCLE_TRANSITION_FIELDS,
  PRODUCT_LIFECYCLE_READ_QUERY_FIELDS,
  findProductLifecycleForbiddenFields,
  findProductLifecycleTransition,
  type ProductLifecycleStatus,
  type ProductLifecycleSupportedTarget,
  type ProductLifecycleTransitionRule,
} from './product-lifecycle.rules';

interface ProductLifecycleRow extends QueryResultRow {
  status: string;
  row_version: number;
}

interface HistoryRow extends QueryResultRow {
  id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  event_label_fa: string;
  from_status: string | null;
  to_status: string | null;
  actor_user_id: string | null;
  actor_label_fa: string;
  at: string;
}

export interface ProductLifecycleActorView {
  can_update: boolean;
  can_change_status: boolean;
  can_transition: boolean;
  unavailable_reason_fa: string | null;
}

export interface ProductLifecycleActionView {
  action_id: string;
  target_status: ProductLifecycleSupportedTarget;
  label_fa: string;
  confirmation_required: true;
  method: 'POST';
  path: '/products/{id}/lifecycle/transitions';
  requires_row_version: true;
  decision_dependency_fa: string | null;
}

export interface ProductLifecycleView {
  product_id: string;
  scope: 'central';
  status: ProductLifecycleStatus;
  status_label_fa: string;
  row_version: number;
  policy: {
    source: 'existing_d4_contract';
    permissions_fa: string;
    confirmation_fa: string;
    concurrency_fa: string;
    two_person_approval: 'BLOCKED';
  };
  actor: ProductLifecycleActorView;
  available_actions: ProductLifecycleActionView[];
  transitions: readonly ProductLifecycleTransitionRule[];
  downstream_notes_fa: readonly string[];
  owner_decisions_fa: readonly string[];
  history: {
    items: HistoryRow[];
    has_more: boolean;
    next_cursor: string | null;
  };
}

export interface ProductLifecycleTransitionResult {
  product_id: string;
  scope: 'central';
  from_status: ProductLifecycleSupportedTarget;
  status: ProductLifecycleSupportedTarget;
  status_label_fa: string;
  row_version: number;
  action_id: string;
  action_label_fa: string;
  audit: {
    committed: true;
    action: 'product_lifecycle.transition';
    transactional: true;
    actor_source: 'session';
  };
  message_fa: string;
}

interface ParsedBody {
  target_status: ProductLifecycleStatus;
  row_version: number;
  confirm_sensitive: boolean;
}

interface ParsedQuery {
  before: string | null;
  limit: number;
}

const asRecord = (raw: unknown): Record<string, unknown> | null =>
  raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;

const validationError = (fields: Record<string, string[]>): never => {
  throw new BadRequestException({
    code: 'validation_failed',
    message_fa: 'درخواست نامعتبر است؛ فیلدهای مشخصشده را بررسی کنید.',
    details: { fields },
  });
};

/**
 * سرویس اختصاصی چرخهٔ حیات مرکزی (TASK-PM-02-C5).
 *
 * خواندن: فقط همان وضعیت، ماتریس مستند، مجوزهای نشست و تاریخچهٔ تغییرناپذیر
 * `0060` را با قید شرکت نشست برمیگرداند. نوشتن: همان کنترل D4 موجود، ولی در
 * تراکنش `CatalogAccess.write` با ممیزی `recordRequired` fail-closed و قفل
 * خوشبینانه الزامی. هیچ جدول، مهاجرت، مجوز، نقش، دامنه یا سیاست حذف/بایگانی
 * تازهای ایجاد نمیشود.
 */
@Injectable()
export class ProductLifecycleService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly access: CatalogAccess,
    @Inject(PRODUCT_REPOSITORY) private readonly repo: ProductRepository,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
  ) {}

  private assertId(id: string): void {
    if (!isUUID(id, '4')) {
      throw new BadRequestException({ code: 'invalid_id', message_fa: 'شناسه کالا معتبر نیست.' });
    }
  }

  private assertClientPayload(raw: unknown, allowed: readonly string[]): Record<string, unknown> {
    const obj = asRecord(raw) ?? {};
    const forbidden = findProductLifecycleForbiddenFields(obj);
    if (forbidden.length > 0) {
      throw new BadRequestException({
        code: 'forbidden_client_field',
        message_fa: 'فیلدهای مالکیت، شرکت، هویت، مجوز یا ممیزی از کلاینت پذیرفته نمیشود.',
        details: { fields: forbidden },
      });
    }
    const allowedSet = new Set<string>(allowed);
    const unsupported = Object.keys(obj).filter((key) => !allowedSet.has(key)).sort();
    if (unsupported.length > 0) {
      throw new BadRequestException({
        code: 'unsupported_request_field',
        message_fa: 'فیلدهای ارسالی در قرارداد چرخهٔ حیات تعریف نشدهاند.',
        details: { fields: unsupported },
      });
    }
    return obj;
  }

  private parseQuery(raw: unknown): ParsedQuery {
    const obj = this.assertClientPayload(raw, PRODUCT_LIFECYCLE_READ_QUERY_FIELDS);
    const rawBefore = obj.before;
    if (rawBefore !== undefined && (typeof rawBefore !== 'string' || !/^[0-9]{1,20}$/.test(rawBefore))) {
      throw new BadRequestException({ code: 'invalid_cursor', message_fa: 'نشانگر تاریخچه معتبر نیست.' });
    }
    const before = typeof rawBefore === 'string' ? rawBefore : null;
    const limitRaw = obj.limit;
    if (limitRaw === undefined) return { before, limit: 30 };
    const limit = typeof limitRaw === 'string' && /^[0-9]{1,3}$/.test(limitRaw)
      ? Number(limitRaw)
      : typeof limitRaw === 'number' && Number.isInteger(limitRaw)
        ? limitRaw
        : NaN;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      validationError({ limit: ['حد مجاز تاریخچه عددی صحیح بین ۱ و ۱۰۰ است.'] });
    }
    return { before, limit };
  }

  private parseBody(raw: unknown): ParsedBody {
    const obj = this.assertClientPayload(raw, PRODUCT_LIFECYCLE_TRANSITION_FIELDS);
    const issues: Record<string, string[]> = {};
    const target = obj.target_status;
    if (typeof target !== 'string' || !(PRODUCT_LIFECYCLE_STATUSES as readonly string[]).includes(target)) {
      issues.target_status = ['وضعیت مقصد باید یکی از فعال، مسدود یا متوقف باشد.'];
    }
    const version = obj.row_version;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) {
      issues.row_version = ['نسخهٔ قفل خوشبینانه عددی صحیح و نامنفی الزامی است.'];
    }
    if (obj.confirm_sensitive !== undefined && typeof obj.confirm_sensitive !== 'boolean') {
      issues.confirm_sensitive = ['تأیید صریح باید true یا false باشد.'];
    }
    if (Object.keys(issues).length > 0) validationError(issues);
    return {
      target_status: target as ProductLifecycleStatus,
      row_version: version as number,
      confirm_sensitive: obj.confirm_sensitive === true,
    };
  }

  /** خطاهای پیشبینیشده همان پاسخ امن خود را میگیرند؛ جزئیات DB هرگز برگشت داده نمیشود. */
  private safeFailure(err: unknown, surface: 'read' | 'transition'): never {
    if (err instanceof HttpException) throw err;
    if ((err as { code?: string })?.code === 'audit_partition_missing') {
      throw new ConflictException({
        code: 'audit_partition_missing',
        message_fa: 'ثبت ممیزی ممکن نشد؛ هیچ تغییر وضعیتی اعمال نشد.',
      });
    }
    throw new InternalServerErrorException({
      code: surface === 'read' ? 'lifecycle_read_failed' : 'lifecycle_transition_failed',
      message_fa: surface === 'read'
        ? 'دریافت وضعیت چرخهٔ حیات ممکن نشد؛ دوباره تلاش کنید.'
        : 'انجام گذار چرخهٔ حیات ممکن نشد؛ هیچ تغییری اعمال نشد.',
    });
  }

  async read(user: AuthContext, id: string, rawQuery: unknown): Promise<ProductLifecycleView> {
    this.assertId(id);
    const query = this.parseQuery(rawQuery);
    try {
      // Defense in depth: PermissionsGuard + DB-revalidated view permission.
      const permissions = await this.access.assert(user.companyId, user.userId, 'master.product.view');
      const { rows } = await this.pool.query<ProductLifecycleRow>(
        `select status, row_version from product
          where id = $1 and company_id = $2 and deleted_at is null`,
        [id, user.companyId],
      );
      const product = rows[0];
      if (!product) {
        throw new NotFoundException({ code: 'product_not_found', message_fa: 'کالا یافت نشد.' });
      }

      const history = await this.pool.query<HistoryRow>(
        `select h.id::text as id, h.action,
                case h.action when 'INSERT' then 'ایجاد'
                              when 'DELETE' then 'حذف'
                              else 'گذار وضعیت' end as event_label_fa,
                h.before_data->>'status' as from_status,
                h.after_data->>'status' as to_status,
                h.actor_user_id,
                coalesce(
                  nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''),
                  nullif(btrim(p.legal_name), ''),
                  nullif(btrim(u.username), ''),
                  'ثبت سیستمی / ناشناخته'
                ) as actor_label_fa,
                to_char(h.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as at
           from product_catalog_history h
           left join app_user u on u.id = h.actor_user_id
           left join person p on p.id = u.person_id and p.company_id = $1
          where h.company_id = $1 and h.product_id = $2 and h.entity_type = 'product'
            and (h.action in ('INSERT', 'DELETE')
                 or (h.before_data->>'status') is distinct from (h.after_data->>'status'))
            and ($3::bigint is null or h.id < $3::bigint)
          order by h.id desc
          limit $4`,
        [user.companyId, id, query.before, query.limit + 1],
      );
      const items = history.rows.slice(0, query.limit);
      const hasMore = history.rows.length > query.limit;

      const canUpdate = permissions.some((p) => permissionMatches(p, 'master.product.update'));
      const canChangeStatus = permissions.some((p) => permissionMatches(p, 'master.product.status'));
      const canTransition = canUpdate && canChangeStatus;
      const unavailableReason = canTransition
        ? null
        : !canUpdate && !canChangeStatus
          ? 'این نشست مجوز ویرایش کاتالوگ و مجوز ممتاز تغییر وضعیت را ندارد؛ فقط مشاهده مجاز است.'
          : !canUpdate
            ? 'این نشست مجوز ویرایش کاتالوگ (master.product.update) ندارد.'
            : 'این نشست مجوز ممتاز تغییر وضعیت (master.product.status) ندارد.';
      const availableActions: ProductLifecycleActionView[] = canTransition
        ? PRODUCT_LIFECYCLE_TRANSITIONS
            .filter((r) => r.source_status === product.status && r.supported)
            .map((r) => ({
              action_id: r.action_id,
              target_status: r.target_status as ProductLifecycleSupportedTarget,
              label_fa: r.label_fa,
              confirmation_required: true as const,
              method: 'POST' as const,
              path: '/products/{id}/lifecycle/transitions' as const,
              requires_row_version: true as const,
              decision_dependency_fa: r.decision_dependency_fa,
            }))
        : [];

      return {
        product_id: id,
        scope: 'central',
        status: product.status as ProductLifecycleStatus,
        status_label_fa: PRODUCT_LIFECYCLE_STATE_LABELS_FA[product.status as ProductLifecycleStatus] ?? product.status,
        row_version: product.row_version,
        policy: {
          source: 'existing_d4_contract',
          permissions_fa: 'ویرایش کاتالوگ + مجوز ممتاز تغییر وضعیت، بازاعتبارسنجیشده از پایگاهداده.',
          confirmation_fa: 'هر گذار نیازمند تأیید صریح confirm_sensitive است؛ این پرچم شخص دوم نیست.',
          concurrency_fa: 'مسیر اختصاصی row_version فعلی را الزامی میکند؛ مغایرت 409 version_conflict میدهد.',
          two_person_approval: 'BLOCKED',
        },
        actor: { can_update: canUpdate, can_change_status: canChangeStatus, can_transition: canTransition, unavailable_reason_fa: unavailableReason },
        available_actions: availableActions,
        transitions: PRODUCT_LIFECYCLE_TRANSITIONS,
        downstream_notes_fa: PRODUCT_LIFECYCLE_DOWNSTREAM_NOTES_FA,
        owner_decisions_fa: PRODUCT_LIFECYCLE_OWNER_DECISIONS_FA,
        history: {
          items,
          has_more: hasMore,
          next_cursor: hasMore ? items[items.length - 1]?.id ?? null : null,
        },
      };
    } catch (err) {
      return this.safeFailure(err, 'read');
    }
  }

  async transition(
    user: AuthContext,
    id: string,
    rawBody: unknown,
    meta: RequestMeta,
  ): Promise<ProductLifecycleTransitionResult> {
    this.assertId(id);
    const body = this.parseBody(rawBody);
    try {
      return await this.access.write(
        user.companyId,
        user.userId,
        'master.product.update',
        async () => {
          const client: Runner | undefined = catalogTransaction.getStore() ?? undefined;
          const permissions = await this.access.assert(user.companyId, user.userId, 'master.product.update');
          const { rows } = await this.pool.query<ProductLifecycleRow>(
            `select status, row_version from product
              where id = $1 and company_id = $2 and deleted_at is null
              for update`,
            [id, user.companyId],
          );
          const existing = rows[0];
          if (!existing) {
            throw new NotFoundException({ code: 'product_not_found', message_fa: 'کالا یافت نشد.' });
          }

          // Optimistic lock is evaluated against the row we actually locked, so a
          // client that lost a race always learns `version_conflict` instead of a
          // stale-state validation message. The repository re-checks the version
          // in its UPDATE predicate as defense in depth.
          if (existing.row_version !== body.row_version) {
            throw new ConflictException({
              code: 'version_conflict',
              message_fa: 'کالا همزمان توسط کاربر دیگری تغییر کرده است؛ دوباره بارگیری کنید.',
            });
          }

          const rule = findProductLifecycleTransition(existing.status, body.target_status);
          if (!rule?.supported) {
            throw new BadRequestException({
              code: rule?.rejection_code ?? 'lifecycle_transition_unsupported',
              message_fa: rule?.reason_fa ?? 'گذار وضعیت درخواستشده پشتیبانی نمیشود.',
              details: { source_status: existing.status, target_status: body.target_status },
            });
          }

          const hasStatusPermission = permissions.some((p) => permissionMatches(p, 'master.product.status'));
          const changes = detectSensitiveProductChanges(
            { status: existing.status },
            { status: body.target_status },
          );
          assertSensitiveConfirmed(changes, body.confirm_sensitive, hasStatusPermission, 'گذار چرخهٔ حیات کالا');

          const row: ProductRow | null = await this.repo.update(
            user.companyId,
            id,
            { status: body.target_status } as UpdateProductDto,
            body.row_version,
            client,
          );
          if (!row) {
            throw new ConflictException({
              code: 'version_conflict',
              message_fa: 'کالا همزمان توسط کاربر دیگری تغییر کرده است؛ دوباره بارگیری کنید.',
            });
          }

          // Fail-closed: product update + audit + immutable 0060 trigger share
          // this transaction. Actor/time are server-owned; no client audit fields.
          await this.audit.recordRequired(
            {
              companyId: user.companyId,
              actorUserId: user.userId,
              action: 'product_lifecycle.transition',
              entityType: 'product',
              entityId: id,
              before: { status: existing.status, row_version: body.row_version },
              after: { status: row.status, row_version: row.row_version },
              ip: meta.ip ?? null,
              userAgent: null,
              requestId: null,
            },
            client,
          );

          return {
            product_id: id,
            scope: 'central',
            from_status: existing.status as ProductLifecycleSupportedTarget,
            status: row.status as ProductLifecycleSupportedTarget,
            status_label_fa: PRODUCT_LIFECYCLE_STATE_LABELS_FA[row.status as ProductLifecycleStatus] ?? row.status,
            row_version: row.row_version,
            action_id: rule.action_id,
            action_label_fa: rule.label_fa,
            audit: {
              committed: true,
              action: 'product_lifecycle.transition',
              transactional: true,
              actor_source: 'session',
            },
            message_fa: `وضعیت مرکزی کالا به «${PRODUCT_LIFECYCLE_STATE_LABELS_FA[row.status as ProductLifecycleStatus] ?? row.status}» تغییر کرد.`,
          };
        },
      );
    } catch (err) {
      return this.safeFailure(err, 'transition');
    }
  }
}
