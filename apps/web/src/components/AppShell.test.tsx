import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AppShell } from './AppShell';

/** مسیر جاری برای usePathname — منو باید برای همه صفحات همان لینک‌ها را داشته باشد */
const pathnameRef = { current: '/' };

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameRef.current,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/theme/ThemeToggle', () => ({
  ThemeToggle: () => null,
}));

afterEach(() => {
  cleanup();
  pathnameRef.current = '/';
});

describe('AppShell — منوی اصلی', () => {
  it('لوگو و عنوان محصول را نشان می‌دهد', () => {
    render(
      <AppShell>
        <div>محتوا</div>
      </AppShell>,
    );
    expect(screen.getByText('GreenDMS')).toBeTruthy();
    expect(screen.getByText('سامانه فروش و پخش مویرگی')).toBeTruthy();
    expect(screen.getByText('محتوا')).toBeTruthy();
  });

  it('گروه‌های منو با صفحاتشان وجود دارند', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    for (const group of [
      'اصلی',
      'اطلاعات پایه',
      'فروش و توزیع',
      'انبار',
      'رهگیری و قوانین',
      'مالی',
      'گزارشات',
      'سیستم',
    ]) {
      expect(screen.getAllByText(group).length, `گروه ${group}`).toBeGreaterThan(0);
    }
  });

  it('هر لینک منو به صفحهٔ موجودی اشاره می‌کند (هیچ لینک مرده‌ای نمانده)', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    const hrefs = Array.from(document.querySelectorAll('nav a')).map((a) => a.getAttribute('href'));
    expect(hrefs.length).toBeGreaterThan(20);

    // صفحاتی که قبلاً در منو بودند ولی صفحه نداشتند (فاز C)
    for (const href of [
      '/staff',
      '/waybills',
      '/returns',
      '/routes',
      '/geofences',
      '/approvals',
      '/exceptions',
      '/orders',
      '/customers',
      '/products',
      '/warehouses',
      '/tracking',
      '/rules',
      '/settings',
    ]) {
      expect(hrefs, `لینک ${href} در منو نیست`).toContain(href);
    }
  });

  it('همه لینک‌های منو مسیر معتبر دارند و تکراری نیستند', () => {
    render(
      <AppShell>
        <div />
      </AppShell>,
    );
    const hrefs = Array.from(document.querySelectorAll('nav a')).map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.every((h) => h.startsWith('/') && h.length >= 1)).toBe(true);
    expect(new Set(hrefs).size).toBe(hrefs.length); // لینک تکراری نداریم
  });

  it('در صفحه ورود، shell حذف می‌شود (فقط محتوا می‌ماند)', () => {
    pathnameRef.current = '/login';
    render(
      <AppShell>
        <div>ورود</div>
      </AppShell>,
    );
    expect(screen.getByText('ورود')).toBeTruthy();
    expect(screen.queryByText('GreenDMS')).toBeNull();
  });
});
