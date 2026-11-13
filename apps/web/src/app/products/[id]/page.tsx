'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { CatalogHistory, DomainIntegrationStatus } from './catalog-evidence';
import { ProductLifecycleTab } from './product-lifecycle';
import { ProductRelationsTab } from './product-relations';
import { ProductMediaTab } from './product-media';
import { ProductAliasesTab } from './product-aliases';
import { ProductAttributesTab } from './product-attributes';
import { useParams, useRouter } from 'next/navigation';
import type { components } from '@dms/api-client';
import { api, getToken } from '@/lib/api';
import { AppLoader } from '@/components/AppShell';
import { ReferenceSelectors, type ReferenceSelection } from '../reference-data/reference-selectors';
import {
  type BundleComponent,
  type Product,
  type ProductBarcode,
  type ProductFamily,
  type ProductPackaging,
  BARCODE_KIND_LABEL,
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
type TabKey = 'identity' | 'media' | 'attributes' | 'aliases' | 'barcodes' | 'packaging' | 'relations' | 'bundle' | 'history' | 'domain' | 'lifecycle';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'lifecycle', label: 'چرخه حیات' },
  { key: 'history', label: 'تاریخچه' },
  { key: 'domain', label: 'عرضه در دامنه' },
  { key: 'identity', label: 'مشخصات' },
  { key: 'media', label: 'تصاویر و اسناد' },
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
  const auth = useAuth();
  const canWrite = auth.hasPermission('master.product.update');
  // C1: آپلود تصویر/سند علاوه بر مجوز محصول، مجوز ضمیمه را هم میخواهد؛
  // مشاهده/دانلود برای نشستهای فقطخواندنی همچنان در دسترس میماند.
  const canUpload = canWrite && auth.hasPermission('attachment.upload');
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

      {tab === 'lifecycle' && <ProductLifecycleTab productId={id} onChanged={loadProduct} />}
      {tab === 'history' && <CatalogHistory productId={id} />}
      {tab === 'domain' && <DomainIntegrationStatus productId={id} />}
      {tab === 'media' && <ProductMediaTab productId={id} canUpload={canUpload} />}
      {!canWrite && <p className='mb-4 text-sm text-ink-muted'>این نشست فقط دسترسی خواندن کاتالوگ دارد.</p>}
      <fieldset disabled={!canWrite} className='min-w-0'>
      {tab === 'identity' && <IdentityTab product={product} onSaved={loadProduct} onNotice={setNotice} />}
      {tab === 'attributes' && <AttributesTab productId={id} signature={product.variant_signature ?? null} onNotice={setNotice} />}
      {tab === 'aliases' && <AliasesTab productId={id} onNotice={setNotice} />}
      {tab === 'barcodes' && <BarcodesTab productId={id} onNotice={setNotice} />}
      {tab === 'packaging' && <PackagingTab productId={id} onNotice={setNotice} />}
      {tab === 'relations' && <ProductRelationsTab productId={id} />}
      {tab === 'bundle' && <BundleTab productId={id} onNotice={setNotice} />}
      </fieldset>
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
    brand_id: product.brand_id ?? '',
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
  const [families, setFamilies] = useState<ProductFamily[]>([]);

  // برند/واحد/دسته را ReferenceSelectors با قرارداد /reference-data/* میگیرد؛
  // در حالت ویرایش، مقدار تاریخی غیرفعال هم نمایش داده میشود ولی قابلانتخاب مجدد نیست.
  useEffect(() => {
    void api.GET('/product-families').then(({ data, error }) => {
      if (error) setErr(faError(error));
      else setFamilies(data ?? []);
    });
  }, []);

  // D4 — فیلدهای حساس: تغییرِشان نیازمندِ تأییدِ صریح است
  const categoryChanged = form.category_id !== product.category_id;
  const uomChanged = form.base_uom_id !== product.base_uom_id;
  const brandChanged = form.brand_id !== (product.brand_id ?? '');
  // C5: وضعیت فقط از تب اختصاصی چرخهٔ حیات و مسیر تراکنشی آن تغییر میکند.
  const sensitiveChanged =
    (form.tax_code_id || null) !== (product.tax_code_id ?? null) ||
    uomChanged;

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
        // فقط مراجعی که واقعاً تغییر کردهاند ارسال میشوند: ویرایش سایر فیلدهای
        // یک کالای قدیمی با مرجع غیرفعال، نباید به اجبار ارجاع را عوض کند.
        ...(categoryChanged ? { category_id: form.category_id } : {}),
        ...(uomChanged ? { base_uom_id: form.base_uom_id } : {}),
        ...(brandChanged ? { brand_id: form.brand_id || null } : {}),
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
        <ReferenceSelectors
          mode="edit"
          disabled={false}
          value={{
            category_id: form.category_id,
            base_uom_id: form.base_uom_id,
            brand_id: form.brand_id,
          }}
          onChange={(next: ReferenceSelection) =>
            setForm({
              ...form,
              category_id: next.category_id,
              base_uom_id: next.base_uom_id,
              brand_id: next.brand_id,
            })
          }
        />
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
        <div className="rounded-lg border border-line bg-surface-alt p-3 text-sm">
          <span className="text-ink-muted">وضعیت مرکزی</span>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <span className={statusBadgeCls(product.status)}>{STATUS_LABEL[product.status] ?? product.status}</span>
            <span className="text-xs text-ink-subtle">حساس — D4</span>
          </p>
          <p className="mt-2 text-xs leading-6 text-ink-muted">
            تغییر وضعیت فقط از تب «چرخه حیات» با تأیید، قفل نسخه و تاریخچه انجام میشود؛
            گذارهای شامل «متوقف» تا تصویب مالک BLOCKED / NOT AUTHORIZEDاند.
          </p>
        </div>
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
 * تب صفات کالا — B3 + M-3 (TASK-PM-02-C7)
 * ============================================================ */
function AttributesTab({ productId }: { productId: string; signature?: string | null; onNotice?: (m: string | null) => void }) {
  return <ProductAttributesTab productId={productId} />;
}

/* ============================================================
 * تب نام‌های جایگزین — H-1 (TASK-PM-02-C7)
 * ============================================================ */
function AliasesTab({ productId }: { productId: string; onNotice?: (m: string | null) => void }) {
  return <ProductAliasesTab productId={productId} />;
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
