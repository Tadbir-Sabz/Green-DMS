/**
 * هستهٔ خالصِ پیش‌بینیِ فروش (بدون DB) — برای GET /bi/forecast.
 * روش: هموارسازیِ نماییِ دوسویهٔ هالت (Holt's linear trend) که سطح و روند را
 * دنبال می‌کند و برای افقِ کوتاهِ فروشِ روزانه مناسب و قابل‌توضیح است. (برای
 * فصلی‌شدگیِ قوی‌تر می‌توان بعداً Holt-Winters را جایگزین کرد؛ رابطهٔ forecast
 * همان نقطهٔ تعویض است.)
 *
 * دادهٔ ورودی از mv_daily_sales می‌آید که ممکن است «روزهایِ بدونِ فروش» ردیف
 * نداشته باشد؛ buildDailySeries آن روزها را با صفر پر می‌کند تا سریِ روزانهٔ
 * پیوسته شود (وگرنه روندِ هالت دچار سوگیریِ فاصله می‌شود).
 */

export interface DailyRow {
  day: string; // 'YYYY-MM-DD'
  net_sales: string | number;
}

export interface DailySeries {
  dates: string[];
  values: number[];
}

export interface ForecastPoint {
  date: string;
  value: number;
}

export interface Forecast {
  points: ForecastPoint[];
  level: number;
  trend: number;
}

const toUTC = (iso: string): Date => new Date(`${iso}T00:00:00Z`);
const toISODate = (d: Date): string => d.toISOString().slice(0, 10);

/** ساختِ سریِ روزانهٔ پیوسته از ردیف‌هایِ (احتمالاً دارای فاصلهٔ) mv_daily_sales. */
export function buildDailySeries(rows: readonly DailyRow[]): DailySeries {
  if (rows.length === 0) return { dates: [], values: [] };
  const byDate = new Map<string, number>();
  for (const r of rows) byDate.set(r.day, Number(r.net_sales) || 0);
  const sorted = [...byDate.keys()].sort();
  const cur = toUTC(sorted[0]);
  const end = toUTC(sorted[sorted.length - 1]);
  const dates: string[] = [];
  const values: number[] = [];
  while (cur <= end) {
    const key = toISODate(cur);
    dates.push(key);
    values.push(byDate.get(key) ?? 0);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return { dates, values };
}

/** تاریخِ `horizon` روزِ پس از `lastDate` (برای برچسب‌گذاریِ نقاطِ پیش‌بینی). */
export function nextDates(lastDate: string, horizon: number): string[] {
  const out: string[] = [];
  const d = toUTC(lastDate);
  for (let i = 0; i < horizon; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    out.push(toISODate(d));
  }
  return out;
}

/**
 * هموارسازیِ خطیِ هالت. alpha سطح و beta روند را هموار می‌کند. پیش‌بینی‌ها هرگز
 * منفی نمی‌شوند (فروشِ منفیِ روزانه معنا ندارد) → در صفر کف می‌شوند.
 */
export function holtLinear(
  series: readonly number[],
  horizon: number,
  alpha = 0.4,
  beta = 0.2,
): { forecasts: number[]; level: number; trend: number } {
  const h = Math.max(0, Math.trunc(horizon));
  if (series.length === 0) {
    return { forecasts: new Array(h).fill(0), level: 0, trend: 0 };
  }
  if (series.length === 1) {
    return { forecasts: new Array(h).fill(Math.max(0, series[0])), level: series[0], trend: 0 };
  }
  let level = series[0];
  let trend = series[1] - series[0];
  for (let t = 1; t < series.length; t++) {
    const prevLevel = level;
    level = alpha * series[t] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  const forecasts: number[] = [];
  for (let i = 1; i <= h; i++) forecasts.push(Math.max(0, level + i * trend));
  return { forecasts, level, trend };
}

/**
 * پیش‌بینیِ کامل: سریِ روزانهٔ پیوسته → هالت → نقاطِ افق با تاریخ.
 * اگر داده کافی نباشد (سریِ خالی)، افق با صفر پر می‌شود (و directionflat).
 */
export function forecastDaily(rows: readonly DailyRow[], horizon: number): Forecast {
  const { dates, values } = buildDailySeries(rows);
  const { forecasts, level, trend } = holtLinear(values, horizon);
  const startDates = dates.length > 0 ? nextDates(dates[dates.length - 1], horizon) : [];
  const points: ForecastPoint[] = forecasts.map((value, i) => ({
    date: startDates[i] ?? '',
    value: Math.round(value * 100) / 100,
  }));
  return { points, level: Math.round(level * 100) / 100, trend: Math.round(trend * 100) / 100 };
}
