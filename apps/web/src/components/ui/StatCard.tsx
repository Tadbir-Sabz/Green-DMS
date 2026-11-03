import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { IconArrowLeft, IconArrowRight, IconChevronEnd } from "@/components/icons";
import { Skeleton } from "./Feedback";

/**
 * کارت شاخص (KPI) — بلوک اصلی داشبوردها.
 *
 * عدد با ارقام جدولی (tabular-nums) نمایش داده می‌شود تا در کنار هم تراز بمانند،
 * آیکون در یک کاشی رنگی معنایی می‌نشیند و روند (دلتا) با جهت و رنگ درست علامت‌گذاری
 * می‌شود. اگر `href` داده شود کل کارت لینک می‌شود (بدون از دست دادن دسترس‌پذیری).
 */
export type StatTone = "brand" | "success" | "warning" | "danger" | "info" | "neutral";

const TONE_CHIP: Record<StatTone, string> = {
  brand: "bg-brand-soft text-brand-soft-ink",
  success: "bg-success-soft text-success-ink",
  warning: "bg-warning-soft text-warning-ink",
  danger: "bg-danger-soft text-danger-ink",
  info: "bg-info-soft text-info-ink",
  neutral: "bg-neutral-soft text-neutral-ink",
};

export type TrendDirection = "up" | "down" | "flat";

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "brand",
  href,
  loading = false,
  trend,
  trendLabel,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: StatTone;
  href?: string;
  loading?: boolean;
  /** جهت روند؛ رنگ بر پایهٔ مثبت/منفی بودن `trendValue` انتخاب می‌شود */
  trend?: TrendDirection;
  trendLabel?: ReactNode;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium leading-snug text-ink-muted">{label}</p>
        {icon && (
          <span
            aria-hidden
            className={cn("grid size-9 shrink-0 place-items-center rounded-xl [&>svg]:size-4.5", TONE_CHIP[tone])}
          >
            {icon}
          </span>
        )}
      </div>

      {loading ? (
        <Skeleton className="mt-3 h-8 w-32" />
      ) : (
        <p className="tnum mt-2.5 text-[26px] font-bold leading-none tracking-tight text-ink">
          {value}
        </p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {trend && trendLabel && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold",
              trend === "flat"
                ? "bg-neutral-soft text-neutral-ink"
                : trend === "up"
                  ? "bg-success-soft text-success-ink"
                  : "bg-danger-soft text-danger-ink",
            )}
          >
            {trend === "up" && <IconArrowLeft className="size-3" strokeWidth={2.4} />}
            {trend === "down" && <IconArrowRight className="size-3" strokeWidth={2.4} />}
            <span className="tnum">{trendLabel}</span>
          </span>
        )}
        {sub && <p className="truncate text-xs text-ink-subtle">{sub}</p>}
      </div>
    </>
  );

  const shell = cn(
    "group relative block rounded-2xl border border-line bg-surface p-5 shadow-xs transition-[box-shadow,transform,border-color] duration-200",
    href && "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md focus-ring",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={shell}>
        {body}
        <IconChevronEnd
          aria-hidden
          className="absolute bottom-4 end-4 size-4 text-ink-subtle opacity-0 transition-opacity duration-200 group-hover:opacity-100 rtl:rotate-180"
        />
      </Link>
    );
  }
  return <div className={shell}>{body}</div>;
}

/** شبکهٔ KPI با تعداد ستون واکنش‌گرا — فاصله‌ها و شکست‌ها یکدست */
export function StatGrid({
  children,
  className,
  cols = 4,
}: {
  children: ReactNode;
  className?: string;
  cols?: 2 | 3 | 4;
}) {
  const colClass = {
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-2 xl:grid-cols-3",
    4: "sm:grid-cols-2 xl:grid-cols-4",
  }[cols];
  return <div className={cn("grid grid-cols-1 gap-4", colClass, className)}>{children}</div>;
}
