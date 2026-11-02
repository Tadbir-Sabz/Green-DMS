import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type { ListRolesQueryDto } from './roles.dto';

/** نقش طبق openapi › schemas.Role — permission_codes از role_permission جمع می‌شود */
export interface RoleRow extends QueryResultRow {
  id: string;
  code: string;
  name: string;
  is_system: boolean;
  permission_codes: string[];
}

export interface ListRolesResult {
  items: RoleRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface UpsertRoleInput {
  code?: string;
  name?: string;
  /** undefined یعنی دست نخورده؛ آرایه خالی یعنی همه مجوزها برداشته شوند */
  permissionCodes?: string[];
}

const COLUMNS = `
  r.id, r.code, r.name, r.is_system,
  coalesce((
    select json_agg(rp.permission_code order by rp.permission_code)
      from role_permission rp where rp.role_id = r.id
  ), '[]'::json) as permission_codes`;

const encodeCursor = (code: string): string => Buffer.from(code, 'utf8').toString('base64url');
const decodeCursor = (cursor: string): string =>
  Buffer.from(cursor, 'base64url').toString('utf8');

/**
 * دسترسی داده نقش‌ها — SQL خام روی role/role_permission/permission (بدون ORM، §۳.۲).
 * همه کوئری‌ها company_id نشست را شرط می‌کنند؛ permission جدولی سراسری است
 * (seed مهاجرت 0022) و فقط اعتبار الگوها را می‌سنجد.
 */
@Injectable()
export class RolesRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(companyId: string, query: ListRolesQueryDto): Promise<ListRolesResult> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['r.company_id = $1'];

    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      where.push(`r.code > $${params.length}`);
    }
    params.push(limit + 1);

    const { rows } = await this.pool.query<RoleRow>(
      `select ${COLUMNS} from role r
        where ${where.join(' and ')}
        order by r.code
        limit $${params.length}`,
      params,
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return { items, hasMore, nextCursor: hasMore && last ? encodeCursor(last.code) : null };
  }

  async findById(companyId: string, id: string): Promise<RoleRow | null> {
    const { rows } = await this.pool.query<RoleRow>(
      `select ${COLUMNS} from role r where r.id = $1 and r.company_id = $2`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  /** الگوهای مجوزی که در جدول permission نیستند (برای پیام روشن 400) */
  async findMissingPermissionCodes(codes: string[]): Promise<string[]> {
    if (codes.length === 0) return [];
    const { rows } = await this.pool.query<{ code: string }>(
      'select code from permission where code = any($1::text[])',
      [codes],
    );
    const known = new Set(rows.map((r) => r.code));
    return [...new Set(codes)].filter((c) => !known.has(c));
  }

  /** چند کاربر فعال به این نقش نسبت داده‌اند (برای قید DELETE در قرارداد) */
  async countAssignedUsers(roleId: string): Promise<number> {
    const { rows } = await this.pool.query<{ count: string }>(
      'select count(*)::text as count from user_role where role_id = $1',
      [roleId],
    );
    return Number(rows[0].count);
  }

  /** ساخت نقش و نگاشت مجوزهایش در یک تراکنش */
  async insert(companyId: string, input: Required<UpsertRoleInput>): Promise<RoleRow> {
    const client = await this.pool.connect();
    let roleId: string;
    try {
      await client.query('begin');
      const { rows } = await client.query<{ id: string }>(
        'insert into role (company_id, code, name) values ($1, $2, $3) returning id',
        [companyId, input.code, input.name],
      );
      roleId = rows[0].id;
      if (input.permissionCodes.length > 0) {
        await client.query(
          'insert into role_permission (role_id, permission_code) select $1, unnest($2::text[])',
          [roleId, input.permissionCodes],
        );
      }
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
    return (await this.findById(companyId, roleId)) as RoleRow;
  }

  /** بروزرسانی نقش؛ permission_codes داده شده باشد جایگزین کامل می‌شود (یک تراکنش) */
  async update(
    companyId: string,
    id: string,
    input: UpsertRoleInput,
  ): Promise<RoleRow | null> {
    const sets: string[] = [];
    const params: unknown[] = [id, companyId];
    if (input.code !== undefined) {
      params.push(input.code);
      sets.push(`code = $${params.length}`);
    }
    if (input.name !== undefined) {
      params.push(input.name);
      sets.push(`name = $${params.length}`);
    }

    const client = await this.pool.connect();
    try {
      await client.query('begin');

      if (sets.length > 0) {
        const { rows } = await client.query<{ id: string }>(
          `update role set ${sets.join(', ')}
            where id = $1 and company_id = $2 returning id`,
          params,
        );
        if (rows.length === 0) {
          await client.query('rollback');
          return null;
        }
      }

      if (input.permissionCodes !== undefined) {
        await client.query('delete from role_permission where role_id = $1', [id]);
        if (input.permissionCodes.length > 0) {
          await client.query(
            'insert into role_permission (role_id, permission_code) select $1, unnest($2::text[])',
            [id, input.permissionCodes],
          );
        }
      }

      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
    return this.findById(companyId, id);
  }

  /** حذف نقش (role_permission و user_role با on delete cascade پاک می‌شوند) */
  async delete(companyId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      'delete from role where id = $1 and company_id = $2',
      [id, companyId],
    );
    return (rowCount ?? 0) > 0;
  }
}
