"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import AdminGuard from "@/components/auth/guards";
import { useToast } from "@/components/ui/Toast";
import { toPersianDateTime } from "@/lib/date";

/**
 * یکپارچه‌سازی‌ها — GET /integrations (وضعیت زندهٔ سرویس‌های بیرونی) و
 * POST /integrations/{key}/test (آزمون اتصال، فقط ادمین).
 * جایگزین صفحهٔ ایستای پیشین: اکنون سلامت، آخرین موفقیت و آخرین خطای هر سرویس
 * از قرارداد خوانده می‌شود و کارت‌های مؤدیان/درگاه به صفحهٔ جزئیات می‌برند.
 */
type IntegrationStatus = components["schemas"]["IntegrationStatus"];
type IntegrationKey = "moadian" | "pos" | "sms" | "gateway";

const DETAIL_HREF: Record<string, string> = {
  moadian: "/integrations/moadian",
  gateway: "/integrations/psp",
  pos: "/integrations/psp",
};

const KEY_FA: Record<string, string> = {
  moadian: "سامانه مؤدیان",
  pos: "پوز / درگاه",
  sms: "پیامک",
  gateway: "درگاه پرداخت",
};

function IntegrationsInner() {
  const toast = useToast();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["integrations"],
    queryFn: async () => {
      const res = await api.GET("/integrations");
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as IntegrationStatus[];
    },
  });

  const test = useMutation({
    mutationFn: async (key: IntegrationKey) => {
      const res = await api.POST("/integrations/{key}/test", {
        params: { path: { key } },
      });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data as IntegrationStatus;
    },
    onSuccess: (status) => {
      if (status?.healthy) toast.success(`${KEY_FA[status.key ?? ""] ?? status.key}: اتصال برقرار است`);
      else toast.error(`${KEY_FA[status?.key ?? ""] ?? status?.key}: ${status?.last_error ?? "آزمون ناموفق"}`);
      qc.invalidateQueries({ queryKey: ["integrations"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const items = data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">یکپارچه‌سازی‌ها</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          وضعیت زندهٔ مؤدیان، درگاه پرداخت، پیامک و صف‌ها — به‌همراه آزمون اتصال
        </p>
      </div>

      {isLoading ? (
        <div className="text-slate-500 dark:text-slate-400 text-sm">در حال بارگذاری وضعیت سرویس‌ها...</div>
      ) : error ? (
        <div className="text-rose-600 dark:text-rose-400 text-sm">{(error as Error).message}</div>
      ) : items.length === 0 ? (
        <div className="text-slate-500 dark:text-slate-400 text-sm">سرویسی برای نمایش یافت نشد</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {items.map((s) => {
            const key = (s.key ?? "") as IntegrationKey;
            const href = DETAIL_HREF[key];
            return (
              <div
                key={key}
                className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-[#1f2937] rounded-2xl p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {s.title ?? KEY_FA[key] ?? key}
                    </div>
                    <div className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-0.5">{key}</div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-md text-xs shrink-0 ${
                      s.healthy
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                        : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                    }`}
                  >
                    {s.healthy ? "سالم" : "خطا"}
                  </span>
                </div>

                <dl className="mt-4 space-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500 dark:text-slate-400">آخرین موفقیت</dt>
                    <dd className="text-slate-700 dark:text-slate-300">
                      {s.last_success_at ? toPersianDateTime(s.last_success_at) : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500 dark:text-slate-400">آخرین خطا</dt>
                    <dd className="text-slate-700 dark:text-slate-300 truncate max-w-[60%]" title={s.last_error ?? ""}>
                      {s.last_error ?? "—"}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={() => test.mutate(key)}
                    disabled={test.isPending}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-[#1f2937] text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1f2937] disabled:opacity-40"
                  >
                    {test.isPending && test.variables === key ? "در حال آزمون..." : "آزمون اتصال"}
                  </button>
                  {href && (
                    <Link
                      href={href}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium"
                    >
                      جزئیات
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <AdminGuard>
      <IntegrationsInner />
    </AdminGuard>
  );
}
