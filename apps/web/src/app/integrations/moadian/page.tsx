"use client";

import { useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";

type MoadianJob = {
  id: string;
  invoice_id?: string;
  status: string;
  attempt_count?: number;
  last_error?: string | null;
  next_retry_at?: string | null;
  created_at?: string;
};

const STATUS_FA: Record<string, string> = {
  queued: "در صف",
  sending: "در حال ارسال",
  sent: "ارسال شد",
  accepted: "پذیرفته شد",
  rejected: "رد شد",
  retrying: "تلاش دوباره",
  dead: "مرده",
};

const STATUS_COLOR: Record<string, string> = {
  accepted: "bg-emerald-100 text-emerald-700",
  sent: "bg-sky-100 text-sky-700",
  sending: "bg-sky-100 text-sky-700",
  queued: "bg-slate-100 text-slate-600",
  retrying: "bg-amber-100 text-amber-700",
  rejected: "bg-rose-100 text-rose-700",
  dead: "bg-rose-100 text-rose-700",
};

/** سامانه مؤدیان — GET /integrations/moadian/status (صف ارسال فاکتور) */
export default function MoadianPage() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["moadian-status"],
    queryFn: async () => {
      const res = await api.GET("/integrations/moadian/status");
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as MoadianJob[];
    },
  });

  const items = data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">سامانه مؤدیان</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">وضعیت صف ارسال فاکتور به سامانهٔ مؤدیان</p>
        </div>
        <button onClick={() => refetch()} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1f2937] hover:bg-slate-50 dark:hover:bg-[#1f2937] text-slate-700 dark:text-slate-200">بروزرسانی</button>
      </div>
      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{(error as Error).message}</div>}
      <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-[#1f2937] rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-[#1f2937] font-semibold text-slate-900 dark:text-slate-100">صف ارسال</div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-[#1f2937] text-slate-500 dark:text-slate-400">
            <tr>
              <th className="text-right p-3">فاکتور</th>
              <th className="text-right p-3">وضعیت</th>
              <th className="text-right p-3">تلاش</th>
              <th className="text-right p-3">آخرین خطا</th>
              <th className="text-right p-3">زمان</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="text-center p-6 text-slate-500">در حال بارگذاری...</td></tr>}
            {!isLoading && items.length === 0 && <tr><td colSpan={5} className="text-center p-6 text-slate-400">صفی برای نمایش نیست</td></tr>}
            {!isLoading && items.map((j) => (
              <tr key={j.id} className="border-t border-slate-100 dark:border-[#1f2937] hover:bg-slate-50 dark:hover:bg-[#1f2937]">
                <td className="p-3 font-mono text-xs">{j.invoice_id ? j.invoice_id.slice(0, 8) : "-"}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLOR[j.status] ?? "bg-slate-100 text-slate-600"}`}>{STATUS_FA[j.status] ?? j.status}</span>
                </td>
                <td className="p-3">{j.attempt_count ?? 0}</td>
                <td className="p-3 text-xs text-rose-600 max-w-[240px] truncate" title={j.last_error ?? undefined}>{j.last_error || "-"}</td>
                <td className="p-3 text-xs text-slate-500">{j.created_at || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
