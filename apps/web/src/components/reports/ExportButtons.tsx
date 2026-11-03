"use client";

import { useState } from "react";
import { exportToExcel, exportTableToPDF } from "@/lib/export";
import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Menu";
import { IconFile, IconPrint } from "@/components/icons";

/**
 * دکمه‌های صادرات — Excel از دادهٔ خام و PDF از جدولِ رندرشده.
 *
 * `data` برای Excel و `tableId` برای PDF لازم است؛ هرکدام داده نشود، همان
 * دکمه نمایش داده نمی‌شود (به‌جای دکمهٔ غیرفعال و گیج‌کننده).
 * هنگام نبودِ رکورد، راهنمای شناور دلیل غیرفعال بودن را توضیح می‌دهد.
 */
export function ExportButtons({
  data,
  tableId,
  filename = "report",
  sheetName = "Sheet1",
  size = "sm",
}: {
  data?: unknown[];
  tableId?: string;
  filename?: string;
  sheetName?: string;
  size?: "sm" | "md";
}) {
  const [loading, setLoading] = useState<"excel" | "pdf" | null>(null);
  const hasRows = Boolean(data && data.length > 0);

  const handleExcel = async (): Promise<void> => {
    if (!data || data.length === 0) return;
    setLoading("excel");
    try {
      await exportToExcel(data, `${filename}.xlsx`, sheetName);
    } finally {
      setLoading(null);
    }
  };

  const handlePDF = async (): Promise<void> => {
    if (!tableId) return;
    setLoading("pdf");
    try {
      await exportTableToPDF(tableId, `${filename}.pdf`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {data && (
        <Tooltip content={hasRows ? "خروجی Excel از دادهٔ جاری" : "رکوردی برای صادرات وجود ندارد"}>
          <Button
            variant="secondary"
            size={size}
            onClick={handleExcel}
            disabled={!hasRows || loading !== null}
            loading={loading === "excel"}
            aria-label="صادرات Excel"
          >
            {loading === "excel" ? null : <IconFile className="size-4" />}
            <span className="hidden sm:inline">Excel</span>
          </Button>
        </Tooltip>
      )}
      {tableId && (
        <Tooltip content="خروجی PDF از جدولِ نمایش‌داده‌شده">
          <Button
            variant="secondary"
            size={size}
            onClick={handlePDF}
            disabled={loading !== null}
            loading={loading === "pdf"}
            aria-label="صادرات PDF"
          >
            {loading === "pdf" ? null : <IconPrint className="size-4" />}
            <span className="hidden sm:inline">PDF</span>
          </Button>
        </Tooltip>
      )}
    </div>
  );
}
