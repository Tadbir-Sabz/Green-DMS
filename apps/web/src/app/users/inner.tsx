"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { toPersianDateTime } from "@/lib/date";

/**
 * مدیریت کاربران — GET/POST/PATCH /users (ماژول identity-rbac).
 * «فروشنده» لزوماً کاربر نیست؛ اینجا فقط کاربران سیستم (وب/اپ) مدیریت می‌شوند.
 * فیلدهای writeOnly (password/first_name/…) فقط در ساخت پذیرفته می‌شوند.
 */
type User = components["schemas"]["User"];
type Role = components["schemas"]["Role"];

const ACCESS_FA: Record<string, string> = {
  web: "وب",
  field_sales: "فروش میدانی",
  field_delivery: "توزیع میدانی",
  field_telesales: "فروش تلفنی",
  scope_only: "فقط محدوده",
  none: "بدون دسترسی",
};

const EMPTY = {
  username: "",
  password: "",
  first_name: "",
  last_name: "",
  access_level: "web",
  role_ids: [] as string[],
};

export default function UsersInner() {
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(0);

  const { data, isLoading, error } = useQuery({
    queryKey: ["users", version],
    queryFn: async () => {
      const res = await api.GET("/users", { params: { query: { limit: 200 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as User[];
    },
  });

  const { data: roles } = useQuery({
    queryKey: ["roles-for-users"],
    queryFn: async () => {
      const res = await api.GET("/roles", { params: { query: { limit: 200 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Role[];
    },
  });

  const roleName = useCallback(
    (id: string) => (roles ?? []).find((r) => r.id === id)?.name ?? id.slice(0, 8),
    [roles],
  );

  const items = data ?? [];

  const openForm = () => {
    setForm(EMPTY);
    setFormError(null);
    setShowForm(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!form.username.trim() || !form.password) {
      setFormError("نام کاربری و رمز عبور الزامی است.");
      return;
    }
    setSaving(true);
    const body = {
      username: form.username.trim(),
      password: form.password,
      access_level: form.access_level as User["access_level"],
      role_ids: form.role_ids,
      // اگر staff_id داده نشود، شخص تازه از first/last ساخته می‌شود
      ...(form.first_name.trim() ? { first_name: form.first_name.trim() } : {}),
      ...(form.last_name.trim() ? { last_name: form.last_name.trim() } : {}),
    };
    const res = await api.POST("/users", { body: body as User });
    setSaving(false);
    if (res.error) {
      setFormError(errorMessage(res.error));
      return;
    }
    toast.success(`کاربر «${form.username}» ساخته شد`);
    setShowForm(false);
    setVersion((v) => v + 1);
  };

  const toggleActive = async (u: User) => {
    const res = await api.PATCH("/users/{id}", {
      params: { path: { id: u.id! } },
      body: { is_active: !(u.is_active ?? true) } as User,
    });
    if (res.error) {
      toast.error(errorMessage(res.error));
      return;
    }
    toast.success(u.is_active ? "کاربر غیرفعال شد" : "کاربر فعال شد");
    setVersion((v) => v + 1);
  };

  const columns: Column<User>[] = [
    { key: "username", header: "نام کاربری", render: (u) => <span className="font-mono text-xs">{u.username}</span> },
    {
      key: "roles",
      header: "نقش‌ها",
      render: (u) => (
        <div className="flex flex-wrap gap-1">
          {(u.role_ids ?? []).length === 0 && <span className="text-ink-subtle">—</span>}
          {(u.role_ids ?? []).map((id) => (
            <span key={id} className="px-2 py-0.5 rounded-md bg-surface-alt text-xs">
              {roleName(id)}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: "status",
      header: "وضعیت",
      render: (u) => {
        if (u.locked_until && new Date(u.locked_until) > new Date())
          return <span className="text-danger-ink text-xs">قفل (تا {toPersianDateTime(u.locked_until)})</span>;
        return u.is_active ? (
          <span className="text-brand-soft-ink text-xs">فعال</span>
        ) : (
          <span className="text-ink-subtle text-xs">غیرفعال</span>
        );
      },
    },
    { key: "last_login", header: "آخرین ورود", render: (u) => <span className="text-xs">{toPersianDateTime(u.last_login_at)}</span> },
    {
      key: "actions",
      header: "",
      align: "end",
      render: (u) => (
        <button
          onClick={() => toggleActive(u)}
          className="px-2.5 py-1 rounded-lg border border-line-strong text-xs text-ink hover:bg-surface-hover focus-ring"
        >
          {u.is_active ? "غیرفعال‌سازی" : "فعال‌سازی"}
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">کاربران</h1>
          <p className="text-ink-muted text-sm">کاربران سیستم، نقش‌ها و وضعیت دسترسی</p>
        </div>
        <button onClick={openForm} className="px-3 py-2 rounded-xl bg-brand hover:bg-brand-hover text-brand-ink text-sm font-medium focus-ring">
          کاربر جدید
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(u) => u.id ?? u.username}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        emptyMessage="کاربری یافت نشد"
      />

      <Modal
        open={showForm}
        onClose={() => setShowForm(false)}
        title="ساخت کاربر جدید"
        footer={
          <>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl border border-line-strong text-sm text-ink hover:bg-surface-hover focus-ring">
              انصراف
            </button>
            <button onClick={submit} disabled={saving} className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover disabled:opacity-50 text-brand-ink text-sm font-medium focus-ring">
              {saving ? "در حال ذخیره..." : "ذخیره"}
            </button>
          </>
        }
      >
        <form onSubmit={submit} className="space-y-3">
          {formError && <div className="text-sm text-danger-ink bg-danger-soft border border-danger-line rounded-lg px-3 py-2">{formError}</div>}
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs text-ink-muted">نام کاربری *</span>
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 mt-1" dir="ltr" />
            </label>
            <label className="block">
              <span className="text-xs text-ink-muted">رمز عبور *</span>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 mt-1" dir="ltr" />
            </label>
            <label className="block">
              <span className="text-xs text-ink-muted">نام</span>
              <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 mt-1" />
            </label>
            <label className="block">
              <span className="text-xs text-ink-muted">نام خانوادگی</span>
              <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 mt-1" />
            </label>
            <label className="block">
              <span className="text-xs text-ink-muted">سطح دسترسی</span>
              <select value={form.access_level} onChange={(e) => setForm({ ...form, access_level: e.target.value })} className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer pe-8 mt-1">
                {Object.entries(ACCESS_FA).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <span className="text-xs text-ink-muted">نقش‌ها</span>
            <div className="mt-1 flex flex-wrap gap-2">
              {(roles ?? []).map((r) => {
                const on = form.role_ids.includes(r.id!);
                return (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        role_ids: on ? f.role_ids.filter((x) => x !== r.id) : [...f.role_ids, r.id!],
                      }))
                    }
                    className={`focus-ring px-3 py-1.5 rounded-lg text-xs border ${on ? "bg-brand border-brand text-white" : "border-line-strong text-ink"}`}
                  >
                    {r.name}
                  </button>
                );
              })}
              {(roles ?? []).length === 0 && <span className="text-xs text-ink-subtle">نقشی تعریف نشده است</span>}
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
