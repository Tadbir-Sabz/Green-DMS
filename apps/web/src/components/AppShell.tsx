"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { IconHome, IconUsers, IconBox, IconCart, IconChart, IconMap, IconMoney, IconCog } from "@/components/icons";

const navGroups = [
  { title: "اصلی", items: [{ href: "/", label: "داشبورد", icon: IconHome }] },
  { title: "اطلاعات پایه", items: [{ href: "/persons", label: "اشخاص", icon: IconUsers }, { href: "/customers", label: "مشتریان", icon: IconUsers }, { href: "/products", label: "کالاها", icon: IconBox }, { href: "/prices", label: "قیمت‌گذاری", icon: IconMoney }, { href: "/staff", label: "پرسنل", icon: IconUsers }] },
  { title: "فروش و توزیع", items: [{ href: "/orders", label: "سفارشات فروش", icon: IconCart }, { href: "/waybills", label: "حواله‌ها", icon: IconCart }, { href: "/invoices", label: "فاکتورها", icon: IconChart }, { href: "/returns", label: "مرجوعی‌ها", icon: IconCart }, { href: "/routes", label: "مناطق و مسیرها", icon: IconMap }, { href: "/tours", label: "تورها", icon: IconMap }] },
  { title: "انبار", items: [{ href: "/warehouses", label: "موجودی", icon: IconBox }, { href: "/transfers", label: "انتقال بین انباری", icon: IconBox }, { href: "/stock-count", label: "انبارگردانی", icon: IconBox }, { href: "/receipts", label: "رسید خرید", icon: IconBox }, { href: "/issues", label: "حواله فروش", icon: IconBox }] },
  { title: "رهگیری و قوانین", items: [{ href: "/tracking", label: "رهگیری زنده", icon: IconMap }, { href: "/geofences", label: "محدوده‌های جغرافیایی", icon: IconMap }, { href: "/rules", label: "موتور قوانین", icon: IconCog }, { href: "/approvals", label: "درخواست‌های تأیید", icon: IconChart }, { href: "/exceptions", label: "صف استثناها", icon: IconChart }] },
  { title: "مالی", items: [{ href: "/ar", label: "حساب‌های دریافتنی", icon: IconMoney }, { href: "/ap", label: "حساب‌های پرداختنی", icon: IconMoney }, { href: "/treasury", label: "خزانه‌داری", icon: IconMoney }, { href: "/gl", label: "دفتر کل", icon: IconChart }] },
  { title: "گزارشات", items: [{ href: "/reports/sales", label: "گزارش فروش", icon: IconChart }, { href: "/reports/inventory", label: "گزارش موجودی", icon: IconChart }, { href: "/reports/ar", label: "گزارش دریافتنی", icon: IconChart }, { href: "/reports/ap", label: "گزارش پرداختنی", icon: IconChart }, { href: "/reports/cash", label: "گزارش صندوق و بانک", icon: IconChart }] },
  { title: "سیستم", items: [{ href: "/users", label: "کاربران", icon: IconUsers }, { href: "/roles", label: "نقش‌ها و دسترسی", icon: IconCog }, { href: "/devices", label: "دستگاه‌ها", icon: IconCog }, { href: "/settings", label: "تنظیمات", icon: IconCog }, { href: "/integrations", label: "یکپارچه‌سازی", icon: IconCog }, { href: "/demo", label: "دمو", icon: IconHome }] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  if (pathname === "/login") return <>{children}</>;
  return (
    <div className="min-h-screen bg-[#f7f9fc] dark:bg-[#0b1026]" dir="rtl">
      <header className="h-16 bg-white dark:bg-[#0f172a] border-b border-slate-200 dark:border-[#1f2937] flex items-center justify-between px-6 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => setCollapsed(!collapsed)} className="w-9 h-9 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1f2937] flex items-center justify-center text-slate-700 dark:text-slate-200">☰</button>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-green-500 text-white flex items-center justify-center font-bold shadow-sm">GD</div>
            <div><div className="font-bold text-slate-900 dark:text-slate-100 leading-tight">GreenDMS</div><div className="text-xs text-slate-500 dark:text-slate-400 leading-tight">سامانه فروش و پخش مویرگی</div></div>
          </div>
        </div>
        <ThemeToggle />
      </header>
      <div className="flex">
        <aside className={`${collapsed ? "w-20" : "w-72"} transition-all duration-200 bg-white dark:bg-[#0f172a] border-l border-slate-200 dark:border-[#1f2937] h-[calc(100vh-64px)] sticky top-16 overflow-auto`}>
          <nav className="p-3 space-y-6">
            {navGroups.map((group, gidx) => (
              <div key={gidx}>
                {!collapsed && <div className="px-2 mb-2 text-xs font-semibold text-slate-400 dark:text-slate-500">{group.title}</div>}
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const active = pathname === item.href || pathname?.startsWith(item.href + "/");
                    const Icon = item.icon;
                    return <Link key={item.href} href={item.href} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors ${active ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-medium" : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1f2937]"}`} title={collapsed ? item.label : undefined}>
                      <Icon className="w-5 h-5 shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>;
                  })}
                </div>
              </div>
            ))}
          </nav>
        </aside>
        <main className="flex-1 p-8 max-w-[1700px] mx-auto w-full">{children}</main>
      </div>
    </div>
  );
}

export function AppLoader() {
  return <div className="p-6 text-slate-500 dark:text-slate-400">در حال بارگذاری...</div>;
}
