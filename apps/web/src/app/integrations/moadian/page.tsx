"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function MoadianPage() {
  const { data, refetch } = useQuery({
    queryKey: ["moadian-status"],
    queryFn: async () => {
      try {
        const res = await (api as any).GET?.("/integrations/moadian/status" as any, {});
        return (res as any)?.data || res;
      } catch { return null; }
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">سامانه مؤدیان</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">ارسال فاکتور و وضعیت صف</p>
        </div>
        <button onClick={() => refetch()} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1f2937] hover:bg-slate-50 dark:hover:bg-[#1f2937]">بروزرسانی</button>
      </div>
      <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-[#1f2937] rounded-2xl overflow-hidden shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-[#1f2937] font-semibold text-slate-900 dark:text-slate-100">صف ارسال</div>
        <div className="p-6 text-center text-slate-500 dark:text-slate-400">آماده اتصال به API</div>
      </div>
    </div>
  );
}
