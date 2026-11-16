import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import type { Runner } from '../../common/transaction';
import { PG_POOL } from '../../database/database.module';
import type { ListTerritoryCoverageQueryDto } from './territory.dto';

export interface RouteCoverageRow extends QueryResultRow {
  route_id: string;
  code: string;
  name: string;
  area_id: string;
  area_name: string;
  area_is_active: boolean;
  visit_weekday: number | null;
  is_active: boolean;
  assigned_count: number;
  salesperson_count: number;
}

export interface UnassignedCustomerRow extends QueryResultRow {
  id: string;
  code: string;
  branch_id: string;
  branch_code: string;
  area_id: string | null;
  area_name: string | null;
  segment_id: string | null;
  segment_title: string | null;
}

export type ConflictKind =
  | 'area_route_mismatch'
  | 'inactive_route'
  | 'inactive_area'
  | 'duplicate_sequence';

export interface TerritoryConflictRow extends QueryResultRow {
  customer_id: string;
  customer_code: string;
  kind: ConflictKind;
  detail_fa: string;
}

const CONFLICTS_CTE = (segmentParam: string | null): string => `
with scoped as (
  select c.id, c.code, c.status, c.area_id, c.route_id, c.visit_sequence,
         r.area_id as route_area_id, r.is_active as route_is_active,
         a.is_active as area_is_active
    from customer c
    join branch b on b.id = c.branch_id
    left join route r on r.id = c.route_id
    left join sales_area a on a.id = c.area_id
   where b.company_id = $1
     and c.deleted_at is null
     and c.status = 'active'
     ${segmentParam ? `and c.segment_id = ${segmentParam}` : ''}
)
select id as customer_id, code as customer_code, 'area_route_mismatch' as kind,
       'مسیرِ منتسب به مشتری متعلق به منطقهٔ دیگری است (منطقهٔ مشتری با منطقهٔ مسیر نمی‌خواند).' as detail_fa
  from scoped
 where route_id is not null and area_id is not null and route_area_id <> area_id
 union all
select id, code, 'inactive_route',
       'مشتریِ فعال به مسیرِ غیرفعال منتسب است.'
  from scoped
 where route_id is not null and route_is_active = false
 union all
select id, code, 'inactive_area',
       'منطقهٔ منتسب به مشتری غیرفعال است.'
  from scoped
 where area_id is not null and area_is_active = false
 union all
select s.id, s.code, 'duplicate_sequence',
       'ترتیبِ بازدید این مشتری در مسیر با مشتری دیگری تکراری است.'
  from scoped s
 where s.visit_sequence is not null and s.route_id is not null
   and exists (select 1
                 from customer c2
                 join branch b2 on b2.id = c2.branch_id
                where c2.route_id = s.route_id
                  and c2.visit_sequence = s.visit_sequence
                  and c2.id <> s.id
                  and c2.deleted_at is null
                  and c2.status = 'active'
                  and b2.company_id = $1)`;

/**
 * دسترسیِ دادهٔ پوششِ قلمرو — SQL خام. همهٔ کوئری‌ها از طریقِ
 * `branch.company_id = $1` به شرکتِ نشست قفل می‌شوند (customer مستقیم company_id ندارد).
 */
@Injectable()
export class TerritoryRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async coverageTotals(companyId: string, query: ListTerritoryCoverageQueryDto) {
    const params: unknown[] = [companyId];
    const customerScope: string[] = [`c.deleted_at is null`, `c.status = 'active'`];
    let areaRouteScope = '';
    if (query.branch_id) {
      params.push(query.branch_id);
      customerScope.push(`c.branch_id = $${params.length}`);
      areaRouteScope = `and b.id = $${params.length}`;
    }
    if (query.segment_id) {
      params.push(query.segment_id);
      customerScope.push(`c.segment_id = $${params.length}`);
    }
    const scoped = customerScope.join(' and ');
    const { rows } = await this.pool.query<{
      areas: number;
      routes: number;
      customers_total: number;
      customers_assigned: number;
    }>(
      `select
         (select count(*)::integer from sales_area a join branch b on b.id = a.branch_id
           where b.company_id = $1 ${areaRouteScope}) as areas,
         (select count(*)::integer from route r
            join sales_area a on a.id = r.area_id
            join branch b on b.id = a.branch_id
           where b.company_id = $1 ${areaRouteScope}) as routes,
         (select count(*)::integer from customer c join branch b on b.id = c.branch_id
           where b.company_id = $1 and ${scoped}) as customers_total,
         (select count(*)::integer from customer c join branch b on b.id = c.branch_id
           where b.company_id = $1 and ${scoped} and c.route_id is not null) as customers_assigned`,
      params,
    );
    const r = rows[0];
    const total = Number(r?.customers_total ?? 0);
    const assigned = Number(r?.customers_assigned ?? 0);
    return {
      areas: Number(r?.areas ?? 0),
      routes: Number(r?.routes ?? 0),
      customers_total: total,
      customers_assigned: assigned,
      customers_unassigned: total - assigned,
    };
  }

  async routeCoverage(
    companyId: string,
    query: ListTerritoryCoverageQueryDto,
  ): Promise<RouteCoverageRow[]> {
    const params: unknown[] = [companyId];
    const where: string[] = ['b.company_id = $1'];
    if (query.branch_id) {
      params.push(query.branch_id);
      where.push(`b.id = $${params.length}`);
    }
    if (query.area_id) {
      params.push(query.area_id);
      where.push(`r.area_id = $${params.length}`);
    }
    if (query.route_id) {
      params.push(query.route_id);
      where.push(`r.id = $${params.length}`);
    }
    let custJoin = `left join customer c on c.route_id = r.id and c.deleted_at is null and c.status = 'active'`;
    if (query.segment_id) {
      params.push(query.segment_id);
      custJoin += ` and c.segment_id = $${params.length}`;
    }
    const { rows } = await this.pool.query<RouteCoverageRow>(
      `select r.id as route_id, r.code, r.name, r.area_id, a.name as area_name,
              a.is_active as area_is_active,
              r.visit_weekday, r.is_active,
              count(c.id)::integer as assigned_count,
              (select count(*)::integer from route_salesperson rs where rs.route_id = r.id) as salesperson_count
         from route r
         join sales_area a on a.id = r.area_id
         join branch b on b.id = a.branch_id
         ${custJoin}
        where ${where.join(' and ')}
        group by r.id, a.name, a.is_active
        order by a.name, r.code`,
      params,
    );
    return rows;
  }

  async unassignedCustomers(
    companyId: string,
    query: ListTerritoryCoverageQueryDto,
    limit = 200,
  ): Promise<UnassignedCustomerRow[]> {
    const params: unknown[] = [companyId];
    const where: string[] = [
      `b.company_id = $1`,
      `c.deleted_at is null`,
      `c.status = 'active'`,
      `c.route_id is null`,
    ];
    if (query.branch_id) {
      params.push(query.branch_id);
      where.push(`c.branch_id = $${params.length}`);
    }
    if (query.area_id) {
      params.push(query.area_id);
      where.push(`c.area_id = $${params.length}`);
    }
    if (query.segment_id) {
      params.push(query.segment_id);
      where.push(`c.segment_id = $${params.length}`);
    }
    params.push(limit);
    const { rows } = await this.pool.query<UnassignedCustomerRow>(
      `select c.id, c.code, c.branch_id, b.code as branch_code,
              c.area_id, a.name as area_name, c.segment_id, s.title as segment_title
         from customer c
         join branch b on b.id = c.branch_id
         left join sales_area a on a.id = c.area_id
         left join customer_segment s on s.id = c.segment_id
        where ${where.join(' and ')}
        order by c.code
        limit $${params.length}`,
      params,
    );
    return rows;
  }

  async conflicts(
    companyId: string,
    query: ListTerritoryCoverageQueryDto,
    limit = 200,
  ): Promise<{ items: TerritoryConflictRow[]; total: number }> {
    const params: unknown[] = [companyId];
    let segmentParam: string | null = null;
    if (query.segment_id) {
      params.push(query.segment_id);
      segmentParam = `$${params.length}`;
    }
    const cte = CONFLICTS_CTE(segmentParam);
    const count = await this.pool.query<{ n: number }>(
      `select count(*)::integer as n from (${cte}) x`,
      params,
    );
    params.push(limit);
    const { rows } = await this.pool.query<TerritoryConflictRow>(
      `select * from (${cte}) x order by customer_code, kind limit $${params.length}`,
      params,
    );
    return { items: rows, total: Number(count.rows[0]?.n ?? 0) };
  }

  /** مسیرِ هدف برای انتساب — با قفل ردیف برای «همین حالا فعال است» */
  async findTargetRoute(
    client: Runner,
    companyId: string,
    routeId: string,
  ): Promise<{ id: string; area_id: string; is_active: boolean } | null> {
    const { rows } = await client.query<{ id: string; area_id: string; is_active: boolean }>(
      `select r.id, r.area_id, r.is_active
         from route r
         join sales_area a on a.id = r.area_id
         join branch b on b.id = a.branch_id
        where r.id = $1 and b.company_id = $2
        for update of r`,
      [routeId, companyId],
    );
    return rows[0] ?? null;
  }

  /** مشتریانِ مشمول — با قفل ردیف (all-or-nothing برای انتساب گروهی) */
  async lockCustomers(
    client: Runner,
    companyId: string,
    customerIds: string[],
  ): Promise<{ id: string; route_id: string | null; visit_sequence: number | null; area_id: string | null }[]> {
    const { rows } = await client.query<{
      id: string;
      route_id: string | null;
      visit_sequence: number | null;
      area_id: string | null;
    }>(
      `select c.id, c.route_id, c.visit_sequence, c.area_id
         from customer c
         join branch b on b.id = c.branch_id
        where c.id = any($1::uuid[]) and b.company_id = $2 and c.deleted_at is null
        order by c.id
        for update of c`,
      [customerIds, companyId],
    );
    return rows;
  }

  async maxVisitSequence(client: Runner, routeId: string): Promise<number> {
    const { rows } = await client.query<{ m: number | null }>(
      `select max(visit_sequence)::integer as m from customer where route_id = $1`,
      [routeId],
    );
    return rows[0]?.m ?? 0;
  }

  async assignCustomer(
    client: Runner,
    customerId: string,
    target: { routeId: string; areaId: string; visitSequence: number } | null,
  ): Promise<void> {
    if (target) {
      await client.query(
        `update customer set route_id = $2, visit_sequence = $3, area_id = $4 where id = $1`,
        [customerId, target.routeId, target.visitSequence, target.areaId],
      );
      return;
    }
    await client.query(
      `update customer set route_id = null, visit_sequence = null where id = $1`,
      [customerId],
    );
  }
}
