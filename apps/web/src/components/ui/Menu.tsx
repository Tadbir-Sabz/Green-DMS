"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

/**
 * منوی بازشو، راهنمای شناور و آواتار.
 *
 * منو با کلیک بیرون و Escape بسته می‌شود، با `aria-expanded`/`aria-haspopup`
 * وضعیتش را اعلام می‌کند و در RTL از لبهٔ منطقی (end) باز می‌شود.
 * راهنمای شناور صرفاً CSS است (بدون وابستگی) و برای دکمه‌های فقط-آیکون کاربرد دارد.
 */

/* ------------------------------ Dropdown -------------------------------- */

export type MenuItem = {
  key: string;
  label: ReactNode;
  icon?: ReactNode;
  onSelect?: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
  dividerBefore?: boolean;
};

export function Dropdown({
  trigger,
  items,
  label,
  align = "end",
  width = "w-56",
  className,
}: {
  trigger: (props: { open: boolean; toggle: () => void; ref: React.Ref<HTMLButtonElement> }) => ReactNode;
  items: MenuItem[];
  label: string;
  align?: "start" | "end";
  width?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setActive((prev) => {
          const enabled = items.map((it, i) => ({ it, i })).filter((x) => !x.it.disabled);
          if (!enabled.length) return -1;
          const pos = enabled.findIndex((x) => x.i === prev);
          const next =
            event.key === "ArrowDown"
              ? enabled[(pos + 1 + enabled.length) % enabled.length]
              : enabled[(pos - 1 + enabled.length) % enabled.length];
          return next.i;
        });
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, items]);

  const run = (item: MenuItem): void => {
    if (item.disabled) return;
    setOpen(false);
    setActive(-1);
    item.onSelect?.();
  };

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      {trigger({
        open,
        toggle: () => {
          setOpen((v) => !v);
          setActive(-1);
        },
        ref: buttonRef,
      })}

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={cn(
            "absolute top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-line bg-surface p-1.5 shadow-lg animate-scale-in",
            width,
            align === "end" ? "end-0" : "start-0",
          )}
        >
          {items.map((item, index) => (
            <div key={item.key}>
              {item.dividerBefore && <div aria-hidden className="my-1.5 h-px bg-line" />}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                tabIndex={active === index ? 0 : -1}
                onMouseEnter={() => setActive(index)}
                onClick={() => run(item)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-start text-[13px] font-medium transition-colors",
                  "disabled:cursor-not-allowed disabled:opacity-45",
                  item.tone === "danger"
                    ? "text-danger-ink hover:bg-danger-soft"
                    : "text-ink-muted hover:bg-surface-hover hover:text-ink",
                  active === index && !item.disabled && (item.tone === "danger" ? "bg-danger-soft" : "bg-surface-hover"),
                )}
              >
                {item.icon && <span className="shrink-0 [&>svg]:size-4">{item.icon}</span>}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- Tooltip -------------------------------- */

export function Tooltip({
  content,
  children,
  side = "bottom",
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom" | "start" | "end";
  className?: string;
}) {
  const position = {
    top: "bottom-[calc(100%+6px)] start-1/2 -translate-x-1/2",
    bottom: "top-[calc(100%+6px)] start-1/2 -translate-x-1/2",
    start: "end-[calc(100%+6px)] top-1/2 -translate-y-1/2",
    end: "start-[calc(100%+6px)] top-1/2 -translate-y-1/2",
  }[side];

  return (
    <span className={cn("group/tt relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-[60] whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-medium",
          "bg-ink text-canvas opacity-0 shadow-md transition-opacity duration-150",
          "group-hover/tt:opacity-100 group-focus-within/tt:opacity-100",
          position,
        )}
      >
        {content}
      </span>
    </span>
  );
}

/* -------------------------------- Avatar -------------------------------- */

const AVATAR_TONES = {
  brand: "bg-brand-soft text-brand-soft-ink",
  neutral: "bg-neutral-soft text-neutral-ink",
  info: "bg-info-soft text-info-ink",
  success: "bg-success-soft text-success-ink",
  warning: "bg-warning-soft text-warning-ink",
  danger: "bg-danger-soft text-danger-ink",
} as const;

/** حروف اولیهٔ نام کاربری — سازگار با RTL و بدون تصویر */
export function initials(name?: string | null): string {
  if (!name) return "؟";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "؟";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[1][0]}`;
}

export function Avatar({
  name,
  size = "md",
  tone = "brand",
  className,
}: {
  name?: string | null;
  size?: "sm" | "md" | "lg";
  tone?: keyof typeof AVATAR_TONES;
  className?: string;
}) {
  const dimension = { sm: "size-7 text-[11px]", md: "size-9 text-xs", lg: "size-11 text-sm" }[size];
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full font-semibold ring-1 ring-line",
        dimension,
        AVATAR_TONES[tone],
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
