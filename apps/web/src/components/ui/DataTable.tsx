"use client";

import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { IconChevronDown, IconSort } from "@/components/icons";
import { Checkbox } from "./Form";
import { EmptyState, ErrorState, Skeleton } from "./Feedback";
import { Pagination } from "./Pagination";

/**
 * جدول داده — جزء اصلی نمایش فهرست‌ها در همهٔ صفحات.
 *
 * امضای قبلی (`columns/rows/rowKey/loading/error/emptyMessage/onRowClick/dense`)
 * بدون تغییر حفظ شده تا صفحه‌های موجود نشکنند؛ امکانات زیر افزوده شده است:
 *  - مرتب‌سازی ستونی (با `sortValue`) و چرخهٔ صعودی → نزولی → بدون ترتیب
 *  - صفحه‌بندی اختیاری با جزء Pagination
 *  - ردیف‌های اسکلتونی هنگام بارگذاری (به‌جای یک متن ساده) که پرش چیدمان ندارند
 *  - انتخاب ردیف‌ها (اختیاری) با «انتخاب همه» در سربدنه
 *  - حالت‌های خالی/خطا با اجزای استاندارد EmptyState/ErrorState
 *
 * تراز ستون‌ها منطقی است (text-start/end)؛ در RTL دقیقاً همان نتیجهٔ قبلی
 * (راست/چپ) را می‌دهد ولی بدون هاردکد جهت.
 */
export type Column<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
  headerClassName?: string;
  /** عرض ستون (مثل "w-40" یا "min-w-[8rem]") */
  width?: string;
  /** اگر تابع داده شود، ستون قابل مرتب‌سازی است */
  sortValue?: (row: T) => string | number | null | undefined;
};

const ALIGN: Record<NonNullable<Column<unknown>["align"]>, string> = {
  start: "text-start",
  center: "text-center",
  end: "text-end",
};

type SortState = { key: string; dir: "asc" | "desc" } | null;

export type DataTablePagination = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  error = null,
  emptyMessage = "داده‌ای یافت نشد",
  emptyDescription,
  emptyIcon,
  emptyAction,
  onRowClick,
  dense = false,
  id,
  className,
  tableClassName,
  toolbar,
  footer,
  pagination,
  defaultSort,
  sort,
  onSortChange,
  selectable = false,
  selectedKeys,
  onSelectedChange,
  skeletonRows = 6,
  stickyHeader = true,
  striped = false,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string | number;
  loading?: boolean;
  error?: ReactNode;
  emptyMessage?: ReactNode;
  emptyDescription?: ReactNode;
  emptyIcon?: ReactNode;
  emptyAction?: ReactNode;
  onRowClick?: (row: T) => void;
  dense?: boolean;
  /** روی ظرف ریشه قرار می‌گیرد؛ برای صادرات PDF با `tableId` استفاده می‌شود */
  id?: string;
  className?: string;
  tableClassName?: string;
  toolbar?: ReactNode;
  footer?: ReactNode;
  pagination?: DataTablePagination;
  defaultSort?: SortState;
  /** مرتب‌سازی کنترل‌شده (اختیاری) */
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  selectable?: boolean;
  selectedKeys?: (string | number)[];
  onSelectedChange?: (keys: (string | number)[]) => void;
  skeletonRows?: number;
  stickyHeader?: boolean;
  striped?: boolean;
}) {
  const [innerSort, setInnerSort] = useState<SortState>(defaultSort ?? null);
  const activeSort = sort !== undefined ? sort : innerSort;

  const setSort = (next: SortState): void => {
    if (sort === undefined) setInnerSort(next);
    onSortChange?.(next);
  };

  const toggleSort = (column: Column<T>): void => {
    if (!column.sortValue) return;
    if (activeSort?.key !== column.key) {
      setSort({ key: column.key, dir: "asc" });
      return;
    }
    if (activeSort.dir === "asc") {
      setSort({ key: column.key, dir: "desc" });
      return;
    }
    setSort(null);
  };

  const visibleRows = useMemo(() => {
    if (!activeSort) return rows;
    const column = columns.find((c) => c.key === activeSort.key);
    if (!column?.sortValue) return rows;
    const factor = activeSort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = column.sortValue?.(a);
      const bv = column.sortValue?.(b);
      // مقادیر تهی همیشه در انتها، فارغ از جهت مرتب‌سازی
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
      return String(av).localeCompare(String(bv), "fa") * factor;
    });
  }, [rows, columns, activeSort]);

  const pad = dense ? "px-3 py-2" : "px-4 py-3";
  const selected = selectedKeys ?? [];
  const allSelected =
    selectable && visibleRows.length > 0 && selected.length === visibleRows.length;

  const toggleAll = (): void => {
    if (!onSelectedChange) return;
    onSelectedChange(allSelected ? [] : visibleRows.map((row, index) => rowKey(row, index)));
  };

  const toggleRow = (key: string | number): void => {
    if (!onSelectedChange) return;
    onSelectedChange(
      selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key],
    );
  };

  const columnCount = columns.length + (selectable ? 1 : 0);

  return (
    <div
      id={id}
      className={cn(
        "overflow-hidden rounded-2xl border border-line bg-surface shadow-xs",
        className,
      )}
    >
      {toolbar && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          {toolbar}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className={cn("w-full border-collapse text-sm", tableClassName)}>
          <thead
            className={cn(
              "bg-surface-alt",
              stickyHeader && "sticky top-0 z-10 shadow-[inset_0_-1px_0_var(--line)]",
            )}
          >
            <tr>
              {selectable && (
                <th scope="col" className={cn("w-10 ps-4", pad)}>
                  <Checkbox
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="انتخاب همهٔ ردیف‌ها"
                  />
                </th>
              )}
              {columns.map((column) => {
                const sortable = Boolean(column.sortValue);
                const isActive = activeSort?.key === column.key;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={
                      isActive ? (activeSort?.dir === "asc" ? "ascending" : "descending") : undefined
                    }
                    className={cn(
                      pad,
                      "whitespace-nowrap text-[12.5px] font-semibold text-ink-muted",
                      ALIGN[column.align ?? "start"],
                      column.width,
                      column.headerClassName,
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className={cn(
                          "group inline-flex items-center gap-1 rounded transition-colors hover:text-ink focus-ring",
                          isActive && "text-brand-soft-ink",
                          column.align === "end" && "flex-row-reverse",
                        )}
                      >
                        {column.header}
                        {isActive ? (
                          <IconChevronDown
                            className={cn(
                              "size-3.5 transition-transform",
                              activeSort?.dir === "asc" && "rotate-180",
                            )}
                          />
                        ) : (
                          <IconSort className="size-3.5 opacity-0 transition-opacity group-hover:opacity-50" />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-line">
            {loading &&
              Array.from({ length: skeletonRows }).map((_, rowIndex) => (
                <tr key={`skeleton-${rowIndex}`} aria-hidden>
                  {selectable && (
                    <td className={pad}>
                      <Skeleton className="size-4.5 rounded-[5px]" />
                    </td>
                  )}
                  {columns.map((column, cellIndex) => (
                    <td key={column.key} className={pad}>
                      <Skeleton
                        className={cn("h-3.5", cellIndex === 0 ? "w-28" : cellIndex % 2 ? "w-16" : "w-24")}
                      />
                    </td>
                  ))}
                </tr>
              ))}

            {!loading && error && (
              <tr>
                <td colSpan={columnCount} className="p-0">
                  <ErrorState message={error} compact />
                </td>
              </tr>
            )}

            {!loading && !error && visibleRows.length === 0 && (
              <tr>
                <td colSpan={columnCount} className="p-0">
                  <EmptyState
                    title={emptyMessage}
                    description={emptyDescription}
                    icon={emptyIcon}
                    action={emptyAction}
                    compact
                  />
                </td>
              </tr>
            )}

            {!loading &&
              !error &&
              visibleRows.map((row, rowIndex) => {
                const key = rowKey(row, rowIndex);
                const isSelected = selected.includes(key);
                return (
                  <tr
                    key={key}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    aria-selected={selectable ? isSelected : undefined}
                    className={cn(
                      "transition-colors",
                      onRowClick && "cursor-pointer",
                      isSelected
                        ? "bg-brand-soft"
                        : striped && rowIndex % 2 === 1
                          ? "bg-surface-alt"
                          : "hover:bg-surface-hover",
                    )}
                  >
                    {selectable && (
                      <td
                        className={cn(pad, "w-10 ps-4")}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <Checkbox
                          checked={isSelected}
                          onChange={() => toggleRow(key)}
                          aria-label="انتخاب ردیف"
                        />
                      </td>
                    )}
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={cn(
                          pad,
                          "align-middle text-[13.5px] text-ink",
                          ALIGN[column.align ?? "start"],
                          column.width,
                          column.className,
                        )}
                      >
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {footer && (
        <div className="border-t border-line bg-surface-alt px-4 py-3 text-[13px]">{footer}</div>
      )}

      {pagination && !loading && !error && <Pagination {...pagination} />}
    </div>
  );
}
