import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * کارت — ظرف استاندارد هر بلوک محتوا (KPI، فرم، جدول، نمودار).
 *
 * به‌جای تکرار «bg-white rounded-2xl border shadow-sm» در ده‌ها صفحه، یک ظرف
 * واحد با سربدنه/پیکره/پانوشت اختیاری. `as="div" | "section" | Link` و حالت
 * `interactive` برای کارت‌های کلیک‌شدنی (مثل دسترسی سریع داشبورد).
 */
const CARD_BASE =
  "rounded-2xl border border-line bg-surface shadow-xs overflow-hidden";

type CardProps = ComponentPropsWithoutRef<"div"> & {
  /** کلیک‌پذیر بودن: حاشیه و سایه در hover تقویت می‌شود */
  interactive?: boolean;
  padded?: boolean;
};

export function Card({ interactive = false, padded = true, className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        CARD_BASE,
        padded && "p-5",
        interactive &&
          "transition-[box-shadow,transform,border-color] duration-200 hover:shadow-md hover:-translate-y-0.5 hover:border-line-strong",
        className,
      )}
      {...rest}
    />
  );
}

/** کارت لینک‌دار — کل کارت کلیک‌پذیر است ولی انتخاب متن از بین نمی‌رود */
export function CardLink({
  href,
  className,
  children,
  ...rest
}: { href: string; children: ReactNode } & Omit<ComponentPropsWithoutRef<"a">, "href">) {
  return (
    <Link
      href={href}
      className={cn(
        CARD_BASE,
        "block p-5 transition-[box-shadow,transform,border-color] duration-200",
        "hover:shadow-md hover:-translate-y-0.5 hover:border-line-strong focus-ring",
        className,
      )}
      {...rest}
    >
      {children}
    </Link>
  );
}

export function CardHeader({
  title,
  description,
  actions,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-soft-ink">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-ink">{title}</h3>
          {description && (
            <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...rest }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("px-5 py-4", className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-alt/60 px-5 py-3.5",
        className,
      )}
      {...rest}
    />
  );
}

/** عنوان بخش داخل صفحه (بدون قاب کارت) */
export function SectionTitle({
  children,
  actions,
  className,
}: {
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-base font-semibold text-ink">{children}</h2>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
