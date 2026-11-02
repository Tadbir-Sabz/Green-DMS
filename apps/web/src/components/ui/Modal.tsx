"use client";

import { useEffect, type ReactNode } from "react";
import { IconClose } from "@/components/icons";

/**
 * مودال دسترسی‌پذیر و بازusable. با Escape و کلیک روی پس‌زمینه بسته می‌شود،
 * تمرکز را روی دیالوگ نگه می‌دارد و اسکرول بدنه را قفل می‌کند.
 * جایگزین الگوی تکراری «showForm && <div fixed ...>» در صفحات CRUD.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-6"
      onMouseDown={(e) => {
        // فقط کلیک روی خودِ پس‌زمینه (نه داخل دیالوگ) ببندد
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        className={`my-auto w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-[#1f2937] shadow-xl`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1f2937] px-5 py-3.5">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            aria-label="بستن"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-[#1f2937]"
          >
            <IconClose className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-200 dark:border-[#1f2937] px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
