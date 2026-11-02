"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useState } from "react";

export default function WarehousesInner() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["stock-balance", search],
    queryFn: async () => {
      try {
        const res = await (api as any).GET?.("/stock", { params: { q: search } } as any);
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
          <h1 className="text-xl font-bold text-slate-900">موجودی انبار</h1>
          <p className="text-slate-500 text-sm">موجودی لحظه‌ای</p>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr><th className="text-right p-3">انبار</th><th className="text-right p-3">کد کالا</th><th className="text-right p-3">نام کالا</th><th className="text-right p-3">موجودی</th></tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={4} className="text-center p-6 text-slate-500">در حال بارگذاری...</td></tr>}
            {!isLoading && items.length === 0 && <tr><td colSpan={4} className="text-center p-6 text-slate-500">آماده</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
