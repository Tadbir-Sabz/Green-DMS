import { Inject, Injectable } from '@nestjs/common';
import { BI_REPOSITORY } from './tokens';
import {
  INTERNAL_SCALE,
  divideFixed,
  formatFixed,
  ratioPct,
  sumFixed,
  toFixed,
  type Fixed,
} from './decimal';
import type { BiRepository } from './bi.repository';
import { forecastDaily } from './forecast';

/** ورودیِ طبقه‌بندی ABC — revenue به‌صورت عدد (از ::text در ریپازیتوری تبدیل شده) */
export interface AbcInput {
  id: string;
  code: string;
  name: string;
  /**
   * درآمد — رشتهٔ numericِ پستگرس «یا» عدد. رشته ارجح است: تبدیلِ مبالغِ بزرگِ ریالی
   * به Number (IEEE-754) از ۲^۵۳ به بعد رقم از دست می‌دهد، پس محاسباتِ داخلی با
   * BigIntِ مقیاس‌ثابت و دقیق انجام می‌شود. عدد فقط برای سازگاریِ فراخوان‌هایِ
   * قدیمی/تست‌هایِ واحد پذیرفته می‌شود.
   */
  revenue: string | number;
  qty?: string | number;
}

/** یک قلمِ طبقه‌بندی‌شده در خروجی ABC */
export interface AbcEntry {
  id: string;
  code: string;
  name: string;
  revenue: string; // decimal string (دقت نمایش، بدون float)
  qty?: string;
  share_pct: number; // سهم از کل درآمد (٪)
  cumulative_pct: number; // مجموع تجمعی تا این قلم (٪)
  class: 'A' | 'B' | 'C';
}

export interface BiKpi {
  period_days: number;
  sales: string;
  collected: string;
  gross: string;
  ar_balance: string;
  ar_overdue: string;
  open_invoice_count: number;
  active_customer_count: number;
  collection_rate: number | null; // collected/gross در دوره (۰..۱)؛ null اگر فروش صفر
}

export interface AbcResult {
  items: AbcEntry[];
  thresholds: { a: number; b: number };
  total_revenue: string;
}

export interface BiForecastPoint {
  date: string;
  value: string; // فروشِ خالصِ پیش‌بینی‌شده (decimal string)
}

export interface BiForecast {
  method: 'holt-linear';
  history_days: number;
  horizon_days: number;
  points: BiForecastPoint[];
  total: string; // مجموعِ افق
  trend_per_day: string; // مؤلفهٔ روند (تغییرِ روزانهٔ سطح)
  direction: 'up' | 'down' | 'flat';
}

const round = (n: number, digits: number): number => {
  const f = 10 ** digits;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/**
 * طبقه‌بندی ABC (قانونِ پارتو): قلم‌ها نزولیِ درآمد مرتب شده‌اند؛ قلمی «A» است اگر
 * مجموعِ تجمعیِ *پیش از* آن زیر آستانهٔ A (پیش‌فرض ۸۰٪) باشد، «B» اگر پیش از آن زیرِ
 * آستانهٔ B (پیش‌فرض ۹۵٪) باشد، وگرنه «C». این تابعِ خالص (بدون DB) و قابل تست است.
 */
export function classifyAbc(
  rows: readonly AbcInput[],
  aPct = 80,
  bPct = 95,
): { items: AbcEntry[]; totalRevenue: number; totalRevenueText: string } {
  // مقدارِ «نمایشی» هر قلم بدونِ سانسور (منفی‌ها هم همان‌گونه گزارش می‌شوند) و
  // مقدارِ «مشارکت در کل» که مثلِ پیشین فقط مثبت‌ها را جمع می‌زند.
  const shown: Fixed[] = rows.map((r) => toFixed(r.revenue) ?? 0n);
  const contributing: Fixed[] = shown.map((v) => (v > 0n ? v : 0n));
  const total = sumFixed(contributing);

  // totalRevenueText خروجیِ «دقیقِ» مالی است؛ totalRevenue (عدد) فقط برای سازگاریِ
  // فراخوان‌هایِ قدیمی نگه داشته شده و در پاسخِ API استفاده نمی‌شود.
  const totalRevenueText = formatFixed(total, 2);
  const totalRevenue = Number(total) / 10 ** INTERNAL_SCALE;

  let accumulated: Fixed = 0n; // جمعِ تجمعیِ دقیقِ درآمد تا قلمِ جاری
  const items: AbcEntry[] = rows.map((r, i) => {
    const before = accumulated;
    accumulated += contributing[i];

    // سهم‌ها با تقسیمِ دقیقِ BigInt محاسبه می‌شوند؛ برای «طبقه‌بندی» از دقتِ ۶ رقم
    // استفاده می‌شود تا مرزهایِ آستانه دقیقاً مثلِ رفتارِ پیشین (مقایسه با مقدارِ
    // کاملِ شناور) رفتار کنند و گردکردنِ نمایشی باعثِ جابه‌جاییِ کلاس نشود.
    const beforeExact = ratioPct(before, total, 6);
    const cls: 'A' | 'B' | 'C' = beforeExact < aPct ? 'A' : beforeExact < bPct ? 'B' : 'C';

    const entry: AbcEntry = {
      id: r.id,
      code: r.code,
      name: r.name,
      revenue: formatFixed(shown[i], 2),
      share_pct: ratioPct(shown[i], total, 2),
      cumulative_pct: ratioPct(accumulated, total, 2),
      class: cls,
    };
    if (r.qty !== undefined) {
      const q = toFixed(r.qty);
      entry.qty = q !== null ? formatFixed(q, 2) : round(Number(r.qty), 2).toFixed(2);
    }
    return entry;
  });
  return { items, totalRevenue, totalRevenueText };
}

@Injectable()
export class BiService {
  constructor(@Inject(BI_REPOSITORY) private readonly repo: BiRepository) {}

  async kpi(companyId: string, days = 30): Promise<BiKpi> {
    const raw = await this.repo.kpi(companyId, days);
    // مبالغ هرگز به Number تبدیل نمی‌شوند؛ نرخِ وصول با تقسیمِ دقیقِ BigInt حساب می‌شود.
    const gross = toFixed(raw.gross) ?? 0n;
    const collected = toFixed(raw.collected) ?? 0n;
    return {
      period_days: days,
      sales: raw.sales,
      collected: raw.collected,
      gross: raw.gross,
      ar_balance: raw.ar_balance,
      ar_overdue: raw.ar_overdue,
      open_invoice_count: raw.open_invoices,
      active_customer_count: raw.active_customers,
      collection_rate: gross > 0n ? divideFixed(collected, gross, 4) : null,
    };
  }

  async abcCustomers(companyId: string): Promise<AbcResult> {
    const rows = await this.repo.abcCustomers(companyId);
    const input: AbcInput[] = rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      revenue: r.revenue, // رشتهٔ numericِ پستگرس — بدونِ تبدیل به Number
    }));
    const { items, totalRevenueText } = classifyAbc(input);
    return { items, thresholds: { a: 80, b: 95 }, total_revenue: totalRevenueText };
  }

  async abcProducts(companyId: string): Promise<AbcResult> {
    const rows = await this.repo.abcProducts(companyId);
    const input: AbcInput[] = rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      revenue: r.revenue, // رشتهٔ numericِ پستگرس — بدونِ تبدیل به Number
      qty: r.qty,
    }));
    const { items, totalRevenueText } = classifyAbc(input);
    return { items, thresholds: { a: 80, b: 95 }, total_revenue: totalRevenueText };
  }

  /**
   * پیش‌بینیِ فروشِ روزانه برای `horizon` روزِ آینده با هموارسازیِ خطیِ هالت رویِ
   * سریِ `historyDays` روزِ اخیر (mv_daily_sales). منطقِ پیش‌بینی در forecast.ts
   * خالص و تست‌شده است؛ اینجا فقط دادهٔ تاریخی را می‌گیرد و خروجی را شکل می‌دهد.
   */
  async forecast(companyId: string, historyDays: number, horizon: number): Promise<BiForecast> {
    const rows = await this.repo.forecastHistory(companyId, historyDays);
    const { points, trend } = forecastDaily(rows, horizon);
    const total = points.reduce((s, p) => s + p.value, 0);
    const direction: BiForecast['direction'] = trend > 0.01 ? 'up' : trend < -0.01 ? 'down' : 'flat';
    return {
      method: 'holt-linear',
      history_days: historyDays,
      horizon_days: horizon,
      points: points.map((p) => ({ date: p.date, value: round(p.value, 2).toFixed(2) })),
      total: round(total, 2).toFixed(2),
      trend_per_day: round(trend, 2).toFixed(2),
      direction,
    };
  }
}
