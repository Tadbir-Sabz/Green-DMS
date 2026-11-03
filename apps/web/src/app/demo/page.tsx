"use client";

import { useState } from "react";
import { PageHeader, Toolbar } from "@/components/ui/PageHeader";
import { Card, CardBody, CardHeader, CardFooter, CardLink, SectionTitle } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Badge, StatusBadge, toneFor, type BadgeTone } from "@/components/ui/Badge";
import {
  Checkbox,
  Field,
  Input,
  SearchInput,
  SegmentedControl,
  Select,
  Switch,
  Textarea,
} from "@/components/ui/Form";
import {
  Alert,
  EmptyState,
  ErrorState,
  ProgressBar,
  Skeleton,
  SkeletonText,
  Spinner,
} from "@/components/ui/Feedback";
import { StatCard, StatGrid } from "@/components/ui/StatCard";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Modal, ConfirmDialog } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { Avatar, Dropdown, Tooltip } from "@/components/ui/Menu";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import { useToast } from "@/components/ui/Toast";
import { useTheme } from "@/components/theme/ThemeProvider";
import { formatMoney, formatNumber } from "@/lib/format";
import { toPersianDate } from "@/lib/date";
import { navItems } from "@/lib/navigation";
import * as Icons from "@/components/icons";
import {
  IconBox,
  IconCog,
  IconDownload,
  IconEdit,
  IconPlus,
  IconRefresh,
  IconSparkles,
  IconTrash,
  IconTreasury,
  IconWallet,
} from "@/components/icons";

/**
 * کیت طراحی (Design System) — ویترین زندهٔ همهٔ اجزا و توکن‌ها.
 *
 * این صفحه فقط «نمونه» نیست؛ مرجع رسمی تیم برای استفادهٔ درست از اجزاست:
 * هر واریانت، هر لحن و هر حالت (بارگذاری/خالی/خطا) یک‌جا دیده می‌شود تا
 * صفحه‌های جدید به‌جای ساخت دوبارهٔ دکمه و کارت، از همین‌ها استفاده کنند.
 *
 * چون همهٔ رنگ‌ها از توکن‌های معنایی می‌آیند، با کلید تم در سربدنه می‌توان
 * کل کیت را در حالت روشن/تاریک بررسی کرد.
 */

/* ------------------------------ دادهٔ نمونه ------------------------------ */

type SampleRow = {
  id: string;
  code: string;
  name: string;
  qty: number;
  price: number;
  status: string;
  date: string;
};

const SAMPLE_ROWS: SampleRow[] = [
  { id: "1", code: "PRD-1001", name: "شیر کم‌چرب ۱ لیتری", qty: 1240, price: 185000, status: "active", date: "2026-03-11" },
  { id: "2", code: "PRD-1002", name: "ماست موسیر ۴۰۰ گرمی", qty: 86, price: 96000, status: "pending", date: "2026-03-12" },
  { id: "3", code: "PRD-1003", name: "پنیر لیقوان ۲ کیلویی", qty: 0, price: 1240000, status: "blocked", date: "2026-03-13" },
  { id: "4", code: "PRD-1004", name: "کره محلی ۲۵۰ گرمی", qty: 512, price: 210000, status: "active", date: "2026-03-14" },
  { id: "5", code: "PRD-1005", name: "خامه صبحانه ۲۰۰ گرمی", qty: 63, price: 78000, status: "suspended", date: "2026-03-15" },
  { id: "6", code: "PRD-1006", name: "دوغ گازدار ۱.۵ لیتری", qty: 2210, price: 62000, status: "active", date: "2026-03-16" },
];

const TONES: BadgeTone[] = ["neutral", "brand", "success", "warning", "danger", "info", "outline"];

const STATUS_SAMPLES = ["active", "pending", "suspended", "blocked", "draft", "paid", "in_transit"];

/* -------------------------------- بخش‌ها -------------------------------- */

function Swatch({ name, className }: { name: string; className: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`size-9 shrink-0 rounded-lg border border-line ${className}`} />
      <code className="truncate font-mono text-[11px] text-ink-muted">{name}</code>
    </div>
  );
}

export default function DesignSystemPage() {
  const toast = useToast();
  const { resolved } = useTheme();

  const [variant, setVariant] = useState<"grid" | "list">("grid");
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const [checked, setChecked] = useState(true);
  const [switchOn, setSwitchOn] = useState(true);
  const [date, setDate] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<(string | number)[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progress, setProgress] = useState(62);

  const columns: Column<SampleRow>[] = [
    { key: "code", header: "کد", render: (r) => <span className="font-mono text-xs text-ink-muted">{r.code}</span> },
    { key: "name", header: "نام کالا", sortValue: (r) => r.name, render: (r) => <span className="font-medium">{r.name}</span> },
    { key: "qty", header: "موجودی", align: "end", sortValue: (r) => r.qty, render: (r) => <span className={r.qty === 0 ? "tnum text-danger-ink" : "tnum"}>{formatNumber(r.qty)}</span> },
    { key: "price", header: "قیمت", align: "end", sortValue: (r) => r.price, render: (r) => <span className="tnum">{formatMoney(r.price, "ریال")}</span> },
    { key: "date", header: "تاریخ", sortValue: (r) => r.date, render: (r) => <span className="text-xs text-ink-muted">{toPersianDate(r.date)}</span> },
    {
      key: "status",
      header: "وضعیت",
      render: (r) => <StatusBadge tone={toneFor(r.status)}>{r.status}</StatusBadge>,
    },
    {
      key: "actions",
      header: "",
      align: "end",
      render: () => (
        <div className="flex items-center justify-end gap-1">
          <IconButton label="ویرایش" size="icon-sm" variant="ghost">
            <IconEdit className="size-4" />
          </IconButton>
          <IconButton label="حذف" size="icon-sm" variant="ghost" className="hover:bg-danger-soft hover:text-danger-ink">
            <IconTrash className="size-4" />
          </IconButton>
        </div>
      ),
    },
  ];

  const filtered = SAMPLE_ROWS.filter((row) =>
    query ? row.name.includes(query) || row.code.includes(query) : true,
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title="کیت طراحی"
        description="ویترین زندهٔ توکن‌ها و اجزای رابط کاربری GreenDMS — مرجع ساخت صفحه‌های جدید."
        icon={<IconSparkles />}
        meta={
          <>
            <Badge tone="brand" dot>
              تم فعال: {resolved === "dark" ? "تاریک" : "روشن"}
            </Badge>
            <span className="text-xs text-ink-subtle">
              همهٔ رنگ‌ها از توکن معنایی می‌آیند — بدون کلاس dark:
            </span>
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => toast.info("این یک اعلان اطلاع‌رسانی است")}>
              <IconRefresh className="size-4" />
              اعلان نمونه
            </Button>
            <Button variant="primary" onClick={() => setModalOpen(true)}>
              <IconPlus className="size-4" />
              باز کردن دیالوگ
            </Button>
          </>
        }
      />

      {/* ------------------------------ توکن‌ها ------------------------------ */}
      <section className="space-y-4">
        <SectionTitle>توکن‌های رنگ</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader title="سطوح و متن" description="پس‌زمینه‌ها و رنگ متن" />
            <CardBody className="grid grid-cols-2 gap-3">
              <Swatch name="bg-canvas" className="bg-canvas" />
              <Swatch name="bg-surface" className="bg-surface" />
              <Swatch name="bg-surface-alt" className="bg-surface-alt" />
              <Swatch name="bg-surface-hover" className="bg-surface-hover" />
              <Swatch name="text-ink" className="bg-ink" />
              <Swatch name="text-ink-muted" className="bg-ink-muted" />
              <Swatch name="text-ink-subtle" className="bg-ink-subtle" />
              <Swatch name="border-line" className="bg-line" />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="برند و وضعیت‌ها" description="رنگ‌های معنایی" />
            <CardBody className="grid grid-cols-2 gap-3">
              <Swatch name="bg-brand" className="bg-brand" />
              <Swatch name="bg-success" className="bg-success" />
              <Swatch name="bg-warning" className="bg-warning" />
              <Swatch name="bg-danger" className="bg-danger" />
              <Swatch name="bg-info" className="bg-info" />
              <Swatch name="bg-brand-soft" className="bg-brand-soft" />
              <Swatch name="bg-danger-soft" className="bg-danger-soft" />
              <Swatch name="bg-info-soft" className="bg-info-soft" />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="تایپوگرافی" description="مقیاس متن فارسی" />
            <CardBody className="space-y-2.5">
              <p className="text-[22px] font-bold tracking-tight text-ink">عنوان صفحه (۲۲)</p>
              <p className="text-base font-semibold text-ink">عنوان بخش (۱۶)</p>
              <p className="text-sm text-ink-muted">متن بدنه — خوانا و متعادل (۱۴)</p>
              <p className="text-[13px] text-ink-muted">متن ثانویه (۱۳)</p>
              <p className="tnum text-xs text-ink-subtle">عدد جدولی: {formatNumber(1234567890)} (۱۲)</p>
              <p className="font-mono text-xs text-ink-subtle" dir="ltr">
                code: PRD-1001
              </p>
            </CardBody>
          </Card>
        </div>
      </section>

      {/* ------------------------------ دکمه‌ها ------------------------------ */}
      <section className="space-y-4">
        <SectionTitle>دکمه‌ها</SectionTitle>
        <Card>
          <CardBody className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary">اصلی</Button>
              <Button variant="secondary">ثانویه</Button>
              <Button variant="soft">ملایم</Button>
              <Button variant="ghost">بی‌زمینه</Button>
              <Button variant="danger">مخرب</Button>
              <Button variant="danger-soft">مخرب ملایم</Button>
              <Button variant="link">پیوند</Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" size="xs">
                خیلی کوچک
              </Button>
              <Button variant="primary" size="sm">
                کوچک
              </Button>
              <Button variant="primary" size="md">
                متوسط
              </Button>
              <Button variant="primary" size="lg">
                بزرگ
              </Button>
              <Button variant="primary" loading>
                در حال پردازش
              </Button>
              <Button variant="primary" disabled>
                غیرفعال
              </Button>
              <IconButton label="تنظیمات">
                <IconCog className="size-4.5" />
              </IconButton>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" href="/orders">
                به‌صورت پیوند (href)
              </Button>
              <Button variant="secondary" onClick={() => toast.success("عملیات با موفقیت انجام شد")}>
                <IconDownload className="size-4" />
                اعلان موفقیت
              </Button>
              <Button variant="secondary" onClick={() => toast.error("خطا در برقراری ارتباط با سرور")}>
                اعلان خطا
              </Button>
              <Button variant="secondary" onClick={() => toast.warning("سقف اعتبار مشتری نزدیک است")}>
                اعلان هشدار
              </Button>
            </div>
          </CardBody>
        </Card>
      </section>

      {/* ------------------------------ نشان‌ها ------------------------------ */}
      <section className="space-y-4">
        <SectionTitle>نشان‌ها (Badge)</SectionTitle>
        <Card>
          <CardBody className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              {TONES.map((tone) => (
                <Badge key={tone} tone={tone}>
                  {tone}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_SAMPLES.map((status) => (
                <StatusBadge key={status} tone={toneFor(status)}>
                  {status}
                </StatusBadge>
              ))}
            </div>
            <p className="text-xs text-ink-subtle">
              لحن هر وضعیت از نگاشت مشترک <code className="font-mono">STATUS_TONE</code> می‌آید؛
              صفحه‌ها دیگر نگاشت رنگ جداگانه تعریف نمی‌کنند.
            </p>
          </CardBody>
        </Card>
      </section>

      {/* ------------------------------ شاخص‌ها ------------------------------ */}
      <section className="space-y-4">
        <SectionTitle>کارت شاخص</SectionTitle>
        <StatGrid>
          <StatCard label="فروش امروز" value={formatMoney(1845000000)} sub="تا این لحظه" icon={<IconWallet />} tone="brand" href="/orders" />
          <StatCard label="موجودی بحرانی" value={formatNumber(7)} sub="کالای با موجودی صفر" icon={<IconBox />} tone="danger" href="/warehouses" />
          <StatCard label="مانده خزانه" value={formatMoney(9230000000)} sub="صندوق و بانک" icon={<IconTreasury />} tone="info" href="/treasury" />
          <StatCard label="در حال بارگذاری" value="—" sub="اسکلتون" icon={<IconCog />} tone="neutral" loading />
        </StatGrid>
      </section>

      {/* ------------------------------ فرم‌ها ------------------------------ */}
      <section className="space-y-4">
        <SectionTitle>کنترل‌های فرم</SectionTitle>
        <Card>
          <CardBody className="grid gap-5 md:grid-cols-2">
            <Field label="جست‌وجو" htmlFor="demo-search" hint="فیلتر زندهٔ جدول پایین">
              <SearchInput id="demo-search" value={query} onValueChange={setQuery} placeholder="نام یا کد کالا…" />
            </Field>

            <Field label="ورودی با خطا" htmlFor="demo-invalid" error="این مقدار معتبر نیست">
              <Input id="demo-invalid" defaultValue="۱۲۳۴۵" invalid />
            </Field>

            <Field label="انتخاب انبار" htmlFor="demo-select">
              <Select
                id="demo-select"
                placeholder="همهٔ انبارها"
                options={[
                  { value: "tehran", label: "انبار تهران" },
                  { value: "karaj", label: "انبار کرج" },
                  { value: "qazvin", label: "انبار قزوین" },
                ]}
              />
            </Field>

            <Field label="تاریخ جلالی" htmlFor="demo-date">
              <JalaliDatePicker value={date} onChange={setDate} placeholder="انتخاب تاریخ…" />
            </Field>

            <Field label="توضیحات" htmlFor="demo-textarea">
              <Textarea
                id="demo-textarea"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="یادداشت داخلی…"
              />
            </Field>

            <div className="space-y-4">
              <Checkbox
                label="نمایش فقط کالاهای دارای موجودی"
                description="ردیف‌های با موجودی صفر پنهان می‌شوند"
                checked={checked}
                onChange={(event) => setChecked(event.target.checked)}
              />
              <Switch label="همگام‌سازی خودکار" checked={switchOn} onChange={setSwitchOn} />
              <SegmentedControl
                ariaLabel="حالت نمایش"
                value={variant}
                onChange={setVariant}
                options={[
                  { value: "grid", label: "کاشی" },
                  { value: "list", label: "فهرست" },
                ]}
              />
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-ink-muted">
                  <span>پیشرفت همگام‌سازی</span>
                  <span className="tnum">{formatNumber(progress)}٪</span>
                </div>
                <ProgressBar value={progress} tone={progress > 80 ? "success" : "brand"} />
                <Button size="xs" variant="ghost" onClick={() => setProgress((p) => (p >= 100 ? 10 : p + 15))}>
                  افزایش پیشرفت
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      </section>

      {/* ------------------------------ جدول ------------------------------ */}
      <section className="space-y-4">
        <SectionTitle
          actions={
            <span className="tnum text-xs text-ink-subtle">
              {selected.length > 0 ? `${formatNumber(selected.length)} ردیف انتخاب شده` : ""}
            </span>
          }
        >
          جدول داده
        </SectionTitle>
        <Toolbar>
          <Button
            variant="secondary"
            size="sm"
            disabled={selected.length === 0}
            onClick={() => {
              toast.warning(`${formatNumber(selected.length)} ردیف برای حذف انتخاب شده`);
              setSelected([]);
            }}
          >
            <IconTrash className="size-4" />
            حذف انتخاب‌شده‌ها
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirmOpen(true)}>
            دیالوگ تأیید
          </Button>
        </Toolbar>
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(row) => row.id}
          selectable
          selectedKeys={selected}
          onSelectedChange={setSelected}
          emptyMessage="کالایی یافت نشد"
          emptyDescription="عبارت جست‌وجو را تغییر دهید."
          pagination={{ page, pageSize: 3, total: Math.max(filtered.length, 1), onPageChange: setPage }}
        />
      </section>

      {/* ------------------------------ بازخورد ------------------------------ */}
      <section className="space-y-4">
        <SectionTitle>بازخورد و حالت‌ها</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="space-y-3">
            <Alert tone="success" title="ثبت شد">
              سند با موفقیت ثبت و در دفتر کل اعمال شد.
            </Alert>
            <Alert tone="info" title="راهنما">
              بازهٔ تاریخ را مشخص کنید تا گزارش دقیق‌تر شود.
            </Alert>
            <Alert tone="warning" title="هشدار">
              موجودی این کالا به آستانهٔ سفارش رسیده است.
            </Alert>
            <Alert tone="danger" title="خطا">
              اتصال به سرور برقرار نشد؛ دوباره تلاش کنید.
            </Alert>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="بارگذاری" description="اسکلتون و اسپینر" />
              <CardBody className="space-y-3">
                <div className="flex items-center gap-3">
                  <Spinner label="در حال دریافت داده…" />
                </div>
                <Skeleton className="h-4 w-1/3" />
                <SkeletonText lines={3} />
              </CardBody>
            </Card>

            <Card padded={false}>
              <EmptyState
                title="هنوز رکوردی ثبت نشده"
                description="با افزودن اولین سند، این بخش پر می‌شود."
                action={
                  <Button variant="primary" size="sm">
                    <IconPlus className="size-4" />
                    ثبت سند جدید
                  </Button>
                }
                compact
              />
            </Card>

            <Card padded={false}>
              <ErrorState message="سرور در دسترس نیست (۵۰۳)" onRetry={() => toast.info("تلاش دوباره…")} compact />
            </Card>
          </div>
        </div>
      </section>

      {/* ------------------------------ لایه‌ها ------------------------------ */}
      <section className="space-y-4">
        <SectionTitle>لایه‌ها و ناوبری</SectionTitle>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader title="آواتار و راهنما" />
            <CardBody className="space-y-3">
              <div className="flex items-center gap-2">
                <Avatar name="علی رضایی" size="sm" />
                <Avatar name="مریم کریمی" size="md" tone="info" />
                <Avatar name="حسین محمدی" size="lg" tone="success" />
                <Avatar size="md" tone="neutral" />
              </div>
              <div className="flex items-center gap-2">
                <Tooltip content="این یک راهنمای شناور است">
                  <Button variant="secondary" size="sm">
                    راهنما
                  </Button>
                </Tooltip>
                <Dropdown
                  label="منوی نمونه"
                  trigger={({ open, toggle, ref }) => (
                    <Button ref={ref} variant="secondary" size="sm" onClick={toggle} aria-expanded={open}>
                      منوی بازشو
                    </Button>
                  )}
                  items={[
                    { key: "edit", label: "ویرایش", icon: <IconEdit />, onSelect: () => toast.info("ویرایش") },
                    { key: "export", label: "صادرات", icon: <IconDownload />, onSelect: () => toast.success("صادر شد") },
                    { key: "delete", label: "حذف", icon: <IconTrash />, tone: "danger", dividerBefore: true, onSelect: () => setConfirmOpen(true) },
                  ]}
                />
              </div>
            </CardBody>
          </Card>

          <Card padded={false}>
            <CardHeader title="صفحه‌بندی" description="RTL و ارقام فارسی" />
            <Pagination page={page} pageSize={3} total={filtered.length || 9} onPageChange={setPage} />
          </Card>

          <CardLink href="/">
            <p className="text-sm font-semibold text-ink">کارت لینک‌دار</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              کل کارت کلیک‌پذیر است و در hover کمی بالا می‌آید.
            </p>
            <CardFooter className="mt-4 rounded-xl border px-3 py-2">
              <span className="text-xs text-ink-subtle">پانوشت کارت</span>
            </CardFooter>
          </CardLink>
        </div>
      </section>

      {/* ------------------------------ آیکون‌ها ------------------------------ */}
      <section className="space-y-4">
        <SectionTitle
          actions={
            <span className="tnum text-xs text-ink-subtle">
              {formatNumber(navItems.length)} صفحه در منو
            </span>
          }
        >
          مجموعهٔ آیکون
        </SectionTitle>
        <Card>
          <CardBody className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-10">
            {Object.entries(Icons)
              .filter(([name]) => name.startsWith("Icon"))
              .map(([name, Component]) => {
                const Glyph = Component as React.ComponentType<{ className?: string }>;
                return (
                  <Tooltip key={name} content={name}>
                    <span className="grid size-11 place-items-center rounded-xl border border-line bg-surface-alt text-ink-muted transition-colors hover:border-brand-line hover:bg-brand-soft hover:text-brand-soft-ink">
                      <Glyph className="size-5" />
                    </span>
                  </Tooltip>
                );
              })}
          </CardBody>
        </Card>
      </section>

      {/* ------------------------------ لایه‌های روی هم ------------------------------ */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="دیالوگ نمونه"
        description="Escape و کلیک روی پس‌زمینه این دیالوگ را می‌بندد."
        icon={<IconSparkles />}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              انصراف
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setModalOpen(false);
                toast.success("ذخیره شد");
              }}
            >
              ذخیره
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="عنوان سند" htmlFor="modal-title" required>
            <Input id="modal-title" placeholder="مثلاً فاکتور فروش ۱۴۰۴/۰۳" />
          </Field>
          <Field label="توضیح" htmlFor="modal-desc">
            <Textarea id="modal-desc" placeholder="توضیح اختیاری…" />
          </Field>
          <Checkbox label="پس از ذخیره، سند به دفتر کل ارسال شود" defaultChecked />
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          toast.success("حذف انجام شد");
        }}
        title="حذف رکورد"
        message="این عملیات قابل بازگشت نیست. آیا از حذف این رکورد مطمئن هستید؟"
        confirmLabel="بله، حذف کن"
      />
    </div>
  );
}
