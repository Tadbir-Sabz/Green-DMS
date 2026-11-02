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
      <div className="max-w-md w-full text-center bg-white dark:bg-[#111827] border border-slate-200 dark:border-[#1f2937] rounded-2xl p-8 shadow-sm">
        <div className="mx-auto w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 flex items-center justify-center text-2xl font-bold mb-4">
          ۴۰۳
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          دسترسی غیرمجاز
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          نقش یا مجوز لازم برای مشاهدهٔ این صفحه را ندارید. اگر فکر می‌کنید اشتباهی
          رخ داده، با مدیر سامانه تماس بگیرید.
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Link
            href="/"
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium"
          >
            بازگشت به داشبورد
          </Link>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 rounded-xl border border-slate-300 dark:border-[#1f2937] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1f2937] text-sm font-medium"
          >
            صفحهٔ قبل
          </button>
        </div>
      </div>
    </div>
  );
}
