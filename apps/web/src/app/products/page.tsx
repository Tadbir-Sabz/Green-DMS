'use client';

import { useCallback, useEffect, useState, useRef, type FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { api, getToken } from '@/lib/api';
import { AppLoader } from '@/components/AppShell';
import {
  type Category,
  type Product,
  type ScanResult,
  DIST_LABEL,
  STATUS_LABEL,
  btnGhost,
  btnPrimary,
  btnSmall,
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
} from './products-lib';

/**
 * فهرست کالاها — خانهٔ ماژولِ Product Master:
 *   GET  /products               فهرست با جست‌وجو/فیلتر (صفحه‌بندی cursor)
 *   GET  /products/scan/{code}   resolution قطعیِ اسکنِ بارکد/کد (H-1)
 * ورودی‌های عملیاتی به زیرصفحاتِ منسجم وصل‌اند:
 *   /products/new   ویزارد ساخت     ·  /products/import  ورود گروهی     ·  /products/{id}  جزئیات
 */

export default function ProductsPage(): React.JSX.Element {
  const router = useRouter();
  const auth = useAuth();
  const sort = useRef<'code_asc'|'code_desc'>('code_asc');
  const [ready, setReady] = useState(false);

  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [scan, setScan] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);

  const categoryName = useCallback(
    (id: string | null | undefined): string => {
      if (!id) return '—';
      return categories.find((c) => c.id === id)?.name ?? '—';
    },
    [categories],
  );

  const load = useCallback(async (query: string, st: string, cursor?: string) => {
    setLoading(true);
    setListError(null);
    const { data, error } = await api.GET('/products', {
      params: { query: { sort: sort.current, q: query || undefined, status: st || undefined, cursor: cursor ?? undefined, limit: 100 } },
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

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
    void load('', '');
    void api.GET('/product-categories').then(({ data }) => setCategories(data?.items ?? []));
  }, [router, load]);

  /** اسکنِ بارکد/کد — قطعی: یا به صفحهٔ کالا می‌رود یا پیامِ دقیق می‌دهد */
  const doScan = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const code = scan.trim();
    if (!code) return;
    setScanBusy(true);
    setScanMsg(null);
    const { data, error } = await api.GET('/products/scan/{code}', { params: { path: { code } } });
    setScanBusy(false);
    if (error) {
      const body = error as { code?: string; message_fa?: string };
      if ((error as { status?: number }) || body.code === 'ambiguous_scan') {
        setScanMsg(body.message_fa ?? 'چند کالا با این ورودی مطابقت دارد؛ کد را کامل‌تر وارد کنید.');
      } else {
        setScanMsg(body.message_fa ?? 'کالایی با این بارکد/کد یافت نشد.');
      }
      return;
    }
    const result = data as ScanResult;
    setNotice(`کالای «${result.product.name}» (${result.product.code}) از طریق ${result.matched_by === 'barcode' ? 'بارکد' : result.matched_by === 'code' ? 'کد' : 'نامِ جایگزین'} یافت شد.`);
    router.push(`/products/${result.product.id}`);
  };

  if (!ready) return <AppLoader />;

  return (
    <>
      {/* نوار ابزار: جست‌وجو + فیلتر + اسکن */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void load(q, status);
        }}
        className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4"
      >
        <label className="flex-1 text-sm">
          جست‌وجو (کد/نام)
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
              void load(q, e.target.value);
            }}
          >
            <option value="">همه</option>
            <option value="active">فعال</option>
            <option value="blocked">مسدود</option>
            <option value="discontinued">متوقف</option>
          </select>
        </label>
        <label className="text-sm">ترتیب کد<select className={`${selectCls} mt-1 w-40`} defaultValue="code_asc" onChange={e=>{sort.current=e.target.value as 'code_asc'|'code_desc';void load(q,status);}}><option value="code_asc">صعودی</option><option value="code_desc">نزولی</option></select></label>
        <button type="submit" className={btnGhost}>
          جست‌وجو
        </button>
      </form>

      {/* اسکنِ بارکد — ورودیِ اسکنرها مستقیم این‌جا می‌نشیند */}
      <form onSubmit={doScan} className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-info-line bg-info-soft p-4">
        <label className="flex-1 text-sm">
          اسکن یا ورودِ بارکد/کد
          <input
            className={`${inputCls} mt-1 font-mono`}
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            placeholder="بارکد را اسکن کنید یا کد را بنویسید…"
            autoComplete="off"
          />
        </label>
        <button type="submit" disabled={scanBusy || !scan.trim()} className={btnPrimary}>
          {scanBusy ? 'در حال جست‌وجو…' : 'یافتنِ کالا'}
        </button>
        {scanMsg && <p className="w-full text-sm text-danger-ink">{scanMsg}</p>}
      </form>

      <div className="mb-4 flex flex-wrap gap-3">
        <Link href="/products/settings" className={btnGhost}>خانواده‌ها و گروه‌ها</Link>
        {auth.hasPermission('master.product.create') && <Link href="/products/new" className={btnPrimary}>
          ＋ کالای جدید
        </Link>}
        {auth.hasPermission('master.product.import') && <Link href="/products/import" className={btnGhost}>
          ورودِ گروهی (CSV)
        </Link>}
      </div>

      {notice && <p className={`mb-4 ${okCls}`}>{notice}</p>}
      {listError && <p className={`mb-4 ${errorCls}`}>{listError}</p>}

      {/* جدول فهرست */}
      <div className={tableWrapCls}>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={thCls}>کد</th>
              <th className={thCls}>نام</th>
              <th className={thCls}>نام لاتین</th>
              <th className={thCls}>گروه</th>
              <th className={thCls}>وضعیت</th>
              <th className={thCls}>نوع توزیع</th>
              <th className={thCls}>حداقل سفارش</th>
              <th className={thCls}>عملیات</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className={`${tdCls} py-8 text-center text-ink-subtle`}>
                  در حال دریافت فهرست…
                </td>
              </tr>
            )}
            {!loading && items.length === 0 && (
              <tr>
                <td colSpan={8} className={`${tdCls} py-8 text-center text-ink-subtle`}>
                  کالایی یافت نشد
                </td>
              </tr>
            )}
            {!loading &&
              items.map((p) => (
                <tr key={p.id} className="border-t border-line hover:bg-surface-alt">
                  <td className={`${tdCls} font-mono text-xs`}>{p.code}</td>
                  <td className={tdCls}>{p.name}</td>
                  <td className={`${tdCls} text-ink-muted`} dir="ltr">
                    {p.name_latin ?? '—'}
                  </td>
                  <td className={`${tdCls} text-ink-muted`}>{categoryName(p.category_id)}</td>
                  <td className={tdCls}>
                    <span className={statusBadgeCls(p.status)}>{STATUS_LABEL[p.status] ?? p.status}</span>
                  </td>
                  <td className={`${tdCls} text-ink-muted`}>{DIST_LABEL[p.distribution_kind] ?? p.distribution_kind}</td>
                  <td className={tdCls}>{p.min_order_qty}</td>
                  <td className={tdCls}>
                    <Link href={`/products/${p.id}`} className={btnSmall}>
                      مشاهده و ویرایش
                    </Link>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-ink-subtle">
        <span>
          {items.length} کالا {nextCursor && '— صفحات بیشتری موجود است'}
        </span>
        {nextCursor && (
          <button onClick={() => void load(q, status, nextCursor)} disabled={loading} className={btnGhost}>
            {loading ? 'در حال دریافت…' : 'صفحه بعدی'}
          </button>
        )}
      </div>

      {/* راهنمای کوچکِ ماژول */}
      <p className={`${panelCls} mt-4 text-xs text-ink-muted`}>
        اسکنِ بارکد به‌صورت قطعی resolve می‌شود: بارکد ← کد ← نامِ جایگزین. برای ورودِ گروهی از «ورودِ گروهی (CSV)»
        استفاده کنید (اعتبارسنجی پیش از نوشتن). تغییرِ فیلدهای حساس (وضعیت، واحدِ پایه، ضریبِ تبدیل، اجزای بسته)
        نیازمندِ تأییدِ صریح است.
      </p>
    </>
  );
}
