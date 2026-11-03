import { Skeleton, SkeletonCard } from "@/components/ui/Feedback";

/**
 * حالت بارگذاری سراسری Next.js App Router — هنگام ناوبری بین مسیرها و تا
 * آماده شدن مرزهای Suspense، اسکلتونی هم‌شکل با چیدمان واقعی صفحه نشان می‌دهد.
 *
 * از همان اجزای اسکلتونِ سیستم طراحی استفاده می‌کند تا انیمیشن و رنگ
 * اسکلتون‌های داخل صفحه‌ها (DataTable، StatCard) یکدست باشد.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <span className="sr-only">در حال بارگذاری…</span>

      {/* سربدنهٔ صفحه: عنوان + جای دکمهٔ عملیات */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-28 rounded-xl" />
      </div>

      {/* کارت‌های شاخص */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>

      {/* بدنهٔ اصلی: جای جدول/نمودار */}
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  );
}
