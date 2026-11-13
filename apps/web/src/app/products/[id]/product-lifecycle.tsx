'use client';

import { useCallback, useEffect, useState } from 'react';
import type { components } from '@dms/api-client';
import { api } from '@/lib/api';
import {
  STATUS_LABEL,
  btnGhost,
  btnPrimary,
  errorBody,
  errorCls,
  faError,
  okCls,
  panelCls,
  statusBadgeCls,
  warnCls,
} from '../products-lib';

type LifecycleView = components['schemas']['ProductLifecycleView'];
type LifecycleAction = components['schemas']['ProductLifecycleAction'];
type LifecycleHistoryItem = components['schemas']['ProductLifecycleHistoryItem'];

const actionErrorMessage = (error: unknown): string => {
  const body = errorBody(error);
  switch (body.code) {
    case 'sensitive_change_requires_confirmation':
      return 'برای اجرای گذار باید تأیید صریح را فعال کنید.';
    case 'status_change_forbidden':
      return 'این نشست مجوز ممتاز تغییر وضعیت کالا را ندارد.';
    case 'version_conflict':
      return 'کالا همزمان تغییر کرده است؛ اطلاعات تازه شد. پس از بررسی دوباره تلاش کنید.';
    case 'lifecycle_transition_unchanged':
      return 'وضعیت مقصد با وضعیت فعلی یکی است؛ گذاری اعمال نشد.';
    case 'lifecycle_transition_blocked':
      return 'گذارهای شامل وضعیت «متوقف» تا تصویب مالک BLOCKED / NOT AUTHORIZEDاند؛ تغییری اعمال نشد.';
    case 'unsupported_request_field':
      return 'فیلد ارسالی در قرارداد چرخهٔ حیات تعریف نشده است.';
    case 'forbidden_client_field':
      return 'درخواست شامل فیلد مالکیت، هویت یا مجوز نامعتبر بود و رد شد.';
    case 'validation_failed':
      return 'اطلاعات گذار معتبر نیست؛ وضعیت مقصد و نسخهٔ کالا را بررسی کنید.';
    case 'product_not_found':
      return 'کالا در این شرکت یافت نشد.';
    case 'audit_partition_missing':
      return 'ثبت ممیزی ممکن نشد؛ هیچ تغییری اعمال نشد.';
    case 'lifecycle_transition_failed':
      return 'انجام گذار ممکن نشد؛ هیچ تغییری اعمال نشد.';
    default:
      return faError(error);
  }
};

/**
 * تب «چرخهٔ حیات» — تمام کنترلها به عملیات واقعی متصلاند: تازهسازی،
 * انتخاب گذار، تأیید، اجرا، بارگذاری رویدادهای قدیمیتر و تلاش دوباره.
 * تنها active↔blocked ساخته میشود؛ گذارهای شامل discontinued و دادهٔ دامنهای
 * ساختگی هرگز بهعنوان دکمه/گزینه نمایش داده نمیشوند.
 */
export function ProductLifecycleTab({
  productId,
  onChanged,
}: {
  productId: string;
  onChanged: () => Promise<void> | void;
}): React.JSX.Element {
  const [view, setView] = useState<LifecycleView | null>(null);
  const [history, setHistory] = useState<LifecycleHistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<LifecycleAction | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (before?: string): Promise<void> => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await api.GET('/products/{id}/lifecycle', {
        params: {
          path: { id: productId },
          query: { limit: 30, ...(before ? { before } : {}) },
        },
      });
      if (error) {
        setLoadError(faError(error));
        return;
      }
      if (!data) {
        setLoadError('پاسخ معتبری دریافت نشد؛ هیچ وضعیت چرخهٔ حیاتی فرض نمیشود.');
        return;
      }
      if (before) {
        setHistory((old) => [...old, ...data.history.items]);
      } else {
        setView(data);
        setHistory(data.history.items);
        setSelected(null);
        setConfirmed(false);
        setActionError(null);
      }
      setCursor(data.history.next_cursor);
    } catch {
      setLoadError('ارتباط با سرور برقرار نشد. دوباره تلاش کنید.');
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (): Promise<void> => {
    if (!view || !selected || !confirmed || busy) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    try {
      const { data, error } = await api.POST('/products/{id}/lifecycle/transitions', {
        params: { path: { id: productId } },
        body: {
          target_status: selected.target_status,
          row_version: view.row_version,
          confirm_sensitive: true,
        },
      });
      if (error) {
        const message = actionErrorMessage(error);
        // Reload first: a full lifecycle read intentionally resets the selected
        // action; keep the validation message visible after that state refresh.
        if (errorBody(error).code === 'version_conflict') await load();
        setActionError(message);
        return;
      }
      setNotice(data?.message_fa ?? 'گذار وضعیت مرکزی ثبت شد.');
      setSelected(null);
      setConfirmed(false);
      await onChanged();
      await load();
    } catch {
      setActionError('ارتباط با سرور برقرار نشد؛ نتیجهای فرض نمیشود. دوباره تلاش کنید.');
    } finally {
      setBusy(false);
    }
  };

  if (!view) {
    return (
      <section className={panelCls} aria-label="چرخه حیات مرکزی کالا" aria-busy={loading}>
        <h2 className="mb-3 font-semibold">چرخهٔ حیات مرکزی کالا</h2>
        {loadError ? (
          <div role="alert" className={errorCls}>
            <p>{loadError}</p>
            <button type="button" className={`${btnGhost} mt-3`} onClick={() => void load()}>
              تلاش دوباره
            </button>
          </div>
        ) : (
          <p role="status">در حال دریافت وضعیت و تاریخچهٔ چرخهٔ حیات…</p>
        )}
      </section>
    );
  }

  // Defense in depth: never render an action involving the owner-gated
  // discontinued state, even if a stale server response ever advertised one.
  const safeActions = view.status === 'discontinued'
    ? []
    : view.available_actions.filter((action) => String(action.target_status) !== 'discontinued');

  return (
    <section className="space-y-4" aria-label="چرخه حیات مرکزی کالا" aria-busy={loading || busy}>
      <div className={panelCls}>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">وضعیت فعلی کالا</h2>
            <p className="mt-1 text-xs text-ink-subtle">
              این وضعیت سراسری شرکت است و بهمعنای عرضه در دامنهٔ عملیاتی نیست.
            </p>
          </div>
          <button type="button" className={btnGhost} onClick={() => void load()}>
            تازهسازی
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <article className="rounded-lg border border-line bg-surface-alt p-3">
            <h3 className="text-xs text-ink-muted">وضعیت مرکزی</h3>
            <p className="mt-2 flex flex-wrap items-center gap-2">
              <span className={statusBadgeCls(view.status)}>{view.status_label_fa}</span>
              <bdi dir="ltr" className="font-mono text-xs text-ink-muted">{view.status}</bdi>
            </p>
          </article>
          <article className="rounded-lg border border-line bg-surface-alt p-3">
            <h3 className="text-xs text-ink-muted">نسخهٔ قفل خوشبینانه</h3>
            <p className="mt-2 font-mono" dir="ltr">{view.row_version}</p>
          </article>
          <article className="rounded-lg border border-line bg-surface-alt p-3">
            <h3 className="text-xs text-ink-muted">مرز حاکمیت</h3>
            <p className="mt-2 text-sm">مرکزی · تأیید دونفره: BLOCKED</p>
          </article>
        </div>
        {loadError && (
          <div role="alert" className={`${errorCls} mt-4`}>
            <p>{loadError}</p>
            <button type="button" className={`${btnGhost} mt-3`} onClick={() => void load()}>
              تلاش دوباره
            </button>
          </div>
        )}
        {loading && <p role="status" className="mt-3 text-sm">در حال بهروزرسانی اطلاعات…</p>}
        {notice && <p role="status" className={`${okCls} mt-4`}>{notice}</p>}
        {actionError && <p role="alert" className={`${errorCls} mt-4`}>{actionError}</p>}
      </div>

      <div className={panelCls}>
        <h2 className="mb-2 font-semibold">اقدامهای دردسترس برای وضعیت فعلی</h2>
        <p className="mb-4 text-sm leading-7 text-ink-muted">
          {view.policy.permissions_fa} {view.policy.confirmation_fa} {view.policy.concurrency_fa}
        </p>
        {view.status === 'discontinued' ? (
          <p role="status" className={warnCls}>
            وضعیت «متوقف» فقط خواندنی است؛ صرفنظر از مجوز نشست، همهٔ گذارهای به/از آن تا
            تصویب مالک BLOCKED / NOT AUTHORIZEDاند و کنترل گذاری نمایش داده نمیشود.
          </p>
        ) : !view.actor.can_transition ? (
          <p role="status" className={warnCls}>
            {view.actor.unavailable_reason_fa ?? 'انجام گذار برای این نشست مجاز نیست.'}
          </p>
        ) : safeActions.length === 0 ? (
          <p role="status" className={warnCls}>هیچ گذار معتبری برای وضعیت فعلی تعریف نشده است.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {safeActions.map((action) => (
              <button
                key={action.action_id}
                type="button"
                aria-pressed={selected?.action_id === action.action_id}
                onClick={() => {
                  setSelected(action);
                  setConfirmed(false);
                  setActionError(null);
                }}
                className={`rounded-lg border px-4 py-2 text-sm focus-ring ${
                  selected?.action_id === action.action_id
                    ? 'border-info bg-info-soft font-medium text-info-ink'
                    : 'border-line-strong text-ink hover:bg-surface-hover'
                }`}
              >
                {action.label_fa}
              </button>
            ))}
          </div>
        )}

        {selected && view.actor.can_transition && view.status !== 'discontinued'
          && safeActions.some((action) => action.action_id === selected.action_id) && (
          <div className="mt-4 rounded-lg border border-warning-line bg-warning-soft p-4">
            <h3 className="font-medium">تأیید گذار: {selected.label_fa}</h3>
            <p className="mt-2 text-sm leading-7 text-ink-muted">
              وضعیت مقصد: <bdi dir="ltr">{selected.target_status}</bdi> · نسخهٔ مبنا:{' '}
              <bdi dir="ltr">{view.row_version}</bdi>. رویداد تغییرناپذیر و ممیزی با هویت نشست
              در یک تراکنش ثبت میشوند.
            </p>
            {selected.decision_dependency_fa && (
              <p className={`${warnCls} mt-3 text-sm leading-7`}>{selected.decision_dependency_fa}</p>
            )}
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-1 focus-ring"
              />
              <span>تأیید میکنم این تغییر وضعیت مرکزی اعمال شود.</span>
            </label>
            {!confirmed && !busy && (
              <p role="status" className="mt-3 text-sm text-ink-muted">
                برای اجرا، ابتدا گزینهٔ تأیید را فعال کنید.
              </p>
            )}
            {busy && <p role="status" className="mt-3 text-sm">در حال اجرای گذار و ثبت ممیزی…</p>}
            {confirmed && !busy && (
              <button type="button" className={`${btnPrimary} mt-4`} onClick={() => void submit()}>
                تأیید و اجرای گذار
              </button>
            )}
          </div>
        )}

        <details className="mt-4 rounded-lg border border-line p-3">
          <summary className="cursor-pointer text-sm font-medium focus-ring">
            گذارهای پشتیبانینشده و تصمیمهای وابسته به مالک
          </summary>
          <ul className="mt-3 space-y-2 text-sm leading-7 text-ink-muted">
            {view.transitions.filter((rule) => !rule.supported).map((rule) => (
              <li key={`${rule.source_status}-${rule.target_status}`}>
                <bdi dir="ltr">{rule.source_status}</bdi> → <bdi dir="ltr">{rule.target_status}</bdi>:{' '}
                {rule.reason_fa}
              </li>
            ))}
            {view.owner_decisions_fa.map((decision) => <li key={decision}>{decision}</li>)}
          </ul>
        </details>
      </div>

      <div className={panelCls}>
        <h2 className="mb-2 font-semibold">تاریخچهٔ گذارها</h2>
        <p className="mb-4 text-sm leading-7 text-ink-muted">
          رویدادها از تاریخچهٔ تغییرناپذیر کاتالوگ مرکزی و فقط با کنشگر و زمان نمایش
          داده میشوند؛ دادهٔ خام قبل/بعد، قیمت، موجودی یا عضویت دامنه افشا نمیشود.
        </p>
        {history.length === 0 && !loading ? (
          <p role="status" className="py-5 text-center text-ink-muted">
            هنوز رویداد وضعیتی در تاریخچهٔ جدید ثبت نشده است.
          </p>
        ) : (
          <ol className="space-y-3">
            {history.map((item) => (
              <li key={item.id} className="rounded-lg border border-line p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <strong>
                    {item.event_label_fa} · {STATUS_LABEL[item.from_status ?? ''] ?? '—'} به{' '}
                    {STATUS_LABEL[item.to_status ?? ''] ?? '—'}
                  </strong>
                  <time dateTime={item.at} className="text-xs text-ink-muted">
                    {new Date(item.at).toLocaleString('fa-IR')}
                  </time>
                </div>
                <p className="mt-2 text-xs leading-6 text-ink-muted">
                  کنشگر: {item.actor_label_fa}
                  {item.actor_user_id ? <> · <bdi dir="ltr">{item.actor_user_id}</bdi></> : null}
                  {' · '}شناسه رویداد: <bdi dir="ltr">{item.id}</bdi>
                </p>
              </li>
            ))}
          </ol>
        )}
        {cursor && !loading && (
          <button type="button" className={`${btnGhost} mt-4`} onClick={() => void load(cursor)}>
            رویدادهای قدیمیتر
          </button>
        )}
      </div>

      <div className={panelCls}>
        <h2 className="mb-2 font-semibold">اثر بر سامانههای وابسته</h2>
        <ul className="space-y-2 text-sm leading-7 text-ink-muted">
          {view.downstream_notes_fa.map((note) => <li key={note}>{note}</li>)}
        </ul>
      </div>
    </section>
  );
}
