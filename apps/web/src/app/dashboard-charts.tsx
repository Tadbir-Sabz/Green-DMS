"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useChartTheme } from "@/lib/chart-theme";
import { formatNumber } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/Card";
import { EmptyState, Skeleton } from "@/components/ui/Feedback";
import { IconChart } from "@/components/icons";

/**
 * نمودار ستونی داشبورد — داده‌محور و هماهنگ با تم.
 *
 * دو نکتهٔ مهم که در نسخهٔ پیشین رعایت نشده بود:
 *  ۱) رنگ‌ها از توکن‌های سیستم طراحی خوانده می‌شوند (useChartTheme)، پس نمودار
 *     در حالت شب هم درست دیده می‌شود؛ پیش‌تر سه رنگ هاردکد شده بود.
 *  ۲) محورها RTL هستند: `XAxis reversed` دسته‌ها را راست‌به‌چپ می‌چیند و
 *     `YAxis orientation="right"` محور مقدار را در سمت راست می‌گذارد — همان
 *     جهتی که کاربر فارسی‌زبان از نمودار انتظار دارد.
 */
export type ChartPoint = { label: string; value: number };

type Props = {
  data: ChartPoint[];
  title?: string;
  description?: string;
  /** واحد نمایشی روی محور/تولتیپ (مثلاً «میلیون ریال») */
  unit?: string;
  loading?: boolean;
  emptyMessage?: string;
  height?: number;
};

export default function DashboardCharts({
  data,
  title = "روند فروش",
  description,
  unit = "",
  loading = false,
  emptyMessage = "داده‌ای برای رسم نمودار یافت نشد",
  height = 300,
}: Props) {
  const theme = useChartTheme();
  const peak = data.reduce((max, point) => Math.max(max, point.value), 0);

  return (
    <Card padded={false}>
      <CardHeader
        title={title}
        description={description}
        icon={<IconChart />}
        actions={unit ? <span className="text-xs text-ink-subtle">{unit}</span> : undefined}
      />

      <div className="px-3 py-4 sm:px-5">
        {loading ? (
          <div className="space-y-3" style={{ height }}>
            <Skeleton className="h-full w-full rounded-xl" />
          </div>
        ) : data.length === 0 ? (
          <div style={{ height }} className="grid place-items-center">
            <EmptyState icon={<IconChart />} title={emptyMessage} compact />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }} barCategoryGap="22%">
              <defs>
                <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.brand} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={theme.brand} stopOpacity={0.55} />
                </linearGradient>
              </defs>

              <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />

              <XAxis
                dataKey="label"
                reversed
                tick={{ fontSize: 11, fill: theme.inkSubtle }}
                stroke={theme.line}
                tickLine={false}
                axisLine={{ stroke: theme.line }}
                interval="preserveStartEnd"
                minTickGap={12}
              />
              <YAxis
                orientation="right"
                tick={{ fontSize: 11, fill: theme.inkSubtle }}
                stroke={theme.line}
                tickLine={false}
                axisLine={false}
                width={54}
                tickFormatter={(value: number) => formatNumber(value)}
              />

              <Tooltip
                cursor={{ fill: theme.grid, opacity: 0.45 }}
                labelStyle={{ direction: "rtl", color: theme.inkMuted, fontSize: 12 }}
                contentStyle={{
                  direction: "rtl",
                  fontFamily: "inherit",
                  background: theme.surface,
                  border: `1px solid ${theme.line}`,
                  borderRadius: 12,
                  boxShadow: "0 8px 24px -8px rgb(0 0 0 / 0.25)",
                  fontSize: 12,
                  color: theme.ink,
                  padding: "8px 10px",
                }}
                formatter={(value) => {
                  // recharts مقدار را گاهی به‌صورت آرایه می‌دهد؛ به عدد تبدیل می‌کنیم
                  const raw = Array.isArray(value) ? value[0] : value;
                  const parsed = Number(raw ?? 0);
                  const safe = Number.isFinite(parsed) ? parsed : 0;
                  return [`${formatNumber(safe)}${unit ? ` ${unit}` : ""}`, title];
                }}
              />

              <Bar dataKey="value" fill="url(#barFill)" radius={[6, 6, 0, 0]} maxBarSize={44}>
                {/* بیشترین مقدار با رنگ پررنگ‌تر متمایز می‌شود */}
                {data.map((point, index) => (
                  <Cell
                    key={point.label + index}
                    fill={peak > 0 && point.value === peak ? theme.brand : "url(#barFill)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  );
}
