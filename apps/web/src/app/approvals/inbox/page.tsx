"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";

/**
 * TASK-24Y — کارتابلِ تأیید.
 *
 * چرا این صفحه جداست: صفحهٔ `/approvals` موجود، «همهٔ درخواست‌های شرکت» را نشان
 * می‌دهد (`GET /rules-engine/approvals`). ولی پرسشِ روزمرهٔ یک تأییدکننده این
 * نیست؛ پرسشِ او این است: «الان نوبتِ من کدام است؟». `approvals/inbox` دقیقاً
 * همین را از سمتِ سرور پاسخ می‌دهد (مرحلهٔ جاری = نقش/کارمندِ من، یا نمایندگیِ
 * معتبر). بنابراین فیلترِ سمتِ کلاینت انجام نمی‌شود — مرجعِ حقیقت سرور است.
 *
 * همهٔ برچسب‌ها فارسی و جهتِ صفحه از `layout.tsx` برابرِ `rtl` است؛ در استایل‌ها
 * از `text-start`/`ps-`/`pe-` استفاده شده، نه `left`/`right`، تا RTL شکسته نشود.
 */

type InboxItem = {
  id: string;
  entity_type: string;
  entity_id: string;
  status: string;
  current_step: number;
  amount: string | null;
  created_at: string;
  expires_at: string | null;
  escalated_at: string | null;
  chain_code: string;
  chain_entity: string;
};

type DelegationRow = {
  id: string;
  delegator_id: string;
  delegate_id: string;
  operation: string | null;
  valid_from: string;
  valid_to: string;
  reason: string;
  is_active: boolean;
};

const ENTITY_FA: Record<string, string> = {
  sales_order: "سفارش فروش",
  return_request: "درخواست مرجوعی",
  purchase_order: "سفارش خرید",
  margin_exception: "استثنای کف سود",
  customer_request: "درخواست مشتری",
};

const faEntity = (v: string) => ENTITY_FA[v] ?? v;

const faDate = (iso: string | null): string => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("fa-IR");
  } catch {
    return iso.slice(0, 10);
  }
};

/** آیا مهلت گذشته است؟ مبنای نمایش، نه تصمیم — تصمیم سمتِ سرور گرفته می‌شود. */
const isOverdue = (iso: string | null): boolean => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t < Date.now();
};

const faMoney = (v: string | null): string => {
  if (v === null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString("fa-IR");
};

export default function ApprovalInboxPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"inbox" | "delegations">("inbox");
  const [selected, setSelected] = useState<InboxItem | null>(null);
  const [decision, setDecision] = useState<"approved" | "rejected" | "returned">("approved");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const inbox = useQuery({
    queryKey: ["approval-inbox"],
    queryFn: async () => {
      const res = await api.GET("/rules-engine/approvals/inbox");
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data ?? []) as InboxItem[];
    },
  });

  const delegations = useQuery({
    queryKey: ["approval-delegations"],
    queryFn: async () => {
      const res = await api.GET("/rules-engine/approval-delegations");
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data ?? []) as DelegationRow[];
    },
    enabled: tab === "delegations",
  });

  const decide = useMutation({
    mutationFn: async (row: InboxItem) => {
      const res = await api.POST("/rules-engine/approvals/{id}/decision", {
        params: { path: { id: row.id } },
        body: {
          step_no: row.current_step,
          decision,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        },
      });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data;
    },
    onSuccess: () => {
      setError(null);
      setSelected(null);
      setComment("");
      void qc.invalidateQueries({ queryKey: ["approval-inbox"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.DELETE("/rules-engine/approval-delegations/{id}", {
        params: { path: { id } },
      });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data;
    },
    onSuccess: () => {
      setError(null);
      void qc.invalidateQueries({ queryKey: ["approval-delegations"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const rows = inbox.data ?? [];
  const overdueCount = useMemo(() => rows.filter((r) => isOverdue(r.expires_at)).length, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-ink">کارتابل تأیید من</h1>
          <p className="text-ink-muted text-sm">
            درخواست‌هایی که بر اساس نقش شما نوبت تصمیمشان رسیده است
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTab("inbox")}
            className={`focus-ring px-3 py-1.5 rounded-lg text-sm border ${
              tab === "inbox" ? "border-brand text-brand-soft-ink" : "border-line"
            }`}
          >
            کارتابل
          </button>
          <button
            onClick={() => setTab("delegations")}
            className={`focus-ring px-3 py-1.5 rounded-lg text-sm border ${
              tab === "delegations" ? "border-brand text-brand-soft-ink" : "border-line"
            }`}
          >
            واگذاری‌ها
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-danger-ink bg-danger-soft border border-danger-line rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {tab === "inbox" && (
        <>
          {overdueCount > 0 && (
            <div className="text-sm text-warn-ink bg-warn-soft border border-warn-line rounded-lg px-3 py-2">
              {overdueCount.toLocaleString("fa-IR")} درخواست از مهلت گذشته است؛ در اجرای بعدی چرخهٔ
              انقضا/ارتقا بسته یا ارتقا می‌شوند.
            </div>
          )}

          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-surface border border-line rounded-2xl overflow-hidden">
              {inbox.isError && (
                <div className="p-4 text-sm text-danger-ink">{(inbox.error as Error).message}</div>
              )}
              <table className="w-full text-sm">
                <thead className="bg-surface-alt text-ink-muted">
                  <tr>
                    <th className="text-start px-4 py-3 font-medium">نوع سند</th>
                    <th className="text-start px-4 py-3 font-medium">زنجیره</th>
                    <th className="text-start px-4 py-3 font-medium">مبلغ</th>
                    <th className="text-start px-4 py-3 font-medium">مرحله</th>
                    <th className="text-start px-4 py-3 font-medium">مهلت</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const late = isOverdue(r.expires_at);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setSelected(r)}
                        className={`border-t border-line cursor-pointer hover:bg-surface-hover ${
                          selected?.id === r.id ? "bg-brand-soft" : ""
                        }`}
                      >
                        <td className="px-4 py-3">{faEntity(r.entity_type)}</td>
                        <td className="px-4 py-3 text-ink-muted">{r.chain_code}</td>
                        <td className="px-4 py-3">{faMoney(r.amount)}</td>
                        <td className="px-4 py-3">{r.current_step.toLocaleString("fa-IR")}</td>
                        <td className={`px-4 py-3 ${late ? "text-danger-ink" : ""}`}>
                          {faDate(r.expires_at)}
                          {late && <span className="ms-1">(گذشته)</span>}
                        </td>
                      </tr>
                    );
                  })}
                  {!inbox.isLoading && rows.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-ink-subtle">
                        در حال حاضر درخواستی در نوبت شما نیست
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-surface border border-line rounded-2xl p-5 h-fit space-y-3">
              <div className="font-semibold">ثبت تصمیم</div>
              {!selected && <div className="text-sm text-ink-subtle">یک درخواست را انتخاب کنید</div>}
              {selected && (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-ink-muted">نوع سند</span>
                    <span>{faEntity(selected.entity_type)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">مبلغ</span>
                    <span>{faMoney(selected.amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-muted">مرحله جاری</span>
                    <span>{selected.current_step.toLocaleString("fa-IR")}</span>
                  </div>

                  <div>
                    <label className="text-ink-muted" htmlFor="decision">
                      تصمیم
                    </label>
                    <select
                      id="decision"
                      value={decision}
                      onChange={(e) =>
                        setDecision(e.target.value as "approved" | "rejected" | "returned")
                      }
                      className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink mt-1 pe-8 cursor-pointer focus-ring"
                    >
                      <option value="approved">تأیید</option>
                      <option value="rejected">رد</option>
                      <option value="returned">بازگردانی برای اصلاح</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-ink-muted" htmlFor="comment">
                      توضیح
                    </label>
                    <textarea
                      id="comment"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-line bg-surface text-ink px-3 py-2.5 text-sm leading-relaxed mt-1 focus-ring"
                    />
                  </div>

                  <button
                    disabled={decide.isPending}
                    onClick={() => decide.mutate(selected)}
                    className="w-full px-4 py-2 rounded-xl bg-brand text-brand-ink hover:bg-brand-hover disabled:opacity-50 focus-ring"
                  >
                    ثبت تصمیم
                  </button>
                  <p className="text-xs text-ink-subtle leading-relaxed">
                    تصمیم بازنویسی‌شدنی نیست؛ در صورت اشتباه، تصمیم تازه‌ای ثبت کنید.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {tab === "delegations" && (
        <div className="bg-surface border border-line rounded-2xl overflow-hidden">
          {delegations.isError && (
            <div className="p-4 text-sm text-danger-ink">
              {(delegations.error as Error).message}
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="bg-surface-alt text-ink-muted">
              <tr>
                <th className="text-start px-4 py-3 font-medium">عملیات</th>
                <th className="text-start px-4 py-3 font-medium">از تاریخ</th>
                <th className="text-start px-4 py-3 font-medium">تا تاریخ</th>
                <th className="text-start px-4 py-3 font-medium">دلیل</th>
                <th className="text-start px-4 py-3 font-medium">وضعیت</th>
                <th className="text-start px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {(delegations.data ?? []).map((d) => (
                <tr key={d.id} className="border-t border-line">
                  <td className="px-4 py-3">{d.operation ?? "همهٔ عملیات"}</td>
                  <td className="px-4 py-3">{faDate(d.valid_from)}</td>
                  <td className="px-4 py-3">{faDate(d.valid_to)}</td>
                  <td className="px-4 py-3 text-ink-muted">{d.reason}</td>
                  <td className="px-4 py-3">{d.is_active ? "فعال" : "لغو شده"}</td>
                  <td className="px-4 py-3">
                    {d.is_active && (
                      <button
                        onClick={() => revoke.mutate(d.id)}
                        disabled={revoke.isPending}
                        className="text-danger-ink text-sm focus-ring rounded px-2 py-1"
                      >
                        لغو
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!delegations.isLoading && (delegations.data?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-ink-subtle">
                    واگذاری‌ای ثبت نشده است
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
