import { describe, expect, it } from 'vitest';
import {
  haversineKm,
  distanceMatrix,
  nearestNeighborTour,
  tourLength,
  twoOpt,
  solveRoute,
  type RouteStop,
} from '../src/modules/routing/tsp';

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
