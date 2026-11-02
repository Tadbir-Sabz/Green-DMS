"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ComponentType } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useAuth } from "@/lib/auth";
import {
  IconHome,
  IconUsers,
  IconBox,
  IconCart,
  IconChart,
  IconMap,
  IconMoney,
  IconCog,
  IconUser,
  IconLogout,
  IconMenu,
  IconClose,
} from "@/components/icons";

type Icon = ComponentType<{ className?: string }>;
type NavItem = { href: string; label: string; icon: Icon; perm?: string | string[] };
type NavGroup = { title: string; items: NavItem[] };

/**
 * منوی اصلی. هر آیتم یک `perm` اختیاری دارد؛ اگر نشست کاربر موجود باشد، بر اساس
 * مجوزها فیلتر می‌شود. وقتی کاربر هنوز بارگذاری نشده (null) «fail-open» همهٔ آیتم‌ها
 * نشان داده می‌شوند تا (۱) منو در لحظهٔ bootstrap خالی نباشد و (۲) کنترل دسترسی واقعی
 * بر عهدهٔ RoleGuard هر صفحه و PermissionsGuard سمت API بماند.
 */
const navGroups: NavGroup[] = [
  { title: "اصلی", items: [{ href: "/", label: "داشبورد", icon: IconHome, perm: "reports.dashboard.view" }] },
  { title: "اطلاعات پایه", items: [
    { href: "/persons", label: "اشخاص", icon: IconUsers, perm: "master.person.view" },
    { href: "/customers", label: "مشتریان", icon: IconUsers, perm: "master.customer.view" },
    { href: "/products", label: "کالاها", icon: IconBox, perm: "master.product.view" },
    { href: "/prices", label: "قیمت‌گذاری", icon: IconMoney, perm: "master.price.view" },
    { href: "/staff", label: "پرسنل", icon: IconUsers, perm: "master.person.view" },
  ] },
  { title: "فروش و توزیع", items: [
    { href: "/orders", label: "سفارشات فروش", icon: IconCart, perm: "sales.order.view" },
    { href: "/waybills", label: "حواله‌ها", icon: IconCart, perm: "sales.waybill.view" },
    { href: "/invoices", label: "فاکتورها", icon: IconChart, perm: "sales.invoice.view" },
    { href: "/returns", label: "مرجوعی‌ها", icon: IconCart, perm: "sales.return.request" },
    { href: "/routes", label: "مناطق و مسیرها", icon: IconMap, perm: "tracking.route.view" },
    { href: "/tours", label: "تورها", icon: IconMap, perm: "tour.plan.view" },
  ] },
  { title: "انبار", items: [
    { href: "/warehouses", label: "موجودی", icon: IconBox, perm: "inventory.warehouse.view" },
    { href: "/transfers", label: "انتقال بین انباری", icon: IconBox, perm: "inventory.transfer.create" },
    { href: "/stock-count", label: "انبارگردانی", icon: IconBox, perm: "inventory.count.create" },
    { href: "/receipts", label: "رسید خرید", icon: IconBox, perm: "ap.purchase.request" },
    { href: "/issues", label: "حواله فروش", icon: IconBox, perm: "sales.delivery.view" },
  ] },
  { title: "رهگیری و قوانین", items: [
    { href: "/tracking", label: "رهگیری زنده", icon: IconMap, perm: "tracking.live.view" },
    { href: "/geofences", label: "محدوده‌های جغرافیایی", icon: IconMap, perm: "tracking.geofence.view" },
    { href: "/rules", label: "موتور قوانین", icon: IconCog, perm: "rules.view" },
    { href: "/approvals", label: "درخواست‌های تأیید", icon: IconChart, perm: "rules.approval.decide" },
    { href: "/exceptions", label: "صف استثناها", icon: IconChart, perm: "rules.exceptions.resolve" },
  ] },
  { title: "مالی", items: [
    { href: "/ar", label: "حساب‌های دریافتنی", icon: IconMoney, perm: "ar.ledger.view" },
    { href: "/ap", label: "حساب‌های پرداختنی", icon: IconMoney, perm: "ap.supplier.view" },
    { href: "/treasury", label: "خزانه‌داری", icon: IconMoney, perm: "treasury.cash.view" },
    { href: "/gl", label: "دفتر کل", icon: IconChart, perm: "gl.journal.view" },
  ] },
  { title: "گزارشات", items: [
    { href: "/reports/sales", label: "گزارش فروش", icon: IconChart, perm: "reports.dashboard.view" },
    { href: "/reports/inventory", label: "گزارش موجودی", icon: IconChart, perm: "reports.dashboard.view" },
    { href: "/reports/ar", label: "گزارش دریافتنی", icon: IconChart, perm: "reports.dashboard.view" },
    { href: "/reports/ap", label: "گزارش پرداختنی", icon: IconChart, perm: "reports.dashboard.view" },
    { href: "/reports/cash", label: "گزارش صندوق و بانک", icon: IconChart, perm: "reports.dashboard.view" },
  ] },
  { title: "سیستم", items: [
    { href: "/users", label: "کاربران", icon: IconUsers, perm: "admin.user.manage" },
    { href: "/roles", label: "نقش‌ها و دسترسی", icon: IconCog, perm: "admin.role.manage" },
    { href: "/devices", label: "دستگاه‌ها", icon: IconCog, perm: "admin.integration.manage" },
    { href: "/settings", label: "تنظیمات", icon: IconCog, perm: "master.settings.view" },
    { href: "/integrations", label: "یکپارچه‌سازی", icon: IconCog, perm: "admin.integration.manage" },
    { href: "/demo", label: "دمو", icon: IconHome },
  ] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, hasPermission, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (pathname === "/login") return <>{children}</>;

  // fail-open وقتی نشست بارگذاری نشده؛ در غیر این صورت بر اساس مجوز فیلتر کن
  const canSee = (item: NavItem): boolean => (!user || !item.perm ? true : hasPermission(item.perm));
  const groups = navGroups
    .map((g) => ({ ...g, items: g.items.filter(canSee) }))
    .filter((g) => g.items.length > 0);

  const onLogout = async (): Promise<void> => {
    await logout();
    router.push("/login");
  };

  const sidebar = (
    <nav className="p-3 space-y-6">
      {groups.map((group, gidx) => (
        <div key={gidx}>
          <div className="px-2 mb-2 text-xs font-semibold text-slate-400 dark:text-slate-500">{group.title}</div>
          <div className="space-y-1">
            {group.items.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm transition-colors ${active ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-medium" : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1f2937]"}`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#f7f9fc] dark:bg-[#0b1026]" dir="rtl">
      <header className="h-16 bg-white dark:bg-[#0f172a] border-b border-slate-200 dark:border-[#1f2937] flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="باز کردن منو"
            className="md:hidden w-9 h-9 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1f2937] flex items-center justify-center text-slate-700 dark:text-slate-200"
          >
            <IconMenu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-green-500 text-white flex items-center justify-center font-bold shadow-sm">GD</div>
            <div>
              <div className="font-bold text-slate-900 dark:text-slate-100 leading-tight">GreenDMS</div>
              <div className="text-xs text-slate-500 dark:text-slate-400 leading-tight">سامانه فروش و پخش مویرگی</div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {user && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-[#1f2937] text-slate-700 dark:text-slate-200">
              <IconUser className="w-4 h-4" />
              <span className="text-sm max-w-[140px] truncate" title={user.username}>{user.username}</span>
            </div>
          )}
          <button
            onClick={onLogout}
            aria-label="خروج"
            title="خروج"
            className="w-9 h-9 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 flex items-center justify-center"
          >
            <IconLogout className="w-5 h-5" />
          </button>
        </div>
      </header>
      <div className="flex">
        {/* پس‌زمینهٔ تاریک وقتی منوی موبایل باز است */}
        {mobileOpen && (
          <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={() => setMobileOpen(false)} aria-hidden />
        )}
        {/* دسر موبایل: off-canvas؛ در md+ چسبنده و همیشهvisible */}
        <aside
          className={`z-40 bg-white dark:bg-[#0f172a] border-l border-slate-200 dark:border-[#1f2937] overflow-auto
            fixed inset-y-0 right-0 w-72 transform transition-transform duration-200 ease-in-out
            ${mobileOpen ? "translate-x-0" : "translate-x-full"}
            md:sticky md:top-16 md:h-[calc(100vh-64px)] md:translate-x-0 md:w-72`}
        >
          <div className="flex items-center justify-between p-3 md:hidden">
            <span className="font-bold text-slate-900 dark:text-slate-100">منو</span>
            <button onClick={() => setMobileOpen(false)} aria-label="بستن منو" className="w-9 h-9 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1f2937] flex items-center justify-center text-slate-600 dark:text-slate-300">
              <IconClose className="w-5 h-5" />
            </button>
          </div>
          {sidebar}
        </aside>
        <main className="flex-1 p-4 sm:p-8 max-w-[1700px] mx-auto w-full min-w-0">{children}</main>
      </div>
    </div>
  );
}

export function AppLoader() {
  return <div className="p-6 text-slate-500 dark:text-slate-400">در حال بارگذاری...</div>;
}
