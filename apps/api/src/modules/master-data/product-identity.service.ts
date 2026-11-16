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
import { normalizeAttributeValue, normalizeText, variantSignature as computeVariantSignature } from './product-normalize';
import { findMissingRequiredAttributes, requiredAttributeMissingExceptionBody } from './product-attribute-requirements';
import {
  ALIAS_CREATE_FIELDS,
  ALIAS_KIND_LABELS_FA,
  ALIAS_LIST_QUERY_FIELDS,
  ATTRIBUTE_KIND_LABELS_FA,
  ATTRIBUTE_VALUE_ITEM_FIELDS,
  ATTRIBUTE_VALUES_BODY_FIELDS,
  ATTRIBUTE_VALUES_QUERY_FIELDS,
  C7_DOWNSTREAM_NOTES_FA,
  C7_OWNER_DECISIONS_FA,
  PRODUCT_ALIAS_KINDS,
  PRODUCT_ALIAS_KIND_SPECS,
  PRODUCT_ALIAS_LIST_LIMIT,
  PRODUCT_ALIAS_MAX_LENGTH,
  PRODUCT_ALIAS_MAX_PER_PRODUCT,
  PRODUCT_ATTRIBUTE_HISTORY_LIMIT,
  PRODUCT_ATTRIBUTE_KINDS,
  PRODUCT_ATTRIBUTE_KIND_SPECS,
  PRODUCT_ATTRIBUTE_NUMERIC_MAX_ABS,
  PRODUCT_ATTRIBUTE_VALUE_TEXT_MAX_LENGTH,
  PRODUCT_ATTRIBUTE_VALUES_MAX_ITEMS,
  aliasKindWarningFa,
  attributeRequiredWarningFa,
  findC7ForbiddenFields,
  findUnsupportedFields,
  isAliasKind,
  type C7OwnerDecision,
  type ProductAliasKind,
} from './product-identity.rules';

interface AliasViewRow extends QueryResultRow {
  id: string;
  product_id: string;
  alias: string;
  alias_norm: string;
  kind: string;
  created_at: string;
  /** برخوردِ نرم با کالای دیگر (همان بررسیِ موجود — نه یکتاییِ DB). */
  conflict_product_code: string | null;
  conflict_product_name: string | null;
  same_product_duplicate: boolean;
}

interface AttributeHistoryRow extends QueryResultRow {
  id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  event_label_fa: string;
  entity_type: string;
  entity_id: string;
  actor_user_id: string | null;
  actor_label_fa: string;
  at: string;
  def_code: string | null;
  def_title: string | null;
}

export interface AliasItem {
  id: string;
  product_id: string;
  alias: string;
  alias_norm: string;
  kind: ProductAliasKind;
  kind_label_fa: string;
  used_in_scan: boolean;
  warning_fa: string | null;
  conflict: { product_id: string | null; code: string | null; name: string | null } | null;
  created_at: string | null;
}

export interface AliasOverview {
  product: { id: string; code: string; name: string | null; status: string };
  scope: 'central';
  actor: { can_view: boolean; can_update: boolean; unavailable_reason_fa: string | null };
  kinds: readonly { kind: string; label_fa: string; meaning_fa: string; used_in_scan: boolean; evidence: string }[];
  items: AliasItem[];
  /** سازگاریِ عقب‌رو: آرایهٔ سادهٔ ردیف‌های product_alias. */
  aliases: { id: string; product_id: string; alias: string; alias_norm: string; kind: string }[];
  counts: { total: number; brand_slang: number; latin: number; code: number; truncated: boolean };
  scan_resolution_fa: string;
  downstream_notes_fa: readonly string[];
  owner_decisions_fa: readonly C7OwnerDecision[];
}

export interface AttributeValueView {
  def_id: string;
  code: string;
  title: string;
  kind: 'text' | 'number' | 'enum';
  kind_label_fa: string;
  is_variant_axis: boolean;
  is_required: boolean;
  sort_order: number;
  enum_values: { id: string; value: string }[];
  value: { id: string | null; value_text: string | null; value_num: string | null; value_enum: string | null };
  /** نوع مقدارِ ذخیره‌شده با kindِ صفت هم‌راستاست (قید DB). */
  filled: boolean;
  warning_fa: string | null;
}

export interface AttributesOverview {
  product: { id: string; code: string; name: string | null; status: string };
  scope: 'central';
  actor: { can_view: boolean; can_update: boolean; unavailable_reason_fa: string | null };
  variant_signature: string | null;
  signature_locked: boolean;
  signature_rule_fa: string;
  required_policy_fa: string;
  kinds: readonly { kind: string; label_fa: string; meaning_fa: string; evidence: string }[];
  attributes: AttributeValueView[];
  /** سازگاریِ عقب‌رو: همان شکلِ پیش از C7 برای مصرف‌کننده‌های موجود. */
  values: { id: string; product_id: string; def_id: string; value_text: string | null; value_num: string | null; value_enum: string | null }[];
  counts: { total: number; filled: number; required: number; required_missing: number; variant_axes: number };
  downstream_notes_fa: readonly string[];
  owner_decisions_fa: readonly C7OwnerDecision[];
}

const asRecord = (raw: unknown): Record<string, unknown> | null =>
  raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;

const validationError = (fields: Record<string, string[]>): never => {
  throw new BadRequestException({
    code: 'validation_failed',
    message_fa: 'درخواست نامعتبر است؛ فیلدهای مشخص‌شده را بررسی کنید.',
    details: { fields },
  });
};

const STATUS_LABELS_FA: Record<string, string> = {
  active: 'فعال',
  blocked: 'مسدود',
  discontinued: 'متوقف',
};

/**
 * TASK-PM-02-C7 — هویتِ کالا: نام‌های جایگزین و مقادیرِ صفات.
 *
 * دامنهٔ مجاز فقط عملیات‌هایی است که قواعد موجود اجازه می‌دهند:
 *  - alias: فهرست، افزودن (با نرمال‌سازی و کنترلِ برخوردِ H-1)، حذف. **بدون ویرایش**
 *    چون سیاست مصوبی برای UPDATE وجود ندارد (C7-D2).
 *  - attribute: فهرستِ تعاریف (کاتالوگِ شرکت)، مقادیرِ صفاتِ یک کالا، ثبت/پاک کردنِ
 *    مقدار با اعتبارسنجیِ kind/enum/الزام، امضای variant (M-3) و قاعدهٔ تغییرناپذیری.
 *
 * هیچ تاکسونومی، الزامِ تازه، نوعِ دادهٔ تازه یا اثر عملیاتی ساخته نمی‌شود.
 */
@Injectable()
export class ProductIdentityService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly access: CatalogAccess,
    @Inject(AUDIT_SERVICE) private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- helpers

  private assertProductId(id: string): void {
    if (!isUUID(id, '4')) {
      throw new BadRequestException({ code: 'invalid_id', message_fa: 'شناسهٔ کالا معتبر نیست.' });
    }
  }

  private assertClientPayload(raw: unknown, allowed: readonly string[]): Record<string, unknown> {
    const obj = asRecord(raw) ?? {};
    const forbidden = findC7ForbiddenFields(obj);
    if (forbidden.length > 0) {
      throw new BadRequestException({
        code: 'forbidden_client_field',
        message_fa: 'فیلدهای مالکیت، شرکت، هویت، مجوز یا ممیزی از کلاینت پذیرفته نمی‌شود.',
        details: { fields: forbidden },
      });
    }
    const unsupported = findUnsupportedFields(obj, allowed);
    if (unsupported.length > 0) {
      throw new BadRequestException({
        code: 'unsupported_request_field',
        message_fa: 'فیلدهای ارسالی در قرارداد این عملیات تعریف نشده‌اند.',
        details: { fields: unsupported },
      });
    }
    return obj;
  }

  private safeFailure(err: unknown, surface: 'read' | 'write'): never {
    if (err instanceof HttpException) throw err;
    if ((err as { code?: string })?.code === 'audit_partition_missing') {
      throw new ConflictException({
        code: 'audit_partition_missing',
        message_fa: 'ثبت ممیزی ممکن نشد؛ هیچ تغییری اعمال نشد.',
      });
    }
    throw new InternalServerErrorException({
      code: surface === 'read' ? 'identity_read_failed' : 'identity_write_failed',
      message_fa: surface === 'read'
        ? 'دریافت اطلاعات هویت کالا ممکن نشد؛ دوباره تلاش کنید.'
        : 'ثبت تغییر هویت کالا ممکن نشد؛ هیچ تغییری اعمال نشد.',
    });
  }

  private async loadProduct(
    companyId: string,
    productId: string,
  ): Promise<{ id: string; code: string; name: string | null; status: string }> {
    const { rows } = await this.pool.query<{ id: string; code: string; name: string | null; status: string }>(
      `select id, code, name, status from product
        where id = $1 and company_id = $2 and deleted_at is null`,
      [productId, companyId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException({ code: 'not_found', message_fa: 'کالا یافت نشد.' });
    return row;
  }

  // ----------------------------------------------------------------- alias

  private parseAliasBody(raw: unknown): { alias: string; kind: ProductAliasKind } {
    const obj = this.assertClientPayload(raw, ALIAS_CREATE_FIELDS);
    const issues: Record<string, string[]> = {};
    const rawAlias = obj.alias;
    if (typeof rawAlias !== 'string') {
      issues.alias = ['نام جایگزین باید متن باشد.'];
    } else {
      const trimmed = rawAlias.trim();
      if (trimmed.length === 0) issues.alias = ['نام جایگزین نمی‌تواند خالی باشد.'];
      else if (trimmed.length > PRODUCT_ALIAS_MAX_LENGTH) {
        issues.alias = [`طول نام جایگزین بیش از ${PRODUCT_ALIAS_MAX_LENGTH} نویسه است.`];
      } else if (!normalizeText(trimmed)) {
        issues.alias = ['نام جایگزین پس از نرمال‌سازی خالی است.'];
      }
    }
    let kind: ProductAliasKind = 'brand_slang';
    if (obj.kind !== undefined) {
      if (!isAliasKind(obj.kind)) {
        issues.kind = ['نوع نام جایگزین باید brand_slang، latin یا code باشد.'];
      } else {
        kind = obj.kind;
      }
    }
    if (obj.confirm_add !== undefined && typeof obj.confirm_add !== 'boolean') {
      issues.confirm_add = ['تأیید افزودن باید true یا false باشد.'];
    }
    if (Object.keys(issues).length > 0) validationError(issues);
    return { alias: (rawAlias as string).trim(), kind };
  }

  private parseAliasQuery(raw: unknown): { kind: ProductAliasKind | null; limit: number } {
    const obj = this.assertClientPayload(raw, ALIAS_LIST_QUERY_FIELDS);
    let kind: ProductAliasKind | null = null;
    if (obj.kind !== undefined) {
      if (!isAliasKind(obj.kind)) validationError({ kind: ['نوع نام جایگزین نامعتبر است.'] });
      kind = obj.kind as ProductAliasKind;
    }
    let limit = 100;
    if (obj.limit !== undefined) {
      const n = typeof obj.limit === 'string' && /^\d{1,3}$/.test(obj.limit) ? Number(obj.limit) : obj.limit;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > PRODUCT_ALIAS_LIST_LIMIT) {
        validationError({ limit: [`حد نمایش باید عددی بین ۱ و ${PRODUCT_ALIAS_LIST_LIMIT} باشد.`] });
      }
      limit = n as number;
    }
    return { kind, limit };
  }

  private toAliasItem(row: AliasViewRow): AliasItem {
    const conflict = row.conflict_product_code
      ? { product_id: null as string | null, code: row.conflict_product_code, name: row.conflict_product_name }
      : null;
    return {
      id: row.id,
      product_id: row.product_id,
      alias: row.alias,
      alias_norm: row.alias_norm,
      kind: row.kind as ProductAliasKind,
      kind_label_fa: ALIAS_KIND_LABELS_FA[row.kind] ?? row.kind,
      used_in_scan: row.kind === 'code',
      warning_fa: aliasKindWarningFa(row.kind),
      conflict,
      created_at: row.created_at ?? null,
    };
  }

  /** نمای نام‌های جایگزین + برخوردهای نرم (فقط اطلاع‌رسان؛ قاعدهٔ تازه نمی‌سازد). */
  async listAliases(user: AuthContext, productId: string, rawQuery: unknown): Promise<AliasOverview> {
    this.assertProductId(productId);
    const query = this.parseAliasQuery(rawQuery);
    try {
      const permissions = await this.access.assert(user.companyId, user.userId, 'master.product.view');
      const canUpdate = permissions.some((p) => permissionMatches(p, 'master.product.update'));
      const product = await this.loadProduct(user.companyId, productId);

      const { rows } = await this.pool.query<AliasViewRow>(
        `select a.id, a.product_id, a.alias, a.alias_norm, a.kind,
                to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at,
                other.code as conflict_product_code,
                other.name as conflict_product_name,
                exists (
                  select 1 from product_alias d
                   where d.company_id = a.company_id and d.product_id = a.product_id
                     and d.alias_norm = a.alias_norm and d.id <> a.id
                ) as same_product_duplicate
           from product_alias a
           left join lateral (
             select p2.code, p2.name
               from product_alias o
               join product p2 on p2.id = o.product_id and p2.company_id = o.company_id
              where o.company_id = a.company_id and o.alias_norm = a.alias_norm
                and o.product_id <> a.product_id and p2.deleted_at is null
              order by p2.code
              limit 1
           ) other on true
          where a.company_id = $1 and a.product_id = $2
            and ($3::text is null or a.kind = $3::text)
          order by a.kind, a.alias_norm, a.id
          limit $4`,
        [user.companyId, productId, query.kind, query.limit + 1],
      );
      const truncated = rows.length > query.limit;
      const items = rows.slice(0, query.limit).map((r) => this.toAliasItem(r));

      const countsRow = await this.pool.query<{ total: number; brand_slang: number; latin: number; code: number }>(
        `select count(*)::int as total,
                count(*) filter (where kind = 'brand_slang')::int as brand_slang,
                count(*) filter (where kind = 'latin')::int as latin,
                count(*) filter (where kind = 'code')::int as code
           from product_alias where company_id = $1 and product_id = $2`,
        [user.companyId, productId],
      );
      const counts = countsRow.rows[0] ?? { total: 0, brand_slang: 0, latin: 0, code: 0 };

      return {
        product,
        scope: 'central',
        actor: {
          can_view: true,
          can_update: canUpdate,
          unavailable_reason_fa: canUpdate
            ? null
            : ' این نشست مجوز ویرایش کاتالوگ (master.product.update) ندارد؛ فقط مشاهده مجاز است.',
        },
        kinds: PRODUCT_ALIAS_KIND_SPECS.map((k) => ({
          kind: k.kind,
          label_fa: k.label_fa,
          meaning_fa: k.meaning_fa,
          used_in_scan: k.used_in_scan,
          evidence: k.evidence,
        })),
        items,
        // سازگاریِ عقب‌رو: آرایهٔ سادهٔ product_alias برای مصرف‌کننده‌های پیش از C7
        aliases: items.map((i) => ({
          id: i.id,
          product_id: i.product_id,
          alias: i.alias,
          alias_norm: i.alias_norm,
          kind: i.kind,
        })),
        counts: { ...counts, truncated },
        scan_resolution_fa:
          'ترتیب قطعی اسکن (H-1): بارکد ← کد کالا ← نام جایگزین نوع «کد جایگزین». برخورد چندپاسخی خطای صریح است و هرگز انتخاب خودسرانه انجام نمی‌شود.',
        downstream_notes_fa: C7_DOWNSTREAM_NOTES_FA,
        owner_decisions_fa: C7_OWNER_DECISIONS_FA,
      };
    } catch (err) {
      return this.safeFailure(err, 'read');
    }
  }

  /** افزودنِ نام جایگزین — همان قواعد موجود H-1 با ممیزیِ تراکنشی و پاسخِ کامل. */
  async addAlias(
    user: AuthContext,
    productId: string,
    rawBody: unknown,
    meta: RequestMeta,
  ): Promise<AliasItem> {
    this.assertProductId(productId);
    const body = this.parseAliasBody(rawBody);
    try {
      return await this.access.write(user.companyId, user.userId, 'master.product.update', async () => {
        const client: Runner | undefined = catalogTransaction.getStore() ?? undefined;
        await this.access.assert(user.companyId, user.userId, 'master.product.update');
        await this.loadProduct(user.companyId, productId);

        const aliasNorm = normalizeText(body.alias);
        if (!aliasNorm) {
          throw new BadRequestException({ code: 'invalid_alias', message_fa: 'مقدارِ نام جایگزین خالی است.' });
        }

        // سقفِ فنیِ تعداد نام جایگزین در هر کالا (نگهبان، نه قاعدهٔ کسب‌وکار)
        const countRow = await this.pool.query<{ n: number }>(
          `select count(*)::int as n from product_alias where company_id = $1 and product_id = $2`,
          [user.companyId, productId],
        );
        if ((countRow.rows[0]?.n ?? 0) >= PRODUCT_ALIAS_MAX_PER_PRODUCT) {
          throw new ConflictException({
            code: 'alias_limit_reached',
            message_fa: `سقف فنیِ ${PRODUCT_ALIAS_MAX_PER_PRODUCT} نام جایگزین برای این کالا پر شده است.`,
          });
        }

        // همان بررسی برخوردِ موجود (H-1): بارکد، کد کالا، نام جایگزینِ کالای دیگر
        const collisions = await this.pool.query<{ kind: string; product_id: string; code: string; name: string }>(
          `select 'product_code' as kind, p.id as product_id, p.code, p.name
             from product p
            where p.company_id = $1 and p.deleted_at is null and lower(p.code) = $2
           union all
           select 'alias', a.product_id, p.code, p.name
             from product_alias a join product p on p.id = a.product_id
            where a.company_id = $1 and a.alias_norm = $2 and p.deleted_at is null
           union all
           select 'barcode', b.product_id, p.code, p.name
             from product_barcode b join product p on p.id = b.product_id
            where b.company_id = $1 and lower(b.barcode) = lower($2) and p.deleted_at is null`,
          [user.companyId, aliasNorm],
        );
        for (const c of collisions.rows) {
          if (c.kind === 'barcode') {
            throw new ConflictException({
              code: 'alias_collision',
              message_fa: 'این نام جایگزین با بارکدِ ثبت‌شده هم‌ارز است و resolution اسکن را دوپهلو می‌کند.',
              details: { product_id: c.product_id },
            });
          }
          if (c.product_id !== productId && (body.kind === 'code' || c.kind === 'product_code')) {
            throw new ConflictException({
              code: 'alias_collision',
              message_fa: 'این نام جایگزین با کد/نام جایگزینِ کالای دیگری برخورد دارد.',
              details: { product_id: c.product_id },
            });
          }
          if (c.product_id !== productId && c.kind === 'alias') {
            throw new ConflictException({
              code: 'alias_collision',
              message_fa: 'این نام جایگزین برای کالای دیگری ثبت شده است.',
              details: { product_id: c.product_id },
            });
          }
        }

        let row: { id: string; product_id: string; alias: string; alias_norm: string; kind: string };
        try {
          const inserted = await this.pool.query<typeof row>(
            `insert into product_alias (company_id, product_id, alias, alias_norm, kind)
             values ($1, $2, $3, $4, $5)
             returning id, product_id, alias, alias_norm, kind`,
            [user.companyId, productId, body.alias, aliasNorm, body.kind],
          );
          row = inserted.rows[0];
        } catch (err) {
          if ((err as { code?: string }).code === '23505') {
            throw new ConflictException({
              code: 'duplicate_alias',
              message_fa: 'این نام جایگزین برای همین کالا قبلاً ثبت شده است.',
            });
          }
          throw err;
        }

        await this.audit.recordRequired(
          {
            companyId: user.companyId,
            actorUserId: user.userId,
            action: 'create',
            entityType: 'product_alias',
            entityId: row.id,
            after: { product_id: productId, alias: body.alias, alias_norm: aliasNorm, kind: body.kind },
            ip: meta.ip ?? null,
            userAgent: meta.userAgent ?? null,
            requestId: meta.requestId ?? null,
          },
          client,
        );

        return {
          id: row.id,
          product_id: row.product_id,
          alias: row.alias,
          alias_norm: row.alias_norm,
          kind: row.kind as ProductAliasKind,
          kind_label_fa: ALIAS_KIND_LABELS_FA[row.kind] ?? row.kind,
          used_in_scan: row.kind === 'code',
          warning_fa: aliasKindWarningFa(row.kind),
          conflict: null,
          created_at: null,
        };
      });
    } catch (err) {
      return this.safeFailure(err, 'write');
    }
  }

  /** حذفِ نام جایگزین — فقط همین شرکت و فقط ردیف‌های همین کالا (سیاست موجود). */
  async removeAlias(
    user: AuthContext,
    productId: string,
    aliasId: string,
    meta: RequestMeta,
  ): Promise<{ deleted: true; alias_id: string }> {
    this.assertProductId(productId);
    if (!isUUID(aliasId, '4')) {
      throw new BadRequestException({ code: 'invalid_id', message_fa: 'شناسهٔ نام جایگزین معتبر نیست.' });
    }
    try {
      return await this.access.write(user.companyId, user.userId, 'master.product.update', async () => {
        const client: Runner | undefined = catalogTransaction.getStore() ?? undefined;
        await this.access.assert(user.companyId, user.userId, 'master.product.update');
        await this.loadProduct(user.companyId, productId);
        const found = await this.pool.query<{ id: string; alias: string; alias_norm: string; kind: string }>(
          `select id, alias, alias_norm, kind from product_alias
            where id = $1 and company_id = $2 and product_id = $3`,
          [aliasId, user.companyId, productId],
        );
        const existing = found.rows[0];
        if (!existing) {
          throw new NotFoundException({ code: 'alias_not_found', message_fa: 'نام جایگزین یافت نشد.' });
        }
        await this.pool.query(
          `delete from product_alias where id = $1 and company_id = $2 and product_id = $3`,
          [aliasId, user.companyId, productId],
        );
        await this.audit.recordRequired(
          {
            companyId: user.companyId,
            actorUserId: user.userId,
            action: 'delete',
            entityType: 'product_alias',
            entityId: aliasId,
            before: {
              product_id: productId,
              alias: existing.alias,
              alias_norm: existing.alias_norm,
              kind: existing.kind,
            },
            ip: meta.ip ?? null,
            userAgent: meta.userAgent ?? null,
            requestId: meta.requestId ?? null,
          },
          client,
        );
        return { deleted: true as const, alias_id: aliasId };
      });
    } catch (err) {
      return this.safeFailure(err, 'write');
    }
  }

  // ------------------------------------------------------------- attribute

  private parseAttributeQuery(raw: unknown): { includeInactive: boolean } {
    const obj = this.assertClientPayload(raw, ATTRIBUTE_VALUES_QUERY_FIELDS);
    let includeInactive = false;
    if (obj.include_inactive !== undefined) {
      if (obj.include_inactive !== 'true' && obj.include_inactive !== 'false' && typeof obj.include_inactive !== 'boolean') {
        validationError({ include_inactive: ['مقدار باید true یا false باشد.'] });
      }
      includeInactive = obj.include_inactive === true || obj.include_inactive === 'true';
    }
    return { includeInactive };
  }

  /**
   * نمای صفات یک کالا: تعاریفِ کاتالوگ + مقدارِ ثبت‌شده + وضعیت الزام/محور + امضا.
   * دسترسی فقط شرکتِ نشست؛ کالای ناموجود/بین‌شرکتی ۴۰۴ یکنواخت.
   */
  async listAttributes(user: AuthContext, productId: string, rawQuery: unknown): Promise<AttributesOverview> {
    this.assertProductId(productId);
    this.parseAttributeQuery(rawQuery);
    try {
      const permissions = await this.access.assert(user.companyId, user.userId, 'master.product.view');
      const canUpdate = permissions.some((p) => permissionMatches(p, 'master.product.update'));
      const product = await this.loadProduct(user.companyId, productId);

      const defs = await this.pool.query<{
        id: string; code: string; title: string; kind: string;
        is_variant_axis: boolean; is_required: boolean; sort_order: number;
      }>(
        `select id, code, title, kind, is_variant_axis, is_required, sort_order
           from product_attribute_def where company_id = $1 order by sort_order, code`,
        [user.companyId],
      );
      const enumValues = await this.pool.query<{ id: string; def_id: string; value: string }>(
        `select e.id, e.def_id, e.value
           from product_attribute_enum_value e
           join product_attribute_def d on d.id = e.def_id and d.company_id = $1
          order by e.value`,
        [user.companyId],
      );
      const values = await this.pool.query<{
        id: string; product_id: string; def_id: string; value_text: string | null; value_num: string | null; value_enum: string | null;
      }>(
        `select v.id, v.product_id, v.def_id, v.value_text, v.value_num, v.value_enum
           from product_attribute_value v
           join product p on p.id = v.product_id and p.company_id = $1
          where v.product_id = $2`,
        [user.companyId, productId],
      );
      const sigRow = await this.pool.query<{ variant_signature: string | null }>(
        `select variant_signature from product where id = $1 and company_id = $2`,
        [productId, user.companyId],
      );
      const variantSignature = sigRow.rows[0]?.variant_signature ?? null;
      const locked = variantSignature
        ? (await this.pool.query<{ ok: boolean }>(
            `select exists (
               select 1 from sales_order_line where product_id = $1
               union all select 1 from invoice_line where product_id = $1
               union all select 1 from price_list_item where product_id = $1
               union all select 1 from inventory_txn where product_id = $1
               union all select 1 from waybill_line where product_id = $1
               limit 1
             ) as ok`,
            [productId],
          )).rows[0]?.ok === true
        : false;

      const enumByDef = new Map<string, { id: string; value: string }[]>();
      for (const e of enumValues.rows) {
        const list = enumByDef.get(e.def_id) ?? [];
        list.push({ id: e.id, value: e.value });
        enumByDef.set(e.def_id, list);
      }
      const valueByDef = new Map(values.rows.map((v) => [v.def_id, v]));

      const attributes: AttributeValueView[] = defs.rows.map((d) => {
        const v = valueByDef.get(d.id);
        const stored = v
          ? { id: v.id, value_text: v.value_text, value_num: v.value_num, value_enum: v.value_enum }
          : { id: null, value_text: null, value_num: null, value_enum: null };
        const filled = Boolean(stored.value_text ?? stored.value_num ?? stored.value_enum);
        return {
          def_id: d.id,
          code: d.code,
          title: d.title,
          kind: d.kind as 'text' | 'number' | 'enum',
          kind_label_fa: ATTRIBUTE_KIND_LABELS_FA[d.kind] ?? d.kind,
          is_variant_axis: d.is_variant_axis,
          is_required: d.is_required,
          sort_order: d.sort_order,
          enum_values: enumByDef.get(d.id) ?? [],
          value: stored,
          filled,
          warning_fa: attributeRequiredWarningFa(d.is_required),
        };
      });

      const required = attributes.filter((a) => a.is_required);
      return {
        product,
        scope: 'central',
        actor: {
          can_view: true,
          can_update: canUpdate,
          unavailable_reason_fa: canUpdate
            ? null
            : ' این نشست مجوز ویرایش کاتالوگ (master.product.update) ندارد؛ فقط مشاهده مجاز است.',
        },
        variant_signature: variantSignature,
        signature_locked: locked,
        signature_rule_fa:
          'امضا فقط از صفاتِ «محور variant» با ترتیب قطعی (def_id) و sha256 ساخته می‌شود؛ پس از نخستین ارجاع عملیاتی، تغییر محورها ممنوع است (M-3).',
        required_policy_fa:
          'صفاتِ «الزامی» در سطح کل شرکت الزامی‌اند (نه دسته‌محور). دامنهٔ دقیق‌تر تصمیم مالک است (C7-D4).',
        kinds: PRODUCT_ATTRIBUTE_KIND_SPECS.map((k) => ({
          kind: k.kind,
          label_fa: k.label_fa,
          meaning_fa: k.meaning_fa,
          evidence: k.evidence,
        })),
        attributes,
        values: values.rows.map((v) => ({
          id: v.id,
          product_id: v.product_id,
          def_id: v.def_id,
          value_text: v.value_text,
          value_num: v.value_num,
          value_enum: v.value_enum,
        })),
        counts: {
          total: attributes.length,
          filled: attributes.filter((a) => a.filled).length,
          required: required.length,
          required_missing: required.filter((a) => !a.filled).length,
          variant_axes: attributes.filter((a) => a.is_variant_axis).length,
        },
        downstream_notes_fa: C7_DOWNSTREAM_NOTES_FA,
        owner_decisions_fa: C7_OWNER_DECISIONS_FA,
      };
    } catch (err) {
      return this.safeFailure(err, 'read');
    }
  }

  /**
   * ثبتِ مقدارِ صفات — همان قواعد موجود (kind/enum/الزام/M-3) با اصلاحِ دو ایرادِ
   * واقعیِ پیش از C7: مقدارِ خالی قبلاً `500` می‌داد (نقضِ قید DB)، و پاک‌کردنِ
   * مقدار ممکن نبود. اکنون مقدارِ خالی = حذفِ ردیف (`clear`).
   */
  async setAttributeValues(
    user: AuthContext,
    productId: string,
    rawBody: unknown,
    meta: RequestMeta,
  ): Promise<{ values: unknown[]; variant_signature: string | null; cleared: string[] }> {
    this.assertProductId(productId);
    const body = this.assertClientPayload(rawBody, ATTRIBUTE_VALUES_BODY_FIELDS);
    const rawValues = body.values;
    if (!Array.isArray(rawValues)) {
      validationError({ values: ['فهرست مقادیر باید آرایه باشد.'] });
    }
    if ((rawValues as unknown[]).length > PRODUCT_ATTRIBUTE_VALUES_MAX_ITEMS) {
      validationError({ values: [`تعداد مقادیر بیش از سقف فنی ${PRODUCT_ATTRIBUTE_VALUES_MAX_ITEMS} است.`] });
    }
    const issues: Record<string, string[]> = {};
    const items: { def_id: string; value_text: string | null; value_num: number | null; value_enum: string | null; clear: boolean }[] = [];
    const seen = new Set<string>();
    for (const [index, raw] of (rawValues as unknown[]).entries()) {
      const field = `values[${index}]`;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        issues[field] = ['هر مقدار باید شیء باشد.'];
        continue;
      }
      const forbidden = findC7ForbiddenFields(raw);
      if (forbidden.length > 0) {
        throw new BadRequestException({
          code: 'forbidden_client_field',
          message_fa: 'فیلدهای مالکیت، شرکت، هویت، مجوز یا ممیزی از کلاینت پذیرفته نمی‌شود.',
          details: { fields: forbidden },
        });
      }
      const unsupported = findUnsupportedFields(raw, ATTRIBUTE_VALUE_ITEM_FIELDS);
      if (unsupported.length > 0) {
        throw new BadRequestException({
          code: 'unsupported_request_field',
          message_fa: 'فیلدهای ارسالی در قرارداد مقادیر صفات تعریف نشده‌اند.',
          details: { fields: unsupported.map((f) => `${field}.${f}`) },
        });
      }
      const item = raw as Record<string, unknown>;
      if (typeof item.def_id !== 'string' || !isUUID(item.def_id, '4')) {
        issues[`${field}.def_id`] = ['شناسهٔ صفت باید UUID معتبر باشد.'];
        continue;
      }
      if (seen.has(item.def_id)) {
        issues[`${field}.def_id`] = ['همین صفت در درخواست تکرار شده است.'];
        continue;
      }
      seen.add(item.def_id);
      if (item.value_text !== undefined && item.value_text !== null && typeof item.value_text !== 'string') {
        issues[`${field}.value_text`] = ['مقدار متنی باید متن باشد.'];
      } else if (typeof item.value_text === 'string' && item.value_text.length > PRODUCT_ATTRIBUTE_VALUE_TEXT_MAX_LENGTH) {
        issues[`${field}.value_text`] = [`طول مقدار متنی بیش از ${PRODUCT_ATTRIBUTE_VALUE_TEXT_MAX_LENGTH} نویسه است.`];
      }
      let valueNum: number | null = null;
      if (item.value_num !== undefined && item.value_num !== null) {
        const n = typeof item.value_num === 'string' && /^-?\d+(\.\d+)?$/.test(item.value_num)
          ? Number(item.value_num)
          : item.value_num;
        if (typeof n !== 'number' || !Number.isFinite(n)) {
          issues[`${field}.value_num`] = ['مقدار عددی باید عدد باشد.'];
        } else if (Math.abs(n) > PRODUCT_ATTRIBUTE_NUMERIC_MAX_ABS) {
          issues[`${field}.value_num`] = ['مقدار عددی از دامنهٔ مجاز (numeric(19,4)) بیرون است.'];
        } else {
          valueNum = n;
        }
      }
      if (item.value_enum !== undefined && item.value_enum !== null && typeof item.value_enum !== 'string') {
        issues[`${field}.value_enum`] = ['مقدار انتخابی باید متن باشد.'];
      }
      if (item.clear !== undefined && typeof item.clear !== 'boolean') {
        issues[`${field}.clear`] = ['clear باید true یا false باشد.'];
      }
      items.push({
        def_id: item.def_id as string,
        value_text: typeof item.value_text === 'string' && item.value_text.trim() !== '' ? item.value_text.trim() : null,
        value_num: valueNum,
        value_enum: typeof item.value_enum === 'string' && item.value_enum.trim() !== '' ? item.value_enum.trim() : null,
        clear: item.clear === true,
      });
    }
    if (Object.keys(issues).length > 0) validationError(issues);

    try {
      return await this.access.write(user.companyId, user.userId, 'master.product.update', async () => {
        const client: Runner | undefined = catalogTransaction.getStore() ?? undefined;
        await this.access.assert(user.companyId, user.userId, 'master.product.update');
        await this.loadProduct(user.companyId, productId);

        const defs = await this.pool.query<{
          id: string; code: string; title: string; kind: string; is_variant_axis: boolean; is_required: boolean;
        }>(
          `select id, code, title, kind, is_variant_axis, is_required
             from product_attribute_def where company_id = $1`,
          [user.companyId],
        );
        const defMap = new Map(defs.rows.map((d) => [d.id, d]));
        const existingValues = await this.pool.query<{
          id: string; def_id: string; value_text: string | null; value_num: string | null; value_enum: string | null;
        }>(
          `select v.id, v.def_id, v.value_text, v.value_num, v.value_enum
             from product_attribute_value v
             join product p on p.id = v.product_id and p.company_id = $1
            where v.product_id = $2`,
          [user.companyId, productId],
        );
        const existingMap = new Map(existingValues.rows.map((v) => [v.def_id, v]));

        const sigRow = await this.pool.query<{ variant_signature: string | null }>(
          `select variant_signature from product where id = $1 and company_id = $2`,
          [productId, user.companyId],
        );
        const previousSignature = sigRow.rows[0]?.variant_signature ?? null;
        const hasRefs = previousSignature
          ? (await this.pool.query<{ ok: boolean }>(
              `select exists (
                 select 1 from sales_order_line where product_id = $1
                 union all select 1 from invoice_line where product_id = $1
                 union all select 1 from price_list_item where product_id = $1
                 union all select 1 from inventory_txn where product_id = $1
                 union all select 1 from waybill_line where product_id = $1
                 limit 1
               ) as ok`,
              [productId],
            )).rows[0]?.ok === true
          : false;

        // ---- اعتبارسنجیِ همان قواعد موجود + اصلاح مقدارِ خالی
        const toClear: string[] = [];
        const toUpsert: { def_id: string; value_text: string | null; value_num: string | null; value_enum: string | null }[] = [];
        for (const item of items) {
          const def = defMap.get(item.def_id);
          if (!def) {
            throw new BadRequestException({
              code: 'invalid_attribute',
              message_fa: 'صفتِ انتخاب‌شده در کاتالوگِ این شرکت وجود ندارد.',
              details: { def_id: item.def_id },
            });
          }
          const filled = [item.value_text, item.value_num, item.value_enum]
            .filter((x) => x !== null && x !== undefined);
          if (filled.length > 1) {
            throw new BadRequestException({
              code: 'invalid_attribute_value',
              message_fa: `برای صفتِ «${def.title}» فقط یک مقدار مجاز است.`,
              details: { def_id: def.id },
            });
          }
          const empty = filled.length === 0;
          if (item.clear || empty) {
            if (existingMap.has(def.id)) toClear.push(def.id);
            continue;
          }
          if (def.kind === 'number') {
            if (item.value_num === null) {
              throw new BadRequestException({
                code: 'invalid_attribute_value',
                message_fa: `صفتِ «${def.title}» عددی است و مقدار عددی می‌خواهد.`,
                details: { def_id: def.id },
              });
            }
          } else if (def.kind === 'text') {
            if (item.value_text === null) {
              throw new BadRequestException({
                code: 'invalid_attribute_value',
                message_fa: `صفتِ «${def.title}» متنی است و مقدار متنی می‌خواهد.`,
                details: { def_id: def.id },
              });
            }
          } else {
            const allowed = await this.pool.query<{ value_norm: string }>(
              `select e.value_norm from product_attribute_enum_value e
                 join product_attribute_def d on d.id = e.def_id and d.company_id = $1
                where e.def_id = $2`,
              [user.companyId, def.id],
            );
            const norm = normalizeAttributeValue('enum', item.value_enum);
            if (!allowed.rows.some((a) => a.value_norm === norm)) {
              throw new BadRequestException({
                code: 'invalid_attribute_value',
                message_fa: `مقدارِ «${item.value_enum ?? ''}» برای صفتِ «${def.title}» در فهرستِ مقادیرِ مجاز نیست.`,
                details: { def_id: def.id },
              });
            }
          }
          toUpsert.push({
            def_id: def.id,
            value_text: item.value_text,
            value_num: item.value_num === null ? null : String(item.value_num),
            value_enum: item.value_enum,
          });
        }

        // ---- الزامِ is_required روی وضعیتِ نهایی (نه فقط ردیف‌های ارسالی)
        const finalIds = new Set<string>([
          ...[...existingMap.keys()].filter((id) => !toClear.includes(id) && defMap.has(id)),
          ...toUpsert.map((u) => u.def_id),
        ]);
        // TASK-PM-02-C14: همان قراردادِ مشترک (ترتیبِ قطعیِ code/id)؛ details.def_id
        // قراردادِ قبلی را حفظ می‌کند و details.missing فهرستِ کاملِ field-addressable است.
        const missing = findMissingRequiredAttributes(
          defs.rows.filter((d) => d.is_required),
          finalIds,
        );
        if (missing.length > 0) {
          throw new BadRequestException(
            requiredAttributeMissingExceptionBody(missing, 'attribute_values'),
          );
        }

        // ---- M-3: تغییرِ محورهای variant پس از ارجاعِ عملیاتی ممنوع
        const axisDefs = defs.rows.filter((d) => d.is_variant_axis);
        const axisIds = new Set(axisDefs.map((d) => d.id));
        const changesAxis = toUpsert.some((u) => axisIds.has(u.def_id)) || toClear.some((id) => axisIds.has(id));
        if (hasRefs && changesAxis) {
          throw new ConflictException({
            code: 'variant_signature_immutable',
            message_fa:
              'پس از نخستین ارجاعِ عملیاتی (سند/موجودی/قیمت)، محورهای variant تغییرناپذیرند؛ SKU جدید بسازید و SKU قبلی را بازنشسته کنید.',
          });
        }

        // ---- اعمال: حذفِ مقدارهای پاک‌شده، سپس upsert
        for (const defId of toClear) {
          await this.pool.query(
            `delete from product_attribute_value v
              using product p
              where v.product_id = p.id and p.company_id = $1 and v.product_id = $2 and v.def_id = $3`,
            [user.companyId, productId, defId],
          );
        }
        const saved: unknown[] = [];
        for (const u of toUpsert) {
          const res = await this.pool.query(
            `insert into product_attribute_value (product_id, def_id, value_text, value_num, value_enum)
             values ($1, $2, $3, $4, $5)
             on conflict (product_id, def_id) do update
               set value_text = excluded.value_text,
                   value_num = excluded.value_num,
                   value_enum = excluded.value_enum
             returning id, product_id, def_id, value_text, value_num, value_enum`,
            [productId, u.def_id, u.value_text, u.value_num, u.value_enum],
          );
          saved.push(res.rows[0]);
        }

        // ---- امضای قطعی variant (فقط محورها) — همان الگوریتم موجود
        const finalValues = await this.pool.query<{
          def_id: string; value_text: string | null; value_num: string | null; value_enum: string | null;
        }>(
          `select v.def_id, v.value_text, v.value_num, v.value_enum
             from product_attribute_value v
             join product p on p.id = v.product_id and p.company_id = $1
            where v.product_id = $2`,
          [user.companyId, productId],
        );
        const entries = finalValues.rows
          .filter((v) => defMap.get(v.def_id)?.is_variant_axis)
          .map((v) => {
            const def = defMap.get(v.def_id)!;
            const rawVal = v.value_text ?? v.value_enum ?? v.value_num;
            return { defId: v.def_id, valueNorm: normalizeAttributeValue(def.kind as 'text' | 'number' | 'enum', rawVal) };
          })
          .sort((a, b) => (a.defId < b.defId ? -1 : a.defId > b.defId ? 1 : 0));
        const signature = entries.length > 0 ? computeVariantSignature(entries) : null;
        try {
          await this.pool.query(
            `update product set variant_signature = $1 where id = $2 and company_id = $3`,
            [signature, productId, user.companyId],
          );
        } catch (err) {
          if ((err as { code?: string; constraint?: string }).code === '23505') {
            throw new ConflictException({
              code: 'duplicate_variant_signature',
              message_fa: 'ترکیبِ این محورهای variant در همین خانواده قبلاً برای SKU دیگری ثبت شده است.',
            });
          }
          throw err;
        }

        await this.audit.recordRequired(
          {
            companyId: user.companyId,
            actorUserId: user.userId,
            action: 'update',
            entityType: 'product_attribute_value',
            entityId: productId,
            before: { variant_signature: previousSignature },
            after: { def_ids: [...finalIds].sort(), cleared: toClear.sort(), variant_signature: signature },
            ip: meta.ip ?? null,
            userAgent: meta.userAgent ?? null,
            requestId: meta.requestId ?? null,
          },
          client,
        );

        return { values: saved, variant_signature: signature, cleared: toClear.sort() };
      });
    } catch (err) {
      return this.safeFailure(err, 'write');
    }
  }

  /** تاریخچهٔ تغییرناپذیر هویتِ کالا (alias + attribute) از تریگر ۰۰۶۰. */
  async identityHistory(user: AuthContext, productId: string): Promise<{
    items: AttributeHistoryRow[];
    limit: number;
    source_fa: string;
  }> {
    this.assertProductId(productId);
    try {
      await this.access.assert(user.companyId, user.userId, 'master.product.view');
      await this.loadProduct(user.companyId, productId);
      const { rows } = await this.pool.query<AttributeHistoryRow>(
        `select h.id::text as id,
                h.action,
                case h.action when 'INSERT' then 'ایجاد'
                              when 'UPDATE' then 'ویرایش'
                              else 'حذف' end as event_label_fa,
                h.entity_type,
                h.entity_id::text as entity_id,
                h.actor_user_id,
                coalesce(
                  nullif(btrim(concat_ws(' ', per.first_name, per.last_name)), ''),
                  nullif(btrim(per.legal_name), ''),
                  nullif(btrim(u.username), ''),
                  'ثبت سیستمی / ناشناخته'
                ) as actor_label_fa,
                to_char(h.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as at,
                coalesce(h.after_data->>'code', h.before_data->>'code') as def_code,
                coalesce(h.after_data->>'title', h.before_data->>'title') as def_title
           from product_catalog_history h
           left join app_user u on u.id = h.actor_user_id
           left join person per on per.id = u.person_id and per.company_id = $1
          where h.company_id = $1
            and h.entity_type in ('product_alias','product_attribute_value')
            and (
              h.product_id = $2
              or coalesce(h.after_data->>'product_id', h.before_data->>'product_id')::uuid = $2
            )
          order by h.id desc
          limit $3`,
        [user.companyId, productId, PRODUCT_ATTRIBUTE_HISTORY_LIMIT],
      );
      return {
        items: rows,
        limit: PRODUCT_ATTRIBUTE_HISTORY_LIMIT,
        source_fa: 'تاریخچهٔ تغییرناپذیر کاتالوگ (تریگر ۰۰۶۰)؛ بدون before/after خام.',
      };
    } catch (err) {
      return this.safeFailure(err, 'read');
    }
  }
}
