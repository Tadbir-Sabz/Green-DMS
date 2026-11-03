"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { formatMoney, sumDecimal } from "@/lib/format";

/**
 * حساب‌های دریافتنی — GET /ar?as_of (ماژول ۷).
 * ماندهٔ بدهکاری هر مشتری با رده‌بندی سنی (جاری، ۱-۳۰، ۳۱-۶۰، ۶۱-۹۰، +۹۰ روز).
 * مبالغ رشتهٔ اعشاری‌اند؛ با formatMoney به ارقام فارسی نمایش داده می‌شوند.
 */
type ArAgingRow = components["schemas"]["ArAgingRow"];

export default function ARInner() {
  const [asOf, setAsOf] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["ar", asOf],
    queryFn: async () => {
      const query: { as_of?: string; limit?: number } = { limit: 200 };
      if (asOf) query.as_of = asOf;
      const res = await api.GET("/ar", { params: { query } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as ArAgingRow[];
    },
  });

  const items = data ?? [];
  const totalDue = sumDecimal(items.map((r) => r.total));
  const totalOver90 = sumDecimal(items.map((r) => r.over_90));

  const columns: Column<ArAgingRow>[] = [
    { key: "code", header: "کد مشتری", render: (r) => <span className="font-mono text-xs">{r.customer_code ?? "—"}</span> },
    { key: "name", header: "نام مشتری", render: (r) => r.customer_name ?? "—" },
    { key: "current", header: "جاری", align: "end", render: (r) => formatMoney(r.current) },
    { key: "d1_30", header: "۱-۳۰ روز", align: "end", render: (r) => formatMoney(r.d1_30) },
    { key: "d31_60", header: "۳۱-۶۰ روز", align: "end", render: (r) => formatMoney(r.d31_60) },
    { key: "d61_90", header: "۶۱-۹۰ روز", align: "end", render: (r) => formatMoney(r.d61_90) },
    {
      key: "over_90",
      header: "بیش از ۹۰ روز",
      align: "end",
      render: (r) => (
        <span className={Number(r.over_90) > 0 ? "text-danger-ink font-medium" : ""}>{formatMoney(r.over_90)}</span>
      ),
    },
    { key: "total", header: "جمع", align: "end", render: (r) => <span className="font-semibold">{formatMoney(r.total)}</span> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">حساب‌های دریافتنی</h1>
          <p className="text-ink-muted text-sm">
            ماندهٔ بدهکاری مشتریان با تحلیل سنی
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-44">
            <JalaliDatePicker value={asOf} onChange={setAsOf} placeholder="مانده تا تاریخ..." />
          </div>
          <ExportButtons data={items} tableId="ar-table" filename="ar-aging" />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm">
          <div className="text-sm text-ink-muted">جمع کل دریافتنی</div>
          <div className="text-2xl font-bold text-ink mt-1">{formatMoney(totalDue)}</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm">
          <div className="text-sm text-ink-muted">معوق بیش از ۹۰ روز</div>
          <div className="text-2xl font-bold text-danger-ink mt-1">{formatMoney(totalOver90)}</div>
        </div>
      </div>

      <div id="ar-table">
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(r) => r.customer_id ?? Math.random().toString()}
          loading={isLoading}
          error={error ? (error as Error).message : null}
          emptyMessage="مانده‌ای برای نمایش نیست"
        />
      </div>
    </div>
  );
}
