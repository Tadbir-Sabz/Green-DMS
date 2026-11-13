"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  type Brand,
  type Category,
  type Unit,
  btnGhost,
  errorCls,
  faError,
  selectCls,
} from "../products-lib";
import { brandOptionLabel, categoryPathLabel, unitOptionLabel } from "./reference-data-lib";

/**
 * انتخابگرهای مرجع فرم کالا (TASK-PM-02-C2).
 *
 * - حالت «ساخت» فقط رکوردهای فعال را میگیرد؛ حالت «ویرایش» همه را میگیرد تا
 *   مقدار تاریخی کالا (حتی اگر مرجع بعداً غیرفعال شده) درست نمایش داده شود، ولی
 *   گزینههای غیرفعال غیرجاری disabledاند. سرور هم مستقلاً مرجع غیرفعال/نامعتبر
 *   را رد میکند؛ بنابراین UI هیچ اعتبارسنجی امنیتی را جایگزین سرور نمیکند.
 * - بارگذاری/خطا/تلاش مجدد/حالت خالی و پیوند به صفحهٔ مدیریت، همگی واقعیاند.
 */

export interface ReferenceSelection {
  category_id: string;
  base_uom_id: string;
  brand_id: string;
}

interface Props {
  value: ReferenceSelection;
  onChange: (next: ReferenceSelection) => void;
  mode: "create" | "edit";
  disabled?: boolean;
}

const ACTIVE_QUERY = { is_active: true, limit: 200 } as const;
const ALL_QUERY = { limit: 200 } as const;

export function ReferenceSelectors({ value, onChange, mode, disabled = false }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = mode === "create" ? ACTIVE_QUERY : ALL_QUERY;
      const [cats, unts, brds] = await Promise.all([
        api.GET("/reference-data/categories", { params: { query } }),
        api.GET("/reference-data/units", { params: { query } }),
        api.GET("/reference-data/brands", { params: { query } }),
      ]);
      const failure = cats.error ?? unts.error ?? brds.error;
      if (failure) {
        setError(faError(failure));
        return;
      }
      setCategories(cats.data?.items ?? []);
      setUnits(unts.data?.items ?? []);
      setBrands(brds.data?.items ?? []);
    } catch {
      setError("ارتباط با سرور برای دریافت دادههای مرجع برقرار نشد.");
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    void load();
  }, [load]);

  /** در فرم ساخت، نخستین گروه/واحد فعال را بهعنوان پیشفرض قرار میدهد. */
  useEffect(() => {
    if (mode !== "create" || loading || error) return;
    const nextCategory = value.category_id || categories[0]?.id || "";
    const nextUom = value.base_uom_id || units[0]?.id || "";
    if (nextCategory !== value.category_id || nextUom !== value.base_uom_id) {
      onChange({ ...value, category_id: nextCategory, base_uom_id: nextUom });
    }
  }, [mode, loading, error, categories, units, value, onChange]);

  const set = (key: keyof ReferenceSelection, nextValue: string): void =>
    onChange({ ...value, [key]: nextValue });

  const optionState = (row: { id: string; is_active?: boolean }, current: string) => {
    const active = row.is_active !== false;
    const isCurrent = row.id === current;
    return {
      disabled: mode === "edit" && !active && !isCurrent,
      suffix: active ? "" : " · غیرفعال",
    };
  };

  if (loading) {
    return (
      <div className="sm:col-span-2 lg:col-span-3" aria-busy="true">
        <p role="status" className="text-sm text-ink-muted">در حال دریافت برند، واحد و دستهبندی…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sm:col-span-2 lg:col-span-3">
        <p role="alert" className={errorCls}>{error}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button className={btnGhost} type="button" onClick={() => void load()}>تلاش مجدد</button>
          <a className={btnGhost} href="/products/reference-data">مدیریت دادههای مرجع</a>
        </div>
      </div>
    );
  }

  const noCategories = categories.length === 0;
  const noUnits = units.length === 0;

  return (
    <>
      <label className="text-sm">
        گروه کالا *
        <select
          className={`${selectCls} mt-1`}
          aria-label="گروه کالا"
          value={value.category_id}
          disabled={disabled || noCategories}
          required
          onChange={(e) => set("category_id", e.target.value)}
        >
          {noCategories && <option value="">— گروه فعالی ثبت نشده —</option>}
          {categories.map((c) => {
            const state = optionState(c, value.category_id);
            return (
              <option key={c.id} value={c.id} disabled={state.disabled}>
                {categoryPathLabel(categories, c.id)} ({c.code}){state.suffix}
              </option>
            );
          })}
        </select>
      </label>
      <label className="text-sm">
        واحد پایه * <span className="text-xs text-warning-ink">(حساس — D4)</span>
        <select
          className={`${selectCls} mt-1`}
          aria-label="واحد پایه"
          value={value.base_uom_id}
          disabled={disabled || noUnits}
          required
          onChange={(e) => set("base_uom_id", e.target.value)}
        >
          {noUnits && <option value="">— واحد فعالی ثبت نشده —</option>}
          {units.map((u) => {
            const state = optionState(u, value.base_uom_id);
            return (
              <option key={u.id} value={u.id} disabled={state.disabled}>
                {unitOptionLabel(u)}{state.suffix}
              </option>
            );
          })}
        </select>
      </label>
      <label className="text-sm">
        برند
        <select
          className={`${selectCls} mt-1`}
          aria-label="برند"
          value={value.brand_id}
          disabled={disabled}
          onChange={(e) => set("brand_id", e.target.value)}
        >
          <option value="">— بدون برند —</option>
          {brands.map((b) => {
            const state = optionState(b, value.brand_id);
            return (
              <option key={b.id} value={b.id} disabled={state.disabled}>
                {brandOptionLabel(b)}{state.suffix}
              </option>
            );
          })}
        </select>
      </label>
      {(noCategories || noUnits) && (
        <p className="text-xs text-ink-muted sm:col-span-2 lg:col-span-3">
          برای ثبت کالا حداقل یک گروه و یک واحد فعال لازم است.{" "}
          <a className="underline" href="/products/reference-data">از اینجا ثبت کنید</a>.
        </p>
      )}
      {mode === "create" && (
        <p className="text-xs text-ink-muted sm:col-span-2 lg:col-span-3">
          فقط مراجع فعال قابلانتخاباند؛ اعتبارسنجی نهایی سمت سرور انجام میشود.
        </p>
      )}
    </>
  );
}
