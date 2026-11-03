import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { IconHome, IconSearch } from "@/components/icons";

/**
 * صفحهٔ «یافت نشد» سراسری.
 *
 * پیش‌تر این فایل وجود نداشت و هر مسیر نامعتبر، صفحهٔ پیش‌فرض انگلیسیِ Next را
 * در یک سامانهٔ کاملاً فارسی و راست‌به‌چپ نشان می‌داد. این صفحه هم از سیستم
 * طراحی استفاده می‌کند و هم کاربر را به دو مسیر مفید هدایت می‌کند: داشبورد و
 * جست‌وجوی سریع (Ctrl+K) که همهٔ صفحه‌های مجاز را فهرست می‌کند.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="w-full max-w-md text-center">
        <CardBody className="space-y-4 py-8">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-neutral-soft text-ink-muted">
            <IconSearch className="size-7" />
          </span>

          <div className="space-y-2">
            <div className="flex items-center justify-center">
              <Badge tone="neutral" size="sm">
                ۴۰۴
              </Badge>
            </div>
            <h1 className="text-lg font-bold text-ink">صفحه‌ای یافت نشد</h1>
            <p className="text-sm leading-relaxed text-ink-muted">
              نشانی وارد شده وجود ندارد یا این بخش جابه‌جا شده است. می‌توانید با
              جست‌وجوی سریع (Ctrl+K) از فهرست صفحه‌ها، مقصد موردنظر را پیدا کنید.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
            <Button variant="primary" href="/">
              <IconHome className="size-4" />
              بازگشت به داشبورد
            </Button>
            <Button variant="secondary" href="/demo">
              <IconSearch className="size-4" />
              کیت طراحی
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
