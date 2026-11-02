import type { Metadata } from 'next';
// فونت وزیرمتن به‌صورت خودمیزبان (self-host) از بستهٔ fontsource — بدون @import خارجی
// و بدون وابستگی به fonts.googleapis.com در زمان اجرا. باید پیش از globals.css بیاید.
import '@fontsource-variable/vazirmatn';
import './globals.css';
import { AppShell } from '@/components/AppShell';
import { QueryProvider } from '@/lib/query/provider';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { ToastProvider } from '@/components/ui/Toast';

export const metadata: Metadata = {
  title: 'سامانه پخش مویرگی — DMS',
  description: 'نرم‌افزار جامع فروش و پخش مویرگی',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <html lang="fa" dir="rtl">
      <body>
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
