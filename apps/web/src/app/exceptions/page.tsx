"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage, getToken } from "@/lib/api";
import { useRouter } from "next/navigation";

/**
 * صف استثناها — /rules-engine/exception-items (فاز C):
 * رویدادهای خارج از قاعده (مغایرت تعداد، اختلاف نقدی، نقض geofence و…) برای بازبینی.
 */
type ExceptionItem = {
  id: string;
  branch_id: string;
  kind: string;
  severity: string;
  entity_type: string | null;
  entity_id: string | null;
  status: string;
  created_at?: string;
};

const KIND_FA: Record<string, string> = {
  cash_variance: "اختلاف نقدی",
  count_variance: "مغایرت شمارش",
  geofence_breach: "نقض محدوده",
  sync_conflict: "تعارض همگام‌سازی",
  moadian_error: "خطای مؤدیان",
};

const SEVERITY_FA: Record<string, string> = { low: "کم", medium: "متوسط", high: "زیاد", critical: "بحرانی" };
const STATUS_FA: Record<string, string> = {
  open: "باز",
  acknowledged: "در دست بررسی",
  resolved: "رفع شده",
  ignored: "نادیده گرفته",
};

export default function ExceptionsPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [branchId, setBranchId] = useState("");

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  const list = useQuery({
    queryKey: ["exception-items", branchId],
    enabled: Boolean(branchId.trim()),
    queryFn: async () => {
      const res = await api.GET("/rules-engine/exception-items", {
        params: { query: { branch_id: branchId.trim() } },
      });
      if (res.error) {
        const msg = errorMessage(res.error);
        setError(msg);
        throw new Error(msg);
      }
      setError(null);
      return (res.data ?? []) as ExceptionItem[];
    },
  });

  const items = list.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">صف استثناها</h1>
        <p className="text-ink-muted text-sm">رویدادهای خارج از قاعده که نیازمند بازبینی انسانی‌اند</p>
      </div>

      <div className="bg-surface border border-line rounded-2xl p-4">
        <label className="block text-xs text-ink-muted mb-1">شناسهٔ شعبه *</label>
        <input
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          placeholder="uuid شعبه"
          className="w-full sm:max-w-md px-3 py-2 rounded-xl border border-line bg-transparent text-ink"
        />
      </div>

      {(error || list.isError) && (
        <div className="text-sm text-danger-ink bg-danger-soft border border-danger-line rounded-lg px-3 py-2">
          {error ?? (list.error as Error).message}
        </div>
      )}

      <div className="bg-surface border border-line rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-ink-muted">
            <tr>
              <th className="text-right px-4 py-3 font-medium">نوع</th>
              <th className="text-right px-4 py-3 font-medium">شدت</th>
              <th className="text-right px-4 py-3 font-medium">مرجع</th>
              <th className="text-right px-4 py-3 font-medium">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id} className="border-t border-line">
                <td className="px-4 py-3">{KIND_FA[e.kind] ?? e.kind}</td>
                <td className="px-4 py-3">{SEVERITY_FA[e.severity] ?? e.severity}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {e.entity_type ? `${e.entity_type} · ${e.entity_id?.slice(0, 8) ?? "—"}…` : "—"}
                </td>
                <td className="px-4 py-3">{STATUS_FA[e.status] ?? e.status}</td>
              </tr>
            ))}
            {!list.isLoading && items.length === 0 && !list.isError && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink-subtle">
                  {branchId.trim() ? "استثنایی ثبت نشده است" : "برای دیدن استثناها، شناسهٔ شعبه را وارد کنید"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
