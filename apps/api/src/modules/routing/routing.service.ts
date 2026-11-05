import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ROUTING_REPOSITORY } from './tokens';
import type { RoutingRepository } from './routing.repository';
import { MAX_ROUTE_STOPS, RouteOptimizationError, solveRoute } from './tsp';
import type { OptimizeRouteDto, RoutingOptimization } from './optimize.dto';

/**
 * سرویسِ بهینه‌سازی مسیر: مختصاتِ توقف‌ها را (از route_id یا customer_ids) می‌گیرد،
 * با الگوریتمِ خالصِ solveRoute (نزدیک‌ترین همسایه + 2-opt روی فاصلهٔ هاورساین)
 * ترتیبِ بهینه را می‌سازد و مسافت/زمان/درصدِ بهبود را برمی‌گرداند.
 * company_id از نشست می‌آید (جداسازی اجاره‌ها) و هرگز از کلاینت پذیرفته نمی‌شود.
 */
@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);

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

    let result;
    try {
      result = solveRoute(stops, {
        startLat: dto.start_lat,
        startLng: dto.start_lng,
        avgSpeedKmh: dto.avg_speed_kmh,
        serviceMinPerStop: dto.service_min_per_stop,
      });
    } catch (err) {
      // سقفِ توقف‌ها (و هر خطایِ دامنه‌ایِ دیگر) به یک ۴۰۰ با کدِ پایدار و پیامِ
      // قابلِ فهم نگاشت می‌شود — نه یک ۵۰۰ مبهم یا هنگِ رویدادِ Node.
      if (err instanceof RouteOptimizationError) {
        throw new BadRequestException({
          code: err.code,
          message_fa:
            err.code === 'too_many_stops'
              ? `تعدادِ توقف‌ها (${err.details?.stop_count ?? stops.length}) از سقفِ مجاز (${MAX_ROUTE_STOPS}) بیشتر است؛ مسیر را به بخش‌های کوچک‌تر تقسیم کنید.`
              : 'ورودیِ بهینه‌سازیِ مسیر معتبر نیست.',
          ...(err.details ?? {}),
        });
      }
      throw err;
    }

    if (result.skipped_stops > 0) {
      this.logger.warn(
        `routing: skipped ${result.skipped_stops} stop(s) with missing/invalid coordinates (company=${companyId})`,
      );
    }
    if (result.baseline_used) {
      this.logger.warn(
        `routing: optimizer tour was worse than input order; baseline order returned (company=${companyId})`,
      );
    }

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
