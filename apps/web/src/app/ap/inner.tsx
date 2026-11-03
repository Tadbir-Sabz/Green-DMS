"use client";

import { useQuery } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { formatMoney, sumDecimal } from "@/lib/format";
import { toPersianDate } from "@/lib/date";

/**
 * حساب‌های پرداختنی — GET /ap (ماژول ۸).
 * ماندهٔ بدهکاری به هر تأمین‌کننده و نزدیک‌ترین سررسید.
 */
type SupplierBalance = components["schemas"]["SupplierBalance"];

export default function APInner() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["ap"],
    queryFn: async () => {
      const res = await api.GET("/ap", { params: { query: { limit: 200 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as SupplierBalance[];
    },
  });

  const items = data ?? [];
  const totalPayable = sumDecimal(items.map((r) => r.total_payable));

  const columns: Column<SupplierBalance>[] = [
    { key: "name", header: "تأمین‌کننده", render: (r) => r.supplier_name ?? "—" },
    {
      key: "due",
      header: "نزدیک‌ترین سررسید",
      render: (r) => (r.due_next ? toPersianDate(r.due_next) : "—"),
    },
    {
      key: "total",
      header: "ماندهٔ پرداختنی",
      align: "end",
      render: (r) => <span className="font-semibold">{formatMoney(r.total_payable)}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">حساب‌های پرداختنی</h1>
          <p className="text-ink-muted text-sm">
            ماندهٔ بدهکاری به تأمین‌کنندگان و سررسیدها
          </p>
        </div>
        <ExportButtons data={items} tableId="ap-table" filename="ap-balances" />
      </div>

      <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm">
        <div className="text-sm text-ink-muted">جمع کل پرداختنی</div>
        <div className="text-2xl font-bold text-ink mt-1">{formatMoney(totalPayable)}</div>
      </div>

      <div id="ap-table">
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(r) => r.supplier_person_id ?? Math.random().toString()}
          loading={isLoading}
          error={error ? (error as Error).message : null}
          emptyMessage="ماندهٔ پرداختنی برای نمایش نیست"
        />
      </div>
    </div>
  );
}
