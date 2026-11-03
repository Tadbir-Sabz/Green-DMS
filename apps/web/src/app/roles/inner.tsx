"use client";

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { Badge } from "@/components/ui/Badge";

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
            <Badge tone="neutral" size="sm" className="ms-2">
              سیستمی
            </Badge>
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
            className="text-xs text-brand-soft-ink hover:underline"
          >
            {codes.length} مجوز {isExpanded ? "▲" : "▼"}
            {isExpanded && (
              <span className="block mt-2 space-y-1 text-start">
                {codes.map((c) => (
                  <code key={c} dir="ltr" className="block px-2 py-0.5 rounded bg-surface-alt text-[11px] text-ink-muted">
                    {c}
                  </code>
                ))}
                {codes.length === 0 && <span className="text-ink-subtle">بدون مجوز</span>}
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
          <h1 className="text-xl font-bold text-ink">نقش‌ها و دسترسی‌ها</h1>
          <p className="text-ink-muted text-sm">تعریف نقش و نگاشت الگوهای مجوز</p>
        </div>
        <button
          onClick={() => {
            setForm(EMPTY);
            setFormError(null);
            setShowForm(true);
          }}
          className="px-3 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-medium"
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
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl border border-line-strong text-sm text-ink hover:bg-surface-hover">
              انصراف
            </button>
            <button onClick={submit} disabled={saving} className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-50 text-white text-sm font-medium">
              {saving ? "در حال ذخیره..." : "ذخیره"}
            </button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-3">
          {formError && <div className="text-sm text-danger-ink bg-danger-soft border border-danger-line rounded-lg px-3 py-2">{formError}</div>}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-ink-muted">کد نقش *</span>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="salesperson_cold" dir="ltr" className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 mt-1" />
            </label>
            <label className="block">
              <span className="text-xs text-ink-muted">نام نقش *</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="فروشنده سرد" className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 mt-1" />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-ink-muted">الگوهای مجوز (هر خط یا با کاما جدا شود)</span>
            <textarea
              value={form.permission_codes}
              onChange={(e) => setForm({ ...form, permission_codes: e.target.value })}
              rows={5}
              dir="ltr"
              placeholder={"sales.order.view\nsales.order.create\nmaster.customer.view"}
              className="w-full rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 px-3 py-2.5 text-sm leading-relaxed mt-1 font-mono"
            />
          </label>
          <p className="text-[11px] text-ink-subtle">
            از «*» برای همهٔ مجوزها یا «x.y.*» برای یک زیرمجموعه استفاده کنید.
          </p>
        </form>
      </Modal>
    </div>
  );
}
