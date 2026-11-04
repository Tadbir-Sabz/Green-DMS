import { IsArray, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

/**
 * بدنهٔ POST /routing/optimize — حداقل یکی از route_id یا customer_ids لازم است
 * (در سرویس بررسی می‌شود). مختصاتِ شروع (دپو) و پارامترهای زمان اختیاری‌اند.
 */
export class OptimizeRouteDto {
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  customer_ids?: string[];

  @IsOptional()
  @IsUUID('4')
  route_id?: string;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  start_lat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  start_lng?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(150)
  avg_speed_kmh?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(240)
  service_min_per_stop?: number;
}

/** یک توقفِ ترتیب‌داده‌شده در خروجی */
export interface OptimizedStop {
  customer_id: string;
  code: string;
  name: string;
  lat: number;
  lng: number;
  sequence: number;
  leg_distance_km: number;
  cumulative_distance_km: number;
  eta_min: number;
}

/** پاسخِ بهینه‌سازی — schemas.RoutingOptimization در قرارداد */
export interface RoutingOptimization {
  route_id: string | null;
  stop_count: number;
  stops: OptimizedStop[];
  total_distance_km: number;
  total_duration_min: number;
  savings_percent: number;
}
