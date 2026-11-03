"use client";

import { cn } from "@/lib/cn";
import { IconChevronEnd, IconChevronStart } from "@/components/icons";
import { formatNumber } from "@/lib/format";

/**
 * صفحه‌بندی — RTL-آگاه و فشرده.
 *
 * در چیدمان راست‌به‌چپ، «قبلی» در سمت راست (start) و «بعدی» در سمت چپ (end)
 * می‌نشیند؛ چون ترتیب DOM حفظ می‌شود و فلش‌ها با `rtl:rotate-180` برعکس
 * می‌شوند، بدون هیچ هاردکد جهت کار می‌کند. شماره‌ها با ارقام فارسی نمایش
 * داده می‌شوند و دامنهٔ رکوردها («۱ تا ۵۰ از ۱٬۲۳۴») کنار آن می‌آید.
 */
export function pageRange(page: number, pageCount: number, siblings = 1): (number | "gap")[] {
  const total = siblings * 2 + 5;
  if (pageCount <= total) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }
  const left = Math.max(page - siblings, 1);
  const right = Math.min(page + siblings, pageCount);
  const showLeftDots = left > 2;
  const showRightDots = right < pageCount - 1;

  if (!showLeftDots && showRightDots) {
    const startCount = siblings + 3;
    return [
      ...Array.from({ length: startCount }, (_, i) => i + 1),
      "gap" as const,
      pageCount,
    ];
  }
  if (showLeftDots && !showRightDots) {
    const endCount = siblings + 3;
    return [
      1,
      "gap" as const,
      ...Array.from({ length: endCount }, (_, i) => pageCount - endCount + i + 1),
    ];
  }
  return [
    1,
    "gap" as const,
    ...Array.from({ length: right - left + 1 }, (_, i) => left + i),
    "gap" as const,
    pageCount,
  ];
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  siblings = 1,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  siblings?: number;
  className?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const navButton =
    "inline-flex size-8.5 items-center justify-center rounded-lg border border-line bg-surface " +
    "text-ink-muted transition-colors hover:bg-surface-alt hover:text-ink focus-ring " +
    "disabled:pointer-events-none disabled:opacity-40";

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3",
        className,
      )}
    >
      <p className="tnum text-xs text-ink-subtle">
        {total === 0 ? (
          "بدون رکورد"
        ) : (
          <>
            <span className="font-medium text-ink-muted">{formatNumber(from)}</span> تا{" "}
            <span className="font-medium text-ink-muted">{formatNumber(to)}</span> از{" "}
            <span className="font-medium text-ink-muted">{formatNumber(total)}</span>
          </>
        )}
      </p>

      <nav aria-label="صفحه‌بندی" className="flex items-center gap-1">
        <button
          type="button"
          className={navButton}
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="صفحهٔ قبل"
        >
          <IconChevronStart className="size-4" />
        </button>

        {pageRange(page, pageCount, siblings).map((item, index) =>
          item === "gap" ? (
            <span
              key={`gap-${index}`}
              aria-hidden
              className="inline-grid size-8.5 place-items-center text-xs text-ink-subtle"
            >
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              aria-label={`صفحهٔ ${formatNumber(item)}`}
              aria-current={item === page ? "page" : undefined}
              className={cn(
                "tnum inline-flex size-8.5 items-center justify-center rounded-lg text-[13px] font-medium transition-colors focus-ring",
                item === page
                  ? "bg-brand text-brand-ink shadow-xs"
                  : "text-ink-muted hover:bg-surface-alt hover:text-ink",
              )}
            >
              {formatNumber(item)}
            </button>
          ),
        )}

        <button
          type="button"
          className={navButton}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="صفحهٔ بعد"
        >
          <IconChevronEnd className="size-4" />
        </button>
      </nav>
    </div>
  );
}
