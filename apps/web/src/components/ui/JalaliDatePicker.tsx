"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  JALALI_MONTHS,
  JALALI_WEEKDAYS,
  formatJalali,
  gregorianToJalali,
  jalaliMonthLength,
  jalaliToISO,
  todayJalali,
  toPersianDigits,
  type JalaliDate,
} from "@/lib/date";
import { cn } from "@/lib/cn";
import { CONTROL, CONTROL_SIZES, stateClass, type ControlSize } from "@/components/ui/Form";
import { IconCalendar, IconChevronEnd, IconChevronStart } from "@/components/icons";

type JalaliDatePickerProps = {
  /** رشتهٔ ISO میلادی (YYYY-MM-DD) یا Date — مقدار جاری */
  value?: string | Date | null;
  /** با رشتهٔ ISO میلادی فراخوانی می‌شود (یا null وقتی پاک شود) */
  onChange: (iso: string | null) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  /** هم‌اندازهٔ Input/Select — تا ردیف فرم هم‌تراز بماند */
  size?: ControlSize;
  className?: string;
};

/** عنوان کامل یک روز برای صفحه‌خوان: «۱۲ خرداد ۱۴۰۵» */
function dayLabel(jd: JalaliDate): string {
  return `${toPersianDigits(jd.jd)} ${JALALI_MONTHS[jd.jm - 1]} ${toPersianDigits(jd.jy)}`;
}

/**
 * انتخابگر تاریخ جلالی (شمسی).
 *
 * مقدار خروجی یک رشتهٔ ISO میلادی (YYYY-MM-DD) است که مستقیماً به API
 * ارسال می‌شود؛ ورودی هم می‌تواند ISO یا Date باشد. تقویم بازشو با ناوبری
 * ماه/سال، ارقام فارسی و چیدمان شنبه-آغاز.
 *
 * این جزء بخشی از سیستم طراحی است:
 *  - دکمهٔ بازکننده دقیقاً کلاس‌های `Input` را دارد (CONTROL + CONTROL_SIZES)،
 *    پس در ردیف فرم هم‌ارتفاع و هم‌حاشیه است.
 *  - ناوبری با صفحه‌کلید: جهت‌ها بین روزها، PageUp/PageDown بین ماه‌ها.
 *  - مدیریت تمرکز: هنگام باز شدن روی روز مناسب می‌رود و هنگام بستن،
 *    تمرکز به دکمهٔ بازکننده برمی‌گردد.
 *  - هر روز برچسب کامل فارسی دارد (`aria-label`) و امروز `aria-current="date"`.
 */
export function JalaliDatePicker({
  value,
  onChange,
  placeholder = "انتخاب تاریخ",
  min,
  max,
  disabled = false,
  invalid,
  id,
  size = "md",
  className,
}: JalaliDatePickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /** روزی که پس از تغییر ماه باید تمرکز بگیرد (ناوبری با PageUp/PageDown) */
  const pendingFocus = useRef<number | null>(null);

  // مقدار جاری به جلالی
  const selected: JalaliDate | null = useMemo(() => {
    if (!value) return null;
    return gregorianToJalali(value);
  }, [value]);

  // ماه/سال نمایش داده‌شده در تقویم (پیش‌فرض: ماهِ مقدار انتخابی یا امروز)
  const [view, setView] = useState<JalaliDate>(selected ?? todayJalali());
  useEffect(() => {
    if (selected) setView(selected);
  }, [selected]);

  const focusDay = (day: number): void => {
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${day}"]`)?.focus();
  };

  // بستن با کلیک بیرون / Escape، و بازگرداندن تمرکز به دکمهٔ بازکننده
  useEffect(() => {
    if (!open) return;
    const close = (): void => {
      setOpen(false);
      triggerRef.current?.focus();
    };
    const onDoc = (event: MouseEvent): void => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.stopPropagation();
        close();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // هنگام باز شدن، تمرکز روی روزِ انتخابی (یا امروز) می‌رود
  useEffect(() => {
    if (!open) return;
    const target = selected && selected.jy === view.jy && selected.jm === view.jm ? selected.jd : null;
    if (target) focusDay(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // پس از تغییر ماه (ناوبری صفحه‌کلیدی)، روزِ مقصود را متمرکز کن
  useEffect(() => {
    if (!open || pendingFocus.current == null) return;
    const day = pendingFocus.current;
    pendingFocus.current = null;
    const frame = requestAnimationFrame(() => focusDay(day));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, open]);

  const dayCount = jalaliMonthLength(view.jy, view.jm);

  // روز اول این ماه جلالی چه روزِ هفته‌ای است؟ (۰ = شنبه)
  const firstWeekday = useMemo(() => {
    const firstIso = jalaliToISO(view.jy, view.jm, 1);
    if (!firstIso) return 0;
    const d = new Date(firstIso + "T00:00:00");
    // getDay: 0=یکشنبه..6=شنبه. چیدمان ایرانی شنبه-آغاز: شنبه(6)->0، یکشنبه(0)->1 ...
    return (d.getDay() + 1) % 7;
  }, [view.jy, view.jm]);

  const isDisabled = (jd: number): boolean => {
    const iso = jalaliToISO(view.jy, view.jm, jd);
    if (!iso) return true;
    if (min && iso < min.slice(0, 10)) return true;
    if (max && iso > max.slice(0, 10)) return true;
    return false;
  };

  const pick = (jd: number): void => {
    const iso = jalaliToISO(view.jy, view.jm, jd);
    onChange(iso);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const prevMonth = (): void =>
    setView((v) => (v.jm === 1 ? { jy: v.jy - 1, jm: 12, jd: 1 } : { ...v, jm: v.jm - 1 }));
  const nextMonth = (): void =>
    setView((v) => (v.jm === 12 ? { jy: v.jy + 1, jm: 1, jd: 1 } : { ...v, jm: v.jm + 1 }));

  /** ناوبری با صفحه‌کلید در شبکهٔ روزها (RTL: راست = روزِ قبل) */
  const onGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const current = Number((event.target as HTMLElement).dataset.day ?? 0);
    if (!current) return;

    if (event.key === "PageUp") {
      event.preventDefault();
      pendingFocus.current = Math.min(current, jalaliMonthLength(view.jm === 1 ? view.jy - 1 : view.jy, view.jm === 1 ? 12 : view.jm - 1));
      prevMonth();
      return;
    }
    if (event.key === "PageDown") {
      event.preventDefault();
      pendingFocus.current = Math.min(current, jalaliMonthLength(view.jm === 12 ? view.jy + 1 : view.jy, view.jm === 12 ? 1 : view.jm + 1));
      nextMonth();
      return;
    }

    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = current - 1;
        break;
      case "ArrowLeft":
        next = current + 1;
        break;
      case "ArrowUp":
        next = current - 7;
        break;
      case "ArrowDown":
        next = current + 7;
        break;
      case "Home":
        next = 1;
        break;
      case "End":
        next = dayCount;
        break;
      default:
        return;
    }
    event.preventDefault();

    if (next < 1) {
      // رفتن به روزهای پایانی ماه قبل
      pendingFocus.current = jalaliMonthLength(view.jm === 1 ? view.jy - 1 : view.jy, view.jm === 1 ? 12 : view.jm - 1) + next;
      if (pendingFocus.current < 1) pendingFocus.current = 1;
      prevMonth();
      return;
    }
    if (next > dayCount) {
      pendingFocus.current = next - dayCount;
      nextMonth();
      return;
    }
    focusDay(next);
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= dayCount; d++) cells.push(d);

  const today = todayJalali();
  const todayIso = jalaliToISO(today.jy, today.jm, today.jd);
  const selectedIso = value ? (typeof value === "string" ? value.slice(0, 10) : null) : null;

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          CONTROL,
          CONTROL_SIZES[size],
          stateClass(invalid),
          "flex items-center justify-between gap-2 text-start",
          !selected && "text-ink-subtle",
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="truncate">{selected ? formatJalali(selected) : placeholder}</span>
        <IconCalendar className="size-4 shrink-0 text-ink-subtle" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="انتخاب تاریخ"
          className="absolute start-0 z-50 mt-1 w-64 rounded-2xl border border-line bg-surface p-3 shadow-xl animate-scale-in"
        >
          <div className="mb-2 flex items-center justify-between gap-1">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="ماه قبل"
              className="grid size-7 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink focus-ring"
            >
              <IconChevronStart className="size-4" />
            </button>
            <div className="text-sm font-semibold text-ink" aria-live="polite">
              {JALALI_MONTHS[view.jm - 1]} {toPersianDigits(view.jy)}
            </div>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="ماه بعد"
              className="grid size-7 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-hover hover:text-ink focus-ring"
            >
              <IconChevronEnd className="size-4" />
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-0.5">
            {JALALI_WEEKDAYS.map((weekday) => (
              <div key={weekday} className="py-1 text-center text-[11px] font-medium text-ink-subtle">
                {weekday}
              </div>
            ))}
          </div>

          <div ref={gridRef} className="grid grid-cols-7 gap-0.5" onKeyDown={onGridKeyDown}>
            {cells.map((day, index) => {
              if (day === null) return <div key={`empty-${index}`} />;
              const iso = jalaliToISO(view.jy, view.jm, day);
              const isSelected = Boolean(iso) && iso === selectedIso;
              const isToday = Boolean(iso) && iso === todayIso;
              const dayIsDisabled = isDisabled(day);
              return (
                <button
                  key={day}
                  type="button"
                  data-day={day}
                  disabled={dayIsDisabled}
                  onClick={() => pick(day)}
                  aria-label={dayLabel({ jy: view.jy, jm: view.jm, jd: day })}
                  aria-current={isToday ? "date" : undefined}
                  aria-pressed={isSelected}
                  className={cn(
                    "h-8 rounded-lg text-xs transition-colors focus-ring",
                    isSelected
                      ? "bg-brand font-semibold text-brand-ink"
                      : dayIsDisabled
                        ? "cursor-not-allowed text-ink-subtle opacity-50"
                        : isToday
                          ? "bg-brand-soft font-medium text-brand-soft-ink"
                          : "text-ink hover:bg-surface-hover",
                  )}
                >
                  <span className="tnum">{toPersianDigits(day)}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
            <button
              type="button"
              onClick={() => {
                onChange(jalaliToISO(today.jy, today.jm, today.jd));
                setOpen(false);
                triggerRef.current?.focus();
              }}
              className="rounded text-xs font-medium text-brand-soft-ink transition-colors hover:underline focus-ring"
            >
              امروز
            </button>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className="rounded text-xs text-ink-muted transition-colors hover:text-danger-ink hover:underline focus-ring"
              >
                پاک کردن
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
