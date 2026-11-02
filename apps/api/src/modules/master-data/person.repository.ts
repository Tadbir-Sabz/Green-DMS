import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type { CreatePersonDto, ListPersonsQueryDto, UpdatePersonDto } from './person.dto';

/**
 * ستون‌های پاسخ — دقیقاً مطابق اسکیمای Person در openapi.yaml
 * (id/created_at فقط‌خواندنی‌اند؛ deleted_at/row_version داخل قرارداد نیستند
 *  پس هرگز در پاسخ برنمی‌گردند.)
 */
const COLUMNS = `
  id, code, legal_type, first_name, last_name, legal_name,
  national_id, economic_code, is_active, created_at`;

export interface PersonRow extends QueryResultRow {
  id: string;
  code: string;
  legal_type: string;
  first_name: string | null;
  last_name: string | null;
  legal_name: string | null;
  national_id: string | null;
  economic_code: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ListPersonsResult {
  items: PersonRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

/** ستون‌های قابل نوشتن در UPDATE — هرگز نام ستون از بیرون نمی‌آید (مصون از injection) */
const UPDATABLE: (keyof PersonRow)[] = [
  'code',
  'legal_type',
  'first_name',
  'last_name',
  'legal_name',
  'national_id',
  'economic_code',
  'is_active',
];

const encodeCursor = (code: string): string => Buffer.from(code, 'utf8').toString('base64url');
const decodeCursor = (cursor: string): string =>
  Buffer.from(cursor, 'base64url').toString('utf8');

/**
 * دسترسی داده اشخاص — SQL خام روی جدول `person` (بدون ORM، طبق §۳.۲ سند).
 * همه کوئری‌ها company_id نشست را شرط می‌کنند (درز چندشرکتی ندارد) و حذف نرم
 * (deleted_at) رد می‌شود؛ به‌روزرسانی‌ها row_version/updated_at را تریگر trg_touch
 * (مهاجرت 0020) بالا می‌برد.
 */
@Injectable()
export class PersonRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(companyId: string, query: ListPersonsQueryDto): Promise<ListPersonsResult> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['company_id = $1', 'deleted_at is null'];

    if (query.q) {
      params.push(`%${query.q}%`);
      where.push(`(code ilike $${params.length}
                or legal_name ilike $${params.length}
                or (coalesce(first_name, '') || ' ' || coalesce(last_name, '')) ilike $${params.length}
                or national_id ilike $${params.length})`);
    }
    if (query.legal_type) {
      params.push(query.legal_type);
      where.push(`legal_type = $${params.length}`);
    }
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      where.push(`code > $${params.length}`);
    }
    params.push(limit + 1);

    const { rows } = await this.pool.query<PersonRow>(
      `select ${COLUMNS} from person
        where ${where.join(' and ')}
        order by code
        limit $${params.length}`,
      params,
    );

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    return { items, hasMore, nextCursor: hasMore && last ? encodeCursor(last.code) : null };
  }

  async findById(companyId: string, id: string): Promise<PersonRow | null> {
    const { rows } = await this.pool.query<PersonRow>(
      `select ${COLUMNS} from person
        where id = $1 and company_id = $2 and deleted_at is null`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  /** آیا این کد/شناسه ملی پیش‌تر برای همین شرکت ثبت شده؟ (برای پیام 409 روشن) */
  async codeExists(companyId: string, code: string, exceptId?: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `select 1 from person
        where company_id = $1 and code = $2 and deleted_at is null
          and ($3::uuid is null or id <> $3::uuid)`,
      [companyId, code, exceptId ?? null],
    );
    return rows.length > 0;
  }

  async insert(companyId: string, dto: CreatePersonDto): Promise<PersonRow> {
    const { rows } = await this.pool.query<PersonRow>(
      `insert into person (company_id, code, legal_type,
                           first_name, last_name, legal_name,
                           national_id, economic_code, is_active)
       values ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9, true))
       returning ${COLUMNS}`,
      [
        companyId,
        dto.code,
        dto.legal_type,
        dto.first_name ?? null,
        dto.last_name ?? null,
        dto.legal_name ?? null,
        dto.national_id ?? null,
        dto.economic_code ?? null,
        dto.is_active,
      ],
    );
    return rows[0];
  }

  async update(companyId: string, id: string, dto: UpdatePersonDto): Promise<PersonRow | null> {
    const sets: string[] = [];
    const params: unknown[] = [id, companyId];

    const add = (fragment: string, value: unknown): void => {
      params.push(value);
      sets.push(fragment.replace('$?', `$${params.length}`));
    };

    for (const col of UPDATABLE) {
      const value = dto[col as keyof UpdatePersonDto];
      if (value !== undefined) add(`${col} = $?`, value);
    }
    if (sets.length === 0) return this.findById(companyId, id);

    const { rows } = await this.pool.query<PersonRow>(
      `update person set ${sets.join(', ')}
        where id = $1
          and company_id = $2
          and deleted_at is null
        returning ${COLUMNS}`,
      params,
    );
    return rows[0] ?? null;
  }
}
