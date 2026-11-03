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
        <h1 className="text-xl font-bold text-ink">شروع انبارگردانی</h1>
        <p className="text-ink-muted text-sm">انبار مورد نظر را انتخاب کنید تا سند شمارش (پیش‌نویس) ساخته شود</p>
      </div>
      {error && <div className="rounded-xl border border-danger-line bg-danger-soft text-danger-ink text-sm p-3">{error}</div>}
      <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm space-y-4">
        <div>
          <label className="text-sm text-ink">انبار (شناسه)</label>
          <input value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="w-full mt-1 px-3 py-2 rounded-xl border border-line bg-surface text-ink" />
        </div>
        <div className="flex gap-2">
          <button disabled={create.isPending || !warehouseId} onClick={() => create.mutate()} className="px-4 py-2 rounded-xl bg-brand text-white hover:bg-brand-hover disabled:opacity-50">ایجاد سند انبارگردانی</button>
          <button onClick={() => router.push("/stock-count")} className="px-4 py-2 rounded-xl border border-line hover:bg-surface-hover text-ink">انصراف</button>
        </div>
      </div>
    </div>
  );
}
