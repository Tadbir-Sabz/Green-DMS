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
import {
  PRODUCT_RELATION_GRAPH_DEFAULT_DEPTH,
  PRODUCT_RELATION_GRAPH_MAX_DEPTH,
  PRODUCT_RELATION_GRAPH_MAX_NODES,
  PRODUCT_RELATION_GRAPH_QUERY_FIELDS,
  PRODUCT_RELATION_HISTORY_LIMIT,
  PRODUCT_RELATION_KINDS,
  PRODUCT_RELATION_KIND_SPECS,
  PRODUCT_RELATION_LABELS_FA,
  PRODUCT_RELATION_LIST_MAX,
  PRODUCT_RELATION_LIST_QUERY_FIELDS,
  PRODUCT_RELATION_CREATE_FIELDS,
  PRODUCT_RELATION_DIRECTIONS,
  PRODUCT_RELATION_DOWNSTREAM_NOTES_FA,
  PRODUCT_RELATION_OWNER_DECISIONS_FA,
  PRODUCT_RELATION_PRIORITY_DEFAULT,
  PRODUCT_RELATION_PRIORITY_MAX,
  PRODUCT_RELATION_PRIORITY_MIN,
  PRODUCT_RELATION_UPDATE_FIELDS,
  findProductRelationForbiddenFields,
  productRelationStatusWarningFa,
  type ProductRelationDirection,
  type ProductRelationKind,
  type ProductRelationOwnerDecision,
} from './product-relations.rules';

interface RelationViewRow extends QueryResultRow {
  id: string;
  product_id: string;
  related_id: string;
  kind: string;
  priority: number;
  related_code: string;
  related_name: string | null;
  related_status: string;
  created_at: string;
  direction: 'outgoing' | 'incoming';
}

interface HistoryViewRow extends QueryResultRow {
  id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  event_label_fa: string;
  actor_user_id: string | null;
  actor_label_fa: string;
  at: string;
  kind: string | null;
  priority: number | null;
  before_kind: string | null;
  before_priority: number | null;
  product_id: string | null;
  related_id: string | null;
}

export interface ProductRelationItem {
  id: string;
  product_id: string;
  related_id: string;
  kind: ProductRelationKind;
  kind_label_fa: string;
  priority: number;
  direction: 'outgoing' | 'incoming';
  related: {
    id: string;
    code: string;
    name: string | null;
    status: string;
    status_label_fa: string;
    warning_fa: string | null;
  };
  created_at: string;
  editable: boolean;
  removable: boolean;
}

export interface ProductRelationsOverview {
  product_id: string;
  product: { id: string; code: string; name: string | null; status: string; status_label_fa: string };
  scope: 'central';
  actor: {
    can_view: boolean;
    can_update: boolean;
    unavailable_reason_fa: string | null;
  };
  kinds: readonly {
    kind: ProductRelationKind;
    label_fa: string;
    meaning_fa: string;
    operational_effect_fa: string;
    cycle_policy: string;
  }[];
  items: ProductRelationItem[];
  counts: { outgoing: number; incoming: number; substitute: number; complement: number; truncated: boolean };
  downstream_notes_fa: readonly string[];
  owner_decisions_fa: readonly ProductRelationOwnerDecision[];
}

export interface ProductRelationGraphNode {
  product_id: string;
  code: string;
  name: string | null;
  status: string;
  kind: string | null;
  depth: number;
  via_relation_id: string | null;
}

export interface ProductRelationGraph {
  product_id: string;
  scope: 'central';
  depth: number;
  nodes: ProductRelationGraphNode[];
  edges: { relation_id: string; from: string; to: string; kind: string; priority: number }[];
  truncated: boolean;
  technical_limits: { max_depth: number; max_nodes: number; requested_depth: number };
  semantics_fa: string;
}

interface ParsedCreate {
  related_id: string;
  kind: ProductRelationKind;
  priority: number;
  confirm_add: boolean;
}

const STATUS_LABELS_FA: Record<string, string> = {
  active: 'فعال',
  blocked: 'مسدود',
  discontinued: 'متوقف',
};

const asRecord = (raw: unknown): Record<string, unknown> | null =>
  raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;

const validationError = (fields: Record<string, string[]>): never => {
  throw new BadRequestException({
    code: 'validation_failed',
    message_fa: 'درخواست نامعتبر است؛ فیلدهای مشخص‌شده را بررسی کنید.',
    details: { fields },
  });
};

/**
 * سرویسِ مرکزیِ روابطِ کالا (TASK-PM-02-C6).
 *
 * فقط همان دو نوعِ مصوب ۰۰۴۶ (`substitute`, `complement`) و همان کنترل‌های موجود
 * (مجوز `master.product.update`، خودارجاع ممنوع، حلقهٔ `substitute` ممنوع،
 * یکتایی، حذف با مجوز) را کامل، صریح و قابل‌ممیزی می‌کند:
 *  - نه نوع/جهت/کاردینالیتیِ تازه‌ای ساخته می‌شود،
 *  - نه متقارن‌سازیِ خودکار و نه قاعدهٔ حلقهٔ تازه‌ای،
 *  - نه اثرِ عملیاتی روی قیمت/موجودی/سفارش/فاکتور/بسته.
 *
 * رابطه با کالای غیرفعال مسدود نمی‌شود (سند مصوبی برای آن وجود ندارد) ولی
 * هشدارِ اطلاع‌رسان برگردانده می‌شود.
 */
@Injectable()
export class ProductRelationsService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly access: CatalogAccess,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
  ) {}

  private assertId(id: string, field = 'product_id'): void {
    if (!isUUID(id, '4')) {
      throw new BadRequestException({
        code: 'invalid_id',
        message_fa: 'شناسهٔ کالا معتبر نیست.',
        details: { fields: [field] },
      });
    }
  }

  private assertClientPayload(raw: unknown, allowed: readonly string[]): Record<string, unknown> {
    const obj = asRecord(raw) ?? {};
    const forbidden = findProductRelationForbiddenFields(obj);
    if (forbidden.length > 0) {
      throw new BadRequestException({
        code: 'forbidden_client_field',
        message_fa: 'فیلدهای مالکیت، شرکت، هویت، مجوز یا ممیزی از کلاینت پذیرفته نمی‌شود.',
        details: { fields: forbidden },
      });
    }
    const allowedSet = new Set<string>(allowed);
    const unsupported = Object.keys(obj).filter((key) => !allowedSet.has(key)).sort();
    if (unsupported.length > 0) {
      throw new BadRequestException({
        code: 'unsupported_request_field',
        message_fa: 'فیلدهای ارسالی در قرارداد روابط کالا تعریف نشده‌اند.',
        details: { fields: unsupported },
      });
    }
    return obj;
  }

  private parseCreate(raw: unknown): ParsedCreate {
    const obj = this.assertClientPayload(raw, PRODUCT_RELATION_CREATE_FIELDS);
    const issues: Record<string, string[]> = {};
    const relatedId = obj.related_id;
    if (typeof relatedId !== 'string' || !isUUID(relatedId, '4')) {
      issues.related_id = ['شناسهٔ کالای مرتبط باید UUID معتبر باشد.'];
    }
    const kind = obj.kind;
    if (typeof kind !== 'string' || !(PRODUCT_RELATION_KINDS as readonly string[]).includes(kind)) {
      issues.kind = ['نوع رابطه باید «جایگزین» یا «مکمل» باشد.'];
    }
    let priority = PRODUCT_RELATION_PRIORITY_DEFAULT;
    if (obj.priority !== undefined) {
      if (
        typeof obj.priority !== 'number' ||
        !Number.isInteger(obj.priority) ||
        obj.priority < PRODUCT_RELATION_PRIORITY_MIN ||
        obj.priority > PRODUCT_RELATION_PRIORITY_MAX
      ) {
        issues.priority = [`اولویت باید عددی صحیح بین ${PRODUCT_RELATION_PRIORITY_MIN} و ${PRODUCT_RELATION_PRIORITY_MAX} باشد.`];
      } else {
        priority = obj.priority;
      }
    }
    if (obj.confirm_add !== undefined && typeof obj.confirm_add !== 'boolean') {
      issues.confirm_add = ['تأیید افزودن باید true یا false باشد.'];
    }
    if (Object.keys(issues).length > 0) validationError(issues);
    return {
      related_id: relatedId as string,
      kind: kind as ProductRelationKind,
      priority,
      confirm_add: obj.confirm_add === true,
    };
  }

  private parseListQuery(raw: unknown): { kind: ProductRelationKind | null; direction: ProductRelationDirection; limit: number } {
    const obj = this.assertClientPayload(raw, PRODUCT_RELATION_LIST_QUERY_FIELDS);
    let kind: ProductRelationKind | null = null;
    if (obj.kind !== undefined) {
      if (typeof obj.kind !== 'string' || !(PRODUCT_RELATION_KINDS as readonly string[]).includes(obj.kind)) {
        validationError({ kind: ['نوع رابطه باید «جایگزین» یا «مکمل» باشد.'] });
      }
      kind = obj.kind as ProductRelationKind;
    }
    let direction: ProductRelationDirection = 'both';
    if (obj.direction !== undefined) {
      if (typeof obj.direction !== 'string' || !(PRODUCT_RELATION_DIRECTIONS as readonly string[]).includes(obj.direction)) {
        validationError({ direction: ['جهت باید outgoing، incoming یا both باشد.'] });
      }
      direction = obj.direction as ProductRelationDirection;
    }
    let limit = 100;
    if (obj.limit !== undefined) {
      const n = typeof obj.limit === 'string' && /^[0-9]{1,3}$/.test(obj.limit) ? Number(obj.limit) : obj.limit;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > PRODUCT_RELATION_LIST_MAX) {
        validationError({ limit: [`حد نمایش باید عددی بین ۱ و ${PRODUCT_RELATION_LIST_MAX} باشد.`] });
      }
      limit = n as number;
    }
    return { kind, direction, limit };
  }

  private parseGraphQuery(raw: unknown): { depth: number; kind: ProductRelationKind | null } {
    const obj = this.assertClientPayload(raw, PRODUCT_RELATION_GRAPH_QUERY_FIELDS);
    let depth = PRODUCT_RELATION_GRAPH_DEFAULT_DEPTH;
    if (obj.depth !== undefined) {
      const n = typeof obj.depth === 'string' && /^[0-9]{1,2}$/.test(obj.depth) ? Number(obj.depth) : obj.depth;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > PRODUCT_RELATION_GRAPH_MAX_DEPTH) {
        validationError({ depth: [`عمق پیمایش باید عددی بین ۱ و ${PRODUCT_RELATION_GRAPH_MAX_DEPTH} باشد.`] });
      }
      depth = n as number;
    }
    let kind: ProductRelationKind | null = null;
    if (obj.kind !== undefined) {
      if (typeof obj.kind !== 'string' || !(PRODUCT_RELATION_KINDS as readonly string[]).includes(obj.kind)) {
        validationError({ kind: ['نوع رابطه باید «جایگزین» یا «مکمل» باشد.'] });
      }
      kind = obj.kind as ProductRelationKind;
    }
    return { depth, kind };
  }

  private safeFailure(err: unknown, surface: 'read' | 'write'): never {
    if (err instanceof HttpException) throw err;
    if ((err as { code?: string })?.code === 'audit_partition_missing') {
      throw new ConflictException({
        code: 'audit_partition_missing',
        message_fa: 'ثبت ممیزی ممکن نشد؛ هیچ تغییری در روابط اعمال نشد.',
      });
    }
    throw new InternalServerErrorException({
      code: surface === 'read' ? 'relation_read_failed' : 'relation_write_failed',
      message_fa: surface === 'read'
        ? 'دریافت روابط کالا ممکن نشد؛ دوباره تلاش کنید.'
        : 'ثبت تغییر رابطه ممکن نشد؛ هیچ تغییری اعمال نشد.',
    });
  }

  private async loadProduct(companyId: string, productId: string): Promise<{
    id: string; code: string; name: string | null; status: string;
  }> {
    const { rows } = await this.pool.query<{ id: string; code: string; name: string | null; status: string }>(
      `select id, code, name, status from product
        where id = $1 and company_id = $2 and deleted_at is null`,
      [productId, companyId],
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException({ code: 'product_not_found', message_fa: 'کالا یافت نشد.' });
    }
    return row;
  }

  private toItem(row: RelationViewRow): ProductRelationItem {
    return {
      id: row.id,
      product_id: row.product_id,
      related_id: row.related_id,
      kind: row.kind as ProductRelationKind,
      kind_label_fa: PRODUCT_RELATION_LABELS_FA[row.kind] ?? row.kind,
      priority: row.priority,
      direction: row.direction,
      related: {
        id: row.related_id,
        code: row.related_code,
        name: row.related_name,
        status: row.related_status,
        status_label_fa: STATUS_LABELS_FA[row.related_status] ?? row.related_status,
        warning_fa: productRelationStatusWarningFa(row.related_status),
      },
      created_at: row.created_at,
      editable: row.direction === 'outgoing',
      removable: row.direction === 'outgoing',
    };
  }

  /** نمای کاملِ روابطِ یک کالا: خروجی، ورودی و شمارش‌ها (بدون دنبال‌کردن گراف). */
  async overview(user: AuthContext, productId: string, rawQuery: unknown): Promise<ProductRelationsOverview> {
    this.assertId(productId);
    const query = this.parseListQuery(rawQuery);
    try {
      const permissions = await this.access.assert(user.companyId, user.userId, 'master.product.view');
      const product = await this.loadProduct(user.companyId, productId);
      const canUpdate = permissions.some((p) => permissionMatches(p, 'master.product.update'));

      // جهت‌ها با UNION ALL ساخته می‌شوند؛ هر شاخه شرکت/کالا را صریح قید می‌کند و
      // RLS/FORCE RLS هم برقرار است. سقفِ فنی از پیمایش/پاسخِ بی‌کران جلوگیری می‌کند.
      const directionFilter = query.direction;
      const { rows } = await this.pool.query<RelationViewRow>(
        `with rel as (
           select r.id, r.product_id, r.related_id, r.kind, r.priority, r.created_at, 'outgoing'::text as direction
             from product_relation r
            where r.company_id = $1 and r.product_id = $2
           union all
           select r.id, r.product_id, r.related_id, r.kind, r.priority, r.created_at, 'incoming'::text as direction
             from product_relation r
            where r.company_id = $1 and r.related_id = $2
         )
         select rel.id, rel.product_id, rel.related_id, rel.kind, rel.priority, rel.direction,
                case when rel.direction = 'outgoing' then p.code else p2.code end as related_code,
                case when rel.direction = 'outgoing' then p.name else p2.name end as related_name,
                case when rel.direction = 'outgoing' then p.status else p2.status end as related_status,
                to_char(rel.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at
           from rel
           join product p on p.id = rel.related_id and p.company_id = $1
           join product p2 on p2.id = rel.product_id and p2.company_id = $1
          where ($3::text is null or rel.kind = $3::text)
            and ($4::text = 'both' or rel.direction = $4::text)
          order by rel.kind, rel.priority, related_code, rel.direction desc, rel.id
          limit $5`,
        [user.companyId, productId, query.kind, directionFilter, query.limit + 1],
      );
      const truncated = rows.length > query.limit;
      const items = rows.slice(0, query.limit).map((r) => this.toItem(r));

      const countsRow = await this.pool.query<{
        outgoing: number; incoming: number; substitute: number; complement: number;
      }>(
        `select
           count(*) filter (where product_id = $2)::int as outgoing,
           count(*) filter (where related_id = $2)::int as incoming,
           count(*) filter (where kind = 'substitute')::int as substitute,
           count(*) filter (where kind = 'complement')::int as complement
         from product_relation
        where company_id = $1 and (product_id = $2 or related_id = $2)`,
        [user.companyId, productId],
      );
      const counts = countsRow.rows[0] ?? { outgoing: 0, incoming: 0, substitute: 0, complement: 0 };

      return {
        product_id: productId,
        product: {
          id: product.id,
          code: product.code,
          name: product.name,
          status: product.status,
          status_label_fa: STATUS_LABELS_FA[product.status] ?? product.status,
        },
        scope: 'central',
        actor: {
          can_view: true,
          can_update: canUpdate,
          unavailable_reason_fa: canUpdate ? null : ' این نشست مجوز ویرایش کاتالوگ (master.product.update) ندارد؛ فقط مشاهده مجاز است.',
        },
        kinds: PRODUCT_RELATION_KIND_SPECS.map((k) => ({
          kind: k.kind,
          label_fa: k.label_fa,
          meaning_fa: k.meaning_fa,
          operational_effect_fa: k.operational_effect_fa,
          cycle_policy: k.cycle_policy,
        })),
        items,
        counts: {
          outgoing: counts.outgoing,
          incoming: counts.incoming,
          substitute: counts.substitute,
          complement: counts.complement,
          truncated,
        },
        downstream_notes_fa: PRODUCT_RELATION_DOWNSTREAM_NOTES_FA,
        owner_decisions_fa: PRODUCT_RELATION_OWNER_DECISIONS_FA,
      };
    } catch (err) {
      return this.safeFailure(err, 'read');
    }
  }

  /** تاریخچهٔ همین روابط از `product_catalog_history` (تریگر ۰۰۶۰) — فقط شرکت/کالای نشست. */
  async history(user: AuthContext, productId: string): Promise<{
    items: HistoryViewRow[];
    has_more: false;
    limit: number;
    source_fa: string;
  }> {
    this.assertId(productId);
    try {
      await this.access.assert(user.companyId, user.userId, 'master.product.view');
      await this.loadProduct(user.companyId, productId);
      const { rows } = await this.pool.query<HistoryViewRow>(
        `select h.id::text as id,
                h.action,
                case h.action when 'INSERT' then 'افزودن رابطه'
                              when 'UPDATE' then 'ویرایش رابطه'
                              else 'حذف رابطه' end as event_label_fa,
                h.actor_user_id,
                coalesce(
                  nullif(btrim(concat_ws(' ', per.first_name, per.last_name)), ''),
                  nullif(btrim(per.legal_name), ''),
                  nullif(btrim(u.username), ''),
                  'ثبت سیستمی / ناشناخته'
                ) as actor_label_fa,
                to_char(h.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as at,
                coalesce(h.after_data->>'kind', h.before_data->>'kind') as kind,
                coalesce((h.after_data->>'priority')::int, (h.before_data->>'priority')::int) as priority,
                h.before_data->>'kind' as before_kind,
                (h.before_data->>'priority')::int as before_priority,
                coalesce(h.after_data->>'product_id', h.before_data->>'product_id') as product_id,
                coalesce(h.after_data->>'related_id', h.before_data->>'related_id') as related_id
           from product_catalog_history h
           left join app_user u on u.id = h.actor_user_id
           left join person per on per.id = u.person_id and per.company_id = $1
          where h.company_id = $1
            and h.entity_type = 'product_relation'
            and (
              coalesce(h.after_data->>'product_id', h.before_data->>'product_id')::uuid = $2
              or coalesce(h.after_data->>'related_id', h.before_data->>'related_id')::uuid = $2
            )
          order by h.id desc
          limit $3`,
        [user.companyId, productId, PRODUCT_RELATION_HISTORY_LIMIT],
      );
      return {
        items: rows,
        has_more: false,
        limit: PRODUCT_RELATION_HISTORY_LIMIT,
        source_fa: 'تاریخچهٔ تغییرناپذیر کاتالوگ (تریگر ۰۰۶۰)؛ فقط کنشگر، زمان و نوع/اولویت رابطه.',
      };
    } catch (err) {
      return this.safeFailure(err, 'read');
    }
  }

  /**
   * پیمایشِ گراف با سقفِ سخت (عمق و تعداد گره). این یک نگهبانِ **فنی** است، نه
   * قاعدهٔ کسب‌وکار: هیچ ادعایی دربارهٔ «حلقه مجاز/ممنوع» یا «متقارن بودن» نمی‌کند.
   */
  async graph(user: AuthContext, productId: string, rawQuery: unknown): Promise<ProductRelationGraph> {
    this.assertId(productId);
    const query = this.parseGraphQuery(rawQuery);
    try {
      await this.access.assert(user.companyId, user.userId, 'master.product.view');
      await this.loadProduct(user.companyId, productId);
      const { rows } = await this.pool.query<{
        product_id: string; code: string; name: string | null; status: string;
        kind: string | null; depth: number; via_relation_id: string | null;
      }>(
        `with recursive walk(product_id, depth, via_relation_id, kind) as (
           select $2::uuid, 0, null::uuid, null::text
           union
           select r.related_id, w.depth + 1, r.id, r.kind
             from product_relation r
             join walk w on r.product_id = w.product_id
            where r.company_id = $1
              and w.depth < $3
              and ($4::text is null or r.kind = $4::text)
         )
         select w.product_id, p.code, p.name, p.status, w.kind, w.depth, w.via_relation_id
           from walk w
           join product p on p.id = w.product_id and p.company_id = $1
          order by w.depth, p.code
          limit $5`,
        [user.companyId, productId, query.depth, query.kind, PRODUCT_RELATION_GRAPH_MAX_NODES + 1],
      );
      const truncated = rows.length > PRODUCT_RELATION_GRAPH_MAX_NODES;
      const nodes = rows.slice(0, PRODUCT_RELATION_GRAPH_MAX_NODES).map((r) => ({
        product_id: r.product_id,
        code: r.code,
        name: r.name,
        status: r.status,
        kind: r.kind,
        depth: r.depth,
        via_relation_id: r.via_relation_id,
      }));
      const visible = new Set(nodes.map((n) => n.product_id));
      const edgeRows = await this.pool.query<{
        relation_id: string; from_id: string; to_id: string; kind: string; priority: number;
      }>(
        `select r.id as relation_id, r.product_id as from_id, r.related_id as to_id, r.kind, r.priority
           from product_relation r
          where r.company_id = $1
            and r.product_id = any($2::uuid[])
            and r.related_id = any($2::uuid[])
            and ($3::text is null or r.kind = $3::text)
          order by r.priority, r.id
          limit $4`,
        [user.companyId, [...visible], query.kind, PRODUCT_RELATION_GRAPH_MAX_NODES],
      );
      return {
        product_id: productId,
        scope: 'central',
        depth: query.depth,
        nodes,
        edges: edgeRows.rows.map((e) => ({
          relation_id: e.relation_id,
          from: e.from_id,
          to: e.to_id,
          kind: e.kind,
          priority: e.priority,
        })),
        truncated,
        technical_limits: {
          max_depth: PRODUCT_RELATION_GRAPH_MAX_DEPTH,
          max_nodes: PRODUCT_RELATION_GRAPH_MAX_NODES,
          requested_depth: query.depth,
        },
        semantics_fa:
          'این پیمایش فنی است: فقط روابط «خروجی» را تا عمقِ محدود دنبال می‌کند و هیچ حکمی دربارهٔ متقارن بودن، حلقه یا اثر عملیاتی نمی‌دهد.',
      };
    } catch (err) {
      return this.safeFailure(err, 'read');
    }
  }

  /** افزودنِ رابطه — در تراکنشِ کاتالوگ با ممیزیِ fail-closed و تاریخچهٔ ۰۰۶۰. */
  async add(user: AuthContext, productId: string, rawBody: unknown, meta: RequestMeta): Promise<ProductRelationItem> {
    this.assertId(productId);
    const body = this.parseCreate(rawBody);
    try {
      return await this.access.write(user.companyId, user.userId, 'master.product.update', async () => {
        const client: Runner | undefined = catalogTransaction.getStore() ?? undefined;
        await this.access.assert(user.companyId, user.userId, 'master.product.update');
        const source = await this.loadProduct(user.companyId, productId);
        if (body.related_id === productId) {
          throw new BadRequestException({
            code: 'self_relation',
            message_fa: 'کالا نمی‌تواند رابطه با خودش داشته باشد.',
            details: { fields: ['related_id'] },
          });
        }
        const target = await this.loadProduct(user.companyId, body.related_id);

        if (body.kind === 'substitute') {
          // همان قاعدهٔ موجود (پیش از C6) عیناً حفظ شد: مسیرِ substitute از مقصد به مبدأ ممنوع است.
          const path = await this.pool.query(
            `with recursive reach(id) as (
               select $2::uuid
               union
               select r.related_id from product_relation r join reach h on r.product_id = h.id
                where r.kind = 'substitute' and r.company_id = $3
             )
             select 1 from reach where id = $1::uuid`,
            [productId, body.related_id, user.companyId],
          );
          if (path.rows.length > 0) {
            throw new BadRequestException({
              code: 'relation_cycle',
              message_fa: 'این رابطه حلقهٔ جایگزینی ایجاد می‌کند.',
              details: { fields: ['related_id'] },
            });
          }
        }

        const duplicate = await this.pool.query(
          `select 1 from product_relation
            where company_id = $1 and product_id = $2 and related_id = $3 and kind = $4`,
          [user.companyId, productId, body.related_id, body.kind],
        );
        if (duplicate.rows.length > 0) {
          throw new ConflictException({
            code: 'duplicate_relation',
            message_fa: 'این رابطه از قبل ثبت شده است.',
            details: { fields: ['related_id', 'kind'] },
          });
        }

        const inserted = await this.pool.query<RelationViewRow>(
          `insert into product_relation (company_id, product_id, related_id, kind, priority)
           values ($1, $2, $3, $4, $5)
           returning id, product_id, related_id, kind, priority,
                     to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at`,
          [user.companyId, productId, body.related_id, body.kind, body.priority],
        );
        const row = inserted.rows[0];

        await this.audit.recordRequired(
          {
            companyId: user.companyId,
            actorUserId: user.userId,
            action: 'create',
            entityType: 'product_relation',
            entityId: row.id,
            after: {
              product_id: productId,
              related_id: body.related_id,
              kind: body.kind,
              priority: body.priority,
            },
            ip: meta.ip ?? null,
            userAgent: null,
            requestId: null,
          },
          client,
        );

        return this.toItem({
          ...row,
          related_code: target.code,
          related_name: target.name,
          related_status: target.status,
          direction: 'outgoing',
        });
      });
    } catch (err) {
      return this.safeFailure(err, 'write');
    }
  }

  /** ویرایشِ اولویت — تنها فیلدِ قابل ویرایش که مدلِ مصوب دارد. */
  async updatePriority(
    user: AuthContext,
    productId: string,
    relationId: string,
    rawBody: unknown,
    meta: RequestMeta,
  ): Promise<ProductRelationItem> {
    this.assertId(productId);
    if (!isUUID(relationId, '4')) {
      throw new BadRequestException({ code: 'invalid_id', message_fa: 'شناسهٔ رابطه معتبر نیست.' });
    }
    const obj = this.assertClientPayload(rawBody, PRODUCT_RELATION_UPDATE_FIELDS);
    const priority = obj.priority;
    if (
      typeof priority !== 'number' ||
      !Number.isInteger(priority) ||
      priority < PRODUCT_RELATION_PRIORITY_MIN ||
      priority > PRODUCT_RELATION_PRIORITY_MAX
    ) {
      validationError({
        priority: [`اولویت باید عددی صحیح بین ${PRODUCT_RELATION_PRIORITY_MIN} و ${PRODUCT_RELATION_PRIORITY_MAX} باشد.`],
      });
    }
    try {
      return await this.access.write(user.companyId, user.userId, 'master.product.update', async () => {
        const client: Runner | undefined = catalogTransaction.getStore() ?? undefined;
        await this.access.assert(user.companyId, user.userId, 'master.product.update');
        await this.loadProduct(user.companyId, productId);
        const current = await this.pool.query<RelationViewRow>(
          `select r.id, r.product_id, r.related_id, r.kind, r.priority,
                  p.code as related_code, p.name as related_name, p.status as related_status,
                  to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at
             from product_relation r
             join product p on p.id = r.related_id and p.company_id = $1
            where r.id = $2 and r.company_id = $1 and r.product_id = $3`,
          [user.companyId, relationId, productId],
        );
        const existing = current.rows[0];
        if (!existing) {
          throw new NotFoundException({ code: 'relation_not_found', message_fa: 'رابطه یافت نشد.' });
        }
        if (existing.priority === priority) {
          throw new BadRequestException({
            code: 'relation_unchanged',
            message_fa: 'اولویت تغییری نکرده است.',
          });
        }
        const updated = await this.pool.query<RelationViewRow>(
          `update product_relation set priority = $1
            where id = $2 and company_id = $3 and product_id = $4
            returning id, product_id, related_id, kind, priority,
                      to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at`,
          [priority as number, relationId, user.companyId, productId],
        );
        await this.audit.recordRequired(
          {
            companyId: user.companyId,
            actorUserId: user.userId,
            action: 'update',
            entityType: 'product_relation',
            entityId: relationId,
            before: { kind: existing.kind, priority: existing.priority },
            after: { kind: existing.kind, priority },
            ip: meta.ip ?? null,
            userAgent: null,
            requestId: null,
          },
          client,
        );
        return this.toItem({ ...updated.rows[0], direction: 'outgoing' });
      });
    } catch (err) {
      return this.safeFailure(err, 'write');
    }
  }

  /** حذف — سیاستِ موجود (۰۰۴۶/سرویس) حذف را مجاز می‌داند؛ C6 همان را حفظ می‌کند. */
  async remove(user: AuthContext, productId: string, relationId: string, meta: RequestMeta): Promise<{ deleted: true; relation_id: string }> {
    this.assertId(productId);
    if (!isUUID(relationId, '4')) {
      throw new BadRequestException({ code: 'invalid_id', message_fa: 'شناسهٔ رابطه معتبر نیست.' });
    }
    try {
      return await this.access.write(user.companyId, user.userId, 'master.product.update', async () => {
        const client: Runner | undefined = catalogTransaction.getStore() ?? undefined;
        await this.access.assert(user.companyId, user.userId, 'master.product.update');
        await this.loadProduct(user.companyId, productId);
        const current = await this.pool.query<{
          id: string; product_id: string; related_id: string; kind: string; priority: number;
        }>(
          `select id, product_id, related_id, kind, priority from product_relation
            where id = $1 and company_id = $2 and product_id = $3`,
          [relationId, user.companyId, productId],
        );
        const existing = current.rows[0];
        if (!existing) {
          throw new NotFoundException({ code: 'relation_not_found', message_fa: 'رابطه یافت نشد.' });
        }
        await this.pool.query(
          `delete from product_relation where id = $1 and company_id = $2 and product_id = $3`,
          [relationId, user.companyId, productId],
        );
        await this.audit.recordRequired(
          {
            companyId: user.companyId,
            actorUserId: user.userId,
            action: 'delete',
            entityType: 'product_relation',
            entityId: relationId,
            before: {
              product_id: existing.product_id,
              related_id: existing.related_id,
              kind: existing.kind,
              priority: existing.priority,
            },
            ip: meta.ip ?? null,
            userAgent: null,
            requestId: null,
          },
          client,
        );
        return { deleted: true as const, relation_id: relationId };
      });
    } catch (err) {
      return this.safeFailure(err, 'write');
    }
  }
}
