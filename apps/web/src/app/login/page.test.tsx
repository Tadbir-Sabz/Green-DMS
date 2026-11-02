import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import LoginPage from './page';

const push = vi.fn();
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace, back: vi.fn(), prefetch: vi.fn() }),
}));

describe('صفحه ورود', () => {
  beforeEach(() => {
    localStorage.clear();
    push.mockClear();
    replace.mockClear();
    // بدون شبکه: هر fetch با پاسخ 500 ساختگی جواب می‌گیرد
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 'internal_error', message_fa: 'خطا' }), {
            status: 500,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('سه روش ورود (رمز، کد پیامکی، بازیابی) را نشان می‌دهد', () => {
    render(<LoginPage />);
    expect(screen.getByRole('button', { name: 'رمز عبور' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'کد پیامکی' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'بازیابی رمز' })).toBeTruthy();
    expect(screen.getByLabelText(/نام کاربری/)).toBeTruthy();
  });

  it('درخواست کد بدون نام کاربری پیام فارسی می‌دهد و fetch نمی‌زند', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'کد پیامکی' }));
    fireEvent.click(screen.getByRole('button', { name: 'درخواست کد' }));
    expect(screen.getByText(/نام کاربری را وارد کنید/)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('تغییر تب، پیام‌ها و خطاهای قبلی را پاک می‌کند', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'کد پیامکی' }));
    fireEvent.click(screen.getByRole('button', { name: 'درخواست کد' }));
    expect(screen.getByText(/نام کاربری را وارد کنید/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'رمز عبور' }));
    expect(screen.queryByText(/نام کاربری را وارد کنید/)).toBeNull();
  });

  it('در بازیابی رمز هم بدون نام کاربری درخواست کد ارسال نمی‌شود', () => {
    render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'بازیابی رمز' }));
    fireEvent.click(screen.getByRole('button', { name: 'درخواست کد' }));
    expect(screen.getByText(/نام کاربری را وارد کنید/)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('در حالت بازیابی، ارسال بدون کد با پیام راهنما متوقف می‌شود', () => {
    const { container } = render(<LoginPage />);
    fireEvent.click(screen.getByRole('button', { name: 'بازیابی رمز' }));
    const form = container.querySelector('form');
    expect(form).toBeTruthy();
    fireEvent.submit(form!);
    expect(screen.getByText(/ابتدا کد بازیابی را درخواست دهید/)).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
});
