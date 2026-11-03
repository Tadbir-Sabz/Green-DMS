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
          <h1 className="text-xl font-bold text-ink">انبارها</h1>
          <p className="text-ink-muted text-sm">انبار مرکزی، شعبه و خودرو (انبار سیار)</p>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جست‌وجوی کد/نام انبار"
          className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60"
        />
      </div>
      {error && <div className="text-sm text-danger-ink bg-danger-soft border border-danger-line rounded-lg px-3 py-2">{(error as Error).message}</div>}
      <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-ink-muted">
            <tr>
              <th className="text-start p-3">کد</th>
              <th className="text-start p-3">نام</th>
              <th className="text-start p-3">نوع</th>
              <th className="text-start p-3">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={4} className="text-center p-6 text-ink-muted">در حال بارگذاری...</td></tr>}
            {!isLoading && items.length === 0 && <tr><td colSpan={4} className="text-center p-6 text-ink-subtle">انباری یافت نشد</td></tr>}
            {!isLoading && items.map((w) => (
              <tr key={w.id} className="border-t border-line hover:bg-surface-hover">
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
