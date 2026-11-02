"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ExportButtons } from "@/components/reports/ExportButtons";

export default function ReportsInventoryPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["reports-inventory"],
    queryFn: async () => {
      try {
        const res = await (api as any).GET?.("/stock", {} as any);
        return (res as any)?.data || res;
      } catch {
        return null;
      }
    },
  });

  const items = (data as any)?.items || (Array.isArray(data) ? data : []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">گزارش موجودی</h1>
          <p className="text-slate-500 text-sm">موجودی انبار با قابلیت فیلتر و خروجی</p>
        </div>
        <ExportButtons data={items} tableId="inventory-report-table" filename="inventory-report" />
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table id="inventory-report-table" className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-right p-3">انبار</th>
                <th className="text-right p-3">کد کالا</th>
                <th className="text-right p-3">نام کالا</th>
                <th className="text-right p-3">بچ</th>
                <th className="text-right p-3">موجودی</th>
                <th className="text-right p-3">رزرو</th>
                <th className="text-right p-3">آزاد</th>
                <th className="text-right p-3">واحد</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={8} className="text-center p-6 text-slate-500">
                    در حال بارگذاری...
                  </td>
                </tr>
              )}
              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center p-6 text-slate-500">
                    آماده اتصال به API
                  </td>
                </tr>
              )}
              {items.map((it: any, idx: number) => {
                const onHand = Number(it.qty_on_hand || 0);
                const reserved = Number(it.qty_reserved || 0);
                const free = onHand - reserved;
                return (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-3">{it.warehouse_name || it.warehouse?.name || it.warehouse_id}</td>
                    <td className="p-3">{it.product_code || it.product?.code || "-"}</td>
                    <td className="p-3">{it.product_name || it.product?.name || "-"}</td>
                    <td className="p-3">{it.batch_id || "-"}</td>
                    <td className="p-3">{onHand.toLocaleString("fa-IR")}</td>
                    <td className="p-3">{reserved.toLocaleString("fa-IR")}</td>
                    <td className="p-3">{free.toLocaleString("fa-IR")}</td>
                    <td className="p-3">{it.uom_name || it.uom?.name || it.uom_id || "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
