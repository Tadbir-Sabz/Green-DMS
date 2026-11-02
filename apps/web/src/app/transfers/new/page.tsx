"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";

export default function NewTransferPage() {
  const router = useRouter();
  const [form, setForm] = useState({ from_warehouse_id: "", to_warehouse_id: "", transfer_date: "", notes: "" });
  const [items, setItems] = useState([{ product_id: "", qty: 1, batch_id: "", uom_id: "" }]);

  const create = useMutation({
    mutationFn: async () => {
      const payload = { ...form, items: items.filter(i => i.product_id && Number(i.qty) > 0) };
      const res = await (api as any).POST?.("/inventory/transfers", { body: payload } as any);
      return (res as any)?.data || res;
    },
    onSuccess: (data: any) => {
      const id = data?.id;
      if (id) router.push(`/transfers/${id}`);
      else router.push("/transfers");
    },
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">ایجاد حواله انتقال بین انباری</h1>
        <p className="text-slate-500 text-sm">اطلاعات انبار مبدا/مقصد و اقلام را وارد کنید</p>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-sm text-slate-700">از انبار</label>
            <input value={form.from_warehouse_id} onChange={(e) => setForm({...form, from_warehouse_id: e.target.value})} className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200" />
          </div>
          <div>
            <label className="text-sm text-slate-700">به انبار</label>
            <input value={form.to_warehouse_id} onChange={(e) => setForm({...form, to_warehouse_id: e.target.value})} className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200" />
          </div>
          <div>
            <label className="text-sm text-slate-700">تاریخ انتقال</label>
            <input type="date" value={form.transfer_date} onChange={(e) => setForm({...form, transfer_date: e.target.value})} className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200" />
          </div>
          <div>
            <label className="text-sm text-slate-700">یادداشت</label>
            <input value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200" />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold text-slate-900">اقلام انتقال</div>
            <button onClick={() => setItems([...items, { product_id: "", qty: 1, batch_id: "", uom_id: "" }])} className="px-2 py-1 rounded-lg border border-slate-200 text-sm">افزودن قلم</button>
          </div>
          <div className="space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="grid md:grid-cols-4 gap-2">
                <input placeholder="کد/شناسه کالا" value={it.product_id} onChange={(e) => { const n=[...items]; n[idx]={...it, product_id:e.target.value}; setItems(n); }} className="px-3 py-2 rounded-xl border border-slate-200" />
                <input type="number" placeholder="تعداد" value={it.qty} onChange={(e) => { const n=[...items]; n[idx]={...it, qty:Number(e.target.value)}; setItems(n); }} className="px-3 py-2 rounded-xl border border-slate-200" />
                <input placeholder="بچ (اختیاری)" value={it.batch_id} onChange={(e) => { const n=[...items]; n[idx]={...it, batch_id:e.target.value}; setItems(n); }} className="px-3 py-2 rounded-xl border border-slate-200" />
                <input placeholder="واحد (اختیاری)" value={it.uom_id} onChange={(e) => { const n=[...items]; n[idx]={...it, uom_id:e.target.value}; setItems(n); }} className="px-3 py-2 rounded-xl border border-slate-200" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button disabled={create.isPending} onClick={() => create.mutate()} className="px-4 py-2 rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">ذخیره پیش‌نویس</button>
          <button onClick={() => router.push("/transfers")} className="px-4 py-2 rounded-xl border border-slate-200 hover:bg-slate-50">انصراف</button>
        </div>
      </div>
    </div>
  );
}
