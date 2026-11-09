"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  btnGhost,
  btnPrimary,
  errorCls,
  faError,
  inputCls,
  okCls,
  panelCls,
  type ProductFamily,
  type Category,
} from "../products-lib";

export default function CatalogSettings() {
  const auth = useAuth();
  const canWrite = auth.hasPermission("master.product.update");
  const [families, setFamilies] = useState<ProductFamily[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [kind, setKind] = useState<"family" | "category">("family");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [editing, setEditing] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [f, c] = await Promise.all([
        api.GET("/product-families"),
        api.GET("/product-categories"),
      ]);
      if (f.error || c.error) {
        setError(faError(f.error ?? c.error));
        return;
      }
      setFamilies(f.data ?? []);
      setCategories(c.data?.items ?? []);
    } catch {
      setError("ارتباط با سرور برقرار نشد.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!canWrite) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = editing
        ? await api.PATCH("/product-families/{id}", {
            params: { path: { id: editing } },
            body: { name: name.trim() },
          })
        : kind === "family"
          ? await api.POST("/product-families", {
              body: { code: code.trim(), name: name.trim() },
            })
          : await api.POST("/product-categories", {
              body: { code: code.trim(), name: name.trim() },
            });
      if (result.error) {
        setError(faError(result.error));
        return;
      }
      setCode("");
      setName("");
      setEditing("");
      await load();
      setNotice("تغییرات ذخیره شد.");
    } catch {
      setError("ذخیره ناموفق بود؛ دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }
  async function toggleFamily(row: ProductFamily) {
    if (!canWrite) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api.PATCH('/product-families/{id}', {params:{path:{id:row.id}}, body:{is_active:row.is_active === false}});
      if (result.error) {setError(faError(result.error));return;}
      await load(); setNotice('وضعیت خانواده ذخیره شد. وضعیت کالاهای قبلی تغییر نکرد.');
    } catch {setError('تغییر وضعیت خانواده ناموفق بود.');} finally {setBusy(false);}
  }
  return (
    <main dir="rtl" className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">خانواده‌ها و گروه‌های کالا</h1>
        <Link className={btnGhost} href="/products">
          بازگشت به کاتالوگ
        </Link>
      </header>
      <p className="text-sm text-ink-muted">
        خانواده هویت مشترک variantهاست؛ گروه برای دسته‌بندی مرکزی است. تغییر نام
        خانواده هویت یا کد کالاهای موجود را تغییر نمی‌دهد.
      </p>
      {error && (
        <p role="alert" className={errorCls}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className={okCls}>
          {notice}
        </p>
      )}
      {canWrite ? (
        <form
          onSubmit={(e) => void save(e)}
          className={`${panelCls} grid gap-3 sm:grid-cols-2`}
          aria-busy={busy}
        >
          <h2 className="font-medium sm:col-span-2">
            {editing ? "ویرایش نام خانواده" : "ثبت اطلاعات پایه"}
          </h2>
          {!editing && (
            <label>
              نوع
              <select
                className={inputCls}
                value={kind}
                disabled={busy}
                onChange={(e) =>
                  setKind(e.target.value as "family" | "category")
                }
              >
                <option value="family">خانواده</option>
                <option value="category">گروه</option>
              </select>
            </label>
          )}
          {!editing && (
            <label>
              کد
              <input
                className={inputCls}
                dir="ltr"
                required
                maxLength={64}
                value={code}
                disabled={busy}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
          )}
          <label>
            نام
            <input
              className={inputCls}
              required
              maxLength={255}
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="flex items-end gap-2">
            <button
              className={btnPrimary}
              disabled={busy || !name.trim() || (!editing && !code.trim())}
            >
              {busy ? "در حال ذخیره…" : "ذخیره"}
            </button>
            {editing && (
              <button
                type="button"
                className={btnGhost}
                disabled={busy}
                onClick={() => {
                  setEditing("");
                  setName("");
                }}
              >
                انصراف
              </button>
            )}
          </div>
        </form>
      ) : (
        <p className="text-sm text-ink-muted">
          این نشست مجوز تغییر اطلاعات پایه ندارد.
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {[
          ["خانواده‌ها", families],
          ["گروه‌ها", categories],
        ].map(([title, rows]) => (
          <section key={String(title)} className={panelCls}>
            <h2 className="mb-3 font-medium">{String(title)}</h2>
            {loading ? (
              <p role="status">در حال دریافت…</p>
            ) : (
              <>
                <ul className="max-h-96 space-y-2 overflow-auto">
                  {(rows as ProductFamily[]).map((row) => (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded border border-line p-3"
                    >
                      <span>
                        {row.name}{row.is_active === false ? ' · غیرفعال' : ''}{' '}
                        <bdi className="text-xs text-ink-muted">
                          ({row.code})
                        </bdi>
                      </span>
                      {title === "خانواده‌ها" && canWrite && (<button className={btnGhost} disabled={busy} onClick={()=>void toggleFamily(row)}>{row.is_active === false ? 'فعال‌سازی' : 'غیرفعال‌سازی'}</button>)}
                  {title === "خانواده‌ها" && canWrite && (
                        <button
                          className={btnGhost}
                          disabled={busy}
                          onClick={() => {
                            setEditing(row.id);
                            setName(row.name);
                            setNotice("");
                          }}
                        >
                          ویرایش نام
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {!(rows as ProductFamily[]).length && (
                  <p className="text-sm text-ink-muted">
                    هنوز موردی ثبت نشده است.
                  </p>
                )}
              </>
            )}
          </section>
        ))}
      </div>
      <button
        className={btnGhost}
        disabled={loading}
        onClick={() => void load()}
      >
        تلاش مجدد / تازه‌سازی
      </button>
    </main>
  );
}
