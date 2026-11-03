'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { components } from '@dms/api-client';
import { api, errorMessage, getToken } from '@/lib/api';
import { AppLoader } from '@/components/AppShell';

/**
 * فهرست و فرم کالا — همه فراخوانی‌ها با کلاینت تایپ‌شده از openapi.yaml:
 *   GET    /products              فهرست با جست‌وجو/فیلتر (صفحه‌بندی cursor)
 *   POST   /products              ساخت کالا
 *   PATCH  /products/{id}         تغییر وضعیت با قفل خوش‌بینانه (row_version)
 *   GET    /product-categories    دسته‌بندی‌ها (واحد فرم)
 *   GET    /units                 واحدهای اندازه‌گیری (واحد فرم)
 */

type Product = components['schemas']['Product'];
type Category = components['schemas']['ProductCategory'];
type Unit = components['schemas']['Unit'];

const STATUS_LABEL: Record<string, string> = {
  active: 'فعال',
  blocked: 'مسدود',
  discontinued: 'متوقف',
};
const DIST_LABEL: Record<string, string> = {
  cold: 'سرد',
  warm: 'گرم',
  both: 'سرد و گرم',
};

const EMPTY_FORM = {
  code: '',
  name: '',
  category_id: '',
  base_uom_id: '',
  distribution_kind: 'both' as 'cold' | 'warm' | 'both',
  min_order_qty: '1',
  is_batch_tracked: false,
  is_expiry_tracked: false,
  shelf_life_days: '',
};

export default function ProductsPage(): React.JSX.Element {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const [items, setItems] = useState<Product[]>([]);
  /** cursor صفحهٔ بعدی — فقط وقتی سرور has_more فرستاده باشد ست می‌شود */
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (query: string, st: string, cursor?: string) => {
    setLoading(true);
    setListError(null);
    const { data, error } = await api.GET('/products', {
      // openapi-fetch: پارامترها داخل params.query؛ نوشتنِ query در سطح بالا نادیده گرفته می‌شود
      params: {
        query: {
          q: query || undefined,
          status: st || undefined,
          cursor: cursor ?? undefined,
          limit: 100,
        },
      },
    });
    setLoading(false);
    if (error) {
      setListError(errorMessage(error));
      return;
    }
    const pageItems = data?.items ?? [];
    // صفحهٔ بعدی به انتهای فهرست می‌چسبد (ادامهٔ cursor طبق قرارداد)
    setItems((prev) => (cursor ? [...prev, ...pageItems] : pageItems));
    setNextCursor(data?.has_more ? (data?.next_cursor ?? null) : null);
  }, []);

  // نگهبان ورود: بدون توکن به صفحه ورود
  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
    void load('', '');
  }, [router, load]);

  const openForm = async (): Promise<void> => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
    const [cats, unts] = await Promise.all([
      api.GET('/product-categories'),
      api.GET('/units'),
    ]);
    const catItems = cats.data?.items ?? [];
    const unitItems = unts.data?.items ?? [];
    setCategories(catItems);
    setUnits(unitItems);
    setForm((f) => ({
      ...f,
      category_id: catItems[0]?.id ?? '',
      base_uom_id: unitItems[0]?.id ?? '',
    }));
  };

  const submitForm = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const { data, error } = await api.POST('/products', {
      body: {
        code: form.code.trim(),
        name: form.name.trim(),
        category_id: form.category_id,
        base_uom_id: form.base_uom_id,
        distribution_kind: form.distribution_kind,
        min_order_qty: form.min_order_qty ? Number(form.min_order_qty) : 1,
        is_batch_tracked: form.is_batch_tracked,
        is_expiry_tracked: form.is_expiry_tracked,
        ...(form.is_expiry_tracked && form.shelf_life_days
          ? { shelf_life_days: Number(form.shelf_life_days) }
          : {}),
      },
    });
    setSaving(false);
    if (error || !data) {
      setFormError(errorMessage(error));
      return;
    }
    setShowForm(false);
    setNotice(`کالا «${data.name}» با کد ${data.code} ساخته شد.`);
    await load(q, status);
  };

  const toggleStatus = async (p: Product): Promise<void> => {
    setNotice(null);
    setListError(null);
    const next = p.status === 'active' ? 'blocked' : 'active';
    const { error } = await api.PATCH('/products/{id}', {
      params: { path: { id: p.id } },
      body: { status: next, row_version: p.row_version },
    });
    if (error) {
      // 409 version_conflict یعنی هم‌زمان ویرایش شده؛ فهرست تازه می‌شود
      setListError(errorMessage(error));
    } else {
      setNotice(`وضعیت «${p.name}» → ${STATUS_LABEL[next]}`);
    }
    await load(q, status);
  };

  if (!ready) return <AppLoader />;

  return (
    <>

      {/* نوار ابزار: جست‌وجو + فیلتر + ساخت */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load(q, status);
        }}
        className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4"
      >
        <label className="flex-1 text-sm">
          جست‌وجو (کد/نام)
          <input
            className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 focus:border-info focus:outline-none"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="مثلاً شیر یا P-100"
          />
        </label>
        <label className="text-sm">
          وضعیت
          <select
            className="mt-1 w-40 rounded-lg border border-line-strong px-3 py-2"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              void load(q, e.target.value);
            }}
          >
            <option value="">همه</option>
            <option value="active">فعال</option>
            <option value="blocked">مسدود</option>
            <option value="discontinued">متوقف</option>
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg border border-line-strong px-4 py-2 text-sm hover:bg-surface-hover"
        >
          جست‌وجو
        </button>
        <button
          type="button"
          onClick={() => void openForm()}
          className="rounded-lg bg-info px-4 py-2 text-sm font-medium text-white hover:bg-info"
        >
          + کالای جدید
        </button>
      </form>

      {notice && (
        <p className="mb-4 rounded-lg bg-brand-soft px-4 py-2 text-sm text-success-ink">
          {notice}
        </p>
      )}
      {listError && (
        <p className="mb-4 rounded-lg bg-danger-soft px-4 py-2 text-sm text-danger-ink">
          {listError}
        </p>
      )}

      {/* فرم ساخت کالا */}
      {showForm && (
        <form
          onSubmit={submitForm}
          className="mb-6 rounded-xl border border-info/25 bg-info-soft/40 p-5"
        >
          <h2 className="mb-4 font-semibold">کالای جدید</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm">
              کد کالا *
              <input
                className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                required
              />
            </label>
            <label className="text-sm sm:col-span-2">
              نام کالا *
              <input
                className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <label className="text-sm">
              دسته‌بندی *
              <select
                className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2"
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                required
              >
                {categories.length === 0 && <option value="">— دسته‌ای ثبت نشده —</option>}
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              واحد اندازه‌گیری *
              <select
                className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2"
                value={form.base_uom_id}
                onChange={(e) => setForm({ ...form, base_uom_id: e.target.value })}
                required
              >
                {units.length === 0 && <option value="">— واحدی ثبت نشده —</option>}
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.code} — {u.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              نوع توزیع
              <select
                className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2"
                value={form.distribution_kind}
                onChange={(e) =>
                  setForm({
                    ...form,
                    distribution_kind: e.target.value as 'cold' | 'warm' | 'both',
                  })
                }
              >
                <option value="cold">سرد</option>
                <option value="warm">گرم</option>
                <option value="both">سرد و گرم</option>
              </select>
            </label>
            <label className="text-sm">
              حداقل سفارش
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2"
                value={form.min_order_qty}
                onChange={(e) => setForm({ ...form, min_order_qty: e.target.value })}
              />
            </label>
            <label className="mt-6 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_batch_tracked}
                onChange={(e) => setForm({ ...form, is_batch_tracked: e.target.checked })}
              />
              ردیابی بچ
            </label>
            <label className="mt-6 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_expiry_tracked}
                onChange={(e) => setForm({ ...form, is_expiry_tracked: e.target.checked })}
              />
              کالای انقضادار
            </label>
            {form.is_expiry_tracked && (
              <label className="text-sm">
                ماندگاری (روز)
                <input
                  type="number"
                  min={1}
                  className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2"
                  value={form.shelf_life_days}
                  onChange={(e) => setForm({ ...form, shelf_life_days: e.target.value })}
                />
              </label>
            )}
          </div>

          {formError && (
            <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
              {formError}
            </p>
          )}

          <div className="mt-5 flex gap-3">
            <button
              type="submit"
              disabled={saving || !form.category_id || !form.base_uom_id}
              className="rounded-lg bg-info px-5 py-2 text-sm font-medium text-white hover:bg-info disabled:opacity-50"
            >
              {saving ? 'در حال ثبت…' : 'ثبت کالا'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-line-strong px-5 py-2 text-sm"
            >
              انصراف
            </button>
          </div>
        </form>
      )}

      {/* جدول فهرست */}
      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-right text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-medium">کد</th>
              <th className="px-4 py-3 font-medium">نام</th>
              <th className="px-4 py-3 font-medium">وضعیت</th>
              <th className="px-4 py-3 font-medium">نوع توزیع</th>
              <th className="px-4 py-3 font-medium">حداقل سفارش</th>
              <th className="px-4 py-3 font-medium">نسخه</th>
              <th className="px-4 py-3 font-medium">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-subtle">
                  در حال دریافت فهرست…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-subtle">
                  کالایی یافت نشد
                </td>
              </tr>
            )}
            {!loading &&
              items.map((p) => (
                <tr key={p.id} className="border-t border-line hover:bg-surface-alt/60">
                  <td className="px-4 py-3 font-mono text-xs">{p.code}</td>
                  <td className="px-4 py-3">{p.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${ p.status === 'active' ? 'bg-brand-soft text-success-ink' : p.status === 'blocked' ? 'bg-danger-soft text-danger-ink' : 'bg-surface-alt text-ink-muted' }`}
                    >
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {DIST_LABEL[p.distribution_kind] ?? p.distribution_kind}
                  </td>
                  <td className="px-4 py-3">{p.min_order_qty}</td>
                  <td className="px-4 py-3 text-ink-subtle">{p.row_version}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => void toggleStatus(p)}
                      className="rounded border border-line-strong px-2 py-1 text-xs hover:bg-surface"
                    >
                      {p.status === 'active' ? 'مسدود کن' : 'فعال کن'}
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-ink-subtle">
        <span>
          {items.length} کالا {nextCursor && '— صفحات بیشتری موجود است'}
        </span>
        {nextCursor && (
          <button
            onClick={() => void load(q, status, nextCursor)}
            disabled={loading}
            className="rounded-lg border border-line-strong px-3 py-1.5 text-ink-muted hover:bg-surface disabled:opacity-50"
          >
            {loading ? 'در حال دریافت…' : 'صفحه بعدی'}
          </button>
        )}
      </div>
    </>
  );
}
