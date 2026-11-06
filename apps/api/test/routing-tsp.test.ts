import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  haversineKm,
  distanceMatrix,
  nearestNeighborTour,
  tourLength,
  twoOpt,
  solveRoute,
  MAX_ROUTE_STOPS,
  RouteOptimizationError,
  shouldUseBaseline,
  type RouteStop,
} from '../src/modules/routing/tsp';
import { OptimizeRouteDto } from '../src/modules/routing/optimize.dto';

/**
 * تستِ خالصِ الگوریتمِ مسیریابی (بدون DB). کوئریِ PostGIS برای گرفتنِ مختصاتِ
 * مشتریان در CI سنجیده می‌شود؛ اینجا درستیِ هاورساین، ماتریسِ فاصله،
 * نزدیک‌ترین همسایه، 2-opt و solveRoute (ترتیبِ بهینه + درصدِ بهبود + زمان) پوشش می‌گیرد.
 */

const stop = (id: string, lat: number, lng: number): RouteStop => ({ id, code: id, name: id, lat, lng });

describe('haversineKm', () => {
  it('یک درجه روی استوا ≈ ۱۱۱٫۲ کیلومتر', () => {
    expect(haversineKm(0, 0, 0, 1)).toBeGreaterThan(111);
    expect(haversineKm(0, 0, 0, 1)).toBeLessThan(112);
  });
  it('فاصلهٔ نقطه با خودش صفر', () => {
    expect(haversineKm(35.7, 51.4, 35.7, 51.4)).toBe(0);
  });
  it('متقارن است', () => {
    expect(haversineKm(35, 51, 36, 52)).toBeCloseTo(haversineKm(36, 52, 35, 51), 9);
  });
});

describe('distanceMatrix', () => {
  it('متقارن با قطرِ صفر', () => {
    const m = distanceMatrix([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 0 },
    ]);
    expect(m.length).toBe(3);
    for (let i = 0; i < 3; i++) {
      expect(m[i][i]).toBe(0);
      for (let j = 0; j < 3; j++) expect(m[i][j]).toBeCloseTo(m[j][i], 9);
    }
  });
});

describe('nearestNeighborTour', () => {
  it('از گرهٔ شروع، همه را یک‌بار بازدید می‌کند', () => {
    const dist = distanceMatrix([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 3 },
      { lat: 0, lng: 1 },
      { lat: 0, lng: 2 },
    ]);
    const tour = nearestNeighborTour(4, dist, 0);
    expect(tour[0]).toBe(0);
    expect(new Set(tour).size).toBe(4);
    expect(tour).toEqual([0, 2, 3, 1]); // نزدیک‌ترین‌ها به ترتیب
  });
});

describe('twoOpt', () => {
  it('تورِ نابهینه را بهبود می‌دهد و دپو را اول نگه می‌دارد', () => {
    const dist = distanceMatrix([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 3 },
      { lat: 0, lng: 1 },
      { lat: 0, lng: 2 },
    ]);
    const bad = [0, 1, 2, 3]; // depot, far, near, mid
    const improved = twoOpt(bad, dist);
    expect(improved[0]).toBe(0);
    expect(tourLength(improved, dist)).toBeLessThan(tourLength(bad, dist));
  });
});

describe('solveRoute', () => {
  it('ورودیِ خالی → خروجیِ خالی', () => {
    const r = solveRoute([]);
    expect(r.stops).toEqual([]);
    expect(r.total_distance_km).toBe(0);
    expect(r.savings_percent).toBe(0);
  });

  it('یک توقف → مسافتِ صفر', () => {
    const r = solveRoute([stop('a', 0, 0)]);
    expect(r.stops.length).toBe(1);
    expect(r.total_distance_km).toBe(0);
  });

  it('ترتیبِ بهینه روی یک خط + ~۵۰٪ بهبود نسبت به ورودیِ نابهینه', () => {
    const stops = [stop('far', 0, 3), stop('near', 0, 1), stop('mid', 0, 2)];
    const r = solveRoute(stops, { startLat: 0, startLng: 0, avgSpeedKmh: 60, serviceMinPerStop: 0 });
    expect(r.stops.map((s) => s.id)).toEqual(['near', 'mid', 'far']);
    expect(r.stops.map((s) => s.sequence)).toEqual([1, 2, 3]);
    // ~۳ درجه ≈ ۳۳۳ کیلومتر
    expect(r.total_distance_km).toBeGreaterThan(332);
    expect(r.total_distance_km).toBeLessThan(335);
    expect(r.savings_percent).toBeCloseTo(50, 0);
    // فاصلهٔ تجمعی صعودی است
    expect(r.stops[2].cumulative_distance_km).toBeCloseTo(r.total_distance_km, 1);
  });

  it('بدون دپو از اولین توقف شروع می‌شود (مسیرِ باز)', () => {
    const stops = [stop('a', 0, 0), stop('b', 0, 2), stop('c', 0, 1)];
    const r = solveRoute(stops, { avgSpeedKmh: 60, serviceMinPerStop: 0 });
    expect(r.stops.length).toBe(3);
    expect(r.stops[0].leg_distance_km).toBe(0); // اولین توقف، بدون یالِ ورودی
  });

  it('زمان = سفر + خدمت در هر توقف', () => {
    const stops = [stop('a', 0, 1), stop('b', 0, 2)];
    const r = solveRoute(stops, { startLat: 0, startLng: 0, avgSpeedKmh: 60, serviceMinPerStop: 10 });
    // سرعت ۶۰ → هر کیلومتر ۱ دقیقه؛ duration ≈ distance + 2*10
    expect(r.total_duration_min).toBeCloseTo(r.total_distance_km + 20, 0);
  });

  it('توقف‌های بدونِ مختصاتِ معتبر نادیده گرفته می‌شوند', () => {
    const stops = [stop('a', 0, 1), stop('bad', Number.NaN, 5), stop('c', 0, 2)];
    const r = solveRoute(stops, { startLat: 0, startLng: 0 });
    expect(r.stops.map((s) => s.id)).toEqual(['a', 'c']);
  });
});

/* ------------------------------------------------------------------ *
 * محافظت‌های P1: سقفِ توقف‌ها، اعتبارسنجیِ مختصات، خطِ پایه، کارایی
 * ------------------------------------------------------------------ */

/** PRNG قطعی (mulberry32) تا آزمونِ ویژگی بازتولیدپذیر باشد. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** مسافتِ «ترتیبِ ورودی» (خطِ پایه) — مستقل از solveRoute محاسبه می‌شود. */
function naiveTourKm(stops: readonly RouteStop[], start?: { lat: number; lng: number }): number {
  let km = 0;
  let prev = start;
  for (const s of stops) {
    if (prev) km += haversineKm(prev.lat, prev.lng, s.lat, s.lng);
    prev = s;
  }
  return km;
}

/** بودجهٔ کارایی: حل در سقف باید «تمام» شود؛ کران، هنگ/رگرسیونِ نمایی را می‌گیرد. */
const PERF_BUDGET_MS = Number(process.env.TSP_PERF_BUDGET_MS ?? 20_000);

describe('solveRoute — سقفِ تعدادِ توقف‌ها (MAX_ROUTE_STOPS)', () => {
  const manyStops = (n: number): RouteStop[] =>
    Array.from({ length: n }, (_, i) => stop(`s${i}`, 35 + (i % 60) / 100, 51 + (i % 45) / 100));

  it('بیش از سقف → RouteOptimizationError با کدِ too_many_stops و جزئیاتِ عددی', () => {
    let err: unknown;
    try {
      solveRoute(manyStops(MAX_ROUTE_STOPS + 1));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(RouteOptimizationError);
    expect((err as RouteOptimizationError).code).toBe('too_many_stops');
    expect((err as RouteOptimizationError).details).toMatchObject({
      stop_count: MAX_ROUTE_STOPS + 1,
      max_stops: MAX_ROUTE_STOPS,
    });
  });

  it(`کارایی در سقفِ پیکربندی‌شده (${MAX_ROUTE_STOPS} توقف) — حل می‌شود و از بودجه نمی‌گذرد`, () => {
    const stops = manyStops(MAX_ROUTE_STOPS);
    const t0 = Date.now();
    const r = solveRoute(stops, { startLat: 35.7, startLng: 51.4 });
    const ms = Date.now() - t0;
    // eslint-disable-next-line no-console
    console.log(`[perf] solveRoute(${MAX_ROUTE_STOPS} stops, depot) = ${ms}ms (budget ${PERF_BUDGET_MS}ms)`);
    expect(r.stops.length).toBe(MAX_ROUTE_STOPS);
    expect(r.total_distance_km).toBeGreaterThan(0);
    expect(r.stops.map((s) => s.sequence)).toEqual(
      Array.from({ length: MAX_ROUTE_STOPS }, (_, i) => i + 1),
    );
    expect(ms).toBeLessThan(PERF_BUDGET_MS);
  });
});

describe('solveRoute — اعتبارسنجیِ مختصات', () => {
  it('مختصاتِ نامعتبر/خارج از بازه کنار گذاشته و شمارش می‌شوند (بدونِ شکستِ درخواست)', () => {
    const stops: RouteStop[] = [
      stop('ok1', 35.7, 51.4),
      stop('nan', Number.NaN, 51.4),
      stop('inf', 35.7, Number.POSITIVE_INFINITY),
      stop('lat-out', 95, 51.4),
      stop('lng-out', 35.7, -181),
      stop('missing', undefined as unknown as number, undefined as unknown as number),
      stop('ok2', 35.8, 51.5),
    ];
    const r = solveRoute(stops);
    expect(r.stops.map((s) => s.id)).toEqual(['ok1', 'ok2']);
    expect(r.skipped_stops).toBe(5);
  });

  it('مرزهایِ مجازِ جغرافیایی پذیرفته می‌شوند', () => {
    const r = solveRoute([stop('pole', 90, 180), stop('anti', -90, -180)]);
    expect(r.skipped_stops).toBe(0);
    expect(r.stops.length).toBe(2);
  });

  it('همهٔ مختصات نامعتبر → نتیجهٔ تهیِ امن (بدونِ پرتاب)', () => {
    const r = solveRoute([stop('a', Number.NaN, 0), stop('b', 0, Number.NaN)]);
    expect(r.stops).toEqual([]);
    expect(r.total_distance_km).toBe(0);
    expect(r.skipped_stops).toBe(2);
    expect(r.baseline_used).toBe(false);
  });

  it('ورودیِ تهی → نتیجهٔ تهی', () => {
    expect(solveRoute([])).toMatchObject({ stops: [], skipped_stops: 0, baseline_used: false });
  });
});

describe('solveRoute — خطِ پایه (baseline fallback)', () => {
  it('خروجی هرگز از ترتیبِ ورودی بدتر نیست — آزمونِ ویژگی روی ۶۰ ورودیِ تصادفیِ قطعی', () => {
    let baselineHits = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const rnd = mulberry32(seed);
      const n = 4 + Math.floor(rnd() * 20);
      const stops = Array.from({ length: n }, (_, i) =>
        stop(`p${i}`, 35 + rnd() * 0.6, 51 + rnd() * 0.6),
      );
      const depot = { lat: 35.68, lng: 51.39 };
      const r = solveRoute(stops, { startLat: depot.lat, startLng: depot.lng });
      const naive = naiveTourKm(stops, depot);
      // تضمینِ اصلی: مسافتِ برگردانده‌شده هرگز از خطِ پایه بیشتر نیست.
      expect(r.total_distance_km).toBeLessThanOrEqual(naive + 1e-6);
      if (r.baseline_used) {
        baselineHits += 1;
        expect(r.savings_percent).toBe(0);
        expect(r.stops.map((s) => s.id)).toEqual(stops.map((s) => s.id));
      } else {
        expect(r.savings_percent).toBeGreaterThanOrEqual(0);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`[baseline] fallback exercised in ${baselineHits}/60 random cases`);
  });

  it('ترتیبِ ورودیِ «بهینه» (هم‌خط و صعودی) → حفظِ ترتیب و savings صفر', () => {
    const collinear = Array.from({ length: 8 }, (_, i) => stop(`c${i}`, 35 + i * 0.05, 51));
    const r = solveRoute(collinear);
    expect(r.stops.map((s) => s.id)).toEqual(collinear.map((s) => s.id));
    expect(r.savings_percent).toBe(0);
    expect(r.baseline_used).toBe(false);
    expect(r.skipped_stops).toBe(0);
  });
});

describe('OptimizeRouteDto — اعتبارسنجیِ سمتِ سرور برای تعدادِ توقف', () => {
  it('customer_ids بیش از سقف → خطایِ اعتبارسنجی (پیش از هر محاسبهٔ سنگین)', async () => {
    const dto = plainToInstance(OptimizeRouteDto, {
      customer_ids: Array.from({ length: MAX_ROUTE_STOPS + 1 }, () => randomUUID()),
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.map((e) => e.property)).toContain('customer_ids');
    expect(JSON.stringify(errors)).toContain(String(MAX_ROUTE_STOPS));
  });

  it('دقیقاً سقف → بدونِ خطا', async () => {
    const dto = plainToInstance(OptimizeRouteDto, {
      customer_ids: Array.from({ length: MAX_ROUTE_STOPS }, () => randomUUID()),
    });
    expect(await validate(dto)).toEqual([]);
  });

  it('مختصاتِ شروعِ خارج از بازه → خطایِ اعتبارسنجی', async () => {
    const dto = plainToInstance(OptimizeRouteDto, {
      customer_ids: [randomUUID()],
      start_lat: 91,
      start_lng: 181,
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property).sort()).toEqual(['start_lat', 'start_lng']);
  });
});

describe('shouldUseBaseline — قاعدهٔ تصمیمِ خطِ پایه (پوششِ مستقیمِ شاخه)', () => {
  it('تورِ بهینه بدتر از ترتیبِ ورودی → خطِ پایه انتخاب می‌شود', () => {
    expect(shouldUseBaseline(12.5, 10)).toBe(true);
    expect(shouldUseBaseline(10.000001, 10)).toBe(true);
    // تفاوتِ زیرِ تلورانس (۱e-۹) «بدتر» شمرده نمی‌شود تا نوسانِ شناور بی‌اثر بماند
    expect(shouldUseBaseline(10 + 1e-12, 10)).toBe(false);
  });
  it('تورِ بهینه بهتر یا مساوی → همان خروجیِ بهینه‌ساز', () => {
    expect(shouldUseBaseline(8, 10)).toBe(false);
    expect(shouldUseBaseline(10, 10)).toBe(false);
  });
  it('مبناِ صفر/تباهیده → هرگز خطِ پایه فعال نمی‌شود (تقسیم بر صفر معنا ندارد)', () => {
    expect(shouldUseBaseline(5, 0)).toBe(false);
    expect(shouldUseBaseline(0, 0)).toBe(false);
  });
});
