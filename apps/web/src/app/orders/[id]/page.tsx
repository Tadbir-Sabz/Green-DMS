"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SalesGuard } from "@/components/auth/guards";
import { useToast } from "@/components/ui/Toast";
import { formatMoney } from "@/lib/format";
import { toPersianDate } from "@/lib/date";

/**
 * جزئیات سفارش فروش — GET /orders/{id} با اقلام و چرخهٔ تأیید.
 * دکمهٔ «تأیید» POST /orders/{id}/approve (از draft/pending_approval).
 * نام کالا/مشتری از GET /products و GET /customers resolve می‌شود (خط‌ها فقط id دارند).
 */
type SalesOrder = components["schemas"]["SalesOrder"];
type OrderLine = NonNullable<SalesOrder["lines"]>[number];
type Product = components["schemas"]["Product"];
type Customer = components["schemas"]["Customer"];

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

function OrderDetailInner() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [approving, setApproving] = useState(false);

  const order = useQuery({
    queryKey: ["order", id, version],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await api.GET("/orders/{id}", { params: { path: { id } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data as SalesOrder;
    },
  });

  const products = useQuery({
    queryKey: ["products-lookup"],
    queryFn: async () => {
      const res = await api.GET("/products", { params: { query: { limit: 500 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Product[];
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

  const o = order.data;
  const productName = (pid?: string) =>
    (products.data ?? []).find((p) => p.id === pid)?.name ?? (pid ? pid.slice(0, 8) : "—");
  const customerName = o?.customer_id
    ? (customers.data ?? []).find((c) => c.id === o.customer_id)?.code ?? o.customer_id.slice(0, 8)
    : "—";

  const approve = async () => {
    if (!o?.id) return;
    setApproving(true);
    const res = await api.POST("/orders/{id}/approve", { params: { path: { id: o.id } } });
    setApproving(false);
    if (res.error) {
      toast.error(errorMessage(res.error));
      return;
    }
    toast.success("سفارش تأیید شد");
    setVersion((v) => v + 1);
  };

  const canApprove = o?.status === "draft" || o?.status === "pending_approval";

  const lineColumns: Column<OrderLine>[] = [
    { key: "product", header: "کالا", render: (l) => productName(l.product_id) },
    { key: "qty", header: "تعداد", align: "end", render: (l) => formatMoney(l.qty) },
    { key: "price", header: "قیمت واحد", align: "end", render: (l) => formatMoney(l.unit_price) },
    { key: "discount", header: "تخفیف", align: "end", render: (l) => formatMoney(l.discount_amount) },
    {
      key: "tax",
      header: "مالیات",
      align: "end",
      render: (l) =>
        l.tax_rate_pct != null ? (
          <span>
            {formatMoney(l.tax_amount)}{" "}
            <span className="text-[10px] text-slate-400">({l.tax_rate_pct}٪)</span>
          </span>
        ) : (
          formatMoney(l.tax_amount)
        ),
    },
    { key: "total", header: "جمع قلم", align: "end", render: (l) => <span className="font-medium">{formatMoney(l.line_total)}</span> },
  ];

  if (order.isLoading) return <div className="p-6 text-slate-500">در حال بارگذاری...</div>;
  if (order.error)
    return (
      <div className="p-6">
        <div className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-lg px-3 py-2">
          {(order.error as Error).message}
        </div>
        <button onClick={() => router.back()} className="mt-4 text-sm text-emerald-700 hover:underline">
          بازگشت
        </button>
      </div>
    );
  if (!o) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button onClick={() => router.push("/orders")} className="text-xs text-slate-500 hover:text-emerald-700 mb-1">
            → بازگشت به سفارش‌ها
          </button>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            سفارش <span className="font-mono">{o.doc_number ?? o.id}</span>
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
            سال مالی {o.fiscal_year ?? "—"} · ثبت {toPersianDate(o.order_date)}
            {o.delivery_date ? ` · تحویل ${toPersianDate(o.delivery_date)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#1f2937] text-sm text-slate-700 dark:text-slate-200">
            {STATUS_FA[o.status ?? ""] ?? o.status}
          </span>
          {canApprove && (
            <button
              onClick={approve}
              disabled={approving}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium"
            >
              {approving ? "در حال تأیید..." : "تأیید سفارش"}
            </button>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-[#1f2937] rounded-2xl p-4 shadow-sm">
          <div className="text-sm text-slate-500 dark:text-slate-400">مشتری</div>
          <div className="font-semibold text-slate-900 dark:text-slate-100 mt-1">{customerName}</div>
        </div>
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-[#1f2937] rounded-2xl p-4 shadow-sm">
          <div className="text-sm text-slate-500 dark:text-slate-400">جمع جزء</div>
          <div className="font-semibold text-slate-900 dark:text-slate-100 mt-1">{formatMoney(o.subtotal)}</div>
        </div>
        <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-[#1f2937] rounded-2xl p-4 shadow-sm">
          <div className="text-sm text-slate-500 dark:text-slate-400">مالیات</div>
          <div className="font-semibold text-slate-900 dark:text-slate-100 mt-1">{formatMoney(o.tax_total)}</div>
        </div>
        <div className="bg-white dark:bg-[#111827] border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4 shadow-sm">
          <div className="text-sm text-slate-500 dark:text-slate-400">مبلغ کل</div>
          <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400 mt-1">{formatMoney(o.grand_total)}</div>
        </div>
      </div>

      {o.note && (
        <div className="bg-slate-50 dark:bg-[#0b1220] border border-slate-200 dark:border-[#1f2937] rounded-2xl p-4 text-sm text-slate-700 dark:text-slate-300">
          <span className="text-slate-500">یادداشت: </span>
          {o.note}
        </div>
      )}

      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">اقلام سفارش</h2>
        <DataTable
          columns={lineColumns}
          rows={(o.lines ?? []) as OrderLine[]}
          rowKey={(l) => `${l.product_id}-${Math.random()}`}
          emptyMessage="قلمی ثبت نشده است"
        />
      </div>
    </div>
  );
}

export default function OrderDetailPage() {
  return (
    <SalesGuard>
      <OrderDetailInner />
    </SalesGuard>
  );
}
