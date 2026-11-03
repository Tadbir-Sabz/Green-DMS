"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Form";
import { Alert } from "@/components/ui/Feedback";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { IconChart, IconClose, IconRefresh } from "@/components/icons";
import { formatNumber } from "@/lib/format";

type ReportColumn = { key?: string; title?: string };
type ReportRow = Record<string, unknown>;
type ReportResult = { columns?: ReportColumn[]; rows?: ReportRow[] };

/** آستانهٔ صفحه‌بندی سمت کلاینت — گزارش‌های بزرگ در یک صفحه رندر نمی‌شوند */
const PAGE_SIZE = 50;

/** آیا مقدار عددی است؟ (هم number و هم رشتهٔ اعشاریِ قرارداد) */
function isNumeric(value: unknown): boolean {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string" && value.trim() !== "") return !Number.isNaN(Number(value));
  return false;
}

/**
 * ReportRunner — اجرای گزارش از GET /reports/{key}?from&to&format=json.
 *
 * ستون‌ها سمت سرور تعریف می‌شوند (report-registry) پس وب نیازی به hardcode
 * شکل داده ندارد. این جزء حالا از اجزای استاندارد سیستم طراحی استفاده می‌کند:
 * سربدنهٔ صفحه، کارت فیلتر، DataTable با اسکلتون/حالت خالی، و صفحه‌بندی
 * سمت کلاینت برای گزارش‌های پرحجم.
 */
export function ReportRunner({
  reportKey,
  title,
  subtitle,
  filename,
}: {
  reportKey: string;
  title: string;
  subtitle?: string;
  filename: string;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const tableId = `${filename}-table`;

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["report", reportKey, from, to],
    queryFn: async () => {
      const query: { from?: string; to?: string; format: "json" } = { format: "json" };
      if (from) query.from = from;
      if (to) query.to = to;
      const res = await api.GET("/reports/{key}", {
        params: { path: { key: reportKey }, query },
      });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data ?? { columns: [], rows: [] }) as ReportResult;
    },
  });

  const columns = data?.columns ?? [];
  const rows = data?.rows ?? [];

  // با تغییر فیلتر، به صفحهٔ اول برگرد
  const setRange = (nextFrom: string, nextTo: string): void => {
    setFrom(nextFrom);
    setTo(nextTo);
    setPage(1);
  };

  const tableColumns = useMemo<Column<ReportRow>[]>(
    () =>
      columns.map((column, index) => ({
        key: column.key ?? `col-${index}`,
        header: column.title ?? column.key ?? "",
        // ستون عددی: چپ‌چین (end در RTL) با ارقام جدولی
        align: rows.some((row) => column.key && isNumeric(row[column.key])) ? "end" : "start",
        sortValue: (row) => {
          const value = column.key ? row[column.key] : null;
          if (value == null) return null;
          return isNumeric(value) ? Number(value) : String(value);
        },
        render: (row) => {
          const value = column.key ? row[column.key] : "";
          if (value == null || value === "") return <span className="text-ink-subtle">—</span>;
          if (isNumeric(value)) {
            return <span className="tnum">{formatNumber(Number(value))}</span>;
          }
          return <span className="whitespace-nowrap">{String(value)}</span>;
        },
      })),
    [columns, rows],
  );

  const paginated = rows.length > PAGE_SIZE;
  const pageRows = paginated
    ? rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    : rows;

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={subtitle}
        icon={<IconChart />}
        actions={
          <>
            {isFetching && !isLoading && (
              <span className="flex items-center gap-1.5 text-[11px] text-ink-subtle">
                <IconRefresh className="size-3.5 animate-spin" />
                در حال به‌روزرسانی
              </span>
            )}
            <ExportButtons data={rows} tableId={tableId} filename={filename} />
          </>
        }
        toolbar={
          <>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="از تاریخ" htmlFor={`${filename}-from`} className="w-40">
                <Input
                  id={`${filename}-from`}
                  type="date"
                  value={from}
                  onChange={(event) => setRange(event.target.value, to)}
                />
              </Field>
              <Field label="تا تاریخ" htmlFor={`${filename}-to`} className="w-40">
                <Input
                  id={`${filename}-to`}
                  type="date"
                  value={to}
                  onChange={(event) => setRange(from, event.target.value)}
                />
              </Field>
              {(from || to) && (
                <Button variant="ghost" size="md" onClick={() => setRange("", "")}>
                  <IconClose className="size-4" />
                  پاک کردن فیلتر
                </Button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button variant="secondary" size="md" onClick={() => void refetch()} loading={isFetching}>
                <IconRefresh className="size-4" />
                اجرای دوباره
              </Button>
              {!isLoading && !error && (
                <span className="tnum text-xs text-ink-subtle">
                  {formatNumber(rows.length)} رکورد
                </span>
              )}
            </div>
          </>
        }
      />

      {error && (
        <Alert tone="danger" title="اجرای گزارش ناموفق بود">
          {(error as Error).message}
        </Alert>
      )}

      {isLoading ? (
        <Card padded={false}>
          <CardBody className="space-y-3 py-6">
            <div className="h-4 w-full rounded bg-surface-alt" />
            <div className="h-4 w-5/6 rounded bg-surface-alt" />
            <div className="h-4 w-4/6 rounded bg-surface-alt" />
          </CardBody>
        </Card>
      ) : (
        <DataTable
          id={tableId}
          columns={tableColumns}
          rows={pageRows}
          rowKey={(_row, index) => String(index)}
          loading={false}
          error={null}
          emptyMessage="داده‌ای برای نمایش نیست"
          emptyDescription="بازهٔ تاریخ را تغییر دهید یا گزارش را دوباره اجرا کنید."
          emptyIcon={<IconChart />}
          pagination={
            paginated
              ? { page, pageSize: PAGE_SIZE, total: rows.length, onPageChange: setPage }
              : undefined
          }
        />
      )}
    </div>
  );
}
