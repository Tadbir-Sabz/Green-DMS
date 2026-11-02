"use client";

import { useOrders } from "@/lib/api";
import { toPersianDate } from "@/lib/date";

export default function Page() {
  const { data, isLoading, error } = useOrders();
  const items = (data as any)?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">سفارشات فروش</h1>
          <p className="text-slate-500 text-sm">اتصال واقعی به API</p>
        </div>
        <button className="px-3 py-2 rounded-xl bg-green-600 text-white hover:bg-green-700">ثبت سفارش</button>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr><th className="text-right p-3">شماره</th><th className="text-right p-3">مشتری</th><th className="text-right p-3">تاریخ</th><th className="text-right p-3">مبلغ</th><th className="text-right p-3">وضعیت</th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="text-center p-6 text-slate-500">در حال بارگذاری...</td></tr>}
            {error && <tr><td colSpan={5} className="text-center p-6 text-red-600">خطا در دریافت اطلاعات</td></tr>}
            {!isLoading && !error && items.length === 0 && <tr><td colSpan={5} className="text-center p-6 text-slate-500">داده‌ای یافت نشد</td></tr>}
            {items.map((o: any) => (
              <tr key={o.id} className="hover:bg-slate-50">
                <td className="p-3">{o.doc_number || '-'}</td>
                <td className="p-3">{o.customer_id || '-'}</td>
                <td className="p-3">{toPersianDate(o.order_date)}</td>
                <td className="p-3">{o.grand_total || 0}</td>
                <td className="p-3">{o.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
