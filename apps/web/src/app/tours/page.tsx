"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SalesGuard } from "@/components/auth/guards";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { toPersianDate } from "@/lib/date";

/**
 * تورهای فروش/توزیع — GET /tours?tour_date&kind&status (تایپ‌شده از قرارداد).
 * جایگزین جدول ایستای پیشین. فیلتر تاریخ (جلالی) و نوع تور؛ نام فروشنده از
 * GET /staff resolve می‌شود.
 */
type Tour = components["schemas"]["Tour"];
type Staff = { id: string; person_id?: string; employee_no?: string | null };

const KIND_FA: Record<string, string> = {
  cold: "سرد",
  warm: "گرم",
  distribution: "توزیع",
  telesales: "تلفنی",
};

const STATUS_FA: Record<string, string> = {
  planned: "برنامه‌ریزی‌شده",
  active: "در حال اجرا",
  settled: "تسویه‌شده",
  closed: "بسته",
};

const STATUS_COLOR: Record<string, string> = {
  planned: "bg-slate-100 text-slate-600 dark:bg-[#1f2937] dark:text-slate-300",
  active: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  settled: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  closed: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
};

function ToursInner() {
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [tourDate, setTourDate] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["tours", kind, status, tourDate],
    queryFn: async () => {
      type TourKind = "cold" | "warm" | "distribution" | "telesales";
      const query: { kind?: TourKind; status?: string; tour_date?: string; limit?: number } = { limit: 200 };
      if (kind) query.kind = kind as TourKind;
      if (status) query.status = status;
      if (tourDate) query.tour_date = tourDate;
      const res = await api.GET("/tours", { params: { query } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Tour[];
    },
  });

  const staff = useQuery({
    queryKey: ["staff-lookup"],
    queryFn: async () => {
      const res = await api.GET("/staff", { params: { query: { limit: 500 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Staff[];
    },
  });

  const staffLabel = (id?: string | null) => {
    if (!id) return "—";
    const s = (staff.data ?? []).find((x) => x.id === id);
    return s?.employee_no ? `#${s.employee_no}` : id.slice(0, 8);
  };

  const items = data ?? [];

  const columns: Column<Tour>[] = [
    { key: "doc", header: "شماره", render: (t) => <span className="font-mono text-xs">{t.doc_number ?? "—"}</span> },
    { key: "date", header: "تاریخ تور", render: (t) => <span className="text-xs">{toPersianDate(t.tour_date)}</span> },
    { key: "kind", header: "نوع", render: (t) => <span className="text-xs">{KIND_FA[t.kind] ?? t.kind}</span> },
    { key: "sales", header: "فروشنده", render: (t) => <span className="text-xs">{staffLabel(t.salesperson_id)}</span> },
    {
      key: "status",
      header: "وضعیت",
      render: (t) => (
        <span className={`px-2 py-0.5 rounded-md text-xs ${STATUS_COLOR[t.status ?? ""] ?? ""}`}>
          {STATUS_FA[t.status ?? ""] ?? t.status}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">تورها</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">برنامه‌ریزی، اجرا و تسویهٔ تورهای فروش و توزیع</p>
        </div>
        <ExportButtons data={items} tableId="tours-table" filename="tours" />
      </div>

      <div className="flex flex-wrap items-end gap-3 bg-white dark:bg-[#111827] border border-slate-200 dark:border-[#1f2937] rounded-2xl p-4">
        <div className="w-44">
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">تاریخ تور</label>
          <JalaliDatePicker value={tourDate} onChange={setTourDate} placeholder="همهٔ تاریخ‌ها" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">نوع</label>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-300 dark:border-[#1f2937] bg-white dark:bg-[#0f172a] text-sm">
            <option value="">همه</option>
            {Object.entries(KIND_FA).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">وضعیت</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-300 dark:border-[#1f2937] bg-white dark:bg-[#0f172a] text-sm">
            <option value="">همه</option>
            {Object.entries(STATUS_FA).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        {(kind || status || tourDate) && (
          <button
            onClick={() => { setKind(""); setStatus(""); setTourDate(null); }}
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-[#1f2937] text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1f2937]"
          >
            پاک کردن فیلترها
          </button>
        )}
      </div>

      <div id="tours-table">
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(t) => t.id ?? t.doc_number ?? Math.random().toString()}
          loading={isLoading}
          error={error ? (error as Error).message : null}
          emptyMessage="توری یافت نشد"
        />
      </div>
    </div>
  );
}

export default function ToursPage() {
  return (
    <SalesGuard>
      <ToursInner />
    </SalesGuard>
  );
}
