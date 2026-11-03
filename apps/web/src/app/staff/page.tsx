"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, getToken } from "@/lib/api";
import { useRouter } from "next/navigation";

/**
 * پرسنل — /staff (فاز C):
 * فهرست با فیلتر سمت/میدانی، ساخت پرسنل از شخص موجود و فعال/غیرفعال‌سازی.
 */
type Staff = {
  id: string;
  person_id: string;
  job_position_code: string;
  employee_no: string | null;
  is_field: boolean;
  status: string;
  supervisor_id: string | null;
  row_version?: number;
};

const STATUS_FA: Record<string, string> = {
  active: "فعال",
  inactive: "غیرفعال",
};

export default function StaffPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [isField, setIsField] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ person_id: "", job_position_code: "", employee_no: "", is_field: true });
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  const list = useQuery({
    queryKey: ["staff", isField],
    queryFn: async () => {
      const res = await api.GET("/staff", {
        params: {
          query: {
            ...(isField ? { is_field: isField === "true" } : {}),
            limit: 100,
          },
        },
      });
      if (res.error) throw new Error(errorMessage(res.error));
      return { items: (res.data?.items ?? []) as Staff[] };
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const body: {
        person_id: string;
        is_field: boolean;
        job_position_code?: string;
        employee_no?: string;
      } = {
        person_id: form.person_id.trim(),
        is_field: form.is_field,
      };
      if (form.job_position_code.trim()) body.job_position_code = form.job_position_code.trim();
      if (form.employee_no.trim()) body.employee_no = form.employee_no.trim();
      const res = await api.POST("/staff", { body });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data as Staff;
    },
    onSuccess: () => {
      setFormError(null);
      setShowForm(false);
      setForm({ person_id: "", job_position_code: "", employee_no: "", is_field: true });
      void qc.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (s: Staff) => {
      const next = s.status === "active" ? "inactive" : "active";
      const res = await api.PATCH("/staff/{id}", { params: { path: { id: s.id } }, body: { status: next } });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data as Staff;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["staff"] }),
    onError: (e: Error) => setFormError(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">پرسنل</h1>
          <p className="text-ink-muted text-sm">ویزیتور سرد/گرم، موزع، انباردار و سایر سمت‌ها</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 rounded-xl bg-brand text-white hover:bg-brand-hover"
        >
          {showForm ? "بستن" : "پرسنل جدید"}
        </button>
      </div>

      {formError && (
        <div className="text-sm text-danger-ink bg-danger-soft border border-danger/25 rounded-lg px-3 py-2">{formError}</div>
      )}

      {showForm && (
        <div className="bg-surface border border-line rounded-2xl p-6 space-y-4">
          <div className="font-semibold">تعریف پرسنل (نسبت به شخص موجود)</div>
          <div className="grid md:grid-cols-4 gap-4">
            <div>
              <label className="text-sm text-ink">شناسه شخص *</label>
              <input
                value={form.person_id}
                onChange={(e) => setForm({ ...form, person_id: e.target.value })}
                className="w-full mt-1 px-3 py-2 rounded-xl border border-line bg-transparent"
                placeholder="uuid"
              />
            </div>
            <div>
              <label className="text-sm text-ink">کد سمت</label>
              <input
                value={form.job_position_code}
                onChange={(e) => setForm({ ...form, job_position_code: e.target.value })}
                className="w-full mt-1 px-3 py-2 rounded-xl border border-line bg-transparent"
                placeholder="مثلاً salesperson_cold"
              />
            </div>
            <div>
              <label className="text-sm text-ink">شماره پرسنلی</label>
              <input
                value={form.employee_no}
                onChange={(e) => setForm({ ...form, employee_no: e.target.value })}
                className="w-full mt-1 px-3 py-2 rounded-xl border border-line bg-transparent"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={form.is_field}
                  onChange={(e) => setForm({ ...form, is_field: e.target.checked })}
                />
                نیروی میدانی
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              disabled={create.isPending}
              onClick={() => create.mutate()}
              className="px-4 py-2 rounded-xl bg-brand text-white hover:bg-brand-hover disabled:opacity-50"
            >
              ثبت
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl border border-line hover:bg-surface-hover"
            >
              انصراف
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setIsField("")}
          className={`px-3 py-1.5 rounded-lg text-sm border ${!isField ? "border-brand text-brand-soft-ink" : "border-line"}`}
        >
          همه
        </button>
        <button
          onClick={() => setIsField("true")}
          className={`px-3 py-1.5 rounded-lg text-sm border ${isField === "true" ? "border-brand text-brand-soft-ink" : "border-line"}`}
        >
          فقط میدانی‌ها
        </button>
        <button
          onClick={() => setIsField("false")}
          className={`px-3 py-1.5 rounded-lg text-sm border ${isField === "false" ? "border-brand text-brand-soft-ink" : "border-line"}`}
        >
          غیرمیدانی
        </button>
      </div>

      <div className="bg-surface border border-line rounded-2xl overflow-hidden">
        {list.isError && <div className="p-4 text-sm text-danger-ink">{(list.error as Error).message}</div>}
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-ink-muted">
            <tr>
              <th className="text-right px-4 py-3 font-medium">شخص</th>
              <th className="text-right px-4 py-3 font-medium">سمت</th>
              <th className="text-right px-4 py-3 font-medium">شماره پرسنلی</th>
              <th className="text-right px-4 py-3 font-medium">میدانی</th>
              <th className="text-right px-4 py-3 font-medium">وضعیت</th>
              <th className="text-right px-4 py-3 font-medium">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.items ?? []).map((s) => (
              <tr key={s.id} className="border-t border-line">
                <td className="px-4 py-3 font-mono text-xs">{s.person_id.slice(0, 8)}…</td>
                <td className="px-4 py-3 font-mono text-xs">{s.job_position_code || "—"}</td>
                <td className="px-4 py-3">{s.employee_no ?? "—"}</td>
                <td className="px-4 py-3">{s.is_field ? "بله" : "خیر"}</td>
                <td className="px-4 py-3">{STATUS_FA[s.status] ?? s.status}</td>
                <td className="px-4 py-3">
                  <button
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate(s)}
                    className="px-2 py-1 rounded-lg border border-line text-xs hover:bg-surface-hover"
                  >
                    {s.status === "active" ? "مسدودسازی" : "فعال‌سازی"}
                  </button>
                </td>
              </tr>
            ))}
            {!list.isLoading && (list.data?.items?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-subtle">
                  پرسنلی تعریف نشده است
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
