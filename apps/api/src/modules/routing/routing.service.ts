import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ROUTING_REPOSITORY } from './tokens';
import type { RoutingRepository } from './routing.repository';
import { solveRoute } from './tsp';
import type { OptimizeRouteDto, RoutingOptimization } from './optimize.dto';

/**
 * سرویسِ بهینه‌سازی مسیر: مختصاتِ توقف‌ها را (از route_id یا customer_ids) می‌گیرد،
 * با الگوریتمِ خالصِ solveRoute (نزدیک‌ترین همسایه + 2-opt روی فاصلهٔ هاورساین)
 * ترتیبِ بهینه را می‌سازد و مسافت/زمان/درصدِ بهبود را برمی‌گرداند.
 * company_id از نشست می‌آید (جداسازی اجاره‌ها) و هرگز از کلاینت پذیرفته نمی‌شود.
 */
@Injectable()
export class RoutingService {
  constructor(@Inject(ROUTING_REPOSITORY) private readonly repo: RoutingRepository) {}

  async optimize(dto: OptimizeRouteDto, companyId: string): Promise<RoutingOptimization> {
    const byRoute = Boolean(dto.route_id);
    const ids = dto.customer_ids ?? [];
    if (!byRoute && ids.length === 0) {
      throw new BadRequestException({
        code: 'no_stops',
        message_fa: 'دست‌کم یکی از route_id یا customer_ids لازم است.',
      });
    }

    const stops = byRoute
      ? await this.repo.stopsByRoute(companyId, dto.route_id as string)
      : await this.repo.stopsByCustomerIds(companyId, ids);

    if (stops.length === 0) {
      return {
        route_id: dto.route_id ?? null,
        stop_count: 0,
        stops: [],
        total_distance_km: 0,
        total_duration_min: 0,
        savings_percent: 0,
      };
    }

    const result = solveRoute(stops, {
      startLat: dto.start_lat,
      startLng: dto.start_lng,
      avgSpeedKmh: dto.avg_speed_kmh,
      serviceMinPerStop: dto.service_min_per_stop,
    });

    return {
      route_id: dto.route_id ?? null,
      stop_count: result.stops.length,
      stops: result.stops.map((s) => ({
        customer_id: s.id,
        code: s.code,
        name: s.name,
        lat: s.lat,
        lng: s.lng,
        sequence: s.sequence,
        leg_distance_km: s.leg_distance_km,
        cumulative_distance_km: s.cumulative_distance_km,
        eta_min: s.eta_min,
      })),
      total_distance_km: result.total_distance_km,
      total_duration_min: result.total_duration_min,
      savings_percent: result.savings_percent,
    };
  }
}
