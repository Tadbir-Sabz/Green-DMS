"use client";

import Link from "next/link";

export default function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">یکپارچه‌سازی‌ها</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">مؤدیان، درگاه پرداخت، وب‌هوک و صف‌ها</p>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {[
          { title: "سامانه مؤدیان", desc: "ثبت فاکتور، وضعیت و صف ارسال", href: "/integrations/moadian" },
          { title: "درگاه پرداخت (PSP)", desc: "پرداخت، وب‌هوک، تطبیق", href: "/integrations/psp" },
        ].map((card) => (
          <Link key={card.title} href={card.href} className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-[#1f2937] rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="font-semibold text-slate-900 dark:text-slate-100">{card.title}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">{card.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
