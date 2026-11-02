"use client";

import { useCustomers } from "@/lib/api";
import { toPersianDate } from "@/lib/date";

export default function Page() {
  const { data, isLoading, error } = useCustomers();
  const items = (data as any)?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">مشتریان</h1>
          <p className="text-slate-500 text-sm">لیست مشتریان از API</p>
        </div>
        <button className="px-3 py-2 rounded-xl bg-green-600 text-white hover:bg-green-700">افزودن مشتری</button>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-right p-3">کد</th>
              <th className="text-right p-3">نام</th>
              <th className="text-right p-3">تاریخ ایجاد</th>
              <th className="text-right p-3">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={4} className="text-center p-6 text-slate-500">در حال بارگذاری...</td></tr>}
            {error && <tr><td colSpan={4} className="text-center p-6 text-red-600">خطا در دریافت اطلاعات</td></tr>}
            {!isLoading && !error && items.length === 0 && <tr><td colSpan={4} className="text-center p-6 text-slate-500">داده‌ای یافت نشد</td></tr>}
            {items.map((c: any) => (
              <tr key={c.id} className="hover:bg-slate-50">
                <td className="p-3">{c.code || '-'}</td>
                <td className="p-3">{c.person?.full_name || c.full_name || '-'}</td>
                <td className="p-3">{toPersianDate(c.created_at)}</td>
                <td className="p-3">{c.status || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
