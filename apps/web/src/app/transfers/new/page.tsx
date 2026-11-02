"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { useRouter } from "next/navigation";

type Line = { product_id: string; qty: number; batch_id: string };

/**
 * ایجاد حوالهٔ انتقال بین‌انباری — POST /transfers (مطابق قرارداد).
 * شکل Transfer: { from_warehouse_id, to_warehouse_id, lines:[{product_id,batch_id?,qty}] }.
 */
export default function NewTransferPage() {
  const router = useRouter();
  const [form, setForm] = useState({ from_warehouse_id: "", to_warehouse_id: "" });
  const [items, setItems] = useState<Line[]>([{ product_id: "", qty: 1, batch_id: "" }]);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const lines = items
        .filter((i) => i.product_id && Number(i.qty) > 0)
        .map((i) => ({ product_id: i.product_id, qty: Number(i.qty), batch_id: i.batch_id || null }));
      const { data, error: apiError } = await api.POST("/transfers", {
        body: { from_warehouse_id: form.from_warehouse_id, to_warehouse_id: form.to_warehouse_id, lines },
      });
      if (apiError || !data) throw new Error(errorMessage(apiError));
      return data;
    },
    onSuccess: (data) => {
      const id = (data as { id?: string }).id;
      router.push(id ? `/transfers/${id}` : "/transfers");
    },
    onError: (e: unknown) => setError(errorMessage(e)),
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">ایجاد حواله انتقال بین انباری</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">اطلاعات انبار مبدا/مقصد و اقلام را وارد کنید</p>
      </div>
      {error && <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-sm p-3">{error}</div>}
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-[#1f2937] rounded-2xl p-6 shadow-sm space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-slate-700 dark:text-slate-300">از انبار (شناسه)</label>
            <input value={form.from_warehouse_id} onChange={(e) => setForm({ ...form, from_warehouse_id: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1f2937] bg-white dark:bg-[#0b1026] text-slate-900 dark:text-slate-100" />
          </div>
          <div>
            <label className="text-sm text-slate-700 dark:text-slate-300">به انبار (شناسه)</label>
            <input value={form.to_warehouse_id} onChange={(e) => setForm({ ...form, to_warehouse_id: e.target.value })} className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1f2937] bg-white dark:bg-[#0b1026] text-slate-900 dark:text-slate-100" />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-slate-900 dark:text-slate-100">اقلام انتقال</div>
            <button onClick={() => setItems([...items, { product_id: "", qty: 1, batch_id: "" }])} className="px-2 py-1 rounded-lg border border-slate-200 dark:border-[#1f2937] text-sm text-slate-700 dark:text-slate-300">افزودن قلم</button>
          </div>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="grid md:grid-cols-3 gap-2">
                <input placeholder="شناسه کالا" value={it.product_id} onChange={(e) => { const n = [...items]; n[idx] = { ...it, product_id: e.target.value }; setItems(n); }} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1f2937] bg-white dark:bg-[#0b1026] text-slate-900 dark:text-slate-100" />
                <input type="number" placeholder="تعداد" value={it.qty} onChange={(e) => { const n = [...items]; n[idx] = { ...it, qty: Number(e.target.value) }; setItems(n); }} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1f2937] bg-white dark:bg-[#0b1026] text-slate-900 dark:text-slate-100" />
                <input placeholder="بچ (اختیاری)" value={it.batch_id} onChange={(e) => { const n = [...items]; n[idx] = { ...it, batch_id: e.target.value }; setItems(n); }} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1f2937] bg-white dark:bg-[#0b1026] text-slate-900 dark:text-slate-100" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button disabled={create.isPending} onClick={() => create.mutate()} className="px-4 py-2 rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">ذخیره پیش‌نویس</button>
          <button onClick={() => router.push("/transfers")} className="px-4 py-2 rounded-xl border border-slate-200 dark:border-[#1f2937] hover:bg-slate-50 dark:hover:bg-[#1f2937] text-slate-700 dark:text-slate-300">انصراف</button>
        </div>
      </div>
    </div>
  );
}
