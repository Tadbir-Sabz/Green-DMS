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
  block: "bg-danger-soft text-danger-ink",
  warn: "bg-warning-soft text-warning-ink",
  require_approval: "bg-info-soft text-info-ink",
  set_field: "bg-info-soft text-info-ink",
  notify: "bg-surface-alt text-ink-muted",
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
          {r.message_fa && <div className="text-xs text-ink-subtle mt-0.5">{r.message_fa}</div>}
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
        <span className="text-xs text-ink-muted">
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
            className="text-xs text-brand-soft-ink hover:underline focus-ring"
          >
            {conds.length} شرط / {acts.length} اقدام {isOpen ? "▲" : "▼"}
            {isOpen && (
              <span className="block mt-2 space-y-2 text-start" dir="ltr">
                <code className="block px-2 py-1 rounded bg-surface-alt text-[11px] whitespace-pre-wrap break-all">
                  {JSON.stringify(conds, null, 2)}
                </code>
                <code className="block px-2 py-1 rounded bg-surface-alt text-[11px] whitespace-pre-wrap break-all">
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
          className={`focus-ring px-2.5 py-1 rounded-lg text-xs border disabled:opacity-50 ${ r.is_active ? "border-brand-line text-brand-soft-ink hover:bg-brand-soft" : "border-line-strong text-ink-muted hover:bg-surface-hover" }`}
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
          <h1 className="text-xl font-bold text-ink">موتور قوانین</h1>
          <p className="text-ink-muted text-sm">
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
