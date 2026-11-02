"use client";

import type { ReactNode } from "react";

/**
 * جدول دادهٔ بازusable با حالت‌های بارگذاری/خطا/خالی و سرصفحهٔ چسبنده.
 * ستون‌ها به‌صورت声明ی تعریف می‌شوند (کلید، عنوان، تابع رندر، اختیاری: تراز/عرض).
 * این کامپوننت الگوی تکراری «bg-white border rounded-2xl + table» را در ده‌ها صفحه
 * یکسان می‌کند و حالت‌های خالی/خطا را استاندارد می‌سازد.
 */
export type Column<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
};

const ALIGN: Record<NonNullable<Column<unknown>["align"]>, string> = {
  start: "text-right",
  center: "text-center",
  end: "text-left",
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  error = null,
  emptyMessage = "داده‌ای یافت نشد",
  onRowClick,
  dense = false,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: ReactNode;
  emptyMessage?: ReactNode;
  onRowClick?: (row: T) => void;
  dense?: boolean;
}) {
  const pad = dense ? "p-2" : "p-3";
  return (
    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-[#1f2937] rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-[#0b1220] sticky top-0 z-10">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={`${pad} font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap ${ALIGN[c.align ?? "start"]} ${c.className ?? ""}`}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-[#1f2937]">
            {loading && (
              <tr>
                <td colSpan={columns.length} className={`${pad} text-center text-slate-500`}>
                  در حال بارگذاری...
                </td>
              </tr>
            )}
            {!loading && error && (
              <tr>
                <td colSpan={columns.length} className={`${pad} text-center text-rose-600`}>
                  {error}
                </td>
              </tr>
            )}
            {!loading && !error && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className={`${pad} text-center text-slate-500`}>
                  {emptyMessage}
                </td>
              </tr>
            )}
            {!loading &&
              !error &&
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`hover:bg-slate-50 dark:hover:bg-[#1f2937] ${onRowClick ? "cursor-pointer" : ""}`}
                >
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`${pad} text-slate-800 dark:text-slate-200 ${ALIGN[c.align ?? "start"]} ${c.className ?? ""}`}
                    >
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
