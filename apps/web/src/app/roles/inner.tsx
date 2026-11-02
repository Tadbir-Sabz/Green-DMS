"use client";

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

/**
 * نقش‌ها و دسترسی‌ها — GET/POST /roles (ماژول identity-rbac).
 * هر نقش مجموعه‌ای از «الگوهای مجوز» دارد («*» همه، «x.y» زیرمجموعه) که از
 * seed مهاجرت 0022 می‌آید. نقش‌های سیستمی (is_system) قابل حذف نیستند.
 */
type Role = components["schemas"]["Role"];

const EMPTY = { code: "", name: "", permission_codes: "" };

export default function RolesInner() {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["roles", version],
    queryFn: async () => {
      const res = await api.GET("/roles", { params: { query: { limit: 200 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Role[];
    },
  });

  const items = data ?? [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.code.trim() || !form.name.trim()) {
      setFormError("کد و نام نقش الزامی است.");
      return;
    }
    setSaving(true);
    const perms = form.permission_codes
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const body = { code: form.code.trim(), name: form.name.trim(), permission_codes: perms };
    const res = await api.POST("/roles", { body: body as Role });
    setSaving(false);
    if (res.error) {
      setFormError(errorMessage(res.error));
      return;
    }
    toast.success(`نقش «${form.name}» ساخته شد`);
    setShowForm(false);
    setForm(EMPTY);
    setVersion((v) => v + 1);
  };

  const columns: Column<Role>[] = [
    {
      key: "code",
      header: "کد",
      render: (r) => <span className="font-mono text-xs">{r.code}</span>,
    },
    {
      key: "name",
      header: "نام نقش",
      render: (r) => (
        <span>
          {r.name}
          {r.is_system && (
            <span className="mr-2 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-[#1f2937] text-[10px] text-slate-500">سیستمی</span>
          )}
        </span>
      ),
    },
    {
      key: "perms",
      header: "مجوزها",
      render: (r) => {
        const codes = r.permission_codes ?? [];
        const isExpanded = expanded === r.id;
        return (
          <button
            onClick={() => setExpanded(isExpanded ? null : r.id ?? null)}
            className="text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            {codes.length} مجوز {isExpanded ? "▲" : "▼"}
            {isExpanded && (
              <span className="block mt-2 space-y-1 text-right">
                {codes.map((c) => (
                  <code key={c} dir="ltr" className="block px-2 py-0.5 rounded bg-slate-50 dark:bg-[#0b1220] text-[11px] text-slate-600 dark:text-slate-300">
                    {c}
                  </code>
                ))}
                {codes.length === 0 && <span className="text-slate-400">بدون مجوز</span>}
              </span>
            )}
          </button>
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">نقش‌ها و دسترسی‌ها</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">تعریف نقش و نگاشت الگوهای مجوز</p>
        </div>
        <button
          onClick={() => {
            setForm(EMPTY);
            setFormError(null);
            setShowForm(true);
          }}
          className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium"
        >
          نقش جدید
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(r) => r.id ?? r.code}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        emptyMessage="نقشی یافت نشد"
      />

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="ساخت نقش جدید"
        footer={
          <>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl border border-slate-300 dark:border-[#1f2937] text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1f2937]">
              انصراف
            </button>
            <button onClick={submit} disabled={saving} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-medium">
              {saving ? "در حال ذخیره..." : "ذخیره"}
            </button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-3">
          {formError && <div className="text-sm text-rose-600 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 rounded-lg px-3 py-2">{formError}</div>}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-slate-500 dark:text-slate-400">کد نقش *</span>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="salesperson_cold" dir="ltr" className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#1f2937] bg-white dark:bg-[#0f172a] text-sm" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 dark:text-slate-400">نام نقش *</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="فروشنده سرد" className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#1f2937] bg-white dark:bg-[#0f172a] text-sm" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-slate-500 dark:text-slate-400">الگوهای مجوز (هر خط یا با کاما جدا شود)</span>
            <textarea
              value={form.permission_codes}
              onChange={(e) => setForm({ ...form, permission_codes: e.target.value })}
              rows={5}
              dir="ltr"
              placeholder={"sales.order.view\nsales.order.create\nmaster.customer.view"}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#1f2937] bg-white dark:bg-[#0f172a] text-sm font-mono"
            />
          </label>
          <p className="text-[11px] text-slate-400">
            از «*» برای همهٔ مجوزها یا «x.y.*» برای یک زیرمجموعه استفاده کنید.
          </p>
        </form>
      </Modal>
    </div>
  );
}
