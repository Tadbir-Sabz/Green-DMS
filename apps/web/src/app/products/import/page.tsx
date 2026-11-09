'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { api, getToken } from '@/lib/api';
import { AppLoader } from '@/components/AppShell';
import {
  type ImportResult,
  type ImportValidationResult,
  type RowIssue,
  btnGhost,
  btnPrimary,
  errorCls,
  faError,
  formPanelCls,
  inputCls,
  okCls,
  panelCls,
  selectCls,
  tableWrapCls,
  tdCls,
  thCls,
  warnCls,
} from '../products-lib';

/**
 * ویزاردِ ورودِ گروهیِ کالا (§E — اعتبارسنجی پیش از نوشتن):
 *   POST /products/import/validate   — پیش‌نمایشِ ردیف‌به‌ردیف بدونِ نوشتن
 *   POST /products/import/commit    — اجرای idempotent با کلیدِ یکتا + audit (M-5 برای فیلدهای حساس)
 *   GET  /products/import/report/{id} — گزارشِ import انجام‌شده
 */

const SAMPLE_CSV = `code,name,category_code,base_uom_code,barcode,min_order_qty
SKU-1001,شیر پرچرب پگاه,DAIRY,pcs,6261000000001,1
,ماست دبه‌ای یک‌لیتری,DAIRY,pcs,,2`;

export default function ImportPage(): React.JSX.Element {
  const router = useRouter();
  const auth = useAuth();
  const [ready, setReady] = useState(false);

  const [csv, setCsv] = useState('');
  const [mode, setMode] = useState<'create' | 'update' | 'upsert'>('create');
  const [confirmSensitive, setConfirmSensitive] = useState(false);

  const [validation, setValidation] = useState<ImportValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    setReady(true);
  }, [router]);

  const onFile = (file: File): void => {
    const reader = new FileReader();
    reader.onload = () => {
      setCsv(String(reader.result ?? ''));
      setValidation(null);
      setResult(null);
    };
    reader.readAsText(file, 'utf-8');
  };

  const validate = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setErr(null);
    setResult(null);
    setValidating(true);
    const { data, error } = await api.POST('/products/import/validate', { body: { csv } });
    setValidating(false);
    if (error) {
      setValidation(null);
      setErr(faError(error));
      return;
    }
    setValidation(data ?? null);
  };

  const commit = async (): Promise<void> => {
    setErr(null);
    setCommitting(true);
    const { data, error } = await api.POST('/products/import/commit', {
      body: {
        csv,
        mode,
        // کلیدِ یکتا: ازدحام دوبارهٔ همان فایل، import تکراری نمی‌سازد
        idempotency_key: crypto.randomUUID(),
        confirm_sensitive: confirmSensitive || undefined,
      },
    });
    setCommitting(false);
    if (error) {
      setErr(faError(error));
      return;
    }
    setResult(data ?? null);
  };

  const loadReport = async (importId: string): Promise<void> => {
    setErr(null);
    const { data, error } = await api.GET('/products/import/report/{id}', { params: { path: { id: importId } } });
    if (error) {
      setErr(faError(error));
      return;
    }
    setResult((data as ImportResult) ?? null);
  };

  if (!ready || auth.isLoading) return <AppLoader />;
  if (!auth.hasPermission('master.product.import')) return <section className={panelCls}><p role="alert">مجوز این عملیات را ندارید.</p><Link href="/products" className={btnGhost}>بازگشت به کاتالوگ</Link></section>;

  const rowIssues: RowIssue[] = validation ? [...validation.row_errors, ...validation.warnings] : [];
  const validationOk = validation != null && validation.row_errors.length === 0;

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">ورودِ گروهیِ کالا (CSV)</h1>
        <Link href="/products" className={btnGhost}>
          بازگشت به فهرست
        </Link>
      </div>

      {/* گام ۱ — ورودی */}
      <form onSubmit={validate} className={`${formPanelCls} mb-5`}>
        <h2 className="mb-3 font-semibold">گام ۱ — فایل یا متنِ CSV</h2>
        <p className="mb-3 text-xs text-ink-muted">
          ستون‌های شناخته‌شده: <span className="font-mono" dir="ltr">code, name, name_latin, category_code, base_uom_code, brand_name, tax_code, barcode, status, min_order_qty</span>
          {' — '}سرستون‌های فارسی («کد کالا»، «نام»، «گروه»، «واحد»، …) هم پذیرفته می‌شوند. حداکثر ۱۰٬۰۰۰ ردیف.
          ردیفِ بدونِ <span className="font-mono" dir="ltr">category_code</span> یا <span className="font-mono" dir="ltr">base_uom_code</span> خطا می‌گیرد.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
          <label className="text-sm">
            حالتِ اجرا
            <select className={`${selectCls} mt-1 w-40`} value={mode} onChange={(e) => setMode(e.target.value as 'create' | 'update' | 'upsert')}>
              <option value="create">فقط ساخت (create)</option>
              <option value="update">فقط به‌روزرسانی (update)</option>
              <option value="upsert">ساخت/به‌روزرسانی (upsert)</option>
            </select>
          </label>
          <button type="button" className={btnGhost} onClick={() => setCsv(SAMPLE_CSV)}>
            درجِ نمونه
          </button>
        </div>
        <label className="mt-3 block text-sm">
          متنِ CSV
          <textarea
            className={`${inputCls} mt-1 h-48 whitespace-pre font-mono text-xs`}
            dir="ltr"
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setValidation(null);
              setResult(null);
            }}
            placeholder="code,name,category_code,base_uom_code,…"
          />
        </label>
        <div className="mt-4 flex gap-3">
          <button type="submit" disabled={validating || !csv.trim()} className={btnPrimary}>
            {validating ? 'در حال اعتبارسنجی…' : 'اعتبارسنجی (بدونِ نوشتن)'}
          </button>
        </div>
      </form>

      {err && <p className={`mb-4 ${errorCls}`}>{err}</p>}

      {/* گام ۲ — گزارشِ اعتبارسنجی */}
      {validation && (
        <section className={`${panelCls} mb-5`}>
          <h2 className="mb-3 font-semibold">گام ۲ — نتیجهٔ اعتبارسنجی</h2>
          <p className="mb-2 text-sm">
            {validation.rows.length} ردیف داده · {validation.row_errors.length} خطا · {validation.warnings.length} هشدار
          </p>
          {validationOk ? (
            <p className={`mb-3 ${okCls}`}>همهٔ ردیف‌ها معتبرند؛ می‌توانید ثبتِ نهایی را اجرا کنید.</p>
          ) : (
            <p className={`mb-3 ${errorCls}`}>تا رفعِ خطاهای ردیف‌ها، ثبتِ نهایی ممکن نیست (validate-before-persist).</p>
          )}

          {rowIssues.length > 0 && (
            <div className={tableWrapCls}>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={thCls}>ردیف</th>
                    <th className={thCls}>نوع</th>
                    <th className={thCls}>کد خطا</th>
                    <th className={thCls}>توضیح</th>
                  </tr>
                </thead>
                <tbody>
                  {rowIssues.map((issue, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className={tdCls}>{issue.row ?? '—'}</td>
                      <td className={tdCls}>{i < validation.row_errors.length ? 'خطا' : 'هشدار'}</td>
                      <td className={`${tdCls} font-mono text-xs`} dir="ltr">
                        {issue.code ?? '—'}
                      </td>
                      <td className={tdCls}>{issue.message_fa ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* گام ۳ — ثبتِ نهایی */}
          <div className="mt-4">
            <label className="mb-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={confirmSensitive} onChange={(e) => setConfirmSensitive(e.target.checked)} />
              ردیف‌های دارایِ فیلدِ حساس (M-5) را نیز با تأییدِ صریح اجرا کن
            </label>
            <div className="flex gap-3">
              <button onClick={() => void commit()} disabled={committing || !validationOk} className={btnPrimary}>
                {committing ? 'در حال اجرا…' : 'ثبتِ نهایی'}
              </button>
              <button onClick={() => setConfirmSensitive(true)} disabled={committing || !validationOk} className={btnGhost}>
                ثبتِ نهایی با تأییدِ فیلدهای حساس
              </button>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              اجرا idempotent است: تکرارِ همان درخواست (کلیدِ یکتا) import تکراری نمی‌سازد. هر دسته یا کامل اعمال می‌شود یا
              هیچ (همه‌یاهیچ)؛ ردیف‌های ناموفق در گزارش می‌مانند و پایگاه‌داده خراب نمی‌شود.
            </p>
          </div>
        </section>
      )}

      {/* نتیجهٔ اجرا */}
      {result && (
        <section className={`${panelCls} mb-5`}>
          <h2 className="mb-3 font-semibold">نتیجهٔ اجرا</h2>
          {result.idempotent_replay && <p className={`mb-2 ${warnCls}`}>این درخواست قبلاً اجرا شده بود (پخشِ تکراری)؛ نتیجهٔ همان اجرای قبلی بازگردانده شد.</p>}
          <div className="mb-3 flex flex-wrap gap-4 text-sm">
            <span>کل ردیف‌ها: <b>{result.total_rows}</b></span>
            <span className="text-success-ink">ساخته‌شده: <b>{result.created_rows}</b></span>
            <span className="text-info-ink">به‌روزشده: <b>{result.updated_rows}</b></span>
            <span className="text-danger-ink">ناموفق: <b>{result.failed_rows}</b></span>
          </div>
          <p className="mb-3 text-xs text-ink-muted">
            شناسهٔ import: <span className="font-mono" dir="ltr">{result.import_id}</span>
            {' — '}
            <button className="underline" onClick={() => void loadReport(result.import_id)}>
              دریافتِ گزارشِ کامل
            </button>
          </p>
          {result.errors.length > 0 && (
            <div className={tableWrapCls}>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={thCls}>ردیف</th>
                    <th className={thCls}>کد خطا</th>
                    <th className={thCls}>توضیح</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((issue, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className={tdCls}>{issue.row ?? '—'}</td>
                      <td className={`${tdCls} font-mono text-xs`} dir="ltr">
                        {issue.code ?? '—'}
                      </td>
                      <td className={tdCls}>{issue.message_fa ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4">
            <Link href="/products" className={btnPrimary}>
              رفتن به فهرستِ کالاها
            </Link>
          </div>
        </section>
      )}
    </>
  );
}
