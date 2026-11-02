import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type { CreateStaffDto, ListStaffQueryDto, UpdateStaffDto } from './staff.dto';

/**
 * ستون‌های پاسخ — دقیقاً مطابق اسکیمای Staff در openapi.yaml:
 * - status از سه‌حالت DB (active/suspended/terminated) به دوحالت قرارداد نگاشت می‌شود
 * - job_position_code از روی job_position_id می‌آید (قرارداد کد می‌خواهد نه شناسه)
 * - area_ids از جدول staff_area (مهاجرت 0026) به‌صورت آرایه ساخته می‌شود
 * - فیلدهای غیرقابل‌null قرارداد (employee_no/hire_date) اگر null باشند حذف می‌شوند
 */
const COLUMNS = `
  s.id, s.person_id, s.branch_id,
  jp.code as job_position_code,
  s.employee_no,
  to_char(s.hire_date, 'YYYY-MM-DD') as hire_date,
  s.supervisor_id, s.vehicle_id, s.is_field,
  case when s.status = 'active' then 'active' else 'inactive' end as status,
  s.created_at,
  s.row_version,
  coalesce(
    (select json_agg(sa.area_id::text) from staff_area sa where sa.staff_id = s.id),
    '[]'::json
  ) as area_ids`;

const FROM = `from staff s
  join job_position jp on jp.id = s.job_position_id
  join branch b on b.id = s.branch_id`;

export interface StaffRow extends QueryResultRow {
  id: string;
  person_id: string;
  branch_id: string;
  job_position_code: string;
  employee_no: string | null;
  hire_date: string | null;
  supervisor_id: string | null;
  vehicle_id: string | null;
  is_field: boolean;
  status: 'active' | 'inactive';
  created_at: string;
  row_version: number;
  area_ids: string[];
}

export interface ListStaffResult {
  items: StaffRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

const encodeCursor = (code: string): string => Buffer.from(code, 'utf8').toString('base64url');
const decodeCursor = (cursor: string): string =>
  Buffer.from(cursor, 'base64url').toString('utf8');

/**
 * شکل‌دهی نهایی ردیف: کلیدهای کمکی کوئری (person_code) و فیلدهای بدون nullِ
 * قرارداد (employee_no/hire_date) حذف می‌شوند — پاسخ دقیقاً اسکیمای Staff است.
 */
const shape = (row: StaffRow & { person_code?: string }): StaffRow => {
  const { employee_no, hire_date, person_code: _person_code, ...rest } = row;
  return {
    ...rest,
    ...(employee_no ? { employee_no } : {}),
    ...(hire_date ? { hire_date } : {}),
  } as StaffRow;
};

/**
 * دسترسی داده پرسنل — SQL خام روی staff/staff_area (بدون ORM، طبق §۳.۲ سند).
 * همه کوئری‌ها از طریق branch.company_id به شرکت نشست قفل می‌شوند (درز چندشرکتی ندارد)
 * و به‌روزرسانی‌ها row_version/updated_at را تریگر trg_touch (مهاجرت 0020) بالا می‌برد.
 */
@Injectable()
export class StaffRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** نگاشت وضعیت قرارداد به قید DB (خواندن: هر چیزِ غیرفعال → inactive) */
  private static readonly DB_STATUS: Record<string, string> = {
    active: 'active',
    inactive: 'terminated',
  };

  async list(companyId: string, query: ListStaffQueryDto): Promise<ListStaffResult> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['b.company_id = $1'];

    if (query.job_position_code) {
      params.push(query.job_position_code);
      where.push(`jp.code = $${params.length}`);
    }
    if (query.supervisor_id) {
      params.push(query.supervisor_id);
      where.push(`s.supervisor_id = $${params.length}`);
    }
    if (query.is_field !== undefined) {
      params.push(query.is_field);
      where.push(`s.is_field = $${params.length}`);
    }
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      // ترتیب روی کدِ شخص (در شرکت یکتا) تا cursor پایدار بماند
      where.push(`p.code > $${params.length}`);
    }
    params.push(limit + 1);

    const { rows } = await this.pool.query<StaffRow & { person_code: string }>(
      `select ${COLUMNS}, p.code as person_code
         ${FROM}
         join person p on p.id = s.person_id
        where ${where.join(' and ')}
        order by p.code
        limit $${params.length}`,
      params,
    );

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map(shape),
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(last.person_code) : null,
    };
  }

  async findById(companyId: string, id: string): Promise<StaffRow | null> {
    const { rows } = await this.pool.query<StaffRow>(
      `select ${COLUMNS} ${FROM} where s.id = $1 and b.company_id = $2`,
      [id, companyId],
    );
    return rows[0] ? shape(rows[0]) : null;
  }

  // ---------------- بررسی‌های ارجاعی (پیام فارسی به‌جای خطای قید) ----------------

  async personExists(companyId: string, personId: string): Promise<boolean> {
    return this.exists(
      'select 1 from person where id = $1 and company_id = $2 and deleted_at is null',
      personId,
      companyId,
    );
  }

  /** شعبه پیش‌فرض شرکت وقتی client شعبه نفرستد (شعبه در قرارداد اختیاری است) */
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

  async jobPositionId(companyId: string, code: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string }>(
      'select id from job_position where company_id = $1 and code = $2',
      [companyId, code],
    );
    return rows[0]?.id ?? null;
  }

  async staffExists(companyId: string, staffId: string): Promise<boolean> {
    return this.exists(
      `select 1 from staff s join branch b on b.id = s.branch_id
        where s.id = $1 and b.company_id = $2`,
      staffId,
      companyId,
    );
  }

  async vehicleExists(companyId: string, vehicleId: string): Promise<boolean> {
    return this.exists(
      `select 1 from vehicle v join branch b on b.id = v.branch_id
        where v.id = $1 and b.company_id = $2`,
      vehicleId,
      companyId,
    );
  }

  /** همه حوزه‌های داده‌شده باید متعلق به همین شرکت باشند */
  async areasBelongTo(companyId: string, areaIds: string[]): Promise<boolean> {
    if (areaIds.length === 0) return true;
    const { rows } = await this.pool.query<{ n: string }>(
      `select count(*)::text as n
         from sales_area a join branch b on b.id = a.branch_id
        where a.id = any($2::uuid[]) and b.company_id = $1`,
      [companyId, areaIds],
    );
    return Number(rows[0]?.n ?? 0) === areaIds.length;
  }

  private async exists(sql: string, ...values: unknown[]): Promise<boolean> {
    const { rows } = await this.pool.query(sql, values);
    return rows.length > 0;
  }

  // ---------------- نوشتن ----------------

  async insert(dto: CreateStaffDto, branchId: string, jobPositionId: string): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into staff (person_id, branch_id, job_position_id, employee_no,
                          hire_date, supervisor_id, vehicle_id, is_field, status)
       values ($1, $2, $3, $4, $5, $6, $7, coalesce($8, false), $9)
       returning id`,
      [
        dto.person_id,
        branchId,
        jobPositionId,
        dto.employee_no ?? null,
        dto.hire_date ?? null,
        dto.supervisor_id ?? null,
        dto.vehicle_id ?? null,
        dto.is_field ?? null,
        StaffRepository.DB_STATUS[dto.status ?? 'active'],
      ],
    );
    return rows[0].id;
  }

  async update(
    companyId: string,
    id: string,
    dto: UpdateStaffDto,
    jobPositionId?: string,
  ): Promise<string | null> {
    const sets: string[] = [];
    const params: unknown[] = [id, companyId];

    const add = (fragment: string, value: unknown): void => {
      params.push(value);
      sets.push(fragment.replace('$?', `$${params.length}`));
    };

    if (dto.person_id !== undefined) add('person_id = $?', dto.person_id);
    if (dto.employee_no !== undefined) add('employee_no = $?', dto.employee_no);
    if (dto.hire_date !== undefined) add('hire_date = $?', dto.hire_date);
    if (dto.supervisor_id !== undefined) add('supervisor_id = $?', dto.supervisor_id);
    if (dto.vehicle_id !== undefined) add('vehicle_id = $?', dto.vehicle_id);
    if (dto.is_field !== undefined) add('is_field = $?', dto.is_field);
    if (dto.status !== undefined) add('status = $?', StaffRepository.DB_STATUS[dto.status]);
    if (jobPositionId !== undefined) add('job_position_id = $?', jobPositionId);
    if (sets.length === 0) return id;

    // قفل خوش‌بینانه: نسخهٔ ارسالی باید با سرور یکی باشد
    if (dto.row_version !== undefined) params.push(dto.row_version);
    const versionClause =
      dto.row_version !== undefined ? ` and s.row_version = $${params.length}` : '';

    const { rows } = await this.pool.query<{ id: string }>(
      `update staff s set ${sets.join(', ')}
        where s.id = $1
          and exists (select 1 from branch b where b.id = s.branch_id and b.company_id = $2)${versionClause}
        returning s.id`,
      params,
    );
    return rows[0]?.id ?? null;
  }

  /** جایگزینی کامل حوزه‌های کار (area_ids فقط وقتی در بدنه آمده باشد) */
  async replaceAreas(staffId: string, areaIds: string[]): Promise<void> {
    await this.pool.query('delete from staff_area where staff_id = $1', [staffId]);
    if (areaIds.length === 0) return;
    await this.pool.query(
      `insert into staff_area (staff_id, area_id)
       select $1, unnest($2::uuid[])
       on conflict do nothing`,
      [staffId, areaIds],
    );
  }
}
