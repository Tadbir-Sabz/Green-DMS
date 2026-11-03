import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * نشان (Badge) — جایگزین ده‌ها `STATUS_COLOR` تکراری در صفحات.
 *
 * به‌جای اینکه هر صفحه نگاشت رنگ مخصوص خودش را با کلاس‌های خام
 * (`bg-emerald-100 text-emerald-700 dark:bg-…`) بنویسد، فقط «لحن» معنایی را
 * اعلام می‌کند (success/warning/danger/…) و رنگ از توکن‌ها می‌آید. این یعنی
 * حالت شب، کنتراست و پالت به‌طور خودکار و یکدست درست می‌ماند.
 */
export type BadgeTone =
  | "neutral"
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "outline";

export type BadgeSize = "sm" | "md";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-neutral-soft text-neutral-ink",
  brand: "bg-brand-soft text-brand-soft-ink",
  success: "bg-success-soft text-success-ink",
  warning: "bg-warning-soft text-warning-ink",
  danger: "bg-danger-soft text-danger-ink",
  info: "bg-info-soft text-info-ink",
  outline: "border border-line bg-transparent text-ink-muted",
};

/** رنگ نقطهٔ وضعیت، جدا از زمینه (برای واریانت dot) */
const DOTS: Record<BadgeTone, string> = {
  neutral: "bg-ink-subtle",
  brand: "bg-brand",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  outline: "bg-ink-subtle",
};

const SIZES: Record<BadgeSize, string> = {
  sm: "h-5 px-1.5 text-[11px] gap-1 rounded-md",
  md: "h-6 px-2 text-xs gap-1.5 rounded-lg",
};

export function Badge({
  tone = "neutral",
  size = "md",
  dot = false,
  icon,
  className,
  children,
}: {
  tone?: BadgeTone;
  size?: BadgeSize;
  dot?: boolean;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center font-medium whitespace-nowrap",
        SIZES[size],
        TONES[tone],
        className,
      )}
    >
      {dot && (
        <span
          aria-hidden
          className={cn("size-1.5 shrink-0 rounded-full ring-2 ring-inset", DOTS[tone])}
        />
      )}
      {icon && <span className="shrink-0 [&>svg]:size-3.5">{icon}</span>}
      {children}
    </span>
  );
}

/**
 * نشان وضعیت با نقطهٔ رنگی — الگوی اصلی نمایش وضعیت سند/موجودیت
 * (فعال، معلق، پرداخت‌شده، در انتظار تأیید و…).
 */
export function StatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge tone={tone} dot className={className}>
      {children}
    </Badge>
  );
}

/**
 * نگاشت آمادهٔ وضعیت‌های پرکاربرد دامنه به لحن بصری.
 * صفحات به‌جای تعریف نگاشت رنگ، فقط کلید وضعیت را می‌دهند.
 */
export const STATUS_TONE: Record<string, BadgeTone> = {
  // عمومی
  active: "success",
  enabled: "success",
  open: "info",
  closed: "neutral",
  locked: "warning",
  inactive: "neutral",
  suspended: "warning",
  blocked: "danger",
  cancelled: "neutral",
  canceled: "neutral",
  failed: "danger",
  error: "danger",
  rejected: "danger",
  expired: "danger",
  // فروش و سفارش
  draft: "neutral",
  submitted: "info",
  confirmed: "success",
  approved: "success",
  pending: "warning",
  pending_approval: "warning",
  partially_paid: "warning",
  paid: "success",
  settled: "success",
  posted: "success",
  void: "neutral",
  voided: "neutral",
  // انبار
  counting: "info",
  review: "warning",
  counted: "success",
  planned: "info",
  dispatched: "info",
  in_transit: "info",
  partial: "warning",
  delivered: "success",
  received: "success",
  // تور و بازدید
  warm: "warning",
  cold: "info",
  distribution: "brand",
  telesales: "info",
  order: "success",
  no_order: "neutral",
  payment_only: "info",
  return_only: "warning",
  // یکپارچه‌سازی
  healthy: "success",
  degraded: "warning",
  down: "danger",
};

/** لحن مناسب برای یک وضعیت دامنه (با بازگشت امن به neutral) */
export function toneFor(status: string | null | undefined): BadgeTone {
  if (!status) return "neutral";
  return STATUS_TONE[status] ?? "neutral";
}
