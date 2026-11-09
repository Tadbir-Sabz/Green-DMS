'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, getToken } from '@/lib/api';
import { AppLoader } from '@/components/AppShell';
import {
  type Category,
  type DuplicateCheckResult,
  type ProductFamily,
  type Unit,
  btnGhost,
  btnPrimary,
  errorCls,
  faError,
  formPanelCls,
  inputCls,
  panelCls,
  selectCls,
} from '../products-lib';

/**
 * ویزارد ساختِ کالا (D1):
 *   POST /products                 — کدِ دستی یا خودکارِ SKU-XXXXXX
 *   GET  /products/duplicate-check — کد/بارکد تکراری = مانع؛ نامِ مشابه = هشدار (D2)
 *   POST /product-families         — خانوادهٔ جدید (محورِ variant — M-3)
 *   POST /products/{id}/barcodes   — بارکدِ اولیه (اختیاری — H-1)
 */

const EMPTY_FORM = {
  code: '',
  name: '',
  name_latin: '',
  family_id: '',
  category_id: '',
  base_uom_id: '',
  barcode: '',
  barcode_kind: 'gs1_ean13' as string,
  distribution_kind: 'both' as 'cold' | 'warm' | 'both',
  min_order_qty: '1',
  weight_gr: '',
  volume_cm3: '',
  is_batch_tracked: false,
  is_expiry_tracked: false,
  shelf_life_days: '',
};

export default function NewProductPage(): React.JSX.Element {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [families, setFamilies] = useState<ProductFamily[]>([]);

  const [famForm, setFamForm] = useState({ code: '', name: '' });
  const [famBusy, setFamBusy] = useState(false);

  const [dup, setDup] = useState<DuplicateCheckResult | null>(null);
  const [dupBusy, setDupBusy] = useState(false);
  const dupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadRefs = useCallback(async () => {
    const [cats, unts, fams] = await Promise.all([
      api.GET('/product-categories'),
      api.GET('/units'),
      api.GET('/product-families'),
    ]);
    const catItems = cats.data?.items ?? [];
    setCategories(catItems);
    setUnits(unts.data?.items ?? []);
    setFamilies(fams.data ?? []);
    setForm((f) => ({
      ...f,
      category_id: f.category_id || (catItems[0]?.id ?? ''),
      base_uom_id: f.base_uom_id || ((unts.data?.items ?? [])[0]?.id ?? ''),
    }));
  }, []);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
    void loadRefs();
  }, [router, loadRefs]);

  /** بررسیِ زندهٔ تکرار — با تأخیر ۴۰۰ms بعد از تایپ */
  const scheduleDupCheck = (next: typeof EMPTY_FORM): void => {
    if (dupTimer.current) clearTimeout(dupTimer.current);
    dupTimer.current = setTimeout(() => {
      const name = next.name.trim();
      const code = next.code.trim();
      const barcode = next.barcode.trim();
      if (!name && !code && !barcode) {
        setDup(null);
        return;
      }
      setDupBusy(true);
      void api
        .GET('/products/duplicate-check', {
          params: { query: { name: name || undefined, code: code || undefined, barcode: barcode || undefined } },
        })
        .then(({ data, error }) => {
          setDupBusy(false);
          setDup(error ? null : (data ?? null));
        });
    }, 400);
  };

  const setField = <K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]): void => {
    const next = { ...form, [key]: value };
    setForm(next);
    if (key === 'name' || key === 'code' || key === 'barcode') scheduleDupCheck(next);
  };

  const createFamily = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!famForm.code.trim() || !famForm.name.trim()) return;
    setFamBusy(true);
    const { data, error } = await api.POST('/product-families', {
      body: { code: famForm.code.trim(), name: famForm.name.trim() },
    });
    setFamBusy(false);
    if (error) {
      setFormError(faError(error));
      return;
    }
    setFamilies((prev) => [...prev, data as ProductFamily]);
    setForm((f) => ({ ...f, family_id: (data as ProductFamily).id }));
    setFamForm({ code: '', name: '' });
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (dup && dup.blocking.length > 0) {
      setFormError('مواردِ تکراریِ مانع وجود دارد؛ پیش از ثبت، کد/بارکد را اصلاح کنید.');
      return;
    }
    setSaving(true);
    setFormError(null);
    const { data, error } = await api.POST('/products', {
      body: {
        code: form.code.trim() || undefined,
        name: form.name.trim(),
        name_latin: form.name_latin.trim() || null,
        category_id: form.category_id,
        base_uom_id: form.base_uom_id,
        family_id: form.family_id || null,
        distribution_kind: form.distribution_kind,
        min_order_qty: form.min_order_qty ? Number(form.min_order_qty) : 1,
        weight_gr: form.weight_gr ? Number(form.weight_gr) : undefined,
        volume_cm3: form.volume_cm3 ? Number(form.volume_cm3) : undefined,
        is_batch_tracked: form.is_batch_tracked,
        is_expiry_tracked: form.is_expiry_tracked,
        ...(form.is_expiry_tracked && form.shelf_life_days ? { shelf_life_days: Number(form.shelf_life_days) } : {}),
      },
    });
    if (error || !data) {
      setSaving(false);
      setFormError(faError(error));
      return;
    }
    const created = data;
    // بارکدِ اولیه (اختیاری) — شکستِ آن نباید ساختِ کالا را خراب کند
    if (form.barcode.trim()) {
      const bc = await api.POST('/products/{id}/barcodes', {
        params: { path: { id: created.id } },
        body: {
          barcode: form.barcode.trim(),
          kind: form.barcode_kind as 'gs1_ean13' | 'gs1_ean8' | 'gs1_upc' | 'gs1_itf14' | 'internal' | 'other',
          is_primary: true,
        },
      });
      if (bc.error) {
        setSaving(false);
        setFormError(`کالا ساخته شد اما بارکد ثبت نشد: ${faError(bc.error)} — از صفحهٔ جزئیات اضافه کنید.`);
        router.push(`/products/${created.id}`);
        return;
      }
    }
    setSaving(false);
    router.push(`/products/${created.id}`);
  };

  if (!ready) return <AppLoader />;

  const hasBlocking = dup != null && dup.blocking.length > 0;

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">کالای جدید</h1>
        <Link href="/products" className={btnGhost}>
          بازگشت به فهرست
        </Link>
      </div>

      <form onSubmit={submit}>
        {/* گام ۱ — هویت کالا (D1/D2) */}
        <section className={`${formPanelCls} mb-5`}>
          <h2 className="mb-4 font-semibold">هویت کالا</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm">
              نام کالا *
              <input
                className={`${inputCls} mt-1`}
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                required
              />
            </label>
            <label className="text-sm">
              نام لاتین
              <input
                className={`${inputCls} mt-1`}
                dir="ltr"
                value={form.name_latin}
                onChange={(e) => setField('name_latin', e.target.value)}
              />
            </label>
            <label className="text-sm">
              کد کالا (SKU)
              <input
                className={`${inputCls} mt-1 font-mono`}
                dir="ltr"
                value={form.code}
                onChange={(e) => setField('code', e.target.value)}
                placeholder="خالی = تولیدِ خودکارِ SKU-XXXXXX"
              />
            </label>
            <label className="text-sm">
              گروه کالا *
              <select
                className={`${selectCls} mt-1`}
                value={form.category_id}
                onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                required
              >
                {categories.length === 0 && <option value="">— گروهی ثبت نشده —</option>}
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              واحد پایه *
              <select
                className={`${selectCls} mt-1`}
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
              خانواده (محورِ variant)
              <select
                className={`${selectCls} mt-1`}
                value={form.family_id}
                onChange={(e) => setForm({ ...form, family_id: e.target.value })}
              >
                <option value="">— بدون خانواده —</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id} disabled={f.is_active === false}>
                    {f.code} — {f.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* خانوادهٔ جدید — inline تا جریانِ ساخت قطع نشود */}
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-ink-muted">＋ خانوادهٔ جدید</summary>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="text-sm">
                کد خانواده
                <input
                  className={`${inputCls} mt-1 w-40`}
                  dir="ltr"
                  value={famForm.code}
                  onChange={(e) => setFamForm({ ...famForm, code: e.target.value })}
                />
              </label>
              <label className="text-sm">
                نام خانواده
                <input
                  className={`${inputCls} mt-1 w-56`}
                  value={famForm.name}
                  onChange={(e) => setFamForm({ ...famForm, name: e.target.value })}
                />
              </label>
              <button type="button" onClick={createFamily} disabled={famBusy} className={btnGhost}>
                {famBusy ? 'در حال ثبت…' : 'ثبت خانواده'}
              </button>
            </div>
          </details>

          {/* D2 — نمایشِ زندهٔ تکرار */}
          {(dupBusy || dup) && (
            <div className="mt-4 space-y-2">
              {dupBusy && <p className="text-xs text-ink-subtle">در حال بررسیِ تکرار…</p>}
              {dup && dup.blocking.length > 0 && (
                <div className={errorCls}>
                  <p className="font-medium">مواردِ تکراری (مانع از ثبت):</p>
                  <ul className="mt-1 list-disc pr-5">
                    {dup.blocking.map((b, i) => (
                      <li key={i}>
                        {b.kind === 'barcode' ? 'بارکد' : 'کد'} تکراری با «{b.name}» ({b.code})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {dup && dup.warnings.length > 0 && (
                <div className="rounded-lg bg-warning-soft px-4 py-2 text-sm text-warning-ink">
                  <p className="font-medium">نام‌های مشابه (فقط هشدار — ثبت مجاز است):</p>
                  <ul className="mt-1 list-disc pr-5">
                    {dup.warnings.map((w, i) => (
                      <li key={i}>
                        «{w.name}» ({w.code}){typeof w.score === 'number' ? ` — شباهت ${Math.round(w.score * 100)}٪` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {dup && dup.blocking.length === 0 && dup.warnings.length === 0 && (
                <p className="text-xs text-success-ink">موردِ تکراری یافت نشد.</p>
              )}
            </div>
          )}
        </section>

        {/* گام ۲ — لجستیک و رهگیری */}
        <section className={`${panelCls} mb-5`}>
          <h2 className="mb-4 font-semibold">لجستیک و رهگیری</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm">
              نوع توزیع
              <select
                className={`${selectCls} mt-1`}
                value={form.distribution_kind}
                onChange={(e) => setForm({ ...form, distribution_kind: e.target.value as 'cold' | 'warm' | 'both' })}
              >
                <option value="both">سرد و گرم</option>
                <option value="cold">سرد</option>
                <option value="warm">گرم</option>
              </select>
            </label>
            <label className="text-sm">
              حداقل سفارش
              <input
                type="number"
                min={0}
                step="any"
                className={`${inputCls} mt-1`}
                value={form.min_order_qty}
                onChange={(e) => setForm({ ...form, min_order_qty: e.target.value })}
              />
            </label>
            <label className="text-sm">
              وزن (گرم)
              <input
                type="number"
                min={0}
                step="any"
                className={`${inputCls} mt-1`}
                value={form.weight_gr}
                onChange={(e) => setForm({ ...form, weight_gr: e.target.value })}
              />
            </label>
            <label className="text-sm">
              حجم (سانتی‌متر مکعب)
              <input
                type="number"
                min={0}
                step="any"
                className={`${inputCls} mt-1`}
                value={form.volume_cm3}
                onChange={(e) => setForm({ ...form, volume_cm3: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_batch_tracked}
                onChange={(e) => setForm({ ...form, is_batch_tracked: e.target.checked })}
              />
              رهگیریِ بَچ (سری ساخت)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_expiry_tracked}
                onChange={(e) => setForm({ ...form, is_expiry_tracked: e.target.checked })}
              />
              رهگیریِ انقضا
            </label>
            {form.is_expiry_tracked && (
              <label className="text-sm">
                ماندگاری (روز)
                <input
                  type="number"
                  min={1}
                  className={`${inputCls} mt-1`}
                  value={form.shelf_life_days}
                  onChange={(e) => setForm({ ...form, shelf_life_days: e.target.value })}
                />
              </label>
            )}
          </div>
        </section>

        {/* گام ۳ — بارکدِ اولیه (اختیاری) */}
        <section className={`${panelCls} mb-5`}>
          <h2 className="mb-4 font-semibold">بارکد اولیه (اختیاری)</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm">
              بارکد
              <input
                className={`${inputCls} mt-1 font-mono`}
                dir="ltr"
                value={form.barcode}
                onChange={(e) => setField('barcode', e.target.value)}
                placeholder="مثلاً 6261000000000"
              />
            </label>
            <label className="text-sm">
              نوع بارکد
              <select
                className={`${selectCls} mt-1`}
                value={form.barcode_kind}
                onChange={(e) => setForm({ ...form, barcode_kind: e.target.value })}
              >
                <option value="gs1_ean13">GS1 — EAN-13</option>
                <option value="gs1_ean8">GS1 — EAN-8</option>
                <option value="gs1_upc">GS1 — UPC</option>
                <option value="gs1_itf14">GS1 — ITF-14</option>
                <option value="internal">داخلی (شرکت)</option>
                <option value="other">سایر</option>
              </select>
            </label>
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            بارکدهای بیشتر (و بارکدِ سطحِ بسته‌بندی) پس از ثبت، در صفحهٔ جزئیات → «بارکد‌ها» قابل افزودن است.
          </p>
        </section>

        {formError && <p className={`mb-4 ${errorCls}`}>{formError}</p>}

        <div className="flex gap-3">
          <button type="submit" disabled={saving || hasBlocking || !form.category_id || !form.base_uom_id} className={btnPrimary}>
            {saving ? 'در حال ثبت…' : 'ثبت کالا'}
          </button>
          <Link href="/products" className={btnGhost}>
            انصراف
          </Link>
        </div>
      </form>
    </>
  );
}
