"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, getToken } from "@/lib/api";
import { useRouter } from "next/navigation";

/**
 * درخواست‌های تأیید — /rules-engine/approvals (فاز C):
 * فهرست در انتظار تصمیم + ثبت تصمیم (تأیید/رد/بازگردانی) با شماره مرحله.
 */
type ApprovalRequest = {
  id: string;
  approval_chain_id: string;
  entity_type: string;
  entity_id: string;
  amount: number | null;
  status: string;
  current_step: number;
  created_at: string;
};

const STATUS_FA: Record<string, string> = {
  pending: "در انتظار",
  approved: "تأیید شده",
  rejected: "رد شده",
  cancelled: "لغو شده",
};

const DECISIONS = ["approved", "rejected", "returned"] as const;
const DECISION_FA: Record<string, string> = {
  approved: "تأیید",
  rejected: "رد",
  returned: "بازگردانی",
};

export default function ApprovalsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [status, setStatus] = useState("pending");
  const [selected, setSelected] = useState<ApprovalRequest | null>(null);
  const [decision, setDecision] = useState<(typeof DECISIONS)[number]>("approved");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  const list = useQuery({
    queryKey: ["approvals", status],
    queryFn: async () => {
      // مسیر rules-engine در openapi نیست (فاز F سند می‌شود) — فراخوانی مستقیم
      const res = await (api as any).GET("/rules-engine/approvals", {
        params: { query: status ? { status } : {} },
      });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data as ApprovalRequest[];
    },
  });

  const decide = useMutation({
    mutationFn: async (req: ApprovalRequest) => {
      const res = await (api as any).POST(`/rules-engine/approvals/${req.id}/decision`, {
        body: { step_no: req.current_step, decision, ...(comment.trim() ? { comment: comment.trim() } : {}) },
      });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data;
    },
    onSuccess: () => {
      setError(null);
      setComment("");
      setSelected(null);
      void qc.invalidateQueries({ queryKey: ["approvals"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">درخواست‌های تأیید</h1>
        <p className="text-slate-500 text-sm">تصمیم روی درخواست‌های معلق طبق زنجیره تأیید</p>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
      )}

      <div className="flex gap-2 flex-wrap">
        {["", "pending", "approved", "rejected"].map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm border ${
              status === s ? "border-emerald-500 text-emerald-700" : "border-slate-200 dark:border-[#1f2937]"
            }`}
          >
            {s === "" ? "همه" : STATUS_FA[s]}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-[#1f2937] rounded-2xl overflow-hidden">
          {list.isError && <div className="p-4 text-sm text-red-600">{(list.error as Error).message}</div>}
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-[#1f2937] text-slate-500">
              <tr>
                <th className="text-right px-4 py-3 font-medium">نوع سند</th>
                <th className="text-right px-4 py-3 font-medium">مبلغ</th>
                <th className="text-right px-4 py-3 font-medium">مرحله</th>
                <th className="text-right px-4 py-3 font-medium">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {(list.data ?? []).map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className={`border-t border-slate-100 dark:border-[#1f2937] cursor-pointer hover:bg-slate-50 dark:hover:bg-[#1f2937] ${
                    selected?.id === r.id ? "bg-emerald-50 dark:bg-emerald-900/20" : ""
                  }`}
                >
                  <td className="px-4 py-3">{r.entity_type}</td>
                  <td className="px-4 py-3">{r.amount?.toLocaleString("fa-IR") ?? "—"}</td>
                  <td className="px-4 py-3">{r.current_step}</td>
                  <td className="px-4 py-3">{STATUS_FA[r.status] ?? r.status}</td>
                </tr>
              ))}
              {!list.isLoading && (list.data?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                    درخواستی وجود ندارد
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-[#1f2937] rounded-2xl p-5 h-fit space-y-3">
          <div className="font-semibold">ثبت تصمیم</div>
          {!selected && <div className="text-sm text-slate-400">یک درخواست را انتخاب کنید</div>}
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">نوع سند</span>
                <span>{selected.entity_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">مرحله فعلی</span>
                <span>{selected.current_step}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">وضعیت</span>
                <span>{STATUS_FA[selected.status] ?? selected.status}</span>
              </div>

              {selected.status === "pending" && (
                <>
                  <div>
                    <label className="text-slate-500">تصمیم</label>
                    <select
                      value={decision}
                      onChange={(e) => setDecision(e.target.value as (typeof DECISIONS)[number])}
                      className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1f2937] bg-transparent"
                    >
                      {DECISIONS.map((d) => (
                        <option key={d} value={d}>
                          {DECISION_FA[d]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-500">توضیح</label>
                    <textarea
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      rows={2}
                      className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1f2937] bg-transparent"
                    />
                  </div>
                  <button
                    disabled={decide.isPending}
                    onClick={() => decide.mutate(selected)}
                    className="w-full px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    ثبت تصمیم
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
