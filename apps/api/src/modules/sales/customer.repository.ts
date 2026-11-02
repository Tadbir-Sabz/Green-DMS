import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type {
  CreateCustomerDto,
  ListCustomersQueryDto,
  UpdateCustomerDto,
  UpdateLocationDto,
} from './customer.dto';

/**
 * ستون‌های پاسخ — دقیقاً مطابق اسکیمای Customer در openapi.yaml:
 * - geo از geography به GeoPoint («Point» + [طول، عرض]) تبدیل می‌شود
 * - credit_limit از جدول customer_credit می‌آید (رشته اعشاری طبق قرارداد)
 * - geo_accuracy_m با cast به float8 برمی‌گردد چون pg نوع numeric را رشته می‌خواند
 *   و قرارداد number می‌خواهد
 * - فیلدهای غیرقابل‌null قرارداد (visit_sequence/geo_accuracy_m/geo_source)
 *   اگر null باشند حذف می‌شوند؛ geo و geo_captured_at خودِ قرارداد null می‌پذیرند
 */
const COLUMNS = `
  c.id, c.person_id, c.branch_id, c.code, c.area_id, c.route_id, c.salesperson_id,
  c.channel, c.price_list_id, c.settlement_term_id, c.visit_sequence,
  case when c.geo is null then null else json_build_object(
           'type', 'Point',
           'coordinates', array[st_x(c.geo::geometry), st_y(c.geo::geometry)]
         ) end as geo,
  c.geo_accuracy_m::float8 as geo_accuracy_m,
  c.geo_source,
  c.geo_captured_at,
  cc.credit_limit::text as credit_limit,
  c.status,
  c.created_at,
  c.row_version`;

const FROM = `from customer c
  join branch b on b.id = c.branch_id
  left join customer_credit cc on cc.customer_id = c.id`;

export interface CustomerRow extends QueryResultRow {
  id: string;
  person_id: string;
  branch_id: string;
  code: string;
  area_id: string | null;
  route_id: string | null;
  salesperson_id: string | null;
  channel: string;
  price_list_id: string | null;
  settlement_term_id: string | null;
  visit_sequence: number | null;
  geo: { type: 'Point'; coordinates: [number, number] } | null;
  geo_accuracy_m: number | null;
  geo_source: string | null;
  geo_captured_at: string | null;
  credit_limit: string | null;
  status: string;
  created_at: string;
  row_version: number;
}

export interface ListCustomersResult {
  items: CustomerRow[];
  nextCursor: string | null;
  hasMore: boolean;
}

const encodeCursor = (code: string): string => Buffer.from(code, 'utf8').toString('base64url');
const decodeCursor = (cursor: string): string =>
  Buffer.from(cursor, 'base64url').toString('utf8');

/** شکل‌دهی نهایی ردیف: کلید کمکی کوئری و فیلدهای بدون nullِ قرارداد حذف می‌شوند */
const shape = (row: CustomerRow & { person_code?: string }): CustomerRow => {
  const { visit_sequence, geo_accuracy_m, geo_source, person_code: _p, ...rest } = row;
  return {
    ...rest,
    ...(visit_sequence !== null && visit_sequence !== undefined ? { visit_sequence } : {}),
    ...(geo_accuracy_m !== null && geo_accuracy_m !== undefined ? { geo_accuracy_m } : {}),
    ...(geo_source ? { geo_source } : {}),
  } as CustomerRow;
};

/** عرض/طول جغرافیایی برای ساخت WKT نقطه — ترتیب [طول، عرض] طبق قرارداد */
const point = (lng: number, lat: number): string =>
  `st_setsrid(st_makepoint(${lng}, ${lat}), 4326)::geography`;

/**
 * دسترسی داده مشتریان — SQL خام روی customer/customer_credit (بدون ORM، طبق §۳.۲).
 * همه کوئری‌ها از طریق branch.company_id به شرکت نشست قفل می‌شوند؛ حذف نرم
 * (deleted_at) رد می‌شود و به‌روزرسانی‌ها را trg_touch (مهاجرت 0020) بالا می‌برد.
 */
@Injectable()
export class CustomerRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async list(companyId: string, query: ListCustomersQueryDto): Promise<ListCustomersResult> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['b.company_id = $1', 'c.deleted_at is null'];

    if (query.q) {
      params.push(`%${query.q}%`);
      where.push(`(c.code ilike $${params.length}
                or p.legal_name ilike $${params.length}
                or (coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')) ilike $${params.length})`);
    }
    if (query.route_id) {
      params.push(query.route_id);
      where.push(`c.route_id = $${params.length}`);
    }
    if (query.area_id) {
      params.push(query.area_id);
      where.push(`c.area_id = $${params.length}`);
    }
    if (query.salesperson_id) {
      params.push(query.salesperson_id);
      where.push(`c.salesperson_id = $${params.length}`);
    }
    if (query.channel) {
      params.push(query.channel);
      where.push(`c.channel = $${params.length}`);
    }
    if (query.has_location !== undefined) {
      where.push(query.has_location ? 'c.geo is not null' : 'c.geo is null');
    }
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      where.push(`c.code > $${params.length}`);
    }
    params.push(limit + 1);

    const { rows } = await this.pool.query<CustomerRow & { person_code: string }>(
      `select ${COLUMNS}, p.code as person_code
         ${FROM}
         join person p on p.id = c.person_id
        where ${where.join(' and ')}
        order by c.code
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

  async findById(companyId: string, id: string): Promise<CustomerRow | null> {
    const { rows } = await this.pool.query<CustomerRow>(
      `select ${COLUMNS} ${FROM} where c.id = $1 and b.company_id = $2 and c.deleted_at is null`,
      [id, companyId],
    );
    return rows[0] ? shape(rows[0]) : null;
  }

  // ---------------- بررسی‌های ارجاعی (پیام فارسی به‌جای خطای قید) ----------------

  async personExists(companyId: string, personId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      'select 1 from person where id = $1 and company_id = $2 and deleted_at is null',
      [personId, companyId],
    );
    return rows.length > 0;
  }

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

  async routeExists(companyId: string, routeId: string): Promise<boolean> {
    return this.exists(
      `select 1 from route r
         join sales_area a on a.id = r.area_id
         join branch b on b.id = a.branch_id
        where r.id = $1 and b.company_id = $2`,
      routeId,
      companyId,
    );
  }

  async staffExists(companyId: string, staffId: string): Promise<boolean> {
    return this.exists(
      `select 1 from staff s join branch b on b.id = s.branch_id
        where s.id = $1 and b.company_id = $2`,
      staffId,
      companyId,
    );
  }

  async priceListExists(companyId: string, priceListId: string): Promise<boolean> {
    return this.exists(
      'select 1 from price_list where id = $1 and company_id = $2',
      priceListId,
      companyId,
    );
  }

  async settlementTermExists(companyId: string, termId: string): Promise<boolean> {
    return this.exists(
      'select 1 from settlement_term where id = $1 and company_id = $2',
      termId,
      companyId,
    );
  }

  private async exists(sql: string, ...values: unknown[]): Promise<boolean> {
    const { rows } = await this.pool.query(sql, values);
    return rows.length > 0;
  }

  // ---------------- نوشتن ----------------

  /**
   * درج مشتری — نکته: شمارهٔ پارامترها باید چسبیده باشند. geo_accuracy_m/geo_source/
   * geo_captured_by همیشه با $11/$12/$13 ارجاع می‌شوند (وقتی geo نیست مقدار null
   * می‌گیرند) تا postgres برای پارامترِ وسطی نوعِ قابل‌استنباط داشته باشد و خطای
   * 42P18 («could not determine data type of parameter») ندهد. geo_captured_at
   * مقدار متنی now()/null است و پارامتر نیست.
   */
  async insert(companyId: string, dto: CreateCustomerDto, branchId: string, userId: string): Promise<string> {
    const hasGeo = Boolean(dto.geo);
    const { rows } = await this.pool.query<{ id: string }>(
      `insert into customer (person_id, branch_id, code, area_id, route_id, salesperson_id,
                             channel, price_list_id, settlement_term_id, visit_sequence,
                             geo, geo_accuracy_m, geo_source, geo_captured_at, geo_captured_by,
                             status)
       values ($1, $2, $3, $4, $5, $6,
               coalesce($7, 'retail'), $8, $9, $10,
               ${hasGeo ? point(dto.geo!.coordinates[0], dto.geo!.coordinates[1]) : 'null'},
               $11, $12,
               ${hasGeo ? 'now()' : 'null'},
               $13,
               coalesce($14, 'active'))
       returning id`,
      [
        dto.person_id,
        branchId,
        dto.code,
        dto.area_id ?? null,
        dto.route_id ?? null,
        dto.salesperson_id ?? null,
        dto.channel ?? null,
        dto.price_list_id ?? null,
        dto.settlement_term_id ?? null,
        dto.visit_sequence ?? null,
        dto.geo_accuracy_m ?? null,
        hasGeo ? dto.geo_source ?? 'gps' : null,
        hasGeo ? userId : null,
        dto.status ?? null,
      ],
    );
    const id = rows[0].id;
    if (dto.credit_limit !== undefined) await this.upsertCredit(id, dto.credit_limit);
    return id;
  }

  async update(companyId: string, id: string, dto: UpdateCustomerDto, userId: string): Promise<string | null> {
    const sets: string[] = [];
    const params: unknown[] = [id, companyId];

    const add = (fragment: string, value: unknown): void => {
      params.push(value);
      sets.push(fragment.replace('$?', `$${params.length}`));
    };

    if (dto.person_id !== undefined) add('person_id = $?', dto.person_id);
    if (dto.code !== undefined) add('code = $?', dto.code);
    if (dto.area_id !== undefined) add('area_id = $?', dto.area_id);
    if (dto.route_id !== undefined) add('route_id = $?', dto.route_id);
    if (dto.salesperson_id !== undefined) add('salesperson_id = $?', dto.salesperson_id);
    if (dto.channel !== undefined) add('channel = $?', dto.channel);
    if (dto.price_list_id !== undefined) add('price_list_id = $?', dto.price_list_id);
    if (dto.settlement_term_id !== undefined) add('settlement_term_id = $?', dto.settlement_term_id);
    if (dto.visit_sequence !== undefined) add('visit_sequence = $?', dto.visit_sequence);
    if (dto.status !== undefined) add('status = $?', dto.status);
    if (dto.geo_accuracy_m !== undefined) add('geo_accuracy_m = $?', dto.geo_accuracy_m);

    // geo: قید ck_customer_geo می‌خواهد همراهِ مختصات، منشأ و زمان ثبت هم باشد
    if (dto.geo !== undefined) {
      if (dto.geo === null) {
        add('geo = $?', null);
        add('geo_source = $?', null);
        add('geo_captured_at = $?', null);
        add('geo_captured_by = $?', null);
      } else {
        params.push(dto.geo.coordinates[0]);
        params.push(dto.geo.coordinates[1]);
        sets.push(
          `geo = st_setsrid(st_makepoint($${params.length - 1}, $${params.length}), 4326)::geography`,
        );
        add('geo_source = $?', dto.geo_source ?? 'gps');
        sets.push('geo_captured_at = now()');
        add('geo_captured_by = $?', userId);
      }
    }

    if (sets.length === 0) return id;

    // قفل خوش‌بینانه: نسخهٔ ارسالی باید با سرور یکی باشد
    if (dto.row_version !== undefined) params.push(dto.row_version);
    const versionClause =
      dto.row_version !== undefined ? ` and c.row_version = $${params.length}` : '';

    const { rows } = await this.pool.query<{ id: string }>(
      `update customer c set ${sets.join(', ')}
        where c.id = $1
          and exists (select 1 from branch b where b.id = c.branch_id and b.company_id = $2)
          and c.deleted_at is null${versionClause}
        returning c.id`,
      params,
    );
    if (!rows[0]) return null;
    if (dto.credit_limit !== undefined) await this.upsertCredit(id, dto.credit_limit);
    return rows[0].id;
  }

  /** PUT /customers/{id}/location — مختصات + دقت + منشأ برای گزارش ضدتقلب */
  async setLocation(
    companyId: string,
    id: string,
    dto: UpdateLocationDto,
    userId: string,
  ): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string }>(
      `update customer c
          set geo = st_setsrid(st_makepoint($3, $4), 4326)::geography,
              geo_accuracy_m = $5,
              geo_source = $6,
              geo_captured_at = now(),
              geo_captured_by = $7
        where c.id = $1
          and exists (select 1 from branch b where b.id = c.branch_id and b.company_id = $2)
          and c.deleted_at is null
        returning c.id`,
      [
        id,
        companyId,
        dto.geo.coordinates[0],
        dto.geo.coordinates[1],
        dto.accuracy_m ?? null,
        dto.source ?? 'gps',
        userId,
      ],
    );
    return rows[0]?.id ?? null;
  }

  /** upsert سقف اعتبار — customer_credit یک ردیف برای هر مشتری دارد */
  async upsertCredit(customerId: string, creditLimit: string): Promise<void> {
    await this.pool.query(
      `insert into customer_credit (customer_id, credit_limit)
       values ($1, $2::numeric)
       on conflict (customer_id) do update set credit_limit = excluded.credit_limit,
                                               updated_at = now()`,
      [customerId, creditLimit],
    );
  }
}
