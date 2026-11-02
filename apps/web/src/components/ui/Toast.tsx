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

/**
 * سیستم توست سراسری و سبک (بدون وابستگی خارجی).
 * یک ToastProvider در layout.tsx کل اپ را می‌پوشاند و useToast() در هر صفحه
 * موفقیت/خطا/اطلاع را نشان می‌دهد. جایگزین الگوی پراکندهٔ notice/setNotice و
 * alert() در صفحات. توست‌ها خودکار پس از چند ثانیه محو می‌شوند.
 */

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; message: string };

type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const KIND_STYLE: Record<ToastKind, string> = {
  success:
    "border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200",
  error:
    "border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/40 text-rose-800 dark:text-rose-200",
  info: "border-slate-300 dark:border-slate-600 bg-white dark:bg-[#111827] text-slate-800 dark:text-slate-200",
};

const KIND_ICON: Record<ToastKind, string> = {
  success: "✓",
  error: "⚠",
  info: "ℹ",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
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
      setToasts((prev) => [...prev.slice(-3), { id, kind, message }]);
      const timer = setTimeout(() => dismiss(id), kind === "error" ? 6000 : 3500);
      timers.current.set(id, timer);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push("success", m),
      error: (m) => push("error", m),
      info: (m) => push("info", m),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* ناحیهٔ توست: گوشهٔ پایین-چپ (دور از سایدبار راست در چیدمان RTL) */}
      <div
        className="fixed bottom-4 left-4 z-[100] flex flex-col gap-2 max-w-[min(92vw,380px)]"
        role="region"
        aria-live="polite"
        aria-label="اعلان‌ها"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 shadow-lg text-sm ${KIND_STYLE[t.kind]}`}
          >
            <span aria-hidden className="mt-0.5 shrink-0 font-bold">
              {KIND_ICON[t.kind]}
            </span>
            <span className="flex-1 break-words">{t.message}</span>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="بستن"
              className="shrink-0 opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** دسترسی به API توست. اگر بدون Provider استفاده شود، به no-op امن تنزل می‌کند. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (ctx) return ctx;
  return {
    success: () => {},
    error: () => {},
    info: () => {},
    dismiss: () => {},
  };
}
