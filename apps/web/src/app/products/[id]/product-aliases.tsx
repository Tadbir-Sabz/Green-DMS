'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import type { components } from '@dms/api-client';
import { api } from '@/lib/api';
import {
  ALIAS_KIND_LABEL,
  btnDangerSmall,
  btnGhost,
  btnPrimary,
  errorBody,
  errorCls,
  faError,
  inputCls,
  okCls,
  panelCls,
  selectCls,
  tableWrapCls,
  tdCls,
  thCls,
  warnCls,
} from '../products-lib';

type AliasOverview = components['schemas']['ProductAliasOverview'];
type AliasItem = components['schemas']['ProductAliasItem'];

/** پیام فارسیِ خطاهای واقعیِ سرور برای نام‌های جایگزین. */
export function aliasErrorMessage(error: unknown): string {
  const body = errorBody(error);
  switch (body.code) {
    case 'invalid_alias':
      return 'مقدار نام جایگزین خالی است یا پس از نرمال‌سازی چیزی باقی نمی‌ماند.';
    case 'alias_collision':
      return 'این نام با کد کالا، بارکد یا نام جایگزین کالای دیگری هم‌ارز است و ثبت نشد.';
    case 'duplicate_alias':
      return 'این نام جایگزین برای همین کالا قبلاً ثبت شده است.';
    case 'alias_limit_reached':
      return 'سقف فنی تعداد نام‌های جایگزین این کالا پر شده است.';
    case 'alias_not_found':
      return 'نام جایگزین یافت نشد یا مربوط به این کالا نیست.';
    case 'forbidden_client_field':
      return 'درخواست شامل فیلد شرکت، هویت، مجوز یا ممیزی بود و رد شد.';
    case 'unsupported_request_field':
      return 'فیلد ارسالی در قرارداد نام‌های جایگزین تعریف نشده است.';
    case 'domain_context_not_supported':
      return 'این سطح فقط مرکزی است؛ هدر دامنه (x-domain-id) پذیرفته نمی‌شود.';
    case 'domain_property_rejected':
      return 'ویژگی دامنه‌ای در درخواست نام‌های جایگزین پذیرفته نمی‌شود.';
    case 'validation_failed':
    case 'invalid_id':
    case 'identity_write_failed':
    case 'identity_read_failed':
      return faError(error);
    default:
      return faError(error);
  }
}

const kindOptions = [
  { value: 'brand_slang', label: 'نام عامیانه/برند' },
  { value: 'latin', label: 'نام لاتین' },
  { value: 'code', label: 'کد جایگزین (در اسکن استفاده می‌شود)' },
] as const;

export function ProductAliasesTab({ productId }: { productId: string }) {
  const [view, setView] = useState<AliasOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [alias, setAlias] = useState('');
  const [kind, setKind] = useState<'brand_slang' | 'latin' | 'code'>('brand_slang');
  const [confirmAdd, setConfirmAdd] = useState(false);
  const [filterKind, setFilterKind] = useState<'all' | 'brand_slang' | 'latin' | 'code'>('all');
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error: err } = await api.GET('/products/{id}/aliases', {
        params: {
          path: { id: productId },
          query: { kind: filterKind === 'all' ? undefined : filterKind, limit: 200 },
        },
      });
      if (err || !data) {
        setLoadError(err ? aliasErrorMessage(err) : 'دریافت نام‌های جایگزین ممکن نشد.');
        return;
      }
      setView(data as AliasOverview);
    } catch {
      setLoadError('ارتباط با سرور برقرار نشد؛ نتیجه‌ای فرض نمی‌شود.');
    } finally {
      setLoading(false);
    }
  }, [productId, filterKind]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (!alias.trim()) {
      setError('مقدار نام جایگزین را وارد کنید.');
      return;
    }
    if (!confirmAdd) {
      setError('برای ثبت، تأیید صریح را فعال کنید.');
      return;
    }
    setBusy(true);
    try {
      const { error: err } = await api.POST('/products/{id}/aliases', {
        params: { path: { id: productId } },
        body: { alias: alias.trim(), kind, confirm_add: true },
      });
      if (err) {
        setError(aliasErrorMessage(err));
        return;
      }
      setNotice('نام جایگزین ثبت شد و در تاریخچهٔ کاتالوگ ممیزی شد.');
      setAlias('');
      setConfirmAdd(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (aliasId: string): Promise<void> => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { error: err } = await api.DELETE('/products/{id}/aliases/{aliasId}', {
        params: { path: { id: productId, aliasId } },
      });
      if (err) {
        setError(aliasErrorMessage(err));
        return;
      }
      setNotice('نام جایگزین حذف شد و در تاریخچهٔ کاتالوگ ثبت شد.');
      setPendingDelete(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const items = useMemo<AliasItem[]>(() => view?.items ?? [], [view]);

  if (!view) {
    return (
      <section className={panelCls} aria-label="نام‌های جایگزین کالا" aria-busy={loading}>
        <h2 className="mb-3 font-semibold">نام‌های جایگزین کالا</h2>
        {loadError ? (
          <div role="alert" className={errorCls}>
            <p>{loadError}</p>
            <button type="button" className={`${btnGhost} mt-3`} onClick={() => void load()}>
              تلاش دوباره
            </button>
          </div>
        ) : (
          <p role="status">در حال دریافت نام‌های جایگزین…</p>
        )}
      </section>
    );
  }

  const canUpdate = view.actor.can_update;

  return (
    <section className="space-y-4" aria-label="نام‌های جایگزین کالا" aria-busy={loading || busy}>
      <div className={`${panelCls} flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <h2 className="font-semibold">نام‌های جایگزین کالا</h2>
          <p className="mt-1 text-xs leading-6 text-ink-muted">
            کد اصلی کالا <bdi dir="ltr" className="font-mono">{view.product.code}</bdi> است و هرگز با نام جایگزین عوض نمی‌شود.
            نام جایگزین فقط برای جست‌وجو و (در نوع «کد جایگزین») resolution اسکن استفاده می‌شود.
          </p>
        </div>
        <button type="button" className={btnGhost} onClick={() => void load()} disabled={loading || busy}>
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

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'همه', value: view.counts.total },
          { label: 'نام عامیانه/برند', value: view.counts.brand_slang },
          { label: 'لاتین', value: view.counts.latin },
          { label: 'کد جایگزین', value: view.counts.code },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-line bg-surface px-4 py-3">
            <p className="text-xs text-ink-muted">{c.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{c.value}</p>
          </div>
        ))}
      </div>

      <p className={`${warnCls} text-xs leading-6`}>{view.scan_resolution_fa}</p>

      {!canUpdate && (
        <p role="status" className={warnCls}>
          {view.actor.unavailable_reason_fa ?? 'این نشست مجوز ویرایش کاتالوگ ندارد؛ فقط مشاهده مجاز است.'}
        </p>
      )}

      {canUpdate && (
        <form onSubmit={add} className={`${panelCls} space-y-3`} aria-label="افزودن نام جایگزین">
          <h3 className="font-medium">افزودن نام جایگزین</h3>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              نام جایگزین
              <input
                className={`${inputCls} mt-1 w-72`}
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
                placeholder="نام عامیانه، لاتین یا کد قدیمی"
                aria-label="نام جایگزین"
              />
            </label>
            <label className="text-sm">
              نوع
              <select
                className={`${selectCls} mt-1 w-64`}
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
                aria-label="نوع نام جایگزین"
              >
                {kindOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs leading-6 text-ink-muted">
            نرمال‌سازی (ارقام فارسی/عربی، فاصله‌ها، حروف بزرگ/کوچک) در سرور انجام می‌شود.
            {kind === 'code'
              ? ' این نوع در resolution اسکن (پس از بارکد و کد کالا) هم استفاده می‌شود.'
              : ' این نوع فقط در جست‌وجو و نمایش استفاده می‌شود و در اسکن نقشی ندارد.'}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmAdd}
                onChange={(e) => setConfirmAdd(e.target.checked)}
                aria-label="تأیید افزودن نام جایگزین"
              />
              افزودن این نام جایگزین را تأیید می‌کنم.
            </label>
            <button type="submit" className={btnPrimary} disabled={busy}>
              {busy ? 'در حال ثبت…' : 'ثبت نام جایگزین'}
            </button>
          </div>
        </form>
      )}

      <div className={`${panelCls} flex flex-wrap items-end gap-3`}>
        <label className="text-sm">
          فیلتر نوع
          <select
            className={`${selectCls} mt-1 w-52`}
            value={filterKind}
            onChange={(e) => setFilterKind(e.target.value as typeof filterKind)}
            aria-label="فیلتر نوع نام جایگزین"
          >
            <option value="all">همه</option>
            <option value="brand_slang">نام عامیانه/برند</option>
            <option value="latin">لاتین</option>
            <option value="code">کد جایگزین</option>
          </select>
        </label>
        {view.counts.truncated && <p className="text-xs text-warning-ink">فهرست به سقف فنی رسید.</p>}
      </div>

      <div className={tableWrapCls}>
        <table className="w-full text-sm">
          <caption className="sr-only">نام‌های جایگزین این کالا</caption>
          <thead>
            <tr>
              <th className={thCls}>نام جایگزین</th>
              <th className={thCls}>نوع</th>
              <th className={thCls}>کاربرد</th>
              <th className={thCls}>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={4} className={`${tdCls} py-6 text-center text-ink-subtle`}>
                  نام جایگزینی برای این کالا ثبت نشده است.
                </td>
              </tr>
            )}
            {items.map((a) => (
              <tr key={a.id} className="border-t border-line">
                <td className={tdCls}>
                  <span>{a.alias}</span>
                  <span className="ms-2 font-mono text-xs text-ink-subtle" dir="ltr">
                    {a.alias_norm}
                  </span>
                  {a.conflict && (
                    <p className="mt-1 text-xs text-warning-ink">
                      هشدار: همین نام برای کالای دیگری ({a.conflict.code ?? '—'}
                      {a.conflict.name ? ` — ${a.conflict.name}` : ''}) هم ثبت شده است؛ یکتایی شرکتی در پایگاه‌داده وجود ندارد (C7-D1).
                    </p>
                  )}
                </td>
                <td className={`${tdCls} text-ink-muted`}>{ALIAS_KIND_LABEL[a.kind] ?? a.kind}</td>
                <td className={`${tdCls} text-xs`}>
                  {a.used_in_scan ? (
                    <span className="rounded bg-info-soft px-2 py-0.5 text-info-ink">در اسکن</span>
                  ) : (
                    <span className="text-ink-subtle">جست‌وجو/نمایش</span>
                  )}
                </td>
                <td className={`${tdCls} space-x-2 space-x-reverse`}>
                  {!canUpdate && <span className="text-xs text-ink-subtle">فقط مشاهده</span>}
                  {canUpdate && pendingDelete !== a.id && (
                    <button type="button" className={btnDangerSmall} onClick={() => setPendingDelete(a.id)} disabled={busy}>
                      حذف
                    </button>
                  )}
                  {canUpdate && pendingDelete === a.id && (
                    <>
                      <span className="text-xs text-danger-ink">حذف قطعی؟</span>
                      <button type="button" className={btnDangerSmall} onClick={() => void remove(a.id)} disabled={busy}>
                        تأیید حذف
                      </button>
                      <button type="button" className={btnGhost} onClick={() => setPendingDelete(null)}>
                        انصراف
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
