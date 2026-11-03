"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { ExportButtons } from "@/components/reports/ExportButtons";

type ReportColumn = { key?: string; title?: string };
type ReportResult = { columns?: ReportColumn[]; rows?: Record<string, unknown>[] };

/**
 * ReportRunner — اجرای گزارش از GET /reports/{key}?from&to&format=json.
 * ستون‌ها سمت سرور تعریف می‌شوند (report-registry) پس وب نیازی به hardcode
 * شکل داده ندارد. فیلتر بازهٔ تاریخ + خروجی Excel/PDF دارد.
 */
export function ReportRunner({
  reportKey,
  title,
  subtitle,
  filename,
}: {
  reportKey: string;
  title: string;
  subtitle?: string;
  filename: string;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const tableId = `${filename}-table`;

  const { data, isLoading, error } = useQuery({
    queryKey: ["report", reportKey, from, to],
    queryFn: async () => {
      const query: { from?: string; to?: string; format: "json" } = { format: "json" };
      if (from) query.from = from;
      if (to) query.to = to;
      const res = await api.GET("/reports/{key}", {
        params: { path: { key: reportKey }, query },
      });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data ?? { columns: [], rows: [] }) as ReportResult;
    },
  });

  const columns = data?.columns ?? [];
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">{title}</h1>
          {subtitle && <p className="text-ink-muted text-sm">{subtitle}</p>}
        </div>
        <ExportButtons data={rows} tableId={tableId} filename={filename} />
      </div>

      {/* فیلتر بازهٔ تاریخ */}
      <div className="flex flex-wrap items-end gap-3 bg-surface border border-line rounded-2xl p-4">
        <div>
          <label className="block text-xs text-ink-muted mb-1">از تاریخ</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 rounded-xl border border-line bg-transparent text-ink" />
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">تا تاریخ</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 rounded-xl border border-line bg-transparent text-ink" />
        </div>
        {(from || to) && (
          <button onClick={() => { setFrom(""); setTo(""); }} className="px-3 py-2 rounded-xl border border-line text-sm text-ink-muted hover:bg-surface-hover">
            پاک کردن فیلتر
          </button>
        )}
      </div>

      {error && <div className="text-sm text-danger-ink bg-danger-soft border border-danger/25 rounded-lg px-3 py-2">{(error as Error).message}</div>}

      <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table id={tableId} className="w-full text-sm">
            <thead className="bg-surface-alt text-ink-muted">
              <tr>
                {columns.map((c, i) => (
                  <th key={c.key ?? i} className="text-right p-3 font-medium whitespace-nowrap">{c.title ?? c.key ?? ""}</th>
                ))}
                {columns.length === 0 && <th className="text-right p-3 font-medium">—</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={Math.max(columns.length, 1)} className="text-center p-6 text-ink-muted">در حال بارگذاری...</td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={Math.max(columns.length, 1)} className="text-center p-6 text-ink-subtle">داده‌ای برای نمایش نیست</td></tr>
              )}
              {!isLoading && rows.map((row, ridx) => (
                <tr key={ridx} className="border-t border-line hover:bg-surface-hover">
                  {columns.map((c, cidx) => {
                    const v = c.key ? row[c.key] : "";
                    const numeric = typeof v === "number" || (typeof v === "string" && v !== "" && !Number.isNaN(Number(v)));
                    return (
                      <td key={c.key ?? cidx} className="p-3 whitespace-nowrap">
                        {numeric ? Number(v).toLocaleString("fa-IR") : (v == null || v === "" ? "-" : String(v))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
