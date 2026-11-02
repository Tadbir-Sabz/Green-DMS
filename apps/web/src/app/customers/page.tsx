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
 * مشتریان — GET /customers?q&channel (تایپ‌شده از قرارداد).
 * جایگزین نسخهٔ پیشین با هوک loose و `(data as any)?.items`.
 * سقف اعتبار، کانال فروش و وضعیت مشتری نمایش داده می‌شود.
 */
type Customer = components["schemas"]["Customer"];

const STATUS_FA: Record<string, string> = {
  active: "فعال",
  suspended: "تعلیق",
  blocked: "مسدود",
  closed: "بسته",
};

const STATUS_COLOR: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  suspended: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  blocked: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  closed: "bg-slate-100 text-slate-600 dark:bg-[#1f2937] dark:text-slate-300",
};

const CHANNEL_FA: Record<string, string> = {
  cold: "سرد",
  warm: "گرم",
  both: "سرد و گرم",
  field: "میدانی",
  telesale: "تلفنی",
  portal: "پورتال",
};

function CustomersInner() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["customers", search],
    queryFn: async () => {
      const query: { q?: string; limit?: number } = { limit: 200 };
      if (search) query.q = search;
      const res = await api.GET("/customers", { params: { query } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Customer[];
    },
  });

  const items = data ?? [];

  const columns: Column<Customer>[] = [
    { key: "code", header: "کد", render: (c) => <span className="font-mono text-xs">{c.code ?? "—"}</span> },
    { key: "channel", header: "کانال", render: (c) => <span className="text-xs">{c.channel ? CHANNEL_FA[c.channel] ?? c.channel : "—"}</span> },
    {
      key: "credit",
      header: "سقف اعتبار",
      align: "end",
      render: (c) => (c.credit_limit != null ? formatMoney(c.credit_limit) : "—"),
    },
    {
      key: "geo",
      header: "موقعیت",
      render: (c) =>
        c.geo ? (
          <span className="text-xs text-emerald-600">ثبت‌شده</span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    { key: "created", header: "تاریخ ایجاد", render: (c) => <span className="text-xs">{toPersianDate(c.created_at)}</span> },
    {
      key: "status",
      header: "وضعیت",
      render: (c) => (
        <span className={`px-2 py-0.5 rounded-md text-xs ${STATUS_COLOR[c.status ?? ""] ?? ""}`}>
          {STATUS_FA[c.status ?? ""] ?? c.status}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">مشتریان</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">پروفایل، اعتبار، کانال و موقعیت مشتریان</p>
        </div>
        <div className="flex items-center gap-2">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(q);
            }}
          >
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جست‌وجوی مشتری..."
              className="px-3 py-2 rounded-xl border border-slate-300 dark:border-[#1f2937] bg-white dark:bg-[#0f172a] text-sm text-slate-900 dark:text-slate-100"
            />
          </form>
          <ExportButtons data={items} tableId="customers-table" filename="customers" />
        </div>
      </div>

      <div id="customers-table">
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(c) => c.id ?? c.code ?? Math.random().toString()}
          loading={isLoading}
          error={error ? (error as Error).message : null}
          emptyMessage="مشتری یافت نشد"
        />
      </div>
    </div>
  );
}

export default function CustomersPage() {
  return (
    <SalesGuard>
      <CustomersInner />
    </SalesGuard>
  );
}
