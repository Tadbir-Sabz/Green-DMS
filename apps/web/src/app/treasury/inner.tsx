"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { formatMoney, sumDecimal } from "@/lib/format";
import { toPersianDate } from "@/lib/date";

/**
 * خزانه‌داری — GET /treasury?as_of (ماژول ۱۰).
 * ماندهٔ دفتری و واقعی هر صندوق/حساب بانکی به‌همراه مغایرت باز برای رسیدگی.
 */
type TreasuryPosition = components["schemas"]["TreasuryPosition"];

export default function TreasuryInner() {
  const [asOf, setAsOf] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["treasury", asOf],
    queryFn: async () => {
      const query: { as_of?: string } = {};
      if (asOf) query.as_of = asOf;
      const res = await api.GET("/treasury", { params: { query } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as TreasuryPosition[];
    },
  });

  const items = data ?? [];
  const totalBook = sumDecimal(items.map((r) => r.balance_book));
  const totalVariance = sumDecimal(items.map((r) => r.variance));

  const columns: Column<TreasuryPosition>[] = [
    { key: "title", header: "صندوق / حساب", render: (r) => r.title ?? "—" },
    { key: "as_of", header: "تاریخ", render: (r) => toPersianDate(r.as_of) },
    { key: "book", header: "ماندهٔ دفتری", align: "end", render: (r) => formatMoney(r.balance_book) },
    {
      key: "actual",
      header: "ماندهٔ واقعی",
      align: "end",
      render: (r) => (r.balance_actual != null ? formatMoney(r.balance_actual) : "—"),
    },
    {
      key: "variance",
      header: "مغایرت",
      align: "end",
      render: (r) => {
        const v = Number(r.variance ?? 0);
        const cls = v > 0 ? "text-rose-600 font-medium" : v < 0 ? "text-amber-600" : "text-slate-400";
        return <span className={cls}>{r.variance != null ? formatMoney(r.variance) : "—"}</span>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">خزانه‌داری</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            ماندهٔ صندوق و بانک‌ها به‌همراه مغایرت‌گیری
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-44">
            <JalaliDatePicker value={asOf} onChange={setAsOf} placeholder="مانده تا تاریخ..." />
          </div>
          <ExportButtons data={items} tableId="treasury-table" filename="treasury" />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-[#1f2937] rounded-2xl p-4 shadow-sm">
          <div className="text-sm text-slate-500 dark:text-slate-400">جمع ماندهٔ دفتری</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{formatMoney(totalBook)}</div>
        </div>
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-[#1f2937] rounded-2xl p-4 shadow-sm">
          <div className="text-sm text-slate-500 dark:text-slate-400">جمع مغایرت باز</div>
          <div className={`text-2xl font-bold mt-1 ${totalVariance !== 0 ? "text-rose-600" : "text-slate-900 dark:text-slate-100"}`}>
            {formatMoney(totalVariance)}
          </div>
        </div>
      </div>

      <div id="treasury-table">
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(r) => r.bank_account_id ?? r.title ?? Math.random().toString()}
          loading={isLoading}
          error={error ? (error as Error).message : null}
          emptyMessage="موقعیت خزانه‌ای برای نمایش نیست"
        />
      </div>
    </div>
  );
}
