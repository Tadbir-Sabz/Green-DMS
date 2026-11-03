"use client";

import { useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { ExportButtons } from "@/components/reports/ExportButtons";

/** شکل واقعی SupplierBalance که GET /ap برمی‌گرداند */
type SupplierRow = {
  supplier_person_id: string;
  supplier_name: string;
  total_payable: string;
  due_next: string | null;
};

/** گزارش حساب‌های پرداختنی — GET /ap (ماندهٔ بدهی تأمین‌کنندگان) */
export default function ReportsAPPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["reports-ap"],
    queryFn: async () => {
      const res = await api.GET("/ap", { params: { query: { limit: 200 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as SupplierRow[];
    },
  });

  const items = data ?? [];
  const grand = items.reduce((s, it) => s + Number(it.total_payable || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">گزارش حساب‌های پرداختنی</h1>
          <p className="text-ink-muted text-sm">ماندهٔ بدهی تأمین‌کنندگان</p>
        </div>
        <ExportButtons data={items} tableId="ap-report-table" filename="ap-report" />
      </div>
      {error && <div className="text-sm text-danger-ink bg-danger-soft border border-danger-line rounded-lg px-3 py-2">{(error as Error).message}</div>}
      <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table id="ap-report-table" className="w-full text-sm">
            <thead className="bg-surface-alt text-ink-muted">
              <tr>
                <th className="text-right p-3">تأمین‌کننده</th>
                <th className="text-right p-3">کل بدهی</th>
                <th className="text-right p-3">سررسید بعدی</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={3} className="text-center p-6 text-ink-muted">در حال بارگذاری...</td></tr>}
              {!isLoading && items.length === 0 && <tr><td colSpan={3} className="text-center p-6 text-ink-subtle">داده‌ای برای نمایش نیست</td></tr>}
              {!isLoading && items.map((it, idx) => (
                <tr key={idx} className="border-t border-line hover:bg-surface-hover">
                  <td className="p-3">{it.supplier_name || "-"}</td>
                  <td className="p-3 font-medium">{Number(it.total_payable || 0).toLocaleString("fa-IR")}</td>
                  <td className="p-3">{it.due_next || "-"}</td>
                </tr>
              ))}
              {!isLoading && items.length > 0 && (
                <tr className="border-t-2 border-line bg-surface-alt font-semibold">
                  <td className="p-3">جمع کل</td>
                  <td className="p-3">{grand.toLocaleString("fa-IR")}</td>
                  <td className="p-3" />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
