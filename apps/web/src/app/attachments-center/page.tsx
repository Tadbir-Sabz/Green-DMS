"use client";

import Link from "next/link";
import { Card, CardBody, SectionTitle } from "@/components/ui";

/**
 * مرکز ناوبری اسناد و ضمائم سازمانی (TASK-PM-02-C3).
 *
 * هدف: پیوستهدادن پنج ماژولی که همگی از **یک** قابلیت مشترک ضمائم استفاده
 * میکنند، بهجای پراکندن دکمههای آپلود بینهیچ مسیر روشن. هر کارت یک پیوند
 * واقعی به همان صفحهای است که پنل ضمائم در آن سوار شده است؛ هیچ کنترل
 * تزئینی، آپلودکنندهٔ جداگانه یا ادعای پشتیبانی نشده وجود ندارد.
 */

const IMPLEMENTED = [
  {
    label: "سفارش فروش",
    href: "/orders",
    use: "اسناد سفارش، مدرک تحویل و تصاویر همراه درخواست",
    detail: "پنل در صفحهٔ جزئیات هر سفارش",
  },
  {
    label: "فاکتور فروش",
    href: "/invoices",
    use: "نسخهٔ اسکن فاکتور، پیوستهای مؤدیان و مستندات پرداخت",
    detail: "ستون «ضمائم» روی هر ردیف فاکتور",
  },
  {
    label: "درخواست مرجوعی",
    href: "/returns",
    use: "تصاویر کالای آسیبدیده و شواهد دلیل مرجوعی",
    detail: "پنل جزئیات هر درخواست",
  },
  {
    label: "سند انبارگردانی",
    href: "/stock-count",
    use: "برگههای شمارش و شواهد تصویری مغایرت",
    detail: "ستون «ضمائم» روی هر سند شمارش",
  },
  {
    label: "سند حسابداری",
    href: "/gl",
    use: "مستندات پیوست سند و تأییدیههای حسابداری",
    detail: "پنل جزئیات سند در دفتر کل",
  },
] as const;

export default function AttachmentsCenterPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-xl font-bold text-ink">مرکز اسناد و ضمائم سازمانی</h1>
        <p className="mt-1 text-sm leading-6 text-ink-muted">
          همهٔ موجودیتهای زیر از یک قابلیت مشترک استفاده میکنند: مالک فقط از نشانی رکورد و
          نشست سرور مشتق میشود، مجوزهای <span dir="ltr">attachment.view/upload</span> در دو لایه
          بررسی میشوند، فایلها در آبجکتاستوریج با پیوند امضاشدهٔ کوتاهعمر نگهداری میشوند و
          آپلود و ممیزی در یک تراکنش ثبت میگردند.
        </p>
      </div>

      <Card>
        <CardBody>
          <SectionTitle>ماژولهای متصل</SectionTitle>
          <p className="mb-4 text-xs text-ink-subtle">
            برای مشاهده، بارگذاری یا دریافت فایل، روی نام ماژول بروید و رکورد موردنظر را انتخاب کنید.
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {IMPLEMENTED.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block h-full rounded-xl border border-line bg-surface p-4 shadow-xs transition-all hover:border-line-strong hover:shadow-sm focus-ring"
                >
                  <div className="font-semibold text-ink">{item.label}</div>
                  <div className="mt-1 text-[13px] leading-6 text-ink-muted">{item.use}</div>
                  <div className="mt-2 text-[11px] text-ink-subtle">{item.detail}</div>
                </Link>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <SectionTitle>مرزهای پشتیبانی</SectionTitle>
          <ul className="mt-2 space-y-2 text-[13px] leading-6 text-ink-muted">
            <li>
              <b className="text-ink">رسید پرداخت و مدرک تحویل (POD):</b> زنجیرهٔ مالکیت و
              لایهٔ مشترک بکاند پشتیبانی میکنند، ولی صفحهٔ مدیریت اختصاصیای برای نمایش
              پنل وجود ندارد؛ بنابراین در این نسخه UI اضافه نشده است.
            </li>
            <li>
              <b className="text-ink">کالا:</b> نمای محصولمحور جداگانه (تصویر اصلی خودکار) در
              تب «تصاویر و اسناد کالا» حفظ شده و تکرار نشده است.
            </li>
            <li>
              <b className="text-ink">برند، دسته، انبار و واحد اندازهگیری:</b> نوع مالک مصوب
              برای ضمائم نیستند؛ افزودنشان نیازمند تصمیم مالک است و انجام نشده است.
            </li>
            <li>
              حذف، بایگانی، انتخاب تصویر اصلی و سیاست نگهداشت در این نسخه تعریف نشدهاند؛
              کنترلی هم برایشان نمایش داده نمیشود.
            </li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
