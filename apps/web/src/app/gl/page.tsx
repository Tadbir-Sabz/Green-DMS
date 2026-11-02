"use client";

import Link from "next/link";
import { FinanceGuard } from "@/components/auth/guards";

/**
 * دفتر کل (GL). در فاز D زیرساخت حسابداری (AR/AP/Treasury/Cheques/Payments)
 * ساخته شد، اما اندپوینت پرس‌وجوی دفتر کل (journal/voucher) هنوز در قرارداد و
 * API پیاده نشده است. به‌جای جدول خالیِ گمراه‌کننده، وضعیت واقعی و مسیرهای
 * مالیِ موجود نشان داده می‌شود.
 */
export default function GLPage() {
  return (
    <FinanceGuard>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">دفتر کل</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            سند حسابداری، گردش حساب و تراز آزمایشی
          </p>
        </div>

        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <span aria-hidden className="text-amber-600 text-xl leading-none">⚠</span>
            <div className="text-sm text-amber-900 dark:text-amber-200">
              <p className="font-semibold mb-1">پرس‌وجوی دفتر کل هنوز فعال نشده است</p>
              <p className="leading-6">
                زیرساخت رویداد به سند (mapping) و تابع <code dir="ltr">fn_journal_balanced</code> در
                پایگاه‌داده آماده است، اما اندپوینت مرور ژورنال/دفتر کل در API پیاده‌سازی نشده.
                تا زمان فعال‌سازی، از ماژول‌های مالی زیر استفاده کنید که هم‌اکنون دادهٔ واقعی دارند:
              </p>
            </div>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { href: "/ar", title: "حساب‌های دریافتنی", desc: "ماندهٔ بدهکاری مشتریان و تحلیل سنی" },
            { href: "/ap", title: "حساب‌های پرداختنی", desc: "ماندهٔ بدهکاری به تأمین‌کنندگان" },
            { href: "/treasury", title: "خزانه‌داری", desc: "ماندهٔ صندوق/بانک و مغایرت‌گیری" },
            { href: "/reports/cash", title: "گزارش صندوق و بانک", desc: "گزارش دوره‌ای قابل خروجی" },
            { href: "/reports/ar", title: "گزارش دریافتنی", desc: "گزارش سنی بدهکاران" },
            { href: "/reports/ap", title: "گزارش پرداختنی", desc: "گزارش سنی بستانکاران" },
          ].map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-[#1f2937] rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="font-semibold text-slate-900 dark:text-slate-100">{c.title}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">{c.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </FinanceGuard>
  );
}
