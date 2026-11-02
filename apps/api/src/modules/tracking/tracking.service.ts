import { BadRequestException, Inject, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { TRACKING_REPOSITORY } from './tracking.tokens';
import { TrackingRepository } from './tracking.repository';
import type { LatestPosition, RoutePlanRow } from './tracking.repository';
import { TrackingGateway } from './tracking.gateway';
import type { TrackingPingDto } from './tracking.dto';
import type {
  CreateRouteDto,
  ListLocationsQueryDto,
  ListRoutesQueryDto,
  PostLocationsDto,
} from './location.dto';

/** GeoPoint قرارداد از lat/lng */
const toGeoPoint = (lat: number, lng: number) => ({
  type: 'Point' as const,
  coordinates: [lng, lat] as [number, number],
});

/** موقعیت زندهٔ خروجی — LatestPosition در openapi */
export interface LatestPositionView {
  staff_id: string;
  staff_name: string;
  tour_id: string | null;
  at: string;
  geo: { type: 'Point'; coordinates: [number, number] };
  accuracy_m: number | null;
}

/** خروجی طرح مسیر — RoutePlan در openapi */
export interface RoutePlanView extends Omit<RoutePlanRow, 'geometry'> {
  geometry: unknown;
  stops: { sequence: number; customer_id: string }[];
}

/** شعاع زمین (متر) برای haversine */
const EARTH_R = 6_371_000;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** فاصلهٔ haversine بین دو نقطه (متر) */
const haversine = (a: [number, number], b: [number, number]): number => {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_R * Math.asin(Math.sqrt(h)));
};

/** سرعت متوسط شهری (m/s) برای برآورد زمان — ~۳۰ km/h */
const AVG_SPEED_MPS = 30 / 3.6;

/**
 * حل‌کنندهٔ «نزدیک‌ترین همسایه» برای ترتیب توقف‌ها. چون ارائه‌دهندهٔ بیرونی
 * (نشان/map.ir) در این محیط قابل‌دسترس نیست، مسیربندی به‌صورت داخلی (osrm_selfhosted)
 * با heuristic نزدیک‌ترین همسایه از اولین مشتری محاسبه می‌شود. objective روی
 * وزن یال اثر ندارد (فاصله≈زمان با سرعت ثابت) ولی در طرح ذخیره می‌شود.
 */
function nearestNeighborOrder(points: [number, number][]): number[] {
  const n = points.length;
  const order: number[] = [];
  const visited = new Array<boolean>(n).fill(false);
  let current = 0;
  visited[0] = true;
  order.push(0);
  for (let step = 1; step < n; step += 1) {
    let best = -1;
    let bestDist = Infinity;
    for (let j = 0; j < n; j += 1) {
      if (!visited[j]) {
        const d = haversine(points[current], points[j]);
        if (d < bestDist) {
          bestDist = d;
          best = j;
        }
      }
    }
    if (best === -1) break;
    visited[best] = true;
    order.push(best);
    current = best;
  }
  return order;
}

@Injectable()
export class TrackingService {
  constructor(
    @Inject(TRACKING_REPOSITORY) private readonly repo: TrackingRepository,
    private readonly gateway: TrackingGateway,
  ) {}

  async live(companyId: string) {
    return this.repo.live(companyId);
  }

  async ping(companyId: string, userId: string, dto: TrackingPingDto) {
    const res = await this.repo.ping(companyId, userId, dto);
    // انتشار فقط در اتاق شرکتِ نشست — نه اتاق مشترک «live» برای همه شرکت‌ها
    this.gateway.broadcastLocation(companyId, {
      ...dto,
      userId,
      at: new Date().toISOString(),
    });
    return res;
  }

  // ============ /tracking/locations ============

  async locations(
    companyId: string,
    query: ListLocationsQueryDto,
  ): Promise<{ items: LatestPositionView[] }> {
    const rows: LatestPosition[] = await this.repo.latestPositions(companyId, query);
    return {
      items: rows.map((r) => ({
        staff_id: r.staff_id,
        staff_name: r.staff_name,
        tour_id: r.tour_id,
        at: r.at,
        geo: toGeoPoint(Number(r.lat), Number(r.lng)),
        accuracy_m: r.accuracy_m === null ? null : Number(r.accuracy_m),
      })),
    };
  }

  /** ارسال دسته‌ای نمونه موقعیت؛ رویداد زنده برای هر نمونهٔ معتبر پخش می‌شود */
  async postLocations(
    companyId: string,
    userId: string,
    dto: PostLocationsDto,
  ): Promise<{ accepted: number }> {
    if (!dto.samples || dto.samples.length === 0) {
      throw new BadRequestException({
        code: 'samples_required',
        message_fa: 'حداقل یک نمونه موقعیت الزامی است.',
      });
    }
    const accepted = await this.repo.insertSamples(companyId, dto.samples);
    // پخش زندهٔ نمونه‌های پذیرفته‌شده روی نقشهٔ مدیریت
    for (const s of dto.samples) {
      this.gateway.broadcastLocation(companyId, {
        userId,
        staff_id: s.staff_id,
        lat: s.geo.coordinates[1],
        lng: s.geo.coordinates[0],
        accuracy_m: s.accuracy_m,
        is_mocked: s.is_mocked,
        at: s.at,
      });
    }
    return { accepted };
  }

  // ============ /tracking/routes ============

  async routes(companyId: string, query: ListRoutesQueryDto): Promise<{ items: RoutePlanView[] }> {
    const rows = await this.repo.listRoutes(companyId, query);
    return { items: rows.map((r) => this.toRouteView(r)) };
  }

  /**
   * محاسبهٔ مسیر «یک‌کلیکی». مشتریانِ دارای مختصات از DB خوانده، با نزدیک‌ترین
   * همسایه مرتب و هندسه/آمار محاسبه و طرح ذخیره می‌شود. کارمند از user نشست.
   */
  async createRoute(
    companyId: string,
    userId: string,
    dto: CreateRouteDto,
  ): Promise<RoutePlanView> {
    const staffId = await this.repo.staffIdForUser(companyId, userId);
    if (!staffId) {
      throw new BadRequestException({
        code: 'staff_not_found',
        message_fa: 'کاربر جاری به کارمند میدانی این شرکت متصل نیست.',
      });
    }
    if (!dto.customer_ids || dto.customer_ids.length === 0) {
      throw new BadRequestException({
        code: 'customers_required',
        message_fa: 'حداقل یک مشتری برای مسیربندی الزامی است.',
      });
    }
    const geo = await this.repo.customerGeoPoints(companyId, dto.customer_ids);
    if (geo.length === 0) {
      throw new UnprocessableEntityException({
        code: 'no_geocoded_customers',
        message_fa: 'هیچ‌کدام از مشتریان انتخاب‌شده مختصات ثبت‌شده ندارند.',
      });
    }
    const provider = dto.provider ?? 'osrm_selfhosted';
    const objective = dto.objective ?? 'min_distance';
    const planDate = dto.plan_date ?? new Date().toISOString().slice(0, 10);

    const points: [number, number][] = geo.map((g) => [Number(g.lng), Number(g.lat)]);
    const order = nearestNeighborOrder(points);
    const ordered = order.map((idx) => geo[idx]);
    const coordinates: [number, number][] = ordered.map((g) => [Number(g.lng), Number(g.lat)]);

    let totalDistance = 0;
    for (let i = 1; i < coordinates.length; i += 1) {
      totalDistance += haversine(coordinates[i - 1], coordinates[i]);
    }
    const totalDuration = Math.round(totalDistance / AVG_SPEED_MPS);
    const stops = ordered.map((g, i) => ({ sequence: i + 1, customer_id: g.customer_id }));

    const id = await this.repo.insertRoutePlan({
      staffId,
      planDate,
      providerDb: TrackingRepository.providerToDb(provider),
      objectiveDb: TrackingRepository.objectiveToDb(objective),
      stops,
      totalDistanceM: totalDistance,
      totalDurationS: totalDuration,
      coordinates,
    });
    const saved = await this.repo.findRoute(companyId, id);
    if (!saved) {
      throw new BadRequestException({ code: 'route_failed', message_fa: 'ذخیرهٔ طرح مسیر ناموفق بود.' });
    }
    return this.toRouteView(saved);
  }

  /** الحاق geometry (GeoJSON) و stops به شکل RoutePlan قرارداد */
  private toRouteView(r: RoutePlanRow & { stops?: { sequence: number; customer_id: string }[] }): RoutePlanView {
    return {
      id: r.id,
      tour_id: r.tour_id,
      staff_id: r.staff_id,
      plan_date: r.plan_date,
      provider: r.provider,
      objective: r.objective,
      stop_count: r.stop_count,
      total_distance_m: r.total_distance_m,
      total_duration_s: r.total_duration_s,
      geometry: r.geometry ?? null,
      stops: r.stops ?? [],
    };
  }
}
