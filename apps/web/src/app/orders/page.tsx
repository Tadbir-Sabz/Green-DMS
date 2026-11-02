"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SalesGuard } from "@/components/auth/guards";
import { useToast } from "@/components/ui/Toast";
import { formatMoney } from "@/lib/format";
import { toPersianDate } from "@/lib/date";

/**
 * سفارش‌های فروش — GET /orders?status (تایپ‌شده از قرارداد) با چرخهٔ تأیید.
 * جایگزین نسخهٔ پیشین که از هوک loose و `(data as any)` استفاده می‌کرد.
 * دکمهٔ «تأیید» POST /orders/{id}/approve را صدا می‌زند (از draft/pending_approval).
 */
type SalesOrder = components["schemas"]["SalesOrder"];

const STATUS_FA: Record<string, string> = {
  draft: "پیش‌نویس",
  pending_approval: "در انتظار تأیید",
  approved: "تأیید شده",
  partially_delivered: "تحویل جزئی",
  delivered: "تحویل شده",
  invoiced: "فاکتور شده",
  cancelled: "لغو شده",
  rejected: "رد شده",
};

const STATUS_FILTERS = ["", "draft", "pending_approval", "approved", "delivered", "invoiced"] as const;

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600 dark:bg-[#1f2937] dark:text-slate-300",
  pending_approval: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  delivered: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  invoiced: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  cancelled: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  rejected: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
};

function OrdersInner() {
  const toast = useToast();
  const [status, setStatus] = useState<string>("");
  const [version, setVersion] = useState(0);
  const [approving, setApproving] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["orders", status, version],
    queryFn: async () => {
      const query: { status?: string; limit?: number } = { limit: 100 };
      if (status) query.status = status;
      const res = await api.GET("/orders", { params: { query } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as SalesOrder[];
    },
  });

  const items = data ?? [];

  const approve = async (o: SalesOrder) => {
    if (!o.id) return;
    setApproving(o.id);
    const res = await api.POST("/orders/{id}/approve", { params: { path: { id: o.id } } });
    setApproving(null);
    if (res.error) {
      toast.error(errorMessage(res.error));
      return;
    }
    toast.success(`سفارش ${o.doc_number ?? ""} تأیید شد`);
    setVersion((v) => v + 1);
  };

  const canApprove = (o: SalesOrder) => o.status === "draft" || o.status === "pending_approval";

  const columns: Column<SalesOrder>[] = [
    {
      key: "doc",
      header: "شماره",
      render: (o) => (
        <Link href={`/orders/${o.id}`} className="font-mono text-xs text-emerald-700 dark:text-emerald-400 hover:underline">
          {o.doc_number ?? "—"}
        </Link>
      ),
    },
    { key: "date", header: "تاریخ", render: (o) => <span className="text-xs">{toPersianDate(o.order_date)}</span> },
    { key: "channel", header: "کانال", render: (o) => <span className="text-xs">{o.channel ?? "—"}</span> },
    { key: "total", header: "مبلغ کل", align: "end", render: (o) => <span className="font-medium">{formatMoney(o.grand_total)}</span> },
    {
      key: "status",
      header: "وضعیت",
      render: (o) => (
        <span className={`px-2 py-0.5 rounded-md text-xs ${STATUS_COLOR[o.status ?? ""] ?? "bg-slate-100 text-slate-600"}`}>
          {STATUS_FA[o.status ?? ""] ?? o.status}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "end",
      render: (o) =>
        canApprove(o) ? (
          <button
            onClick={() => approve(o)}
            disabled={approving === o.id}
            className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs"
          >
            {approving === o.id ? "..." : "تأیید"}
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">سفارش‌های فروش</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">چرخهٔ سفارش از ثبت تا تأیید و فاکتور</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-[#1f2937] bg-white dark:bg-[#0f172a] text-sm text-slate-800 dark:text-slate-200"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s === "" ? "همهٔ وضعیت‌ها" : STATUS_FA[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(o) => o.id ?? o.doc_number ?? Math.random().toString()}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        emptyMessage="سفارشی یافت نشد"
      />
    </div>
  );
}

export default function OrdersPage() {
  return (
    <SalesGuard>
      <OrdersInner />
    </SalesGuard>
  );
}
