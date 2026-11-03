"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * صفحهٔ «دسترسی غیرمجاز». RoleGuard هنگام نبودِ مجوز/نقش لازم به اینجا می‌فرستد.
 * (پیش‌تر این مسیر وجود نداشت و redirect به خطای 404 می‌خورد.)
 */
export default function ForbiddenPage() {
  const router = useRouter();
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center bg-surface border border-line rounded-2xl p-8 shadow-sm">
        <div className="mx-auto w-14 h-14 rounded-full bg-warning-soft text-warning-ink flex items-center justify-center text-2xl font-bold mb-4">
          ۴۰۳
        </div>
        <h1 className="text-lg font-bold text-ink">
          دسترسی غیرمجاز
        </h1>
        <p className="mt-2 text-sm text-ink-muted">
          نقش یا مجوز لازم برای مشاهدهٔ این صفحه را ندارید. اگر فکر می‌کنید اشتباهی
          رخ داده، با مدیر سامانه تماس بگیرید.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Link
            href="/"
            className="px-4 py-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-medium"
          >
            بازگشت به داشبورد
          </Link>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 rounded-xl border border-line-strong text-ink hover:bg-surface-hover text-sm font-medium"
          >
            صفحهٔ قبل
          </button>
        </div>
      </div>
    </div>
  );
}
