"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import AdminGuard from "@/components/auth/guards";
import { useToast } from "@/components/ui/Toast";

/**
 * تنظیمات سامانه — GET /settings (مؤثر) و PATCH /settings (به‌روزرسانی).
 * جایگزین برچسب خالیِ پیشین. هر ردیف یک SettingEntry با کلید/مقدار و دامنه
 * (global/company/branch/area) است؛ حوزه‌ها فقط محدودهٔ خود را می‌بینند.
 * مقدارها در جا قابل ویرایش‌اند و با «ذخیرهٔ تغییرات» تنها ردیف‌های تغییرکرده
 * PATCH می‌شوند.
 */
type SettingEntry = components["schemas"]["SettingEntry"];

const SCOPE_FA: Record<string, string> = {
  global: "سراسری",
  company: "شرکت",
  branch: "شعبه",
  area: "حوزه",
};

function SettingsInner() {
  const toast = useToast();
  const qc = useQueryClient();
  const [scopeType, setScopeType] = useState("");
  const [draft, setDraft] = useState<Record<string, string>>({});

  const { data, isLoading, error } = useQuery({
    queryKey: ["settings", scopeType],
    queryFn: async () => {
      const query: { scope_type?: "global" | "company" | "branch" | "area" } = {};
      if (scopeType) query.scope_type = scopeType as SettingEntry["scope_type"];
      const res = await api.GET("/settings", { params: { query } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as SettingEntry[];
    },
  });

  const items = useMemo(() => data ?? [], [data]);

  // هم‌زمان‌سازی draft با مقادیر سرور هر بار که داده تازه می‌شود
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const it of items) next[it.key] = it.value ?? "";
    setDraft(next);
  }, [items]);

  const changed = useMemo(
    () => items.filter((it) => (draft[it.key] ?? "") !== (it.value ?? "")),
    [items, draft],
  );

  const save = useMutation({
    mutationFn: async () => {
      const payload: SettingEntry[] = changed.map((it) => ({
        ...it,
        value: draft[it.key] ?? "",
      }));
      const res = await api.PATCH("/settings", { body: { items: payload } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as SettingEntry[];
    },
    onSuccess: () => {
      toast.success(`${changed.length} تنظیم ذخیره شد`);
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">تنظیمات</h1>
          <p className="text-ink-muted text-sm">
            تنظیمات عمومی و تفکیکی هر حوزه/شعبه — حوزه‌ها فقط محدودهٔ خود را می‌بینند
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={scopeType}
            onChange={(e) => setScopeType(e.target.value)}
            className="px-3 py-2 rounded-xl border border-line-strong bg-surface text-sm text-ink"
          >
            <option value="">همهٔ دامنه‌ها</option>
            {Object.entries(SCOPE_FA).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button
            onClick={() => save.mutate()}
            disabled={changed.length === 0 || save.isPending}
            className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium"
          >
            {save.isPending ? "در حال ذخیره..." : `ذخیرهٔ تغییرات (${changed.length})`}
          </button>
        </div>
      </div>

      <div className="bg-surface border border-line rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-ink-muted text-sm">در حال بارگذاری تنظیمات...</div>
        ) : error ? (
          <div className="p-6 text-danger-ink text-sm">{(error as Error).message}</div>
        ) : items.length === 0 ? (
          <div className="p-6 text-ink-muted text-sm">تنظیمی یافت نشد</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-alt text-ink-muted text-xs">
              <tr>
                <th className="text-right px-4 py-3 font-medium">کلید</th>
                <th className="text-right px-4 py-3 font-medium">مقدار</th>
                <th className="text-right px-4 py-3 font-medium">دامنه</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((it) => {
                const isChanged = (draft[it.key] ?? "") !== (it.value ?? "");
                return (
                  <tr key={`${it.key}:${it.scope_type ?? ""}:${it.scope_id ?? ""}`}>
                    <td className="px-4 py-2 font-mono text-xs text-ink">{it.key}</td>
                    <td className="px-4 py-2">
                      <input
                        value={draft[it.key] ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, [it.key]: e.target.value }))}
                        className={`w-full px-3 py-1.5 rounded-lg border bg-surface text-sm text-ink ${ isChanged ? "border-amber-400" : "border-line" }`}
                      />
                    </td>
                    <td className="px-4 py-2 text-xs text-ink-muted">
                      {SCOPE_FA[it.scope_type ?? ""] ?? it.scope_type ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <AdminGuard>
      <SettingsInner />
    </AdminGuard>
  );
}
