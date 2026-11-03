'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { components } from '@dms/api-client';
import { api, errorMessage, getToken } from '@/lib/api';
import { AppLoader } from '@/components/AppShell';

/**
 * فهرست و فرم اشخاص (حقیقی/حقوقی) — همه فراخوانی‌ها با کلاینت تایپ‌شده از openapi.yaml:
 *   GET    /persons             فهرست با جست‌وجوی فازی + فیلتر نوع شخص (cursor)
 *   POST   /persons             ساخت شخص
 *   PATCH  /persons/{id}        ویرایش و غیرفعال/فعال‌سازی (is_active)
 * قاعده نام سمت سرور است: حقوقی legal_name می‌خواهد، حقیقی دست‌کم نام یا نام خانوادگی؛
 * خطای آن با details.fields برمی‌گردد و کنار همان فیلد نمایش داده می‌شود.
 */

type Person = components['schemas']['Person'];
/** پاسخ سرور همیشه id و created_at را دارد (در سند readOnly هستند، پس در تایپ اختیاری‌اند) */
type PersonItem = Person & { id: string; created_at: string };
type FieldErrors = Record<string, string[]>;

const EMPTY_FORM = {
  code: '',
  legal_type: 'natural' as 'natural' | 'legal',
  first_name: '',
  last_name: '',
  legal_name: '',
  national_id: '',
  economic_code: '',
  is_active: true,
};

const displayName = (p: Person): string =>
  p.legal_type === 'legal'
    ? (p.legal_name ?? '—')
    : [p.first_name, p.last_name].filter(Boolean).join(' ') || '—';

export default function PersonsPage(): React.JSX.Element {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const [items, setItems] = useState<PersonItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [legalType, setLegalType] = useState('');

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(
    async (query: string, type: string, cursor?: string) => {
      setLoading(true);
      setListError(null);
      const { data, error } = await api.GET('/persons', {
        // openapi-fetch 0.17: پارامترهای query باید داخل params.query باشند؛
        // نوشتنِ query در سطح بالا بی‌صدا نادیده گرفته می‌شود و فیلترها به سرور نمی‌رسند.
        params: {
          query: {
            q: query || undefined,
            legal_type: (type || undefined) as 'natural' | 'legal' | undefined,
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
      const pageItems = (data?.items ?? []) as PersonItem[];
      // صفحهٔ بعدی به انتهای فهرست می‌چسبد (ادامهٔ cursor در قرارداد)
      setItems((prev) => (cursor ? [...prev, ...pageItems] : pageItems));
      setNextCursor(data?.has_more ? (data?.next_cursor ?? null) : null);
    },
    [],
  );

  // نگهبان ورود: بدون توکن به صفحه ورود
  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
    void load('', '');
  }, [router, load]);

  const openCreate = (): void => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFieldErrors({});
    setShowForm(true);
  };

  const openEdit = (p: PersonItem): void => {
    setEditId(p.id);
    setForm({
      code: p.code,
      legal_type: (p.legal_type as 'natural' | 'legal') ?? 'natural',
      first_name: p.first_name ?? '',
      last_name: p.last_name ?? '',
      legal_name: p.legal_name ?? '',
      national_id: p.national_id ?? '',
      economic_code: p.economic_code ?? '',
      is_active: p.is_active ?? true,
    });
    setFormError(null);
    setFieldErrors({});
    setShowForm(true);
  };

  const submitForm = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    setFieldErrors({});

    const body: components['schemas']['Person'] = {
      code: form.code.trim(),
      legal_type: form.legal_type,
      ...(form.first_name.trim() ? { first_name: form.first_name.trim() } : {}),
      ...(form.last_name.trim() ? { last_name: form.last_name.trim() } : {}),
      ...(form.legal_name.trim() ? { legal_name: form.legal_name.trim() } : {}),
      ...(form.national_id.trim() ? { national_id: form.national_id.trim() } : {}),
      ...(form.economic_code.trim() ? { economic_code: form.economic_code.trim() } : {}),
      is_active: form.is_active,
    };

    const { data, error } = editId
      ? await api.PATCH('/persons/{id}', { params: { path: { id: editId } }, body })
      : await api.POST('/persons', { body });

    setSaving(false);
    if (error || !data) {
      const err = error as
        | { message_fa?: string; details?: { fields?: FieldErrors } }
        | undefined;
      setFormError(err?.message_fa ?? errorMessage(error));
      setFieldErrors(err?.details?.fields ?? {});
      return;
    }

    setShowForm(false);
    setNotice(
      editId
        ? `شخص «${displayName(data)}» بروزرسانی شد.`
        : `شخص «${displayName(data)}» با کد ${data.code} ثبت شد.`,
    );
    await load(q, legalType);
  };

  const toggleActive = async (p: PersonItem): Promise<void> => {
    setNotice(null);
    setListError(null);
    const { error } = await api.PATCH('/persons/{id}', {
      params: { path: { id: p.id } },
      // قرارداد، بدنه PATCH را همان Person می‌خواهد؛ فیلدهای نیامده سمت سور ادغام می‌شوند
      body: {
        code: p.code,
        legal_type: (p.legal_type as 'natural' | 'legal') ?? 'natural',
        is_active: !p.is_active,
      },
    });
    if (error) setListError(errorMessage(error));
    else setNotice(`وضعیت «${displayName(p)}» → ${p.is_active ? 'غیرفعال' : 'فعال'}`);
    await load(q, legalType);
  };

  if (!ready) return <AppLoader />;

  const err = (name: string): string | undefined =>
    fieldErrors[name]?.join('، ');

  return (
    <>
      {/* نوار ابزار: جست‌وجو + فیلتر نوع + ساخت */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setItems([]);
          void load(q, legalType);
        }}
        className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4"
      >
        <label className="flex-1 text-sm">
          جست‌وجو (کد/نام/شناسه ملی)
          <input
            className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2 focus:border-info focus:outline-none"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="مثلاً علی رضایی یا P-100"
          />
        </label>
        <label className="text-sm">
          نوع شخص
          <select
            className="mt-1 w-44 rounded-lg border border-line-strong px-3 py-2"
            value={legalType}
            onChange={(e) => {
              setLegalType(e.target.value);
              setItems([]);
              void load(q, e.target.value);
            }}
          >
            <option value="">همه</option>
            <option value="natural">حقیقی</option>
            <option value="legal">حقوقی</option>
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
          onClick={openCreate}
          className="rounded-lg bg-info px-4 py-2 text-sm font-medium text-white hover:bg-info"
        >
          + شخص جدید
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

      {/* فرم ساخت/ویرایش */}
      {showForm && (
        <form
          onSubmit={submitForm}
          className="mb-6 rounded-xl border border-info/25 bg-info-soft/40 p-5"
        >
          <h2 className="mb-4 font-semibold">
            {editId ? 'ویرایش شخص' : 'شخص جدید'}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm">
              کد شخص *
              <input
                className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2"
                value={form.code}
                maxLength={64}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                required
              />
              {err('code') && (
                <span className="mt-1 block text-xs text-danger-ink">{err('code')}</span>
              )}
            </label>
            <label className="text-sm">
              نوع شخص *
              <select
                className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2"
                value={form.legal_type}
                onChange={(e) =>
                  setForm({
                    ...form,
                    legal_type: e.target.value as 'natural' | 'legal',
                  })
                }
              >
                <option value="natural">حقیقی</option>
                <option value="legal">حقوقی</option>
              </select>
            </label>

            {form.legal_type === 'legal' ? (
              <label className="text-sm">
                نام حقوقی *
                <input
                  className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2"
                  value={form.legal_name}
                  maxLength={255}
                  onChange={(e) => setForm({ ...form, legal_name: e.target.value })}
                  required
                />
                {err('legal_name') && (
                  <span className="mt-1 block text-xs text-danger-ink">
                    {err('legal_name')}
                  </span>
                )}
              </label>
            ) : (
              <>
                <label className="text-sm">
                  نام
                  <input
                    className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2"
                    value={form.first_name}
                    maxLength={128}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  />
                  {err('first_name') && (
                    <span className="mt-1 block text-xs text-danger-ink">
                      {err('first_name')}
                    </span>
                  )}
                </label>
                <label className="text-sm">
                  نام خانوادگی
                  <input
                    className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2"
                    value={form.last_name}
                    maxLength={128}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  />
                  {err('last_name') && (
                    <span className="mt-1 block text-xs text-danger-ink">
                      {err('last_name')}
                    </span>
                  )}
                </label>
              </>
            )}

            <label className="text-sm">
              شناسه ملی
              <input
                className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2"
                value={form.national_id}
                maxLength={10}
                inputMode="numeric"
                onChange={(e) => setForm({ ...form, national_id: e.target.value })}
              />
              {err('national_id') && (
                <span className="mt-1 block text-xs text-danger-ink">
                  {err('national_id')}
                </span>
              )}
            </label>

            {form.legal_type === 'legal' && (
              <label className="text-sm">
                کد اقتصادی
                <input
                  className="mt-1 w-full rounded-lg border border-line-strong px-3 py-2"
                  value={form.economic_code}
                  maxLength={20}
                  onChange={(e) => setForm({ ...form, economic_code: e.target.value })}
                />
                {err('economic_code') && (
                  <span className="mt-1 block text-xs text-danger-ink">
                    {err('economic_code')}
                  </span>
                )}
              </label>
            )}

            <label className="mt-6 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              فعال
            </label>
          </div>

          {/* قاعده نام سمت سرور وقتی هیچ فیلدی مشخص نشده باشد */}
          {formError && (
            <p className="mt-4 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger-ink">
              {formError}
            </p>
          )}

          <div className="mt-5 flex gap-3">
            <button
              type="submit"
              disabled={saving || !form.code.trim()}
              className="rounded-lg bg-info px-5 py-2 text-sm font-medium text-white hover:bg-info disabled:opacity-50"
            >
              {saving ? 'در حال ثبت…' : editId ? 'ذخیره تغییرات' : 'ثبت شخص'}
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
              <th className="px-4 py-3 font-medium">نوع</th>
              <th className="px-4 py-3 font-medium">شناسه ملی / کد اقتصادی</th>
              <th className="px-4 py-3 font-medium">وضعیت</th>
              <th className="px-4 py-3 font-medium">تاریخ ثبت</th>
              <th className="px-4 py-3 font-medium">عملیات</th>
            </tr>
          </thead>
          <tbody>
            {loading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-subtle">
                  در حال دریافت فهرست…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-ink-subtle">
                  شخصی یافت نشد
                </td>
              </tr>
            )}
            {items.map((p) => (
              <tr key={p.id} className="border-t border-line hover:bg-surface-alt/60">
                <td className="px-4 py-3 font-mono text-xs">{p.code}</td>
                <td className="px-4 py-3">{displayName(p)}</td>
                <td className="px-4 py-3 text-ink-muted">
                  {p.legal_type === 'legal' ? 'حقوقی' : 'حقیقی'}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-ink-muted">
                  {p.legal_type === 'legal'
                    ? (p.economic_code ?? '—')
                    : (p.national_id ?? '—')}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${ p.is_active ? 'bg-brand-soft text-success-ink' : 'bg-surface-alt text-ink-muted' }`}
                  >
                    {p.is_active ? 'فعال' : 'غیرفعال'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-ink-subtle">
                  {new Date(p.created_at).toLocaleDateString('fa-IR')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEdit(p)}
                      className="rounded border border-line-strong px-2 py-1 text-xs hover:bg-surface"
                    >
                      ویرایش
                    </button>
                    <button
                      onClick={() => void toggleActive(p)}
                      className="rounded border border-line-strong px-2 py-1 text-xs hover:bg-surface"
                    >
                      {p.is_active ? 'غیرفعال کن' : 'فعال کن'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-ink-subtle">
        <span>{items.length} شخص</span>
        {nextCursor && (
          <button
            onClick={() => void load(q, legalType, nextCursor)}
            className="rounded-lg border border-line-strong px-3 py-1.5 text-ink-muted hover:bg-surface"
          >
            بارگذاری موارد بعدی…
          </button>
        )}
      </div>
    </>
  );
}
