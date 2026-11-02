import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import { PG_POOL } from '../../database/database.module';
import type { DocNumberService } from '../../common/doc-number.service';
import { DOC_NUMBER_SERVICE } from '../../common/doc-number.service';
import type { CreateTourDto, CreateVisitDto, UpdateTourDto, UpdateVisitDto } from './tours.dto';

export interface TourRow extends QueryResultRow {
  id: string;
  branch_id: string;
  doc_number: string | null;
  tour_date: string;
  kind: string;
  salesperson_id: string;
  supervisor_id: string | null;
  route_id: string | null;
  vehicle_id: string | null;
  warehouse_id: string | null;
  status: string;
  planned_start_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  note: string | null;
}

export interface VisitRow extends QueryResultRow {
  id: string;
  tour_id: string;
  customer_id: string;
  check_in_at: string | null;
  check_out_at: string | null;
  geo_in: { type: 'Point'; coordinates: number[] } | null;
  geo_out: { type: 'Point'; coordinates: number[] } | null;
  accuracy_in_m: number | null;
  distance_m: string | null;
  result: string | null;
  no_order_reason: string | null;
  is_mocked: boolean;
  client_uuid: string | null;
}

export interface TourSettlementRow extends QueryResultRow {
  tour_id: string;
  expected_cash: string | null;
  received_cash: string | null;
  variance_amount: string | null;
  commission_total: string | null;
  status: string;
}

const encodeCursor = (v: string): string => Buffer.from(v, 'utf8').toString('base64url');
const decodeCursor = (cursor: string): string => Buffer.from(cursor, 'base64url').toString('utf8');

const TOUR_COLUMNS = `t.id, t.branch_id, t.doc_number, t.tour_date::text as tour_date, t.kind,
  t.salesperson_id, t.supervisor_id, t.route_id, t.vehicle_id, t.warehouse_id, t.status,
  t.planned_start_at, t.started_at, t.ended_at, t.note`;

/** geography(Point) → GeoPoint قرارداد ([طول، عرض]) */
const GEO_IN = `case when v.geo_in is null then null else json_build_object(
    'type','Point','coordinates', array[st_x(v.geo_in::geometry), st_y(v.geo_in::geometry)]) end as geo_in`;
const GEO_OUT = `case when v.geo_out is null then null else json_build_object(
    'type','Point','coordinates', array[st_x(v.geo_out::geometry), st_y(v.geo_out::geometry)]) end as geo_out`;

/**
 * دسترسی داده تور/بازدید/تسویه (ماژول ۵) روی جداول مهاجرت 0011.
 * همه کوئری‌ها از branch.company_id به شرکت نشست قفل می‌شوند.
 */
@Injectable()
export class ToursRepository {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(DOC_NUMBER_SERVICE) private readonly docNumbers: DocNumberService,
  ) {}

  // ---------------- Tours ----------------

  async listTours(
    companyId: string,
    query: {
      cursor?: string;
      limit?: number;
      tour_date?: string;
      kind?: string;
      salesperson_id?: string;
      status?: string;
    },
  ): Promise<{ items: TourRow[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['b.company_id = $1'];
    if (query.tour_date) {
      params.push(query.tour_date);
      where.push(`t.tour_date = $${params.length}::date`);
    }
    if (query.kind) {
      params.push(query.kind);
      where.push(`t.kind = $${params.length}`);
    }
    if (query.salesperson_id) {
      params.push(query.salesperson_id);
      where.push(`t.salesperson_id = $${params.length}`);
    }
    if (query.status) {
      params.push(query.status);
      where.push(`t.status = $${params.length}`);
    }
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      where.push(`t.created_at < $${params.length}::timestamptz`);
    }
    params.push(limit + 1);
    const limitParam = `$${params.length}`;

    const { rows } = await this.pool.query<TourRow & { created_at: string }>(
      `select ${TOUR_COLUMNS}, t.created_at
         from tour t join branch b on b.id = t.branch_id
        where ${where.join(' and ')}
        order by t.created_at desc
        limit ${limitParam}`,
      params,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return {
      items: page.map(({ created_at: _c, ...rest }) => rest as TourRow),
      hasMore,
      nextCursor: hasMore && last ? encodeCursor(last.created_at) : null,
    };
  }

  async findTour(companyId: string, id: string): Promise<TourRow | null> {
    const { rows } = await this.pool.query<TourRow>(
      `select ${TOUR_COLUMNS} from tour t join branch b on b.id = t.branch_id
        where t.id = $1 and b.company_id = $2`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  /** شعبه فروشنده برای ثبت تور؛ null یعنی فروشنده در این شرکت نیست */
  async salespersonBranch(companyId: string, staffId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ branch_id: string }>(
      `select s.branch_id from staff s join branch b on b.id = s.branch_id
        where s.id = $1 and b.company_id = $2`,
      [staffId, companyId],
    );
    return rows[0]?.branch_id ?? null;
  }

  async insertTour(companyId: string, dto: CreateTourDto, branchId: string): Promise<string> {
    const id = randomUUID();
    const { doc_number } = await this.docNumbers.next(branchId, 'tour_receipt');
    await this.pool.query(
      `insert into tour
         (id, branch_id, doc_number, tour_date, kind, salesperson_id, supervisor_id,
          route_id, vehicle_id, warehouse_id, status, planned_start_at, note)
       values ($1,$2,$3,$4::date,$5,$6,$7,$8,$9,$10,'planned',$11,$12)`,
      [
        id,
        branchId,
        doc_number,
        dto.tour_date,
        dto.kind,
        dto.salesperson_id,
        dto.supervisor_id ?? null,
        dto.route_id ?? null,
        dto.vehicle_id ?? null,
        dto.warehouse_id ?? null,
        dto.planned_start_at ?? null,
        dto.note ?? null,
      ],
    );
    return id;
  }

  async updateTour(companyId: string, id: string, dto: UpdateTourDto): Promise<boolean> {
    const sets: string[] = [];
    const params: unknown[] = [id, companyId];
    const add = (fragment: string, value: unknown): void => {
      params.push(value);
      sets.push(fragment.replace('$?', `$${params.length}`));
    };
    if (dto.status !== undefined) add('status = $?', dto.status);
    if (dto.started_at !== undefined) add('started_at = $?', dto.started_at);
    if (dto.ended_at !== undefined) add('ended_at = $?', dto.ended_at);
    if (dto.note !== undefined) add('note = $?', dto.note);
    if (dto.supervisor_id !== undefined) add('supervisor_id = $?', dto.supervisor_id);
    if (dto.vehicle_id !== undefined) add('vehicle_id = $?', dto.vehicle_id);
    if (sets.length === 0) return true;
    const { rowCount } = await this.pool.query(
      `update tour set ${sets.join(', ')}, updated_at = now()
        where id = $1 and branch_id in (select id from branch where company_id = $2)`,
      params,
    );
    return (rowCount ?? 0) > 0;
  }

  /**
   * تسویه تور — از tour_settlement اگر باشد، وگرنه محاسبه زنده از فاکتور/وصولی‌های
   * همان تور. commission_total از commission_lineهای source=tour_settlement.
   */
  async tourSettlement(companyId: string, tourId: string): Promise<TourSettlementRow | null> {
    const { rows } = await this.pool.query<TourSettlementRow>(
      `with ts as (
         select ts.id, ts.expected_cash, ts.counted_cash, ts.variance_amount, ts.status
           from tour_settlement ts
           join tour t on t.id = ts.tour_id
           join branch b on b.id = t.branch_id
          where ts.tour_id = $1 and b.company_id = $2
       ),
       live as (                              -- اگر تسویه ثبت نشده، از وصولی‌های تور
         select coalesce(sum(pr.amount), 0) as expected_cash
           from payment_receipt pr
           join tour_settlement ts2 on ts2.id = pr.tour_settlement_id
           join tour t on t.id = ts2.tour_id
          where t.id = $1
       )
       select $1::uuid as tour_id,
              coalesce(ts.expected_cash, live.expected_cash)::text as expected_cash,
              ts.counted_cash::text as received_cash,
              ts.variance_amount::text as variance_amount,
              (select coalesce(sum(cl.amount),0)::text from commission_line cl
                where cl.source_type = 'tour_settlement' and cl.source_id = ts.id) as commission_total,
              coalesce(ts.status, 'open') as status
         from ts full outer join live on true
        limit 1`,
      [tourId, companyId],
    );
    return rows[0] ?? null;
  }

  // ---------------- Visits ----------------

  async listVisits(
    companyId: string,
    query: { cursor?: string; limit?: number; tour_id?: string; customer_id?: string },
  ): Promise<{ items: VisitRow[]; nextCursor: string | null; hasMore: boolean }> {
    const limit = query.limit ?? 50;
    const params: unknown[] = [companyId];
    const where: string[] = ['b.company_id = $1'];
    if (query.tour_id) {
      params.push(query.tour_id);
      where.push(`v.tour_id = $${params.length}`);
    }
    if (query.customer_id) {
      params.push(query.customer_id);
      where.push(`v.customer_id = $${params.length}`);
    }
    if (query.cursor) {
      params.push(decodeCursor(query.cursor));
      where.push(`v.id > $${params.length}::uuid`);
    }
    params.push(limit + 1);
    const limitParam = `$${params.length}`;

    const { rows } = await this.pool.query<VisitRow>(
      `select v.id, v.tour_id, v.customer_id, v.check_in_at, v.check_out_at,
              ${GEO_IN}, ${GEO_OUT},
              v.accuracy_in_m::float8 as accuracy_in_m, v.distance_m::text as distance_m,
              v.result, v.no_order_reason, v.client_uuid,
              false as is_mocked
         from visit v
         join tour t on t.id = v.tour_id
         join branch b on b.id = t.branch_id
        where ${where.join(' and ')}
        order by v.id
        limit ${limitParam}`,
      params,
    );
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1];
    return { items: page, hasMore, nextCursor: hasMore && last ? encodeCursor(last.id) : null };
  }

  async findVisit(companyId: string, id: string): Promise<VisitRow | null> {
    const { rows } = await this.pool.query<VisitRow>(
      `select v.id, v.tour_id, v.customer_id, v.check_in_at, v.check_out_at,
              ${GEO_IN}, ${GEO_OUT},
              v.accuracy_in_m::float8 as accuracy_in_m, v.distance_m::text as distance_m,
              v.result, v.no_order_reason, v.client_uuid, false as is_mocked
         from visit v
         join tour t on t.id = v.tour_id
         join branch b on b.id = t.branch_id
        where v.id = $1 and b.company_id = $2`,
      [id, companyId],
    );
    return rows[0] ?? null;
  }

  /** تور متعلق به شرکت است؟ (برای ثبت بازدید) */
  async tourBelongsToCompany(companyId: string, tourId: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      `select 1 from tour t join branch b on b.id = t.branch_id
        where t.id = $1 and b.company_id = $2`,
      [tourId, companyId],
    );
    return rows.length > 0;
  }

  /** موقعیت ثبت‌شدهٔ مشتری برای سنجش فاصله ضدتقلب (بر حسب متر) */
  async customerGeo(companyId: string, customerId: string): Promise<number[] | null> {
    const { rows } = await this.pool.query<{ coords: number[] }>(
      `select array[st_x(c.geo::geometry), st_y(c.geo::geometry)] as coords
         from customer c join branch b on b.id = c.branch_id
        where c.id = $1 and b.company_id = $2 and c.geo is not null`,
      [customerId, companyId],
    );
    return rows[0]?.coords ?? null;
  }

  /** client_uuid تکراری → برای 409 در سرویس */
  async visitClientUuidExists(clientUuid: string): Promise<boolean> {
    const { rows } = await this.pool.query('select 1 from visit where client_uuid = $1', [
      clientUuid,
    ]);
    return rows.length > 0;
  }

  async insertVisit(
    dto: CreateVisitDto,
    geoIn: number[] | null,
    distanceM: number | null,
  ): Promise<string> {
    const id = randomUUID();
    await this.pool.query(
      `insert into visit
         (id, tour_id, customer_id, check_in_at, geo_in, accuracy_in_m, distance_m,
          result, device_id, client_uuid)
       values ($1,$2,$3, coalesce($4::timestamptz, now()),
               case when $5::float8 is null then null
                    else st_setsrid(st_makepoint($5::float8, $6::float8),4326)::geography end,
               $7::numeric, $8::numeric, 'order', $9, $10)`,
      [
        id,
        dto.tour_id,
        dto.customer_id,
        dto.check_in_at ?? null,
        geoIn ? geoIn[0] : null,
        geoIn ? geoIn[1] : null,
        dto.accuracy_in_m ?? null,
        distanceM,
        dto.device_id ?? null,
        dto.client_uuid ?? null,
      ],
    );
    return id;
  }

  async updateVisit(companyId: string, id: string, dto: UpdateVisitDto): Promise<boolean> {
    const sets: string[] = [];
    const params: unknown[] = [id, companyId];
    const add = (fragment: string, value: unknown): void => {
      params.push(value);
      sets.push(fragment.replace('$?', `$${params.length}`));
    };
    if (dto.check_out_at !== undefined) add('check_out_at = $?', dto.check_out_at);
    if (dto.result !== undefined) add('result = $?', dto.result);
    if (dto.no_order_reason !== undefined) add('no_order_reason = $?', dto.no_order_reason);
    if (dto.geo_out) {
      params.push(dto.geo_out.coordinates[0], dto.geo_out.coordinates[1]);
      const n = params.length;
      sets.push(`geo_out = st_setsrid(st_makepoint($${n - 1}::float8, $${n}::float8),4326)::geography`);
    }
    if (sets.length === 0) return true;
    const { rowCount } = await this.pool.query(
      `update visit set ${sets.join(', ')}
        where id = $1
          and tour_id in (select t.id from tour t join branch b on b.id = t.branch_id
                           where b.company_id = $2)`,
      params,
    );
    return (rowCount ?? 0) > 0;
  }
}
