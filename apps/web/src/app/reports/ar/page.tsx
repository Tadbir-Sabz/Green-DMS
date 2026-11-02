"use client";

import { ReportRunner } from "@/components/reports/ReportRunner";

/** تحلیل سنی مطالبات — GET /reports/ar_aging (ستون‌ها سمت سرور) */
export default function ReportsArPage() {
  return (
    <ReportRunner
      reportKey="ar_aging"
      title="گزارش حساب‌های دریافتنی"
      subtitle="تحلیل سنی مطالبات مشتریان"
      filename="ar-aging-report"
    />
  );
}
