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
          {(u.role_ids ?? []).length === 0 && <span className="text-slate-400">—</span>}
          {(u.role_ids ?? []).map((id) => (
            <span key={id} className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-[#1f2937] text-xs">
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
          return <span className="text-rose-600 text-xs">قفل (تا {toPersianDateTime(u.locked_until)})</span>;
        return u.is_active ? (
          <span className="text-emerald-600 text-xs">فعال</span>
        ) : (
          <span className="text-slate-400 text-xs">غیرفعال</span>
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
          className="px-2.5 py-1 rounded-lg border border-slate-300 dark:border-[#1f2937] text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1f2937]"
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
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">کاربران</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">کاربران سیستم، نقش‌ها و وضعیت دسترسی</p>
        </div>
        <button onClick={openForm} className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium">
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
              <span className="text-xs text-slate-500 dark:text-slate-400">نام کاربری *</span>
              <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#1f2937] bg-white dark:bg-[#0f172a] text-sm" dir="ltr" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 dark:text-slate-400">رمز عبور *</span>
              <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#1f2937] bg-white dark:bg-[#0f172a] text-sm" dir="ltr" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 dark:text-slate-400">نام</span>
              <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#1f2937] bg-white dark:bg-[#0f172a] text-sm" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 dark:text-slate-400">نام خانوادگی</span>
              <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#1f2937] bg-white dark:bg-[#0f172a] text-sm" />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500 dark:text-slate-400">سطح دسترسی</span>
              <select value={form.access_level} onChange={(e) => setForm({ ...form, access_level: e.target.value })} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#1f2937] bg-white dark:bg-[#0f172a] text-sm">
                {Object.entries(ACCESS_FA).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </label>
          </div>
          <div>
            <span className="text-xs text-slate-500 dark:text-slate-400">نقش‌ها</span>
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
                    className={`px-3 py-1.5 rounded-lg text-xs border ${on ? "bg-emerald-600 border-emerald-600 text-white" : "border-slate-300 dark:border-[#1f2937] text-slate-700 dark:text-slate-200"}`}
                  >
                    {r.name}
                  </button>
                );
              })}
              {(roles ?? []).length === 0 && <span className="text-xs text-slate-400">نقشی تعریف نشده است</span>}
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
