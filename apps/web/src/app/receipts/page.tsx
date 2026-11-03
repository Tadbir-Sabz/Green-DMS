"use client";

import Link from "next/link";
import { WarehouseGuard } from "@/components/auth/guards";

/**
 * رسید خرید (GRN).
 *
 * نکتهٔ صادقانه: قرارداد API در حال حاضر هیچ پایانهٔ رسید خرید / GRN ندارد
 * (رسید در قرارداد فقط به معنای «رسید پرداخت» در خزانه و QueueJobReceipt است).
 * جریان خرید در این سامانه از طریق ماژول حساب‌های پرداختنی (AP) — قبوض تأمین‌کننده
 * و پرداخت‌ها — و اثر موجودی در انبار مدل می‌شود. بنابراین به‌جای ساخت دادهٔ
 * قلابی، این صفحه مسیرهای واقعی مرتبط را نشان می‌دهد و وضعیت را شفاف می‌گوید.
 */
function ReceiptsInner() {
  const links = [
    {
      href: "/ap",
      title: "حساب‌های پرداختنی (AP)",
      desc: "مانده و سنی بدهی تأمین‌کنندگان، قبوض خرید و پرداخت‌ها",
    },
    {
      href: "/warehouses",
      title: "انبارها و موجودی",
      desc: "موجودی لحظه‌ای، رسید/حواله انبار و انبارگردانی",
    },
    {
      href: "/treasury",
      title: "خزانه‌داری",
      desc: "رسیدهای پرداخت، صندوق و بانک، چک‌ها و مغایرت‌گیری",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">رسید خرید</h1>
        <p className="text-ink-muted text-sm">
          ثبت رسید کالای خریداری‌شده (GRN) و تطبیق با قبض تأمین‌کننده
        </p>
      </div>

      <div className="bg-warning-soft border border-warning/25 rounded-2xl p-5 text-sm text-warning-ink">
        <div className="font-semibold mb-1">ثبت رسید خرید هنوز در API فعال نشده است</div>
        <p className="leading-6">
          پایانهٔ اختصاصی «رسید خرید / GRN» در قرارداد فعلی وجود ندارد. جریان خرید از مسیر
          حساب‌های پرداختنی (قبض تأمین‌کننده و پرداخت) و اثر موجودی در انبار مدل می‌شود.
          برای جلوگیری از نمایش دادهٔ نادرست، این صفحه تا زمان افزودن پایانهٔ GRN به قرارداد،
          مسیرهای واقعی مرتبط را ارائه می‌دهد.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
          >
            <div className="font-semibold text-ink">{l.title}</div>
            <div className="text-sm text-ink-muted mt-1 leading-6">{l.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function ReceiptsPage() {
  return (
    <WarehouseGuard>
      <ReceiptsInner />
    </WarehouseGuard>
  );
}
