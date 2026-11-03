"use client";

import { useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { ExportButtons } from "@/components/reports/ExportButtons";

/** شکل واقعی StockBalanceRow که GET /stock برمی‌گرداند */
type StockRow = {
  warehouse_id: string;
  product_id: string;
  batch_id: string | null;
  qty_on_hand: number;
  qty_reserved: number;
  qty_available: number;
  qty_on_hand_value: string | null;
};

/** گزارش موجودی — GET /stock (ماندهٔ قابل رزرو هر انبار/کالا/بچ) */
export default function ReportsInventoryPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["reports-inventory"],
    queryFn: async () => {
      const res = await api.GET("/stock", { params: { query: { limit: 200 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as StockRow[];
    },
  });

  const items = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">گزارش موجودی</h1>
          <p className="text-ink-muted text-sm">ماندهٔ انبار به تفکیک انبار/کالا/بچ</p>
        </div>
        <ExportButtons data={items} tableId="inventory-report-table" filename="inventory-report" />
      </div>
      {error && <div className="text-sm text-danger-ink bg-danger-soft border border-danger-line rounded-lg px-3 py-2">{(error as Error).message}</div>}
      <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table id="inventory-report-table" className="w-full text-sm">
            <thead className="bg-surface-alt text-ink-muted">
              <tr>
                <th className="text-right p-3">انبار</th>
                <th className="text-right p-3">کالا</th>
                <th className="text-right p-3">بچ</th>
                <th className="text-right p-3">موجودی</th>
                <th className="text-right p-3">رزرو</th>
                <th className="text-right p-3">آزاد</th>
                <th className="text-right p-3">ارزش موجودی</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="text-center p-6 text-ink-muted">در حال بارگذاری...</td></tr>}
              {!isLoading && items.length === 0 && <tr><td colSpan={7} className="text-center p-6 text-ink-subtle">داده‌ای برای نمایش نیست</td></tr>}
              {!isLoading && items.map((it, idx) => (
                <tr key={idx} className="border-t border-line hover:bg-surface-hover">
                  <td className="p-3 font-mono text-xs" title={it.warehouse_id}>{it.warehouse_id.slice(0, 8)}</td>
                  <td className="p-3 font-mono text-xs" title={it.product_id}>{it.product_id.slice(0, 8)}</td>
                  <td className="p-3 font-mono text-xs">{it.batch_id ? it.batch_id.slice(0, 8) : "-"}</td>
                  <td className="p-3">{Number(it.qty_on_hand || 0).toLocaleString("fa-IR")}</td>
                  <td className="p-3">{Number(it.qty_reserved || 0).toLocaleString("fa-IR")}</td>
                  <td className="p-3 font-medium">{Number(it.qty_available || 0).toLocaleString("fa-IR")}</td>
                  <td className="p-3">{it.qty_on_hand_value ? Number(it.qty_on_hand_value).toLocaleString("fa-IR") : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
