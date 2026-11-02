"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";

type Warehouse = {
  id: string;
  branch_id?: string;
  code: string;
  name: string;
  kind: string;
  is_active?: boolean;
};

const KIND_FA: Record<string, string> = {
  main: "مرکزی",
  vehicle: "خودرو",
  transit: "ترانزیت",
  damaged: "ضایعاتی",
  quarantine: "قرنطینه",
  consignment: "امانی",
};

/** فهرست انبارها — GET /warehouses (مطابق قرارداد) با جست‌وجوی محلی */
export default function WarehousesInner() {
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const res = await api.GET("/warehouses", { params: { query: { limit: 200 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Warehouse[];
    },
  });

  const items = (data ?? []).filter((w) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return `${w.code} ${w.name}`.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">انبارها</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">انبار مرکزی، شعبه و خودرو (انبار سیار)</p>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جست‌وجوی کد/نام انبار"
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1f2937] bg-white dark:bg-[#0b1026] text-slate-900 dark:text-slate-100"
        />
      </div>
      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{(error as Error).message}</div>}
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-[#1f2937] rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-[#1f2937] text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-right p-3">کد</th>
              <th className="text-right p-3">نام</th>
              <th className="text-right p-3">نوع</th>
              <th className="text-right p-3">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={4} className="text-center p-6 text-slate-500">در حال بارگذاری...</td></tr>}
            {!isLoading && items.length === 0 && <tr><td colSpan={4} className="text-center p-6 text-slate-400">انباری یافت نشد</td></tr>}
            {!isLoading && items.map((w) => (
              <tr key={w.id} className="border-t border-slate-100 dark:border-[#1f2937] hover:bg-slate-50 dark:hover:bg-[#1f2937]">
                <td className="p-3 font-mono text-xs">{w.code}</td>
                <td className="p-3">{w.name}</td>
                <td className="p-3">{KIND_FA[w.kind] ?? w.kind}</td>
                <td className="p-3">{w.is_active === false ? "غیرفعال" : "فعال"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
