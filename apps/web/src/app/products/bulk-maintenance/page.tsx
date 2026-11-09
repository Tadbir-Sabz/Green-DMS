'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, getToken } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AppLoader } from '@/components/AppShell';
import {
  DIST_LABEL,
  STATUS_LABEL,
  btnGhost,
  btnPrimary,
  btnSmall,
  errorCls,
  faError,
  inputCls,
  panelCls,
  selectCls,
  statusBadgeCls,
  tableWrapCls,
  tdCls,
  thCls,
  warnCls,
  type BulkMaintenanceExecuteRequest,
  type BulkMaintenanceField,
  type BulkMaintenanceOperationResult,
  type BulkMaintenancePreviewRequest,
  type BulkMaintenancePreviewResponse,
  type Product,
} from '../products-lib';
import {
  BULK_ITEM_STATUS_LABEL,
  BULK_MAX_FIELDS,
  BULK_MAX_PRODUCTS,
  BULK_STATUS_LABEL,
  BULK_FAILURE_LABEL,
  bulkEnumLabel,
  bulkOperationSummary,
  bulkPreviewExpired,
  bulkStatusToneCls,
  buildBulkChanges,
  bulkSelectionError,
  bulkValueDisplay,
} from './bulk-maintenance';

/**
 * TASK-PM-01D-M4 — Persian RTL controlled bulk maintenance.
 * The page never invents a preview: only the server endpoint produces exact
 * before/after diffs, eligibility and the stable operation identity.
 */
export default function BulkMaintenancePage(): React.JSX.Element {
  const auth = useAuth();
  const sort = useRef<'code_asc' | 'code_desc'>('code_asc');
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [items, setItems] = useState<Product[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  const [fields, setFields] = useState<BulkMaintenanceField[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldsError, setFieldsError] = useState<string | null>(null);
  const [selectedFieldKeys, setSelectedFieldKeys] = useState<string[]>([]);
  const [rawValues, setRawValues] = useState<Record<string, string>>({});

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<BulkMaintenancePreviewResponse | null>(null);
  const [result, setResult] = useState<BulkMaintenanceOperationResult | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [executeLoading, setExecuteLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [executeError, setExecuteError] = useState<string | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const loadProducts = useCallback(async (query: string, st: string, cursor?: string) => {
    setLoading(true);
    setListError(null);
    const { data, error } = await api.GET('/products', {
      params: {
        query: {
          sort: sort.current,
          q: query || undefined,
          status: st || undefined,
          cursor: cursor ?? undefined,
          limit: 100,
        },
      },
    });
    setLoading(false);
    if (error) {
      setListError(faError(error));
      return;
    }
    const pageItems = data?.items ?? [];
    setItems((prev) => (cursor ? [...prev, ...pageItems] : pageItems));
    setNextCursor(data?.has_more ? (data?.next_cursor ?? null) : null);
  }, []);

  const loadFields = useCallback(async () => {
    setFieldsLoading(true);
    setFieldsError(null);
    const { data, error } = await api.GET('/products/bulk-maintenance/fields');
    setFieldsLoading(false);
    if (error) {
      setFieldsError(faError(error));
      return;
    }
    setFields(data?.supported_fields ?? []);
  }, []);

  const canWrite = auth.hasPermission('master.product.update');

  useEffect(() => {
    if (auth.isLoading) return;
    if (!getToken()) {
      setAuthError('نشست معتبر یافت نشد؛ ابتدا وارد شوید.');
      setReady(true);
      return;
    }
    setReady(true);
    // Fail closed before any API call: view/export permissions are not enough.
    if (!canWrite) return;
    void loadFields();
    void loadProducts('', '');
  }, [auth.isLoading, canWrite, loadFields, loadProducts]);

  const clearWorkflow = useCallback(() => {
    setPreview(null);
    setResult(null);
    setConfirm(false);
    setPreviewError(null);
    setExecuteError(null);
    setStatusError(null);
  }, []);

  const busy = previewLoading || executeLoading || statusLoading;
  const selectedIds = [...selected].sort();
  const selectionError = bulkSelectionError(selectedIds.length);
  const built = buildBulkChanges(fields, selectedFieldKeys, rawValues);
  const previewExpired = preview ? bulkPreviewExpired(preview.expires_at) : false;
  const canPreview =
    !busy &&
    !preview &&
    !result &&
    !fieldsLoading &&
    fields.length > 0 &&
    selectionError === null &&
    built.changes !== undefined;
  const canExecute =
    !!preview &&
    confirm &&
    !previewExpired &&
    preview.eligible_count > 0 &&
    preview.rejected_count === 0 &&
    !busy &&
    !result;

  const toggleProduct = (id: string): void => {
    if (busy || preview || result) return;
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else {
      if (next.size >= BULK_MAX_PRODUCTS) {
        setListError(`حداکثر ${BULK_MAX_PRODUCTS} کالا قابل انتخاب است.`);
        return;
      }
      next.add(id);
    }
    setListError(null);
    setSelected(next);
    clearWorkflow();
  };

  const toggleAllVisible = (): void => {
    if (busy || preview || result) return;
    const allSelected = items.length > 0 && items.every((p) => selected.has(p.id));
    const next = new Set(selected);
    if (allSelected) {
      for (const p of items) next.delete(p.id);
    } else {
      for (const p of items) {
        if (next.size >= BULK_MAX_PRODUCTS) break;
        next.add(p.id);
      }
      if (items.some((p) => !next.has(p.id))) {
        setListError(`فقط ${BULK_MAX_PRODUCTS} کالا اضافه شد؛ سقف انتخاب تکمیل است.`);
      }
    }
    setSelected(next);
    clearWorkflow();
  };

  const toggleFieldKey = (key: string): void => {
    if (busy || preview || result) return;
    setSelectedFieldKeys((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= BULK_MAX_FIELDS) {
        setFieldsError(`حداکثر ${BULK_MAX_FIELDS} فیلد قابل تغییر است.`);
        return prev;
      }
      return [...prev, key];
    });
    clearWorkflow();
  };

  const setRawValue = (key: string, value: string): void => {
    setRawValues((prev) => ({ ...prev, [key]: value }));
    clearWorkflow();
  };

  const onPreviewSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!canPreview || !built.changes) return;
    clearWorkflow();
    setPreviewLoading(true);
    const body: BulkMaintenancePreviewRequest = {
      product_ids: selectedIds,
      changes: built.changes,
    };
    const { data, error } = await api.POST('/products/bulk-maintenance/preview', { body });
    setPreviewLoading(false);
    if (error) {
      setPreviewError(faError(error));
      return;
    }
    if (!data) {
      setPreviewError('پاسخ پیشنمایش معتبر دریافت نشد.');
      return;
    }
    setPreview(data);
    if (data.supported_fields?.length) setFields(data.supported_fields);
  };

  const onExecute = async (): Promise<void> => {
    if (!canExecute || !preview) return;
    setExecuteLoading(true);
    setExecuteError(null);
    setStatusError(null);
    const body: BulkMaintenanceExecuteRequest = {
      operation_id: preview.operation_id,
      preview_token: preview.preview_token,
      confirm: true,
    };
    const { data, error } = await api.POST('/products/bulk-maintenance/execute', { body });
    setExecuteLoading(false);
    if (error) {
      setExecuteError(faError(error));
      return;
    }
    if (!data) {
      setExecuteError('نتیجهای از سرور دریافت نشد؛ تغییری تأیید نمیشود.');
      return;
    }
    setResult(data);
    if (data.status === 'committed') void loadProducts(q, status);
  };

  const onRefreshStatus = async (): Promise<void> => {
    const operationId = result?.operation_id ?? preview?.operation_id;
    if (!operationId) return;
    setStatusLoading(true);
    setStatusError(null);
    const { data, error } = await api.GET('/products/bulk-maintenance/operations/{operationId}', {
      params: { path: { operationId } },
    });
    setStatusLoading(false);
    if (error) {
      setStatusError(faError(error));
      return;
    }
    if (data) setResult(data);
    else setStatusError('وضعیت عملیات دریافت نشد.');
  };

  const onResetWorkflow = (): void => {
    clearWorkflow();
    void loadProducts(q, status);
  };

  const renderFieldInput = (field: BulkMaintenanceField): React.JSX.Element => {
    const ltr =
      field.kind === 'uuid' ||
      field.kind === 'number' ||
      field.kind === 'nullable_integer' ||
      field.key === 'name_latin';
    const common = {
      className: inputCls,
      dir: ltr ? ('ltr' as const) : undefined,
      value: rawValues[field.key] ?? '',
      disabled: busy || !!preview || !!result,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setRawValue(field.key, e.target.value),
    };
    if (field.kind === 'enum' || field.kind === 'boolean') {
      const options =
        field.kind === 'boolean'
          ? [
              { value: 'true', label: 'بله' },
              { value: 'false', label: 'خیر' },
            ]
          : (field.enum_values ?? []).map((v) => ({ value: v, label: bulkEnumLabel(field, v) }));
      return (
        <select {...common} className={selectCls} aria-label={`مقدار ${field.label_fa}`}>
          <option value="">انتخاب کنید</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    const type =
      field.kind === 'number' || field.kind === 'nullable_integer' ? 'number' : 'text';
    return (
      <input
        {...common}
        type={type}
        min={type === 'number' ? 0 : undefined}
        step={field.kind === 'number' ? 'any' : field.kind === 'nullable_integer' ? 1 : undefined}
        maxLength={field.max_length ?? undefined}
        placeholder={field.kind === 'uuid' ? 'UUID برند همان شرکت' : ''}
        aria-label={`مقدار ${field.label_fa}`}
      />
    );
  };

  if (auth.isLoading || !ready) return <AppLoader />;
  if (authError) return <p className={errorCls}>{authError}</p>;
  if (!canWrite) {
    return (
      <p className={errorCls}>
        برای نگهداشت گروهی کالا مجوز «ویرایش کالای مرکزی» لازم است؛ مجوز مشاهده یا خروجی CSV کافی
        نیست.
      </p>
    );
  }

  return (
    <div className="space-y-4" aria-busy={busy}>
      <h1 className="text-lg font-semibold text-ink">نگهداشت گروهی کنترلشده کالا</h1>
      <p className={`${panelCls} text-sm text-ink-muted`}>
        فقط فیلدهای مرکزی فهرست سفید سرور، حداکثر {BULK_MAX_PRODUCTS} کالا و
        {` ${BULK_MAX_FIELDS} `}
        فیلد در هر عملیات. تغییرات حساس، وضعیت، واحد پایه، کد، موجودی، قیمت، انبار، شعبه،
        ناوگان و عضویت دامنهای در این مسیر مجاز نیستند.
      </p>

      {/* جستوجو و فیلتر — همان قرارداد فهرست کالا */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void loadProducts(q, status);
        }}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4"
      >
        <label className="flex-1 text-sm">
          جستوجو (کد/نام)
          <input
            className={`${inputCls} mt-1`}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="مثلاً شیر یا P-100"
          />
        </label>
        <label className="text-sm">
          وضعیت
          <select
            className={`${selectCls} mt-1 w-40`}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              void loadProducts(q, e.target.value);
            }}
          >
            <option value="">همه</option>
            <option value="active">فعال</option>
            <option value="blocked">مسدود</option>
            <option value="discontinued">متوقف</option>
          </select>
        </label>
        <label className="text-sm">
          ترتیب کد
          <select
            className={`${selectCls} mt-1 w-40`}
            defaultValue="code_asc"
            onChange={(e) => {
              sort.current = e.target.value as 'code_asc' | 'code_desc';
              void loadProducts(q, status);
            }}
          >
            <option value="code_asc">صعودی</option>
            <option value="code_desc">نزولی</option>
          </select>
        </label>
        <button type="submit" className={btnGhost} disabled={loading}>
          {loading ? 'در حال دریافت…' : 'اعمال فیلتر'}
        </button>
      </form>

      {listError && <p className={`${errorCls} text-sm`}>{listError}</p>}
      {fieldsError && <p className={`${errorCls} text-sm`}>{fieldsError}</p>}

      {/* انتخاب کالاها */}
      <section className={tableWrapCls} aria-labelledby="bulk-selection-title">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-alt p-3">
          <h2 id="bulk-selection-title" className="text-sm font-medium text-ink">
            انتخاب کالاها
          </h2>
          <p role="status" aria-live="polite" className="text-sm text-ink-muted">
            {selectedIds.length.toLocaleString('fa-IR')} کالا انتخاب شده است
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={thCls}>
                  <input
                    type="checkbox"
                    aria-label="انتخاب همه کالاهای نمایش داده شده"
                    checked={items.length > 0 && items.every((p) => selected.has(p.id))}
                    onChange={toggleAllVisible}
                    disabled={busy || !!preview || !!result || loading}
                  />
                </th>
                <th className={thCls}>کد</th>
                <th className={thCls}>نام</th>
                <th className={thCls}>وضعیت</th>
                <th className={thCls}>توزیع</th>
                <th className={thCls}>حداقل سفارش</th>
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className={`${tdCls} py-8 text-center text-ink-subtle`}>
                    در حال دریافت فهرست…
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={6} className={`${tdCls} py-8 text-center text-ink-subtle`}>
                    کالایی یافت نشد
                  </td>
                </tr>
              )}
              {items.map((p) => (
                <tr key={p.id} className="border-t border-line hover:bg-surface-alt">
                  <td className={tdCls}>
                    <input
                      type="checkbox"
                      aria-label={`انتخاب کالا ${p.code}`}
                      checked={selected.has(p.id)}
                      onChange={() => toggleProduct(p.id)}
                      disabled={busy || !!preview || !!result}
                    />
                  </td>
                  <td className={`${tdCls} font-mono text-xs`}>{p.code}</td>
                  <td className={tdCls}>{p.name}</td>
                  <td className={tdCls}>
                    <span className={statusBadgeCls(p.status)}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className={`${tdCls} text-ink-muted`}>
                    {DIST_LABEL[p.distribution_kind] ?? p.distribution_kind}
                  </td>
                  <td className={tdCls}>{p.min_order_qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {nextCursor && (
          <div className="border-t border-line p-3 text-start">
            <button
              type="button"
              className={btnSmall}
              disabled={loading}
              onClick={() => void loadProducts(q, status, nextCursor)}
            >
              صفحه بعدی
            </button>
          </div>
        )}
      </section>

      {/* فیلدها و مقادیر — فهرست سفید از سرور */}
      <form
        onSubmit={(e) => void onPreviewSubmit(e)}
        className={`${panelCls} space-y-3`}
        aria-labelledby="bulk-fields-title"
      >
        <h2 id="bulk-fields-title" className="text-sm font-medium text-ink">
          فیلدها و مقادیر پیشنهادی
        </h2>
        {fieldsLoading && <p className="text-sm text-ink-subtle">در حال دریافت فیلدهای مجاز…</p>}
        {!fieldsLoading && fields.length === 0 && (
          <p className={errorCls}>فیلد مجازی از سرور دریافت نشد؛ پیشنمایش غیرفعال است.</p>
        )}
        <fieldset className="grid gap-3 md:grid-cols-2" disabled={busy || !!preview || !!result}>
          <legend className="sr-only">فیلدهای مجاز نگهداشت گروهی</legend>
          {fields.map((field) => {
            const checked = selectedFieldKeys.includes(field.key);
            return (
              <div key={field.key} className="rounded-lg border border-line bg-surface p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-ink">
                  <input
                    type="checkbox"
                    aria-label={`انتخاب فیلد ${field.label_fa}`}
                    checked={checked}
                    onChange={() => toggleFieldKey(field.key)}
                  />
                  {field.label_fa}
                </label>
                {checked && (
                  <label className="mt-2 block text-xs text-ink-muted">
                    مقدار {field.label_fa}
                    {renderFieldInput(field)}
                  </label>
                )}
              </div>
            );
          })}
        </fieldset>
        {selectionError && <p className={`${warnCls} text-sm`}>{selectionError}</p>}
        {built.error_fa && selectedFieldKeys.length > 0 && (
          <p className={`${warnCls} text-sm`}>{built.error_fa}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="submit" className={btnPrimary} disabled={!canPreview}>
            {previewLoading ? 'در حال ساخت پیشنمایش…' : 'ساخت پیشنمایش سروری'}
          </button>
          {(preview || result) && (
            <button type="button" className={btnGhost} onClick={onResetWorkflow} disabled={busy}>
              پیشنمایش تازه
            </button>
          )}
        </div>
        <p className="text-xs text-ink-muted">
          پیشنمایش فقطخواندنی است و هیچ تغییری در کالا یا تاریخچه ثبت نمیکند. اجرا فقط پس از
          تأیید صریح و با همان نشانه و شناسه عملیات انجام میشود.
        </p>
      </form>

      {previewError && <p className={errorCls}>{previewError}</p>}
      {executeError && <p className={errorCls}>{executeError}</p>}
      {statusError && <p className={errorCls}>{statusError}</p>}

      {/* پیشنمایش دقیق قبل/بعد و تأیید صریح */}
      {preview && (
        <section className={`${panelCls} space-y-4`} aria-live="polite" aria-labelledby="bulk-preview-title">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 id="bulk-preview-title" className="text-sm font-medium text-ink">
                پیشنمایش سروری و تفاوت دقیق
              </h2>
              <p className="mt-1 text-xs text-ink-muted" dir="ltr">
                operation_id: <code>{preview.operation_id}</code>
              </p>
              <p className="mt-1 text-xs text-ink-muted" dir="ltr">
                expires_at: <time dateTime={preview.expires_at}>{preview.expires_at}</time>
              </p>
            </div>
            <p role="status" className="text-sm text-ink-muted">
              واجد: {preview.eligible_count.toLocaleString('fa-IR')} · ردشده:{' '}
              {preview.rejected_count.toLocaleString('fa-IR')}
            </p>
          </div>

          {previewExpired && (
            <p className={`${warnCls} text-sm`}>
              این پیشنمایش منقضی شده است؛ اجرا غیرفعال است و باید پیشنمایش تازهای ساخته شود.
            </p>
          )}
          {preview.rejected_count > 0 && (
            <p className={`${warnCls} text-sm`}>
              یک یا چند کالا واجد شرایط نیستند؛ برای حفظ رفتار همهیا هیچ، اجرا غیرفعال است.
              کالاهای ردشده را از انتخاب خارج کنید و پیشنمایش تازهای بسازید.
            </p>
          )}

          <div className="space-y-3">
            {preview.items.map((item) => (
              <article key={item.product_id} className="rounded-lg border border-line bg-surface">
                <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-alt p-3">
                  <div>
                    <span className="font-mono text-xs">{item.code}</span> — {item.name}
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      item.status === 'eligible'
                        ? 'bg-brand-soft text-success-ink'
                        : 'bg-danger-soft text-danger-ink'
                    }`}
                  >
                    {BULK_ITEM_STATUS_LABEL[item.status] ?? item.status}
                  </span>
                </header>
                {item.message_fa && <p className={`${warnCls} m-3 text-sm`}>{item.message_fa}</p>}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className={thCls}>فیلد</th>
                        <th className={thCls}>پیش از</th>
                        <th className={thCls}>پس از</th>
                        <th className={thCls}>وضعیت</th>
                      </tr>
                    </thead>
                    <tbody>
                      {item.changes.length === 0 && (
                        <tr>
                          <td colSpan={4} className={`${tdCls} text-ink-subtle`}>
                            تفاوتی برای نمایش وجود ندارد.
                          </td>
                        </tr>
                      )}
                      {item.changes.map((diff) => (
                        <tr key={diff.field} className="border-t border-line">
                          <td className={tdCls}>{diff.label_fa}</td>
                          <td className={tdCls}>
                            {diff.before_label}
                            <span className="mt-1 block font-mono text-[10px] text-ink-subtle" dir="ltr">
                              {bulkValueDisplay(diff.before)}
                            </span>
                          </td>
                          <td className={tdCls}>
                            {diff.after_label}
                            <span className="mt-1 block font-mono text-[10px] text-ink-subtle" dir="ltr">
                              {bulkValueDisplay(diff.after)}
                            </span>
                          </td>
                          <td className={tdCls}>{diff.changed ? 'تغییر' : 'بدون تغییر'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </div>

          <label className="flex items-start gap-2 rounded-lg border border-warning-line bg-warning-soft p-3 text-sm text-warning-ink">
            <input
              type="checkbox"
              aria-label="تأیید نهایی اجرای نگهداشت گروهی"
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
              disabled={busy || !!result}
            />
            تأیید میکنم تفاوتهای بالا را بررسی کردم و اجرای همهیا هیچ این عملیات را روی
            {` ${preview.eligible_count.toLocaleString('fa-IR')} `}
            کالای واجد شرایط میخواهم.
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnPrimary}
              disabled={!canExecute}
              onClick={() => void onExecute()}
            >
              {executeLoading ? 'در حال اجرا…' : 'اجرای تأییدشده'}
            </button>
            <button type="button" className={btnGhost} onClick={onResetWorkflow} disabled={busy}>
              انصراف و پیشنمایش تازه
            </button>
          </div>
        </section>
      )}

      {/* نتیجه نهایی، پخش مجدد، رد و نامشخص fail-closed */}
      {result && (
        <section
          className={`${bulkStatusToneCls(result.status)} space-y-3`}
          aria-live="polite"
          aria-labelledby="bulk-result-title"
        >
          <h2 id="bulk-result-title" className="text-sm font-medium">
            {BULK_STATUS_LABEL[result.status] ?? result.status}
          </h2>
          <p className="text-sm">{bulkOperationSummary(result)}</p>
          <p className="text-xs" dir="ltr">
            operation_id: <code>{result.operation_id}</code>
          </p>
          <p className="text-xs">
            دسته خطا: {BULK_FAILURE_LABEL[result.failure_category] ?? result.failure_category}
            {result.reason_code ? ` · ${result.reason_code}` : ''}
          </p>
          {result.message_fa && <p className="text-sm">{result.message_fa}</p>}
          {result.reconciliation_hint_fa && (
            <p className="text-sm">{result.reconciliation_hint_fa}</p>
          )}
          {result.idempotent_replay && (
            <p className="text-xs">پخش مجدد همان شناسه بود؛ تغییر دوبارهای اعمال نشد.</p>
          )}
          {result.reconciled && (
            <p className="text-xs">وضعیت با شواهد ممیزی و تاریخچهای تطبیق داده شد.</p>
          )}
          <ul className="space-y-1 text-xs">
            {result.lifecycle.map((event, index) => (
              <li key={`${event.state}-${index}`}>
                {BULK_STATUS_LABEL[event.state] ?? event.state} —{' '}
                <time dateTime={event.at} dir="ltr">
                  {event.at}
                </time>
              </li>
            ))}
          </ul>
          {result.items.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-line bg-surface">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className={thCls}>کالا</th>
                    <th className={thCls}>نتیجه</th>
                    <th className={thCls}>نسخه</th>
                    <th className={thCls}>تاریخچه</th>
                  </tr>
                </thead>
                <tbody>
                  {result.items.map((item) => (
                    <tr key={item.product_id} className="border-t border-line">
                      <td className={tdCls}>
                        <span className="font-mono">{item.code}</span> — {item.name}
                        {item.message_fa && (
                          <span className="mt-1 block text-ink-subtle">{item.message_fa}</span>
                        )}
                      </td>
                      <td className={tdCls}>
                        {BULK_ITEM_STATUS_LABEL[item.status] ?? item.status}
                      </td>
                      <td className={tdCls} dir="ltr">
                        {bulkValueDisplay(item.row_version_before)} →{' '}
                        {bulkValueDisplay(item.row_version_after)}
                      </td>
                      <td className={tdCls}>
                        <Link href={item.product_url} className={btnSmall}>
                          تاریخچه کالا
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnGhost}
              onClick={() => void onRefreshStatus()}
              disabled={statusLoading}
            >
              {statusLoading ? 'در حال بازخوانی…' : 'بازخوانی وضعیت'}
            </button>
            <button type="button" className={btnGhost} onClick={onResetWorkflow} disabled={busy}>
              پیشنمایش تازه
            </button>
          </div>
          <p className="text-xs">
            اجرای مجدد با همان شناسه انجام نمیشود؛ در نتیجه نامشخص فقط تطبیق شواهد و بررسی
            اپراتور مجاز است.
          </p>
        </section>
      )}
    </div>
  );
}
