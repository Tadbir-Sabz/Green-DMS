"use client";

import Link from "next/link";
import { useTheme } from "@/components/theme/ThemeProvider";
import { useState } from "react";

const modules = [
  { title: "داشبورد", desc: "KPIها، فروش روزانه، عملکرد", href: "/", color: "from-emerald-500 to-green-600" },
  { title: "سفارشات فروش", desc: "ثبت، تایید، قیمت‌گذاری", href: "/orders", color: "from-blue-500 to-cyan-600" },
  { title: "مشتریان", desc: "تعریف، اعتبار، موقعیت", href: "/customers", color: "from-violet-500 to-purple-600" },
  { title: "کالاها و قیمت", desc: "محصول، بسته‌بندی، قیمت‌گذاری", href: "/products", color: "from-amber-500 to-orange-600" },
  { title: "موجودی انبار", desc: "موجودی، انتقال بین انباری", href: "/warehouses", color: "from-teal-500 to-emerald-600" },
  { title: "انبارگردانی", desc: "برنامه، شمارش، تعدیل", href: "/stock-count", color: "from-lime-500 to-green-600" },
  { title: "حساب‌های دریافتنی", desc: "تحلیل سنی، وصول", href: "/ar", color: "from-rose-500 to-pink-600" },
  { title: "حساب‌های پرداختنی", desc: "فاکتور، پرداخت", href: "/ap", color: "from-red-500 to-rose-600" },
  { title: "خزانه‌داری", desc: "صندوق، بانک، چک", href: "/treasury", color: "from-indigo-500 to-blue-600" },
  { title: "دفتر کل", desc: "سند، تراز", href: "/gl", color: "from-sky-500 to-cyan-600" },
  { title: "رهگیری زنده", desc: "موقعیت فروشندگان", href: "/tracking", color: "from-fuchsia-500 to-pink-600" },
  { title: "گزارشات", desc: "فروش، موجودی، مالی", href: "/reports/sales", color: "from-orange-500 to-amber-600" },
];

export default function DemoPage() {
  const { theme } = useTheme();
  const [active, setActive] = useState(0);

  return (
    <div className="space-y-8">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand via-brand to-brand-active text-white p-8">
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold">دموی سیستم Green-DMS</h1>
              <p className="mt-2 opacity-90">سامانه یکپارچه فروش، پخش، انبار، مالی و ردیابی میدانی</p>
            </div>
            <div className="hidden md:block text-left">
              <div className="text-sm opacity-80">حالت نمایش</div>
              <div className="text-lg font-semibold">{theme === "dark" ? "تاریک" : "روشن"}</div>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/" className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur">ورود به داشبورد</Link>
            <Link href="/orders" className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur">شروع ثبت سفارش</Link>
            <Link href="/tracking" className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur">رهگیری زنده</Link>
          </div>
        </div>
        <div className="absolute -top-10 -left-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
        <div className="absolute -bottom-10 -right-10 w-60 h-60 bg-white/10 rounded-full blur-3xl"></div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-ink">ماژول‌های سیستم</h2>
          <div className="text-sm text-ink-muted">انتخاب و ورود سریع</div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {modules.map((m, idx) => (
            <Link
              key={m.title}
              href={m.href}
              onMouseEnter={() => setActive(idx)}
              className="group relative overflow-hidden bg-surface border border-line rounded-2xl p-5 shadow-sm hover:shadow-lg transition-all"
            >
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${m.color}`}></div>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-ink">{m.title}</div>
                  <div className="text-sm text-ink-muted mt-1">{m.desc}</div>
                </div>
                <div className="w-9 h-9 rounded-xl bg-surface-alt group-hover:scale-110 transition-transform flex items-center justify-center">→</div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <div className="font-semibold text-ink mb-3">ویژگی‌های برجسته</div>
          <ul className="space-y-2 text-sm text-ink">
            <li>• قراردادمحور با OpenAPI و کلاینت خودکار</li>
            <li>• RBAC، احراز هویت و گارد مسیرها</li>
            <li>• موتور قوانین و گردش‌کار تأیید</li>
            <li>• ردیابی زنده با WebSocket + PostGIS</li>
            <li>• گزارش‌های تحلیلی از Materialized View</li>
            <li>• یکپارچه‌سازی مؤدیان و درگاه پرداخت</li>
          </ul>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-6 shadow-sm">
          <div className="font-semibold text-ink mb-3">اپلیکیشن میدانی اندروید</div>
          <ul className="space-y-2 text-sm text-ink">
            <li>• آفلاین‌اول با Room و Outbox</li>
            <li>• همگام‌سازی با WorkManager</li>
            <li>• اسکن بارکد با CameraX + ML Kit</li>
            <li>• چاپ حرارتی بلوتوث ESC/POS</li>
            <li>• Geofencing + Check-In/Out با GPS</li>
            <li>• اتصال واقعی به API</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
