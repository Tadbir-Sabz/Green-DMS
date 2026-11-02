"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { WarehouseGuard } from "@/components/auth/guards";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { toPersianDate, toPersianDateTime } from "@/lib/date";

/**
 * حوالهٔ فروش / وضعیت توزیع — GET /deliveries (تایپ‌شده از قرارداد).
 * جایگزین برچسب خالیِ پیشین. هر ردیف وضعیت تحویل یک حواله را با مدرک تحویل (POD)
 * نشان می‌دهد. شمارهٔ حواله از GET /waybills و نام موزع از GET /staff resolve می‌شود.
 */
type Delivery = components["schemas"]["Delivery"];
type Waybill = { id: string; doc_number?: string };
type Staff = { id: string; person_id?: string; employee_no?: string | null };

const STATUS_FA: Record<string, string> = {
  planned: "برنامه‌ریزی‌شده",
  dispatched: "ارسال‌شده",
  delivered: "تحویل‌شده",
  partial: "تحویل جزئی",
  failed: "ناموفق",
  cancelled: "لغوشده",
};

const STATUS_COLOR: Record<string, string> = {
  planned: "bg-slate-100 text-slate-600 dark:bg-[#1f2937] dark:text-slate-300",
  dispatched: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  delivered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  failed: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  cancelled: "bg-slate-100 text-slate-500 dark:bg-[#1f2937] dark:text-slate-400",
};

function IssuesInner() {
  const [status, setStatus] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["deliveries", status],
    queryFn: async () => {
      const query: { status?: Delivery["status"]; limit?: number } = { limit: 200 };
      if (status) query.status = status as Delivery["status"];
      const res = await api.GET("/deliveries", { params: { query } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Delivery[];
    },
  });

  const waybills = useQuery({
    queryKey: ["waybills-lookup"],
    queryFn: async () => {
      const res = await api.GET("/waybills", { params: { query: { limit: 500 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Waybill[];
    },
  });

  const staff = useQuery({
    queryKey: ["staff-lookup"],
    queryFn: async () => {
      const res = await api.GET("/staff", { params: { query: { limit: 500 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Staff[];
    },
  });

  const waybillLabel = (id?: string | null) => {
    if (!id) return "—";
    const w = (waybills.data ?? []).find((x) => x.id === id);
    return w?.doc_number ? <span className="font-mono text-xs">{w.doc_number}</span> : <span className="font-mono text-xs">{id.slice(0, 8)}</span>;
  };

  const staffLabel = (id?: string | null) => {
    if (!id) return "—";
    const s = (staff.data ?? []).find((x) => x.id === id);
    return s?.employee_no ? `#${s.employee_no}` : id.slice(0, 8);
  };

  const items = data ?? [];

  const columns: Column<Delivery>[] = [
    { key: "doc", header: "شماره", render: (d) => <span className="font-mono text-xs">{d.doc_number ?? "—"}</span> },
    { key: "waybill", header: "حواله", render: (d) => waybillLabel(d.waybill_id) },
    { key: "courier", header: "موزع", render: (d) => <span className="text-xs">{staffLabel(d.courier_staff_id)}</span> },
    { key: "planned", header: "تاریخ برنامه", render: (d) => <span className="text-xs">{toPersianDate(d.planned_date)}</span> },
    {
      key: "status",
      header: "وضعیت",
      render: (d) => (
        <span className={`px-2 py-0.5 rounded-md text-xs ${STATUS_COLOR[d.status ?? ""] ?? ""}`}>
          {STATUS_FA[d.status ?? ""] ?? d.status}
        </span>
      ),
    },
    { key: "delivered", header: "تحویل در", render: (d) => <span className="text-xs">{d.delivered_at ? toPersianDateTime(d.delivered_at) : "—"}</span> },
    { key: "receiver", header: "تحویل‌گیرنده", render: (d) => <span className="text-xs">{d.receiver_name ?? "—"}</span> },
    {
      key: "pod",
      header: "مدرک تحویل",
      render: (d) => (
        <span className="flex items-center gap-2 text-xs">
          {d.signature_url ? (
            <a href={d.signature_url} target="_blank" rel="noreferrer" className="text-emerald-700 dark:text-emerald-400 hover:underline">امضا</a>
          ) : (
            <span className="text-slate-400">امضا —</span>
          )}
          {d.photo_url ? (
            <a href={d.photo_url} target="_blank" rel="noreferrer" className="text-emerald-700 dark:text-emerald-400 hover:underline">عکس</a>
          ) : (
            <span className="text-slate-400">عکس —</span>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">حواله‌های فروش</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">پیگیری توزیع و مدرک تحویل (POD) هر حواله</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-[#1f2937] bg-white dark:bg-[#0f172a] text-sm text-slate-800 dark:text-slate-200"
          >
            <option value="">همهٔ وضعیت‌ها</option>
            {Object.entries(STATUS_FA).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <ExportButtons data={items} tableId="issues-table" filename="deliveries" />
        </div>
      </div>

      <div id="issues-table">
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(d) => d.id ?? d.doc_number ?? Math.random().toString()}
          loading={isLoading}
          error={error ? (error as Error).message : null}
          emptyMessage="حواله‌ای یافت نشد"
        />
      </div>
    </div>
  );
}

export default function IssuesPage() {
  return (
    <WarehouseGuard>
      <IssuesInner />
    </WarehouseGuard>
  );
}
