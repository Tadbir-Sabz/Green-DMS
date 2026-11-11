import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { type Runner, runner } from '../../common/transaction';
import type { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './product.dto';
import type { ExportProductsQueryDto } from './product-export.dto';
import type { ProductExportRow } from './product-export';
import type { BulkProductSnapshot } from './product-bulk-maintenance.types';

/**
 * ستون‌های پاسخ — دقیقاً مطابق اسکیمای Product در openapi.yaml
 * نکته: numeric از pg به‌صورت string برمی‌گردد؛ min_order_qty به عدد
 * cast می‌شود چون قرارداد آن را number اعلام کرده (پول‌ها همچنان string‌اند).
 */
const COLUMNS = `
  id, code, name, name_latin, family_id, category_id, brand_id, base_uom_id, tax_code_id,
  is_batch_tracked, is_expiry_tracked, shelf_life_days,
  is_returnable_container, requires_permit, distribution_kind,
  min_order_qty::double precision as min_order_qty, weight_gr, volume_cm3,
  status, variant_signature, created_at, row_version`;

export interface ProductRow extends QueryResultRow {
  id: string;
  code: string;
  name: string;
  name_latin: string | null;
  family_id: string | null;
  category_id: string;
  brand_id: string | null;
  base_uom_id: string;
  tax_code_id: string | null;
  is_batch_tracked: boolean;
  is_expiry_tracked: boolean;
  shelf_life_days: number | null;
  is_returnable_container: boolean;
  requires_permit: boolean;
  distribution_kind: string;
  min_order_qty: number;
  weight_gr: number | null;
  volume_cm3: number | null;
  status: string;
  variant_signature: string | null;
  created_at: string;
  row_version: number;
}

export interface ListProductsResult {
  items: ProductRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** ستون‌های قابل نوشتن در UPDATE — هرگز نام ستون از بیرون نمی‌آید (مصون از injection) */
const UPDATABLE: (keyof ProductRow)[] = [
  'code',
  'name',
  'name_latin',
  'family_id',
  'category_id',
  'brand_id',
  'base_uom_id',
  'tax_code_id',
  'is_batch_tracked',
  'is_expiry_tracked',
  'shelf_life_days',
  'is_returnable_container',
  'requires_permit',
  'distribution_kind',
  'min_order_qty',
  'weight_gr',
  'volume_cm3',
  'status',
];

const encodeCursor = (code: string): string => Buffer.from(code, 'utf8').toString('base64url');
const decodeCursor = (cursor: string): string =>
  Buffer.from(cursor, 'base64url').toString('utf8');

/**
 * دسترسی داده کالا — SQL خام روی جدول `product` (بدون ORM، طبق §۳.۲ سند).
 * نکته: به‌روزرسانی‌ها row_version را خودِ تریگر trg_touch (مهاجرت 0020) بالا می‌برد؛
 * حذف نرم با deleted_at است و همه کوئری‌ها آن را رد می‌کنند.
 */
@Injectable()
export class ProductRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(companyId: string, query: ListProductsQueryDto): Promise<ListProductsResult> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['company_id = $1', 'deleted_at is null'];

    if (query.q) {
      params.push(`%${query.q}%`);
      where.push(`(code ilike $${params.length} or name ilike $${params.length} or name_latin ilike $${params.length} or exists (select 1 from product_alias a where a.product_id = product.id and a.alias ilike $${params.length}))`);
    }
    if (query.category_id) {
      params.push(query.category_id);
      where.push(`category_id = $${params.length}`);
    }
    if (query.brand_id) {
      params.push(query.brand_id);
      where.push(`brand_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`status = $${params.length}`);
    }
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      where.push(`code ${query.sort === 'code_desc' ? '<' : '>'} $${params.length}`);
    }
    params.push(limit + 1);

    const { rows } = await this.pool.query<ProductRow>(
      `select ${COLUMNS} from product
        where ${where.join(' and ')}
        order by code ${query.sort === 'code_desc' ? 'desc' : 'asc'}
        limit $${params.length}`,
      params,
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return {
      items,
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(last.code) : null,
    };
  }

  async findById(companyId: string, id: string): Promise<ProductRow | null> {
    const { rows } = await this.pool.query<ProductRow>(
      `select ${COLUMNS} from product
        where id = $1 and company_id = $2 and deleted_at is null`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  /** آیا دسته‌بندی برای همین شرکت تعریف شده؟ */
  async categoryExists(companyId: string, categoryId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      'select 1 from product_category where id = $1 and company_id = $2',
      [categoryId, companyId],
    );
    return rows.length > 0;
  }

  /** M4: company-scoped brand reference validation for bulk maintenance. */
  async brandExists(companyId: string, brandId: string, client?: Runner): Promise<boolean> {
    const { rows } = await runner(this.pool, client).query(
      'select 1 from brand where id = $1 and company_id = $2',
      [brandId, companyId],
    );
    return rows.length > 0;
  }

  async brandNames(companyId: string, ids: readonly string[], client?: Runner): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (ids.length === 0) return map;
    const { rows } = await runner(this.pool, client).query<{ id: string; name: string }>(
      'select id, name from brand where company_id = $1 and id = any($2::uuid[])',
      [companyId, [...ids]],
    );
    for (const r of rows) map.set(r.id, r.name);
    return map;
  }

  /** M4: one bounded read for preview, stale checks and reconciliation. */
  async findByIdsForBulk(
    companyId: string,
    ids: readonly string[],
    client?: Runner,
  ): Promise<BulkProductSnapshot[]> {
    if (ids.length === 0) return [];
    const { rows } = await runner(this.pool, client).query<BulkProductSnapshot>(
      `select ${COLUMNS} from product
        where company_id = $1 and deleted_at is null and id = any($2::uuid[])
        order by code asc`,
      [companyId, [...ids]],
    );
    return rows;
  }

  /** آیا واحد اندازه‌گیری (داده مرجع سراسری) وجود دارد؟ */
  async uomExists(uomId: string): Promise<boolean> {
    const { rows } = await this.pool.query('select 1 from uom where id = $1', [uomId]);
    return rows.length > 0;
  }

  /**
   * TASK-PM-02-C2 — مراجع فرم کالا باید موجود **و فعال** باشند.
   * رکوردهای غیرفعال همچنان برای کالاها/اسناد قدیمی خواندنیاند، ولی انتخاب
   * آنها در فرمهای ساخت/ویرایش جدید مجاز نیست. قیود موجود (RLS/company_id)
   * عیناً حفظ شدند؛ هیچ مجوز یا جدول تازهای اضافه نشد.
   */
  async activeCategoryExists(companyId: string, categoryId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      'select 1 from product_category where id = $1 and company_id = $2 and is_active',
      [categoryId, companyId],
    );
    return rows.length > 0;
  }

  async activeBrandExists(companyId: string, brandId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      'select 1 from brand where id = $1 and company_id = $2 and is_active',
      [brandId, companyId],
    );
    return rows.length > 0;
  }

  async activeUomExists(uomId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      'select 1 from uom where id = $1 and is_active',
      [uomId],
    );
    return rows.length > 0;
  }

  async insert(companyId: string, dto: CreateProductDto & { code: string }): Promise<ProductRow> {
    const { rows } = await this.pool.query<ProductRow>(
      `insert into product (company_id, code, name, name_latin, family_id, category_id, base_uom_id,
                            brand_id, tax_code_id,
                            is_batch_tracked, is_expiry_tracked, shelf_life_days,
                            is_returnable_container, requires_permit, distribution_kind,
                            min_order_qty, weight_gr, volume_cm3)
       values ($1, $2, $3, $4, $5, $6, $7,
               $8, $9,
               coalesce($10, false), coalesce($11, false), $12,
               coalesce($13, false), coalesce($14, false), coalesce($15, 'both'),
               coalesce($16, 0), $17, $18)
       returning ${COLUMNS}`,
      [
        companyId,
        dto.code,
        dto.name,
        dto.name_latin ?? null,
        dto.family_id ?? null,
        dto.category_id,
        dto.base_uom_id,
        dto.brand_id ?? null,
        dto.tax_code_id ?? null,
        dto.is_batch_tracked,
        dto.is_expiry_tracked,
        dto.shelf_life_days ?? null,
        dto.is_returnable_container,
        dto.requires_permit,
        dto.distribution_kind,
        dto.min_order_qty,
        dto.weight_gr ?? null,
        dto.volume_cm3 ?? null,
      ],
    );
    return rows[0];
  }

  /**
   * بروزرسانی با قفل خوش‌بینانه: اگر expectedRowVersion داده شود و مغایرت داشته
   * باشد، صفر ردیف برمی‌گردد (سرویس آن را 409 می‌کند).
   */
  async update(
    companyId: string,
    id: string,
    dto: UpdateProductDto,
    expectedRowVersion?: number,
    client?: Runner,
  ): Promise<ProductRow | null> {
    const sets: string[] = [];
    const params: unknown[] = [id, companyId];

    for (const col of UPDATABLE) {
      const value = dto[col as keyof UpdateProductDto];
      if (value !== undefined) {
        params.push(value);
        sets.push(`${col} = $${params.length}`);
      }
    }
    if (sets.length === 0) return this.findById(companyId, id);

    let where = 'id = $1 and company_id = $2 and deleted_at is null';
    if (expectedRowVersion !== undefined) {
      params.push(expectedRowVersion);
      where += ` and row_version = $${params.length}`;
    }

    const { rows } = await runner(this.pool, client).query<ProductRow>(
      `update product set ${sets.join(', ')} where ${where} returning ${COLUMNS}`,
      params,
    );
    return rows[0] ?? null;
  }

  async softDelete(companyId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'update product set deleted_at = now() where id = $1 and company_id = $2 and deleted_at is null',
      [id, companyId],
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * TASK-PM-01D-M3 — read-only, company-scoped CSV projection.
   * The optional runner lets the service execute authorization, joins and
   * snapshot read on one repeatable-read transaction connection.
   * limit+1 detects truncation without silently exporting an unbounded file.
   */
  async exportRows(
    companyId: string,
    query: ExportProductsQueryDto,
    client?: Runner,
  ): Promise<{ rows: ProductExportRow[]; truncated: boolean }> {
    const limit = query.limit ?? 10_000;
    const params: unknown[] = [companyId];
    const where: string[] = ['p.company_id = $1', 'p.deleted_at is null'];
    if (query.q) {
      params.push(`%${query.q}%`);
      const i = params.length;
      where.push(`(p.code ilike $${i} or p.name ilike $${i} or p.name_latin ilike $${i}
        or exists (select 1 from product_alias a
                   where a.product_id = p.id and a.company_id = p.company_id
                     and a.alias ilike $${i}))`);
    }
    if (query.category_id) {
      params.push(query.category_id);
      where.push(`p.category_id = $${params.length}`);
    }
    if (query.brand_id) {
      params.push(query.brand_id);
      where.push(`p.brand_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`p.status = $${params.length}`);
    }
    params.push(limit + 1);
    const sql = `select
        p.code, p.name, p.name_latin,
        cat.code as category_code, fam.code as family_code, br.name as brand_name,
        u.code as base_uom_code, tax.code as tax_code, bc.barcode,
        p.status, p.min_order_qty::double precision as min_order_qty,
        p.weight_gr, p.volume_cm3, p.distribution_kind,
        p.is_batch_tracked, p.is_expiry_tracked, p.shelf_life_days,
        p.is_returnable_container, p.requires_permit, p.created_at
      from product p
      join product_category cat on cat.id = p.category_id and cat.company_id = p.company_id
      join uom u on u.id = p.base_uom_id
      left join product_family fam on fam.id = p.family_id and fam.company_id = p.company_id
      left join brand br on br.id = p.brand_id and br.company_id = p.company_id
      left join tax_code tax on tax.id = p.tax_code_id and tax.company_id = p.company_id
      left join lateral (
        select pb.barcode
        from product_barcode pb
        where pb.product_id = p.id and pb.company_id = p.company_id
          and pb.packaging_id is null
        order by pb.is_primary desc, pb.created_at asc, pb.id asc
        limit 1
      ) bc on true
      where ${where.join(' and ')}
      order by p.code ${query.sort === 'code_desc' ? 'desc' : 'asc'}
      limit $${params.length}`;
    const { rows } = await runner(this.pool, client).query<ProductExportRow>(sql, params);
    const truncated = rows.length > limit;
    return { rows: truncated ? rows.slice(0, limit) : rows, truncated };
  }
}
