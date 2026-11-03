"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage, getToken } from "@/lib/api";
import { useRouter } from "next/navigation";

/**
 * مناطق و مسیرهای فروش — /areas و /routes (فاز C):
 * سلسله‌مراتب حوزه‌ها (والد/فرزند) و مسیر بازدید مشتریان.
 */
type Area = {
  id: string;
  code: string;
  name: string;
  parent_area_id: string | null;
  is_active: boolean;
};

type Route = {
  id: string;
  area_id: string;
  code: string;
  name: string;
  visit_weekday: number | null;
  is_active: boolean;
  customer_ids?: string[];
};

const WEEKDAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];

export default function RoutesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [areaForm, setAreaForm] = useState({ code: "", name: "", parent_area_id: "" });
  const [routeForm, setRouteForm] = useState({ area_id: "", code: "", name: "", visit_weekday: "" });
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!getToken()) router.replace("/login");
  }, [router]);

  const areas = useQuery({
    queryKey: ["areas"],
    queryFn: async () => {
      const res = await api.GET("/areas", { params: { query: { limit: 100 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Area[];
    },
  });

  const routes = useQuery({
    queryKey: ["routes"],
    queryFn: async () => {
      const res = await api.GET("/routes", { params: { query: { limit: 100 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Route[];
    },
  });

  const invalidate = (): void => {
    void qc.invalidateQueries({ queryKey: ["areas"] });
    void qc.invalidateQueries({ queryKey: ["routes"] });
  };

  const createArea = useMutation({
    mutationFn: async () => {
      const body: { code: string; name: string; parent_area_id?: string } = {
        code: areaForm.code.trim(),
        name: areaForm.name.trim(),
      };
      if (areaForm.parent_area_id.trim()) body.parent_area_id = areaForm.parent_area_id.trim();
      const res = await api.POST("/areas", { body });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data;
    },
    onSuccess: () => {
      setFormError(null);
      setAreaForm({ code: "", name: "", parent_area_id: "" });
      invalidate();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const createRoute = useMutation({
    mutationFn: async () => {
      const body: { area_id: string; code: string; name: string; visit_weekday?: number } = {
        area_id: routeForm.area_id.trim(),
        code: routeForm.code.trim(),
        name: routeForm.name.trim(),
      };
      if (routeForm.visit_weekday !== "") body.visit_weekday = Number(routeForm.visit_weekday);
      const res = await api.POST("/routes", { body });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data;
    },
    onSuccess: () => {
      setFormError(null);
      setRouteForm({ area_id: "", code: "", name: "", visit_weekday: "" });
      invalidate();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const areaName = (id: string): string => areas.data?.find((a) => a.id === id)?.name ?? id.slice(0, 8);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-bold text-ink">مناطق و مسیرهای فروش</h1>
        <p className="text-ink-muted text-sm">حوزه‌های جغرافیایی و ترتیب بازدید مشتریان در هر مسیر</p>
      </div>

      {formError && (
        <div className="text-sm text-danger-ink bg-danger-soft border border-danger-line rounded-lg px-3 py-2">{formError}</div>
      )}

      {/* مناطق */}
      <section className="space-y-4">
        <div className="font-semibold text-ink">مناطق (حوزه‌ها)</div>
        <div className="bg-surface border border-line rounded-2xl p-4">
          <div className="grid md:grid-cols-4 gap-3">
            <input
              placeholder="کد *"
              value={areaForm.code}
              onChange={(e) => setAreaForm({ ...areaForm, code: e.target.value })}
              className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60"
            />
            <input
              placeholder="نام *"
              value={areaForm.name}
              onChange={(e) => setAreaForm({ ...areaForm, name: e.target.value })}
              className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60"
            />
            <input
              placeholder="شناسه والد (اختیاری)"
              value={areaForm.parent_area_id}
              onChange={(e) => setAreaForm({ ...areaForm, parent_area_id: e.target.value })}
              className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60"
            />
            <button
              disabled={createArea.isPending}
              onClick={() => createArea.mutate()}
              className="px-4 py-2 rounded-xl bg-brand text-white hover:bg-brand-hover disabled:opacity-50 text-sm"
            >
              افزودن منطقه
            </button>
          </div>
        </div>
        <div className="bg-surface border border-line rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt text-ink-muted">
              <tr>
                <th className="text-start px-4 py-3 font-medium">کد</th>
                <th className="text-start px-4 py-3 font-medium">نام</th>
                <th className="text-start px-4 py-3 font-medium">والد</th>
                <th className="text-start px-4 py-3 font-medium">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {(areas.data ?? []).map((a) => (
                <tr key={a.id} className="border-t border-line">
                  <td className="px-4 py-3 font-mono">{a.code}</td>
                  <td className="px-4 py-3">{a.name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{a.parent_area_id ? a.parent_area_id.slice(0, 8) + "…" : "—"}</td>
                  <td className="px-4 py-3">{a.is_active ? "فعال" : "غیرفعال"}</td>
                </tr>
              ))}
              {!areas.isLoading && (areas.data?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-ink-subtle">
                    منطقه‌ای ثبت نشده است
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* مسیرها */}
      <section className="space-y-4">
        <div className="font-semibold text-ink">مسیرهای بازدید</div>
        <div className="bg-surface border border-line rounded-2xl p-4">
          <div className="grid md:grid-cols-5 gap-3">
            <select
              value={routeForm.area_id}
              onChange={(e) => setRouteForm({ ...routeForm, area_id: e.target.value })}
              className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer pe-8"
            >
              <option value="">منطقه *</option>
              {(areas.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <input
              placeholder="کد *"
              value={routeForm.code}
              onChange={(e) => setRouteForm({ ...routeForm, code: e.target.value })}
              className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60"
            />
            <input
              placeholder="نام *"
              value={routeForm.name}
              onChange={(e) => setRouteForm({ ...routeForm, name: e.target.value })}
              className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60"
            />
            <select
              value={routeForm.visit_weekday}
              onChange={(e) => setRouteForm({ ...routeForm, visit_weekday: e.target.value })}
              className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer pe-8"
            >
              <option value="">روز بازدید</option>
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
            <button
              disabled={createRoute.isPending}
              onClick={() => createRoute.mutate()}
              className="px-4 py-2 rounded-xl bg-brand text-white hover:bg-brand-hover disabled:opacity-50 text-sm"
            >
              افزودن مسیر
            </button>
          </div>
        </div>
        <div className="bg-surface border border-line rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt text-ink-muted">
              <tr>
                <th className="text-start px-4 py-3 font-medium">کد</th>
                <th className="text-start px-4 py-3 font-medium">نام</th>
                <th className="text-start px-4 py-3 font-medium">منطقه</th>
                <th className="text-start px-4 py-3 font-medium">روز بازدید</th>
                <th className="text-start px-4 py-3 font-medium">تعداد مشتری</th>
              </tr>
            </thead>
            <tbody>
              {(routes.data ?? []).map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-4 py-3 font-mono">{r.code}</td>
                  <td className="px-4 py-3">{r.name}</td>
                  <td className="px-4 py-3">{areaName(r.area_id)}</td>
                  <td className="px-4 py-3">{r.visit_weekday != null ? WEEKDAYS[r.visit_weekday] : "—"}</td>
                  <td className="px-4 py-3">{r.customer_ids?.length ?? 0}</td>
                </tr>
              ))}
              {!routes.isLoading && (routes.data?.length ?? 0) === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-ink-subtle">
                    مسیری ثبت نشده است
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
