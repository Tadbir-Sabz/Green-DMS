"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SalesGuard } from "@/components/auth/guards";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { useToast } from "@/components/ui/Toast";
import { toPersianDate } from "@/lib/date";

/**
 * درخواست‌های مشتری و تبدیل به سفارش — چرخهٔ عمر سند.
 *  - GET /requests?status&channel  → فهرست درخواست‌ها
 *  - POST /requests/{id}/convert   → تبدیل درخواست ثبت‌شده به سفارش فروش (SalesOrder)
 *
 * این صفحه حلقهٔ خالیِ «درخواست → سفارش» را کامل می‌کند (سایر اقدامات چرخهٔ عمر
 * مانند approve/decision/submit/receive در صفحات orders/approvals/stock-count/returns
 * از قبل سیم‌کشی شده‌اند). پس از تبدیل موفق، کاربر به صفحهٔ جزئیات سفارش تازه می‌رود.
 */
type CustomerRequest = components["schemas"]["CustomerRequest"];
type SalesOrder = components["schemas"]["SalesOrder"];
type Customer = { id: string; code?: string };

const CHANNEL_FA: Record<string, string> = {
  field: "میدانی",
  telesale: "تلفنی",
  portal: "پورتال",
  walk_in: "حضوری",
};

const STATUS_FA: Record<string, string> = {
  draft: "پیش‌نویس",
  submitted: "ثبت‌شده",
  converted: "تبدیل‌شده",
  rejected: "ردشده",
  cancelled: "لغوشده",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-surface-alt text-ink-muted",
  submitted: "bg-info-soft text-info-ink",
  converted: "bg-brand-soft text-brand-soft-ink",
  rejected: "bg-danger-soft text-danger-ink",
  cancelled: "bg-surface-alt text-ink-muted",
};

function RequestsInner() {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [channel, setChannel] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["requests", status, channel],
    queryFn: async () => {
      const query: { status?: string; channel?: CustomerRequest["channel"]; limit?: number } = { limit: 200 };
      if (status) query.status = status;
      if (channel) query.channel = channel as CustomerRequest["channel"];
      const res = await api.GET("/requests", { params: { query } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as CustomerRequest[];
    },
  });

  const customers = useQuery({
    queryKey: ["customers-lookup"],
    queryFn: async () => {
      const res = await api.GET("/customers", { params: { query: { limit: 500 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Customer[];
    },
  });

  const customerLabel = (id?: string | null) => {
    if (!id) return "—";
    const c = (customers.data ?? []).find((x) => x.id === id);
    return c?.code ? <span className="font-mono text-xs">{c.code}</span> : <span className="font-mono text-xs">{id.slice(0, 8)}</span>;
  };

  const convert = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.POST("/requests/{id}/convert", { params: { path: { id } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data as SalesOrder;
    },
    onSuccess: (order) => {
      void qc.invalidateQueries({ queryKey: ["requests"] });
      toast.success("درخواست به سفارش فروش تبدیل شد");
      if (order?.id) router.push(`/orders/${order.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const items = data ?? [];

  const columns: Column<CustomerRequest>[] = [
    { key: "customer", header: "مشتری", render: (r) => customerLabel(r.customer_id) },
    { key: "channel", header: "کانال", render: (r) => <span className="text-xs">{CHANNEL_FA[r.channel ?? ""] ?? r.channel ?? "—"}</span> },
    { key: "date", header: "تاریخ درخواست", render: (r) => <span className="text-xs">{toPersianDate(r.request_date)}</span> },
    { key: "delivery", header: "تحویل درخواستی", render: (r) => <span className="text-xs">{r.requested_delivery_date ? toPersianDate(r.requested_delivery_date) : "—"}</span> },
    { key: "note", header: "یادداشت", render: (r) => <span className="text-xs text-ink-muted truncate max-w-[220px] inline-block">{r.note ?? "—"}</span> },
    {
      key: "status",
      header: "وضعیت",
      render: (r) => (
        <span className={`px-2 py-0.5 rounded-md text-xs ${STATUS_COLOR[r.status ?? ""] ?? ""}`}>
          {STATUS_FA[r.status ?? ""] ?? r.status}
        </span>
      ),
    },
    {
      key: "action",
      header: "عملیات",
      render: (r) => {
        if (r.status === "converted" && r.sales_order_id) {
          return (
            <Link href={`/orders/${r.sales_order_id}`} className="text-xs text-brand-soft-ink hover:underline">
              مشاهدهٔ سفارش
            </Link>
          );
        }
        if (r.status === "submitted" && r.id) {
          return (
            <button
              onClick={() => convert.mutate(r.id!)}
              disabled={convert.isPending}
              className="px-2.5 py-1 rounded-lg bg-brand hover:bg-brand-hover disabled:opacity-40 text-white text-xs font-medium"
            >
              {convert.isPending && convert.variables === r.id ? "در حال تبدیل..." : "تبدیل به سفارش"}
            </button>
          );
        }
        return <span className="text-xs text-ink-subtle">—</span>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">درخواست‌های مشتری</h1>
          <p className="text-ink-muted text-sm">
            درخواست‌های میدانی/تلفنی/پورتال پیش از سفارش — تبدیل درخواست ثبت‌شده به سفارش فروش
          </p>
        </div>
        <ExportButtons data={items} tableId="requests-table" filename="requests" />
      </div>

      <div className="flex flex-wrap items-end gap-3 bg-surface border border-line rounded-2xl p-4">
        <div>
          <label className="block text-xs text-ink-muted mb-1">وضعیت</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer pe-8"
          >
            <option value="">همه</option>
            {Object.entries(STATUS_FA).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">کانال</label>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer pe-8"
          >
            <option value="">همه</option>
            {Object.entries(CHANNEL_FA).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        {(status || channel) && (
          <button
            onClick={() => { setStatus(""); setChannel(""); }}
            className="px-3 py-2 rounded-xl border border-line-strong text-sm text-ink-muted hover:bg-surface-hover"
          >
            پاک کردن فیلترها
          </button>
        )}
      </div>

      <div id="requests-table">
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(r) => r.id ?? Math.random().toString()}
          loading={isLoading}
          error={error ? (error as Error).message : null}
          emptyMessage="درخواستی یافت نشد"
        />
      </div>
    </div>
  );
}

export default function RequestsPage() {
  return (
    <SalesGuard>
      <RequestsInner />
    </SalesGuard>
  );
}
