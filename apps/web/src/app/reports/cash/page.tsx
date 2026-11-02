"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ExportButtons } from "@/components/reports/ExportButtons";

export default function ReportsCashPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["reports-cash"],
    queryFn: async () => {
      try {
        const res = await (api as any).GET?.("/finance/treasury/summary" as any, {});
        return (res as any)?.data || res;
      } catch {
        return null;
      }
    },
  });

  const items = (data as any)?.transactions || (Array.isArray(data) ? data : []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">گزارش صندوق و بانک</h1>
          <p className="text-slate-500 text-sm">گردش نقدی و مانده‌ها</p>
        </div>
        <ExportButtons data={items} tableId="cash-report-table" filename="cash-report" />
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table id="cash-report-table" className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-right p-3">تاریخ</th>
                <th className="text-right p-3">حساب</th>
                <th className="text-right p-3">نوع</th>
                <th className="text-right p-3">شرح</th>
                <th className="text-right p-3">بدهکار</th>
                <th className="text-right p-3">بستانکار</th>
                <th className="text-right p-3">مانده</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={7} className="text-center p-6 text-slate-500">
                    در حال بارگذاری...
                  </td>
                </tr>
              )}
              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={7} className="text-center p-6 text-slate-500">
                    آماده اتصال به API خزانه
                  </td>
                </tr>
              )}
              {items.map((it: any, idx: number) => (
                <tr key={idx} className="hover:bg-slate-50">
                  <td className="p-3">{it.txn_date || "-"}</td>
                  <td className="p-3">{it.account_name || it.account_id || "-"}</td>
                  <td className="p-3">{it.type || "-"}</td>
                  <td className="p-3">{it.description || "-"}</td>
                  <td className="p-3">{Number(it.debit || 0).toLocaleString("fa-IR")}</td>
                  <td className="p-3">{Number(it.credit || 0).toLocaleString("fa-IR")}</td>
                  <td className="p-3 font-medium">{Number(it.balance || 0).toLocaleString("fa-IR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
