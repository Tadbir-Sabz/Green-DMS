'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import type { components } from '@dms/api-client';
import { api } from '@/lib/api';
import {
  STATUS_LABEL,
  btnDangerSmall,
  btnGhost,
  btnPrimary,
  btnSmall,
  errorBody,
  errorCls,
  faError,
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

type Overview = components['schemas']['ProductRelationsOverview'];
type RelationItem = components['schemas']['ProductRelationItem'];
type HistoryEvent = components['schemas']['ProductRelationHistoryEvent'];
type Graph = components['schemas']['ProductRelationGraph'];
type Candidate = components['schemas']['Product'];

const KIND_LABEL: Record<string, string> = { substitute: 'جایگزین', complement: 'مکمل' };
const DIRECTION_LABEL: Record<string, string> = { outgoing: 'از این کالا ←', incoming: '→ به این کالا' };

/** پیام فارسیِ خطاهای واقعیِ سرور؛ هیچ کد ناشناسی بی‌پیام نمی‌ماند. */
export function relationErrorMessage(error: unknown): string {
  const body = errorBody(error);
  switch (body.code) {
    case 'self_relation':
      return 'کالا نمی‌تواند با خودش رابطه داشته باشد.';
    case 'duplicate_relation':
      return 'این رابطه از قبل ثبت شده است (همان کالا و همان نوع).';
    case 'relation_cycle':
      return 'این رابطه حلقهٔ جایگزینی ایجاد می‌کند و مجاز نیست.';
    case 'relation_not_found':
      return 'رابطه یافت نشد یا مربوط به این کالا نیست.';
    case 'relation_unchanged':
      return 'اولویت تغییری نکرده است.';
    case 'forbidden_client_field':
      return 'درخواست شامل فیلد شرکت، هویت، مجوز یا ممیزی بود و رد شد.';
    case 'unsupported_request_field':
      return 'فیلد ارسالی در قرارداد روابط کالا تعریف نشده است.';
    case 'invalid_id':
      return 'شناسهٔ کالا یا رابطه معتبر نیست.';
    case 'domain_context_not_supported':
      return 'روابط کالا فقط در سطح مرکزی است؛ هدر دامنه (x-domain-id) پذیرفته نمی‌شود.';
    case 'domain_property_rejected':
      return 'ویژگی دامنه‌ای در درخواست روابط کالا پذیرفته نمی‌شود؛ رابطهٔ دامنه‌ای خارج از این مرحله است.';
    case 'validation_failed':
      return faError(error);
    case 'product_not_found':
      return 'کالا یافت نشد یا در دسترس این شرکت نیست.';
    case 'relation_write_failed':
    case 'relation_read_failed':
      return faError(error);
    default:
      return faError(error);
  }
}

export function ProductRelationsTab({ productId }: { productId: string }) {
  const [view, setView] = useState<Overview | null>(null);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [filterKind, setFilterKind] = useState<'all' | 'substitute' | 'complement'>('all');
  const [filterDirection, setFilterDirection] = useState<'both' | 'outgoing' | 'incoming'>('both');

  // فرم افزودن
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [searching, setSearching] = useState(false);
  const [relatedId, setRelatedId] = useState('');
  const [kind, setKind] = useState<'substitute' | 'complement'>('substitute');
  const [priority, setPriority] = useState('100');
  const [confirmAdd, setConfirmAdd] = useState(false);

  // ویرایش اولویت
  const [editing, setEditing] = useState<{ id: string; priority: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await api.GET('/products/{id}/relations', {
        params: {
          path: { id: productId },
          query: {
            kind: filterKind === 'all' ? undefined : filterKind,
            direction: filterDirection,
            limit: 100,
          },
        },
      });
      if (error || !data) {
        setLoadError(error ? relationErrorMessage(error) : 'دریافت روابط کالا ممکن نشد.');
        return;
      }
      setView(data as Overview);
      const hist = await api.GET('/products/{id}/relations/history', { params: { path: { id: productId } } });
      setHistory(hist.error ? [] : ((hist.data?.items ?? []) as HistoryEvent[]));
      const g = await api.GET('/products/{id}/relations/graph', {
        params: { path: { id: productId }, query: { depth: 2 } },
      });
      setGraph(g.error ? null : ((g.data ?? null) as Graph | null));
    } catch {
      setLoadError('ارتباط با سرور برقرار نشد. دوباره تلاش کنید.');
    } finally {
      setLoading(false);
    }
  }, [productId, filterKind, filterDirection]);

  useEffect(() => {
    void load();
  }, [load]);

  const searchProducts = async (): Promise<void> => {
    setSearching(true);
    setActionError(null);
    try {
      const { data, error } = await api.GET('/products', {
        params: { query: { q: search.trim() || undefined, limit: 20 } },
      });
      if (error) {
        setActionError(relationErrorMessage(error));
        return;
      }
      // خود کالا هرگز کاندید نیست (خودارجاع در سرور هم رد می‌شود).
      setCandidates((data?.items ?? []).filter((c) => c.id !== productId));
    } finally {
      setSearching(false);
    }
  };

  const add = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setActionError(null);
    setNotice(null);
    if (!relatedId) {
      setActionError('کالای مرتبط را انتخاب کنید.');
      return;
    }
    if (!confirmAdd) {
      setActionError('برای ثبت رابطه، تأیید صریح را فعال کنید.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await api.POST('/products/{id}/relations', {
        params: { path: { id: productId } },
        body: {
          related_id: relatedId,
          kind,
          priority: priority ? Number(priority) : undefined,
          confirm_add: true,
        },
      });
      if (error) {
        setActionError(relationErrorMessage(error));
        return;
      }
      setNotice('رابطه ثبت شد و در تاریخچهٔ کاتالوگ ممیزی شد.');
      setRelatedId('');
      setConfirmAdd(false);
      setPriority('100');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const savePriority = async (): Promise<void> => {
    if (!editing) return;
    setActionError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { error } = await api.PATCH('/products/{id}/relations/{relationId}', {
        params: { path: { id: productId, relationId: editing.id } },
        body: { priority: Number(editing.priority) },
      });
      if (error) {
        setActionError(relationErrorMessage(error));
        return;
      }
      setNotice('اولویت رابطه به‌روزرسانی شد.');
      setEditing(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (relationId: string): Promise<void> => {
    setActionError(null);
    setNotice(null);
    setBusy(true);
    try {
      const { error } = await api.DELETE('/products/{id}/relations/{relationId}', {
        params: { path: { id: productId, relationId } },
      });
      if (error) {
        setActionError(relationErrorMessage(error));
        return;
      }
      setNotice('رابطه حذف شد و در تاریخچهٔ کاتالوگ ثبت شد.');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const grouped = useMemo(() => {
    const items = view?.items ?? [];
    return {
      substitute: items.filter((i) => i.kind === 'substitute'),
      complement: items.filter((i) => i.kind === 'complement'),
    };
  }, [view]);

  if (!view) {
    return (
      <section className={panelCls} aria-label="روابط کالا" aria-busy={loading}>
        <h2 className="mb-3 font-semibold">روابط کالا</h2>
        {loadError ? (
          <div role="alert" className={errorCls}>
            <p>{loadError}</p>
            <button type="button" className={`${btnGhost} mt-3`} onClick={() => void load()}>
              تلاش دوباره
            </button>
          </div>
        ) : (
          <p role="status">در حال دریافت روابط کالا…</p>
        )}
      </section>
    );
  }

  const canUpdate = view.actor.can_update;

  return (
    <section className="space-y-4" aria-label="روابط کالا" aria-busy={loading || busy}>
      <div className={`${panelCls} flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <h2 className="font-semibold">روابط کالا</h2>
          <p className="mt-1 text-xs text-ink-muted">
            جایگزین و مکمل، رابطهٔ جهت‌دار و <b>اطلاع‌رسان</b> است؛ هیچ جایگزینی خودکار یا تغییر سند/قیمت/موجودی انجام نمی‌شود.
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
      {actionError && (
        <div role="alert" className={errorCls}>
          <p>{actionError}</p>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'خروجی (از این کالا)', value: view.counts.outgoing },
          { label: 'ورودی (به این کالا)', value: view.counts.incoming },
          { label: 'جایگزین', value: view.counts.substitute },
          { label: 'مکمل', value: view.counts.complement },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-line bg-surface px-4 py-3">
            <p className="text-xs text-ink-muted">{card.label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{card.value}</p>
          </div>
        ))}
      </div>

      {!canUpdate && (
        <p role="status" className={warnCls}>
          {view.actor.unavailable_reason_fa ?? 'این نشست مجوز ویرایش کاتالوگ ندارد؛ فقط مشاهده مجاز است.'}
        </p>
      )}

      {canUpdate && (
        <form onSubmit={add} className={`${panelCls} space-y-3`} aria-label="افزودن رابطه">
          <h3 className="font-medium">افزودن رابطه</h3>
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              جست‌وجوی کالای مرتبط
              <input
                className={`${inputCls} mt-1 w-56`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="کد یا نام"
                aria-label="جست‌وجوی کالای مرتبط"
              />
            </label>
            <button type="button" className={btnGhost} onClick={() => void searchProducts()} disabled={searching}>
              {searching ? 'در حال جست‌وجو…' : 'جست‌وجو'}
            </button>
            <label className="text-sm">
              کالای مرتبط
              <select
                className={`${selectCls} mt-1 w-64`}
                value={relatedId}
                onChange={(e) => setRelatedId(e.target.value)}
                aria-label="کالای مرتبط"
                required
              >
                <option value="">— انتخاب —</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.name} ({STATUS_LABEL[c.status] ?? c.status})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              نوع رابطه
              <select
                className={`${selectCls} mt-1 w-36`}
                value={kind}
                onChange={(e) => setKind(e.target.value as 'substitute' | 'complement')}
                aria-label="نوع رابطه"
              >
                <option value="substitute">جایگزین</option>
                <option value="complement">مکمل</option>
              </select>
            </label>
            <label className="text-sm">
              اولویت
              <input
                type="number"
                min={0}
                max={32767}
                className={`${inputCls} mt-1 w-24`}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                aria-label="اولویت"
              />
            </label>
          </div>
          <p className="text-xs leading-6 text-ink-muted">
            {kind === 'substitute'
              ? 'جایگزین: کالای مقصد می‌تواند به‌جای این کالا انتخاب شود. حلقهٔ جایگزینی (A→B و B→A) مجاز نیست.'
              : 'مکمل: کالای مقصد معمولاً همراه این کالا عرضه/پیشنهاد می‌شود. رابطهٔ متقابل خودکار ساخته نمی‌شود.'}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmAdd}
                onChange={(e) => setConfirmAdd(e.target.checked)}
                aria-label="تأیید افزودن رابطه"
              />
              افزودن این رابطه را تأیید می‌کنم.
            </label>
            <button type="submit" className={btnPrimary} disabled={busy}>
              {busy ? 'در حال ثبت…' : 'ثبت رابطه'}
            </button>
          </div>
        </form>
      )}

      <div className={`${panelCls} flex flex-wrap items-end gap-3`}>
        <label className="text-sm">
          فیلتر نوع
          <select className={`${selectCls} mt-1 w-40`} value={filterKind} onChange={(e) => setFilterKind(e.target.value as typeof filterKind)} aria-label="فیلتر نوع رابطه">
            <option value="all">همه</option>
            <option value="substitute">جایگزین</option>
            <option value="complement">مکمل</option>
          </select>
        </label>
        <label className="text-sm">
          فیلتر جهت
          <select className={`${selectCls} mt-1 w-40`} value={filterDirection} onChange={(e) => setFilterDirection(e.target.value as typeof filterDirection)} aria-label="فیلتر جهت رابطه">
            <option value="both">هر دو</option>
            <option value="outgoing">خروجی</option>
            <option value="incoming">ورودی</option>
          </select>
        </label>
        {view.counts.truncated && (
          <p className="text-xs text-warning-ink">فهرست به سقف فنی رسید؛ فیلترها را محدودتر کنید.</p>
        )}
      </div>

      {(['substitute', 'complement'] as const).map((groupKind) => (
        <div key={groupKind} className="space-y-2">
          <h3 className="font-medium">
            {KIND_LABEL[groupKind]} <span className="text-xs font-normal text-ink-muted">({grouped[groupKind].length})</span>
          </h3>
          <div className={tableWrapCls}>
            <table className="w-full text-sm">
              <caption className="sr-only">روابط {KIND_LABEL[groupKind]}</caption>
              <thead>
                <tr>
                  <th className={thCls}>کد</th>
                  <th className={thCls}>نام</th>
                  <th className={thCls}>وضعیت</th>
                  <th className={thCls}>جهت</th>
                  <th className={thCls}>اولویت</th>
                  <th className={thCls}>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {grouped[groupKind].length === 0 && (
                  <tr>
                    <td colSpan={6} className={`${tdCls} py-5 text-center text-ink-subtle`}>
                      رابطه‌ای از این نوع ثبت نشده است.
                    </td>
                  </tr>
                )}
                {grouped[groupKind].map((item: RelationItem) => (
                  <tr key={item.id} className="border-t border-line">
                    <td className={`${tdCls} font-mono text-xs`} dir="ltr">{item.related.code}</td>
                    <td className={tdCls}>
                      <Link href={`/products/${item.related.id}`} className="text-info-ink underline-offset-2 hover:underline">
                        {item.related.name ?? '—'}
                      </Link>
                      {item.related.warning_fa && (
                        <p className="mt-1 text-xs text-warning-ink">{item.related.warning_fa}</p>
                      )}
                    </td>
                    <td className={tdCls}>
                      <span className={statusBadgeCls(item.related.status)}>{item.related.status_label_fa}</span>
                    </td>
                    <td className={`${tdCls} text-ink-muted`}>{DIRECTION_LABEL[item.direction]}</td>
                    <td className={tdCls}>
                      {editing?.id === item.id ? (
                        <input
                          type="number"
                          min={0}
                          max={32767}
                          className={`${inputCls} w-24`}
                          value={editing.priority}
                          onChange={(e) => setEditing({ id: item.id, priority: e.target.value })}
                          aria-label="اولویت تازه"
                        />
                      ) : (
                        <span className="tabular-nums">{item.priority}</span>
                      )}
                    </td>
                    <td className={`${tdCls} space-x-2 space-x-reverse`}>
                      {!canUpdate && <span className="text-xs text-ink-subtle">فقط مشاهده</span>}
                      {canUpdate && item.editable && editing?.id === item.id && (
                        <>
                          <button type="button" className={btnSmall} onClick={() => void savePriority()} disabled={busy}>
                            ذخیره
                          </button>
                          <button type="button" className={btnGhost} onClick={() => setEditing(null)}>
                            انصراف
                          </button>
                        </>
                      )}
                      {canUpdate && item.editable && editing?.id !== item.id && (
                        <button
                          type="button"
                          className={btnSmall}
                          onClick={() => setEditing({ id: item.id, priority: String(item.priority) })}
                        >
                          ویرایش اولویت
                        </button>
                      )}
                      {canUpdate && item.removable && (
                        <button type="button" className={btnDangerSmall} onClick={() => void remove(item.id)} disabled={busy}>
                          حذف
                        </button>
                      )}
                      {!item.editable && <span className="text-xs text-ink-subtle">از کالای مقابل مدیریت می‌شود</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={panelCls}>
          <h3 className="font-medium">نقشهٔ روابط (پیمایش محدود)</h3>
          {!graph || graph.nodes.length <= 1 ? (
            <p className="mt-2 text-sm text-ink-subtle">هنوز رابطهٔ خروجی برای پیمایش وجود ندارد.</p>
          ) : (
            <>
              <ul className="mt-2 space-y-1 text-sm">
                {graph.nodes
                  .filter((n) => n.depth > 0)
                  .map((n) => (
                    <li key={`${n.product_id}-${n.depth}`} className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-ink-subtle">سطح {n.depth}</span>
                      <Link href={`/products/${n.product_id}`} className="text-info-ink hover:underline">
                        {n.code} — {n.name ?? '—'}
                      </Link>
                      {n.kind && <span className="text-xs text-ink-muted">({KIND_LABEL[n.kind] ?? n.kind})</span>}
                      <span className={statusBadgeCls(n.status)}>{STATUS_LABEL[n.status] ?? n.status}</span>
                    </li>
                  ))}
              </ul>
              <p className="mt-2 text-xs leading-6 text-ink-muted">
                حداکثر عمق {graph.technical_limits.max_depth} و حداکثر {graph.technical_limits.max_nodes} گره؛
                {graph.truncated ? ' فهرست به سقف فنی رسید.' : ' نتیجه کامل در محدودهٔ فنی است.'}
              </p>
            </>
          )}
        </div>

        <div className={panelCls}>
          <h3 className="font-medium">تاریخچهٔ روابط</h3>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-ink-subtle">هنوز رویدادی برای روابط این کالا ثبت نشده است.</p>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {history.map((h) => (
                <li key={h.id} className="border-b border-line pb-2 last:border-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{h.event_label_fa}</span>
                    <time className="text-xs text-ink-muted" dateTime={h.at}>
                      {new Date(h.at).toLocaleString('fa-IR')}
                    </time>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    کنشگر: {h.actor_label_fa}
                    {h.kind ? ` · نوع: ${KIND_LABEL[h.kind] ?? h.kind}` : ''}
                    {h.priority != null ? ` · اولویت: ${h.priority}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
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
              <span className={d.status === 'BLOCKED' ? 'rounded bg-danger-soft px-2 py-0.5 text-danger-ink' : 'rounded bg-warning-soft px-2 py-0.5 text-warning-ink'}>
                {d.status}
              </span>
              <span className="font-medium">{d.id} — {d.title_fa}:</span>
              <span className="text-ink-muted">{d.detail_fa}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
