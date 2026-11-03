import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCheckCircle,
  IconInfo,
  IconLoader,
  IconRefresh,
  IconSearch,
} from "@/components/icons";
import { Button } from "./Button";

/**
 * اجزای بازخورد — وضعیت‌های «در حال بارگذاری / خالی / خطا / اطلاع» به‌شکل یکدست.
 *
 * پیش‌تر هر صفحه این حالت‌ها را با متن ساده و رنگ خام پیاده می‌کرد؛ اینجا
 * اسکلتون شیمردار، حالت خالی با آیکون و راهنما، و هشدارهای معنایی استاندارد شده‌اند.
 */

/* ------------------------------ Spinner -------------------------------- */

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-live="polite" className={cn("inline-flex items-center gap-2", className)}>
      <IconLoader className="size-4 animate-spin text-brand" />
      {label ? <span className="text-[13px] text-ink-muted">{label}</span> : <span className="sr-only">{label ?? "در حال بارگذاری"}</span>}
    </span>
  );
}

/* ----------------------------- Skeleton -------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-md", className)} />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3.5", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  );
}

/** اسکلتون کارت KPI — هم‌اندازهٔ StatCard تا پرش چیدمان رخ ندهد */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-line bg-surface p-5", className)}>
      <Skeleton className="h-3.5 w-24" />
      <Skeleton className="mt-3 h-7 w-32" />
      <Skeleton className="mt-3 h-3 w-40" />
    </div>
  );
}

/* ---------------------------- EmptyState ------------------------------- */

export function EmptyState({
  title = "داده‌ای یافت نشد",
  description,
  icon,
  action,
  className,
  compact = false,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "gap-2 px-4 py-8" : "gap-3 px-6 py-14",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "grid place-items-center rounded-2xl bg-surface-alt text-ink-subtle",
          compact ? "size-9 [&>svg]:size-4.5" : "size-12 [&>svg]:size-6",
        )}
      >
        {icon ?? <IconSearch />}
      </span>
      <div className="space-y-1">
        <p className={cn("font-semibold text-ink", compact ? "text-[13px]" : "text-sm")}>{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-ink-muted">{description}</p>
        )}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** حالت خالی مخصوص «نتیجهٔ جست‌وجو پیدا نشد» */
export function NoResults({ onReset, query }: { onReset?: () => void; query?: string }) {
  return (
    <EmptyState
      icon={<IconSearch />}
      title="نتیجه‌ای یافت نشد"
      description={
        query
          ? `هیچ رکوردی با «${query}» مطابقت نکرد. عبارت دیگری را امتحان کنید یا فیلترها را بردارید.`
          : "فیلترها را تغییر دهید یا جست‌وجوی دیگری امتحان کنید."
      }
      action={
        onReset ? (
          <Button variant="secondary" size="sm" onClick={onReset}>
            <IconRefresh className="size-4" />
            پاک کردن فیلترها
          </Button>
        ) : undefined
      }
      compact
    />
  );
}

/* ----------------------------- ErrorState ------------------------------ */

export function ErrorState({
  message,
  onRetry,
  className,
  compact = false,
}: {
  message?: ReactNode;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        compact ? "px-4 py-6" : "px-6 py-12",
        className,
      )}
    >
      <span aria-hidden className="grid size-11 place-items-center rounded-2xl bg-danger-soft text-danger-ink">
        <IconAlertTriangle className="size-5" />
      </span>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-ink">دریافت داده ناموفق بود</p>
        {message && (
          <p className="mx-auto max-w-md text-[13px] leading-relaxed text-ink-muted">{message}</p>
        )}
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <IconRefresh className="size-4" />
          تلاش دوباره
        </Button>
      )}
    </div>
  );
}

/* -------------------------------- Alert -------------------------------- */

export type AlertTone = "info" | "success" | "warning" | "danger" | "brand";

const ALERT_TONES: Record<AlertTone, { box: string; icon: ReactNode }> = {
  info: { box: "bg-info-soft text-info-ink border-info/25", icon: <IconInfo className="size-4.5" /> },
  success: {
    box: "bg-success-soft text-success-ink border-success/25",
    icon: <IconCheckCircle className="size-4.5" />,
  },
  warning: {
    box: "bg-warning-soft text-warning-ink border-warning/25",
    icon: <IconAlertTriangle className="size-4.5" />,
  },
  danger: {
    box: "bg-danger-soft text-danger-ink border-danger/25",
    icon: <IconAlertCircle className="size-4.5" />,
  },
  brand: {
    box: "bg-brand-soft text-brand-soft-ink border-brand-line",
    icon: <IconInfo className="size-4.5" />,
  },
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const { box, icon } = ALERT_TONES[tone];
  return (
    <div
      role={tone === "danger" || tone === "warning" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-xl border px-4 py-3", box, className)}
    >
      <span aria-hidden className="mt-px shrink-0">
        {icon}
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        {title && <p className="text-[13px] font-semibold">{title}</p>}
        {children && <div className="text-[13px] leading-relaxed opacity-90">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ----------------------------- ProgressBar ----------------------------- */

export function ProgressBar({
  value,
  tone = "brand",
  className,
  label,
}: {
  value: number;
  tone?: "brand" | "success" | "warning" | "danger" | "info";
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const bar = {
    brand: "bg-brand",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    info: "bg-info",
  }[tone];
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-sunken", className)}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500 ease-out", bar)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
