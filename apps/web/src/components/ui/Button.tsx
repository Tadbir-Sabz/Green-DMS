"use client";

import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { IconLoader } from "@/components/icons";

/**
 * دکمه — تنها نقطهٔ تعریف «کنش» در کل سامانه.
 *
 * هفت واریانت بصری با سلسله‌مراتب روشن (primary برای کنش اصلی هر صفحه،
 * secondary/ghost برای کنش‌های فرعی، soft برای تأکید ملایم و danger برای
 * عملیات مخرب) و چهار اندازه. همه از توکن‌های معنایی رنگ می‌گیرند، پس در
 * حالت شب خودکار درست نمایش داده می‌شوند و نیازی به `dark:` ندارند.
 *
 * با `href` به‌جای `<button>` یک `<Link>` رندر می‌کند تا ناوبری کلاینت‌ساید
 * بماند و صفحه رفرش نشود.
 */
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "soft"
  | "ghost"
  | "danger"
  | "danger-soft"
  | "link";

export type ButtonSize = "xs" | "sm" | "md" | "lg" | "icon" | "icon-sm";

const BASE =
  "relative inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap " +
  "rounded-lg transition-[background-color,color,border-color,box-shadow,transform] duration-150 " +
  "select-none focus-ring disabled:pointer-events-none disabled:opacity-50 " +
  "active:translate-y-px";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-brand-ink shadow-xs hover:bg-brand-hover active:bg-brand-active",
  secondary:
    "bg-surface text-ink border border-line shadow-xs hover:bg-surface-alt hover:border-line-strong",
  soft: "bg-brand-soft text-brand-soft-ink hover:bg-brand-soft/70 active:bg-brand-soft",
  ghost: "text-ink-muted hover:bg-surface-hover hover:text-ink",
  danger: "bg-danger text-on-danger shadow-xs hover:brightness-110 active:brightness-95",
  "danger-soft":
    "bg-danger-soft text-danger-ink hover:bg-danger hover:text-on-danger",
  link: "text-brand underline-offset-4 hover:underline px-0 h-auto",
};

const SIZES: Record<ButtonSize, string> = {
  xs: "h-7 px-2.5 text-xs",
  sm: "h-8.5 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-11.5 px-5 text-[15px]",
  icon: "size-10",
  "icon-sm": "size-8.5",
};

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  block?: boolean;
  className?: string;
  children?: ReactNode;
};

type ButtonAsButton = CommonProps &
  Omit<ComponentPropsWithoutRef<"button">, keyof CommonProps> & { href?: undefined };

type ButtonAsLink = CommonProps & {
  href: string;
  target?: string;
  rel?: string;
  prefetch?: boolean;
};

export type ButtonProps = ButtonAsButton | ButtonAsLink;

function classes(variant: ButtonVariant, size: ButtonSize, block?: boolean, className?: string) {
  return cn(BASE, VARIANTS[variant], SIZES[size], block && "w-full", className);
}

export function Button(props: ButtonProps) {
  const { variant = "secondary", size = "md", loading = false, block, className, children } = props;

  if ("href" in props && props.href !== undefined) {
    const { href, target, rel, prefetch } = props;
    return (
      <Link
        href={href}
        target={target}
        rel={rel}
        prefetch={prefetch}
        className={classes(variant, size, block, className)}
      >
        {children}
      </Link>
    );
  }

  const { type = "button", disabled, ...rest } = props as ButtonAsButton;
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classes(variant, size, block, className)}
      {...rest}
    >
      {loading && <IconLoader className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

/** دکمهٔ فقط-آیکون با برچسب دسترس‌پذیر اجباری (aria-label) */
export function IconButton({
  label,
  variant = "ghost",
  size = "icon",
  className,
  ...rest
}: Omit<ButtonAsButton, "children"> & { label: string; children: ReactNode }) {
  return (
    <Button
      variant={variant}
      size={size}
      aria-label={label}
      title={label}
      className={className}
      {...rest}
    />
  );
}
