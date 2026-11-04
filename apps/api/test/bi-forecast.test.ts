import { describe, expect, it } from 'vitest';
import {
  buildDailySeries,
  nextDates,
  holtLinear,
  forecastDaily,
} from '../src/modules/bi/forecast';

/** تستِ خالصِ منطقِ پیش‌بینی (بدون DB)؛ کوئریِ mv_daily_sales در CI سنجیده می‌شود. */

describe('buildDailySeries', () => {
  it('روزهایِ بدونِ داده را با صفر پر می‌کند', () => {
    const { dates, values } = buildDailySeries([
      { day: '2026-01-01', net_sales: '100' },
      { day: '2026-01-03', net_sales: '300' },
    ]);
    expect(dates).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(values).toEqual([100, 0, 300]);
  });
  it('سریِ خالی', () => {
    expect(buildDailySeries([])).toEqual({ dates: [], values: [] });
  });
});

describe('nextDates', () => {
  it('عبور از مرزِ ماه', () => {
    expect(nextDates('2026-01-30', 3)).toEqual(['2026-01-31', '2026-02-01', '2026-02-02']);
  });
});

describe('holtLinear', () => {
  it('سریِ خالی → صفرها', () => {
    expect(holtLinear([], 3).forecasts).toEqual([0, 0, 0]);
  });
  it('سریِ ثابت → پیش‌بینیِ ثابت و روندِ ~صفر', () => {
    const r = holtLinear([100, 100, 100, 100], 2);
    expect(Math.abs(r.trend)).toBeLessThan(1);
    for (const f of r.forecasts) expect(f).toBeCloseTo(100, 0);
  });
  it('سریِ صعودی → روندِ مثبت و پیش‌بینیِ صعودی', () => {
    const r = holtLinear([10, 20, 30, 40, 50], 2);
    expect(r.trend).toBeGreaterThan(0);
    expect(r.forecasts[0]).toBeGreaterThan(50);
    expect(r.forecasts[1]).toBeGreaterThan(r.forecasts[0]);
  });
  it('سریِ نزولیِ شدید → هرگز منفی (کف در صفر)', () => {
    const r = holtLinear([100, 60, 20, 5], 5);
    for (const f of r.forecasts) expect(f).toBeGreaterThanOrEqual(0);
  });
});

describe('forecastDaily', () => {
  it('horizon نقطه با تاریخِ پیوسته، مقدارِ نامنفی و روندِ مثبت', () => {
    const r = forecastDaily(
      [
        { day: '2026-01-01', net_sales: '100' },
        { day: '2026-01-02', net_sales: '120' },
        { day: '2026-01-03', net_sales: '140' },
      ],
      3,
    );
    expect(r.points.length).toBe(3);
    expect(r.points.map((p) => p.date)).toEqual(['2026-01-04', '2026-01-05', '2026-01-06']);
    expect(r.trend).toBeGreaterThan(0);
    for (const p of r.points) expect(p.value).toBeGreaterThanOrEqual(0);
    // صعودی: هر روز بیش از روزِ قبل
    expect(r.points[2].value).toBeGreaterThan(r.points[0].value);
  });
});
