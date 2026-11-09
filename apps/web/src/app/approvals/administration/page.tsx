"use client";
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, errorMessage } from '@/lib/api';

export default function ApprovalAdministrationPage() {
  const policies = useQuery({ queryKey: ['approval-policy-inspection'], queryFn: async () => {
    const r = await api.GET('/rules-engine/approval-policies');
    if (!r.response.ok) throw new Error('دریافت تنظیمات مجاز نیست یا سرویس در دسترس نیست');
    return r.data ?? [];
  } });
  const chains = useQuery({ queryKey: ['approval-chain-inspection'], queryFn: async () => {
    const r = await api.GET('/rules-engine/approval-chains');
    if (!r.response.ok) throw new Error('دریافت تنظیمات مجاز نیست یا سرویس در دسترس نیست');
    return r.data ?? [];
  } });
  return <div className="space-y-6"><header><h1 className="text-xl font-bold">نظارت بر تنظیمات تأیید</h1><Link className="text-brand underline focus-ring" href="/approvals">پیگیری درخواست‌ها</Link></header>
    <p className="rounded-xl border border-warn-line bg-warn-soft p-4 text-sm leading-7">این صفحه فقط برای مشاهده است. ویرایش سیاست، دامنه، ریسک، نصاب افراد و معنای نقش/کارمند نیازمند تصمیم مالک است. غیرفعال بودن سیاست به معنی منع صریح نیست. زنجیره‌های SNAP نسخه ذخیره‌شده درخواست‌اند و نباید به عنوان تنظیمات تازه ویرایش شوند.</p>
    <button className="rounded-lg border border-line px-4 py-2 focus-ring" onClick={() => { void policies.refetch(); void chains.refetch(); }}>به‌روزرسانی تنظیمات</button>
    {(policies.isPending || chains.isPending) && <p role="status">در حال دریافت تنظیمات…</p>}
    {(policies.isError || chains.isError) && <p role="alert" className="text-danger-ink">{policies.error?.message ?? chains.error?.message}</p>}
    <section className="space-y-3"><h2 className="text-lg font-semibold">سیاست‌های ثبت‌شده</h2>{policies.isSuccess && !policies.data.length && <p>سیاستی ثبت نشده است.</p>}
      <div className="grid gap-3 md:grid-cols-2">{policies.data?.map(p => <article key={p.id} className="min-w-0 break-all rounded-xl border border-line bg-surface p-4 text-sm leading-7"><h3 className="font-semibold"><bdi>{p.operation}</bdi> · {p.is_active ? 'فعال' : 'غیرفعال'}</h3><p>سطح: {p.scope === 'central' ? 'مرکزی' : p.scope === 'domain' ? 'دامنه' : 'عملیات'}</p><p>بازه مبلغ: {p.min_amount ?? '—'} تا {p.max_amount ?? '—'}</p><p>شناسه سیاست: <bdi>{p.id}</bdi></p><p>زنجیره: <bdi>{p.approval_chain_id}</bdi></p><p>دامنه: <bdi>{p.domain_id ?? '—'}</bdi> · آستانه ریسک: {p.min_risk_score ?? '—'}</p><p>مهلت: {p.expires_in_hours ?? 'بدون محدودیت'} ساعت</p></article>)}</div>
    </section>
    <section className="space-y-3"><h2 className="text-lg font-semibold">زنجیره‌های پیکربندی‌شده</h2><p className="text-xs text-ink-muted">نسخه‌های SNAP در سابقه درخواست مربوط نمایش داده می‌شوند.</p>{chains.isSuccess && !chains.data.filter(c => !c.code?.startsWith('SNAP-')).length && <p>زنجیره پیکربندی‌شده‌ای وجود ندارد.</p>}
      <ul className="grid gap-3 md:grid-cols-2">{chains.data?.filter(c => !c.code?.startsWith('SNAP-')).map(c => <li key={c.id} className="break-all rounded-xl border border-line bg-surface p-4"><strong>{c.code}</strong><p>{c.entity}</p><p className="text-xs text-ink-muted"><bdi>{c.id}</bdi></p></li>)}</ul>
    </section>
  </div>;
}
