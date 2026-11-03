/**
 * حالت بارگذاری سراسری Next.js App Router — هنگام ناوبری بین مسیرها و تا
 * آماده شدن Suspense مرزها، یک اسکلتون سبک نشان می‌دهد. (پیش‌تر وجود نداشت.)
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="h-7 w-48 animate-pulse rounded-lg bg-surface-sunken" />
        <div className="mr-auto h-9 w-28 animate-pulse rounded-xl bg-surface-sunken" />
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-2xl bg-surface-sunken"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-surface-sunken" />
      <span className="sr-only">در حال بارگذاری...</span>
    </div>
  );
}
