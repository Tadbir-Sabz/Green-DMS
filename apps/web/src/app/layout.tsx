import type { Metadata, Viewport } from "next";
// فونت وزیرمتن به‌صورت خودمیزبان (self-host) از بستهٔ fontsource — بدون @import خارجی
// و بدون وابستگی به fonts.googleapis.com در زمان اجرا. باید پیش از globals.css بیاید.
import "@fontsource-variable/vazirmatn";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { QueryProvider } from "@/lib/query/provider";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: {
    default: "سامانه پخش مویرگی — GreenDMS",
    template: "%s — GreenDMS",
  },
  description: "نرم‌افزار جامع فروش، توزیع مویرگی و مدیریت انبار و مالی",
  applicationName: "GreenDMS",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // رنگ نوار وضعیت موبایل هماهنگ با هر دو تم
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f7fa" },
    { media: "(prefers-color-scheme: dark)", color: "#080c14" },
  ],
};

/**
 * تعیین تم پیش از اولین رنگ‌آمیزی صفحه (بدون «فلش سفید»).
 *
 * اگر این کار در useEffect انجام شود، مرورگر ابتدا حالت روشن را نقاشی می‌کند و
 * بعد به تاریک می‌پرد. این اسکریپت کوچک، همگام و پیش از parse شدن بدنه اجرا
 * می‌شود و کلاس `dark` را روی <html> می‌گذارد. به همین دلیل روی <html> از
 * `suppressHydrationWarning` استفاده شده — چون این تغییر پیش از hydration رخ
 * می‌دهد و نباید هشدار ناهمگامی بدهد.
 */
const THEME_INIT_SCRIPT = `(function(){try{
  var s=localStorage.getItem("dms-theme");
  var p=(s==="light"||s==="dark"||s==="system")?s:"system";
  var d=(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches)?"dark":"light";
  var r=p==="system"?d:p;
  var e=document.documentElement;
  e.classList.toggle("dark",r==="dark");
  e.setAttribute("data-theme",p);
  e.style.colorScheme=r;
}catch(_){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="bg-canvas text-ink antialiased">
        {/* نخستین عنصر بدنه: تم را پیش از رنگ‌آمیزی محتوا اعمال می‌کند */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeProvider>
          <QueryProvider>
            <ToastProvider>
              <AppShell>{children}</AppShell>
            </ToastProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
