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
  draft: "bg-surface-alt text-ink-muted",
  pending_approval: "bg-warning-soft text-warning-ink",
  approved: "bg-brand-soft text-brand-soft-ink",
  delivered: "bg-info-soft text-info-ink",
  invoiced: "bg-info-soft text-info-ink",
  cancelled: "bg-danger-soft text-danger-ink",
  rejected: "bg-danger-soft text-danger-ink",
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
        <Link href={`/orders/${o.id}`} className="font-mono text-xs text-brand-soft-ink hover:underline">
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
        <span className={`px-2 py-0.5 rounded-md text-xs ${STATUS_COLOR[o.status ?? ""] ?? "bg-surface-alt text-ink-muted"}`}>
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
            className="px-2.5 py-1 rounded-lg bg-brand hover:bg-brand-hover disabled:opacity-50 text-white text-xs"
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
          <h1 className="text-xl font-bold text-ink">سفارش‌های فروش</h1>
          <p className="text-ink-muted text-sm">چرخهٔ سفارش از ثبت تا تأیید و فاکتور</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="px-3 py-2 rounded-xl border border-line-strong bg-surface text-sm text-ink"
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
