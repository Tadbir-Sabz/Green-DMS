import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type { CreateUserDto, ListUsersQueryDto, UpdateUserDto } from './users.dto';

/** کاربر طبق openapi › schemas.User — role_ids با json_agg در همان کوئری پر می‌شود */
export interface UserRow extends QueryResultRow {
  id: string;
  username: string;
  staff_id: string | null;
  role_ids: string[];
  is_active: boolean;
  /** قفل دستی توسط مدیر — در پاسخ /users می‌آید تا رابط کاربری وضعیت قفل را نشان دهد */
  is_locked: boolean;
  locked_until: Date | null;
  last_login_at: Date | null;
  created_at: Date;
}

export interface ListUsersResult {
  items: UserRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** داده ورودی insert — نتیجه resolveشدن شخص (پرسنل موجود یا شخص تازه) در سرویس */
export interface InsertUserInput {
  username: string;
  passwordHash: string | null;
  accessLevel: string;
  isActive: boolean;
  /** اگر داده شود شخصِ همان پرسنل استفاده می‌شود */
  personId?: string | null;
  /** در غیر این صورت شخص تازه با این کد/نام ساخته می‌شود */
  personCode?: string;
  firstName?: string;
  lastName?: string | null;
  roleIds: string[];
}

export interface UpdateUserInput {
  username?: string;
  passwordHash?: string | null;
  accessLevel?: string;
  isActive?: boolean;
  isLocked?: boolean;
  roleIds?: string[];
}

const COLUMNS = `
  u.id, u.username, s.id as staff_id,
  coalesce((
    select json_agg(ur.role_id order by ur.role_id)
      from user_role ur where ur.app_user_id = u.id
  ), '[]'::json) as role_ids,
  (u.is_active and p.is_active) as is_active,
  u.is_locked, u.locked_until, u.last_login_at, u.created_at`;

const FROM = `
  from app_user u
  join person p on p.id = u.person_id
  left join staff s on s.person_id = p.id`;

const encodeCursor = (username: string): string =>
  Buffer.from(username, 'utf8').toString('base64url');
const decodeCursor = (cursor: string): string =>
  Buffer.from(cursor, 'base64url').toString('utf8');

/**
 * دسترسی داده کاربران — SQL خام روی app_user/person/user_role (بدون ORM، §۳.۲).
 * شرکتِ نشست همیشه از person پیمایش می‌شود؛ app_user خودش company_id ندارد
 * و هیچ کوئری‌ای بدون آن اجرا نمی‌شود (درز چندشرکتی ندارد).
 * کاربر هرگز حذف فیزیکی نمی‌شود (ممیزی): غیرفعال‌سازی با is_active انجام می‌شود.
 */
@Injectable()
export class UsersRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(companyId: string, query: ListUsersQueryDto): Promise<ListUsersResult> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['p.company_id = $1'];

    if (query.role) {
      params.push(query.role);
      where.push(`exists (
        select 1 from user_role ur
        join role r on r.id = ur.role_id
         where ur.app_user_id = u.id
           and (r.code = $${params.length} or r.id::text = $${params.length}))`);
    }
    if (query.is_active !== undefined) {
      params.push(query.is_active);
      where.push(`(u.is_active and p.is_active) = $${params.length}`);
    }
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      where.push(`u.username > $${params.length}`);
    }
    params.push(limit + 1);

    const { rows } = await this.pool.query<UserRow>(
      `select ${COLUMNS} ${FROM}
        where ${where.join(' and ')}
        order by u.username
        limit $${params.length}`,
      params,
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return { items, hasMore, nextCursor: hasMore && last ? encodeCursor(last.username) : null };
  }

  async findById(companyId: string, id: string): Promise<UserRow | null> {
    const { rows } = await this.pool.query<UserRow>(
      `select ${COLUMNS} ${FROM} where u.id = $1 and p.company_id = $2`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  /** آیا نام کاربری قبلاً ثبت شده؟ (سریع‌تر از قید دیتابیس؛ پیام روشن 409 می‌دهد) */
  async usernameExists(username: string): Promise<boolean> {
    const { rows } = await this.pool.query('select 1 from app_user where username = $1', [
      username,
    ]);
    return rows.length > 0;
  }

  /** شخصِ پرسنل انتخاب‌شده در همین شرکت؛ null یعنی پرسنل برای این شرکت نیست */
  async findStaffPersonId(companyId: string, staffId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ person_id: string }>(
      `select s.person_id from staff s
         join branch b on b.id = s.branch_id
        where s.id = $1 and b.company_id = $2`,
      [staffId, companyId],
    );
    return rows[0]?.person_id ?? null;
  }

  /** کدام‌یک از نقش‌های خواسته‌شده برای همین شرکت وجود دارند (برای پیام روشن 400) */
  async findExistingRoleIds(companyId: string, roleIds: string[]): Promise<string[]> {
    if (roleIds.length === 0) return [];
    const { rows } = await this.pool.query<{ id: string }>(
      'select id from role where company_id = $1 and id = any($2::uuid[])',
      [companyId, roleIds],
    );
    return rows.map((r) => r.id);
  }

  /**
   * ساخت کاربر در یک تراکنش: شخصِ تازه (در صورت نبودِ staff) ← app_user ← نگاشت نقش‌ها.
   * خطای نام/کد تکراری همان 23505 دیتابیس است تا سرویس آن را 409 کند.
   */
  async insert(companyId: string, input: InsertUserInput): Promise<UserRow> {
    const client = await this.pool.connect();
    let userId: string;
    try {
      await client.query('begin');

      let personId = input.personId ?? null;
      if (!personId) {
        const { rows } = await client.query<{ id: string }>(
          `insert into person (company_id, code, first_name, last_name)
           values ($1, $2, $3, $4) returning id`,
          [
            companyId,
            input.personCode ?? `USR-${input.username}`,
            input.firstName ?? input.username,
            input.lastName ?? null,
          ],
        );
        personId = rows[0].id;
      }

      const { rows: userRows } = await client.query<{ id: string }>(
        `insert into app_user (person_id, username, password_hash, access_level, is_active)
         values ($1, $2, $3, $4, $5) returning id`,
        [personId, input.username, input.passwordHash, input.accessLevel, input.isActive],
      );
      userId = userRows[0].id;

      for (const roleId of input.roleIds) {
        await client.query(
          'insert into user_role (app_user_id, role_id) values ($1, $2) on conflict do nothing',
          [userId, roleId],
        );
      }

      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
    return (await this.findById(companyId, userId)) as UserRow;
  }

  /**
   * بروزرسانی فیلدها و (در صورت داده‌شدن) جایگزینی کامل نقش‌ها — همه در یک تراکنش.
   * is_locked=false قفل زمانی و شمارنده تلاش را هم پاک می‌کند (باز کردن توسط مدیر).
   */
  async update(
    companyId: string,
    id: string,
    input: UpdateUserInput,
  ): Promise<UserRow | null> {
    const sets: string[] = [];
    const params: unknown[] = [id, companyId];

    const add = (fragment: string, value: unknown): void => {
      params.push(value);
      sets.push(fragment.replace('$?', `$${params.length}`));
    };
    if (input.username !== undefined) add('username = $?', input.username);
    if (input.passwordHash !== undefined) add('password_hash = $?', input.passwordHash);
    if (input.accessLevel !== undefined) add('access_level = $?', input.accessLevel);
    if (input.isActive !== undefined) add('is_active = $?', input.isActive);
    if (input.isLocked !== undefined) {
      add('is_locked = $?', input.isLocked);
      if (!input.isLocked) {
        sets.push('locked_until = null', 'failed_attempts = 0');
      }
    }

    const client = await this.pool.connect();
    try {
      await client.query('begin');

      if (sets.length > 0) {
        const { rows } = await client.query<{ id: string }>(
          `update app_user set ${sets.join(', ')}
            where id = $1
              and person_id in (select id from person where company_id = $2)
            returning id`,
          params,
        );
        if (rows.length === 0) {
          await client.query('rollback');
          return null;
        }
      }

      if (input.roleIds) {
        await client.query('delete from user_role where app_user_id = $1', [id]);
        for (const roleId of input.roleIds) {
          await client.query(
            'insert into user_role (app_user_id, role_id) values ($1, $2) on conflict do nothing',
            [id, roleId],
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

  /** غیرفعال‌سازی (حذف فیزیکی ممنوع — ممیزی)؛ false یعنی کاربر در این شرکت نیست */
  async deactivate(companyId: string, id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `update app_user set is_active = false
        where id = $1
          and person_id in (select id from person where company_id = $2)`,
      [id, companyId],
    );
    return (rowCount ?? 0) > 0;
  }
}
