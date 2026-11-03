"use client";

import { useEffect } from "react";

/**
 * مرز خطای سراسری Next.js App Router. هر خطای رندرشده در زیردرخت app را می‌گیرد
 * و به‌جای صفحهٔ سفید/stacktrace، پیام فارسی و دکمهٔ تلاش دوباره نشان می‌دهد.
 * (پیش‌تر هیچ error.tsx وجود نداشت.)
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // ثبت خطا برای رصد (در تولید به سرویس گزارش خطا وصل می‌شود)
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center bg-surface border border-danger/25 rounded-2xl p-8 shadow-sm">
        <div className="mx-auto w-12 h-12 rounded-full bg-danger-soft text-danger-ink flex items-center justify-center text-2xl font-bold mb-4">
          !
        </div>
        <h1 className="text-lg font-bold text-ink">
          خطایی رخ داد
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          {error.message || "هنگام نمایش این صفحه خطای غیرمنتظره‌ای پیش آمد."}
        </p>
        {error.digest && (
          <p className="mt-1 text-xs text-ink-subtle" dir="ltr">
            ref: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="mt-5 px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-medium"
        >
          تلاش دوباره
        </button>
      </div>
    </div>
  );
}
