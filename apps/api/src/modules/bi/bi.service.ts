import { Inject, Injectable } from '@nestjs/common';
import { BI_REPOSITORY } from './tokens';
import type { BiRepository } from './bi.repository';
import { forecastDaily } from './forecast';

/** ورودیِ طبقه‌بندی ABC — revenue به‌صورت عدد (از ::text در ریپازیتوری تبدیل شده) */
export interface AbcInput {
  id: string;
  code: string;
  name: string;
  revenue: number;
  qty?: number;
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
): { items: AbcEntry[]; totalRevenue: number } {
  const totalRevenue = rows.reduce((s, r) => s + (r.revenue > 0 ? r.revenue : 0), 0);
  let cumulative = 0;
  const items: AbcEntry[] = rows.map((r) => {
    const share = totalRevenue > 0 ? (r.revenue / totalRevenue) * 100 : 0;
    const before = cumulative;
    cumulative += share;
    const cls: 'A' | 'B' | 'C' = before < aPct ? 'A' : before < bPct ? 'B' : 'C';
    const entry: AbcEntry = {
      id: r.id,
      code: r.code,
      name: r.name,
      revenue: round(r.revenue, 2).toFixed(2),
      share_pct: round(share, 2),
      cumulative_pct: round(cumulative, 2),
      class: cls,
    };
    if (r.qty !== undefined) entry.qty = round(r.qty, 2).toFixed(2);
    return entry;
  });
  return { items, totalRevenue };
}

@Injectable()
export class BiService {
  constructor(@Inject(BI_REPOSITORY) private readonly repo: BiRepository) {}

  async kpi(companyId: string, days = 30): Promise<BiKpi> {
    const raw = await this.repo.kpi(companyId, days);
    const gross = Number(raw.gross);
    const collected = Number(raw.collected);
    return {
      period_days: days,
      sales: raw.sales,
      collected: raw.collected,
      gross: raw.gross,
      ar_balance: raw.ar_balance,
      ar_overdue: raw.ar_overdue,
      open_invoice_count: raw.open_invoices,
      active_customer_count: raw.active_customers,
      collection_rate: gross > 0 ? round(collected / gross, 4) : null,
    };
  }

  async abcCustomers(companyId: string): Promise<AbcResult> {
    const rows = await this.repo.abcCustomers(companyId);
    const input: AbcInput[] = rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      revenue: Number(r.revenue),
    }));
    const { items, totalRevenue } = classifyAbc(input);
    return { items, thresholds: { a: 80, b: 95 }, total_revenue: round(totalRevenue, 2).toFixed(2) };
  }

  async abcProducts(companyId: string): Promise<AbcResult> {
    const rows = await this.repo.abcProducts(companyId);
    const input: AbcInput[] = rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      revenue: Number(r.revenue),
      qty: Number(r.qty),
    }));
    const { items, totalRevenue } = classifyAbc(input);
    return { items, thresholds: { a: 80, b: 95 }, total_revenue: round(totalRevenue, 2).toFixed(2) };
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
