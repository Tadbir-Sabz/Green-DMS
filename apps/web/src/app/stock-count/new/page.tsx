"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { useRouter } from "next/navigation";

/**
 * شروع انبارگردانی — POST /stocktakes (مطابق قرارداد).
 * شکل StockTake: { warehouse_id, lines?:[{product_id,batch_id?,counted_qty?}] }.
 * سند با وضعیت draft ساخته می‌شود؛ شمارش اقلام بعداً با PATCH ثبت می‌گردد.
 */
export default function NewStockCountPage() {
  const router = useRouter();
  const [warehouseId, setWarehouseId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const { data, error: apiError } = await api.POST("/stocktakes", {
        body: { warehouse_id: warehouseId },
      });
      if (apiError || !data) throw new Error(errorMessage(apiError));
      return data;
    },
    onSuccess: (data) => {
      const id = (data as { id?: string }).id;
      router.push(id ? `/stock-count/${id}` : "/stock-count");
    },
    onError: (e: unknown) => setError(errorMessage(e)),
  });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">شروع انبارگردانی</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">انبار مورد نظر را انتخاب کنید تا سند شمارش (پیش‌نویس) ساخته شود</p>
      </div>
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-sm p-3">{error}</div>}
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-[#1f2937] rounded-2xl p-6 shadow-sm space-y-4">
        <div>
          <label className="text-sm text-slate-700 dark:text-slate-300">انبار (شناسه)</label>
          <input value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1f2937] bg-white dark:bg-[#0b1026] text-slate-900 dark:text-slate-100" />
        </div>
        <div className="flex gap-2">
          <button disabled={create.isPending || !warehouseId} onClick={() => create.mutate()} className="px-4 py-2 rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">ایجاد سند انبارگردانی</button>
          <button onClick={() => router.push("/stock-count")} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-[#1f2937] hover:bg-slate-50 dark:hover:bg-[#1f2937] text-slate-700 dark:text-slate-300">انصراف</button>
        </div>
      </div>
    </div>
  );
}
