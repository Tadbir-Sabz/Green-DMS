import type { ComponentType } from "react";
import {
  IconApproval,
  IconCart,
  IconChart,
  IconClipboardCheck,
  IconCog,
  IconCustomer,
  IconDashboard,
  IconDatabase,
  IconDelivery,
  IconDevice,
  IconException,
  IconGeofence,
  IconGoodsIn,
  IconInbox,
  IconIntegration,
  IconInvoice,
  IconLayers,
  IconLedger,
  IconMoney,
  IconOrder,
  IconPayable,
  IconReceivable,
  IconReturn,
  IconRoute,
  IconRules,
  IconShield,
  IconSliders,
  IconSparkles,
  IconStaff,
  IconBox,
  IconTag,
  IconTour,
  IconTracking,
  IconTransfer,
  IconTreasury,
  IconTrendUp,
  IconUsers,
  IconWallet,
  IconWarehouse,
} from "@/components/icons";

/**
 * پیکربندی ناوبری — تنها منبع حقیقت برای منو، مسیر راهنما و پالت فرمان.
 *
 * جدا کردن این داده از AppShell سه فایده دارد: (۱) پالت جست‌وجوی سراسری و
 * breadcrumbها از همان فهرست می‌خوانند پس هیچ‌وقت ناهمگام نمی‌شوند،
 * (۲) آیکون هر آیتم معنایی است (پیش‌تر چند آیتم مختلف همه IconChart بودند)،
 * (۳) افزودن صفحهٔ جدید فقط یک سطر تغییر است.
 *
 * هر آیتم `perm` اختیاری دارد؛ اگر نشست کاربر بارگذاری شده باشد منو بر اساس
 * مجوزها فیلتر می‌شود. تا پیش از بارگذاری نشست «fail-open» همه دیده می‌شوند تا
 * منو در لحظهٔ bootstrap خالی نباشد — کنترل دسترسی واقعی بر عهدهٔ RoleGuard هر
 * صفحه و PermissionsGuard سمت API است.
 */
export type Icon = ComponentType<{ className?: string }>;

export type NavItem = {
  href: string;
  label: string;
  icon: Icon;
  perm?: string | string[];
  /** توضیح کوتاه برای پالت فرمان */
  hint?: string;
};

export type NavGroup = {
  key: string;
  title: string;
  icon: Icon;
  items: NavItem[];
};

export const navGroups: NavGroup[] = [
  {
    key: "main",
    title: "اصلی",
    icon: IconDashboard,
    items: [
      { href: "/", label: "داشبورد", icon: IconDashboard, perm: "reports.dashboard.view", hint: "شاخص‌های کلیدی و روند فروش" },
    ],
  },
  {
    key: "master",
    title: "اطلاعات پایه",
    icon: IconDatabase,
    items: [
      { href: "/persons", label: "اشخاص", icon: IconUsers, perm: "master.person.view", hint: "طرف‌حساب‌های حقیقی و حقوقی" },
      { href: "/customers", label: "مشتریان", icon: IconCustomer, perm: "master.customer.view", hint: "پروفایل، اعتبار و کانال فروش" },
      { href: "/products", label: "کالاها", icon: IconBox, perm: "master.product.view", hint: "کاتالوگ، بسته‌بندی و بارکد" },
      { href: "/prices", label: "قیمت‌گذاری", icon: IconTag, perm: "master.price.view", hint: "لیست قیمت و تخفیف" },
      { href: "/staff", label: "پرسنل", icon: IconStaff, perm: "master.person.view", hint: "نیروی انسانی و پست سازمانی" },
    ],
  },
  {
    key: "sales",
    title: "فروش و توزیع",
    icon: IconCart,
    items: [
      { href: "/orders", label: "سفارشات فروش", icon: IconOrder, perm: "sales.order.view", hint: "چرخهٔ سفارش تا فاکتور" },
      { href: "/requests", label: "درخواست‌های مشتری", icon: IconInbox, perm: "sales.request.view", hint: "درخواست‌های ثبت‌شده از پورتال" },
      { href: "/waybills", label: "حواله‌ها", icon: IconDelivery, perm: "sales.waybill.view", hint: "حوالهٔ خروج و بارنامه" },
      { href: "/invoices", label: "فاکتورها", icon: IconInvoice, perm: "sales.invoice.view", hint: "صدور، چاپ و وضعیت پرداخت" },
      { href: "/returns", label: "مرجوعی‌ها", icon: IconReturn, perm: "sales.return.request", hint: "برگشت کالا و بستانکاری" },
      { href: "/routes", label: "مناطق و مسیرها", icon: IconRoute, perm: "tracking.route.view", hint: "تقسیم‌بندی جغرافیایی ویزیت" },
      { href: "/tours", label: "تورها", icon: IconTour, perm: "tour.plan.view", hint: "برنامه‌ریزی، اجرا و تسویهٔ تور" },
    ],
  },
  {
    key: "inventory",
    title: "انبار",
    icon: IconWarehouse,
    items: [
      { href: "/warehouses", label: "موجودی", icon: IconWarehouse, perm: "inventory.warehouse.view", hint: "ماندهٔ لحظه‌ای هر انبار" },
      { href: "/transfers", label: "انتقال بین انباری", icon: IconTransfer, perm: "inventory.transfer.create", hint: "جابجایی موجودی" },
      { href: "/stock-count", label: "انبارگردانی", icon: IconClipboardCheck, perm: "inventory.count.create", hint: "شمارش و رفع مغایرت" },
      { href: "/receipts", label: "رسید خرید", icon: IconGoodsIn, perm: "ap.purchase.request", hint: "ورود کالا از تأمین‌کننده" },
      { href: "/issues", label: "حواله فروش", icon: IconDelivery, perm: "sales.delivery.view", hint: "تحویل و خروج کالا" },
    ],
  },
  {
    key: "tracking",
    title: "رهگیری و قوانین",
    icon: IconTracking,
    items: [
      { href: "/tracking", label: "رهگیری زنده", icon: IconTracking, perm: "tracking.live.view", hint: "موقعیت لحظه‌ای نیروها" },
      { href: "/geofences", label: "محدوده‌های جغرافیایی", icon: IconGeofence, perm: "tracking.geofence.view", hint: "حریم مجاز بازدید" },
      { href: "/rules", label: "موتور قوانین", icon: IconRules, perm: "rules.view", hint: "سقف اعتبار و تخفیف" },
      { href: "/approvals", label: "درخواست‌های تأیید", icon: IconApproval, perm: "rules.approval.decide", hint: "صف تصمیم‌گیری" },
      // TASK-24Y — کارتابلِ شخصی و واگذاری‌ها (مجوزِ تصمیم لازم است، نه فقط مشاهده)
      { href: "/approvals/inbox", label: "کارتابل من", icon: IconApproval, perm: "rules.approval.decide", hint: "نوبتِ تصمیمِ من" },
      { href: "/exceptions", label: "صف استثناها", icon: IconException, perm: "rules.exceptions.resolve", hint: "موارد نیازمند رسیدگی" },
    ],
  },
  {
    key: "finance",
    title: "مالی",
    icon: IconMoney,
    items: [
      { href: "/ar", label: "حساب‌های دریافتنی", icon: IconReceivable, perm: "ar.ledger.view", hint: "بدهکاری، سررسید و وصول" },
      { href: "/ap", label: "حساب‌های پرداختنی", icon: IconPayable, perm: "ap.supplier.view", hint: "دیون تأمین‌کنندگان" },
      { href: "/treasury", label: "خزانه‌داری", icon: IconTreasury, perm: "treasury.cash.view", hint: "صندوق، بانک و چک" },
      { href: "/gl", label: "دفتر کل", icon: IconLedger, hint: "اسناد حسابداری و تراز", perm: "gl.journal.view" },
    ],
  },
  {
    key: "reports",
    title: "گزارشات",
    icon: IconChart,
    items: [
      { href: "/bi", label: "داشبورد BI", icon: IconChart, perm: "reports.dashboard.view", hint: "KPI و تحلیل ABC مشتریان و کالاها" },
      { href: "/reports/sales", label: "گزارش فروش", icon: IconTrendUp, perm: "reports.dashboard.view", hint: "فروش به تفکیک دوره" },
      { href: "/reports/inventory", label: "گزارش موجودی", icon: IconLayers, perm: "reports.dashboard.view", hint: "مانده و گردش کالا" },
      { href: "/reports/ar", label: "گزارش دریافتنی", icon: IconReceivable, perm: "reports.dashboard.view", hint: "سن‌شدن بدهی" },
      { href: "/reports/ap", label: "گزارش پرداختنی", icon: IconPayable, perm: "reports.dashboard.view", hint: "سن‌شدن دیون" },
      { href: "/reports/cash", label: "گزارش صندوق و بانک", icon: IconWallet, perm: "reports.dashboard.view", hint: "گردش نقدینگی" },
    ],
  },
  {
    key: "system",
    title: "سیستم",
    icon: IconCog,
    items: [
      { href: "/users", label: "کاربران", icon: IconUsers, perm: "admin.user.manage", hint: "حساب کاربری و نشست" },
      { href: "/roles", label: "نقش‌ها و دسترسی", icon: IconShield, perm: "admin.role.manage", hint: "ماتریس مجوزها" },
      { href: "/devices", label: "دستگاه‌ها", icon: IconDevice, perm: "admin.integration.manage", hint: "هندهلدهای میدانی" },
      { href: "/settings", label: "تنظیمات", icon: IconSliders, perm: "master.settings.view", hint: "پیکربندی سامانه" },
      { href: "/integrations", label: "یکپارچه‌سازی", icon: IconIntegration, perm: "admin.integration.manage", hint: "مؤدیان، PSP و وب‌سرویس" },
      { href: "/demo", label: "دمو", icon: IconSparkles, hint: "نمایش اجزای رابط کاربری" },
    ],
  },
];

/** فهرست مسطح همهٔ آیتم‌ها (برای پالت فرمان و جست‌وجوی منو) */
export const navItems: (NavItem & { group: string })[] = navGroups.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.title })),
);

/** برچسب یک مسیر از روی پیکربندی منو (برای breadcrumb) */
/**
 * برچسب زیرمسیرهایی که از روی پیشوند قابل حدس نیستند.
 *
 * بدون این نگاشت، `/stock-count/new` همان «انبارگردانیِ» والد را برمی‌گرداند و
 * نام صفحه دو بار (یکی در مسیر راهنما و یکی در عنوان) تکرار می‌شد.
 */
const SUBPATH_FA: Record<string, string> = {
  "/stock-count/new": "ثبت انبارگردانی",
  "/transfers/new": "ثبت انتقال",
  "/integrations/moadian": "سامانه مودیان",
  "/integrations/psp": "درگاه پرداخت",
};

/**
 * برچسب فارسی یک مسیر — برای عنوان پوسته و مسیر راهنما.
 * برای زیرمسیرهای پویا برچسب متمایز می‌سازد («ثبت …»، «جزئیات …») تا با
 * برچسب والد اشتباه نشود.
 */
export function labelForPath(pathname: string): string | undefined {
  if (pathname === "/") return "داشبورد";
  const exact = navItems.find((item) => item.href === pathname);
  if (exact) return exact.label;
  const known = SUBPATH_FA[pathname];
  if (known) return known;
  // برای زیرمسیرها (مثل /orders/123) بلندترین پیشوند منطبق را پیدا کن
  const prefix = navItems
    .filter((item) => item.href !== "/" && pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (!prefix) return undefined;
  if (pathname.endsWith("/new")) return `ثبت ${prefix.label}`;
  return `جزئیات ${prefix.label}`;
}

/** آیا این مسیر زیرمجموعهٔ آن آیتم منو است؟ */
export function isPathActive(pathname: string | null | undefined, href: string): boolean {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
