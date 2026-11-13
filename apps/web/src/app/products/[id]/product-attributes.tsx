'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { components } from '@dms/api-client';
import { api } from '@/lib/api';
import {
  ATTR_KIND_LABEL,
  btnDangerSmall,
  btnGhost,
  btnPrimary,
  errorBody,
  errorCls,
  faError,
  inputCls,
  okCls,
  panelCls,
  tableWrapCls,
  tdCls,
  thCls,
  warnCls,
} from '../products-lib';

type AttributesOverview = components['schemas']['ProductAttributesOverview'];
type Entry = components['schemas']['ProductAttributeCatalogEntry'];
type HistoryEvent = components['schemas']['ProductIdentityHistoryEvent'];

/** پیام فارسیِ خطاهای واقعیِ سرور برای صفات کالا. */
export function attributeErrorMessage(error: unknown): string {
  const body = errorBody(error);
  switch (body.code) {
    case 'invalid_attribute':
      return 'صفت انتخاب‌شده در کاتالوگ این شرکت وجود ندارد (تعریف از کاتالوگ معتبر است، نه از کلاینت).';
    case 'invalid_attribute_value':
      return 'مقدار با نوع صفت یا فهرست مقادیر مجاز آن سازگار نیست.';
    case 'required_attribute_missing':
      return 'یک یا چند صفت الزامی شرکت برای این کالا مقدار ندارند.';
    case 'variant_signature_immutable':
      return 'پس از نخستین ارجاع عملیاتی (سند/موجودی/قیمت)، محورهای variant تغییرناپذیرند.';
    case 'duplicate_variant_signature':
      return 'ترکیب این محورها برای SKU دیگری در همین خانواده قبلاً ثبت شده است.';
    case 'forbidden_client_field':
      return 'درخواست شامل فیلد شرکت، هویت، مجوز یا ممیزی بود و رد شد.';
    case 'unsupported_request_field':
      return 'فیلد ارسالی در قرارداد مقادیر صفات تعریف نشده است.';
    default:
      return faError(error);
  }
}

type Draft = { text: string; num: string; enumValue: string };


const DIGIT_MAP: Record<string, string> = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

/** ارقام فارسی/عربی → لاتین و «٫/،» → نقطه؛ فقط برای ورودی عددی. */
export const toLatinNumber = (raw: string): number => {
  const normalized = raw
    .replace(/[۰-۹٠-٩]/g, (d) => DIGIT_MAP[d] ?? d)
    .replace(/[٫،]/g, '.')
    .replace(/\s|[٬,]/g, '');
  return Number(normalized);
};

/** فرم ویرایش یک صفت موجود در کاتالوگ (بدون امکان تعریف صفت جدید از کلاینت). */
function AttributeRow({
  productId,
  entry,
  locked,
  canUpdate,
  busy,
  onSaved,
  onError,
}: {
  productId: string;
  entry: Entry;
  locked: boolean;
  canUpdate: boolean;
  busy: boolean;
  onSaved: (msg: string) => Promise<void> | void;
  onError: (msg: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => ({
    text: entry.value.value_text ?? '',
    num: entry.value.value_num ?? '',
    enumValue: entry.value.value_enum ?? '',
  }));

  useEffect(() => {
    setDraft({
      text: entry.value.value_text ?? '',
      num: entry.value.value_num ?? '',
      enumValue: entry.value.value_enum ?? '',
    });
  }, [entry.value.value_text, entry.value.value_num, entry.value.value_enum]);

  const axisBlocked = entry.is_variant_axis && locked;

  const submit = async (payload: Record<string, unknown>): Promise<void> => {
    setSaving(true);
    try {
      const { error } = await api.PUT('/products/{id}/attributes', {
        params: { path: { id: productId } },
        body: { values: [{ def_id: entry.def_id, ...payload }] },
      });
      if (error) {
        onError(attributeErrorMessage(error));
        return;
      }
      setEditing(false);
      await onSaved('مقدار صفت ثبت شد.');
    } finally {
      setSaving(false);
    }
  };

  const current = entry.value.value_text ?? entry.value.value_enum ?? entry.value.value_num;

  return (
    <tr className="border-t border-line align-top">
      <td className={tdCls}>
        <p className="font-medium">{entry.title}</p>
        <p className="font-mono text-xs text-ink-subtle" dir="ltr">
          {entry.code}
        </p>
      </td>
      <td className={`${tdCls} text-ink-muted`}>{ATTR_KIND_LABEL[entry.kind] ?? entry.kind}</td>
      <td className={`${tdCls} text-xs`}>
        <div className="flex flex-wrap gap-1">
          {entry.is_required && <span className="rounded bg-warning-soft px-2 py-0.5 text-warning-ink">الزامی شرکت</span>}
          {entry.is_variant_axis && <span className="rounded bg-info-soft px-2 py-0.5 text-info-ink">محور variant</span>}
          {!entry.is_required && !entry.is_variant_axis && <span className="text-ink-subtle">—</span>}
        </div>
      </td>
      <td className={tdCls}>
        {entry.filled ? (
          <bdi>{current}</bdi>
        ) : entry.is_required ? (
          <span className="text-danger-ink">بدون مقدار (الزامی)</span>
        ) : (
          <span className="text-ink-subtle">بدون مقدار</span>
        )}
      </td>
      <td className={`${tdCls} space-y-2`}>
        {!canUpdate && <span className="text-xs text-ink-subtle">فقط مشاهده</span>}
        {canUpdate && !editing && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={btnGhost}
              onClick={() => setEditing(true)}
              disabled={busy || saving || axisBlocked}
              title={axisBlocked ? 'محور variant پس از ارجاع عملیاتی قفل است.' : undefined}
            >
              {entry.filled ? 'ویرایش' : 'ثبت مقدار'}
            </button>
            {entry.filled && (
              <button
                type="button"
                className={btnDangerSmall}
                disabled={busy || saving || axisBlocked}
                onClick={() => void submit({ clear: true })}
                title={axisBlocked ? 'محور variant پس از ارجاع عملیاتی قفل است.' : 'پاک کردن مقدار'}
              >
                پاک کردن
              </button>
            )}
          </div>
        )}
        {canUpdate && editing && (
          <div className="space-y-2">
            {entry.kind === 'text' && (
              <input
                className={`${inputCls} w-56`}
                value={draft.text}
                onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                aria-label={`مقدار ${entry.title}`}
              />
            )}
            {entry.kind === 'number' && (
              <input
                className={`${inputCls} w-40`}
                value={draft.num}
                inputMode="decimal"
                dir="ltr"
                onChange={(e) => setDraft((d) => ({ ...d, num: e.target.value }))}
                aria-label={`مقدار عددی ${entry.title}`}
              />
            )}
            {entry.kind === 'enum' && (
              <select
                className={`${inputCls} w-56`}
                value={draft.enumValue}
                onChange={(e) => setDraft((d) => ({ ...d, enumValue: e.target.value }))}
                aria-label={`مقدار ${entry.title}`}
              >
                <option value="">— انتخاب کنید —</option>
                {entry.enum_values.map((v) => (
                  <option key={v.id} value={v.value}>
                    {v.value}
                  </option>
                ))}
              </select>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={btnPrimary}
                disabled={saving || busy}
                onClick={() => {
                  if (entry.kind === 'text') return void submit({ value_text: draft.text });
                  if (entry.kind === 'number') {
                    const n = toLatinNumber(draft.num);
                    if (draft.num.trim() === '' || !Number.isFinite(n)) {
                      onError('مقدار عددی معتبر وارد کنید.');
                      return;
                    }
                    return void submit({ value_num: n });
                  }
                  if (!draft.enumValue) {
                    onError('یکی از مقادیر مجاز را انتخاب کنید.');
                    return;
                  }
                  return void submit({ value_enum: draft.enumValue });
                }}
              >
                {saving ? 'در حال ذخیره…' : 'ذخیره'}
              </button>
              <button type="button" className={btnGhost} onClick={() => setEditing(false)} disabled={saving}>
                انصراف
              </button>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}

export function ProductAttributesTab({ productId }: { productId: string }) {
  const [view, setView] = useState<AttributesOverview | null>(null);
  const [history, setHistory] = useState<HistoryEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error: err } = await api.GET('/products/{id}/attributes', {
        params: { path: { id: productId } },
      });
      if (err || !data) {
        setLoadError(err ? attributeErrorMessage(err) : 'دریافت صفات کالا ممکن نشد.');
        return;
      }
      setView(data as AttributesOverview);
    } catch {
      setLoadError('ارتباط با سرور برقرار نشد؛ نتیجه‌ای فرض نمی‌شود.');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const { data, error: err } = await api.GET('/products/{id}/identity/history', {
        params: { path: { id: productId } },
      });
      if (err || !data) {
        setHistoryError(err ? faError(err) : 'دریافت تاریخچه ممکن نشد.');
        return;
      }
      setHistory(data.items as HistoryEvent[]);
    } catch {
      setHistoryError('ارتباط با سرور برقرار نشد.');
    } finally {
      setLoadingHistory(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
    void loadHistory();
  }, [load, loadHistory]);

  const counts = view?.counts;
  const attributesByDef = useMemo(() => view?.attributes ?? [], [view]);

  if (!view) {
    return (
      <section className={panelCls} aria-label="صفات کالا" aria-busy={loading}>
        <h2 className="mb-3 font-semibold">صفات کالا</h2>
        {loadError ? (
          <div role="alert" className={errorCls}>
            <p>{loadError}</p>
            <button type="button" className={`${btnGhost} mt-3`} onClick={() => void load()}>
              تلاش دوباره
            </button>
          </div>
        ) : (
          <p role="status">در حال دریافت صفات…</p>
        )}
      </section>
    );
  }

  const canUpdate = view.actor.can_update;

  return (
    <section className="space-y-4" aria-label="صفات کالا" aria-busy={loading}>
      <div className={`${panelCls} flex flex-wrap items-start justify-between gap-3`}>
        <div>
          <h2 className="font-semibold">صفات کالا</h2>
          <p className="mt-1 text-xs leading-6 text-ink-muted">
            تعاریف صفات از کاتالوگ شرکت می‌آید (این صفحه تعریف جدید نمی‌سازد). {view.required_policy_fa}
          </p>
        </div>
        <button
          type="button"
          className={btnGhost}
          onClick={() => {
            void load();
            void loadHistory();
          }}
          disabled={loading}
        >
          {loading ? 'در حال تازه‌سازی…' : 'تازه‌سازی'}
        </button>
      </div>

      {loadError && (
        <div role="alert" className={errorCls}>
          <p>{loadError}</p>
        </div>
      )}
      {notice && <p role="status" className={okCls}>{notice}</p>}
      {error && (
        <div role="alert" className={errorCls}>
          <p>{error}</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {counts &&
          [
            { label: 'کل صفات', value: counts.total },
            { label: 'پرشده', value: counts.filled },
            { label: 'الزامی', value: counts.required },
            { label: 'الزامیِ بی‌مقدار', value: counts.required_missing },
            { label: 'محور variant', value: counts.variant_axes },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-line bg-surface px-4 py-3">
              <p className="text-xs text-ink-muted">{c.label}</p>
              <p
                className={`mt-1 text-lg font-semibold tabular-nums ${
                  c.label === 'الزامیِ بی‌مقدار' && c.value > 0 ? 'text-danger-ink' : ''
                }`}
              >
                {c.value}
              </p>
            </div>
          ))}
      </div>

      {!canUpdate && (
        <p role="status" className={warnCls}>
          {view.actor.unavailable_reason_fa ?? 'این نشست مجوز ویرایش کاتالوگ ندارد؛ فقط مشاهده مجاز است.'}
        </p>
      )}

      <div className={`${panelCls} space-y-2`}>
        <h3 className="font-medium">امضای variant (یکتایی داخلی SKU)</h3>
        <p className="font-mono text-xs break-all text-ink-muted" dir="ltr">
          {view.variant_signature ?? '— (هیچ محور variant مقداری ندارد)'}
        </p>
        <p className="text-xs leading-6 text-ink-muted">{view.signature_rule_fa}</p>
        {view.signature_locked && (
          <p className={warnCls}>
            این کالا ارجاع عملیاتی دارد؛ تغییر محورهای variant مسدود است و در صورت تلاش، خطای صریح برمی‌گردد.
          </p>
        )}
      </div>

      <div className={tableWrapCls}>
        <table className="w-full text-sm">
          <caption className="sr-only">صفات تعریف‌شده و مقدار این کالا</caption>
          <thead>
            <tr>
              <th className={thCls}>صفت</th>
              <th className={thCls}>نوع</th>
              <th className={thCls}>قواعد</th>
              <th className={thCls}>مقدار</th>
              <th className={thCls}>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {attributesByDef.length === 0 && (
              <tr>
                <td colSpan={5} className={`${tdCls} py-6 text-center text-ink-subtle`}>
                  در کاتالوگ این شرکت هیچ صفتی تعریف نشده است؛ تعریف صفت از سطح کاتالوگ انجام می‌شود.
                </td>
              </tr>
            )}
            {attributesByDef.map((entry) => (
              <AttributeRow
                key={entry.def_id}
                productId={productId}
                entry={entry}
                locked={view.signature_locked}
                canUpdate={canUpdate}
                busy={loading}
                onSaved={async (msg) => {
                  setError(null);
                  setNotice(msg);
                  await load();
                  await loadHistory();
                }}
                onError={(msg) => {
                  setNotice(null);
                  setError(msg);
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
      {/* productId برای درخواست‌ها در سطح صفحه نگه داشته می‌شود */}
      <p className="sr-only" data-product-id={productId} />

      <div className={`${panelCls} space-y-2`}>
        <h3 className="font-medium">تاریخچهٔ تغییرات هویت</h3>
        {loadingHistory && <p role="status">در حال دریافت تاریخچه…</p>}
        {historyError && (
          <div role="alert" className={errorCls}>
            <p>{historyError}</p>
            <button type="button" className={`${btnGhost} mt-2`} onClick={() => void loadHistory()}>
              تلاش دوباره
            </button>
          </div>
        )}
        {!loadingHistory && !historyError && (history?.length ?? 0) === 0 && (
          <p className="text-xs text-ink-subtle">تغییری در هویت این کالا ثبت نشده است.</p>
        )}
        {!loadingHistory && (history?.length ?? 0) > 0 && (
          <ul className="space-y-2 text-xs">
            {history!.map((h) => (
              <li key={h.id} className="rounded-lg border border-line px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded bg-neutral-soft px-2 py-0.5">{h.event_label_fa}</span>
                  <span className="font-medium">
                    {h.entity_type === 'product_alias' ? 'نام جایگزین' : 'مقدار صفت'}
                    {h.def_title ? ` — ${h.def_title}` : ''}
                  </span>
                  <span className="text-ink-muted">{h.actor_label_fa}</span>
                  <time className="ms-auto text-ink-subtle" dateTime={h.at}>
                    {new Date(h.at).toLocaleString('fa-IR', { dateStyle: 'short', timeStyle: 'short' })}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={`${panelCls} space-y-2`}>
        <h3 className="font-medium">مرزها و تصمیم‌های باز مالک</h3>
        <ul className="list-disc space-y-1 pe-5 text-xs leading-6 text-ink-muted">
          {view.downstream_notes_fa.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <ul className="mt-2 space-y-1 text-xs leading-6">
          {view.owner_decisions_fa.map((d) => (
            <li key={d.id} className="flex flex-wrap gap-2">
              <span
                className={
                  d.status === 'BLOCKED'
                    ? 'rounded bg-danger-soft px-2 py-0.5 text-danger-ink'
                    : 'rounded bg-warning-soft px-2 py-0.5 text-warning-ink'
                }
              >
                {d.status}
              </span>
              <span className="font-medium">
                {d.id} — {d.title_fa}:
              </span>
              <span className="text-ink-muted">{d.detail_fa}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
