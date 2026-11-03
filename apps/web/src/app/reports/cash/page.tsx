"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { ExportButtons } from "@/components/reports/ExportButtons";

/** شکل واقعی TreasuryPosition که GET /treasury برمی‌گرداند */
type TreasuryRow = {
  bank_account_id: string | null;
  title: string;
  balance_book: string;
  balance_actual: string | null;
  variance: string | null;
  as_of: string;
};

/** گزارش صندوق و بانک — GET /treasury?as_of (ماندهٔ دفتری/واقعی و مغایرت) */
export default function ReportsCashPage() {
  const [asOf, setAsOf] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["reports-cash", asOf],
    queryFn: async () => {
      const query: { as_of?: string } = {};
      if (asOf) query.as_of = asOf;
      const res = await api.GET("/treasury", { params: { query } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as TreasuryRow[];
    },
  });

  const items = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">گزارش صندوق و بانک</h1>
          <p className="text-ink-muted text-sm">ماندهٔ دفتری/واقعی و مغایرت هر حساب</p>
        </div>
        <ExportButtons data={items} tableId="cash-report-table" filename="cash-report" />
      </div>

      <div className="flex flex-wrap items-end gap-3 bg-surface border border-line rounded-2xl p-4">
        <div>
          <label className="block text-xs text-ink-muted mb-1">تاریخ (as of)</label>
          <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="px-3 py-2 rounded-xl border border-line bg-transparent text-ink" />
        </div>
        {asOf && <button onClick={() => setAsOf("")} className="px-3 py-2 rounded-xl border border-line text-sm text-ink-muted hover:bg-surface-hover">پاک کردن</button>}
      </div>

      {error && <div className="text-sm text-danger-ink bg-danger-soft border border-danger/25 rounded-lg px-3 py-2">{(error as Error).message}</div>}
      <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table id="cash-report-table" className="w-full text-sm">
            <thead className="bg-surface-alt text-ink-muted">
              <tr>
                <th className="text-right p-3">حساب</th>
                <th className="text-right p-3">مانده دفتری</th>
                <th className="text-right p-3">مانده واقعی</th>
                <th className="text-right p-3">مغایرت</th>
                <th className="text-right p-3">تاریخ</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={5} className="text-center p-6 text-ink-muted">در حال بارگذاری...</td></tr>}
              {!isLoading && items.length === 0 && <tr><td colSpan={5} className="text-center p-6 text-ink-subtle">داده‌ای برای نمایش نیست</td></tr>}
              {!isLoading && items.map((it, idx) => (
                <tr key={idx} className="border-t border-line hover:bg-surface-hover">
                  <td className="p-3">{it.title || "-"}</td>
                  <td className="p-3">{Number(it.balance_book || 0).toLocaleString("fa-IR")}</td>
                  <td className="p-3">{it.balance_actual != null ? Number(it.balance_actual).toLocaleString("fa-IR") : "-"}</td>
                  <td className="p-3">{it.variance != null ? Number(it.variance).toLocaleString("fa-IR") : "-"}</td>
                  <td className="p-3">{it.as_of || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
