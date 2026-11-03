"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { IconClose } from "@/components/icons";

/**
 * دیالوگ دسترس‌پذیر.
 *
 * امضای قبلی (`open/onClose/title/children/footer/wide`) حفظ شده و `size`
 * به‌عنوان جایگزین دقیق‌ترِ `wide` افزوده شده است. Escape و کلیک روی
 * پس‌زمینه می‌بندند، اسکرول بدنه قفل می‌شود، تمرکز هنگام باز شدن به اولین
 * عنصر تمرکزپذیر می‌رود و هنگام بستن به دکمهٔ راه‌انداز برمی‌گردد.
 */
export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
  full: "max-w-[min(96vw,1200px)]",
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide = false,
  size,
  icon,
  className,
  bodyClassName,
  closeLabel = "بستن",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** @deprecated به‌جای آن `size="lg"` استفاده شود — برای سازگاری نگه داشته شده */
  wide?: boolean;
  size?: ModalSize;
  icon?: ReactNode;
  className?: string;
  bodyClassName?: string;
  closeLabel?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<Element | null>(null);
  // useId به‌جای Math.random: شناسهٔ یکتا و پایدار بین SSR و کلاینت، تا روی
  // id/aria-labelledby hydration mismatch نخوریم.
  const titleId = useId();
  // تازه‌ترین onClose در یک ref نگه داشته می‌شود تا اثرِ مدیریت تمرکز فقط به
  // `open` وابسته باشد. پیش‌تر وابستگی به onClose بود و چون صفحه‌ها onClose را
  // به‌صورت inline پاس می‌دهند، هر رندر والد (مثلاً هر کلید تایپ‌شده در فرمِ
  // داخل مودال) اثر را از نو اجرا می‌کرد: تمرکز به دکمهٔ پشت مودال و سپس به
  // اولین عنصر مودال می‌پرید و تایپ در فرم عملاً ممکن نبود.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    openerRef.current = document.activeElement;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      // نگه‌داشتن تمرکز داخل دیالوگ (focus trap)
      if (event.key === "Tab" && panelRef.current) {
        const nodes = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
        ).filter((el) => el.offsetParent !== null);
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // انتقال تمرکز به اولین کنترل داخل دیالوگ
    const timer = window.setTimeout(() => {
      const target = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (target ?? panelRef.current)?.focus();
    }, 0);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(timer);
      if (openerRef.current instanceof HTMLElement) openerRef.current.focus();
    };
  }, [open]);

  if (!open) return null;

  const resolvedSize = size ?? (wide ? "lg" : "md");

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        // فقط کلیک روی خودِ پرده (نه داخل پنل) ببندد
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div aria-hidden className="fixed inset-0 bg-[#05070c]/55 backdrop-blur-[2px] animate-fade-in" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={typeof title === "string" ? titleId : undefined}
        tabIndex={-1}
        className={cn(
          "relative my-auto w-full overflow-hidden rounded-2xl border border-line bg-surface shadow-xl animate-scale-in focus:outline-none",
          SIZE_CLASS[resolvedSize],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-soft-ink [&>svg]:size-4.5"
              >
                {icon}
              </span>
            )}
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-bold text-ink">
                {title}
              </h2>
              {description && (
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{description}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="-me-1 grid size-8 shrink-0 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink focus-ring"
          >
            <IconClose className="size-4" />
          </button>
        </div>

        <div className={cn("max-h-[70vh] overflow-y-auto px-5 py-4", bodyClassName)}>{children}</div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-alt px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * دیالوگ تأیید عملیات مخرب — الگوی تکراری «آیا مطمئنید؟» در صفحات CRUD.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "تأیید عملیات",
  message,
  confirmLabel = "تأیید",
  cancelLabel = "انصراف",
  tone = "danger",
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  busy?: boolean;
}) {
  // Button در همان لایه تعریف شده؛ برای پرهیز از circular import اینجا
  // از کلاس‌های هم‌ارز استفاده می‌کنیم.
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-line bg-surface px-4 text-sm font-medium text-ink shadow-xs transition-colors hover:bg-surface-alt focus-ring"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium shadow-xs transition-all focus-ring disabled:opacity-50",
              tone === "danger"
                ? "bg-danger text-on-danger hover:brightness-110"
                : "bg-brand text-brand-ink hover:bg-brand-hover",
            )}
          >
            {busy && <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      {message && <p className="text-[13px] leading-relaxed text-ink-muted">{message}</p>}
    </Modal>
  );
}
