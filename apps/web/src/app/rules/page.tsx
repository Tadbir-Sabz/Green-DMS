"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { useToast } from "@/components/ui/Toast";
import { toPersianDate } from "@/lib/date";

/**
 * موتور قوانین — GET /rules?entity&event&is_active (تایپ‌شده از قرارداد).
 * جایگزین جدول ایستای پیشین. هر قاعده شرایط (conditions) و اقدامات (actions)
 * خود را به‌صورت JSON دارد که با کلیک باز می‌شود. کلید فعال/غیرفعال با
 * PATCH /rules/{id} (ارسال کل قاعده با is_active معکوس) تغییر می‌کند.
 */
type Rule = components["schemas"]["Rule"];

const EFFECT_FA: Record<string, string> = {
  block: "مسدودسازی",
  warn: "هشدار",
  require_approval: "نیازمند تأیید",
  set_field: "تنظیم فیلد",
  notify: "اعلان",
};

const EFFECT_COLOR: Record<string, string> = {
  block: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  warn: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  require_approval: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  set_field: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  notify: "bg-slate-100 text-slate-600 dark:bg-[#1f2937] dark:text-slate-300",
};

const EVENT_FA: Record<string, string> = {
  before_save: "پیش از ذخیره",
  before_approve: "پیش از تأیید",
  after_save: "پس از ذخیره",
  on_schedule: "زمان‌بندی‌شده",
};

export default function RulesPage() {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["rules", version],
    queryFn: async () => {
      const res = await api.GET("/rules", { params: { query: { limit: 200 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Rule[];
    },
  });

  const items = data ?? [];

  const toggleActive = async (r: Rule) => {
    if (!r.id) return;
    setToggling(r.id);
    const res = await api.PATCH("/rules/{id}", {
      params: { path: { id: r.id } },
      body: { ...r, is_active: !(r.is_active ?? false) } as Rule,
    });
    setToggling(null);
    if (res.error) {
      toast.error(errorMessage(res.error));
      return;
    }
    toast.success(r.is_active ? "قاعده غیرفعال شد" : "قاعده فعال شد");
    setVersion((v) => v + 1);
  };

  const columns: Column<Rule>[] = [
    { key: "code", header: "کد", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
    {
      key: "title",
      header: "عنوان",
      render: (r) => (
        <div>
          <div>{r.title}</div>
          {r.message_fa && <div className="text-xs text-slate-400 mt-0.5">{r.message_fa}</div>}
        </div>
      ),
    },
    { key: "entity", header: "موجودیت", render: (r) => <span className="font-mono text-xs">{r.entity}</span> },
    { key: "event", header: "رویداد", render: (r) => <span className="text-xs">{EVENT_FA[r.event] ?? r.event}</span> },
    {
      key: "effect",
      header: "اثر",
      render: (r) => (
        <span className={`px-2 py-0.5 rounded-md text-xs ${EFFECT_COLOR[r.effect] ?? ""}`}>
          {EFFECT_FA[r.effect] ?? r.effect}
        </span>
      ),
    },
    {
      key: "validity",
      header: "اعتبار",
      render: (r) => (
        <span className="text-xs text-slate-500">
          {r.valid_from ? toPersianDate(r.valid_from) : "—"} تا {r.valid_to ? toPersianDate(r.valid_to) : "—"}
        </span>
      ),
    },
    {
      key: "detail",
      header: "شرایط/اقدامات",
      render: (r) => {
        const isOpen = expanded === r.id;
        const conds = (r.conditions ?? []) as Record<string, unknown>[];
        const acts = (r.actions ?? []) as Record<string, unknown>[];
        return (
          <button
            onClick={() => setExpanded(isOpen ? null : r.id ?? null)}
            className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            {conds.length} شرط / {acts.length} اقدام {isOpen ? "▲" : "▼"}
            {isOpen && (
              <span className="block mt-2 space-y-2 text-right" dir="ltr">
                <code className="block px-2 py-1 rounded bg-slate-50 dark:bg-[#0b1220] text-[11px] whitespace-pre-wrap break-all">
                  {JSON.stringify(conds, null, 2)}
                </code>
                <code className="block px-2 py-1 rounded bg-slate-50 dark:bg-[#0b1220] text-[11px] whitespace-pre-wrap break-all">
                  {JSON.stringify(acts, null, 2)}
                </code>
              </span>
            )}
          </button>
        );
      },
    },
    {
      key: "active",
      header: "وضعیت",
      align: "end",
      render: (r) => (
        <button
          onClick={() => toggleActive(r)}
          disabled={toggling === r.id}
          className={`px-2.5 py-1 rounded-lg text-xs border disabled:opacity-50 ${
            r.is_active
              ? "border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
              : "border-slate-300 dark:border-[#1f2937] text-slate-500 hover:bg-slate-50 dark:hover:bg-[#1f2937]"
          }`}
        >
          {toggling === r.id ? "..." : r.is_active ? "فعال" : "غیرفعال"}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">موتور قوانین</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            قواعد کنترل (سقف اعتبار، تخفیف، تأیید) با اثر مسدود/هشدار/تأیید
          </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(r) => r.id ?? r.code}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        emptyMessage="قاعده‌ای یافت نشد"
      />
    </div>
  );
}
