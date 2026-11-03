"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import AdminGuard from "@/components/auth/guards";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { formatNumber } from "@/lib/format";

/**
 * لیست‌های قیمت — GET /price-lists (تایپ‌شده از قرارداد).
 * جایگزین برچسب خالیِ پیشین. قیمت مشتری‌محور در `customer_price` اولویت دارد؛
 * این صفحه فهرست لیست‌ها به‌همراه تعداد اقلام و وضعیت فعال بودن را نشان می‌دهد.
 */
type PriceList = components["schemas"]["PriceList"];

const KIND_FA: Record<string, string> = {
  general: "عمومی",
  wholesale: "عمده‌فروشی",
  retail: "خرده‌فروشی",
  chain: "زنجیره‌ای",
  cooperative: "تعاونی",
  channel: "کانالی",
};

function PricesInner() {
  const [kind, setKind] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["price-lists"],
    queryFn: async () => {
      const res = await api.GET("/price-lists", { params: { query: { limit: 200 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as PriceList[];
    },
  });

  const all = data ?? [];
  const items = kind ? all.filter((p) => p.kind === kind) : all;

  const columns: Column<PriceList>[] = [
    { key: "code", header: "کد", render: (p) => <span className="font-mono text-xs">{p.code ?? "—"}</span> },
    { key: "title", header: "عنوان", render: (p) => <span className="text-sm">{p.title ?? "—"}</span> },
    { key: "kind", header: "نوع", render: (p) => <span className="text-xs">{KIND_FA[p.kind ?? ""] ?? p.kind ?? "—"}</span> },
    { key: "currency", header: "واحد پول", render: (p) => <span className="text-xs">{p.currency ?? "IRR"}</span> },
    {
      key: "items",
      header: "اقلام",
      align: "end",
      render: (p) => <span className="text-xs">{formatNumber((p.items ?? []).length)} قلم</span>,
    },
    {
      key: "active",
      header: "وضعیت",
      render: (p) =>
        p.is_active ? (
          <span className="px-2 py-0.5 rounded-md text-xs bg-brand-soft text-brand-soft-ink">فعال</span>
        ) : (
          <span className="px-2 py-0.5 rounded-md text-xs bg-surface-alt text-ink-muted">غیرفعال</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">لیست‌های قیمت</h1>
          <p className="text-ink-muted text-sm">قیمت‌گذاری کالاها به تفکیک نوع مشتری؛ قیمت مشتری‌محور اولویت دارد</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer pe-8"
          >
            <option value="">همهٔ انواع</option>
            {Object.entries(KIND_FA).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <ExportButtons data={items} tableId="prices-table" filename="price-lists" />
        </div>
      </div>

      <div id="prices-table">
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(p) => p.id ?? p.code ?? Math.random().toString()}
          loading={isLoading}
          error={error ? (error as Error).message : null}
          emptyMessage="لیست قیمتی یافت نشد"
        />
      </div>
    </div>
  );
}

export default function PricesPage() {
  return (
    <AdminGuard>
      <PricesInner />
    </AdminGuard>
  );
}
