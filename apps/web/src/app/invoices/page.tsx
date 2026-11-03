"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SalesGuard } from "@/components/auth/guards";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { formatMoney } from "@/lib/format";
import { toPersianDate } from "@/lib/date";

/**
 * فاکتورهای فروش — GET /invoices?status (تایپ‌شده از قرارداد).
 * جایگزین جدول ایستای پیشین. نام مشتری از GET /customers resolve می‌شود.
 * ستون moadian_status وضعیت ارسال به سامانه مؤدیان را نشان می‌دهد.
 */
type Invoice = components["schemas"]["Invoice"];
type Customer = components["schemas"]["Customer"];

const STATUS_FA: Record<string, string> = {
  draft: "پیش‌نویس",
  posted: "ثبت‌شده",
  partially_paid: "پرداخت جزئی",
  paid: "پرداخت‌شده",
  voided: "باطل‌شده",
};

const MOADIAN_FA: Record<string, string> = {
  not_sent: "ارسال‌نشده",
  queued: "در صف",
  sent: "ارسال‌شده",
  accepted: "پذیرفته",
  rejected: "ردشده",
  corrected: "اصلاح‌شده",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-surface-alt text-ink-muted",
  posted: "bg-info-soft text-info-ink",
  partially_paid: "bg-warning-soft text-warning-ink",
  paid: "bg-brand-soft text-brand-soft-ink",
  voided: "bg-danger-soft text-danger-ink",
};

const FILTERS = ["", "draft", "posted", "partially_paid", "paid", "voided"] as const;

function InvoicesInner() {
  const [status, setStatus] = useState<string>("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["invoices", status],
    queryFn: async () => {
      const query: { status?: string; limit?: number } = { limit: 100 };
      if (status) query.status = status;
      const res = await api.GET("/invoices", { params: { query } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Invoice[];
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

  const items = data ?? [];
  const customerName = (cid?: string) =>
    (customers.data ?? []).find((c) => c.id === cid)?.code ?? (cid ? cid.slice(0, 8) : "—");

  const columns: Column<Invoice>[] = [
    { key: "doc", header: "شمارهٔ فاکتور", render: (i) => <span className="font-mono text-xs">{i.doc_number ?? "—"}</span> },
    { key: "customer", header: "مشتری", render: (i) => customerName(i.customer_id) },
    { key: "date", header: "تاریخ", render: (i) => <span className="text-xs">{toPersianDate(i.invoice_date)}</span> },
    { key: "due", header: "سررسید", render: (i) => <span className="text-xs">{i.due_date ? toPersianDate(i.due_date) : "—"}</span> },
    { key: "total", header: "مبلغ کل", align: "end", render: (i) => <span className="font-medium">{formatMoney(i.grand_total)}</span> },
    { key: "paid", header: "پرداخت‌شده", align: "end", render: (i) => formatMoney(i.paid_amount) },
    {
      key: "status",
      header: "وضعیت",
      render: (i) => (
        <span className={`px-2 py-0.5 rounded-md text-xs ${STATUS_COLOR[i.status ?? ""] ?? ""}`}>
          {STATUS_FA[i.status ?? ""] ?? i.status}
        </span>
      ),
    },
    {
      key: "moadian",
      header: "مؤدیان",
      render: (i) => <span className="text-xs text-ink-muted">{i.moadian_status ? MOADIAN_FA[i.moadian_status] ?? i.moadian_status : "—"}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">فاکتورها</h1>
          <p className="text-ink-muted text-sm">فاکتورهای فروش، وضعیت پرداخت و ارسال مؤدیان</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer pe-8"
          >
            {FILTERS.map((s) => (
              <option key={s} value={s}>{s === "" ? "همهٔ وضعیت‌ها" : STATUS_FA[s]}</option>
            ))}
          </select>
          <ExportButtons data={items} tableId="invoices-table" filename="invoices" />
        </div>
      </div>

      <div id="invoices-table">
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(i) => i.id ?? i.doc_number ?? Math.random().toString()}
          loading={isLoading}
          error={error ? (error as Error).message : null}
          emptyMessage="فاکتوری یافت نشد"
        />
      </div>
    </div>
  );
}

export default function InvoicesPage() {
  return (
    <SalesGuard>
      <InvoicesInner />
    </SalesGuard>
  );
}
