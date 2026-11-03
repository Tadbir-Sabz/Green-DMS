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
  accepted: "bg-brand-soft text-brand-soft-ink",
  sent: "bg-info-soft text-info-ink",
  sending: "bg-info-soft text-info-ink",
  queued: "bg-surface-alt text-ink-muted",
  retrying: "bg-warning-soft text-warning-ink",
  rejected: "bg-danger-soft text-danger-ink",
  dead: "bg-danger-soft text-danger-ink",
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
          <h1 className="text-xl font-bold text-ink">سامانه مؤدیان</h1>
          <p className="text-ink-muted text-sm">وضعیت صف ارسال فاکتور به سامانهٔ مؤدیان</p>
        </div>
        <button onClick={() => refetch()} className="px-3 py-2 rounded-xl border border-line hover:bg-surface-hover text-ink">بروزرسانی</button>
      </div>
      {error && <div className="text-sm text-danger-ink bg-danger-soft border border-danger-line rounded-lg px-3 py-2">{(error as Error).message}</div>}
      <div className="bg-surface border border-line rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-line font-semibold text-ink">صف ارسال</div>
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-ink-muted">
            <tr>
              <th className="text-right p-3">فاکتور</th>
              <th className="text-right p-3">وضعیت</th>
              <th className="text-right p-3">تلاش</th>
              <th className="text-right p-3">آخرین خطا</th>
              <th className="text-right p-3">زمان</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="text-center p-6 text-ink-muted">در حال بارگذاری...</td></tr>}
            {!isLoading && items.length === 0 && <tr><td colSpan={5} className="text-center p-6 text-ink-subtle">صفی برای نمایش نیست</td></tr>}
            {!isLoading && items.map((j) => (
              <tr key={j.id} className="border-t border-line hover:bg-surface-hover">
                <td className="p-3 font-mono text-xs">{j.invoice_id ? j.invoice_id.slice(0, 8) : "-"}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${STATUS_COLOR[j.status] ?? "bg-surface-alt text-ink-muted"}`}>{STATUS_FA[j.status] ?? j.status}</span>
                </td>
                <td className="p-3">{j.attempt_count ?? 0}</td>
                <td className="p-3 text-xs text-danger-ink max-w-[240px] truncate" title={j.last_error ?? undefined}>{j.last_error || "-"}</td>
                <td className="p-3 text-xs text-ink-muted">{j.created_at || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
