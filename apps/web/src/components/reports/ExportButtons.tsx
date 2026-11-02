"use client";

import { exportToExcel, exportTableToPDF } from "@/lib/export";
import { useState } from "react";

export function ExportButtons({
  data,
  tableId,
  filename = "report",
  sheetName = "Sheet1",
}: {
  data?: any[];
  tableId?: string;
  filename?: string;
  sheetName?: string;
}) {
  const [loading, setLoading] = useState<"excel" | "pdf" | null>(null);

  const handleExcel = async () => {
    if (!data || data.length === 0) return;
    setLoading("excel");
    try {
      await exportToExcel(data, `${filename}.xlsx`, sheetName);
    } finally {
      setLoading(null);
    }
  };

  const handlePDF = async () => {
    if (!tableId) return;
    setLoading("pdf");
    try {
      await exportTableToPDF(tableId, `${filename}.pdf`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex gap-2">
      {data && (
        <button
          onClick={handleExcel}
          disabled={loading === "excel"}
          className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading === "excel" ? "در حال صادرات..." : "Excel"}
        </button>
      )}
      {tableId && (
        <button
          onClick={handlePDF}
          disabled={loading === "pdf"}
          className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading === "pdf" ? "در حال صادرات..." : "PDF"}
        </button>
      )}
    </div>
  );
}
