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
      const res = await (api as any).GET("/geofences", { params: { query: { limit: 100 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data as { items: Geofence[] };
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const polygon = parsePolygon(form.polygon.trim());
      if (!polygon) throw new Error("JSON چندضعبی معتبر نیست؛ نمونه: {\"type\":\"Polygon\",\"coordinates\":[[[51,35],[51.1,35],[51.1,35.1],[51,35.1],[51,35]]]}");
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        kind: form.kind,
        area: polygon,
      };
      if (form.customer_id.trim()) payload.customer_id = form.customer_id.trim();
      if (editId) {
        const res = await (api as any).PATCH(`/geofences/${editId}`, { body: payload });
        if (res.error) throw new Error(errorMessage(res.error));
        return res.data as Geofence;
      }
      const res = await (api as any).POST("/geofences", { body: payload });
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
      const res = await (api as any).DELETE(`/geofences/${id}`);
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
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">محدوده‌های جغرافیایی</h1>
          <p className="text-slate-500 text-sm">حوزه کاری، محدوده مشتریان و انبارها روی نقشه</p>
        </div>
        <button
          onClick={() => {
            setEditId(null);
            setForm({ name: "", kind: "work_area", customer_id: "", polygon: "" });
            setFormError(null);
            setShowForm((v) => !v);
          }}
          className="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {showForm ? "بستن" : "محدوده جدید"}
        </button>
      </div>

      {formError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{formError}</div>
      )}

      {showForm && (
        <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-[#1f2937] rounded-2xl p-6 space-y-4">
          <div className="font-semibold">{editId ? "ویرایش محدوده" : "محدوده جدید"}</div>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-slate-700 dark:text-slate-300">نام *</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1f2937] bg-transparent"
              />
            </div>
            <div>
              <label className="text-sm text-slate-700 dark:text-slate-300">نوع *</label>
              <select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
                className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1f2937] bg-transparent"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_FA[k]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-slate-700 dark:text-slate-300">شناسه مشتری (برای نوع مشتری)</label>
              <input
                value={form.customer_id}
                onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1f2937] bg-transparent"
                placeholder="uuid"
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-slate-700 dark:text-slate-300">
              چندضعبی GeoJSON (Polygon با حلقهٔ بسته) *
            </label>
            <textarea
              value={form.polygon}
              onChange={(e) => setForm({ ...form, polygon: e.target.value })}
              rows={4}
              dir="ltr"
              placeholder='{"type":"Polygon","coordinates":[[[51,35],[51.1,35],[51.1,35.1],[51,35.1],[51,35]]]}'
              className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-[#1f2937] bg-transparent font-mono text-xs"
            />
          </div>
          <div className="flex gap-2">
            <button
              disabled={save.isPending}
              onClick={() => save.mutate()}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              ذخیره
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-[#1f2937] hover:bg-slate-50 dark:hover:bg-[#1f2937]"
            >
              انصراف
            </button>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-[#1f2937] rounded-2xl overflow-hidden">
        {list.isError && <div className="p-4 text-sm text-red-600">{(list.error as Error).message}</div>}
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-[#1f2937] text-slate-500">
            <tr>
              <th className="text-right px-4 py-3 font-medium">نام</th>
              <th className="text-right px-4 py-3 font-medium">نوع</th>
              <th className="text-right px-4 py-3 font-medium">وضعیت</th>
              <th className="text-right px-4 py-3 font-medium">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {(list.data?.items ?? []).map((g) => (
              <tr key={g.id} className="border-t border-slate-100 dark:border-[#1f2937]">
                <td className="px-4 py-3">{g.name}</td>
                <td className="px-4 py-3">{KIND_FA[g.kind] ?? g.kind}</td>
                <td className="px-4 py-3">{g.is_active ? "فعال" : "غیرفعال"}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEdit(g)}
                      className="px-2 py-1 rounded-lg border border-slate-200 dark:border-[#1f2937] text-xs hover:bg-slate-50 dark:hover:bg-[#1f2937]"
                    >
                      ویرایش
                    </button>
                    <button
                      disabled={remove.isPending}
                      onClick={() => {
                        if (confirm(`محدوده «${g.name}» حذف شود؟`)) remove.mutate(g.id);
                      }}
                      className="px-2 py-1 rounded-lg border border-red-200 text-red-600 text-xs hover:bg-red-50"
                    >
                      حذف
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!list.isLoading && (list.data?.items?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
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
