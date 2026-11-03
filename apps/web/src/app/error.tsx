"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { IconAlertTriangle, IconHome, IconRefresh } from "@/components/icons";

/**
 * مرز خطای سراسری Next.js App Router. هر خطای رندرشده در زیردرخت app را می‌گیرد
 * و به‌جای صفحهٔ سفید یا stacktrace، پیام فارسی، کد رهگیری و دو راه خروج
 * (تلاش دوباره / بازگشت به داشبورد) نشان می‌دهد.
 *
 * چون این صفحه ممکن است پس از خرابی درخت React رندر شود، فقط از اجزای ساده و
 * بدون وابستگی به کوئری/احراز هویت استفاده می‌کند.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // ثبت خطا برای رصد (در تولید به سرویس گزارش خطا وصل می‌شود)
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="w-full max-w-md text-center">
        <CardBody className="space-y-4 py-8">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-danger-soft text-danger-ink">
            <IconAlertTriangle className="size-7" />
          </span>

          <div className="space-y-1.5">
            <h1 className="text-lg font-bold text-ink">خطایی رخ داد</h1>
            <p className="text-sm leading-relaxed text-ink-muted">
              {error.message || "هنگام نمایش این صفحه خطای غیرمنتظره‌ای پیش آمد."}
            </p>
          </div>

          {error.digest && (
            <div className="flex items-center justify-center gap-2">
              <Badge tone="neutral" size="sm">
                کد رهگیری
              </Badge>
              <code dir="ltr" className="font-mono text-[11px] text-ink-subtle">
                {error.digest}
              </code>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <Button variant="primary" onClick={reset}>
              <IconRefresh className="size-4" />
              تلاش دوباره
            </Button>
            <Button variant="secondary" href="/">
              <IconHome className="size-4" />
              بازگشت به داشبورد
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
