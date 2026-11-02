import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type {
  CreateWarehouseDto,
  ListWarehousesQueryDto,
  UpdateWarehouseDto,
} from './warehouse.dto';

/**
 * ستون‌های پاسخ — دقیقاً مطابق اسکیمای Warehouse در openapi.yaml.
 * همه فیلدها مطابق DDL (مهاجرت 0008) برمی‌گردند.
 */
const COLUMNS = `
  w.id, w.branch_id, w.code, w.name, w.kind, w.parent_warehouse_id,
  w.vehicle_id, w.area_id, w.allow_negative, w.is_active, w.row_version`;

const FROM = `from warehouse w
  join branch b on b.id = w.branch_id`;

export interface WarehouseRow extends QueryResultRow {
  id: string;
  branch_id: string;
  code: string;
  name: string;
  kind: string;
  parent_warehouse_id: string | null;
  vehicle_id: string | null;
  area_id: string | null;
  allow_negative: boolean;
  is_active: boolean;
}

export interface ListWarehousesResult {
  items: WarehouseRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** کرسر ترکیبی code|id چون کد انبار در شعبه یکتا است نه در کل شرکت */
const encodeCursor = (code: string, id: string): string =>
  Buffer.from(`${code}|${id}`, 'utf8').toString('base64url');
const decodeCursor = (cursor: string): [string, string] => {
  const [code, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  return [code, id];
};

/**
 * دسترسی داده انبار — SQL خام روی warehouse (بدون ORM، طبق §۳.۲).
 * همه کوئری‌ها از طریق branch.company_id به شرکت نشست قفل می‌شوند؛ حذف نرم ندارد
 * (ستون deleted_at تعریف نشده) و به‌روزرسانی‌ها را trg_touch (مهاجرت 0020) بالا می‌برد.
 */
@Injectable()
export class WarehouseRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(companyId: string, query: ListWarehousesQueryDto): Promise<ListWarehousesResult> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['b.company_id = $1'];

    if (query.kind) {
      params.push(query.kind);
      where.push(`w.kind = $${params.length}`);
    }
    if (query.branch_id) {
      params.push(query.branch_id);
      where.push(`w.branch_id = $${params.length}`);
    }
    if (query.cursor) {
      const [code, id] = decodeCursor(query.cursor);
      params.push(code, id);
      where.push(`(w.code, w.id) > ($${params.length - 1}, $${params.length})`);
    }
    params.push(limit + 1);

    const { rows } = await this.pool.query<WarehouseRow>(
      `select ${COLUMNS}
         ${FROM}
        where ${where.join(' and ')}
        order by w.code, w.id
        limit $${params.length}`,
      params,
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page,
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(last.code, last.id) : null,
    };
  }

  async findById(companyId: string, id: string): Promise<WarehouseRow | null> {
    const { rows } = await this.pool.query<WarehouseRow>(
      `select ${COLUMNS} ${FROM} where w.id = $1 and b.company_id = $2`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  // ---------------- بررسی‌های ارجاعی (پیام فارسی به‌جای خطای قید) ----------------

  /** شعبه پیش‌فرض شرکت وقتی client شعبه نفرستد */
  async defaultBranchId(companyId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string }>(
      'select id from branch where company_id = $1 and is_active order by code limit 1',
      [companyId],
    );
    return rows[0]?.id ?? null;
  }

  async branchExists(companyId: string, branchId: string): Promise<boolean> {
    return this.exists('select 1 from branch where id = $1 and company_id = $2', branchId, companyId);
  }

  async areaExists(companyId: string, areaId: string): Promise<boolean> {
    return this.exists(
      `select 1 from sales_area a join branch b on b.id = a.branch_id
        where a.id = $1 and b.company_id = $2`,
      areaId,
      companyId,
    );
  }

  async vehicleExists(vehicleId: string): Promise<boolean> {
    return this.exists('select 1 from vehicle where id = $1', vehicleId);
  }

  /** انبار والد باید متعلق به همان شرکت باشد */
  async warehouseExists(companyId: string, warehouseId: string): Promise<boolean> {
    return this.exists(
      `select 1 from warehouse w join branch b on b.id = w.branch_id
        where w.id = $1 and b.company_id = $2`,
      warehouseId,
      companyId,
    );
  }

  private async exists(sql: string, ...values: unknown[]): Promise<boolean> {
    const { rows } = await this.pool.query(sql, values);
    return rows.length > 0;
  }

  // ---------------- نوشتن ----------------

  async insert(companyId: string, dto: CreateWarehouseDto, branchId: string): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into warehouse (branch_id, code, name, kind, parent_warehouse_id,
                              vehicle_id, area_id, allow_negative, is_active)
       values ($1, $2, $3, $4, $5, $6, $7, coalesce($8, false), coalesce($9, true))
       returning id`,
      [
        branchId,
        dto.code,
        dto.name,
        dto.kind,
        dto.parent_warehouse_id ?? null,
        dto.vehicle_id ?? null,
        dto.area_id ?? null,
        dto.allow_negative ?? null,
        dto.is_active ?? null,
      ],
    );
    return rows[0].id;
  }

  async update(companyId: string, id: string, dto: UpdateWarehouseDto): Promise<string | null> {
    const sets: string[] = [];
    const params: unknown[] = [id, companyId];

    const add = (fragment: string, value: unknown): void => {
      params.push(value);
      sets.push(fragment.replace('$?', `$${params.length}`));
    };

    if (dto.branch_id !== undefined) add('branch_id = $?', dto.branch_id);
    if (dto.code !== undefined) add('code = $?', dto.code);
    if (dto.name !== undefined) add('name = $?', dto.name);
    if (dto.kind !== undefined) add('kind = $?', dto.kind);
    if (dto.parent_warehouse_id !== undefined) add('parent_warehouse_id = $?', dto.parent_warehouse_id);
    if (dto.vehicle_id !== undefined) add('vehicle_id = $?', dto.vehicle_id);
    if (dto.area_id !== undefined) add('area_id = $?', dto.area_id);
    if (dto.allow_negative !== undefined) add('allow_negative = $?', dto.allow_negative);
    if (dto.is_active !== undefined) add('is_active = $?', dto.is_active);

    if (sets.length === 0) return id;

    // قفل خوش‌بینانه: نسخهٔ ارسالی باید با سرور یکی باشد
    if (dto.row_version !== undefined) params.push(dto.row_version);
    const versionClause =
      dto.row_version !== undefined ? ` and w.row_version = $${params.length}` : '';

    const { rows } = await this.pool.query<{ id: string }>(
      `update warehouse w set ${sets.join(', ')}
        where w.id = $1
          and exists (select 1 from branch b where b.id = w.branch_id and b.company_id = $2)${versionClause}
        returning w.id`,
      params,
    );
    return rows[0]?.id ?? null;
  }
}
