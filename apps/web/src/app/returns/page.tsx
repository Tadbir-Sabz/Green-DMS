"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, getToken } from "@/lib/api";
import { useRouter } from "next/navigation";

/**
 * مرجوعی‌ها — /returns (فاز D):
 * لیست، ساخت درخواست، تأیید (approve) و دریافت با تعیین تکلیف (receive).
 */
const STATUSES = ["submitted", "approved", "posted", "rejected"] as const;
/** وضعیت‌های مجاز مرجوعی — هم‌راستا با enum قرارداد در /returns?status */
type ReturnStatus = "draft" | "submitted" | "approved" | "partially_approved" | "rejected" | "posted" | "closed";
/** دلیل مرجوعی — enum قرارداد در ReturnRequest.reason_code */
type ReturnReason = "damaged" | "expired" | "wrong_item" | "shortage" | "customer_refusal" | "promotion_error" | "other";
/** تعیین تکلیف کالا هنگام دریافت — enum قرارداد در /returns/{id}/receive */
type Disposition = "restock" | "damaged" | "scrap" | "return_to_supplier";
const STATUS_FA: Record<string, string> = {
  draft: "پیش‌نویس",
  submitted: "ثبت شده",
  approved: "تأیید شده",
  partially_approved: "تأیید جزئی",
  rejected: "رد شده",
  posted: "ثبت نهایی",
  closed: "بسته",
};
const REASONS = ["damaged", "expired", "wrong_item", "shortage", "customer_refusal", "promotion_error", "other"] as const;
const REASON_FA: Record<string, string> = {
  damaged: "خرابی",
  expired: "تاریخ گذشته",
  wrong_item: "کالای اشتباه",
  shortage: "کسری",
  customer_refusal: "عدم قبول مشتری",
  promotion_error: "خطای تبلیغات",
  other: "سایر",
};
const DISPOSITIONS = ["restock", "damaged", "scrap", "return_to_supplier"] as const;
const DISPOSITION_FA: Record<string, string> = {
  restock: "بازگشت به موجودی",
  damaged: "خراب",
  scrap: "ضایعات",
  return_to_supplier: "برگشت به تأمین‌کننده",
};

type ReturnItem = {
  id: string;
  doc_number: string;
  status: string;
  reason_code: string;
  customer_id: string;
  note: string | null;
  lines?: { product_id: string; qty: number; qty_approved: number | null; disposition: string }[];
};

export default function ReturnsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<ReturnItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customer_id: "", reason_code: "damaged" as string, note: "" });
  const [items, setItems] = useState([{ product_id: "", qty: 1 }]);
  const [formError, setFormError] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  // تکلیف نهایی هر قلم هنگام receive
  const [receiveLines, setReceiveLines] = useState<Record<string, { qty: number; disposition: string }>>({});

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  const list = useQuery({
    queryKey: ["returns", status],
    queryFn: async () => {
      const res = await api.GET("/returns", {
        params: { query: { ...(status ? { status: status as ReturnStatus } : {}), limit: 100 } },
      });
      if (res.error) throw new Error(errorMessage(res.error));
      return { items: (res.data?.items ?? []) as ReturnItem[] };
    },
  });

  const detail = useQuery({
    queryKey: ["return", selected?.id],
    enabled: Boolean(selected?.id),
    queryFn: async () => {
      const res = await api.GET("/returns/{id}", { params: { path: { id: selected!.id } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data as ReturnItem;
    },
  });

  const invalidate = (): void => {
    void qc.invalidateQueries({ queryKey: ["returns"] });
    void qc.invalidateQueries({ queryKey: ["return"] });
  };

  const create = useMutation({
    mutationFn: async () => {
      const body = {
        customer_id: form.customer_id.trim(),
        reason_code: form.reason_code as ReturnReason,
        ...(form.note.trim() ? { note: form.note.trim() } : {}),
        lines: items
          .filter((i) => i.product_id.trim() && Number(i.qty) > 0)
          .map((i) => ({ product_id: i.product_id.trim(), qty: Number(i.qty) })),
      };
      const res = await api.POST("/returns", { body });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data as ReturnItem;
    },
    onSuccess: (data) => {
      setFormError(null);
      setShowForm(false);
      setForm({ customer_id: "", reason_code: "damaged", note: "" });
      setItems([{ product_id: "", qty: 1 }]);
      invalidate();
      setSelected(data);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.POST("/returns/{id}/approve", { params: { path: { id } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data as ReturnItem;
    },
    onSuccess: () => {
      setDecisionError(null);
      invalidate();
    },
    onError: (e: Error) => setDecisionError(e.message),
  });

  const receive = useMutation({
    mutationFn: async (id: string) => {
      const lines = (detail.data?.lines ?? []).map((l) => ({
        product_id: l.product_id,
        qty: Number(receiveLines[l.product_id]?.qty ?? l.qty),
        disposition: (receiveLines[l.product_id]?.disposition ?? "restock") as Disposition,
      }));
      const res = await api.POST("/returns/{id}/receive", { params: { path: { id } }, body: { lines } });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data as ReturnItem;
    },
    onSuccess: () => {
      setDecisionError(null);
      invalidate();
    },
    onError: (e: Error) => setDecisionError(e.message),
  });

  const current = detail.data ?? selected;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">درخواست‌های مرجوعی</h1>
          <p className="text-slate-500 text-sm">ثبت، تأیید و تعیین تکلیف نهایی کالای برگشتی</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {showForm ? "بستن" : "مرجوعی جدید"}
        </button>
      </div>

      {showForm && (
        <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-[#1f2937] rounded-2xl p-6 space-y-4">
          <div className="font-semibold">درخواست مرجوعی جدید</div>
          {formError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{formError}</div>
          )}
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-slate-700 dark:text-slate-300">شناسه مشتری *</label>
              <input
                value={form.customer_id}
                onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1f2937] bg-transparent"
                placeholder="uuid"
              />
            </div>
            <div>
              <label className="text-sm text-slate-700 dark:text-slate-300">دلیل *</label>
              <select
                value={form.reason_code}
                onChange={(e) => setForm({ ...form, reason_code: e.target.value })}
                className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1f2937] bg-transparent"
              >
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {REASON_FA[r]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-700 dark:text-slate-300">یادداشت</label>
              <input
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1f2937] bg-transparent"
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">اقلام</div>
              <button
                onClick={() => setItems([...items, { product_id: "", qty: 1 }])}
                className="px-2 py-1 rounded-lg border border-slate-200 dark:border-[#1f2937] text-sm"
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
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1f2937] bg-transparent"
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
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1f2937] bg-transparent"
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              disabled={create.isPending}
              onClick={() => create.mutate()}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              ثبت درخواست
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-[#1f2937] hover:bg-slate-50 dark:hover:bg-[#1f2937]"
            >
              انصراف
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setStatus("")}
          className={`px-3 py-1.5 rounded-lg text-sm border ${!status ? "border-emerald-500 text-emerald-700" : "border-slate-200 dark:border-[#1f2937]"}`}
        >
          همه
        </button>
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${status === s ? "border-emerald-500 text-emerald-700" : "border-slate-200 dark:border-[#1f2937]"}`}
          >
            {STATUS_FA[s]}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-[#1f2937] rounded-2xl overflow-hidden">
          {list.isError && <div className="p-4 text-sm text-red-600">{(list.error as Error).message}</div>}
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-[#1f2937] text-slate-500">
              <tr>
                <th className="text-right px-4 py-3 font-medium">شماره</th>
                <th className="text-right px-4 py-3 font-medium">وضعیت</th>
                <th className="text-right px-4 py-3 font-medium">دلیل</th>
              </tr>
            </thead>
            <tbody>
              {(list.data?.items ?? []).map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className={`border-t border-slate-100 dark:border-[#1f2937] cursor-pointer hover:bg-slate-50 dark:hover:bg-[#1f2937] ${
                    selected?.id === r.id ? "bg-emerald-50 dark:bg-emerald-900/20" : ""
                  }`}
                >
                  <td className="px-4 py-3 font-mono">{r.doc_number}</td>
                  <td className="px-4 py-3">{STATUS_FA[r.status] ?? r.status}</td>
                  <td className="px-4 py-3">{REASON_FA[r.reason_code] ?? r.reason_code}</td>
                </tr>
              ))}
              {!list.isLoading && (list.data?.items?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-400">
                    درخواستی ثبت نشده است
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-[#1f2937] rounded-2xl p-5 h-fit space-y-3">
          <div className="font-semibold">جزئیات مرجوعی</div>
          {!current && <div className="text-sm text-slate-400">یک ردیف را انتخاب کنید</div>}
          {current && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">شماره</span>
                <span className="font-mono">{current.doc_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">وضعیت</span>
                <span>{STATUS_FA[current.status] ?? current.status}</span>
              </div>

              {current.status === "submitted" && (
                <button
                  disabled={approve.isPending}
                  onClick={() => approve.mutate(current.id)}
                  className="w-full px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  تأیید مرجوعی
                </button>
              )}

              {(current.status === "approved" || current.status === "partially_approved") && (
                <div className="space-y-2 border-t border-slate-100 dark:border-[#1f2937] pt-3">
                  <div className="text-slate-500">تعیین تکلیف اقلام</div>
                  {(detail.data?.lines ?? []).map((l) => (
                    <div key={l.product_id} className="grid grid-cols-3 gap-2 items-center">
                      <span className="font-mono text-xs truncate">{l.product_id.slice(0, 8)}…</span>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        defaultValue={l.qty}
                        onChange={(e) =>
                          setReceiveLines((prev) => ({
                            ...prev,
                            [l.product_id]: {
                              qty: Number(e.target.value),
                              disposition: prev[l.product_id]?.disposition ?? "restock",
                            },
                          }))
                        }
                        className="px-2 py-1 rounded-lg border border-slate-200 dark:border-[#1f2937] bg-transparent text-xs"
                      />
                      <select
                        defaultValue="restock"
                        onChange={(e) =>
                          setReceiveLines((prev) => ({
                            ...prev,
                            [l.product_id]: {
                              qty: prev[l.product_id]?.qty ?? l.qty,
                              disposition: e.target.value,
                            },
                          }))
                        }
                        className="px-2 py-1 rounded-lg border border-slate-200 dark:border-[#1f2937] bg-transparent text-xs"
                      >
                        {DISPOSITIONS.map((d) => (
                          <option key={d} value={d}>
                            {DISPOSITION_FA[d]}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                  <button
                    disabled={receive.isPending}
                    onClick={() => receive.mutate(current.id)}
                    className="w-full px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    ثبت نهایی دریافت
                  </button>
                </div>
              )}

              {decisionError && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{decisionError}</div>
              )}

              <div className="border-t border-slate-100 dark:border-[#1f2937] pt-3">
                <div className="text-slate-500 mb-2">اقلام</div>
                <ul className="space-y-1">
                  {(detail.data?.lines ?? []).map((l) => (
                    <li key={l.product_id} className="flex justify-between text-xs">
                      <span className="font-mono">{l.product_id.slice(0, 8)}…</span>
                      <span>
                        {l.qty}
                        {l.qty_approved != null && ` ← ${l.qty_approved} (${DISPOSITION_FA[l.disposition] ?? l.disposition})`}
                      </span>
                    </li>
                  ))}
                  {(detail.data?.lines ?? []).length === 0 && <li className="text-slate-400">قلمی ثبت نشده</li>}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
