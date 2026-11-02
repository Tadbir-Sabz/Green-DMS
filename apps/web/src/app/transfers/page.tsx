"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { WarehouseGuard } from "@/components/auth/guards";
import { formatNumber } from "@/lib/format";

/**
 * انتقال بین‌انباری — GET /transfers (تایپ‌شده از قرارداد).
 * جایگزین برچسب خالیِ پیشین. نام انبار مبدا/مقصد از GET /warehouses resolve می‌شود.
 * دکمهٔ «انتقال جدید» به /transfers/new (که POST /transfers را صدا می‌زند) می‌برد.
 */
type Transfer = components["schemas"]["Transfer"];
type Warehouse = { id: string; code: string; name: string };

const STATUS_FA: Record<string, string> = {
  draft: "پیش‌نویس",
  approved: "تأیید شده",
  in_transit: "در حال انتقال",
  received: "تحویل‌شده",
  voided: "باطل‌شده",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-[#1f2937] dark:text-slate-300",
  approved: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  in_transit: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  received: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  voided: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
};

function TransfersInner() {
  const [status, setStatus] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["transfers"],
    queryFn: async () => {
      const res = await api.GET("/transfers", { params: { query: { limit: 200 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Transfer[];
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

  const all = data ?? [];
  const items = status ? all.filter((t) => t.status === status) : all;

  const columns: Column<Transfer>[] = [
    { key: "doc", header: "شماره", render: (t) => <span className="font-mono text-xs">{t.doc_number ?? "—"}</span> },
    { key: "from", header: "از انبار", render: (t) => whName(t.from_warehouse_id) },
    { key: "to", header: "به انبار", render: (t) => whName(t.to_warehouse_id) },
    {
      key: "lines",
      header: "اقلام",
      align: "end",
      render: (t) => <span className="text-xs">{formatNumber((t.lines ?? []).length)} قلم</span>,
    },
    {
      key: "status",
      header: "وضعیت",
      render: (t) => (
        <span className={`px-2 py-0.5 rounded-md text-xs ${STATUS_COLOR[t.status ?? ""] ?? ""}`}>
          {STATUS_FA[t.status ?? ""] ?? t.status}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">انتقال بین انباری</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">بارگیری خودرو و انتقال بین شعب</p>
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
          <Link href="/transfers/new" className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium">
            انتقال جدید
          </Link>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(t) => t.id ?? t.doc_number ?? Math.random().toString()}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        emptyMessage="انتقالی یافت نشد"
      />
    </div>
  );
}

export default function TransfersPage() {
  return (
    <WarehouseGuard>
      <TransfersInner />
    </WarehouseGuard>
  );
}
