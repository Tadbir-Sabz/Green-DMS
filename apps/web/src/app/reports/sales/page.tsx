"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ExportButtons } from "@/components/reports/ExportButtons";

export default function ReportsSalesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["reports-sales"],
    queryFn: async () => {
      try {
        const res = await (api as any).GET?.("/reports/sales-summary", {} as any);
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
          <h1 className="text-xl font-bold text-slate-900">گزارش فروش</h1>
          <p className="text-slate-500 text-sm">فروش به تفکیک روز/نماینده/مشتری</p>
        </div>
        <ExportButtons data={items} tableId="sales-report-table" filename="sales-report" />
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 font-semibold text-slate-900">خلاصه فروش</div>
        <div className="overflow-x-auto">
          <table id="sales-report-table" className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-right p-3">تاریخ</th>
                <th className="text-right p-3">تعداد سفارش</th>
                <th className="text-right p-3">مبلغ ناخالص</th>
                <th className="text-right p-3">تخفیف</th>
                <th className="text-right p-3">مبلغ خالص</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={5} className="text-center p-6 text-slate-500">
                    در حال بارگذاری...
                  </td>
                </tr>
              )}
              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center p-6 text-slate-500">
                    آماده اتصال به API گزارش‌گیری
                  </td>
                </tr>
              )}
              {items.map((it: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="p-3">{it.date || "-"}</td>
                  <td className="p-3">{it.order_count || 0}</td>
                  <td className="p-3">{Number(it.gross_amount || 0).toLocaleString("fa-IR")}</td>
                  <td className="p-3">{Number(it.discount_amount || 0).toLocaleString("fa-IR")}</td>
                  <td className="p-3 font-medium">{Number(it.net_amount || 0).toLocaleString("fa-IR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
