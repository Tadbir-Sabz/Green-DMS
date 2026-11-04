"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody, SectionTitle } from "@/components/ui/Card";
import { StatCard, StatGrid } from "@/components/ui/StatCard";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { SkeletonCard, ErrorState } from "@/components/ui/Feedback";
import { formatMoney, formatNumber } from "@/lib/format";

/**
 * داشبورد BI — لایهٔ بصری روی endpointهای ماژول BI:
 *   GET /bi/kpi?days=         → کارت‌های شاخص (فروش/وصولی/ماندهٔ AR/نرخ وصول)
 *   GET /bi/abc-customers     → جدولِ طبقه‌بندی ABC مشتریان
 *   GET /bi/abc-products      → جدولِ طبقه‌بندی ABC کالاها
 * دسترسی با reports.dashboard.view (هم‌راستا با منو و گاردِ سمتِ سرور).
 */

type BiKpi = components["schemas"]["BiKpi"];
type AbcResult = components["schemas"]["AbcResult"];
type AbcEntry = components["schemas"]["AbcEntry"];

const DAY_OPTIONS = [30, 90, 180] as const;
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="داشبورد BI"
        description="شاخص‌های کلانِ فروش و وصولی، و تحلیل ABC مشتریان و کالاها"
      />

      <div className="flex items-center gap-2">
        <span className="text-sm text-ink-muted">بازهٔ فروش/وصولی:</span>
        {DAY_OPTIONS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDays(d)}
            className={`focus-ring px-3 py-1.5 rounded-lg text-sm border ${
              days === d ? "border-brand text-brand-soft-ink" : "border-line"
            }`}
          >
            {d} روز
          </button>
        ))}
      </div>

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
