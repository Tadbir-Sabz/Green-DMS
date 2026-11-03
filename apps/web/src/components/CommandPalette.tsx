"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { navItems, type NavItem } from "@/lib/navigation";
import { normalizeFa } from "@/lib/text";
import { IconClose, IconSearch } from "@/components/icons";

/**
 * پالت فرمان (Command Palette) — جست‌وجوی سراسری و ناوبری با صفحه‌کلید.
 *
 * با Ctrl/Cmd+K باز می‌شود، روی عنوان/گروه/توضیح آیتم‌ها جست‌وجو می‌کند و با
 * ↑/↓ و Enter کار می‌کند. در سامانه‌ای با ۴۰+ صفحه، این سریع‌ترین راه رسیدن به
 * هر بخش است و نیاز به گشتن در منوی آکاردئونی را از بین می‌برد.
 *
 * نکتهٔ پیاده‌سازی: آیتم‌ها عمداً `<button>` هستند (نه `<a>`) و درون هیچ
 * `<nav>` قرار نمی‌گیرند تا با شمارش لینک‌های منو در تست AppShell تداخل نکنند؛
 * ناوبری با `router.push` انجام می‌شود که کلاینت‌ساید و بدون رفرش است.
 */

// نرمال‌سازی فارسی از کتابخانهٔ مشترک — همان منطقی که فیلتر منوی کناری استفاده
// می‌کند، تا نتیجهٔ جست‌وجو در پالت و در منو یکسان باشد.
const normalize = normalizeFa;

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return navItems.slice(0, 12);
    return navItems
      .map((item) => {
        const haystack = normalize(`${item.label} ${item.group} ${item.hint ?? ""}`);
        let score = -1;
        if (normalize(item.label).startsWith(needle)) score = 0;
        else if (haystack.includes(needle)) score = 1;
        return { item, score };
      })
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => a.score - b.score)
      .slice(0, 12)
      .map((entry) => entry.item);
  }, [query]);

  // با هر تغییر نتیجه، مکان‌نما به ابتدا برمی‌گردد
  useEffect(() => setCursor(0), [query, open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setCursor((prev) => (results.length ? (prev + 1) % results.length : 0));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setCursor((prev) => (results.length ? (prev - 1 + results.length) % results.length : 0));
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const target = results[cursor];
        if (target) go(target);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  });

  // آیتم فعال همیشه در دید بماند
  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${cursor}"]`);
    node?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const go = (item: NavItem): void => {
    onClose();
    router.push(item.href);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center p-4 pt-[12vh]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div aria-hidden className="fixed inset-0 bg-[#05070c]/55 backdrop-blur-[2px] animate-fade-in" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="جست‌وجوی سراسری"
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-surface shadow-xl animate-scale-in"
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <IconSearch className="size-4.5 shrink-0 text-ink-subtle" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="جست‌وجو در صفحه‌ها… (مثلاً فاکتور، خزانه، انبارگردانی)"
            aria-label="جست‌وجوی صفحه‌ها"
            className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 flex-1"
          />
          <kbd className="hidden shrink-0 rounded-md border border-line bg-surface-alt px-1.5 py-0.5 font-mono text-[10px] text-ink-subtle sm:block">
            ESC
          </kbd>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن جست‌وجو"
            className="grid size-7 shrink-0 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-hover hover:text-ink sm:hidden focus-ring"
          >
            <IconClose className="size-4" />
          </button>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-[13px] text-ink-muted">
              نتیجه‌ای برای «{query}» پیدا نشد
            </p>
          ) : (
            results.map((item, index) => {
              const ItemIcon = item.icon;
              const active = index === cursor;
              return (
                <button
                  key={item.href}
                  type="button"
                  data-index={index}
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => go(item)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition-colors",
                    active ? "bg-brand-soft" : "hover:bg-surface-hover",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-8 shrink-0 place-items-center rounded-lg",
                      active ? "bg-brand text-brand-ink" : "bg-surface-alt text-ink-muted",
                    )}
                  >
                    <ItemIcon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-[13px] font-medium", active ? "text-brand-soft-ink" : "text-ink")}>
                      {item.label}
                    </span>
                    <span className="block truncate text-[11px] text-ink-subtle">
                      {item.hint ?? item.group}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-md bg-surface-alt px-1.5 py-0.5 text-[10px] text-ink-subtle">
                    {item.group}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-alt px-4 py-2.5 text-[11px] text-ink-subtle">
          <span className="flex items-center gap-2">
            <Key>↑</Key>
            <Key>↓</Key>
            جابه‌جایی
            <Key>Enter</Key>
            رفتن
          </span>
          <span className="tnum">{results.length} نتیجه</span>
        </div>
      </div>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-surface px-1 py-px font-mono text-[10px] text-ink-muted">
      {children}
    </kbd>
  );
}
