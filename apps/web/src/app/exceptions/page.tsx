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

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  const list = useQuery({
    queryKey: ["exception-items"],
    queryFn: async () => {
      // مسیر rules-engine در openapi نیست (فاز F سند می‌شود)
      const res = await (api as any).GET("/rules-engine/exception-items");
      if (res.error) {
        const msg = errorMessage(res.error);
        setError(msg);
        throw new Error(msg);
      }
      return res.data as ExceptionItem[];
    },
  });

  const items = list.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">صف استثناها</h1>
        <p className="text-slate-500 text-sm">رویدادهای خارج از قاعده که نیازمند بازبینی انسانی‌اند</p>
      </div>

      {(error || list.isError) && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error ?? (list.error as Error).message}
        </div>
      )}

      <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-[#1f2937] rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-[#1f2937] text-slate-500">
            <tr>
              <th className="text-right px-4 py-3 font-medium">نوع</th>
              <th className="text-right px-4 py-3 font-medium">شدت</th>
              <th className="text-right px-4 py-3 font-medium">مرجع</th>
              <th className="text-right px-4 py-3 font-medium">وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id} className="border-t border-slate-100 dark:border-[#1f2937]">
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
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  استثنایی ثبت نشده است
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
