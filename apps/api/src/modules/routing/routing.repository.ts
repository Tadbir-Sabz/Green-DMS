import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type { RouteStop } from './tsp';

/**
 * گرفتنِ مختصاتِ توقف‌ها از customer.geo (جغرافیای PostGIS، مهاجرت 0007) با
 * جداسازیِ اجاره از راه branch.company_id (همان الگوی mv_ar_aging). فقط مشتریانی
 * که geo دارند برگردانده می‌شوند. ST_Y/ST_X روی ::geometry لات/لانگ می‌دهند.
 */
interface StopRow extends QueryResultRow {
  id: string;
  code: string;
  name: string;
  lat: number;
  lng: number;
}

const SELECT_STOPS = `
  select c.id,
         c.code,
         coalesce(nullif(p.legal_name, ''), c.code) as name,
         ST_Y(c.geo::geometry) as lat,
         ST_X(c.geo::geometry) as lng
    from customer c
    join branch b on b.id = c.branch_id
    left join person p on p.id = c.person_id
   where b.company_id = $1
     and c.geo is not null`;

const toStop = (r: StopRow): RouteStop => ({
  id: r.id,
  code: r.code,
  name: r.name,
  lat: Number(r.lat),
  lng: Number(r.lng),
});

@Injectable()
export class RoutingRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** توقف‌ها برای فهرستِ صریحِ شناسهٔ مشتریان. */
  async stopsByCustomerIds(companyId: string, ids: string[]): Promise<RouteStop[]> {
    if (ids.length === 0) return [];
    const { rows } = await this.pool.query<StopRow>(
      `${SELECT_STOPS} and c.id = any($2::uuid[]) order by c.code`,
      [companyId, ids],
    );
    return rows.map(toStop);
  }

  /** همهٔ مشتریانِ یک مسیر (route) — برای بهینه‌سازیِ کلِ مسیرِ ویزیت. */
  async stopsByRoute(companyId: string, routeId: string): Promise<RouteStop[]> {
    const { rows } = await this.pool.query<StopRow>(
      `${SELECT_STOPS} and c.route_id = $2 order by c.code`,
      [companyId, routeId],
    );
    return rows.map(toStop);
  }
}
