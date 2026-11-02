"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ExportButtons } from "@/components/reports/ExportButtons";

export default function ReportsAPPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["reports-ap"],
    queryFn: async () => {
      try {
        const res = await (api as any).GET?.("/finance/ap/aging" as any, {});
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
          <h1 className="text-xl font-bold text-slate-900">گزارش حساب‌های پرداختنی</h1>
          <p className="text-slate-500 text-sm">تحلیل سنی بدهی تأمین‌کنندگان</p>
        </div>
        <ExportButtons data={items} tableId="ap-report-table" filename="ap-aging-report" />
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table id="ap-report-table" className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-right p-3">تأمین‌کننده</th>
                <th className="text-right p-3">جاری</th>
                <th className="text-right p-3">۱-۳۰</th>
                <th className="text-right p-3">۳۱-۶۰</th>
                <th className="text-right p-3">۶۱-۹۰</th>
                <th className="text-right p-3">بیش از ۹۰</th>
                <th className="text-right p-3">جمع کل</th>
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
                    آماده اتصال به API Finance/AP
                  </td>
                </tr>
              )}
              {items.map((it: any, idx: number) => {
                const total =
                  Number(it.current || 0) +
                  Number(it.days1_30 || 0) +
                  Number(it.days31_60 || 0) +
                  Number(it.days61_90 || 0) +
                  Number(it.over90 || 0);
                return (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-3">{it.vendor?.name || it.vendor_name || "-"}</td>
                    <td className="p-3">{Number(it.current || 0).toLocaleString("fa-IR")}</td>
                    <td className="p-3">{Number(it.days1_30 || 0).toLocaleString("fa-IR")}</td>
                    <td className="p-3">{Number(it.days31_60 || 0).toLocaleString("fa-IR")}</td>
                    <td className="p-3">{Number(it.days61_90 || 0).toLocaleString("fa-IR")}</td>
                    <td className="p-3">{Number(it.over90 || 0).toLocaleString("fa-IR")}</td>
                    <td className="p-3 font-medium">{total.toLocaleString("fa-IR")}</td>
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
