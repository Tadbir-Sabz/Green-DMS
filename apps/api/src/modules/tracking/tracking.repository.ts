import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
// PG_POOL tenant-aware از database.module — نسخهٔ پیشین از pg خام (db/pg.ts) استفاده
// می‌کرد که GUCهای نشست را نداشت و RLS مهاجرت 0021 را دور می‌زد.
import { PG_POOL } from '../../database/database.module';
import type { LocationSampleDto } from './location.dto';

export interface LiveLocationRow extends QueryResultRow {
  [key: string]: unknown;
}

/** آخرین موقعیت یک کارمند — LatestPosition در openapi */
export interface LatestPosition extends QueryResultRow {
  staff_id: string;
  staff_name: string;
  tour_id: string | null;
  at: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
}

/** یک توقف مسیر */
export interface RouteStopRow extends QueryResultRow {
  sequence: number;
  customer_id: string;
}

/** طرح مسیر — RoutePlan در openapi */
export interface RoutePlanRow extends QueryResultRow {
  id: string;
  tour_id: string | null;
  staff_id: string;
  plan_date: string;
  provider: string;
  objective: string;
  stop_count: number;
  total_distance_m: number | null;
  total_duration_s: number | null;
  geometry: unknown;
}

/** مختصات مشتری برای محاسبهٔ مسیر */
export interface CustomerGeoRow extends QueryResultRow {
  customer_id: string;
  lat: number;
  lng: number;
}

export interface PingInput {
  lat?: number;
  latitude?: number;
  lng?: number;
  longitude?: number;
  speed_kph?: number;
  speed?: number;
  session_id?: string | null;
  tour_id?: string | null;
  accuracy_m?: number | null;
  heading_deg?: number | null;
  battery_pct?: number | null;
  is_mocked?: boolean;
  provider?: string;
  recorded_at?: string | null;
}

@Injectable()
export class TrackingRepository {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async live(companyId: string): Promise<LiveLocationRow[]> {
    const { rows } = await this.pool.query<LiveLocationRow>(
      `select * from v_live_locations where company_id = $1 order by sampled_at desc`,
      [companyId],
    );
    return rows;
  }

  /**
   * ثبت نمونه موقعیت فروشنده/موزع — جدول location_sample ستون company/user ندارد
   * (migrations/0012:43)؛ کارمند از روی person مشترک user↔staff پیدا می‌شود و
   * دامنه شرکت از شعبه او گرفته می‌شود. سرعت ورودی کیلومتر/ساعت است و در DDL m/s است.
   */
  async ping(companyId: string, userId: string, body: PingInput): Promise<QueryResultRow | null> {
    const lat = body?.lat ?? body?.latitude;
    const lng = body?.lng ?? body?.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      throw new BadRequestException({
        code: 'invalid_coordinates',
        message_fa: 'مختصات جغرافیایی (lat و lng) الزامی و عددی است.',
      });
    }
    const speedKph = Number(body?.speed_kph ?? body?.speed ?? 0);

    const { rows } = await this.pool.query(
      `insert into location_sample
          (staff_id, session_id, tour_id, geo, accuracy_m, speed_mps, heading_deg,
           battery_pct, is_mocked, provider, recorded_at)
       select s.id, $3::uuid, $4::uuid,
              ST_SetSRID(ST_MakePoint($2::float8, $1::float8), 4326)::geography,
              $5::numeric, $6::numeric, $7::numeric, $8::smallint, $9::boolean,
              coalesce($10, 'gps'), coalesce($11::timestamptz, now())
         from staff s
         join app_user u on u.person_id = s.person_id
         join branch b on b.id = s.branch_id
        where u.id = $12 and b.company_id = $13
       returning id, staff_id, recorded_at, accuracy_m, speed_mps, heading_deg,
                 is_mocked, provider
    `,
      [
        lat,
        lng,
        body?.session_id ?? null,
        body?.tour_id ?? null,
        body?.accuracy_m ?? null,
        Number.isFinite(speedKph) ? speedKph / 3.6 : 0,
        body?.heading_deg ?? null,
        body?.battery_pct ?? null,
        body?.is_mocked === true,
        ['gps', 'network', 'fused'].includes(body?.provider ?? '') ? body.provider : 'gps',
        body?.recorded_at ?? null,
        userId,
        companyId,
      ],
    );
    return rows[0] ?? null;
  }

  // ============ /tracking/locations ============

  /** آخرین موقعیت هر کارمند میدانی (نقشه رهگیری) — از v_live_locations با دامنهٔ شرکت */
  async latestPositions(
    companyId: string,
    query: { staff_id?: string; since?: string },
  ): Promise<LatestPosition[]> {
    const params: unknown[] = [companyId];
    const where: string[] = ['company_id = $1'];
    if (query.staff_id) {
      params.push(query.staff_id);
      where.push(`staff_id = $${params.length}`);
    }
    if (query.since) {
      params.push(query.since);
      where.push(`sampled_at >= $${params.length}::timestamptz`);
    }
    const { rows } = await this.pool.query<LatestPosition>(
      `select staff_id, staff_name, tour_id, sampled_at as at, lat, lng, accuracy_m
         from v_live_locations
        where ${where.join(' and ')}
        order by sampled_at desc`,
      params,
    );
    return rows;
  }

  /** staff_id کارمند از روی user نشست (برای اعتبارسنجی نمونه‌های ارسالی) */
  async staffIdForUser(companyId: string, userId: string): Promise<string | null> {
    const { rows } = await this.pool.query<{ id: string }>(
      `select s.id from staff s
         join app_user u on u.person_id = s.person_id
         join branch b on b.id = s.branch_id
        where u.id = $1 and b.company_id = $2`,
      [userId, companyId],
    );
    return rows[0]?.id ?? null;
  }

  /**
   * ثبت دسته‌ای نمونه موقعیت. فقط staffهای متعلق به شرکتِ نشست پذیرفته می‌شوند؛
   * بقیه بی‌صدا رد می‌شوند (تا یک نمونهٔ بد، کل دسته را شکست ندهد).
   * سرعت ورودی km/h و در DDL m/s است.
   */
  async insertSamples(
    companyId: string,
    samples: LocationSampleDto[],
  ): Promise<number> {
    if (samples.length === 0) return 0;
    const staffIds = [...new Set(samples.map((s) => s.staff_id))];
    const { rows } = await this.pool.query<{ id: string }>(
      `select s.id from staff s join branch b on b.id = s.branch_id
        where b.company_id = $1 and s.id = any($2::uuid[])`,
      [companyId, staffIds],
    );
    const allowed = new Set(rows.map((r) => r.id));
    const valid = samples.filter((s) => allowed.has(s.staff_id));
    if (valid.length === 0) return 0;

    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('begin');
      for (const s of valid) {
        const [lng, lat] = s.geo.coordinates;
        const speedKmh = Number(s.speed_kmh ?? 0);
        await client.query(
          `insert into location_sample
             (staff_id, geo, accuracy_m, speed_mps, is_mocked, provider, recorded_at)
           values ($1, ST_SetSRID(ST_MakePoint($2::float8, $3::float8), 4326)::geography,
                   $4::numeric, $5::numeric, $6::boolean, 'gps', $7::timestamptz)`,
          [
            s.staff_id,
            lng,
            lat,
            s.accuracy_m ?? null,
            Number.isFinite(speedKmh) ? speedKmh / 3.6 : 0,
            s.is_mocked === true,
            s.at,
          ],
        );
      }
      await client.query('commit');
      return valid.length;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  // ============ /tracking/routes ============

  /** provider قرارداد → مقدار مجاز DDL (route_plan.provider) */
  private static readonly PROVIDER_TO_DB: Record<string, string> = {
    neshan: 'neshan',
    mapir: 'map_ir',
    osrm_selfhosted: 'osrm',
  };
  /** objective قرارداد → مقدار مجاز DDL (route_plan.objective) */
  private static readonly OBJECTIVE_TO_DB: Record<string, string> = {
    min_duration: 'duration',
    min_distance: 'distance',
  };
  private static readonly PROVIDER_FROM_DB: Record<string, string> = {
    neshan: 'neshan',
    map_ir: 'mapir',
    osrm: 'osrm_selfhosted',
    google: 'neshan',
    manual: 'osrm_selfhosted',
  };
  private static readonly OBJECTIVE_FROM_DB: Record<string, string> = {
    distance: 'min_distance',
    duration: 'min_duration',
    balanced: 'min_distance',
  };

  /** فهرست طرح‌های مسیر با توقف‌ها و هندسه (GeoJSON LineString) */
  async listRoutes(
    companyId: string,
    query: { staff_id?: string; plan_date?: string },
  ): Promise<RoutePlanRow[]> {
    const params: unknown[] = [companyId];
    const where: string[] = ['b.company_id = $1'];
    if (query.staff_id) {
      params.push(query.staff_id);
      where.push(`rp.staff_id = $${params.length}`);
    }
    if (query.plan_date) {
      params.push(query.plan_date);
      where.push(`rp.plan_date = $${params.length}::date`);
    }
    const { rows } = await this.pool.query<RoutePlanRow & { stops: RouteStopRow[] }>(
      `select rp.id, rp.tour_id, rp.staff_id, rp.plan_date::text as plan_date,
              rp.provider, rp.objective, rp.stop_count,
              rp.total_distance_m, rp.total_duration_s,
              ST_AsGeoJSON(rp.geometry)::json as geometry,
              coalesce(
                (select json_agg(json_build_object('sequence', s.seq, 'customer_id', s.customer_id)
                                 order by s.seq)
                   from route_plan_stop s where s.route_plan_id = rp.id),
                '[]'::json) as stops
         from route_plan rp
         join staff st on st.id = rp.staff_id
         join branch b on b.id = st.branch_id
        where ${where.join(' and ')}
        order by rp.plan_date desc, rp.created_at desc`,
      params,
    );
    return rows.map((r) => this.mapRouteRow(r));
  }

  async findRoute(companyId: string, id: string): Promise<RoutePlanRow | null> {
    const { rows } = await this.pool.query<RoutePlanRow & { stops: RouteStopRow[] }>(
      `select rp.id, rp.tour_id, rp.staff_id, rp.plan_date::text as plan_date,
              rp.provider, rp.objective, rp.stop_count,
              rp.total_distance_m, rp.total_duration_s,
              ST_AsGeoJSON(rp.geometry)::json as geometry,
              coalesce(
                (select json_agg(json_build_object('sequence', s.seq, 'customer_id', s.customer_id)
                                 order by s.seq)
                   from route_plan_stop s where s.route_plan_id = rp.id),
                '[]'::json) as stops
         from route_plan rp
         join staff st on st.id = rp.staff_id
         join branch b on b.id = st.branch_id
        where rp.id = $1 and b.company_id = $2`,
      [id, companyId],
    );
    const row = rows[0];
    return row ? this.mapRouteRow(row) : null;
  }

  /** نگاشت provider/objective از DDL به قرارداد و الصاق توقف‌ها */
  private mapRouteRow(
    r: RoutePlanRow & { stops?: RouteStopRow[] },
  ): RoutePlanRow & { stops: RouteStopRow[] } {
    return {
      ...r,
      provider: TrackingRepository.PROVIDER_FROM_DB[r.provider] ?? r.provider,
      objective: TrackingRepository.OBJECTIVE_FROM_DB[r.objective] ?? r.objective,
      stops: r.stops ?? [],
    };
  }

  /** مختصات مشتریان انتخاب‌شده (فقط آن‌هایی که در شرکت‌اند و geo دارند) */
  async customerGeoPoints(
    companyId: string,
    customerIds: string[],
  ): Promise<CustomerGeoRow[]> {
    if (customerIds.length === 0) return [];
    const { rows } = await this.pool.query<CustomerGeoRow>(
      `select c.id as customer_id,
              ST_Y(c.geo::geometry) as lat,
              ST_X(c.geo::geometry) as lng
         from customer c join branch b on b.id = c.branch_id
        where b.company_id = $1 and c.id = any($2::uuid[]) and c.geo is not null`,
      [companyId, customerIds],
    );
    return rows;
  }

  /** ذخیرهٔ طرح مسیر محاسبه‌شده با توقف‌ها و هندسهٔ LineString */
  async insertRoutePlan(input: {
    staffId: string;
    planDate: string;
    providerDb: string;
    objectiveDb: string;
    stops: { sequence: number; customer_id: string }[];
    totalDistanceM: number;
    totalDurationS: number;
    coordinates: [number, number][];
  }): Promise<string> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const id = randomUUID();
      // هندسه فقط وقتی ≥۲ نقطه باشد (LineString معتبر)
      const geometrySql =
        input.coordinates.length >= 2
          ? `ST_SetSRID(ST_GeomFromGeoJSON($9::text), 4326)::geography`
          : `null::geography`;
      const lineString =
        input.coordinates.length >= 2
          ? JSON.stringify({ type: 'LineString', coordinates: input.coordinates })
          : null;
      await client.query(
        `insert into route_plan
           (id, staff_id, plan_date, provider, objective, stop_count,
            total_distance_m, total_duration_s, geometry, request_params)
         values ($1,$2,$3::date,$4,$5,$6,$7,$8, ${geometrySql}, '{}'::jsonb)`,
        [
          id,
          input.staffId,
          input.planDate,
          input.providerDb,
          input.objectiveDb,
          input.stops.length,
          input.totalDistanceM,
          input.totalDurationS,
          lineString,
        ],
      );
      for (const s of input.stops) {
        await client.query(
          `insert into route_plan_stop (route_plan_id, seq, customer_id)
           values ($1,$2,$3)`,
          [id, s.sequence, s.customer_id],
        );
      }
      await client.query('commit');
      return id;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  static providerToDb(provider: string): string {
    return TrackingRepository.PROVIDER_TO_DB[provider] ?? 'osrm';
  }
  static objectiveToDb(objective: string): string {
    return TrackingRepository.OBJECTIVE_TO_DB[objective] ?? 'distance';
  }
}
