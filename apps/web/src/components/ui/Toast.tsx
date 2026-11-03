"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCheckCircle,
  IconClose,
  IconInfo,
} from "@/components/icons";

/**
 * سیستم اعلان سراسری (بدون وابستگی خارجی).
 *
 * یک `ToastProvider` در layout کل اپ را می‌پوشاند و `useToast()` در هر صفحه
 * موفقیت/خطا/هشدار/اطلاع را نشان می‌دهد. API قبلی
 * (`success/error/info/dismiss`) بدون تغییر حفظ شده و `warning` افزوده شده است.
 *
 * اعلان‌ها در گوشهٔ پایین-چپ قرار می‌گیرند: در چیدمان RTL این سمت دور از
 * نوار کناریِ راست است و با محتوا تداخل نمی‌کند. هر اعلان `role="status"`
 * دارد و با `aria-live="polite"` برای صفحه‌خوان announced می‌شود.
 */

export type ToastKind = "success" | "error" | "warning" | "info";
type ToastItem = { id: number; kind: ToastKind; message: string };

export type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const DURATION: Record<ToastKind, number> = {
  success: 3500,
  info: 4000,
  warning: 5500,
  error: 6500,
};

const KIND_STYLE: Record<ToastKind, { box: string; icon: ReactNode }> = {
  success: {
    box: "border-success-line bg-success-soft text-success-ink",
    icon: <IconCheckCircle className="size-4.5" />,
  },
  error: {
    box: "border-danger-line bg-danger-soft text-danger-ink",
    icon: <IconAlertCircle className="size-4.5" />,
  },
  warning: {
    box: "border-warning-line bg-warning-soft text-warning-ink",
    icon: <IconAlertTriangle className="size-4.5" />,
  },
  info: {
    box: "border-info-line bg-info-soft text-info-ink",
    icon: <IconInfo className="size-4.5" />,
  },
};

const KIND_LABEL: Record<ToastKind, string> = {
  success: "موفق",
  error: "خطا",
  warning: "هشدار",
  info: "اطلاع",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = nextId.current++;
      // حداکثر ۴ اعلان هم‌زمان؛ قدیمی‌ترین حذف می‌شود
      setToasts((prev) => [...prev.slice(-3), { id, kind, message }]);
      timers.current.set(id, setTimeout(() => dismiss(id), DURATION[kind]));
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
      warning: (message) => push("warning", message),
      info: (message) => push("info", message),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}

      <div
        className="pointer-events-none fixed bottom-4 end-4 z-[100] flex w-[min(92vw,380px)] flex-col gap-2"
        role="region"
        aria-live="polite"
        aria-label="اعلان‌ها"
      >
        {toasts.map((toast) => {
          const style = KIND_STYLE[toast.kind];
          return (
            <div
              key={toast.id}
              role="status"
              className={cn(
                "pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 shadow-lg animate-slide-in",
                style.box,
              )}
            >
              <span aria-hidden className="mt-px shrink-0">
                {style.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold opacity-70">{KIND_LABEL[toast.kind]}</p>
                <p className="mt-0.5 break-words text-[13px] font-medium leading-relaxed">
                  {toast.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                aria-label="بستن اعلان"
                className="-me-1 grid size-6 shrink-0 place-items-center rounded-md opacity-60 transition-opacity hover:opacity-100 focus-ring"
              >
                <IconClose className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/** دسترسی به API اعلان. بدون Provider به no-op امن تنزل می‌کند. */
export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (context) return context;
  return {
    success: () => {},
    error: () => {},
    warning: () => {},
    info: () => {},
    dismiss: () => {},
  };
}
