"use client";
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ApprovalRecord } from '@/components/approvals/ApprovalRecord';
export default function ApprovalDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <div className="space-y-5"><header className="flex flex-wrap justify-between gap-3"><h1 className="text-xl font-bold">سابقه درخواست تأیید</h1><Link className="text-brand underline focus-ring" href="/approvals">بازگشت به پیگیری درخواست‌ها</Link></header><div className="rounded-2xl border border-line bg-surface p-4 sm:p-6"><ApprovalRecord id={id} /></div></div>;
}
