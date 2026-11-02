import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type {
  CreateAreaDto,
  CreateRouteDto,
  ListAreasQueryDto,
  ListRoutesQueryDto,
  UpdateAreaDto,
  UpdateRouteDto,
} from './structure.dto';

export interface AreaRow extends QueryResultRow {
  id: string;
  branch_id: string;
  parent_area_id: string | null;
  code: string;
  name: string;
  is_active: boolean;
}

export interface RouteRow extends QueryResultRow {
  id: string;
  area_id: string;
  code: string;
  name: string;
  visit_weekday: number | null;
  is_active: boolean;
}

/**
 * مرجع صفحه‌بندی keyset روی (code, id) — کد در شرکتِ چندشعبه‌ای یکتا نیست،
 * پس جفت (کد، شناسه) ترتیب پایدار و یکتا می‌سازد.
 */
const encodeCursor = (code: string, id: string): string =>
  Buffer.from(`${code}|${id}`, 'utf8').toString('base64url');
const decodeCursor = (cursor: string): [string, string] => {
  const [code, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  return [code ?? '', id ?? ''];
};

@Injectable()
export class StructureRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  // ---------------- حوزه فروش ----------------

  async listAreas(companyId: string, query: ListAreasQueryDto): Promise<{
    items: AreaRow[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['b.company_id = $1'];
    if (query.parent_area_id) {
      params.push(query.parent_area_id);
      where.push(`a.parent_area_id = $${params.length}`);
    }
    if (query.cursor) {
      const [code, id] = decodeCursor(query.cursor);
      params.push(code, id);
      where.push(`(a.code, a.id) > ($${params.length - 1}, $${params.length})`);
    }
    params.push(limit + 1);
    const { rows } = await this.pool.query<AreaRow>(
      `select a.id, a.branch_id, a.parent_area_id, a.code, a.name, a.is_active
         from sales_area a
         join branch b on b.id = a.branch_id
        where ${where.join(' and ')}
        order by a.code, a.id
        limit $${params.length}`,
      params,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return { items: page, hasMore, nextCursor: hasMore && last ? encodeCursor(last.code, last.id) : null };
  }

  async findArea(companyId: string, id: string): Promise<AreaRow | null> {
    const { rows } = await this.pool.query<AreaRow>(
      `select a.id, a.branch_id, a.parent_area_id, a.code, a.name, a.is_active
         from sales_area a
         join branch b on b.id = a.branch_id
        where a.id = $1 and b.company_id = $2`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  async insertArea(branchId: string, dto: CreateAreaDto): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into sales_area (branch_id, parent_area_id, code, name, is_active)
       values ($1, $2, $3, $4, coalesce($5, true))
       returning id`,
      [branchId, dto.parent_area_id ?? null, dto.code, dto.name, dto.is_active ?? null],
    );
    return rows[0].id;
  }

  async updateArea(companyId: string, id: string, dto: UpdateAreaDto): Promise<string | null> {
    const sets: string[] = [];
    const params: unknown[] = [id, companyId];
    const add = (fragment: string, value: unknown): void => {
      params.push(value);
      sets.push(fragment.replace('$?', `$${params.length}`));
    };
    if (dto.code !== undefined) add('code = $?', dto.code);
    if (dto.name !== undefined) add('name = $?', dto.name);
    if (dto.branch_id !== undefined) add('branch_id = $?', dto.branch_id);
    // parent_area_id قابل‌ تنظیم به null (حذف سلسله‌مراتب) است — باید nullِ صریح حفظ شود
    if (dto.parent_area_id !== undefined) add('parent_area_id = $?', dto.parent_area_id);
    if (dto.is_active !== undefined) add('is_active = $?', dto.is_active);

    if (sets.length === 0) return id;
    const { rows } = await this.pool.query<{ id: string }>(
      `update sales_area set ${sets.join(', ')}
        where id = $1 and exists (
          select 1 from branch b where b.id = sales_area.branch_id and b.company_id = $2)
        returning id`,
      params,
    );
    return rows[0]?.id ?? null;
  }

  // ---------------- مسیر فروش ----------------

  async listRoutes(companyId: string, query: ListRoutesQueryDto): Promise<{
    items: RouteRow[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['b.company_id = $1'];
    if (query.area_id) {
      params.push(query.area_id);
      where.push(`r.area_id = $${params.length}`);
    }
    if (query.cursor) {
      const [code, id] = decodeCursor(query.cursor);
      params.push(code, id);
      where.push(`(r.code, r.id) > ($${params.length - 1}, $${params.length})`);
    }
    params.push(limit + 1);
    const { rows } = await this.pool.query<RouteRow>(
      `select r.id, r.area_id, r.code, r.name, r.visit_weekday, r.is_active
         from route r
         join sales_area a on a.id = r.area_id
         join branch b on b.id = a.branch_id
        where ${where.join(' and ')}
        order by r.code, r.id
        limit $${params.length}`,
      params,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return { items: page, hasMore, nextCursor: hasMore && last ? encodeCursor(last.code, last.id) : null };
  }

  async findRoute(companyId: string, id: string): Promise<RouteRow | null> {
    const { rows } = await this.pool.query<RouteRow>(
      `select r.id, r.area_id, r.code, r.name, r.visit_weekday, r.is_active
         from route r
         join sales_area a on a.id = r.area_id
         join branch b on b.id = a.branch_id
        where r.id = $1 and b.company_id = $2`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  /** مشتریان مسیر به ترتیب بازدید (visit_sequence؛ بدون ترتیب در انتها) */
  async findRouteCustomerIds(companyId: string, routeId: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ id: string }>(
      `select c.id
         from customer c
         join branch b on b.id = c.branch_id
        where c.route_id = $1 and b.company_id = $2 and c.deleted_at is null
        order by c.visit_sequence nulls last, c.id`,
      [routeId, companyId],
    );
    return rows.map((r) => r.id);
  }

  async insertRoute(companyId: string, dto: CreateRouteDto): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const header = await client.query<{ id: string }>(
        `insert into route (area_id, code, name, visit_weekday, is_active)
         values ($1, $2, $3, $4, coalesce($5, true))
         returning id`,
        [dto.area_id, dto.code, dto.name, dto.visit_weekday ?? null, dto.is_active ?? null],
      );
      const id = header.rows[0].id;
      if (dto.customer_ids) {
        await this.assignRouteCustomers(client, companyId, id, dto.customer_ids);
      }
      await client.query('commit');
      return id;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async updateRoute(companyId: string, id: string, dto: UpdateRouteDto): Promise<string | null> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const sets: string[] = [];
      const params: unknown[] = [id, companyId];
      const add = (fragment: string, value: unknown): void => {
        params.push(value);
        sets.push(fragment.replace('$?', `$${params.length}`));
      };
      if (dto.area_id !== undefined) add('area_id = $?', dto.area_id);
      if (dto.code !== undefined) add('code = $?', dto.code);
      if (dto.name !== undefined) add('name = $?', dto.name);
      // visit_weekday قابل‌ تنظیم به null است — باید nullِ صریح حفظ شود
      if (dto.visit_weekday !== undefined) add('visit_weekday = $?', dto.visit_weekday);
      if (dto.is_active !== undefined) add('is_active = $?', dto.is_active);

      if (sets.length > 0) {
        const owned = await client.query(
          `update route set ${sets.join(', ')}
            where id = $1 and exists (
              select 1 from sales_area a join branch b on b.id = a.branch_id
               where a.id = route.area_id and b.company_id = $2)
            returning id`,
          params,
        );
        if (owned.rowCount === 0) {
          await client.query('rollback');
          return null;
        }
      }
      if (dto.customer_ids) {
        await this.assignRouteCustomers(client, companyId, id, dto.customer_ids);
      }
      await client.query('commit');
      return id;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * انتساب/ترتیب مشتریان مسیر: هر مشتریِ فهرست به مسیر منتسب و ترتیبش ست می‌شود؛
   * مشتریانی که قبلاً در مسیر بودند ولی در فهرست نیستند از مسیر جدا می‌شوند.
   */
  private async assignRouteCustomers(
    client: PoolClient,
    companyId: string,
    routeId: string,
    customerIds: string[],
  ): Promise<void> {
    for (let i = 0; i < customerIds.length; i += 1) {
      await client.query(
        `update customer set route_id = $1, visit_sequence = $3
          where id = $2 and exists (
            select 1 from branch b where b.id = customer.branch_id and b.company_id = $4)`,
        [routeId, customerIds[i], i + 1, companyId],
      );
    }
    await client.query(
      `update customer set route_id = null, visit_sequence = null
        where route_id = $1 and not (id = any($2::uuid[]))`,
      [routeId, customerIds],
    );
  }

  // ---------------- بررسی‌های ارجاعی ----------------

  async defaultBranchId(companyId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string }>(
      'select id from branch where company_id = $1 and is_active order by code limit 1',
      [companyId],
    );
    return rows[0]?.id ?? null;
  }

  async branchExists(companyId: string, branchId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      'select 1 from branch where id = $1 and company_id = $2',
      [branchId, companyId],
    );
    return rows.length > 0;
  }

  async areaExists(companyId: string, areaId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `select 1 from sales_area a join branch b on b.id = a.branch_id
        where a.id = $1 and b.company_id = $2`,
      [areaId, companyId],
    );
    return rows.length > 0;
  }

  /** همهٔ مشتریانِ فهرست باید متعلق به همین شرکت باشند */
  async customersBelongToCompany(companyId: string, customerIds: string[]): Promise<boolean> {
    if (customerIds.length === 0) return true;
    const { rows } = await this.pool.query<{ n: number }>(
      `select count(*)::int as n
         from customer c
         join branch b on b.id = c.branch_id
        where c.id = any($1::uuid[]) and b.company_id = $2`,
      [customerIds, companyId],
    );
    return rows[0].n === customerIds.length;
  }
}
