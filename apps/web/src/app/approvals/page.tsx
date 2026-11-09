"use client";

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';
import { ApprovalRecord, dateLabel, entityLabels, statusLabels } from '@/components/approvals/ApprovalRecord';

type Row = { id: string; entity_type: string; entity_id: string; status: string; current_step: number; created_at: string };
export default function ApprovalsPage() {
  const [scope, setScope] = useState<'company' | 'submitted' | 'expired'>('company');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const requests = useQuery({ queryKey: ['approval-register', scope], queryFn: async () => {
    const path = scope === 'submitted' ? '/rules-engine/approvals/submitted' : scope === 'expired' ? '/rules-engine/approvals/expired' : '/rules-engine/approvals';
    const result = await api.GET(path);
    if (result.error) throw new Error(errorMessage(result.error));
    return (result.data ?? []) as Row[];
  } });
  const rows = (requests.data ?? []).filter(row => !status || row.status === status);
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-xl font-bold">درخواست‌های تأیید</h1><p className="mt-2 text-sm text-ink-muted">پیگیری گردش، سابقه تصمیم‌ها و نسخه ذخیره‌شده درخواست</p></div><nav className="flex flex-wrap gap-4 text-sm text-brand"><Link href="/approvals/inbox" className="underline focus-ring">کارتابل اقدام من</Link><Link href="/approvals/administration" className="underline focus-ring">نظارت بر تنظیمات</Link></nav></header>
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-line bg-surface p-4">
      <label>نمایش<select className="ms-2 rounded-lg border border-line bg-surface p-2 focus-ring" value={scope} onChange={e => { setScope(e.target.value as typeof scope); setSelected(null); }}><option value="company">درخواست‌های شرکت</option><option value="submitted">ارسال‌شده توسط من</option><option value="expired">منقضی / ارتقایافته</option></select></label>
      <label>وضعیت<select className="ms-2 rounded-lg border border-line bg-surface p-2 focus-ring" value={status} onChange={e => setStatus(e.target.value)}><option value="">همه وضعیت‌ها</option>{Object.entries(statusLabels).filter(([key]) => key !== 'returned').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <button className="rounded-lg border border-line px-3 py-2 focus-ring" onClick={() => void requests.refetch()}>به‌روزرسانی</button>
    </div>
    {requests.isPending && <p role="status">در حال بارگذاری درخواست‌ها…</p>}
    {requests.isError && <p role="alert" className="text-danger-ink">{requests.error.message} — برای تلاش دوباره «به‌روزرسانی» را بزنید.</p>}
    {!requests.isPending && !requests.isError && !rows.length && <div className="rounded-xl border border-line p-8 text-center text-ink-muted">درخواستی با این فیلتر وجود ندارد.</div>}
    <div className="grid items-start gap-6 xl:grid-cols-3">
      <section className="min-w-0 space-y-3" aria-label="فهرست درخواست‌ها">{rows.map(row => <button key={row.id} aria-pressed={selected === row.id} onClick={() => setSelected(row.id)} className={`w-full break-all rounded-xl border p-4 text-start focus-ring ${selected === row.id ? 'border-brand bg-brand-soft' : 'border-line bg-surface'}`}>
        <span className="flex flex-wrap justify-between gap-2 font-semibold"><span>{entityLabels[row.entity_type] ?? row.entity_type}</span><span className="text-sm">{statusLabels[row.status] ?? row.status}</span></span>
        <span className="mt-2 block text-xs text-ink-muted">{row.id}</span><span className="mt-2 block text-sm">مرحله {row.current_step.toLocaleString('fa-IR')} · {dateLabel(row.created_at)}</span>
      </button>)}</section>
      <section className="min-w-0 rounded-2xl border border-line bg-surface p-4 sm:p-6 xl:col-span-2">{selected ? <ApprovalRecord key={selected} id={selected} /> : <p className="py-8 text-center text-ink-muted">برای مشاهده مراحل و تاریخچه، یک درخواست را انتخاب کنید.</p>}</section>
    </div>
  </div>;
}
