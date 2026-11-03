"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, getToken } from "@/lib/api";
import { useRouter } from "next/navigation";

/**
 * حواله‌های انبار — /waybills (فاز D):
 * لیست با فیلتر وضعیت، جزئیات با اقلام، و ساخت draft از سفارش فروش.
 */
const STATUSES = ["draft", "issued", "delivered", "voided"] as const;
const STATUS_FA: Record<string, string> = {
  draft: "پیش‌نویس",
  issued: "صادر شده",
  delivered: "تحویل شده",
  voided: "باطل",
};

type Waybill = {
  id: string;
  doc_number: string;
  status: string;
  customer_id: string;
  warehouse_id: string;
  sales_order_id: string;
  note: string | null;
  lines?: { product_id: string; batch_id: string | null; qty: number }[];
};

export default function WaybillsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Waybill | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ sales_order_id: "", warehouse_id: "", note: "" });
  const [items, setItems] = useState([{ product_id: "", qty: 1 }]);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  const list = useQuery({
    queryKey: ["waybills", status],
    queryFn: async () => {
      const res = await api.GET("/waybills", {
        params: { query: { ...(status ? { status } : {}), limit: 100 } },
      });
      if (res.error) throw new Error(errorMessage(res.error));
      return { items: (res.data?.items ?? []) as Waybill[] };
    },
  });

  const detail = useQuery({
    queryKey: ["waybill", selected?.id],
    enabled: Boolean(selected?.id),
    queryFn: async () => {
      const res = await api.GET("/waybills/{id}", { params: { path: { id: selected!.id } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data as Waybill;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const body = {
        sales_order_id: form.sales_order_id.trim(),
        warehouse_id: form.warehouse_id.trim(),
        ...(form.note.trim() ? { note: form.note.trim() } : {}),
        lines: items
          .filter((i) => i.product_id.trim() && Number(i.qty) > 0)
          .map((i) => ({ product_id: i.product_id.trim(), qty: Number(i.qty) })),
      };
      const res = await api.POST("/waybills", { body });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data as Waybill;
    },
    onSuccess: (data) => {
      setFormError(null);
      setShowForm(false);
      setForm({ sales_order_id: "", warehouse_id: "", note: "" });
      setItems([{ product_id: "", qty: 1 }]);
      void qc.invalidateQueries({ queryKey: ["waybills"] });
      setSelected(data);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">حواله‌های انبار</h1>
          <p className="text-ink-muted text-sm">صدور حواله از سفارش فروش و پیگیری وضعیت اقلام</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 rounded-xl bg-brand text-brand-ink hover:bg-brand-hover focus-ring"
        >
          {showForm ? "بستن" : "حواله جدید"}
        </button>
      </div>

      {showForm && (
        <div className="bg-surface border border-line rounded-2xl p-6 space-y-4">
          <div className="font-semibold">حواله جدید (پیش‌نویس)</div>
          {formError && (
            <div className="text-sm text-danger-ink bg-danger-soft border border-danger-line rounded-lg px-3 py-2">{formError}</div>
          )}
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-ink">شناسه سفارش فروش *</label>
              <input
                value={form.sales_order_id}
                onChange={(e) => setForm({ ...form, sales_order_id: e.target.value })}
                className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 mt-1"
                placeholder="uuid"
              />
            </div>
            <div>
              <label className="text-sm text-ink">شناسه انبار *</label>
              <input
                value={form.warehouse_id}
                onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
                className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 mt-1"
                placeholder="uuid"
              />
            </div>
            <div>
              <label className="text-sm text-ink">یادداشت</label>
              <input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 mt-1"
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-ink">اقلام</div>
              <button
                onClick={() => setItems([...items, { product_id: "", qty: 1 }])}
                className="px-2 py-1 rounded-lg border border-line text-sm focus-ring"
              >
                افزودن قلم
              </button>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid md:grid-cols-2 gap-2">
                  <input
                    placeholder="شناسه کالا"
                    value={it.product_id}
                    onChange={(e) => {
                      const n = [...items];
                      n[idx] = { ...it, product_id: e.target.value };
                      setItems(n);
                    }}
                    className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <input
                    type="number"
                    min={0}
                    step="any"
                    placeholder="تعداد"
                    value={it.qty}
                    onChange={(e) => {
                      const n = [...items];
                      n[idx] = { ...it, qty: Number(e.target.value) };
                      setItems(n);
                    }}
                    className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              disabled={create.isPending}
              onClick={() => create.mutate()}
              className="px-4 py-2 rounded-xl bg-brand text-brand-ink hover:bg-brand-hover disabled:opacity-50 focus-ring"
            >
              ثبت پیش‌نویس
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl border border-line hover:bg-surface-hover focus-ring"
            >
              انصراف
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setStatus("")}
          className={`focus-ring px-3 py-1.5 rounded-lg text-sm border ${!status ? "border-brand text-brand-soft-ink" : "border-line"}`}
        >
          همه
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`focus-ring px-3 py-1.5 rounded-lg text-sm border ${status === s ? "border-brand text-brand-soft-ink" : "border-line"}`}
          >
            {STATUS_FA[s]}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-surface border border-line rounded-2xl overflow-hidden">
          {list.isError && (
            <div className="p-4 text-sm text-danger-ink">{(list.error as Error).message}</div>
          )}
          <table className="w-full text-sm">
            <thead className="bg-surface-alt text-ink-muted">
              <tr>
                <th className="text-start px-4 py-3 font-medium">شماره</th>
                <th className="text-start px-4 py-3 font-medium">وضعیت</th>
                <th className="text-start px-4 py-3 font-medium">سفارش</th>
                <th className="text-start px-4 py-3 font-medium">انبار</th>
              </tr>
            </thead>
            <tbody>
              {(list.data?.items ?? []).map((w) => (
                <tr
                  key={w.id}
                  onClick={() => setSelected(w)}
                  className={`border-t border-line cursor-pointer hover:bg-surface-hover ${ selected?.id === w.id ? "bg-brand-soft" : "" }`}
                >
                  <td className="px-4 py-3 font-mono">{w.doc_number}</td>
                  <td className="px-4 py-3">{STATUS_FA[w.status] ?? w.status}</td>
                  <td className="px-4 py-3 font-mono text-xs">{w.sales_order_id.slice(0, 8)}…</td>
                  <td className="px-4 py-3 font-mono text-xs">{w.warehouse_id.slice(0, 8)}…</td>
                </tr>
              ))}
              {!list.isLoading && (list.data?.items?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-ink-subtle">
                    حواله‌ای ثبت نشده است
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-surface border border-line rounded-2xl p-5 h-fit">
          <div className="font-semibold mb-3">جزئیات حواله</div>
          {!selected && <div className="text-sm text-ink-subtle">یک ردیف را برای جزئیات انتخاب کنید</div>}
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-muted">شماره</span>
                <span className="font-mono">{selected.doc_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">وضعیت</span>
                <span>{STATUS_FA[selected.status] ?? selected.status}</span>
              </div>
              {selected.note && (
                <div className="flex justify-between">
                  <span className="text-ink-muted">یادداشت</span>
                  <span>{selected.note}</span>
                </div>
              )}
              <div className="border-t border-line pt-3">
                <div className="text-ink-muted mb-2">اقلام</div>
                {detail.isLoading && <div className="text-ink-subtle">در حال بارگذاری…</div>}
                {detail.data?.lines?.length === 0 && <div className="text-ink-subtle">قلمی ثبت نشده</div>}
                <ul className="space-y-1">
                  {(detail.data?.lines ?? []).map((l, i) => (
                    <li key={i} className="flex justify-between font-mono text-xs">
                      <span>{l.product_id.slice(0, 8)}…</span>
                      <span>{l.qty}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
