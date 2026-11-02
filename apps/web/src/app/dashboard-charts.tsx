"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/**
 * نمودار ستونی داشبورد — اکنون داده‌محور است (نه مقادیر سخت‌کدشدهٔ پیشین).
 * صفحهٔ داشبورد نقاط واقعی را از GET /orders محاسبه و به این کامپوننت می‌دهد.
 */
export type ChartPoint = { label: string; value: number };

type Props = {
  data: ChartPoint[];
  title?: string;
  /** واحد نمایشی روی محور/تولتیپ (مثلاً «میلیون ریال») */
  unit?: string;
  color?: string;
  loading?: boolean;
  emptyMessage?: string;
};

export default function DashboardCharts({
  data,
  title = "روند فروش",
  unit = "",
  color = "#22c55e",
  loading = false,
  emptyMessage = "داده‌ای برای نمایش نیست",
}: Props) {
  return (
    <div className="bg-white dark:bg-[#111827] border border-slate-200 dark:border-[#1f2937] rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="font-semibold text-slate-900 dark:text-slate-100">{title}</div>
        {unit && <div className="text-xs text-slate-400 dark:text-slate-500">{unit}</div>}
      </div>
      {loading ? (
        <div className="h-[300px] flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
          در حال بارگذاری...
        </div>
      ) : data.length === 0 ? (
        <div className="h-[300px] flex items-center justify-center text-slate-400 dark:text-slate-500 text-sm">
          {emptyMessage}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <Tooltip
              formatter={(value) => {
                const n = Number(value ?? 0);
                return [
                  `${n.toLocaleString("fa-IR")}${unit ? ` ${unit}` : ""}`,
                  title,
                ];
              }}
              labelStyle={{ direction: "rtl" }}
              contentStyle={{ direction: "rtl", fontFamily: "inherit" }}
            />
            <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
