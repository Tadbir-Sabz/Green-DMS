"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { Card, CardBody, SectionTitle } from "@/components/ui/Card";
import { StatCard, StatGrid, type StatTone } from "@/components/ui/StatCard";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { SkeletonCard, ErrorState } from "@/components/ui/Feedback";
import { formatMoney, formatNumber } from "@/lib/format";

/**
 * داشبورد BI — لایهٔ بصری روی endpointهای ماژول BI:
 *   GET /bi/kpi?days=         → کارت‌های شاخص (فروش/وصولی/ماندهٔ AR/نرخ وصول)
 *   GET /bi/abc-customers     → جدولِ طبقه‌بندی ABC مشتریان
 *   GET /bi/abc-products      → جدولِ طبقه‌بندی ABC کالاها
 *   GET /bi/forecast?horizon=  → پیش‌بینیِ فروشِ روزانه (افقِ قابلِ انتخاب)
 * دسترسی با reports.dashboard.view (هم‌راستا با منو و گاردِ سمتِ سرور).
 */

type BiKpi = components["schemas"]["BiKpi"];
type AbcResult = components["schemas"]["AbcResult"];
type AbcEntry = components["schemas"]["AbcEntry"];
type BiForecast = components["schemas"]["BiForecast"];
type BiForecastPoint = components["schemas"]["BiForecastPoint"];

const DAY_OPTIONS = [30, 90, 180] as const;
const HORIZON_OPTIONS = [7, 14, 30] as const;
const directionTone = (d: BiForecast["direction"]): StatTone =>
  d === "up" ? "success" : d === "down" ? "danger" : "neutral";
const directionFa = (d: BiForecast["direction"]): string =>
  d === "up" ? "صعودی" : d === "down" ? "نزولی" : "خنثی";
const classTone = (c: AbcEntry["class"]): BadgeTone =>
  c === "A" ? "success" : c === "B" ? "warning" : "neutral";

function abcColumns(withQty: boolean): Column<AbcEntry>[] {
  const cols: Column<AbcEntry>[] = [
    { key: "code", header: "کد", render: (r) => <span dir="ltr">{r.code}</span> },
    { key: "name", header: "نام", render: (r) => r.name },
    { key: "revenue", header: "درآمد", render: (r) => formatMoney(r.revenue) },
  ];
  if (withQty) {
    cols.push({ key: "qty", header: "مقدار", render: (r) => formatNumber(r.qty ?? 0) });
  }
  cols.push(
    { key: "share_pct", header: "سهم ٪", render: (r) => formatNumber(r.share_pct) },
    { key: "cumulative_pct", header: "تجمعی ٪", render: (r) => formatNumber(r.cumulative_pct) },
    {
      key: "class",
      header: "کلاس",
      render: (r) => <Badge tone={classTone(r.class)}>{r.class}</Badge>,
    },
  );
  return cols;
}

function BiInner() {
  const [days, setDays] = useState<number>(30);
  const [horizon, setHorizon] = useState<number>(7);

  const kpi = useQuery({
    queryKey: ["bi-kpi", days],
    queryFn: async () => {
      const res = await api.GET("/bi/kpi", { params: { query: { days } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data as BiKpi;
    },
  });

  const abcCustomers = useQuery({
    queryKey: ["bi-abc-customers"],
    queryFn: async () => {
      const res = await api.GET("/bi/abc-customers");
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data as AbcResult;
    },
  });

  const abcProducts = useQuery({
    queryKey: ["bi-abc-products"],
    queryFn: async () => {
      const res = await api.GET("/bi/abc-products");
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data as AbcResult;
    },
  });

  const forecast = useQuery({
    queryKey: ["bi-forecast", horizon],
    queryFn: async () => {
      const res = await api.GET("/bi/forecast", { params: { query: { horizon } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data as BiForecast;
    },
  });

  const forecastColumns: Column<BiForecastPoint>[] = [
    { key: "date", header: "تاریخ", render: (r) => <span dir="ltr">{r.date}</span> },
    { key: "value", header: "فروشِ پیش‌بینی‌شده", render: (r) => formatMoney(r.value) },
  ];

  return (
    <div className="space-y-6">
      {/* سربرگِ بازطراحی‌شده (گامِ اولِ بازطراحیِ محدودِ سطوحِ کلیدی): نوارِ فرمانِ
          برند با انتخابِ بازهٔ درون‌خطی. همهٔ منطق/داده‌ها/پرس‌وجوها و RTL بدونِ
          تغییر حفظ شده‌اند — فقط لایهٔ بصری. */}
      <section className="rounded-2xl border border-brand-line bg-brand-panel p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-soft-ink">
              <svg
                viewBox="0 0 24 24"
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <div className="space-y-1">
              <h1 className="text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
                داشبورد BI
              </h1>
              <p className="text-sm leading-6 text-ink-muted">
                شاخص‌های کلانِ فروش و وصولی، تحلیلِ ABC مشتریان و کالاها، و پیش‌بینیِ فروش
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-ink-subtle">بازهٔ فروش/وصولی</span>
            <div
              className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1"
              role="group"
              aria-label="بازهٔ زمانی"
            >
              {DAY_OPTIONS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  aria-pressed={days === d}
                  className={`focus-ring rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    days === d
                      ? "bg-brand text-ink-inverse shadow-sm"
                      : "text-ink-muted hover:bg-surface-hover"
                  }`}
                >
                  {d} روز
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {kpi.isLoading && (
        <StatGrid>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </StatGrid>
      )}
      {kpi.isError && <ErrorState message={errorMessage(kpi.error)} onRetry={() => kpi.refetch()} />}
      {kpi.data && (
        <StatGrid>
          <StatCard label="فروش خالص" value={formatMoney(kpi.data.sales)} tone="brand" sub={`${days} روز اخیر`} />
          <StatCard label="وصولی" value={formatMoney(kpi.data.collected)} tone="success" sub={`${days} روز اخیر`} />
          <StatCard label="ماندهٔ دریافتنی" value={formatMoney(kpi.data.ar_balance)} tone="warning" sub="کلِ باز" />
          <StatCard label="معوق" value={formatMoney(kpi.data.ar_overdue)} tone="danger" sub="سررسیدگذشته" />
          <StatCard
            label="نرخ وصول"
            value={kpi.data.collection_rate != null ? `${formatNumber(kpi.data.collection_rate * 100)}٪` : "—"}
            tone="info"
            sub="وصول ÷ فروشِ بازه"
          />
          <StatCard label="فاکتور باز" value={formatNumber(kpi.data.open_invoice_count)} tone="neutral" />
          <StatCard label="مشتریِ دارای مانده" value={formatNumber(kpi.data.active_customer_count)} tone="neutral" />
        </StatGrid>
      )}

      <Card>
        <CardBody>
          <SectionTitle>تحلیل ABC مشتریان</SectionTitle>
          {abcCustomers.isLoading && <SkeletonCard />}
          {abcCustomers.isError && (
            <ErrorState compact message={errorMessage(abcCustomers.error)} onRetry={() => abcCustomers.refetch()} />
          )}
          {abcCustomers.data && (
            <DataTable
              columns={abcColumns(false)}
              rows={abcCustomers.data.items}
              rowKey={(r) => r.id}
              emptyMessage="دادهٔ کافی برای تحلیل ABC وجود ندارد"
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <SectionTitle>تحلیل ABC کالاها</SectionTitle>
          {abcProducts.isLoading && <SkeletonCard />}
          {abcProducts.isError && (
            <ErrorState compact message={errorMessage(abcProducts.error)} onRetry={() => abcProducts.refetch()} />
          )}
          {abcProducts.data && (
            <DataTable
              columns={abcColumns(true)}
              rows={abcProducts.data.items}
              rowKey={(r) => r.id}
              emptyMessage="دادهٔ کافی برای تحلیل ABC وجود ندارد"
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <SectionTitle>پیش‌بینیِ فروش</SectionTitle>
          <div className="mb-4 flex items-center gap-2">
            <span className="text-sm text-ink-muted">افق:</span>
            {HORIZON_OPTIONS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHorizon(h)}
                className={`focus-ring rounded-lg border px-3 py-1.5 text-sm ${
                  horizon === h ? "border-brand text-brand-soft-ink" : "border-line"
                }`}
              >
                {h} روز
              </button>
            ))}
          </div>
          {forecast.isLoading && <SkeletonCard />}
          {forecast.isError && (
            <ErrorState compact message={errorMessage(forecast.error)} onRetry={() => forecast.refetch()} />
          )}
          {forecast.data && (
            <div className="space-y-4">
              <StatGrid cols={3}>
                <StatCard
                  label={`فروشِ ${horizon} روزِ آینده`}
                  value={formatMoney(forecast.data.total)}
                  tone="brand"
                  sub="هموارسازیِ خطیِ هالت"
                />
                <StatCard
                  label="روندِ روزانه"
                  value={formatMoney(forecast.data.trend_per_day)}
                  tone={directionTone(forecast.data.direction)}
                />
                <StatCard
                  label="جهتِ روند"
                  value={directionFa(forecast.data.direction)}
                  tone="neutral"
                  sub={`سابقهٔ ${forecast.data.history_days} روز`}
                />
              </StatGrid>
              <DataTable
                columns={forecastColumns}
                rows={forecast.data.points}
                rowKey={(r) => r.date}
                emptyMessage="دادهٔ تاریخیِ کافی برای پیش‌بینی وجود ندارد"
              />
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default function BiPage() {
  return (
    <RoleGuard permission="reports.dashboard.view">
      <BiInner />
    </RoleGuard>
  );
}
