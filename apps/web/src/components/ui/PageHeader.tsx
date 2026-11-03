import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { IconChevronEnd } from "@/components/icons";

/**
 * سربدنهٔ صفحه — الگوی یکدست عنوان/توضیح/کنش‌ها برای همهٔ ۴۵+ صفحهٔ سامانه.
 *
 * پیش از این هر صفحه هدر را با `<div className="flex flex-wrap items-center
 * justify-between gap-3">` و کلاس‌های رنگی خام بازسازی می‌کرد. اینجا همان ساختار
 * به یک جزء تبدیل شده، با مسیر راهنما (breadcrumb) اختیاری و ردیف ابزار زیر عنوان.
 */

export type Crumb = { label: ReactNode; href?: string };

export function Breadcrumbs({
  items,
  className,
  markLastAsCurrent = true,
}: {
  items: Crumb[];
  className?: string;
  /**
   * آیا آخرین قلم، «صفحهٔ جاری» است (غیرقابل کلیک و با aria-current="page")؟
   *
   * وقتی پوستهٔ برنامه عنوان صفحه را جداگانه نمایش می‌دهد، این مقدار را
   * false می‌گذاریم و فقط اجداد را پاس می‌دهیم — وگرنه نام صفحهٔ جاری دو بار
   * پشت‌سرهم دیده می‌شود و aria-current روی عنصر تکراری می‌نشیند.
   */
  markLastAsCurrent?: boolean;
}) {
  if (!items.length) return null;
  return (
    <nav aria-label="مسیر راهنما" className={cn("min-w-0", className)}>
      <ol className="flex flex-wrap items-center gap-1 text-xs text-ink-subtle">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          const current = last && markLastAsCurrent;
          return (
            <li key={index} className="flex min-w-0 items-center gap-1">
              {item.href && !current ? (
                <Link
                  href={item.href}
                  className="truncate rounded transition-colors hover:text-ink focus-ring"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={current ? "page" : undefined}
                  className={cn("truncate", current && "font-medium text-ink-muted")}
                >
                  {item.label}
                </span>
              )}
              {!last && (
                <IconChevronEnd aria-hidden className="size-3.5 shrink-0 opacity-50 rtl:rotate-180" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PageHeader({
  title,
  description,
  icon,
  actions,
  breadcrumbs,
  toolbar,
  meta,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: Crumb[];
  /** نوار ابزار (جست‌وجو/فیلتر) زیر عنوان — در موبایل زیر کنش‌ها می‌شکند */
  toolbar?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("space-y-4", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          {icon && (
            <span
              aria-hidden
              className="grid size-11 shrink-0 place-items-center rounded-2xl border border-brand-line bg-brand-soft text-brand-soft-ink [&>svg]:size-5"
            >
              {icon}
            </span>
          )}
          <div className="min-w-0 space-y-1">
            <h1 className="text-xl font-bold tracking-tight text-ink sm:text-[22px]">{title}</h1>
            {description && (
              <p className="max-w-2xl text-[13px] leading-relaxed text-ink-muted">{description}</p>
            )}
            {meta && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5">{meta}</div>}
          </div>
        </div>

        {actions && (
          <div className="flex flex-wrap items-center gap-2 lg:shrink-0">{actions}</div>
        )}
      </div>

      {toolbar && (
        <div className="flex flex-col gap-3 border-t border-line pt-4 md:flex-row md:items-center md:justify-between">
          {toolbar}
        </div>
      )}
    </header>
  );
}

/** نوار ابزار — جست‌وجو، فیلترها در ابتدا و کنش‌های ثانویه در انتها */
export function Toolbar({
  children,
  actions,
  className,
}: {
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
      {actions && <div className="ms-auto flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
