"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, getToken } from "@/lib/api";
import { useRouter } from "next/navigation";

/**
 * محدوده‌های جغرافیایی — /geofences (فاز D):
 * لیست، ساخت polygon، ویرایش نام/وضعیت و حذف.
 */
const KINDS = ["work_area", "customer", "warehouse", "restricted"] as const;
const KIND_FA: Record<string, string> = {
  work_area: "حوزه کاری",
  customer: "مشتری",
  warehouse: "انبار",
  restricted: "ممنوع",
};

type Geofence = {
  id: string;
  name: string;
  kind: string;
  customer_id: string | null;
  warehouse_id: string | null;
  is_active: boolean;
  area: { type: string; coordinates: number[][][] } | null;
};

/** متن JSON چندضلعی را به ساختار GeoJSON تبدیل می‌کند */
const parsePolygon = (text: string): { type: "Polygon"; coordinates: number[][][] } | null => {
  try {
    const obj = JSON.parse(text);
    if (obj?.type !== "Polygon" || !Array.isArray(obj.coordinates)) return null;
    return obj;
  } catch {
    return null;
  }
};

export default function GeofencesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", kind: "work_area" as string, customer_id: "", polygon: "" });
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  const list = useQuery({
    queryKey: ["geofences"],
    queryFn: async () => {
      const res = await api.GET("/geofences", { params: { query: { limit: 100 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return { items: (res.data?.items ?? []) as Geofence[] };
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const polygon = parsePolygon(form.polygon.trim());
      if (!polygon) throw new Error("JSON چندضعبی معتبر نیست؛ نمونه: {\"type\":\"Polygon\",\"coordinates\":[[[51,35],[51.1,35],[51.1,35.1],[51,35.1],[51,35]]]}");
      const kind = form.kind as "work_area" | "customer" | "warehouse" | "restricted";
      const customer_id = form.customer_id.trim() || undefined;
      if (editId) {
        const res = await api.PATCH("/geofences/{id}", {
          params: { path: { id: editId } },
          body: { name: form.name.trim(), kind, area: polygon, ...(customer_id ? { customer_id } : {}) },
        });
        if (res.error) throw new Error(errorMessage(res.error));
        return res.data as Geofence;
      }
      const res = await api.POST("/geofences", {
        body: { name: form.name.trim(), kind, area: polygon, ...(customer_id ? { customer_id } : {}) },
      });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data as Geofence;
    },
    onSuccess: () => {
      setFormError(null);
      setShowForm(false);
      setEditId(null);
      setForm({ name: "", kind: "work_area", customer_id: "", polygon: "" });
      void qc.invalidateQueries({ queryKey: ["geofences"] });
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.DELETE("/geofences/{id}", { params: { path: { id } } });
      if (res.error) throw new Error(errorMessage(res.error));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["geofences"] }),
    onError: (e: Error) => setFormError(e.message),
  });

  const openEdit = (g: Geofence): void => {
    setEditId(g.id);
    setForm({
      name: g.name,
      kind: g.kind,
      customer_id: g.customer_id ?? "",
      polygon: g.area ? JSON.stringify(g.area) : "",
    });
    setFormError(null);
    setShowForm(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink">محدوده‌های جغرافیایی</h1>
          <p className="text-ink-muted text-sm">حوزه کاری، محدوده مشتریان و انبارها روی نقشه</p>
        </div>
        <button
          onClick={() => {
            setEditId(null);
            setForm({ name: "", kind: "work_area", customer_id: "", polygon: "" });
            setFormError(null);
            setShowForm((v) => !v);
          }}
          className="px-4 py-2 rounded-xl bg-brand text-brand-ink hover:bg-brand-hover focus-ring"
        >
          {showForm ? "بستن" : "محدوده جدید"}
        </button>
      </div>

      {formError && (
        <div className="text-sm text-danger-ink bg-danger-soft border border-danger-line rounded-lg px-3 py-2">{formError}</div>
      )}

      {showForm && (
        <div className="bg-surface border border-line rounded-2xl p-6 space-y-4">
          <div className="font-semibold">{editId ? "ویرایش محدوده" : "محدوده جدید"}</div>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-ink">نام *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 mt-1"
              />
            </div>
            <div>
              <label className="text-sm text-ink">نوع *</label>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
                className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer pe-8 mt-1"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_FA[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-ink">شناسه مشتری (برای نوع مشتری)</label>
              <input
                value={form.customer_id}
                onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 mt-1"
                placeholder="uuid"
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-ink">
              چندضعبی GeoJSON (Polygon با حلقهٔ بسته) *
            </label>
            <textarea
              value={form.polygon}
              onChange={(e) => setForm({ ...form, polygon: e.target.value })}
              rows={4}
              dir="ltr"
              placeholder='{"type":"Polygon","coordinates":[[[51,35],[51.1,35],[51.1,35.1],[51,35.1],[51,35]]]}'
              className="w-full rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 px-3 py-2.5 text-sm leading-relaxed mt-1 font-mono"
            />
          </div>
          <div className="flex gap-2">
            <button
              disabled={save.isPending}
              onClick={() => save.mutate()}
              className="px-4 py-2 rounded-xl bg-brand text-brand-ink hover:bg-brand-hover disabled:opacity-50 focus-ring"
            >
              ذخیره
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl border border-line hover:bg-surface-hover focus-ring"
            >
              انصراف
            </button>
          </div>
        </div>
      )}

      <div className="bg-surface border border-line rounded-2xl overflow-hidden">
        {list.isError && <div className="p-4 text-sm text-danger-ink">{(list.error as Error).message}</div>}
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-ink-muted">
            <tr>
              <th className="text-start px-4 py-3 font-medium">نام</th>
              <th className="text-start px-4 py-3 font-medium">نوع</th>
              <th className="text-start px-4 py-3 font-medium">وضعیت</th>
              <th className="text-start px-4 py-3 font-medium">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.items ?? []).map((g) => (
              <tr key={g.id} className="border-t border-line">
                <td className="px-4 py-3">{g.name}</td>
                <td className="px-4 py-3">{KIND_FA[g.kind] ?? g.kind}</td>
                <td className="px-4 py-3">{g.is_active ? "فعال" : "غیرفعال"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEdit(g)}
                      className="px-2 py-1 rounded-lg border border-line text-xs hover:bg-surface-hover focus-ring"
                    >
                      ویرایش
                    </button>
                    <button
                      disabled={remove.isPending}
                      onClick={() => {
                        if (confirm(`محدوده «${g.name}» حذف شود؟`)) remove.mutate(g.id);
                      }}
                      className="px-2 py-1 rounded-lg border border-danger-line text-danger-ink text-xs hover:bg-danger-soft focus-ring"
                    >
                      حذف
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!list.isLoading && (list.data?.items?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-ink-subtle">
                  محدوده‌ای تعریف نشده است
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
