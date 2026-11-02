"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { WarehouseGuard } from "@/components/auth/guards";
import { useToast } from "@/components/ui/Toast";
import { formatNumber } from "@/lib/format";

/**
 * انبارگردانی — GET /stocktakes?status (تایپ‌شده از قرارداد).
 * چرخهٔ سند: draft → counting → review → approved → posted.
 * دکمهٔ «پایان شمارش» POST /stocktakes/{id}/submit را صدا می‌زند (اعمال مغایرت‌ها).
 * دکمهٔ «انبارگردانی جدید» به /stock-count/new (POST /stocktakes) می‌برد.
 */
type StockTake = components["schemas"]["StockTake"];
type Warehouse = { id: string; code: string; name: string };

const STATUS_FA: Record<string, string> = {
  draft: "پیش‌نویس",
  counting: "شمارش",
  review: "بازبینی",
  approved: "تأیید شده",
  posted: "ثبت شده",
  voided: "باطل‌شده",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-[#1f2937] dark:text-slate-300",
  counting: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  review: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  approved: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  posted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  voided: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
};

function StockCountInner() {
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [version, setVersion] = useState(0);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["stocktakes", status, version],
    queryFn: async () => {
      const query: { status?: string; limit?: number } = { limit: 200 };
      if (status) query.status = status;
      const res = await api.GET("/stocktakes", { params: { query } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as StockTake[];
    },
  });

  const warehouses = useQuery({
    queryKey: ["warehouses-lookup"],
    queryFn: async () => {
      const res = await api.GET("/warehouses", { params: { query: { limit: 200 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Warehouse[];
    },
  });

  const whName = (id?: string) =>
    (warehouses.data ?? []).find((w) => w.id === id)?.name ?? (id ? id.slice(0, 8) : "—");

  const items = data ?? [];

  const submit = async (s: StockTake) => {
    if (!s.id) return;
    setSubmitting(s.id);
    const res = await api.POST("/stocktakes/{id}/submit", { params: { path: { id: s.id } } });
    setSubmitting(null);
    if (res.error) {
      toast.error(errorMessage(res.error));
      return;
    }
    toast.success("مغایرت‌ها اعمال و سند ثبت شد");
    setVersion((v) => v + 1);
  };

  // فقط اسناد در حال شمارش/بازبینی قابل پایان دادن‌اند
  const canSubmit = (s: StockTake) => s.status === "counting" || s.status === "review" || s.status === "draft";

  const columns: Column<StockTake>[] = [
    { key: "id", header: "شناسهٔ سند", render: (s) => <span className="font-mono text-xs">{s.id?.slice(0, 8) ?? "—"}</span> },
    { key: "warehouse", header: "انبار", render: (s) => whName(s.warehouse_id) },
    {
      key: "lines",
      header: "اقلام",
      align: "end",
      render: (s) => <span className="text-xs">{formatNumber((s.lines ?? []).length)} قلم</span>,
    },
    {
      key: "status",
      header: "وضعیت",
      render: (s) => (
        <span className={`px-2 py-0.5 rounded-md text-xs ${STATUS_COLOR[s.status ?? ""] ?? ""}`}>
          {STATUS_FA[s.status ?? ""] ?? s.status}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "end",
      render: (s) =>
        canSubmit(s) ? (
          <button
            onClick={() => submit(s)}
            disabled={submitting === s.id}
            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs"
          >
            {submitting === s.id ? "..." : "پایان شمارش"}
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">انبارگردانی</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">شمارش واقعی در برابر موجودی سیستم و اعمال مغایرت</p>
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
          <Link href="/stock-count/new" className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium">
            انبارگردانی جدید
          </Link>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(s) => s.id ?? Math.random().toString()}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        emptyMessage="سند انبارگردانی یافت نشد"
      />
    </div>
  );
}

export default function StockCountPage() {
  return (
    <WarehouseGuard>
      <StockCountInner />
    </WarehouseGuard>
  );
}
