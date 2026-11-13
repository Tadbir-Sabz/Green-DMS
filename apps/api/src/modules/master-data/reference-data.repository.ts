import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { REFERENCE_MAX_DEPTH } from './reference-data.rules';

/**
 * دسترسی دادهٔ مرجع (TASK-PM-02-C2) — SQL خام روی همان جداول ۰۰۰۵:
 *   brand / product_category (شرکتمحور + RLS موجود ۰۰۴۱) و uom (مرجع سراسری).
 *
 * هیچ جدول، ستون مالکیت دامنهای، RLS تازه یا گرانت تازهای ساخته نمیشود.
 * همهٔ کوئریهای brand/product_category صریحاً company_id را قید میزنند حتی
 * با وجود RLS (دفاع در عمق)؛ uom company_id ندارد و طبق قرارداد موجود سراسری است.
 *
 * `Pool` همان TenantAwarePool است: داخل `CatalogAccess.write` کوئریها روی همان
 * connection تراکنش و با GUCهای نشست اجرا میشوند، بنابراین audit در همان
 * تراکنش و RLS دقیقاً همان شرکت را میبیند.
 */

export interface BrandRow extends QueryResultRow {
  id: string;
  code: string | null;
  name: string;
  name_latin: string | null;
  is_active: boolean;
  product_count: number;
  created_at: string;
  updated_at: string;
}

export interface UnitRow extends QueryResultRow {
  id: string;
  code: string;
  title: string;
  symbol: string | null;
  title_latin: string | null;
  decimal_places: number;
  is_active: boolean;
  product_count: number;
  packaging_count: number;
  created_at: string;
  updated_at: string;
}

export interface CategoryRow extends QueryResultRow {
  id: string;
  code: string;
  name: string;
  name_latin: string | null;
  parent_id: string | null;
  parent_name: string | null;
  cost_method: string;
  is_active: boolean;
  product_count: number;
  child_count: number;
  created_at: string;
  updated_at: string;
}

export interface ReferenceProductRow extends QueryResultRow {
  id: string;
  code: string;
  name: string;
  status: string;
}

export interface AuditEventRow extends QueryResultRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_user_id: string | null;
  at: string;
  before_data: unknown;
  after_data: unknown;
}

export interface ListOptions {
  q: string | null;
  isActive: boolean | null;
  limit: number;
  offset: number;
  parentId?: string | null;
  rootOnly?: boolean;
}

export interface ListResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

const escapeLike = (raw: string): string => raw.replace(/[\\%_]/g, (c) => `\\${c}`);

@Injectable()
export class ReferenceDataRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  // ─────────────────────────────── برند ───────────────────────────────

  async listBrands(companyId: string, o: ListOptions): Promise<ListResult<BrandRow>> {
    const params: unknown[] = [companyId, o.isActive, o.q ? `%${escapeLike(o.q)}%` : null];
    const where = `b.company_id = $1::uuid
      and ($2::boolean is null or b.is_active = $2::boolean)
      and ($3::text is null or b.code ilike $3 escape '\\' or b.name ilike $3 escape '\\' or b.name_latin ilike $3 escape '\\')`;
    const [items, count] = await Promise.all([
      this.pool.query<BrandRow>(
        `select b.id, b.code, b.name, b.name_latin, b.is_active,
                b.created_at, b.updated_at,
                (select count(*)::int from product p where p.brand_id = b.id and p.company_id = b.company_id) as product_count
           from brand b
          where ${where}
          order by b.code nulls last, b.name asc
          limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, o.limit, o.offset],
      ),
      this.pool.query<{ total: number }>(
        `select count(*)::int as total from brand b where ${where}`,
        params,
      ),
    ]);
    return { items: items.rows, total: count.rows[0]?.total ?? 0, limit: o.limit, offset: o.offset };
  }

  async findBrand(companyId: string, id: string): Promise<BrandRow | null> {
    const { rows } = await this.pool.query<BrandRow>(
      `select b.id, b.code, b.name, b.name_latin, b.is_active,
              b.created_at, b.updated_at,
              (select count(*)::int from product p where p.brand_id = b.id and p.company_id = b.company_id) as product_count
         from brand b
        where b.id = $1::uuid and b.company_id = $2::uuid`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  async insertBrand(
    companyId: string,
    input: { code: string; name: string; name_latin: string | null; is_active: boolean },
  ): Promise<BrandRow> {
    const { rows } = await this.pool.query<BrandRow>(
      `insert into brand (company_id, code, name, name_latin, is_active)
       values ($1::uuid, $2, $3, $4, $5)
       returning id, code, name, name_latin, is_active, created_at, updated_at,
                 0::int as product_count`,
      [companyId, input.code, input.name, input.name_latin, input.is_active],
    );
    return rows[0];
  }

  async updateBrand(
    companyId: string,
    id: string,
    input: Partial<{ code: string; name: string; name_latin: string | null; is_active: boolean }>,
  ): Promise<BrandRow | null> {
    const { rows } = await this.pool.query<BrandRow>(
      `update brand set
         code = coalesce($3, code),
         name = coalesce($4, name),
         name_latin = case when $5::boolean then $6 else name_latin end,
         is_active = coalesce($7, is_active),
         updated_at = now()
       where id = $1::uuid and company_id = $2::uuid
       returning id, code, name, name_latin, is_active, created_at, updated_at,
                 (select count(*)::int from product p where p.brand_id = brand.id and p.company_id = brand.company_id) as product_count`,
      [
        id,
        companyId,
        input.code ?? null,
        input.name ?? null,
        input.name_latin !== undefined,
        input.name_latin ?? null,
        input.is_active ?? null,
      ],
    );
    return rows[0] ?? null;
  }

  async deleteBrand(companyId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'delete from brand where id = $1::uuid and company_id = $2::uuid',
      [id, companyId],
    );
    return (rowCount ?? 0) > 0;
  }

  async brandUsage(companyId: string, id: string): Promise<{ count: number; products: ReferenceProductRow[] }> {
    const [{ rows: c }, { rows: products }] = await Promise.all([
      this.pool.query<{ count: number }>(
        'select count(*)::int as count from product where brand_id = $1::uuid and company_id = $2::uuid',
        [id, companyId],
      ),
      this.pool.query<ReferenceProductRow>(
        `select id, code, name, status from product
          where brand_id = $1::uuid and company_id = $2::uuid and deleted_at is null
          order by code asc limit 10`,
        [id, companyId],
      ),
    ]);
    return { count: c[0]?.count ?? 0, products };
  }

  // ─────────────────────────────── واحد ───────────────────────────────

  async listUnits(companyId: string, o: ListOptions): Promise<ListResult<UnitRow>> {
    const params: unknown[] = [o.isActive, o.q ? `%${escapeLike(o.q)}%` : null, companyId];
    const where = `($1::boolean is null or u.is_active = $1::boolean)
      and ($2::text is null or u.code ilike $2 escape '\\' or u.title ilike $2 escape '\\'
           or u.symbol ilike $2 escape '\\' or u.title_latin ilike $2 escape '\\')`;
    const [items, count] = await Promise.all([
      this.pool.query<UnitRow>(
        `select u.id, u.code, u.title, u.symbol, u.title_latin, u.decimal_places,
                u.is_active, u.created_at, u.updated_at,
                (select count(*)::int from product p
                   where p.base_uom_id = u.id and p.company_id = $3::uuid) as product_count,
                (select count(*)::int from product_packaging pp
                   join product p on p.id = pp.product_id
                  where pp.uom_id = u.id and p.company_id = $3::uuid) as packaging_count
           from uom u
          where ${where}
          order by u.code asc
          limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, o.limit, o.offset],
      ),
      this.pool.query<{ total: number }>(
        `select count(*)::int as total from uom u where ${where}`,
        params.slice(0, 2), // پارامتر سوم فقط برای شمارشهای شرکتمحورِ SELECT است
      ),
    ]);
    return { items: items.rows, total: count.rows[0]?.total ?? 0, limit: o.limit, offset: o.offset };
  }

  async findUnit(companyId: string, id: string): Promise<UnitRow | null> {
    const { rows } = await this.pool.query<UnitRow>(
      `select u.id, u.code, u.title, u.symbol, u.title_latin, u.decimal_places,
              u.is_active, u.created_at, u.updated_at,
              (select count(*)::int from product p
                 where p.base_uom_id = u.id and p.company_id = $2::uuid) as product_count,
              (select count(*)::int from product_packaging pp
                 join product p on p.id = pp.product_id
                where pp.uom_id = u.id and p.company_id = $2::uuid) as packaging_count
         from uom u where u.id = $1::uuid`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  async insertUnit(input: {
    code: string; title: string; symbol: string | null; title_latin: string | null;
    decimal_places: number; is_active: boolean;
  }): Promise<UnitRow> {
    const { rows } = await this.pool.query<UnitRow>(
      `insert into uom (code, title, symbol, title_latin, decimal_places, is_active)
       values ($1, $2, $3, $4, $5, $6)
       returning id, code, title, symbol, title_latin, decimal_places, is_active,
                 created_at, updated_at, 0::int as product_count, 0::int as packaging_count`,
      [input.code, input.title, input.symbol, input.title_latin, input.decimal_places, input.is_active],
    );
    return rows[0];
  }

  async updateUnit(
    companyId: string,
    id: string,
    input: Partial<{
      title: string; symbol: string | null; title_latin: string | null;
      decimal_places: number; is_active: boolean;
    }>,
  ): Promise<UnitRow | null> {
    const { rows } = await this.pool.query<UnitRow>(
      `update uom set
         title = coalesce($3, title),
         symbol = case when $4::boolean then $5 else symbol end,
         title_latin = case when $6::boolean then $7 else title_latin end,
         decimal_places = coalesce($8, decimal_places),
         is_active = coalesce($9, is_active),
         updated_at = now()
       where id = $1::uuid
       returning id, code, title, symbol, title_latin, decimal_places, is_active,
                 created_at, updated_at,
                 (select count(*)::int from product p
                    where p.base_uom_id = uom.id and p.company_id = $2::uuid) as product_count,
                 (select count(*)::int from product_packaging pp
                    join product p on p.id = pp.product_id
                   where pp.uom_id = uom.id and p.company_id = $2::uuid) as packaging_count`,
      [
        id,
        companyId,
        input.title ?? null,
        input.symbol !== undefined,
        input.symbol ?? null,
        input.title_latin !== undefined,
        input.title_latin ?? null,
        input.decimal_places ?? null,
        input.is_active ?? null,
      ],
    );
    return rows[0] ?? null;
  }

  async deleteUnit(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('delete from uom where id = $1::uuid', [id]);
    return (rowCount ?? 0) > 0;
  }

  async unitUsage(companyId: string, id: string): Promise<{ count: number; products: ReferenceProductRow[] }> {
    const [{ rows: c }, { rows: products }] = await Promise.all([
      this.pool.query<{ count: number }>(
        `select ((select count(*) from product
                     where base_uom_id = $1::uuid and company_id = $2::uuid)
               + (select count(*) from product_packaging pp
                    join product p on p.id = pp.product_id
                   where pp.uom_id = $1::uuid and p.company_id = $2::uuid))::int as count`,
        [id, companyId],
      ),
      this.pool.query<ReferenceProductRow>(
        `select id, code, name, status from product
          where base_uom_id = $1::uuid and company_id = $2::uuid and deleted_at is null
          order by code asc limit 10`,
        [id, companyId],
      ),
    ]);
    return { count: c[0]?.count ?? 0, products };
  }

  // ───────────────────────────── دستهبندی ─────────────────────────────

  async listCategories(companyId: string, o: ListOptions): Promise<ListResult<CategoryRow>> {
    const params: unknown[] = [
      companyId,
      o.isActive,
      o.q ? `%${escapeLike(o.q)}%` : null,
      o.parentId ?? null,
      o.rootOnly ? 'root' : null,
    ];
    const where = `c.company_id = $1::uuid
      and ($2::boolean is null or c.is_active = $2::boolean)
      and ($3::text is null or c.code ilike $3 escape '\\' or c.name ilike $3 escape '\\'
           or c.name_latin ilike $3 escape '\\')
      and ($4::uuid is null or c.parent_id = $4::uuid)
      and ($5::text is null or c.parent_id is null)`;
    const [items, count] = await Promise.all([
      this.pool.query<CategoryRow>(
        `select c.id, c.code, c.name, c.name_latin, c.parent_id, pc.name as parent_name,
                c.cost_method, c.is_active, c.created_at, c.updated_at,
                (select count(*)::int from product p where p.category_id = c.id and p.company_id = c.company_id) as product_count,
                (select count(*)::int from product_category ch where ch.parent_id = c.id and ch.company_id = c.company_id) as child_count
           from product_category c
           left join product_category pc on pc.id = c.parent_id and pc.company_id = c.company_id
          where ${where}
          order by c.code asc, c.name asc
          limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, o.limit, o.offset],
      ),
      this.pool.query<{ total: number }>(
        `select count(*)::int as total from product_category c where ${where}`,
        params,
      ),
    ]);
    return { items: items.rows, total: count.rows[0]?.total ?? 0, limit: o.limit, offset: o.offset };
  }

  async findCategory(companyId: string, id: string): Promise<CategoryRow | null> {
    const { rows } = await this.pool.query<CategoryRow>(
      `select c.id, c.code, c.name, c.name_latin, c.parent_id, pc.name as parent_name,
              c.cost_method, c.is_active, c.created_at, c.updated_at,
              (select count(*)::int from product p where p.category_id = c.id and p.company_id = c.company_id) as product_count,
              (select count(*)::int from product_category ch where ch.parent_id = c.id and ch.company_id = c.company_id) as child_count
         from product_category c
         left join product_category pc on pc.id = c.parent_id and pc.company_id = c.company_id
        where c.id = $1::uuid and c.company_id = $2::uuid`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  /** زنجیرهٔ والدها (ریشه ← والد مستقیم) با محافظ حلقه و سقف عمق. */
  async ancestorsOf(companyId: string, id: string): Promise<{ id: string; code: string; name: string }[]> {
    const { rows } = await this.pool.query<{ id: string; code: string; name: string; depth: number }>(
      `with recursive up as (
         select c.id, c.code, c.name, c.parent_id, 1 as depth, array[c.id] as path
           from product_category c
          where c.id = $1::uuid and c.company_id = $2::uuid
         union all
         select p.id, p.code, p.name, p.parent_id, up.depth + 1, up.path || p.id
           from product_category p
           join up on p.id = up.parent_id
          where p.company_id = $2::uuid
            and up.depth < $3::int
            and not (p.id = any(up.path))
       )
       select id, code, name, depth from up where depth > 1 order by depth desc`,
      [id, companyId, REFERENCE_MAX_DEPTH],
    );
    // depth=1 خود رکورد است؛ ترتیب نزولی یعنی ریشه ← والد مستقیم (بدون reverse).
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name }));
  }

  async directChildren(companyId: string, id: string): Promise<CategoryRow[]> {
    const { rows } = await this.pool.query<CategoryRow>(
      `select c.id, c.code, c.name, c.name_latin, c.parent_id, null::text as parent_name,
              c.cost_method, c.is_active, c.created_at, c.updated_at,
              (select count(*)::int from product p where p.category_id = c.id and p.company_id = c.company_id) as product_count,
              (select count(*)::int from product_category ch where ch.parent_id = c.id and ch.company_id = c.company_id) as child_count
         from product_category c
        where c.parent_id = $1::uuid and c.company_id = $2::uuid
        order by c.code asc`,
      [id, companyId],
    );
    return rows;
  }

  async categoryProducts(companyId: string, id: string): Promise<ReferenceProductRow[]> {
    const { rows } = await this.pool.query<ReferenceProductRow>(
      `select id, code, name, status from product
        where category_id = $1::uuid and company_id = $2::uuid and deleted_at is null
        order by code asc limit 10`,
      [id, companyId],
    );
    return rows;
  }

  async categoryExists(companyId: string, id: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      'select 1 from product_category where id = $1::uuid and company_id = $2::uuid',
      [id, companyId],
    );
    return rows.length > 0;
  }

  async insertCategory(
    companyId: string,
    input: {
      code: string; name: string; name_latin: string | null; parent_id: string | null;
      is_active: boolean;
    },
  ): Promise<CategoryRow> {
    const { rows } = await this.pool.query<CategoryRow>(
      `insert into product_category (company_id, code, name, name_latin, parent_id, is_active)
       values ($1::uuid, $2, $3, $4, $5, $6)
       returning id, code, name, name_latin, parent_id, null::text as parent_name,
                 cost_method, is_active, created_at, updated_at,
                 0::int as product_count, 0::int as child_count`,
      [companyId, input.code, input.name, input.name_latin, input.parent_id, input.is_active],
    );
    return rows[0];
  }

  async updateCategory(
    companyId: string,
    id: string,
    input: Partial<{
      code: string; name: string; name_latin: string | null; parent_id: string | null;
      is_active: boolean;
    }>,
  ): Promise<CategoryRow | null> {
    const { rows } = await this.pool.query<CategoryRow>(
      `update product_category set
         code = coalesce($3, code),
         name = coalesce($4, name),
         name_latin = case when $5::boolean then $6 else name_latin end,
         parent_id = case when $7::boolean then $8 else parent_id end,
         is_active = coalesce($9, is_active),
         updated_at = now()
       where id = $1::uuid and company_id = $2::uuid
       returning id, code, name, name_latin, parent_id,
                 (select name from product_category pc where pc.id = product_category.parent_id) as parent_name,
                 cost_method, is_active, created_at, updated_at,
                 (select count(*)::int from product p where p.category_id = product_category.id and p.company_id = product_category.company_id) as product_count,
                 (select count(*)::int from product_category ch where ch.parent_id = product_category.id and ch.company_id = product_category.company_id) as child_count`,
      [
        id,
        companyId,
        input.code ?? null,
        input.name ?? null,
        input.name_latin !== undefined,
        input.name_latin ?? null,
        input.parent_id !== undefined,
        input.parent_id ?? null,
        input.is_active ?? null,
      ],
    );
    return rows[0] ?? null;
  }

  /** انتساب ایمن: فرزندان و کالاها به دستهٔ مقصد منتقل میشوند، سپس حذف. */
  async reassignCategoryChildren(
    companyId: string,
    id: string,
    targetId: string,
  ): Promise<{ children: number; products: number }> {
    const [children, products] = await Promise.all([
      this.pool.query(
        `update product_category set parent_id = $3::uuid, updated_at = now()
          where parent_id = $1::uuid and company_id = $2::uuid`,
        [id, companyId, targetId],
      ),
      this.pool.query(
        `update product set category_id = $3::uuid, updated_at = now()
          where category_id = $1::uuid and company_id = $2::uuid`,
        [id, companyId, targetId],
      ),
    ]);
    return { children: children.rowCount ?? 0, products: products.rowCount ?? 0 };
  }

  async deleteCategory(companyId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'delete from product_category where id = $1::uuid and company_id = $2::uuid',
      [id, companyId],
    );
    return (rowCount ?? 0) > 0;
  }

  async categoryUsage(companyId: string, id: string): Promise<{ children: number; products: number }> {
    const { rows } = await this.pool.query<{ children: number; products: number }>(
      `select (select count(*)::int from product_category ch
                 where ch.parent_id = $1::uuid and ch.company_id = $2::uuid) as children,
              (select count(*)::int from product p
                 where p.category_id = $1::uuid and p.company_id = $2::uuid) as products`,
      [id, companyId],
    );
    return rows[0] ?? { children: 0, products: 0 };
  }

  // ───────────────────────────── تاریخچه ─────────────────────────────

  async history(
    companyId: string,
    entityTypes: readonly string[],
    entityId: string | null,
    limit: number,
    offset: number,
  ): Promise<{ items: AuditEventRow[]; total: number }> {
    const params: unknown[] = [companyId, [...entityTypes], entityId];
    const where = `company_id = $1::uuid
      and entity_type = any($2::text[])
      and ($3::uuid is null or entity_id = $3::uuid)`;
    const [items, count] = await Promise.all([
      this.pool.query<AuditEventRow>(
        `select id::text, action, entity_type, entity_id::text, actor_user_id::text, at,
                before_data, after_data
           from audit_log
          where ${where}
          order by at desc, id desc
          limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, limit, offset],
      ),
      this.pool.query<{ total: number }>(
        `select count(*)::int as total from audit_log where ${where}`,
        params,
      ),
    ]);
    return { items: items.rows, total: count.rows[0]?.total ?? 0 };
  }

  // ─────────────── اعتبارسنجی مراجع فرم کالا (یکپارچگی) ───────────────

  /** برند/دسته/واحد باید موجود، فعال و (برای برند/دسته) همان شرکت باشند. */
  async activeBrandExists(companyId: string, id: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      'select 1 from brand where id = $1::uuid and company_id = $2::uuid and is_active',
      [id, companyId],
    );
    return rows.length > 0;
  }

  async activeCategoryExists(companyId: string, id: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      'select 1 from product_category where id = $1::uuid and company_id = $2::uuid and is_active',
      [id, companyId],
    );
    return rows.length > 0;
  }

  async activeUnitExists(id: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      'select 1 from uom where id = $1::uuid and is_active',
      [id],
    );
    return rows.length > 0;
  }
}
