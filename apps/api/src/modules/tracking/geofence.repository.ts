import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type { CreateGeofenceDto, UpdateGeofenceDto } from './geofence.dto';

export interface GeofenceRow extends QueryResultRow {
  id: string;
  name: string;
  kind: string;
  customer_id: string | null;
  warehouse_id: string | null;
  is_active: boolean;
  area: unknown; // GeoJSON Polygon از ST_AsGeoJSON
}

const encodeCursor = (id: string): string => Buffer.from(id, 'utf8').toString('base64url');
const decodeCursor = (cursor: string): string => Buffer.from(cursor, 'base64url').toString('utf8');

const COLUMNS =
  'g.id, g.name, g.kind, g.customer_id, g.warehouse_id, g.is_active, ' +
  'ST_AsGeoJSON(ST_GeometryN(g.area::geometry, 1))::json as area';

@Injectable()
export class GeofenceRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(
    companyId: string,
    query: { cursor?: string; limit?: number; is_active?: boolean },
  ): Promise<{ items: GeofenceRow[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['g.branch_id in (select id from branch where company_id = $1)'];
    if (typeof query.is_active === 'boolean') {
      params.push(query.is_active);
      where.push(`g.is_active = $${params.length}`);
    }
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      where.push(`g.id > $${params.length}`);
    }
    params.push(limit + 1);

    const { rows } = await this.pool.query<GeofenceRow>(
      `select ${COLUMNS} from geofence g
        where ${where.join(' and ')}
        order by g.id
        limit $${params.length}`,
      params,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return { items: page, hasMore, nextCursor: hasMore && last ? encodeCursor(last.id) : null };
  }

  async findById(companyId: string, id: string): Promise<GeofenceRow | null> {
    const { rows } = await this.pool.query<GeofenceRow>(
      `select ${COLUMNS} from geofence g
        where g.id = $1 and g.branch_id in (select id from branch where company_id = $2)`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  /** درج با شعبهٔ پیش‌فرض شرکت؛ area از GeoJSON به MultiPolygon geography تبدیل می‌شود */
  async insert(companyId: string, dto: CreateGeofenceDto): Promise<string> {
    const id = randomUUID();
    const { rows } = await this.pool.query<{ branch_id: string }>(
      `insert into geofence (id, branch_id, name, kind, area, customer_id, warehouse_id, is_active)
       select $1, b.id, $2, $3,
              ST_Multi(ST_GeomFromGeoJSON($4::text)::geometry)::geography,
              $5::uuid, $6::uuid, coalesce($7::boolean, true)
         from branch b
        where b.company_id = $8::uuid and b.is_active
        order by b.code
        limit 1
       returning branch_id`,
      [
        id,
        dto.name,
        dto.kind,
        JSON.stringify(dto.area),
        dto.customer_id ?? null,
        dto.warehouse_id ?? null,
        dto.is_active ?? null,
        companyId,
      ],
    );
    if (rows.length === 0) throw Object.assign(new Error('branch not found'), { pgCode: 'no_data' });
    return id;
  }

  /** به‌روزرسانی جزئی؛ فقط فیلدهای ارسالی تغییر می‌کنند */
  async update(companyId: string, id: string, dto: UpdateGeofenceDto): Promise<boolean> {
    const sets: string[] = [];
    const params: unknown[] = [id, companyId];
    const set = (column: string, value: unknown): void => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };
    if (dto.name !== undefined) set('name', dto.name);
    if (dto.kind !== undefined) set('kind', dto.kind);
    if (dto.area !== undefined) {
      params.push(JSON.stringify(dto.area));
      sets.push(`area = ST_Multi(ST_GeomFromGeoJSON($${params.length}::text)::geometry)::geography`);
    }
    if (dto.customer_id !== undefined) set('customer_id', dto.customer_id);
    if (dto.warehouse_id !== undefined) set('warehouse_id', dto.warehouse_id);
    if (dto.is_active !== undefined) set('is_active', dto.is_active);
    if (sets.length === 0) return true; // بدنهٔ خالی = بدون تغییر

    const { rowCount } = await this.pool.query(
      `update geofence set ${sets.join(', ')}
        where id = $1
          and branch_id in (select id from branch where company_id = $2)`,
      params,
    );
    return (rowCount ?? 0) > 0;
  }

  async remove(companyId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `delete from geofence
        where id = $1 and branch_id in (select id from branch where company_id = $2)`,
      [id, companyId],
    );
    return (rowCount ?? 0) > 0;
  }

  /** اعتبارسنجی مالکیت مشتری/انبار در همان شرکت */
  async targetsValid(companyId: string, dto: { customer_id?: string; warehouse_id?: string }): Promise<boolean> {
    if (dto.customer_id) {
      const { rows } = await this.pool.query(
        `select c.id from customer c join branch b on b.id = c.branch_id
          where c.id = $1 and b.company_id = $2`,
        [dto.customer_id, companyId],
      );
      if (rows.length === 0) return false;
    }
    if (dto.warehouse_id) {
      const { rows } = await this.pool.query(
        `select w.id from warehouse w join branch b on b.id = w.branch_id
          where w.id = $1 and b.company_id = $2`,
        [dto.warehouse_id, companyId],
      );
      if (rows.length === 0) return false;
    }
    return true;
  }
}
