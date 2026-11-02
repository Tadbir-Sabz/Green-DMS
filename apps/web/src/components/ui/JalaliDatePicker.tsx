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

/**
 * انتخابگر تاریخ جلالی (شمسی). مقدار خروجی یک رشتهٔ ISO میلادی (YYYY-MM-DD)
 * است که مستقیماً به API ارسال می‌شود؛ ورودی هم می‌تواند ISO یا Date باشد.
 * تقویم بازشو با ناوبری ماه/سال، ارقام فارسی و چیدمان شنبه-آغاز.
 */
export function JalaliDatePicker({
  value,
  onChange,
  placeholder = "انتخاب تاریخ",
  min,
  max,
  disabled = false,
  id,
}: {
  /** رشتهٔ ISO میلادی (YYYY-MM-DD) یا Date — مقدار جاری */
  value?: string | Date | null;
  /** با رشتهٔ ISO میلادی فراخوانی می‌شود (یا null وقتی پاک شود) */
  onChange: (iso: string | null) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  // بستن با کلیک بیرون
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const minJ = min ? gregorianToJalali(min) : null;
  const maxJ = max ? gregorianToJalali(max) : null;

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
  };

  const prevMonth = (): void =>
    setView((v) => (v.jm === 1 ? { jy: v.jy - 1, jm: 12, jd: 1 } : { ...v, jm: v.jm - 1 }));
  const nextMonth = (): void =>
    setView((v) => (v.jm === 12 ? { jy: v.jy + 1, jm: 1, jd: 1 } : { ...v, jm: v.jm + 1 }));

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= dayCount; d++) cells.push(d);

  const todayIso = jalaliToISO(todayJalali().jy, todayJalali().jm, todayJalali().jd);
  const selectedIso = value ? (typeof value === "string" ? value.slice(0, 10) : null) : null;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between gap-2 rounded-xl border border-slate-300 dark:border-[#1f2937] bg-white dark:bg-[#0f172a] px-3 py-2 text-sm text-slate-800 dark:text-slate-200 ${disabled ? "opacity-50 cursor-not-allowed" : "hover:border-emerald-400"}`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={selected ? "" : "text-slate-400"}>
          {selected ? formatJalali(selected) : placeholder}
        </span>
        <span aria-hidden className="text-slate-400">📅</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="انتخاب تاریخ"
          className="absolute z-50 mt-1 w-64 rounded-2xl border border-slate-200 dark:border-[#1f2937] bg-white dark:bg-[#111827] p-3 shadow-xl"
        >
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="ماه قبل"
              className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1f2937] text-slate-600 dark:text-slate-300"
            >
              ›
            </button>
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {JALALI_MONTHS[view.jm - 1]} {toPersianDigits(view.jy)}
            </div>
            <button
              type="button"
              onClick={nextMonth}
              aria-label="ماه بعد"
              className="w-7 h-7 rounded-lg hover:bg-slate-100 dark:hover:bg-[#1f2937] text-slate-600 dark:text-slate-300"
            >
              ‹
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {JALALI_WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-[11px] text-slate-400 py-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              if (d === null) return <div key={`e${i}`} />;
              const iso = jalaliToISO(view.jy, view.jm, d);
              const isSel = iso && iso === selectedIso;
              const isToday = iso && iso === todayIso;
              const dis = isDisabled(d);
              return (
                <button
                  key={d}
                  type="button"
                  disabled={dis}
                  onClick={() => pick(d)}
                  className={`h-8 rounded-lg text-xs transition-colors ${
                    isSel
                      ? "bg-emerald-600 text-white font-semibold"
                      : dis
                        ? "text-slate-300 dark:text-slate-600 cursor-not-allowed"
                        : isToday
                          ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                          : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1f2937]"
                  }`}
                >
                  {toPersianDigits(d)}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-[#1f2937]">
            <button
              type="button"
              onClick={() => {
                const t = todayJalali();
                onChange(jalaliToISO(t.jy, t.jm, t.jd));
                setOpen(false);
              }}
              className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
            >
              امروز
            </button>
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="text-xs text-slate-500 hover:underline"
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
