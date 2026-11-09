'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { CatalogHistory, DomainIntegrationStatus } from './catalog-evidence';
import { useParams, useRouter } from 'next/navigation';
import type { components } from '@dms/api-client';
import { api, getToken } from '@/lib/api';
import { AppLoader } from '@/components/AppShell';
import {
  type BundleComponent,
  type Category,
  type Product,
  type ProductAlias,
  type ProductAttributeDef,
  type ProductAttributeValue,
  type ProductBarcode,
  type ProductFamily,
  type ProductPackaging,
  type ProductRelation,
  type Unit,
  ALIAS_KIND_LABEL,
  ATTR_KIND_LABEL,
  BARCODE_KIND_LABEL,
  RELATION_KIND_LABEL,
  STATUS_LABEL,
  btnDangerSmall,
  btnGhost,
  btnPrimary,
  btnSmall,
  errorCls,
  errorBody,
  faError,
  formPanelCls,
  inputCls,
  okCls,
  panelCls,
  selectCls,
  statusBadgeCls,
  tableWrapCls,
  tdCls,
  thCls,
  warnCls,
} from '../products-lib';

/**
 * جزئیاتِ کالا — قلبِ ماژولِ Product Master با تب‌های منسجم:
 *   مشخصات (D1/D4) · صفات و variant (M-3) · نام‌های جایگزین (H-1) · بارکد‌ها (H-1/D2)
 *   بسته‌بندی (B/D3 — ضریبِ تبدیلِ ۴ رقمِ اعشار) · روابط · ترکیبِ بسته (D5 — فقط کاتالوگی)
 * فیلدهای حساس (D4) با تأییدِ صریحِ دومرحله‌ای تغییر می‌کنند.
 */

type Uom = components['schemas']['Uom'];
type TabKey = 'identity' | 'attributes' | 'aliases' | 'barcodes' | 'packaging' | 'relations' | 'bundle' | 'history' | 'domain';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'history', label: 'تاریخچه' },
  { key: 'domain', label: 'عرضه در دامنه' },
  { key: 'identity', label: 'مشخصات' },
  { key: 'attributes', label: 'صفات و variant' },
  { key: 'aliases', label: 'نام‌های جایگزین' },
  { key: 'barcodes', label: 'بارکد‌ها' },
  { key: 'packaging', label: 'بسته‌بندی' },
  { key: 'relations', label: 'روابط' },
  { key: 'bundle', label: 'ترکیب بسته (D5)' },
];

export default function ProductDetailPage(): React.JSX.Element {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('identity');
  const [notice, setNotice] = useState<string | null>(null);

  const loadProduct = useCallback(async () => {
    setLoadError(null);
    const { data, error } = await api.GET('/products/{id}', { params: { path: { id } } });
    if (error) {
      setLoadError(faError(error));
      return;
    }
    setProduct(data as Product);
  }, [id]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
    void loadProduct();
  }, [router, loadProduct]);

  if (!ready) return <AppLoader />;
  if (loadError) return <p className={errorCls}>{loadError}</p>;
  if (!product) return <AppLoader />;

  return (
    <>
      {/* سربرگِ ماژول */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">{product.name}</h1>
            <span className={statusBadgeCls(product.status)}>{STATUS_LABEL[product.status] ?? product.status}</span>
            {product.is_batch_tracked && <span className="rounded-full bg-surface-alt px-2 py-0.5 text-xs text-ink-muted">بَچ‌دار</span>}
            {product.is_expiry_tracked && <span className="rounded-full bg-surface-alt px-2 py-0.5 text-xs text-ink-muted">انقضادار</span>}
          </div>
          <p className="mt-1 text-xs text-ink-subtle">
            <span className="font-mono" dir="ltr">{product.code}</span>
            {product.name_latin ? <span dir="ltr"> · {product.name_latin}</span> : null}
            {' · نسخهٔ قفلِ خوش‌بینانه: '}
            {product.row_version}
            {product.variant_signature ? ' · دارای امضای variant' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void loadProduct()} className={btnGhost}>
            تازه‌سازی
          </button>
          <Link href="/products" className={btnGhost}>
            بازگشت به فهرست
          </Link>
        </div>
      </div>

      {notice && <p className={`mb-4 ${okCls}`}>{notice}</p>}

      {/* تب‌های ماژول */}
      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            aria-pressed={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-2 text-sm transition-colors focus-ring ${
              tab === t.key ? 'bg-info text-on-info font-medium' : 'text-ink-muted hover:bg-surface-alt'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'history' && <CatalogHistory productId={id} />}
      {tab === 'domain' && <DomainIntegrationStatus />}
      {tab === 'identity' && <IdentityTab product={product} onSaved={loadProduct} onNotice={setNotice} />}
      {tab === 'attributes' && <AttributesTab productId={id} signature={product.variant_signature ?? null} onNotice={setNotice} />}
      {tab === 'aliases' && <AliasesTab productId={id} onNotice={setNotice} />}
      {tab === 'barcodes' && <BarcodesTab productId={id} onNotice={setNotice} />}
      {tab === 'packaging' && <PackagingTab productId={id} onNotice={setNotice} />}
      {tab === 'relations' && <RelationsTab productId={id} onNotice={setNotice} />}
      {tab === 'bundle' && <BundleTab productId={id} onNotice={setNotice} />}
    </>
  );
}

/* ============================================================
 * تب مشخصات — D1 (هویت) + D4 (فیلدهای حساس با تأییدِ صریح)
 * ============================================================ */
function IdentityTab({
  product,
  onSaved,
  onNotice,
}: {
  product: Product;
  onSaved: () => Promise<void>;
  onNotice: (msg: string | null) => void;
}) {
  const [form, setForm] = useState({
    name: product.name,
    name_latin: product.name_latin ?? '',
    family_id: product.family_id ?? '',
    category_id: product.category_id,
    base_uom_id: product.base_uom_id,
    status: product.status,
    distribution_kind: product.distribution_kind,
    min_order_qty: String(product.min_order_qty ?? 1),
    weight_gr: product.weight_gr != null ? String(product.weight_gr) : '',
    volume_cm3: product.volume_cm3 != null ? String(product.volume_cm3) : '',
    is_batch_tracked: product.is_batch_tracked,
    is_expiry_tracked: product.is_expiry_tracked,
    shelf_life_days: product.shelf_life_days != null ? String(product.shelf_life_days) : '',
    tax_code_id: product.tax_code_id ?? '',
  });
  const [confirmSensitive, setConfirmSensitive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [families, setFamilies] = useState<ProductFamily[]>([]);

  useEffect(() => {
    void Promise.all([api.GET('/product-categories'), api.GET('/units'), api.GET('/product-families')]).then(
      ([cats, unts, fams]) => {
        setCategories(cats.data?.items ?? []);
        setUnits(unts.data?.items ?? []);
        setFamilies(fams.data ?? []);
      },
    );
  }, []);

  // D4 — فیلدهای حساس: تغییرِشان نیازمندِ تأییدِ صریح است
  const sensitiveChanged =
    form.status !== product.status ||
    (form.tax_code_id || null) !== (product.tax_code_id ?? null) ||
    form.base_uom_id !== product.base_uom_id;

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    onNotice(null);
    const { error } = await api.PATCH('/products/{id}', {
      params: { path: { id: product.id } },
      body: {
        name: form.name.trim(),
        name_latin: form.name_latin.trim() || null,
        family_id: form.family_id || null,
        category_id: form.category_id,
        base_uom_id: form.base_uom_id,
        status: form.status as 'active' | 'blocked' | 'discontinued',
        distribution_kind: form.distribution_kind as 'cold' | 'warm' | 'both',
        min_order_qty: form.min_order_qty ? Number(form.min_order_qty) : 1,
        weight_gr: form.weight_gr ? Number(form.weight_gr) : null,
        volume_cm3: form.volume_cm3 ? Number(form.volume_cm3) : null,
        is_batch_tracked: form.is_batch_tracked,
        is_expiry_tracked: form.is_expiry_tracked,
        ...(form.is_expiry_tracked && form.shelf_life_days ? { shelf_life_days: Number(form.shelf_life_days) } : {}),
        tax_code_id: form.tax_code_id || null,
        row_version: product.row_version,
        confirm_sensitive: sensitiveChanged && confirmSensitive ? true : undefined,
      },
    });
    setSaving(false);
    if (error) {
      const body = errorBody(error);
      if (body.code === 'sensitive_change_requires_confirmation') {
        setErr('تغییرِ فیلدهای حساس (وضعیت/واحدِ پایه/کدِ مالیاتی) نیازمندِ تأییدِ صریح است؛ گزینهٔ تأیید را فعال کنید و دوباره ثبت کنید.');
      } else if (body.code === 'version_conflict') {
        setErr('این کالا هم‌زمان ویرایش شده است؛ فهرست را تازه کنید و دوباره تلاش کنید.');
        await onSaved();
      } else {
        setErr(faError(error));
      }
      return;
    }
    setConfirmSensitive(false);
    onNotice('تغییراتِ مشخصات ثبت شد.');
    await onSaved();
  };

  return (
    <form onSubmit={submit} className={`${formPanelCls} max-w-4xl`}>
      <h2 className="mb-4 font-semibold">مشخصات کالا</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm">
          نام کالا *
          <input className={`${inputCls} mt-1`} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label className="text-sm">
          نام لاتین
          <input className={`${inputCls} mt-1`} dir="ltr" value={form.name_latin} onChange={(e) => setForm({ ...form, name_latin: e.target.value })} />
        </label>
        <label className="text-sm">
          کد کالا (SKU)
          <input className={`${inputCls} mt-1 font-mono`} dir="ltr" value={product.code} disabled title="کدِ SKU پس از ثبت تغییرناپذیر است" />
        </label>
        <label className="text-sm">
          گروه کالا *
          <select className={`${selectCls} mt-1`} value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })} required>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          واحد پایه * <span className="text-xs text-warning-ink">(حساس — D4)</span>
          <select className={`${selectCls} mt-1`} value={form.base_uom_id} onChange={(e) => setForm({ ...form, base_uom_id: e.target.value })} required>
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code} — {u.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          خانواده (محورِ variant)
          <select className={`${selectCls} mt-1`} value={form.family_id} onChange={(e) => setForm({ ...form, family_id: e.target.value })}>
            <option value="">— بدون خانواده —</option>
            {families.map((f) => (
              <option key={f.id} value={f.id} disabled={f.is_active === false}>
                {f.code} — {f.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          وضعیت <span className="text-xs text-warning-ink">(حساس — D4)</span>
          <select className={`${selectCls} mt-1`} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as typeof form.status })}>
            <option value="active">فعال</option>
            <option value="blocked">مسدود</option>
            <option value="discontinued">متوقف</option>
          </select>
        </label>
        <label className="text-sm">
          کد مالیاتی (uuid) <span className="text-xs text-warning-ink">(حساس — D4)</span>
          <input className={`${inputCls} mt-1`} dir="ltr" value={form.tax_code_id} onChange={(e) => setForm({ ...form, tax_code_id: e.target.value })} />
        </label>
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
          <input type="number" min={0} step="any" className={`${inputCls} mt-1`} value={form.min_order_qty} onChange={(e) => setForm({ ...form, min_order_qty: e.target.value })} />
        </label>
        <label className="text-sm">
          وزن (گرم)
          <input type="number" min={0} step="any" className={`${inputCls} mt-1`} value={form.weight_gr} onChange={(e) => setForm({ ...form, weight_gr: e.target.value })} />
        </label>
        <label className="text-sm">
          حجم (سانتی‌متر مکعب)
          <input type="number" min={0} step="any" className={`${inputCls} mt-1`} value={form.volume_cm3} onChange={(e) => setForm({ ...form, volume_cm3: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_batch_tracked} onChange={(e) => setForm({ ...form, is_batch_tracked: e.target.checked })} />
          رهگیریِ بَچ
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_expiry_tracked} onChange={(e) => setForm({ ...form, is_expiry_tracked: e.target.checked })} />
          رهگیریِ انقضا
        </label>
        {form.is_expiry_tracked && (
          <label className="text-sm">
            ماندگاری (روز)
            <input type="number" min={1} className={`${inputCls} mt-1`} value={form.shelf_life_days} onChange={(e) => setForm({ ...form, shelf_life_days: e.target.value })} />
          </label>
        )}
      </div>

      {/* D4 — تأییدِ دومرحله‌ایِ فیلدهای حساس */}
      {sensitiveChanged && (
        <div className={`mt-4 ${warnCls}`}>
          <p className="font-medium">فیلدهای حساس تغییر کرده‌اند (وضعیت / واحدِ پایه / کدِ مالیاتی).</p>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={confirmSensitive} onChange={(e) => setConfirmSensitive(e.target.checked)} />
            تغییرِ این فیلدهای حساس را تأیید می‌کنم (در audit_log ثبت می‌شود)
          </label>
        </div>
      )}

      {err && <p className={`mt-4 ${errorCls}`}>{err}</p>}

      <div className="mt-5 flex gap-3">
        <button type="submit" disabled={saving || (sensitiveChanged && !confirmSensitive)} className={btnPrimary}>
          {saving ? 'در حال ثبت…' : 'ذخیرهٔ تغییرات'}
        </button>
      </div>
    </form>
  );
}

/* ============================================================
 * تب صفات و variant — M-3 (امضای قطعی؛ تغییرناپذیر پس از ارجاع)
 * ============================================================ */
function AttributesTab({
  productId,
  signature,
  onNotice,
}: {
  productId: string;
  signature: string | null;
  onNotice: (msg: string | null) => void;
}) {
  const [defs, setDefs] = useState<ProductAttributeDef[]>([]);
  const [values, setValues] = useState<Record<string, { value_text: string; value_num: string; value_enum: string }>>({});
  const [sig, setSig] = useState<string | null>(signature);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // تعریفِ صفتِ جدید (سطحِ شرکت)
  const [defForm, setDefForm] = useState({ code: '', title: '', kind: 'text', is_variant_axis: false, is_required: false });
  const [enumDraft, setEnumDraft] = useState<Record<string, string>>({});

  const loadAll = useCallback(async () => {
    const [defsRes, valsRes] = await Promise.all([
      api.GET('/product-attributes'),
      api.GET('/products/{id}/attributes', { params: { path: { id: productId } } }),
    ]);
    const defItems = defsRes.data ?? [];
    setDefs(defItems);
    const current = new Map((valsRes.data?.values ?? []).map((v: ProductAttributeValue) => [v.def_id, v]));
    const next: Record<string, { value_text: string; value_num: string; value_enum: string }> = {};
    for (const d of defItems) {
      const v = current.get(d.id);
      next[d.id] = {
        value_text: v?.value_text ?? '',
        value_num: v?.value_num != null ? String(v.value_num) : '',
        value_enum: v?.value_enum ?? '',
      };
    }
    setValues(next);
    setSig(valsRes.data?.variant_signature ?? null);
  }, [productId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const save = async (): Promise<void> => {
    setBusy(true);
    setErr(null);
    onNotice(null);
    const payload = defs.map((d) => {
      const v = values[d.id] ?? { value_text: '', value_num: '', value_enum: '' };
      return {
        def_id: d.id,
        value_text: v.value_text !== '' ? v.value_text : null,
        value_num: d.kind === 'number' && v.value_num !== '' ? Number(v.value_num) : null,
        value_enum: d.kind === 'enum' && v.value_enum !== '' ? v.value_enum : null,
      };
    });
    const { data, error } = await api.PUT('/products/{id}/attributes', {
      params: { path: { id: productId } },
      body: { values: payload },
    });
    setBusy(false);
    if (error) {
      setErr(faError(error));
      return;
    }
    setSig(data?.variant_signature ?? null);
    onNotice('مقادیرِ صفات ثبت شد.');
    await loadAll();
  };

  const createDef = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setErr(null);
    const { error } = await api.POST('/product-attributes', {
      body: {
        code: defForm.code.trim(),
        title: defForm.title.trim(),
        kind: defForm.kind as 'text' | 'number' | 'enum',
        is_variant_axis: defForm.is_variant_axis,
        is_required: defForm.is_required,
      },
    });
    if (error) {
      setErr(faError(error));
      return;
    }
    setDefForm({ code: '', title: '', kind: 'text', is_variant_axis: false, is_required: false });
    await loadAll();
  };

  const addEnumValue = async (defId: string): Promise<void> => {
    const value = (enumDraft[defId] ?? '').trim();
    if (!value) return;
    const { error } = await api.POST('/product-attributes/{defId}/enum-values', {
      params: { path: { defId } },
      body: { value },
    });
    if (error) {
      setErr(faError(error));
      return;
    }
    setEnumDraft({ ...enumDraft, [defId]: '' });
    await loadAll();
  };

  return (
    <div className="space-y-5">
      <div className={`${panelCls} flex flex-wrap items-center gap-4`}>
        <div>
          <p className="text-sm text-ink-muted">امضای فعلیِ variant (M-3)</p>
          <p className="mt-1 font-mono text-xs" dir="ltr">
            {sig ? sig.slice(0, 24) + '…' : '— (بدون امضا)'}
          </p>
        </div>
        <p className="max-w-xl text-xs text-ink-muted">
          امضا از مقادیرِ «محورهای variant» به‌صورت قطعی (مرتب‌سازی بر اساسِ صفت) ساخته می‌شود و در هر خانواده یکتاست.
          پس از نخستین ارجاعِ عملیاتی (سند/موجودی/قیمت)، تغییرِ محورها ممنوع است.
        </p>
      </div>

      {err && <p className={errorCls}>{err}</p>}

      <div className={tableWrapCls}>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={thCls}>صفت</th>
              <th className={thCls}>نوع</th>
              <th className={thCls}>مقدار</th>
              <th className={thCls}>ویژگی‌ها</th>
            </tr>
          </thead>
          <tbody>
            {defs.length === 0 && (
              <tr>
                <td colSpan={4} className={`${tdCls} py-8 text-center text-ink-subtle`}>
                  صفتی تعریف نشده است — از فرم پایین «تعریفِ صفتِ جدید» اضافه کنید.
                </td>
              </tr>
            )}
            {defs.map((d) => (
              <tr key={d.id} className="border-t border-line">
                <td className={tdCls}>
                  {d.title} <span className="text-xs text-ink-subtle">({d.code})</span>
                  {d.is_required && <span className="ms-1 text-xs text-danger-ink">*</span>}
                </td>
                <td className={`${tdCls} text-ink-muted`}>{ATTR_KIND_LABEL[d.kind] ?? d.kind}</td>
                <td className={tdCls}>
                  {d.kind === 'enum' ? (
                    <select
                      className={`${selectCls} h-9`}
                      value={values[d.id]?.value_enum ?? ''}
                      onChange={(e) => setValues({ ...values, [d.id]: { value_text: '', value_num: '', value_enum: e.target.value } })}
                    >
                      <option value="">— انتخاب —</option>
                      {(d.enum_values ?? []).map((ev) => (
                        <option key={ev.id} value={ev.value}>
                          {ev.value}
                        </option>
                      ))}
                    </select>
                  ) : d.kind === 'number' ? (
                    <input
                      type="number"
                      step="any"
                      className={`${inputCls} h-9`}
                      value={values[d.id]?.value_num ?? ''}
                      onChange={(e) => setValues({ ...values, [d.id]: { value_text: '', value_num: e.target.value, value_enum: '' } })}
                    />
                  ) : (
                    <input
                      className={`${inputCls} h-9`}
                      value={values[d.id]?.value_text ?? ''}
                      onChange={(e) => setValues({ ...values, [d.id]: { value_text: e.target.value, value_num: '', value_enum: '' } })}
                    />
                  )}
                </td>
                <td className={`${tdCls} text-xs text-ink-muted`}>
                  {d.is_variant_axis && <span className="rounded-full bg-info-soft px-2 py-0.5 text-info-ink">محورِ variant</span>}
                  {d.kind === 'enum' && (
                    <details className="mt-1">
                      <summary className="cursor-pointer">مقادیرِ مجاز</summary>
                      <ul className="mt-1 list-disc pr-4">
                        {(d.enum_values ?? []).map((ev) => (
                          <li key={ev.id}>{ev.value}</li>
                        ))}
                      </ul>
                      <div className="mt-1 flex gap-1">
                        <input
                          className={`${inputCls} h-8 w-32`}
                          value={enumDraft[d.id] ?? ''}
                          onChange={(e) => setEnumDraft({ ...enumDraft, [d.id]: e.target.value })}
                          placeholder="مقدارِ جدید"
                        />
                        <button type="button" className={btnSmall} onClick={() => void addEnumValue(d.id)}>
                          افزودن
                        </button>
                      </div>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-3">
        <button onClick={() => void save()} disabled={busy} className={btnPrimary}>
          {busy ? 'در حال ثبت…' : 'ذخیرهٔ مقادیرِ صفات'}
        </button>
      </div>

      {/* تعریفِ صفتِ جدید — سطحِ شرکت */}
      <form onSubmit={createDef} className={panelCls}>
        <h3 className="mb-3 font-medium">تعریفِ صفتِ جدید (سطحِ شرکت)</h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            کد
            <input className={`${inputCls} mt-1 w-32`} dir="ltr" value={defForm.code} onChange={(e) => setDefForm({ ...defForm, code: e.target.value })} required />
          </label>
          <label className="text-sm">
            عنوان
            <input className={`${inputCls} mt-1 w-48`} value={defForm.title} onChange={(e) => setDefForm({ ...defForm, title: e.target.value })} required />
          </label>
          <label className="text-sm">
            نوع
            <select className={`${selectCls} mt-1 w-32`} value={defForm.kind} onChange={(e) => setDefForm({ ...defForm, kind: e.target.value })}>
              <option value="text">متنی</option>
              <option value="number">عددی</option>
              <option value="enum">انتخابی</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={defForm.is_variant_axis} onChange={(e) => setDefForm({ ...defForm, is_variant_axis: e.target.checked })} />
            محورِ variant
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={defForm.is_required} onChange={(e) => setDefForm({ ...defForm, is_required: e.target.checked })} />
            الزامی
          </label>
          <button type="submit" className={btnGhost}>
            تعریف صفت
          </button>
        </div>
      </form>
    </div>
  );
}

/* ============================================================
 * تب نام‌های جایگزین — H-1 (نرمال‌سازی + یکتایی در سرور)
 * ============================================================ */
function AliasesTab({ productId, onNotice }: { productId: string; onNotice: (msg: string | null) => void }) {
  const [items, setItems] = useState<ProductAlias[]>([]);
  const [alias, setAlias] = useState('');
  const [kind, setKind] = useState('brand_slang');
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await api.GET('/products/{id}/aliases', { params: { path: { id: productId } } });
    if (!error) setItems((data ?? []) as ProductAlias[]);
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setErr(null);
    const { error } = await api.POST('/products/{id}/aliases', {
      params: { path: { id: productId } },
      body: { alias: alias.trim(), kind: kind as 'brand_slang' | 'latin' | 'code' },
    });
    if (error) {
      setErr(faError(error));
      return;
    }
    setAlias('');
    onNotice('نامِ جایگزین ثبت شد.');
    await load();
  };

  const remove = async (aliasId: string): Promise<void> => {
    setErr(null);
    const { error } = await api.DELETE('/product-aliases/{aliasId}', { params: { path: { aliasId } } });
    if (error) {
      setErr(faError(error));
      return;
    }
    onNotice('نامِ جایگزین حذف شد.');
    await load();
  };

  return (
    <div className="space-y-4">
      {err && <p className={errorCls}>{err}</p>}
      <form onSubmit={add} className={`${panelCls} flex flex-wrap items-end gap-3`}>
        <label className="text-sm">
          نامِ جایگزین
          <input className={`${inputCls} mt-1 w-64`} value={alias} onChange={(e) => setAlias(e.target.value)} required placeholder="نامِ عامیانه، لاتین یا کدِ قدیمی" />
        </label>
        <label className="text-sm">
          نوع
          <select className={`${selectCls} mt-1 w-44`} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="brand_slang">نامِ عامیانه/برند</option>
            <option value="latin">لاتین</option>
            <option value="code">کدِ جایگزین</option>
          </select>
        </label>
        <button type="submit" className={btnPrimary}>
          افزودن
        </button>
        <p className="w-full text-xs text-ink-muted">
          نرمال‌سازی (ارقامِ فارسی/عربی، فاصلهٔ نیم‌فاصله) در سرور انجام می‌شود؛ اسکنِ بارکد/کد این نام‌ها را هم resolve می‌کند.
        </p>
      </form>

      <div className={tableWrapCls}>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={thCls}>نامِ جایگزین</th>
              <th className={thCls}>نوع</th>
              <th className={thCls}>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={3} className={`${tdCls} py-6 text-center text-ink-subtle`}>
                  نامِ جایگزینی ثبت نشده است
                </td>
              </tr>
            )}
            {items.map((a) => (
              <tr key={a.id} className="border-t border-line">
                <td className={tdCls}>{a.alias}</td>
                <td className={`${tdCls} text-ink-muted`}>{ALIAS_KIND_LABEL[a.kind] ?? a.kind}</td>
                <td className={tdCls}>
                  <button className={btnDangerSmall} onClick={() => void remove(a.id)}>
                    حذف
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================
 * تب بارکد‌ها — H-1/D2 (چند بارکد؛ یکتاییِ نوع‌محور)
 * ============================================================ */
function BarcodesTab({ productId, onNotice }: { productId: string; onNotice: (msg: string | null) => void }) {
  const [items, setItems] = useState<ProductBarcode[]>([]);
  const [form, setForm] = useState({ barcode: '', kind: 'gs1_ean13', is_primary: false });
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await api.GET('/products/{id}/barcodes', { params: { path: { id: productId } } });
    if (!error) setItems((data ?? []) as ProductBarcode[]);
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setErr(null);
    const { error } = await api.POST('/products/{id}/barcodes', {
      params: { path: { id: productId } },
      body: {
        barcode: form.barcode.trim(),
        kind: form.kind as 'gs1_ean13' | 'gs1_ean8' | 'gs1_upc' | 'gs1_itf14' | 'internal' | 'other',
        is_primary: form.is_primary,
      },
    });
    if (error) {
      setErr(faError(error));
      return;
    }
    setForm({ barcode: '', kind: 'gs1_ean13', is_primary: false });
    onNotice('بارکد ثبت شد.');
    await load();
  };

  const remove = async (barcodeId: string): Promise<void> => {
    setErr(null);
    const { error } = await api.DELETE('/products/barcodes/{barcodeId}', { params: { path: { barcodeId } } });
    if (error) {
      setErr(faError(error));
      return;
    }
    onNotice('بارکد حذف شد.');
    await load();
  };

  return (
    <div className="space-y-4">
      {err && <p className={errorCls}>{err}</p>}
      <form onSubmit={add} className={`${panelCls} flex flex-wrap items-end gap-3`}>
        <label className="text-sm">
          بارکد
          <input className={`${inputCls} mt-1 w-56 font-mono`} dir="ltr" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} required />
        </label>
        <label className="text-sm">
          نوع
          <select className={`${selectCls} mt-1 w-48`} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {Object.entries(BARCODE_KIND_LABEL).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_primary} onChange={(e) => setForm({ ...form, is_primary: e.target.checked })} />
          بارکدِ اصلی
        </label>
        <button type="submit" className={btnPrimary}>
          افزودن
        </button>
        <p className="w-full text-xs text-ink-muted">
          یکتاییِ نوع‌محور: بارکدهای GS1 در سطحِ سراسری و بارکدهای داخلی در سطحِ شرکت یکتایند (D2).
        </p>
      </form>

      <div className={tableWrapCls}>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={thCls}>بارکد</th>
              <th className={thCls}>نوع</th>
              <th className={thCls}>اصلی</th>
              <th className={thCls}>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className={`${tdCls} py-6 text-center text-ink-subtle`}>
                  بارکدی ثبت نشده است
                </td>
              </tr>
            )}
            {items.map((b) => (
              <tr key={b.id} className="border-t border-line">
                <td className={`${tdCls} font-mono`} dir="ltr">
                  {b.barcode}
                </td>
                <td className={`${tdCls} text-ink-muted`}>{BARCODE_KIND_LABEL[b.kind] ?? b.kind}</td>
                <td className={tdCls}>{b.is_primary ? '✓' : '—'}</td>
                <td className={tdCls}>
                  <button className={btnDangerSmall} onClick={() => void remove(b.id)}>
                    حذف
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================
 * تب بسته‌بندی — B/D3 (ضریبِ تبدیلِ ۴ رقمِ اعشار؛ D4 برای تغییر)
 * ============================================================ */
function PackagingTab({ productId, onNotice }: { productId: string; onNotice: (msg: string | null) => void }) {
  const [items, setItems] = useState<ProductPackaging[]>([]);
  const [uoms, setUoms] = useState<Uom[]>([]);
  const [form, setForm] = useState({ uom_id: '', factor_to_base: '', barcode: '', is_sales_default: false, is_purchase_default: false });
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [listRes, uomRes] = await Promise.all([
      api.GET('/packaging/product-packaging/{productId}', { params: { path: { productId } } }),
      api.GET('/packaging/uom'),
    ]);
    if (!listRes.error) setItems((listRes.data ?? []) as ProductPackaging[]);
    if (!uomRes.error) setUoms((uomRes.data ?? []) as Uom[]);
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setErr(null);
    const { error } = await api.POST('/packaging/product-packaging', {
      body: {
        product_id: productId,
        uom_id: form.uom_id,
        factor_to_base: Number(form.factor_to_base),
        barcode: form.barcode.trim() || null,
        is_sales_default: form.is_sales_default,
        is_purchase_default: form.is_purchase_default,
      },
    });
    if (error) {
      setErr(faError(error));
      return;
    }
    setForm({ uom_id: '', factor_to_base: '', barcode: '', is_sales_default: false, is_purchase_default: false });
    onNotice('بسته‌بندی ثبت شد.');
    await load();
  };

  const setSalesDefault = async (packagingId: string | undefined): Promise<void> => {
    if (!packagingId) return;
    setErr(null);
    const { error } = await api.PATCH('/packaging/product-packaging/{id}/default', {
      params: { path: { id: packagingId } },
      body: { is_sales_default: true },
    });
    if (error) {
      setErr(faError(error));
      return;
    }
    onNotice('بسته‌بندیِ پیش‌فرضِ فروش تنظیم شد.');
    await load();
  };

  return (
    <div className="space-y-4">
      <div className={`${panelCls} text-xs text-ink-muted`}>
        ضریبِ تبدیل با ۴ رقمِ اعشار (numeric(19,4)) ثبت می‌شود تا خطای گِرد کردن رخ ندهد (D3). تغییرِ ضریبِ تبدیلِ یک
        بسته‌بندیِ استفاده‌شده نیازمندِ تأییدِ صریح است (D4).
      </div>
      {err && <p className={errorCls}>{err}</p>}
      <form onSubmit={add} className={`${panelCls} flex flex-wrap items-end gap-3`}>
        <label className="text-sm">
          واحد
          <select className={`${selectCls} mt-1 w-44`} value={form.uom_id} onChange={(e) => setForm({ ...form, uom_id: e.target.value })} required>
            <option value="">— انتخاب —</option>
            {uoms.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code} — {u.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          ضریبِ تبدیل به واحدِ پایه *
          <input
            type="number"
            step="0.0001"
            min="0.0001"
            className={`${inputCls} mt-1 w-40`}
            value={form.factor_to_base}
            onChange={(e) => setForm({ ...form, factor_to_base: e.target.value })}
            required
            placeholder="مثلاً 12 یا 0.5"
          />
        </label>
        <label className="text-sm">
          بارکدِ این سطح
          <input className={`${inputCls} mt-1 w-48 font-mono`} dir="ltr" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_sales_default} onChange={(e) => setForm({ ...form, is_sales_default: e.target.checked })} />
          پیش‌فرضِ فروش
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_purchase_default} onChange={(e) => setForm({ ...form, is_purchase_default: e.target.checked })} />
          پیش‌فرضِ خرید
        </label>
        <button type="submit" className={btnPrimary}>
          افزودنِ بسته‌بندی
        </button>
      </form>

      <div className={tableWrapCls}>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={thCls}>واحد</th>
              <th className={thCls}>ضریبِ تبدیل</th>
              <th className={thCls}>بارکد</th>
              <th className={thCls}>پیش‌فرض‌ها</th>
              <th className={thCls}>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className={`${tdCls} py-6 text-center text-ink-subtle`}>
                  بسته‌بندی‌ای ثبت نشده است
                </td>
              </tr>
            )}
            {items.map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className={tdCls}>
                  {p.uom_title ?? '—'} <span className="text-xs text-ink-subtle">({p.uom_code ?? '؟'})</span>
                </td>
                <td className={`${tdCls} font-mono`} dir="ltr">
                  {p.factor_to_base}
                </td>
                <td className={`${tdCls} font-mono`} dir="ltr">
                  {p.barcode ?? '—'}
                </td>
                <td className={`${tdCls} text-xs`}>
                  {p.is_sales_default && <span className="rounded-full bg-brand-soft px-2 py-0.5 text-success-ink">فروش</span>}
                  {p.is_purchase_default && <span className="me-1 rounded-full bg-info-soft px-2 py-0.5 text-info-ink">خرید</span>}
                </td>
                <td className={tdCls}>
                  {!p.is_sales_default && (
                    <button className={btnSmall} onClick={() => void setSalesDefault(p.id)}>
                      پیش‌فرضِ فروش
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================
 * تب روابط — جایگزین/مکمل (خودارجاع و حلقه ممنوع)
 * ============================================================ */
function RelationsTab({ productId, onNotice }: { productId: string; onNotice: (msg: string | null) => void }) {
  const [items, setItems] = useState<ProductRelation[]>([]);
  const [candidates, setCandidates] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ related_id: '', kind: 'substitute', priority: '100' });
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await api.GET('/products/{id}/relations', { params: { path: { id: productId } } });
    if (!error) setItems((data ?? []) as ProductRelation[]);
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const searchProducts = async (): Promise<void> => {
    const { data, error } = await api.GET('/products', { params: { query: { q: search || undefined, limit: 20 } } });
    if (!error) setCandidates(data?.items ?? []);
  };

  const add = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setErr(null);
    const { error } = await api.POST('/products/{id}/relations', {
      params: { path: { id: productId } },
      body: {
        related_id: form.related_id,
        kind: form.kind as 'substitute' | 'complement',
        priority: form.priority ? Number(form.priority) : undefined,
      },
    });
    if (error) {
      setErr(faError(error));
      return;
    }
    setForm({ related_id: '', kind: 'substitute', priority: '100' });
    onNotice('رابطه ثبت شد.');
    await load();
  };

  const remove = async (relationId: string): Promise<void> => {
    setErr(null);
    const { error } = await api.DELETE('/product-relations/{relationId}', { params: { path: { relationId } } });
    if (error) {
      setErr(faError(error));
      return;
    }
    onNotice('رابطه حذف شد.');
    await load();
  };

  return (
    <div className="space-y-4">
      {err && <p className={errorCls}>{err}</p>}
      <form onSubmit={add} className={`${panelCls} space-y-3`}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            جست‌وجوی کالا
            <input className={`${inputCls} mt-1 w-56`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="کد یا نام" />
          </label>
          <button type="button" className={btnGhost} onClick={() => void searchProducts()}>
            جست‌وجو
          </button>
          <label className="text-sm">
            کالای مرتبط
            <select className={`${selectCls} mt-1 w-64`} value={form.related_id} onChange={(e) => setForm({ ...form, related_id: e.target.value })} required>
              <option value="">— انتخاب —</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            نوع رابطه
            <select className={`${selectCls} mt-1 w-36`} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="substitute">جایگزین</option>
              <option value="complement">مکمل</option>
            </select>
          </label>
          <label className="text-sm">
            اولویت
            <input type="number" min={0} className={`${inputCls} mt-1 w-24`} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} />
          </label>
          <button type="submit" className={btnPrimary}>
            ثبت رابطه
          </button>
        </div>
      </form>

      <div className={tableWrapCls}>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={thCls}>کد</th>
              <th className={thCls}>نام</th>
              <th className={thCls}>نوع رابطه</th>
              <th className={thCls}>اولویت</th>
              <th className={thCls}>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className={`${tdCls} py-6 text-center text-ink-subtle`}>
                  رابطه‌ای ثبت نشده است
                </td>
              </tr>
            )}
            {items.map((r) => (
              <tr key={r.id} className="border-t border-line">
                <td className={`${tdCls} font-mono text-xs`} dir="ltr">
                  {r.related_code}
                </td>
                <td className={tdCls}>{r.related_name}</td>
                <td className={`${tdCls} text-ink-muted`}>{RELATION_KIND_LABEL[r.kind] ?? r.kind}</td>
                <td className={tdCls}>{r.priority}</td>
                <td className={tdCls}>
                  <button className={btnDangerSmall} onClick={() => void remove(r.id)}>
                    حذف
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================
 * تب ترکیبِ بسته — D5 (فقط تعریفِ کاتالوگی؛ تا P5 غیرقابل سفارش/فروش)
 * ============================================================ */
function BundleTab({ productId, onNotice }: { productId: string; onNotice: (msg: string | null) => void }) {
  const [items, setItems] = useState<BundleComponent[]>([]);
  const [candidates, setCandidates] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [component, setComponent] = useState({ id: '', qty: '1' });
  const [confirmSensitive, setConfirmSensitive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await api.GET('/products/{id}/bundle', { params: { path: { id: productId } } });
    if (!error) setItems((data ?? []) as BundleComponent[]);
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const searchProducts = async (): Promise<void> => {
    const { data, error } = await api.GET('/products', { params: { query: { q: search || undefined, limit: 20 } } });
    if (!error) setCandidates(data?.items ?? []);
  };

  /** PUT کلِ ترکیب (API ترکیب را جایگزین می‌کند) */
  const putBundle = async (nextItems: { component_product_id: string; qty: number }[]): Promise<void> => {
    setBusy(true);
    setErr(null);
    const { error } = await api.PUT('/products/{id}/bundle', {
      params: { path: { id: productId } },
      body: { items: nextItems, confirm_sensitive: confirmSensitive || undefined },
    });
    setBusy(false);
    if (error) {
      const body = errorBody(error);
      if (body.code === 'sensitive_change_requires_confirmation') {
        setErr('ترکیبِ بسته فیلدِ حساس است (D4)؛ گزینهٔ تأیید را فعال کنید و دوباره ثبت کنید.');
      } else {
        setErr(faError(error));
      }
      return;
    }
    setConfirmSensitive(false);
    onNotice('ترکیبِ بسته ثبت شد.');
    await load();
  };

  const addComponent = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const qty = Number(component.qty);
    if (!component.id || !(qty > 0)) return;
    await putBundle([
      ...items.map((i) => ({ component_product_id: i.component_product_id, qty: Number(i.qty) })),
      { component_product_id: component.id, qty },
    ]);
    setComponent({ id: '', qty: '1' });
  };

  const removeComponent = async (componentId: string): Promise<void> => {
    await putBundle(
      items
        .filter((i) => i.component_product_id !== componentId)
        .map((i) => ({ component_product_id: i.component_product_id, qty: Number(i.qty) })),
    );
  };

  return (
    <div className="space-y-4">
      <div className={`${warnCls} text-xs`}>
        <p className="font-medium">D5 — محدودیتِ مرحلهٔ P1:</p>
        <p>
          ترکیبِ بسته فقط «تعریفِ کاتالوگی» است. SKU بسته تا مرحلهٔ P5 در سفارش/فروش/حرکتِ موجودی پذیرفته نمی‌شود و
          پایگاه‌داده نیز سطرِ سندِ فروشِ حاویِ بسته را رد می‌کند. اجزای تودرتو (بسته داخل بسته) ممنوع است.
        </p>
      </div>
      {err && <p className={errorCls}>{err}</p>}

      <form onSubmit={addComponent} className={`${panelCls} space-y-3`}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            جست‌وجوی کالا
            <input className={`${inputCls} mt-1 w-56`} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="کد یا نامِ جزء" />
          </label>
          <button type="button" className={btnGhost} onClick={() => void searchProducts()}>
            جست‌وجو
          </button>
          <label className="text-sm">
            جزء
            <select className={`${selectCls} mt-1 w-64`} value={component.id} onChange={(e) => setComponent({ ...component, id: e.target.value })} required>
              <option value="">— انتخاب —</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            تعداد
            <input type="number" step="any" min="0.0001" className={`${inputCls} mt-1 w-24`} value={component.qty} onChange={(e) => setComponent({ ...component, qty: e.target.value })} required />
          </label>
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? 'در حال ثبت…' : 'افزودنِ جزء'}
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={confirmSensitive} onChange={(e) => setConfirmSensitive(e.target.checked)} />
          تغییرِ ترکیبِ بسته (فیلدِ حساس — D4) را تأیید می‌کنم
        </label>
      </form>

      <div className={tableWrapCls}>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={thCls}>کدِ جزء</th>
              <th className={thCls}>نام</th>
              <th className={thCls}>تعداد</th>
              <th className={thCls}>وضعیت</th>
              <th className={thCls}>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className={`${tdCls} py-6 text-center text-ink-subtle`}>
                  جزئی ثبت نشده است
                </td>
              </tr>
            )}
            {items.map((i) => (
              <tr key={i.component_product_id} className="border-t border-line">
                <td className={`${tdCls} font-mono text-xs`} dir="ltr">
                  {i.component_code ?? '—'}
                </td>
                <td className={tdCls}>{i.component_name ?? '—'}</td>
                <td className={`${tdCls} font-mono`} dir="ltr">
                  {i.qty}
                </td>
                <td className={`${tdCls} text-ink-muted`}>{i.component_status ? STATUS_LABEL[i.component_status] ?? i.component_status : '—'}</td>
                <td className={tdCls}>
                  <button className={btnDangerSmall} disabled={busy} onClick={() => void removeComponent(i.component_product_id)}>
                    حذف
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
