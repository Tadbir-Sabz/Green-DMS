"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, getToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { EntityAttachments } from "@/components/EntityAttachments";

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
const FINANCIAL_FA: Record<string, string> = {
  awaiting_receipt: "در انتظار ثبت دریافت",
  awaiting_credit_note: "در انتظار صدور یادداشت بستانکار",
  credit_note_issued: "یادداشت بستانکار صادر شد",
};
const VALUATION_FA: Record<string, string> = {
  unresolved: "ارزش‌گذاری بهای تمام‌شده حل‌نشده",
  valued: "ارزش‌گذاری‌شده",
  not_applicable: "بدون نیاز به ارزش‌گذاری",
  waived: "ارزش‌گذاری صرف‌نظرشده",
};
const CN_STATUS_FA: Record<string, string> = {
  draft: "پیش‌نویس",
  posted: "ثبت شده",
  voided: "ابطال شده",
};
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
  invoice_id?: string | null;
  note: string | null;
  valuation_status?: string;
  financial_status?: string;
  credit_note_id?: string | null;
  credit_note?: { id: string; doc_number: string; amount: string; status: string; issued_at?: string } | null;
  lines?: { product_id: string; qty: number; qty_approved: number | null; disposition: string; invoice_line_id?: string | null }[];
};

export default function ReturnsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const auth = useAuth();
  const canCreditNote = auth.hasPermission("sales.return.credit");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ReturnItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ customer_id: "", invoice_id: "", reason_code: "damaged" as string, note: "" });
  const [items, setItems] = useState([{ product_id: "", qty: 1, invoice_line_id: "" }]);
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
        ...(form.invoice_id.trim() ? { invoice_id: form.invoice_id.trim() } : {}),
        ...(form.note.trim() ? { note: form.note.trim() } : {}),
        lines: items
          .filter((i) => i.product_id.trim() && Number(i.qty) > 0)
          .map((i) => ({
            product_id: i.product_id.trim(),
            qty: Number(i.qty),
            ...(i.invoice_line_id.trim() ? { invoice_line_id: i.invoice_line_id.trim() } : {}),
          })),
      };
      const res = await api.POST("/returns", { body });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data as ReturnItem;
    },
    onSuccess: (data) => {
      setFormError(null);
      setShowForm(false);
      setForm({ customer_id: "", invoice_id: "", reason_code: "damaged", note: "" });
      setItems([{ product_id: "", qty: 1, invoice_line_id: "" }]);
      invalidate();
      setSelected(data);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  /**
   * TASK-24Z — ارسال به گردشِ تأیید. بدونِ آن `approve` همیشه ۴۰۹
   * (`approval_required`) می‌دهد و پیام به کاربر نشان داده می‌شود.
   */
  const requestApproval = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.POST("/returns/{id}/request-approval", { params: { path: { id } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data;
    },
    onSuccess: () => {
      setDecisionError(null);
      invalidate();
    },
    onError: (e: Error) => setDecisionError(e.message),
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

  const issueCreditNote = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.POST("/returns/{id}/credit-note", { params: { path: { id } } });
      if (res.error) {
        const msg = errorMessage(res.error);
        if (/403|forbidden/i.test(msg)) {
          throw new Error("شما مجوز صدور یادداشت بستانکار را ندارید.");
        }
        throw new Error(msg);
      }
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
          <h1 className="text-xl font-bold text-ink">درخواست‌های مرجوعی</h1>
          <p className="text-ink-muted text-sm">ثبت، تأیید، تعیین تکلیف نهایی کالای برگشتی و بستانکاری مشتری در برابر فاکتور مبدأ</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 rounded-xl bg-brand text-brand-ink hover:bg-brand-hover focus-ring"
        >
          {showForm ? "بستن" : "مرجوعی جدید"}
        </button>
      </div>

      {showForm && (
        <div className="bg-surface border border-line rounded-2xl p-6 space-y-4">
          <div className="font-semibold">درخواست مرجوعی جدید</div>
          {formError && (
            <div className="text-sm text-danger-ink bg-danger-soft border border-danger-line rounded-lg px-3 py-2">{formError}</div>
          )}
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-ink">شناسه مشتری *</label>
              <input
                value={form.customer_id}
                onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 mt-1"
                placeholder="uuid"
              />
            </div>
            <div>
              <label className="text-sm text-ink">دلیل *</label>
              <select
                value={form.reason_code}
                onChange={(e) => setForm({ ...form, reason_code: e.target.value })}
                className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer pe-8 mt-1"
              >
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {REASON_FA[r]}
                  </option>
                ))}
              </select>
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
          <div className="max-w-md">
            <label className="text-sm text-ink">شناسه فاکتور مبدأ (اختیاری — الزامی برای صدور بستانکار)</label>
            <input
              value={form.invoice_id}
              onChange={(e) => setForm({ ...form, invoice_id: e.target.value })}
              className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring mt-1"
              placeholder="uuid"
              dir="ltr"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-semibold text-ink">اقلام</div>
              <button
                onClick={() => setItems([...items, { product_id: "", qty: 1, invoice_line_id: "" }])}
                className="px-2 py-1 rounded-lg border border-line text-sm focus-ring"
              >
                افزودن قلم
              </button>
            </div>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="grid md:grid-cols-3 gap-2">
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
                  <input
                    placeholder="شناسه قلم فاکتور (اختیاری)"
                    value={it.invoice_line_id}
                    onChange={(e) => {
                      const n = [...items];
                      n[idx] = { ...it, invoice_line_id: e.target.value };
                      setItems(n);
                    }}
                    className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60"
                    dir="ltr"
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
              ثبت درخواست
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

      <div className="flex gap-2 flex-wrap items-center justify-between">
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
        <input
          type="search"
          aria-label="جستجوی مرجوعی"
          placeholder="جستجو با شماره مرجوعی..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="focus-ring px-3 py-1.5 rounded-lg text-sm border border-line bg-surface min-w-[220px]"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-surface border border-line rounded-2xl overflow-hidden">
          {list.isError && <div className="p-4 text-sm text-danger-ink">{(list.error as Error).message}</div>}
          <table className="w-full text-sm">
            <thead className="bg-surface-alt text-ink-muted">
              <tr>
                <th className="text-start px-4 py-3 font-medium">شماره</th>
                <th className="text-start px-4 py-3 font-medium">وضعیت</th>
                <th className="text-start px-4 py-3 font-medium">دلیل</th>
                <th className="text-start px-4 py-3 font-medium">وضعیت مالی</th>
                <th className="text-start px-4 py-3 font-medium">ارزش‌گذاری</th>
              </tr>
            </thead>
            <tbody>
              {(list.data?.items ?? [])
                .filter((r) => !search.trim() || r.doc_number.toLowerCase().includes(search.trim().toLowerCase()))
                .map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className={`border-t border-line cursor-pointer hover:bg-surface-hover ${ selected?.id === r.id ? "bg-brand-soft" : "" }`}
                >
                  <td className="px-4 py-3 font-mono">{r.doc_number}</td>
                  <td className="px-4 py-3">{STATUS_FA[r.status] ?? r.status}</td>
                  <td className="px-4 py-3">{REASON_FA[r.reason_code] ?? r.reason_code}</td>
                  <td className="px-4 py-3">{r.financial_status ? (FINANCIAL_FA[r.financial_status] ?? r.financial_status) : "—"}</td>
                  <td className="px-4 py-3 text-ink-muted">{r.valuation_status ? (VALUATION_FA[r.valuation_status] ?? r.valuation_status) : "—"}</td>
                </tr>
              ))}
              {!list.isLoading && (list.data?.items?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-ink-subtle">
                    درخواستی ثبت نشده است
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-surface border border-line rounded-2xl p-5 h-fit space-y-3">
          <div className="font-semibold">جزئیات مرجوعی</div>
          {!current && <div className="text-sm text-ink-subtle">یک ردیف را انتخاب کنید</div>}
          {current && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-muted">شماره</span>
                <span className="font-mono">{current.doc_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">وضعیت</span>
                <span>{STATUS_FA[current.status] ?? current.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">وضعیت مالی</span>
                <span>{current.financial_status ? (FINANCIAL_FA[current.financial_status] ?? current.financial_status) : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">ارزش‌گذاری بهای تمام‌شده</span>
                <span className="text-ink-muted">{current.valuation_status ? (VALUATION_FA[current.valuation_status] ?? current.valuation_status) : "—"}</span>
              </div>
              {current.invoice_id && (
                <div className="flex justify-between">
                  <span className="text-ink-muted">فاکتور مبدأ</span>
                  <span className="font-mono text-xs" dir="ltr">{current.invoice_id}</span>
                </div>
              )}

              {(current.status === "draft" || current.status === "submitted") && (
                <button
                  disabled={requestApproval.isPending}
                  onClick={() => requestApproval.mutate(current.id)}
                  className="w-full px-4 py-2 rounded-xl bg-surface-alt border border-line text-ink hover:bg-surface disabled:opacity-50 focus-ring"
                >
                  {requestApproval.isPending ? "در حال ارسال..." : "ارسال به گردش تأیید"}
                </button>
              )}

              {current.status === "submitted" && (
                <button
                  disabled={approve.isPending}
                  onClick={() => approve.mutate(current.id)}
                  className="w-full px-4 py-2 rounded-xl bg-brand text-brand-ink hover:bg-brand-hover disabled:opacity-50 focus-ring"
                >
                  تأیید مرجوعی
                </button>
              )}

              {(current.status === "approved" || current.status === "partially_approved") && (
                <div className="space-y-2 border-t border-line pt-3">
                  <div className="text-ink-muted">تعیین تکلیف اقلام</div>
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
                        className="w-full h-8.5 px-2.5 text-[13px] rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60"
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
                        className="w-full h-8.5 px-2.5 text-[13px] rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer pe-8"
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
                    className="w-full px-4 py-2 rounded-xl bg-brand text-brand-ink hover:bg-brand-hover disabled:opacity-50 focus-ring"
                  >
                    ثبت نهایی دریافت
                  </button>
                </div>
              )}

              {current.status === "posted" && !current.credit_note && (
                <div className="space-y-1">
                  <button
                    disabled={issueCreditNote.isPending || !canCreditNote}
                    onClick={() => issueCreditNote.mutate(current.id)}
                    title={!canCreditNote ? "مجوز صدور یادداشت بستانکار (sales.return.credit) را ندارید" : undefined}
                    className="w-full px-4 py-2 rounded-xl bg-brand text-brand-ink hover:bg-brand-hover disabled:opacity-50 focus-ring"
                  >
                    {issueCreditNote.isPending ? "در حال صدور یادداشت بستانکار..." : "صدور یادداشت بستانکار"}
                  </button>
                  {!canCreditNote && (
                    <p className="text-xs text-ink-subtle">مجوز صدور یادداشت بستانکار را ندارید — فقط کاربران مالی می‌توانند صادر کنند.</p>
                  )}
                </div>
              )}

              {current.credit_note && (
                <div className="border border-line rounded-xl p-3 space-y-1 bg-surface-alt">
                  <div className="text-ink-muted text-xs">یادداشت بستانکار متصل</div>
                  <div className="flex justify-between">
                    <span className="font-mono">#{current.credit_note.doc_number}</span>
                    <span>{CN_STATUS_FA[current.credit_note.status] ?? current.credit_note.status}</span>
                  </div>
                  <div className="flex justify-between text-xs text-ink-muted">
                    <span>مبلغ</span>
                    <span className="font-mono" dir="ltr">{current.credit_note.amount}</span>
                  </div>
                </div>
              )}

              {decisionError && (
                <div className="text-sm text-danger-ink bg-danger-soft border border-danger-line rounded-lg px-3 py-2">{decisionError}</div>
              )}

              {/* TASK-PM-02-C3: اسناد و تصاویر دلیل مرجوعی، متصل به همین درخواست */}
              <div className="border-t border-line pt-3">
                <EntityAttachments
                  ownerType="return_request"
                  ownerId={current.id}
                  showNavigation={false}
                />
              </div>

              <div className="border-t border-line pt-3">
                <div className="text-ink-muted mb-2">اقلام</div>
                <ul className="space-y-1">
                  {(detail.data?.lines ?? []).map((l) => (
                    <li key={l.product_id} className="flex justify-between text-xs">
                      <span className="font-mono">{l.product_id.slice(0, 8)}…</span>
                      <span>
                        {l.qty}
                        {l.qty_approved != null && ` ← ${l.qty_approved} (${DISPOSITION_FA[l.disposition] ?? l.disposition})`}
                        {l.invoice_line_id && <span className="text-ink-subtle"> · متصل به قلم فاکتور</span>}
                      </span>
                    </li>
                  ))}
                  {(detail.data?.lines ?? []).length === 0 && <li className="text-ink-subtle">قلمی ثبت نشده</li>}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
