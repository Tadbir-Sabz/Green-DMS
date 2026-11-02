"use client";

import { ReportRunner } from "@/components/reports/ReportRunner";

/** گزارش فروش روزانه — GET /reports/daily_sales (ستون‌ها سمت سرور) */
export default function ReportsSalesPage() {
  return (
    <ReportRunner
      reportKey="daily_sales"
      title="گزارش فروش"
      subtitle="فروش روزانه به تفکیک شعبه با فیلتر بازه و خروجی"
      filename="sales-report"
    />
  );
}
