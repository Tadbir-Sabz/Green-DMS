"use client";

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';

export const statusLabels: Record<string, string> = { pending: 'در انتظار تصمیم', approved: 'تأیید شده', rejected: 'رد شده', cancelled: 'بسته / بازگردانده شده', expired: 'منقضی شده', returned: 'بازگردانی برای اصلاح' };
export const entityLabels: Record<string, string> = { sales_order: 'سفارش فروش', return_request: 'درخواست مرجوعی', purchase_order: 'سفارش خرید' };
export const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleString('fa-IR') : '—';
const field = 'break-all rounded-lg border border-line bg-surface-alt p-3 text-sm';

export function ApprovalRecord({ id }: { id: string }) {
  const record = useQuery({ queryKey: ['approval-record', id], queryFn: async () => {
    const res = await api.GET('/rules-engine/approvals/{id}', { params: { path: { id } } });
    if (res.error) throw new Error(errorMessage(res.error));
    if (!res.data) throw new Error('درخواست یافت نشد');
    return res.data;
  } });
  if (record.isPending) return <p role="status">در حال بارگذاری سابقه…</p>;
  if (record.isError) return <div role="alert" className="text-danger-ink">{record.error.message}<button className="ms-3 underline focus-ring" onClick={() => void record.refetch()}>تلاش دوباره</button></div>;
  const r = record.data;
  const binding = r.binding;
  const last = r.decisions?.at(-1);
  const documentUrl = r.entity_type === 'sales_order' ? `/orders/${r.entity_id}` : r.entity_type === 'return_request' ? `/returns/${r.entity_id}` : null;
  return <article className="min-w-0 space-y-5" aria-label="جزئیات و سابقه درخواست">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-bold">{entityLabels[r.entity_type ?? ''] ?? r.entity_type} · مرحله {r.current_step?.toLocaleString('fa-IR')}</h2>
      <span className="rounded-full bg-brand-soft px-3 py-1 text-sm">{binding?.superseded_at ? 'جایگزین شده' : statusLabels[r.status ?? ''] ?? r.status}</span>
    </div>
    <dl className="grid gap-3 sm:grid-cols-2">
      <div className={field}><dt className="text-ink-muted">شناسه درخواست</dt><dd dir="ltr">{r.id}</dd></div>
      <div className={field}><dt className="text-ink-muted">ثبت‌کننده</dt><dd dir="ltr">{r.requested_by}</dd></div>
      <div className={field}><dt className="text-ink-muted">مبلغ ثبت‌شده در سند</dt><dd>{r.amount ?? '—'}</dd></div>
      <div className={field}><dt className="text-ink-muted">ایجاد / مهلت</dt><dd>{dateLabel(r.created_at)} / {dateLabel(r.expires_at)}</dd></div>
      <div className={field}><dt className="text-ink-muted">سیاست حاکم هنگام ثبت</dt><dd dir="ltr">{r.policy_id ?? 'ثبت نشده'}</dd></div>
      <div className={field}><dt className="text-ink-muted">مصرف / جایگزینی اتصال</dt><dd>{dateLabel(binding?.consumed_at)} / {dateLabel(binding?.superseded_at)}</dd></div>
    </dl>
    <section className="space-y-2"><h3 className="font-semibold">مراحل ذخیره‌شده این درخواست</h3>
      <p className="text-xs text-ink-muted">این مراحل از زنجیره ذخیره‌شده درخواست خوانده می‌شوند، نه تنظیمات امروز. اطلاعات منبع فقط در صورت ثبت هنگام ایجاد نمایش داده می‌شود؛ سابقه قدیمی از تنظیمات امروز بازسازی نمی‌شود.</p>
      <ol className="grid gap-3 sm:grid-cols-2">{r.snapshot_steps?.map(step => <li key={step.step_no} className={field}>
        <strong>مرحله {step.step_no?.toLocaleString('fa-IR')} · {step.is_mandatory ? 'الزامی' : 'اختیاری'}</strong>
        <p>کارمند: <bdi>{step.approver_staff_id ?? '—'}</bdi></p><p>نقش: <bdi>{step.approver_role_id ?? '—'}</bdi></p>
        <p>بازه مبلغ: {step.min_amount ?? 'بدون حداقل'} تا {step.max_amount ?? 'بدون حداکثر'}</p>
      </li>)}</ol>{!r.snapshot_steps?.length && <p>مرحله ذخیره‌شده‌ای یافت نشد.</p>}
    </section>
    <section className="space-y-3"><h3 className="font-semibold">منشأ ترکیب سیاست‌ها</h3>
      {!r.policy_snapshot && <p className="text-ink-muted">منشأ ترکیب برای این سابقه ثبت نشده است؛ شناسه سیاست حاکم فهرست کامل منابع نیست.</p>}
      {r.policy_snapshot?.policies?.map(policy => <div className={field} key={policy.id}><p>سیاست: <bdi>{policy.id}</bdi> · {policy.scope === 'central' ? 'مرکزی' : policy.scope === 'domain' ? 'دامنه' : 'عملیات'}</p><p>زنجیره منبع: <bdi>{policy.approval_chain_id}</bdi></p><p>بازه مبلغ: {policy.min_amount ?? '—'} تا {policy.max_amount ?? '—'}</p></div>)}
      {r.policy_snapshot?.source_chains?.map(chain => <details className={field} key={chain.id}><summary className="cursor-pointer focus-ring">مراحل زنجیره منبع <bdi>{chain.id}</bdi></summary><ol className="mt-3 space-y-3">{chain.steps?.map((step, index) => <li key={index} className="rounded-lg border border-line p-3"><p>مرحله منبع {(index + 1).toLocaleString('fa-IR')} · {step.is_mandatory ? 'الزامی' : 'اختیاری'}</p><p>کارمند: <bdi>{step.approver_staff_id ?? '—'}</bdi></p><p>نقش: <bdi>{step.approver_role_id ?? '—'}</bdi></p><p>بازه مبلغ: {step.min_amount ?? '—'} تا {step.max_amount ?? '—'}</p></li>)}</ol></details>)}
    </section>
    <section className="space-y-3"><h3 className="font-semibold">تاریخچه تغییرناپذیر تصمیم‌ها</h3>
      {!r.decisions?.length && <p className="text-ink-muted">هنوز تصمیمی ثبت نشده است.</p>}
      <ol className="space-y-3">{r.decisions?.map((decision, index) => <li key={`${decision.step_no}-${index}`} className={field}>
        <p className="font-medium">مرحله {decision.step_no?.toLocaleString('fa-IR')} · {statusLabels[decision.decision ?? ''] ?? decision.decision}</p>
        <p>تصمیم‌گیرنده: <bdi>{decision.decided_by}</bdi></p>
        <p>{decision.meta?.delegated_from ? <>به نمایندگی از: <bdi>{decision.meta.delegated_from}</bdi></> : 'بدون نمایندگی ثبت‌شده'}</p>
        <time>{dateLabel(decision.decided_at)}</time><p className="whitespace-pre-wrap">{decision.comment || 'بدون توضیح'}</p>
      </li>)}</ol>
    </section>
    <div className="rounded-xl border border-line p-4 text-sm leading-7">
      {r.status === 'pending' && !binding?.superseded_at ? <Link className="text-brand underline focus-ring" href="/approvals/inbox">بررسی امکان تصمیم در کارتابل من</Link> : <p>این سابقه قابل بازنویسی نیست. تصمیم یا درخواست قبلی دوباره باز نمی‌شود.</p>}
      {documentUrl && <p><Link className="text-brand underline focus-ring" href={documentUrl}>مشاهده سند و ارسال درخواست تازه پس از اصلاح</Link></p>}
      {!documentUrl && <p>ارسال مجدد فقط از مسیر مجاز ماژول مالک سند انجام می‌شود؛ این صفحه سند یا اتصال تازه نمی‌سازد.</p>}
      {last?.decision === 'returned' && <p>درخواست برای اصلاح بازگردانده شده است؛ پس از اصلاح، درخواست تازه با تصمیم‌های تازه لازم است.</p>}
    </div>
  </article>;
}
