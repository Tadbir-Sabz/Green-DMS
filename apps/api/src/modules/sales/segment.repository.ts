import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type {
  CreateCustomerSegmentDto,
  ListCustomerSegmentsQueryDto,
  UpdateCustomerSegmentDto,
} from './segment.dto';

export interface CustomerSegmentRow extends QueryResultRow {
  id: string;
  code: string;
  title: string;
  description: string | null;
  is_active: boolean;
  customer_count: number;
  row_version: number;
  created_at: string;
  updated_at: string;
}

/**
 * بخش‌بندی تجاری مشتری — SQL خام (بدونِ ORM طبق §۳.۲).
 * همهٔ کوئری‌ها مستقیماً با company_id محدود می‌شوند (RLS جدول customer_segment هم اجباری است).
 */
@Injectable()
export class CustomerSegmentRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(companyId: string, query: ListCustomerSegmentsQueryDto): Promise<CustomerSegmentRow[]> {
    const limit = Math.min(Math.max(query.limit ?? 200, 1), 500);
    const params: unknown[] = [companyId];
    const where = ['s.company_id = $1'];
    if (query.q) {
      params.push(`%${query.q}%`);
      where.push(`(s.code ilike $${params.length} or s.title ilike $${params.length})`);
    }
    if (query.is_active !== undefined) {
      params.push(query.is_active);
      where.push(`s.is_active = $${params.length}`);
    }
    params.push(limit);
    const { rows } = await this.pool.query<CustomerSegmentRow>(
      `select s.id, s.code, s.title, s.description, s.is_active,
              (select count(*)::integer from customer c
                join branch b on b.id = c.branch_id
               where c.segment_id = s.id and b.company_id = s.company_id
                 and c.deleted_at is null) as customer_count,
              s.row_version, s.created_at, s.updated_at
         from customer_segment s
        where ${where.join(' and ')}
        order by s.code
        limit $${params.length}`,
      params,
    );
    return rows;
  }

  async findById(companyId: string, id: string): Promise<CustomerSegmentRow | null> {
    const { rows } = await this.pool.query<CustomerSegmentRow>(
      `select s.id, s.code, s.title, s.description, s.is_active,
              (select count(*)::integer from customer c
                join branch b on b.id = c.branch_id
               where c.segment_id = s.id and b.company_id = s.company_id
                 and c.deleted_at is null) as customer_count,
              s.row_version, s.created_at, s.updated_at
         from customer_segment s
        where s.id = $1 and s.company_id = $2`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  async codeExists(companyId: string, code: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `select 1 from customer_segment where company_id = $1 and code = $2`,
      [companyId, code],
    );
    return rows.length > 0;
  }

  async insert(companyId: string, dto: CreateCustomerSegmentDto): Promise<string> {
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into customer_segment (company_id, code, title, description, is_active)
            values ($1, $2, $3, $4, coalesce($5, true))
         returning id`,
      [companyId, dto.code, dto.title.trim(), dto.description ?? null, dto.is_active ?? null],
    );
    return rows[0].id;
  }

  async update(
    companyId: string,
    id: string,
    dto: UpdateCustomerSegmentDto,
  ): Promise<CustomerSegmentRow | null> {
    const sets: string[] = [];
    const params: unknown[] = [id, companyId];
    const add = (fragment: string, value: unknown): void => {
      params.push(value);
      sets.push(fragment.replace('$?', `$${params.length}`));
    };
    if (dto.title !== undefined) add('title = $?', dto.title.trim());
    if (dto.description !== undefined) add('description = $?', dto.description);
    if (dto.is_active !== undefined) add('is_active = $?', dto.is_active);
    if (sets.length === 0) {
      return this.findById(companyId, id);
    }
    const { rows } = await this.pool.query<{ id: string }>(
      `update customer_segment set ${sets.join(', ')}
        where id = $1 and company_id = $2
      returning id`,
      params,
    );
    if (rows.length === 0) return null;
    return this.findById(companyId, id);
  }

  /** آیا بخش‌بندی برای انتساب به مشتری معتبر است (وجود + فعال)؟ */
  async assignable(companyId: string, id: string): Promise<'ok' | 'inactive' | 'not_found'> {
    const { rows } = await this.pool.query<{ is_active: boolean }>(
      `select is_active from customer_segment where id = $1 and company_id = $2`,
      [id, companyId],
    );
    if (rows.length === 0) return 'not_found';
    return rows[0].is_active ? 'ok' : 'inactive';
  }
}
