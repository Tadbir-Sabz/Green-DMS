"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { IconArrowRight, IconHome, IconShield } from "@/components/icons";

/**
 * صفحهٔ «دسترسی غیرمجاز». RoleGuard هنگام نبودِ مجوز یا نقش لازم کاربر را به
 * اینجا می‌فرستد. (پیش‌تر این مسیر وجود نداشت و redirect به خطای ۴۰۴ می‌خورد.)
 *
 * دو راه خروج می‌دهد: بازگشت به صفحهٔ قبل (احتمالاً جایی که کاربر مجوز دارد)
 * و داشبورد (که لایهٔ متناسب با نقش او را نشان می‌دهد).
 */
export default function ForbiddenPage() {
  const router = useRouter();

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="w-full max-w-md text-center">
        <CardBody className="space-y-4 py-8">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-warning-soft text-warning-ink">
            <IconShield className="size-7" />
          </span>

          <div className="space-y-2">
            <div className="flex items-center justify-center">
              <Badge tone="warning" size="sm">
                ۴۰۳
              </Badge>
            </div>
            <h1 className="text-lg font-bold text-ink">دسترسی غیرمجاز</h1>
            <p className="text-sm leading-relaxed text-ink-muted">
              نقش یا مجوز لازم برای مشاهدهٔ این صفحه را ندارید. اگر فکر می‌کنید
              اشتباهی رخ داده، با مدیر سامانه تماس بگیرید.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <Button variant="primary" href="/">
              <IconHome className="size-4" />
              بازگشت به داشبورد
            </Button>
            <Button variant="secondary" onClick={() => router.back()}>
              <IconArrowRight className="size-4" />
              صفحهٔ قبل
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
