"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function NewStockCountPage() {
  const router = useRouter();
  const [form, setForm] = useState({ warehouse_id: "", count_type: "CYCLE", planned_date: "", notes: "" });

  const create = useMutation({
    mutationFn: async () => {
      const res = await (api as any).POST?.("/inventory/stock-counts", { body: form } as any);
      return (res as any)?.data || res;
    },
    onSuccess: (data: any) => {
      const id = data?.id;
      if (id) router.push(`/stock-count/${id}`);
      else router.push("/stock-count");
    },
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">ایجاد برنامه انبارگردانی</h1>
        <p className="text-slate-500 text-sm">انبار، نوع شمارش و تاریخ برنامه را تعیین کنید</p>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-slate-700">انبار</label>
            <input value={form.warehouse_id} onChange={(e) => setForm({...form, warehouse_id: e.target.value})} className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200" />
          </div>
          <div>
            <label className="text-sm text-slate-700">نوع شمارش</label>
            <select value={form.count_type} onChange={(e) => setForm({...form, count_type: e.target.value})} className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200">
              <option value="CYCLE">چرخه‌ای</option>
              <option value="FULL">کامل</option>
              <option value="SPOT">تصادفی</option>
            </select>
          </div>
          <div>
            <label className="text-sm text-slate-700">تاریخ برنامه</label>
            <input type="date" value={form.planned_date} onChange={(e) => setForm({...form, planned_date: e.target.value})} className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200" />
          </div>
          <div>
            <label className="text-sm text-slate-700">یادداشت</label>
            <input value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200" />
          </div>
        </div>
        <div className="flex gap-2">
          <button disabled={create.isPending} onClick={() => create.mutate()} className="px-4 py-2 rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">ایجاد برنامه</button>
          <button onClick={() => router.push("/stock-count")} className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50">انصراف</button>
        </div>
      </div>
    </div>
  );
}
