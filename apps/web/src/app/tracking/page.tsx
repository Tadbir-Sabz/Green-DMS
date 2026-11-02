"use client";

import { useQuery } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { SalesGuard } from "@/components/auth/guards";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { toPersianDateTime } from "@/lib/date";

/**
 * رهگیری زنده — GET /tracking/live (خروجی خام v_live_locations).
 * جایگزین placeholder نقشهٔ پیشین. پاسخ یک «آرایهٔ خام» است (نه صفحه‌بندی‌شده)،
 * بنابراین مستقیماً res.data خوانده می‌شود. هر ۱۵ ثانیه تازه می‌شود تا زنده بماند.
 * چون کتابخانهٔ نقشه نداریم، مختصات هر نیرو به‌همراه پیوند بازکردن در نقشهٔ
 * بیرونی (OSM) نمایش داده می‌شود.
 */
type LiveLocation = components["schemas"]["LiveLocation"];

function mpsToKmh(v?: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return (v * 3.6).toLocaleString("fa-IR", { maximumFractionDigits: 0 });
}

function coord(v?: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(5);
}

function TrackingInner() {
  const { data, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ["tracking-live"],
    queryFn: async () => {
      const res = await api.GET("/tracking/live");
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data ?? []) as LiveLocation[];
    },
    refetchInterval: 15000,
  });

  const items = data ?? [];

  const columns: Column<LiveLocation>[] = [
    { key: "staff", header: "نیرو", render: (l) => <span className="text-sm">{l.staff_name ?? l.staff_id?.slice(0, 8) ?? "—"}</span> },
    { key: "branch", header: "شعبه", render: (l) => <span className="text-xs">{l.branch_name ?? l.branch_code ?? "—"}</span> },
    {
      key: "pos",
      header: "مختصات",
      render: (l) => (
        <a
          href={`https://www.openstreetmap.org/?mlat=${l.lat}&mlon=${l.lng}#map=16/${l.lat}/${l.lng}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-xs text-emerald-700 dark:text-emerald-400 hover:underline"
          title="بازکردن در نقشه"
        >
          {coord(l.lat)}, {coord(l.lng)}
        </a>
      ),
    },
    { key: "speed", header: "سرعت", align: "end", render: (l) => <span className="text-xs">{mpsToKmh(l.speed_mps)} km/h</span> },
    {
      key: "battery",
      header: "باتری",
      align: "end",
      render: (l) => (
        <span className={`text-xs ${l.battery_pct != null && l.battery_pct <= 20 ? "text-rose-600 dark:text-rose-400" : ""}`}>
          {l.battery_pct != null ? `${l.battery_pct.toLocaleString("fa-IR")}٪` : "—"}
        </span>
      ),
    },
    {
      key: "mocked",
      header: "موقعیت",
      render: (l) =>
        l.is_mocked ? (
          <span className="px-2 py-0.5 rounded-md text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">شبیه‌سازی</span>
        ) : (
          <span className="px-2 py-0.5 rounded-md text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">{l.provider ?? "واقعی"}</span>
        ),
    },
    { key: "sampled", header: "آخرین نمونه", render: (l) => <span className="text-xs">{toPersianDateTime(l.sampled_at)}</span> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">رهگیری زنده</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            آخرین موقعیت نیروهای میدانی (PostGIS) — تازه‌سازی خودکار هر ۱۵ ثانیه
            {isFetching && !isLoading ? " · در حال به‌روزرسانی..." : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {items.length.toLocaleString("fa-IR")} نیرو روی خط
          </span>
          <button
            onClick={() => refetch()}
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-[#1f2937] text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-[#1f2937]"
          >
            به‌روزرسانی
          </button>
          <ExportButtons data={items} tableId="tracking-table" filename="live-locations" />
        </div>
      </div>

      <div id="tracking-table">
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(l) => l.staff_id ?? `${l.lat},${l.lng},${l.sampled_at}`}
          loading={isLoading}
          error={error ? (error as Error).message : null}
          emptyMessage="نیروی روی خطی یافت نشد"
        />
      </div>
    </div>
  );
}

export default function TrackingPage() {
  return (
    <SalesGuard>
      <TrackingInner />
    </SalesGuard>
  );
}
