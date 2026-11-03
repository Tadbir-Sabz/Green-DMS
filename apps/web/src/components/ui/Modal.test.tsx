import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Modal } from './Modal';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/**
 * بازتولید دقیق باگی که در صفحه‌های users/roles بود: والد وضعیت فرم را نگه
 * می‌دارد و Modal را با `onClose`inline رندر می‌کند. پیش از رفع باگ، اثرِ
 * مدیریت تمرکزِ Modal به `[open, onClose]` وابسته بود، پس هر کلید تایپ‌شده
 * (→ رندر مجدد والد → هویت تازهٔ onClose) اثر را از نو اجرا می‌کرد: تمرکز
 * به دکمهٔ پشت مودال و سپس به اولین عنصر مودال می‌پرید و تایپ ممکن نبود.
 */
function Host() {
  const [value, setValue] = useState('');
  return (
    <>
      <button type="button">opener</button>
      {/* onCloseinline داخل Host: هر رندرِ Host (با هر کلید تایپ) هویت تازه‌ای
          می‌سازد — دقیقاً الگوی صفحات users/roles. */}
      <Modal open onClose={() => {}} title="فرم">
        <input
          aria-label="field"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      </Modal>
    </>
  );
}

describe('Modal — پایداری تمرکز هنگام تایپ در فرم', () => {
  it('با onCloseinline و رندر مجدد والد، تمرکز از فیلد بیرون نمی‌پرد', () => {
    vi.useFakeTimers();

    // onCloseinline: هر رندر هویت تازه‌ای دارد (الگوی واقعی صفحات).
    render(<Host />);
    // فوکوس خودکار اولیهٔ مودال داخل setTimeout(…,0) است؛ با تایمر ساختگی اجرایش کن.
    act(() => {
      vi.runAllTimers();
    });

    const input = screen.getByLabelText('field') as HTMLInputElement;
    act(() => {
      input.focus();
    });
    expect(document.activeElement).toBe(input);

    // تایپ کاراکتر به کاراکتر؛ هرکدام والد را رندر مجدد می‌کند.
    for (const ch of ['a', 'b', 'c']) {
      act(() => {
        fireEvent.change(input, { target: { value: input.value + ch } });
      });
      act(() => {
        vi.runAllTimers();
      });
      // تمرکز باید روی همان فیلد بماند (پیش از رفع باگ به اولین عنصر مودال می‌پرید).
      expect(document.activeElement).toBe(input);
    }

    expect(input.value).toBe('abc');
  });
});
