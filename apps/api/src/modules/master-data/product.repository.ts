import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type { CreateProductDto, ListProductsQueryDto, UpdateProductDto } from './product.dto';

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

  /** آیا واحد اندازه‌گیری (داده مرجع سراسری) وجود دارد؟ */
  async uomExists(uomId: string): Promise<boolean> {
    const { rows } = await this.pool.query('select 1 from uom where id = $1', [uomId]);
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

    const { rows } = await this.pool.query<ProductRow>(
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
}
