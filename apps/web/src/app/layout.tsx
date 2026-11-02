import type { Metadata } from 'next';
import './globals.css';
import { AppShell } from '@/components/AppShell';
import { QueryProvider } from '@/lib/query/provider';
import { ThemeProvider } from '@/components/theme/ThemeProvider';

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
            <AppShell>{children}</AppShell>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
