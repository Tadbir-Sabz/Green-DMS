"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AppLoader } from "@/components/AppShell";
import {
  type Brand,
  type BrandDetail,
  type Category,
  type CategoryDetail,
  type ReferenceAuditEvent,
  type ReferenceProduct,
  type Unit,
  type UnitDetail,
  btnDangerSmall,
  btnGhost,
  btnPrimary,
  btnSmall,
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
} from "../products-lib";
import {
  ACTION_LABEL_FA,
  ACTIVE_FILTER_LABEL,
  ENTITY_LABEL_FA,
  PAGE_SIZE,
  TABS,
  activeFilterValue,
  activeLabel,
  activeToneCls,
  brandOptionLabel,
  categoryDepthMap,
  categoryPathLabel,
  faNumber,
  formatAuditDate,
  pageRangeLabel,
  parentOptions,
  unitOptionLabel,
  type ActiveFilter,
  type RefKind,
  type TabKey,
} from "./reference-data-lib";

/**
 * TASK-PM-02-C2 — مدیریت یکپارچهٔ برند / واحد اندازهگیری / دستهبندی.
 *
 * این صفحه صرفاً از قرارداد `/reference-data/*` استفاده میکند (همان جداول
 * ۰۰۰۵ + ستونهای ۰۰۶۵). مسیرهای قدیمی فرم کالا دستنخوردهاند. تمام نوشتنها
 * مشروط به `master.product.update`اند، پیامها فارسی و سلسلهمراتب RTL است؛
 * حذفِ رکورد درحالاستفاده یا نیازمند انتساب ایمن است یا پیشنهاد غیرفعالسازی.
 * هیچ تبدیل ضمنی واحد، مالکیت دامنهای یا مجوز تازهای ساخته نشد.
 */

interface MutationResult {
  error?: unknown;
  data?: unknown;
}

interface ListParams {
  q: string;
  active: ActiveFilter;
  offset: number;
  root: boolean;
}

const INITIAL_PARAMS: ListParams = { q: "", active: "all", offset: 0, root: false };

function listQuery(p: ListParams, withRoot: boolean): Record<string, string | number | boolean> {
  const q = p.q.trim();
  const isActive = activeFilterValue(p.active);
  return {
    ...(q ? { q } : {}),
    ...(isActive !== undefined ? { is_active: isActive } : {}),
    ...(withRoot && p.root ? { root: true } : {}),
    limit: PAGE_SIZE,
    offset: p.offset,
  };
}

async function toggleActive(kind: RefKind, id: string, is_active: boolean): Promise<MutationResult> {
  if (kind === "brand") {
    return (await api.PATCH("/reference-data/brands/{id}", {
      params: { path: { id } },
      body: { is_active },
    })) as MutationResult;
  }
  if (kind === "unit") {
    return (await api.PATCH("/reference-data/units/{id}", {
      params: { path: { id } },
      body: { is_active },
    })) as MutationResult;
  }
  return (await api.PATCH("/reference-data/categories/{id}", {
    params: { path: { id } },
    body: { is_active },
  })) as MutationResult;
}

async function deleteReference(kind: RefKind, id: string, reassignTo?: string): Promise<MutationResult> {
  if (kind === "brand") {
    return (await api.DELETE("/reference-data/brands/{id}", {
      params: { path: { id } },
    })) as MutationResult;
  }
  if (kind === "unit") {
    return (await api.DELETE("/reference-data/units/{id}", {
      params: { path: { id } },
    })) as MutationResult;
  }
  const params = reassignTo
    ? { path: { id }, query: { reassign_to: reassignTo } }
    : { path: { id } };
  return (await api.DELETE("/reference-data/categories/{id}", { params })) as MutationResult;
}

interface MessageSetters {
  setNotice: (message: string) => void;
  setError: (message: string) => void;
}

interface PanelProps extends MessageSetters {
  canWrite: boolean;
}

/* ───────────────────────── اجزای مشترک ───────────────────────── */

function FilterBar({
  q,
  active,
  root,
  busy,
  onApply,
  onRootChange,
}: {
  q: string;
  active: ActiveFilter;
  root: boolean;
  busy: boolean;
  onApply: (q: string, active: ActiveFilter, root: boolean) => void;
  onRootChange?: (value: boolean) => void;
}) {
  const [draftQ, setDraftQ] = useState(q);
  useEffect(() => setDraftQ(q), [q]);
  const apply = (nextQ: string, nextActive: ActiveFilter, nextRoot: boolean): void =>
    onApply(nextQ, nextActive, nextRoot);
  return (
    <form
      className={`${panelCls} grid gap-3 sm:grid-cols-2 lg:grid-cols-4`}
      onSubmit={(e) => {
        e.preventDefault();
        apply(draftQ, active, root);
      }}
      aria-busy={busy}
    >
      <label className="text-sm">
        جستوجو (کد / نام / نام لاتین)
        <input
          className={`${inputCls} mt-1`}
          aria-label="جستوجو"
          value={draftQ}
          maxLength={128}
          disabled={busy}
          onChange={(e) => setDraftQ(e.target.value)}
          placeholder="مثلاً kg یا برند سبز"
        />
      </label>
      <label className="text-sm">
        وضعیت
        <select
          className={`${selectCls} mt-1`}
          aria-label="فیلتر وضعیت"
          value={active}
          disabled={busy}
          onChange={(e) => apply(draftQ, e.target.value as ActiveFilter, root)}
        >
          {(Object.keys(ACTIVE_FILTER_LABEL) as ActiveFilter[]).map((key) => (
            <option key={key} value={key}>
              {ACTIVE_FILTER_LABEL[key]}
            </option>
          ))}
        </select>
      </label>
      {onRootChange && (
        <label className="flex items-center gap-2 self-end text-sm">
          <input
            type="checkbox"
            checked={root}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.checked;
              onRootChange(next);
              apply(draftQ, active, next);
            }}
          />
          فقط دستههای ریشه
        </label>
      )}
      <div className="flex items-end gap-2">
        <button className={btnGhost} type="submit" disabled={busy}>
          جستوجو
        </button>
        <button
          className={btnGhost}
          type="button"
          disabled={busy}
          onClick={() => {
            setDraftQ("");
            onRootChange?.(false);
            apply("", "all", false);
          }}
        >
          پاکسازی
        </button>
      </div>
    </form>
  );
}

function Pager({
  offset,
  total,
  limit,
  busy,
  onChange,
}: {
  offset: number;
  total: number;
  limit: number;
  busy: boolean;
  onChange: (offset: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink-muted">
      <span>{pageRangeLabel(offset, total, limit)}</span>
      <div className="flex gap-2">
        <button
          className={btnSmall}
          type="button"
          disabled={busy || offset <= 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          صفحهٔ قبل
        </button>
        <button
          className={btnSmall}
          type="button"
          disabled={busy || offset + limit >= total}
          onClick={() => onChange(offset + limit)}
        >
          صفحهٔ بعد
        </button>
      </div>
    </div>
  );
}

function ProductList({ products }: { products: ReferenceProduct[] }) {
  if (products.length === 0) {
    return <p className="text-sm text-ink-muted">هیچ کالایی به این رکورد متصل نیست.</p>;
  }
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {products.map((p) => (
        <li key={p.id} className="rounded-lg border border-line px-3 py-2 text-sm">
          <bdi className="font-mono text-xs text-ink-muted" dir="ltr">
            {p.code}
          </bdi>
          {" — "}
          {p.name}
          {p.status ? <span className="text-xs text-ink-subtle"> · {p.status}</span> : null}
        </li>
      ))}
    </ul>
  );
}

function DetailShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <section className={`${panelCls} mt-4`} aria-label="جزئیات رکورد مرجع">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-medium">{title}</h2>
        <button className={btnSmall} type="button" onClick={onClose}>
          بستن
        </button>
      </div>
      {children}
    </section>
  );
}

interface PendingDelete {
  kind: RefKind;
  id: string;
  label: string;
  inUse: boolean;
  usage: { children?: number; products?: number };
  reassignOptions?: Category[];
}

function ConfirmDeleteDialog({
  pending,
  busy,
  onCancel,
  onConfirm,
}: {
  pending: PendingDelete;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reassignTo?: string) => void;
}) {
  const [reassignTo, setReassignTo] = useState("");
  const canReassign = (pending.reassignOptions?.length ?? 0) > 0;
  const requireReassign = pending.inUse && canReassign;
  const blocked = pending.inUse && !canReassign;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="reference-delete-title"
        dir="rtl"
        className="w-full max-w-lg rounded-xl border border-line bg-surface p-5 shadow-xl"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) onCancel();
        }}
      >
        <h2 id="reference-delete-title" className="text-lg font-semibold">
          تأیید حذف
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          آیا از حذف «{pending.label}» اطمینان دارید؟ این عملیات قابل بازگشت نیست.
        </p>
        <p className={`mt-2 text-sm ${blocked ? "text-danger-ink" : "text-ink-muted"}`}>
          {pending.inUse
            ? `این رکورد ${pending.usage.products ? `${faNumber(pending.usage.products)} کالا` : ""}${
                pending.usage.children ? ` و ${faNumber(pending.usage.children)} زیردسته` : ""
              } دارد.`
            : "این رکورد در حال حاضر استفاده نشده است."}
        </p>
        {blocked && (
          <p className={`mt-2 ${warnCls}`}>
            حذف رکورد درحالاستفاده مجاز نیست؛ بهجای حذف، از دکمهٔ «غیرفعالسازی» استفاده کنید.
          </p>
        )}
        {requireReassign && (
          <label className="mt-3 block text-sm">
            انتقال زیردستهها و کالاها به (الزامی)
            <select
              className={`${selectCls} mt-1`}
              value={reassignTo}
              disabled={busy}
              onChange={(e) => setReassignTo(e.target.value)}
            >
              <option value="">— دستهٔ مقصد را انتخاب کنید —</option>
              {(pending.reassignOptions ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {categoryPathLabel(pending.reassignOptions ?? [], c.id)}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button className={btnGhost} type="button" autoFocus disabled={busy} onClick={onCancel}>
            انصراف
          </button>
          <button
            className={btnDangerSmall}
            type="button"
            disabled={busy || blocked || (requireReassign && !reassignTo)}
            onClick={() => onConfirm(reassignTo || undefined)}
          >
            {busy ? "در حال حذف…" : "تأیید حذف"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── برند ───────────────────────────── */

interface BrandDraft {
  code: string;
  name: string;
  name_latin: string;
  is_active: boolean;
}
const EMPTY_BRAND: BrandDraft = { code: "", name: "", name_latin: "", is_active: true };

function BrandsPanel({ canWrite, setNotice, setError }: PanelProps) {
  const [params, setParams] = useState<ListParams>(INITIAL_PARAMS);
  const [rows, setRows] = useState<Brand[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<BrandDraft>(EMPTY_BRAND);
  const [editingId, setEditingId] = useState("");
  const [detail, setDetail] = useState<BrandDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pending, setPending] = useState<PendingDelete | null>(null);

  const load = useCallback(
    async (p: ListParams) => {
      setLoading(true);
      setError("");
      try {
        const { data, error } = await api.GET("/reference-data/brands", {
          params: { query: listQuery(p, false) },
        });
        if (error) {
          setError(faError(error));
          return;
        }
        setRows(data?.items ?? []);
        setTotal(data?.total ?? 0);
      } catch {
        setError("ارتباط با سرور برقرار نشد.");
      } finally {
        setLoading(false);
      }
    },
    [setError],
  );

  useEffect(() => {
    void load(INITIAL_PARAMS);
  }, [load]);

  const apply = (q: string, active: ActiveFilter, root: boolean): void => {
    const next = { q, active, offset: 0, root };
    setParams(next);
    void load(next);
  };
  const go = (offset: number): void => {
    const next = { ...params, offset };
    setParams(next);
    void load(next);
  };

  const save = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!canWrite) return;
    if (!draft.code.trim() || !draft.name.trim()) {
      setError("کد و نام برند الزامیاند.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const body = {
      code: draft.code.trim(),
      name: draft.name.trim(),
      name_latin: draft.name_latin.trim() || null,
      is_active: draft.is_active,
    };
    const result = editingId
      ? ((await api.PATCH("/reference-data/brands/{id}", {
          params: { path: { id: editingId } },
          body,
        })) as MutationResult)
      : ((await api.POST("/reference-data/brands", { body })) as MutationResult);
    setBusy(false);
    if (result.error) {
      setError(faError(result.error));
      return;
    }
    setDraft(EMPTY_BRAND);
    setEditingId("");
    await load(params);
    setNotice(editingId ? "برند ویرایش شد." : "برند جدید ثبت شد.");
  };

  const toggle = async (row: Brand): Promise<void> => {
    if (!canWrite) return;
    setBusy(true);
    setError("");
    setNotice("");
    const result = await toggleActive("brand", row.id, !row.is_active);
    setBusy(false);
    if (result.error) {
      setError(faError(result.error));
      return;
    }
    await load(params);
    setNotice("وضعیت برند ذخیره شد. کالاهای قبلی تغییر نکردند.");
  };

  const openDetail = async (id: string): Promise<void> => {
    setDetailLoading(true);
    setError("");
    const { data, error } = await api.GET("/reference-data/brands/{id}", {
      params: { path: { id } },
    });
    setDetailLoading(false);
    if (error) {
      setError(faError(error));
      return;
    }
    setDetail(data ?? null);
  };

  const confirmDelete = async (): Promise<void> => {
    if (!pending) return;
    setBusy(true);
    setError("");
    setNotice("");
    const result = await deleteReference("brand", pending.id);
    setBusy(false);
    if (result.error) {
      setError(faError(result.error));
      return;
    }
    setPending(null);
    setDetail(null);
    await load(params);
    setNotice("برند حذف شد.");
  };

  return (
    <div role="tabpanel" id="panel-brands" aria-labelledby="tab-brands" className="space-y-4">
      <FilterBar q={params.q} active={params.active} root={false} busy={loading || busy} onApply={apply} />
      {canWrite && (
        <form id="brand-form" className={`${panelCls} grid gap-3 sm:grid-cols-2 lg:grid-cols-4`} onSubmit={(e) => void save(e)} aria-busy={busy}>
          <h2 className="font-medium sm:col-span-2 lg:col-span-4">{editingId ? "ویرایش برند" : "برند جدید"}</h2>
          <label className="text-sm">
            کد (لاتین) *
            <input className={`${inputCls} mt-1`} dir="ltr" required maxLength={64} value={draft.code} disabled={busy} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
          </label>
          <label className="text-sm">
            نام *
            <input className={`${inputCls} mt-1`} required maxLength={255} value={draft.name} disabled={busy} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="text-sm">
            نام لاتین
            <input className={`${inputCls} mt-1`} dir="ltr" maxLength={255} value={draft.name_latin} disabled={busy} onChange={(e) => setDraft({ ...draft, name_latin: e.target.value })} />
          </label>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={draft.is_active} disabled={busy} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />
            فعال
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button className={btnPrimary} disabled={busy || !draft.code.trim() || !draft.name.trim()}>
              {busy ? "در حال ذخیره…" : editingId ? "ذخیرهٔ ویرایش" : "ثبت برند"}
            </button>
            {editingId && (
              <button className={btnGhost} type="button" disabled={busy} onClick={() => { setEditingId(""); setDraft(EMPTY_BRAND); }}>
                انصراف
              </button>
            )}
          </div>
        </form>
      )}
      {!canWrite && <p className="text-sm text-ink-muted">این نشست فقط دسترسی خواندن دادههای مرجع دارد.</p>}
      {loading ? (
        <p role="status">در حال دریافت برندها…</p>
      ) : (
        <div className={tableWrapCls}>
          <table className="w-full text-sm">
            <caption className="sr-only">فهرست برندها</caption>
            <thead>
              <tr>
                <th className={thCls}>کد</th>
                <th className={thCls}>نام / لاتین</th>
                <th className={thCls}>وضعیت</th>
                <th className={thCls}>کالاهای متصل</th>
                <th className={thCls}>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className={tdCls}><bdi dir="ltr" className="font-mono text-xs">{row.code ?? "—"}</bdi></td>
                  <td className={tdCls}>{row.name}{row.name_latin ? <span dir="ltr" className="text-xs text-ink-muted"> · {row.name_latin}</span> : null}</td>
                  <td className={tdCls}><span className={activeToneCls(row.is_active !== false)}>{activeLabel(row.is_active !== false)}</span></td>
                  <td className={tdCls}>{faNumber(row.product_count)}</td>
                  <td className={tdCls}>
                    <div className="flex flex-wrap gap-1">
                      <button className={btnSmall} type="button" disabled={busy || detailLoading} onClick={() => void openDetail(row.id)}>جزئیات</button>
                      {canWrite && (
                        <>
                          <button className={btnSmall} type="button" disabled={busy} onClick={() => { setEditingId(row.id); setDraft({ code: row.code ?? "", name: row.name, name_latin: row.name_latin ?? "", is_active: row.is_active !== false }); setNotice(""); setError(""); }}>ویرایش</button>
                          <button className={btnSmall} type="button" disabled={busy} onClick={() => void toggle(row)}>{row.is_active === false ? "فعالسازی" : "غیرفعالسازی"}</button>
                          {row.product_count === 0 ? (
                            <button className={btnDangerSmall} type="button" disabled={busy} onClick={() => setPending({ kind: "brand", id: row.id, label: brandOptionLabel(row), inUse: false, usage: { products: row.product_count } })}>حذف</button>
                          ) : (
                            <span className="text-xs text-ink-muted" title="رکورد درحالاستفاده قابل حذف نیست">در حال استفاده</span>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && rows.length === 0 && <p className="text-sm text-ink-muted">هیچ برندی با این فیلتر یافت نشد.</p>}
      <Pager offset={params.offset} total={total} limit={PAGE_SIZE} busy={loading || busy} onChange={go} />
      {detailLoading && <p role="status">در حال دریافت جزئیات…</p>}
      {detail && (
        <DetailShell title={`جزئیات برند «${detail.name}»`} onClose={() => setDetail(null)}>
          <p className="mb-3 text-sm text-ink-muted">تعداد کالاهای متصل: {faNumber(detail.usage_count)}</p>
          <h3 className="mb-2 text-sm font-medium">کالاهای متصل</h3>
          <ProductList products={detail.products} />
        </DetailShell>
      )}
      {pending && (
        <ConfirmDeleteDialog key={pending.id} pending={pending} busy={busy} onCancel={() => setPending(null)} onConfirm={() => void confirmDelete()} />
      )}
    </div>
  );
}

/* ───────────────────────────── واحد ───────────────────────────── */

interface UnitDraft {
  code: string;
  title: string;
  symbol: string;
  title_latin: string;
  decimal_places: string;
  is_active: boolean;
}
const EMPTY_UNIT: UnitDraft = { code: "", title: "", symbol: "", title_latin: "", decimal_places: "0", is_active: true };

function UnitsPanel({ canWrite, setNotice, setError }: PanelProps) {
  const [params, setParams] = useState<ListParams>(INITIAL_PARAMS);
  const [rows, setRows] = useState<Unit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<UnitDraft>(EMPTY_UNIT);
  const [editingId, setEditingId] = useState("");
  const [detail, setDetail] = useState<UnitDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pending, setPending] = useState<PendingDelete | null>(null);

  const load = useCallback(
    async (p: ListParams) => {
      setLoading(true);
      setError("");
      try {
        const { data, error } = await api.GET("/reference-data/units", {
          params: { query: listQuery(p, false) },
        });
        if (error) {
          setError(faError(error));
          return;
        }
        setRows(data?.items ?? []);
        setTotal(data?.total ?? 0);
      } catch {
        setError("ارتباط با سرور برقرار نشد.");
      } finally {
        setLoading(false);
      }
    },
    [setError],
  );

  useEffect(() => {
    void load(INITIAL_PARAMS);
  }, [load]);

  const apply = (q: string, active: ActiveFilter, root: boolean): void => {
    const next = { q, active, offset: 0, root };
    setParams(next);
    void load(next);
  };
  const go = (offset: number): void => {
    const next = { ...params, offset };
    setParams(next);
    void load(next);
  };

  const save = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!canWrite) return;
    const decimals = Number(draft.decimal_places);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 4) {
      setError("دقت اعشار باید عدد صحیح بین ۰ و ۴ باشد (مصوب D3).");
      return;
    }
    if (!draft.code.trim() || !draft.title.trim()) {
      setError("کد و عنوان واحد الزامیاند.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const common = {
      title: draft.title.trim(),
      symbol: draft.symbol.trim() || null,
      title_latin: draft.title_latin.trim() || null,
      decimal_places: decimals,
      is_active: draft.is_active,
    };
    const result = editingId
      ? ((await api.PATCH("/reference-data/units/{id}", {
          params: { path: { id: editingId } },
          body: common, // کد واحد تغییرناپذیر است و ارسال نمیشود
        })) as MutationResult)
      : ((await api.POST("/reference-data/units", {
          body: { code: draft.code.trim().toLowerCase(), ...common },
        })) as MutationResult);
    setBusy(false);
    if (result.error) {
      setError(faError(result.error));
      return;
    }
    setDraft(EMPTY_UNIT);
    setEditingId("");
    await load(params);
    setNotice(editingId ? "واحد ویرایش شد." : "واحد جدید ثبت شد.");
  };

  const toggle = async (row: Unit): Promise<void> => {
    if (!canWrite) return;
    setBusy(true);
    setError("");
    setNotice("");
    const result = await toggleActive("unit", row.id, !(row.is_active !== false));
    setBusy(false);
    if (result.error) {
      setError(faError(result.error));
      return;
    }
    await load(params);
    setNotice("وضعیت واحد ذخیره شد. کالاها و بستهبندیهای قبلی تغییر نکردند.");
  };

  const openDetail = async (id: string): Promise<void> => {
    setDetailLoading(true);
    setError("");
    const { data, error } = await api.GET("/reference-data/units/{id}", {
      params: { path: { id } },
    });
    setDetailLoading(false);
    if (error) {
      setError(faError(error));
      return;
    }
    setDetail(data ?? null);
  };

  const confirmDelete = async (): Promise<void> => {
    if (!pending) return;
    setBusy(true);
    setError("");
    setNotice("");
    const result = await deleteReference("unit", pending.id);
    setBusy(false);
    if (result.error) {
      setError(faError(result.error));
      return;
    }
    setPending(null);
    setDetail(null);
    await load(params);
    setNotice("واحد اندازهگیری حذف شد.");
  };

  return (
    <div role="tabpanel" id="panel-units" aria-labelledby="tab-units" className="space-y-4">
      <p className="text-sm text-ink-muted">
        دقت اعشار طبق مصوب D3 و قید پایگاهداده ۰ تا ۴ است. نماد/عنوان لاتین صرفاً نمایشیاند؛
        هیچ تبدیل ضمنی واحدی ساخته نشد و ضریب تبدیل بستهبندی دستنخورده ماند.
      </p>
      <FilterBar q={params.q} active={params.active} root={false} busy={loading || busy} onApply={apply} />
      {canWrite && (
        <form className={`${panelCls} grid gap-3 sm:grid-cols-2 lg:grid-cols-4`} onSubmit={(e) => void save(e)} aria-busy={busy}>
          <h2 className="font-medium sm:col-span-2 lg:col-span-4">{editingId ? "ویرایش واحد" : "واحد جدید"}</h2>
          <label className="text-sm">
            کد (لاتین کوچک) *
            <input className={`${inputCls} mt-1`} dir="ltr" required maxLength={16} disabled={busy || Boolean(editingId)} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} title={editingId ? "کد واحد پس از ایجاد تغییرناپذیر است" : undefined} />
          </label>
          <label className="text-sm">
            عنوان *
            <input className={`${inputCls} mt-1`} required maxLength={64} value={draft.title} disabled={busy} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </label>
          <label className="text-sm">
            نماد
            <input className={`${inputCls} mt-1`} maxLength={16} value={draft.symbol} disabled={busy} onChange={(e) => setDraft({ ...draft, symbol: e.target.value })} />
          </label>
          <label className="text-sm">
            عنوان لاتین
            <input className={`${inputCls} mt-1`} dir="ltr" maxLength={64} value={draft.title_latin} disabled={busy} onChange={(e) => setDraft({ ...draft, title_latin: e.target.value })} />
          </label>
          <label className="text-sm">
            دقت اعشار (۰..۴)
            <input className={`${inputCls} mt-1`} type="number" inputMode="numeric" aria-label="دقت اعشار (۰..۴)" value={draft.decimal_places} disabled={busy} onChange={(e) => setDraft({ ...draft, decimal_places: e.target.value })} aria-describedby="unit-decimal-hint" />
            <span id="unit-decimal-hint" className="sr-only">دقت اعشار عدد صحیح بین ۰ و ۴ است؛ اعتبارسنجی سرور نیز اعمال میشود.</span>
          </label>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={draft.is_active} disabled={busy} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />
            فعال
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button className={btnPrimary} disabled={busy || !draft.code.trim() || !draft.title.trim()}>
              {busy ? "در حال ذخیره…" : editingId ? "ذخیرهٔ ویرایش" : "ثبت واحد"}
            </button>
            {editingId && (
              <button className={btnGhost} type="button" disabled={busy} onClick={() => { setEditingId(""); setDraft(EMPTY_UNIT); }}>
                انصراف
              </button>
            )}
          </div>
        </form>
      )}
      {!canWrite && <p className="text-sm text-ink-muted">این نشست فقط دسترسی خواندن دادههای مرجع دارد.</p>}
      {loading ? (
        <p role="status">در حال دریافت واحدها…</p>
      ) : (
        <div className={tableWrapCls}>
          <table className="w-full text-sm">
            <caption className="sr-only">فهرست واحدهای اندازهگیری</caption>
            <thead>
              <tr>
                <th className={thCls}>کد / نماد</th>
                <th className={thCls}>عنوان / لاتین</th>
                <th className={thCls}>دقت</th>
                <th className={thCls}>وضعیت</th>
                <th className={thCls}>استفاده</th>
                <th className={thCls}>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className={tdCls}><bdi dir="ltr" className="font-mono text-xs">{row.code}</bdi>{row.symbol ? ` (${row.symbol})` : ""}</td>
                  <td className={tdCls}>{row.title}{row.title_latin ? <span dir="ltr" className="text-xs text-ink-muted"> · {row.title_latin}</span> : null}</td>
                  <td className={tdCls}>{faNumber(row.decimal_places ?? 0)}</td>
                  <td className={tdCls}><span className={activeToneCls(row.is_active !== false)}>{activeLabel(row.is_active !== false)}</span></td>
                  <td className={tdCls}>{faNumber(row.product_count ?? 0)} کالا / {faNumber(row.packaging_count ?? 0)} بسته</td>
                  <td className={tdCls}>
                    <div className="flex flex-wrap gap-1">
                      <button className={btnSmall} type="button" disabled={busy || detailLoading} onClick={() => void openDetail(row.id)}>جزئیات</button>
                      {canWrite && (
                        <>
                          <button className={btnSmall} type="button" disabled={busy} onClick={() => { setEditingId(row.id); setDraft({ code: row.code, title: row.title, symbol: row.symbol ?? "", title_latin: row.title_latin ?? "", decimal_places: String(row.decimal_places ?? 0), is_active: row.is_active !== false !== false }); setNotice(""); setError(""); }}>ویرایش</button>
                          <button className={btnSmall} type="button" disabled={busy} onClick={() => void toggle(row)}>{row.is_active === false ? "فعالسازی" : "غیرفعالسازی"}</button>
                          {(row.product_count ?? 0) === 0 && (row.packaging_count ?? 0) === 0 ? (
                            <button className={btnDangerSmall} type="button" disabled={busy} onClick={() => setPending({ kind: "unit", id: row.id, label: unitOptionLabel(row), inUse: false, usage: { products: row.product_count ?? 0 } })}>حذف</button>
                          ) : (
                            <span className="text-xs text-ink-muted" title="رکورد درحالاستفاده قابل حذف نیست">در حال استفاده</span>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && rows.length === 0 && <p className="text-sm text-ink-muted">هیچ واحدی با این فیلتر یافت نشد.</p>}
      <Pager offset={params.offset} total={total} limit={PAGE_SIZE} busy={loading || busy} onChange={go} />
      {detailLoading && <p role="status">در حال دریافت جزئیات…</p>}
      {detail && (
        <DetailShell title={`جزئیات واحد «${detail.title}»`} onClose={() => setDetail(null)}>
          <p className="mb-3 text-sm text-ink-muted">
            دقت اعشار: {faNumber(detail.decimal_places ?? 0)} · کالاها: {faNumber(detail.product_count ?? 0)} · بستهبندیها: {faNumber(detail.packaging_count ?? 0)} · مجموع استفاده: {faNumber(detail.usage_count)}
          </p>
          <h3 className="mb-2 text-sm font-medium">کالاهای متصل</h3>
          <ProductList products={detail.products} />
        </DetailShell>
      )}
      {pending && (
        <ConfirmDeleteDialog key={pending.id} pending={pending} busy={busy} onCancel={() => setPending(null)} onConfirm={() => void confirmDelete()} />
      )}
    </div>
  );
}

/* ─────────────────────────── دستهبندی ─────────────────────────── */

interface CategoryDraft {
  code: string;
  name: string;
  name_latin: string;
  parent_id: string;
  is_active: boolean;
}
const EMPTY_CATEGORY: CategoryDraft = { code: "", name: "", name_latin: "", parent_id: "", is_active: true };

function CategoriesPanel({ canWrite, setNotice, setError }: PanelProps) {
  const [params, setParams] = useState<ListParams>(INITIAL_PARAMS);
  const [rows, setRows] = useState<Category[]>([]);
  const [allRows, setAllRows] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<CategoryDraft>(EMPTY_CATEGORY);
  const [editingId, setEditingId] = useState("");
  const [detail, setDetail] = useState<CategoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pending, setPending] = useState<PendingDelete | null>(null);

  const load = useCallback(
    async (p: ListParams) => {
      setLoading(true);
      setError("");
      try {
        const { data, error } = await api.GET("/reference-data/categories", {
          params: { query: listQuery(p, true) },
        });
        if (error) {
          setError(faError(error));
          return;
        }
        setRows(data?.items ?? []);
        setTotal(data?.total ?? 0);
      } catch {
        setError("ارتباط با سرور برقرار نشد.");
      } finally {
        setLoading(false);
      }
    },
    [setError],
  );

  const loadAll = useCallback(async () => {
    const { data, error } = await api.GET("/reference-data/categories", {
      params: { query: { limit: 200 } },
    });
    if (error) {
      setError(faError(error));
      return;
    }
    setAllRows(data?.items ?? []);
  }, [setError]);

  useEffect(() => {
    void load(INITIAL_PARAMS);
    void loadAll();
  }, [load, loadAll]);

  const apply = (q: string, active: ActiveFilter, root: boolean): void => {
    const next = { q, active, offset: 0, root };
    setParams(next);
    void load(next);
  };
  const go = (offset: number): void => {
    const next = { ...params, offset };
    setParams(next);
    void load(next);
  };

  const save = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (!canWrite) return;
    if (!draft.code.trim() || !draft.name.trim()) {
      setError("کد و نام دستهبندی الزامیاند.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    const body = {
      code: draft.code.trim(),
      name: draft.name.trim(),
      name_latin: draft.name_latin.trim() || null,
      parent_id: draft.parent_id || null,
      is_active: draft.is_active,
    };
    const result = editingId
      ? ((await api.PATCH("/reference-data/categories/{id}", {
          params: { path: { id: editingId } },
          body,
        })) as MutationResult)
      : ((await api.POST("/reference-data/categories", { body })) as MutationResult);
    setBusy(false);
    if (result.error) {
      setError(faError(result.error));
      return;
    }
    setDraft(EMPTY_CATEGORY);
    setEditingId("");
    await Promise.all([load(params), loadAll()]);
    setNotice(editingId ? "دستهبندی ویرایش شد." : "دستهبندی جدید ثبت شد.");
  };

  const toggle = async (row: Category): Promise<void> => {
    if (!canWrite) return;
    setBusy(true);
    setError("");
    setNotice("");
    const result = await toggleActive("category", row.id, !(row.is_active !== false));
    setBusy(false);
    if (result.error) {
      setError(faError(result.error));
      return;
    }
    await Promise.all([load(params), loadAll()]);
    setNotice("وضعیت دستهبندی ذخیره شد. کالاهای قبلی تغییر نکردند.");
  };

  const openDetail = async (id: string): Promise<void> => {
    setDetailLoading(true);
    setError("");
    const { data, error } = await api.GET("/reference-data/categories/{id}", {
      params: { path: { id } },
    });
    setDetailLoading(false);
    if (error) {
      setError(faError(error));
      return;
    }
    setDetail(data ?? null);
  };

  const confirmDelete = async (reassignTo?: string): Promise<void> => {
    if (!pending) return;
    setBusy(true);
    setError("");
    setNotice("");
    const result = await deleteReference("category", pending.id, reassignTo);
    setBusy(false);
    if (result.error) {
      setError(faError(result.error));
      return;
    }
    setPending(null);
    setDetail(null);
    await Promise.all([load(params), loadAll()]);
    setNotice(reassignTo ? "دستهبندی با انتساب ایمن وابستگان حذف شد." : "دستهبندی حذف شد.");
  };

  const depths = categoryDepthMap(allRows.length > 0 ? allRows : rows);
  const options = parentOptions(allRows.length > 0 ? allRows : rows, editingId || undefined);

  return (
    <div role="tabpanel" id="panel-categories" aria-labelledby="tab-categories" className="space-y-4">
      <p className="text-sm text-ink-muted">
        سلسلهمراتب مرکزی شرکت، بدون مالکیت دامنهای. والد فقط از دستههای فعال و بیرون از شاخهٔ
        خود رکورد انتخاب میشود؛ سرور نیز حلقه و عمق را مستقلاً بررسی میکند.
      </p>
      <FilterBar
        q={params.q}
        active={params.active}
        root={params.root}
        busy={loading || busy}
        onApply={apply}
        onRootChange={(value) => setParams((p) => ({ ...p, root: value }))}
      />
      {canWrite && (
        <form className={`${panelCls} grid gap-3 sm:grid-cols-2 lg:grid-cols-4`} onSubmit={(e) => void save(e)} aria-busy={busy}>
          <h2 className="font-medium sm:col-span-2 lg:col-span-4">{editingId ? "ویرایش / جابهجایی دسته" : "دستهبندی جدید"}</h2>
          <label className="text-sm">
            کد (لاتین) *
            <input className={`${inputCls} mt-1`} dir="ltr" required maxLength={64} value={draft.code} disabled={busy} onChange={(e) => setDraft({ ...draft, code: e.target.value })} />
          </label>
          <label className="text-sm">
            نام *
            <input className={`${inputCls} mt-1`} required maxLength={255} value={draft.name} disabled={busy} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </label>
          <label className="text-sm">
            نام لاتین
            <input className={`${inputCls} mt-1`} dir="ltr" maxLength={255} value={draft.name_latin} disabled={busy} onChange={(e) => setDraft({ ...draft, name_latin: e.target.value })} />
          </label>
          <label className="text-sm">
            والد (خالی = ریشه)
            <select className={`${selectCls} mt-1`} value={draft.parent_id} disabled={busy} onChange={(e) => setDraft({ ...draft, parent_id: e.target.value })}>
              <option value="">— ریشه —</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>{categoryPathLabel(allRows.length > 0 ? allRows : rows, c.id)}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end text-sm">
            <input type="checkbox" checked={draft.is_active} disabled={busy} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />
            فعال
          </label>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button className={btnPrimary} disabled={busy || !draft.code.trim() || !draft.name.trim()}>
              {busy ? "در حال ذخیره…" : editingId ? "ذخیرهٔ ویرایش" : "ثبت دسته"}
            </button>
            {editingId && (
              <button className={btnGhost} type="button" disabled={busy} onClick={() => { setEditingId(""); setDraft(EMPTY_CATEGORY); }}>
                انصراف
              </button>
            )}
          </div>
        </form>
      )}
      {!canWrite && <p className="text-sm text-ink-muted">این نشست فقط دسترسی خواندن دادههای مرجع دارد.</p>}
      {loading ? (
        <p role="status">در حال دریافت دستهبندیها…</p>
      ) : (
        <div className={tableWrapCls}>
          <table className="w-full text-sm">
            <caption className="sr-only">فهرست درختی دستهبندیها</caption>
            <thead>
              <tr>
                <th className={thCls}>مسیر / کد</th>
                <th className={thCls}>والد</th>
                <th className={thCls}>وضعیت</th>
                <th className={thCls}>استفاده</th>
                <th className={thCls}>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const depth = depths.get(row.id) ?? 0;
                return (
                  <tr key={row.id} className="border-t border-line">
                    <td className={tdCls} style={{ paddingInlineStart: `${Math.min(depth, 8) * 1.25 + 1}rem` }}>
                      {depth > 0 && <span aria-hidden="true" className="text-ink-subtle">└─ </span>}
                      <span className="sr-only">سطح {faNumber(depth)}: </span>
                      {row.name}
                      <bdi dir="ltr" className="font-mono text-xs text-ink-muted"> ({row.code})</bdi>
                    </td>
                    <td className={tdCls}>{row.parent_name ?? "—"}</td>
                    <td className={tdCls}><span className={activeToneCls(row.is_active !== false)}>{activeLabel(row.is_active !== false)}</span></td>
                    <td className={tdCls}>{faNumber(row.product_count ?? 0)} کالا / {faNumber(row.child_count ?? 0)} زیردسته</td>
                    <td className={tdCls}>
                      <div className="flex flex-wrap gap-1">
                        <button className={btnSmall} type="button" disabled={busy || detailLoading} onClick={() => void openDetail(row.id)}>جزئیات</button>
                        {canWrite && (
                          <>
                            <button className={btnSmall} type="button" disabled={busy} onClick={() => { setEditingId(row.id); setDraft({ code: row.code, name: row.name, name_latin: row.name_latin ?? "", parent_id: row.parent_id ?? "", is_active: row.is_active !== false }); setNotice(""); setError(""); }}>ویرایش</button>
                            <button className={btnSmall} type="button" disabled={busy} onClick={() => void toggle(row)}>{row.is_active === false ? "فعالسازی" : "غیرفعالسازی"}</button>
                            <button
                              className={btnDangerSmall}
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                setPending({
                                  kind: "category",
                                  id: row.id,
                                  label: categoryPathLabel(allRows.length > 0 ? allRows : rows, row.id),
                                  inUse: (row.product_count ?? 0) > 0 || (row.child_count ?? 0) > 0,
                                  usage: { products: row.product_count ?? 0, children: row.child_count ?? 0 },
                                  reassignOptions: parentOptions(allRows.length > 0 ? allRows : rows, row.id),
                                })
                              }
                            >
                              {(row.product_count ?? 0) > 0 || (row.child_count ?? 0) > 0 ? "حذف با انتساب…" : "حذف"}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {!loading && rows.length === 0 && <p className="text-sm text-ink-muted">هیچ دستهای با این فیلتر یافت نشد.</p>}
      <Pager offset={params.offset} total={total} limit={PAGE_SIZE} busy={loading || busy} onChange={go} />
      {detailLoading && <p role="status">در حال دریافت جزئیات…</p>}
      {detail && (
        <DetailShell title={`جزئیات دسته «${detail.name}»`} onClose={() => setDetail(null)}>
          <p className="mb-2 text-sm text-ink-muted">
            مسیر: {detail.ancestors.length > 0 ? detail.ancestors.map((a) => a.name).join(" › ") + " › " : ""}{detail.name}
          </p>
          <p className="mb-3 text-sm text-ink-muted">
            والد: {detail.parent_name ?? "ریشه"} · روش بهای تمامشده: {detail.cost_method ?? "—"} · کالاها: {faNumber(detail.product_count ?? 0)} · زیردستهها: {faNumber(detail.child_count ?? 0)}
          </p>
          {detail.children.length > 0 && (
            <>
              <h3 className="mb-2 text-sm font-medium">زیردستههای مستقیم</h3>
              <ul className="mb-3 flex flex-wrap gap-2 text-sm">
                {detail.children.map((c) => (
                  <li key={c.id} className="rounded border border-line px-2 py-1">{c.name}</li>
                ))}
              </ul>
            </>
          )}
          <h3 className="mb-2 text-sm font-medium">کالاهای متصل</h3>
          <ProductList products={detail.products} />
        </DetailShell>
      )}
      {pending && (
        <ConfirmDeleteDialog
          key={pending.id}
          pending={pending}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={(reassignTo) => void confirmDelete(reassignTo)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── تاریخچه ─────────────────────────── */

function HistoryPanel({ setError }: MessageSetters) {
  const [entityType, setEntityType] = useState("");
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<ReferenceAuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (kind: string, off: number) => {
      setLoading(true);
      setError("");
      try {
        const { data, error } = await api.GET("/reference-data/history", {
          params: {
            query: {
              ...(kind ? { entity_type: kind as "brand" | "uom" | "product_category" } : {}),
              limit: PAGE_SIZE,
              offset: off,
            },
          },
        });
        if (error) {
          setError(faError(error));
          return;
        }
        setRows(data?.items ?? []);
        setTotal(data?.total ?? 0);
      } catch {
        setError("ارتباط با سرور برقرار نشد.");
      } finally {
        setLoading(false);
      }
    },
    [setError],
  );

  useEffect(() => {
    void load("", 0);
  }, [load]);

  return (
    <div role="tabpanel" id="panel-history" aria-labelledby="tab-history" className="space-y-4">
      <form
        className={`${panelCls} flex flex-wrap items-end gap-3`}
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          void load(entityType, 0);
        }}
      >
        <label className="text-sm">
          نوع موجودیت
          <select className={`${selectCls} mt-1`} value={entityType} disabled={loading} onChange={(e) => { const v = e.target.value; setEntityType(v); setOffset(0); void load(v, 0); }}>
            <option value="">همه</option>
            <option value="brand">برند</option>
            <option value="uom">واحد اندازهگیری</option>
            <option value="product_category">دستهبندی کالا</option>
          </select>
        </label>
        <button className={btnGhost} type="submit" disabled={loading}>اعمال فیلتر</button>
      </form>
      {loading ? (
        <p role="status">در حال دریافت تاریخچه…</p>
      ) : (
        <div className={tableWrapCls}>
          <table className="w-full text-sm">
            <caption className="sr-only">تاریخچهٔ ممیزی دادههای مرجع</caption>
            <thead>
              <tr>
                <th className={thCls}>زمان</th>
                <th className={thCls}>عملیات</th>
                <th className={thCls}>موجودیت</th>
                <th className={thCls}>شناسه</th>
                <th className={thCls}>کاربر</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((event) => (
                <tr key={event.id} className="border-t border-line">
                  <td className={tdCls}>{formatAuditDate(event.at)}</td>
                  <td className={tdCls}>{ACTION_LABEL_FA[event.action] ?? event.action}</td>
                  <td className={tdCls}>{ENTITY_LABEL_FA[event.entity_type] ?? event.entity_type}</td>
                  <td className={tdCls}><bdi dir="ltr" className="font-mono text-xs">{event.entity_id ?? "—"}</bdi></td>
                  <td className={tdCls}><bdi dir="ltr" className="font-mono text-xs">{event.actor_user_id ?? "—"}</bdi></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {!loading && rows.length === 0 && <p className="text-sm text-ink-muted">رویداد ممیزی یافت نشد.</p>}
      <Pager
        offset={offset}
        total={total}
        limit={PAGE_SIZE}
        busy={loading}
        onChange={(next) => { setOffset(next); void load(entityType, next); }}
      />
    </div>
  );
}

/* ───────────────────────────── صفحه ───────────────────────────── */

export default function ReferenceDataPage() {
  const router = useRouter();
  const auth = useAuth();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<TabKey>("brands");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    setReady(true);
  }, [router]);

  const clearMessages = useCallback(() => {
    setNotice("");
    setError("");
  }, []);

  const onTabKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const index = TABS.findIndex((t) => t.key === tab);
    const next = e.key === "ArrowRight" ? (index + 1) % TABS.length : (index - 1 + TABS.length) % TABS.length;
    const key = TABS[next].key;
    setTab(key);
    clearMessages();
    document.getElementById(`tab-${key}`)?.focus();
  };

  if (!ready || auth.isLoading) return <AppLoader />;
  const canView = auth.hasPermission("master.product.view");
  const canWrite = auth.hasPermission("master.product.update");

  if (!canView) {
    return (
      <main dir="rtl" className="space-y-4">
        <h1 className="text-xl font-semibold">مدیریت دادههای مرجع کالا</h1>
        <p role="alert" className={errorCls}>مجوز مشاهدهٔ دادههای مرجع را ندارید.</p>
        <Link href="/products" className={btnGhost}>بازگشت به کاتالوگ</Link>
      </main>
    );
  }

  return (
    <main dir="rtl" className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">مدیریت دادههای مرجع کالا</h1>
          <p className="mt-1 text-sm text-ink-muted">
            برندها، واحدهای اندازهگیری و دستهبندی درختی — همان جداول کاتالوگ، با جستوجو،
            وضعیت، استفاده، تاریخچه و حذف امن. خواندن با مجوز master.product.view و نوشتن با
            master.product.update؛ هیچ مجوز یا دامنهٔ تازهای تعریف نشد.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/products/settings" className={btnGhost}>خانوادهها و گروهها</Link>
          <Link href="/products" className={btnGhost}>بازگشت به کاتالوگ</Link>
        </div>
      </header>

      {error && <p role="alert" className={errorCls}>{error}</p>}
      {notice && <p role="status" className={okCls}>{notice}</p>}

      <div role="tablist" aria-label="بخشهای داده مرجع" className="flex flex-wrap gap-1 rounded-xl border border-line bg-surface p-1" onKeyDown={onTabKeyDown}>
        {TABS.map((t) => (
          <button
            key={t.key}
            id={`tab-${t.key}`}
            role="tab"
            type="button"
            aria-selected={tab === t.key}
            aria-controls={`panel-${t.key}`}
            onClick={() => { setTab(t.key); clearMessages(); }}
            className={`rounded-lg px-4 py-2 text-sm transition-colors focus-ring ${tab === t.key ? "bg-info text-on-info font-medium" : "text-ink-muted hover:bg-surface-alt"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "brands" && <BrandsPanel canWrite={canWrite} setNotice={setNotice} setError={setError} />}
      {tab === "units" && <UnitsPanel canWrite={canWrite} setNotice={setNotice} setError={setError} />}
      {tab === "categories" && <CategoriesPanel canWrite={canWrite} setNotice={setNotice} setError={setError} />}
      {tab === "history" && <HistoryPanel setNotice={setNotice} setError={setError} />}
    </main>
  );
}
