"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/lib/auth";
import { ADMIN_ROLES, FINANCE_ROLES, SALES_ROLES, WAREHOUSE_ROLES } from "@/lib/rbac";
import DashboardCharts, { type ChartPoint } from "@/app/dashboard-charts";
import { formatMoney, formatNumber } from "@/lib/format";
import { toPersianDate } from "@/lib/date";
import { PageHeader } from "@/components/ui/PageHeader";
import { CardLink, SectionTitle } from "@/components/ui/Card";
import { StatCard, StatGrid, type StatTone } from "@/components/ui/StatCard";
import { SegmentedControl } from "@/components/ui/Form";
import { Badge } from "@/components/ui/Badge";
import { SkeletonCard } from "@/components/ui/Feedback";
import {
  IconApproval,
  IconChevronEnd,
  IconClipboardCheck,
  IconCustomer,
  IconDelivery,
  IconIntegration,
  IconInvoice,
  IconOrder,
  IconReceivable,
  IconRules,
  IconTour,
  IconTracking,
  IconTransfer,
  IconTreasury,
  IconWallet,
  IconWarehouse,
} from "@/components/icons";
import type { Icon } from "@/lib/navigation";

/**
 * داشبورد لایه‌ای — KPIهای واقعی از API، به تفکیک لایهٔ نقش:
 *
 *  - مدیرعامل/ادمین (executive): فروش امروز، فاکتورها، بدهکاری معوق، خزانه،
 *    تأییدهای در انتظار، نیروهای زنده + نمودار روند فروش
 *  - مدیر/فروشنده (sales): سفارش‌ها و فروش امروز، تورهای امروز، تأییدها، نیروهای زنده
 *  - مالی (finance): بدهکاری معوق، موقعیت خزانه، تأییدها، سلامت یکپارچه‌سازی‌ها
 *  - انبار (warehouse): موجودی بحرانی، انبارگردانی باز، انتقال در جریان، تحویل معوق
 *
 * هر کوئری فقط وقتی فعال است که لایهٔ فعال به آن نیاز دارد (react-query `enabled`).
 * لایه از نقش‌های نشست (useAuth) استخراج می‌شود؛ ادمین می‌تواند لایه‌ها را پیش‌نمایش کند.
 * دسترسی: فقط ورود لازم است (RoleGuard بدون نقش)؛ خود API دامنهٔ داده را per-role
 * فیلتر می‌کند (Row-level)، بنابراین هر لایه فقط دادهٔ مجاز را می‌بیند.
 */
type SalesOrder = components["schemas"]["SalesOrder"];
type Invoice = components["schemas"]["Invoice"];
type ArAgingRow = components["schemas"]["ArAgingRow"];
type TreasuryPosition = components["schemas"]["TreasuryPosition"];
type ApprovalRequest = components["schemas"]["ApprovalRequest"];
type LiveLocation = components["schemas"]["LiveLocation"];
type Tour = components["schemas"]["Tour"];
type IntegrationStatus = components["schemas"]["IntegrationStatus"];
type StockBalance = components["schemas"]["StockBalance"];
type StockTake = components["schemas"]["StockTake"];
type Transfer = components["schemas"]["Transfer"];
type Delivery = components["schemas"]["Delivery"];

type Layer = "executive" | "sales" | "finance" | "warehouse";

const LAYER_FA: Record<Layer, string> = {
  executive: "مدیرعامل",
  sales: "فروش",
  finance: "مالی",
  warehouse: "انبار",
};

const ISSUED_INVOICE_STATUSES = new Set(["posted", "partially_paid", "paid"]);
const OPEN_STOCKTAKE_STATUSES = new Set(["draft", "counting", "review"]);
const PENDING_DELIVERY_STATUSES = new Set(["planned", "dispatched", "partial"]);

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function num(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function detectLayer(hasRole: (allowed: string[]) => boolean): Layer {
  if (hasRole(ADMIN_ROLES)) return "executive";
  if (hasRole(FINANCE_ROLES)) return "finance";
  if (hasRole(WAREHOUSE_ROLES)) return "warehouse";
  if (hasRole(SALES_ROLES)) return "sales";
  return "executive";
}

type Card = {
  label: string;
  value: string;
  sub: string;
  loading?: boolean;
  href?: string;
  icon: Icon;
  tone: StatTone;
};

function DashboardInner() {
  const { user, hasRole } = useAuth();
  const autoLayer = detectLayer(hasRole);
  const [layer, setLayer] = useState<Layer>(autoLayer);
  const isAdmin = user ? hasRole(ADMIN_ROLES) : false;
  const today = todayISO();

  const needOrders = layer === "executive" || layer === "sales";
  const needInvoices = layer === "executive";
  const needAr = layer === "executive" || layer === "finance";
  const needTreasury = layer === "executive" || layer === "finance";
  const needApprovals = layer !== "warehouse";
  const needTracking = layer === "executive" || layer === "sales";
  const needTours = layer === "sales";
  const needIntegrations = layer === "finance";
  const needWarehouse = layer === "warehouse";

  const ordersToday = useQuery({
    queryKey: ["dash-orders-today", today],
    enabled: needOrders,
    queryFn: async () => {
      const res = await api.GET("/orders", { params: { query: { order_date: today, limit: 200 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as SalesOrder[];
    },
  });

  const ordersRecent = useQuery({
    queryKey: ["dash-orders-recent"],
    enabled: needOrders,
    queryFn: async () => {
      const res = await api.GET("/orders", { params: { query: { limit: 500 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as SalesOrder[];
    },
  });

  const invoices = useQuery({
    queryKey: ["dash-invoices", today],
    enabled: needInvoices,
    queryFn: async () => {
      const res = await api.GET("/invoices", { params: { query: { limit: 200 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Invoice[];
    },
  });

  const ar = useQuery({
    queryKey: ["dash-ar"],
    enabled: needAr,
    queryFn: async () => {
      const res = await api.GET("/ar", { params: { query: { limit: 200 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as ArAgingRow[];
    },
  });

  const treasury = useQuery({
    queryKey: ["dash-treasury"],
    enabled: needTreasury,
    queryFn: async () => {
      const res = await api.GET("/treasury");
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as TreasuryPosition[];
    },
  });

  const approvals = useQuery({
    queryKey: ["dash-approvals"],
    enabled: needApprovals,
    queryFn: async () => {
      const res = await api.GET("/rules-engine/approvals", { params: { query: { status: "pending" } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data ?? []) as ApprovalRequest[];
    },
  });

  const tracking = useQuery({
    queryKey: ["dash-tracking"],
    enabled: needTracking,
    queryFn: async () => {
      const res = await api.GET("/tracking/live");
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data ?? []) as LiveLocation[];
    },
  });

  const tours = useQuery({
    queryKey: ["dash-tours", today],
    enabled: needTours,
    queryFn: async () => {
      const res = await api.GET("/tours", { params: { query: { tour_date: today, limit: 200 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Tour[];
    },
  });

  const integrations = useQuery({
    queryKey: ["dash-integrations"],
    enabled: needIntegrations,
    queryFn: async () => {
      const res = await api.GET("/integrations");
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as IntegrationStatus[];
    },
  });

  const stock = useQuery({
    queryKey: ["dash-stock"],
    enabled: needWarehouse,
    queryFn: async () => {
      const res = await api.GET("/stock", { params: { query: { limit: 500 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as StockBalance[];
    },
  });

  const stocktakes = useQuery({
    queryKey: ["dash-stocktakes"],
    enabled: needWarehouse,
    queryFn: async () => {
      const res = await api.GET("/stocktakes", { params: { query: { limit: 200 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as StockTake[];
    },
  });

  const transfers = useQuery({
    queryKey: ["dash-transfers"],
    enabled: needWarehouse,
    queryFn: async () => {
      const res = await api.GET("/transfers", { params: { query: { limit: 200 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Transfer[];
    },
  });

  const deliveries = useQuery({
    queryKey: ["dash-deliveries"],
    enabled: needWarehouse,
    queryFn: async () => {
      const res = await api.GET("/deliveries", { params: { query: { limit: 200 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Delivery[];
    },
  });

  const salesToday = useMemo(
    () => (ordersToday.data ?? []).reduce((acc, o) => acc + num(o.grand_total), 0),
    [ordersToday.data],
  );

  const chart = useMemo<ChartPoint[]>(() => {
    const buckets = new Map<string, number>();
    for (const o of ordersRecent.data ?? []) {
      const d = o.order_date;
      if (!d) continue;
      buckets.set(d, (buckets.get(d) ?? 0) + num(o.grand_total));
    }
    return [...buckets.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .slice(-12)
      .map(([d, total]) => ({ label: toPersianDate(d), value: Math.round(total / 1e6) }));
  }, [ordersRecent.data]);

  const cards: Card[] = useMemo(() => {
    if (layer === "executive") {
      const inv = invoices.data ?? [];
      const invoicesToday = inv.filter(
        (i) => i.invoice_date === today && ISSUED_INVOICE_STATUSES.has(i.status ?? ""),
      ).length;
      const overdue = (ar.data ?? []).reduce((acc, r) => acc + Math.max(0, num(r.total) - num(r.current)), 0);
      const cash = (treasury.data ?? []).reduce((acc, t) => acc + num(t.balance_book), 0);
      return [
        { label: "سفارشات امروز", value: formatNumber((ordersToday.data ?? []).length), sub: "ثبت‌شده تا این لحظه", loading: ordersToday.isLoading, icon: IconOrder, tone: "brand", href: "/orders" },
        { label: "فاکتورهای صادرشده", value: formatNumber(invoicesToday), sub: "امروز · ثبت/پرداخت‌شده", loading: invoices.isLoading, icon: IconInvoice, tone: "info", href: "/invoices" },
        { label: "مبلغ فروش امروز", value: formatMoney(salesToday, "ریال"), sub: "جمع کل سفارش‌های امروز", loading: ordersToday.isLoading, icon: IconWallet, tone: "success" },
        { label: "بدهکاری معوق", value: formatMoney(overdue, "ریال"), sub: "سررسید گذشته (از AR)", loading: ar.isLoading, href: "/ar", icon: IconReceivable, tone: "warning" },
        { label: "موقعیت خزانه", value: formatMoney(cash, "ریال"), sub: "ماندهٔ دفتری صندوق/بانک", loading: treasury.isLoading, href: "/treasury", icon: IconTreasury, tone: "info" },
        { label: "تأییدهای در انتظار", value: formatNumber((approvals.data ?? []).length), sub: "نیازمند تصمیم", loading: approvals.isLoading, href: "/approvals", icon: IconApproval, tone: "warning" },
        { label: "نیروهای میدانی زنده", value: formatNumber((tracking.data ?? []).length), sub: "روی خط در لحظه", loading: tracking.isLoading, href: "/tracking", icon: IconTracking, tone: "success" },
      ];
    }
    if (layer === "sales") {
      const t = tours.data ?? [];
      const activeTours = t.filter((x) => x.status === "active").length;
      return [
        { label: "سفارشات امروز", value: formatNumber((ordersToday.data ?? []).length), sub: "ثبت‌شده تا این لحظه", loading: ordersToday.isLoading, href: "/orders", icon: IconOrder, tone: "brand" },
        { label: "مبلغ فروش امروز", value: formatMoney(salesToday, "ریال"), sub: "جمع کل سفارش‌های امروز", loading: ordersToday.isLoading, icon: IconWallet, tone: "success" },
        { label: "تورهای امروز", value: formatNumber(t.length), sub: `${formatNumber(activeTours)} تور در حال اجرا`, loading: tours.isLoading, href: "/tours", icon: IconTour, tone: "brand" },
        { label: "تأییدهای در انتظار", value: formatNumber((approvals.data ?? []).length), sub: "نیازمند تصمیم", loading: approvals.isLoading, href: "/approvals", icon: IconApproval, tone: "warning" },
        { label: "نیروهای میدانی زنده", value: formatNumber((tracking.data ?? []).length), sub: "روی خط در لحظه", loading: tracking.isLoading, href: "/tracking", icon: IconTracking, tone: "success" },
      ];
    }
    if (layer === "finance") {
      const overdue = (ar.data ?? []).reduce((acc, r) => acc + Math.max(0, num(r.total) - num(r.current)), 0);
      const cash = (treasury.data ?? []).reduce((acc, t) => acc + num(t.balance_book), 0);
      const unhealthy = (integrations.data ?? []).filter((s) => s.healthy === false).length;
      return [
        { label: "بدهکاری معوق", value: formatMoney(overdue, "ریال"), sub: "سررسید گذشته (از AR)", loading: ar.isLoading, href: "/ar", icon: IconReceivable, tone: "warning" },
        { label: "موقعیت خزانه", value: formatMoney(cash, "ریال"), sub: "ماندهٔ دفتری صندوق/بانک", loading: treasury.isLoading, href: "/treasury", icon: IconTreasury, tone: "info" },
        { label: "تأییدهای در انتظار", value: formatNumber((approvals.data ?? []).length), sub: "نیازمند تصمیم", loading: approvals.isLoading, href: "/approvals", icon: IconApproval, tone: "warning" },
        { label: "یکپارچه‌سازی نارسانا", value: formatNumber(unhealthy), sub: "سرویس بیرونی با خطا", loading: integrations.isLoading, href: "/integrations", icon: IconIntegration, tone: unhealthy > 0 ? "danger" : "success" },
      ];
    }
    // warehouse
    const critical = (stock.data ?? []).filter((s) => num(s.qty_available) <= 0).length;
    const openCounts = (stocktakes.data ?? []).filter((c) => OPEN_STOCKTAKE_STATUSES.has(c.status ?? "")).length;
    const inTransit = (transfers.data ?? []).filter((t) => t.status === "in_transit").length;
    const pendingDeliveries = (deliveries.data ?? []).filter((d) => PENDING_DELIVERY_STATUSES.has(d.status ?? "")).length;
    return [
      { label: "موجودی بحرانی", value: formatNumber(critical), sub: "کالای با موجودی صفر", loading: stock.isLoading, href: "/warehouses", icon: IconWarehouse, tone: critical > 0 ? "danger" : "success" },
      { label: "انبارگردانی باز", value: formatNumber(openCounts), sub: "پیش‌نویس/شمارش/بازبینی", loading: stocktakes.isLoading, href: "/stock-count", icon: IconClipboardCheck, tone: "info" },
      { label: "انتقال در جریان", value: formatNumber(inTransit), sub: "بین انباری در راه", loading: transfers.isLoading, href: "/transfers", icon: IconTransfer, tone: "info" },
      { label: "تحویل معوق", value: formatNumber(pendingDeliveries), sub: "برنامه‌ریزی/ارسال/جزئی", loading: deliveries.isLoading, href: "/issues", icon: IconDelivery, tone: "warning" },
    ];
  }, [layer, ordersToday.data, invoices.data, ar.data, treasury.data, approvals.data, tracking.data, tours.data, integrations.data, stock.data, stocktakes.data, transfers.data, deliveries.data, salesToday, today]);

  const showChart = layer === "executive" || layer === "sales";

  const modules: { title: string; desc: string; href: string; icon: Icon }[] = [
    { title: "سفارشات فروش", desc: "مدیریت چرخهٔ سفارش تا فاکتور", href: "/orders", icon: IconOrder },
    { title: "مشتریان", desc: "پروفایل، اعتبار، مسیر و تاریخچه", href: "/customers", icon: IconCustomer },
    { title: "تورهای فروش", desc: "برنامه‌ریزی، اجرا و تسویهٔ تور", href: "/tours", icon: IconTour },
    { title: "رهگیری زنده", desc: "نقشهٔ زندهٔ نیروهای میدانی", href: "/tracking", icon: IconTracking },
    { title: "انبار و موجودی", desc: "رسید، حواله، انتقال و انبارگردانی", href: "/warehouses", icon: IconWarehouse },
    { title: "موتور قوانین", desc: "سقف اعتبار، تخفیف و تأیید خودکار", href: "/rules", icon: IconRules },
    { title: "حساب‌های دریافتنی", desc: "بدهکاری، سررسید، وصول", href: "/ar", icon: IconReceivable },
    { title: "خزانه‌داری", desc: "صندوق، بانک، چک‌ها", href: "/treasury", icon: IconTreasury },
  ];

  return (
    <div className="space-y-7">
      <PageHeader
        title="داشبورد اجرایی"
        description={`نمای لایهٔ «${LAYER_FA[layer]}» — عملکرد فروش و پخش مویرگی`}
        actions={
          <>
            <Badge tone="neutral" size="md">
              {toPersianDate(today)}
            </Badge>
            {isAdmin && (
              <SegmentedControl<Layer>
                ariaLabel="انتخاب لایهٔ نمایش"
                value={layer}
                onChange={setLayer}
                options={(Object.keys(LAYER_FA) as Layer[]).map((key) => ({
                  value: key,
                  label: LAYER_FA[key],
                }))}
              />
            )}
          </>
        }
      />

      <StatGrid>
        {cards.map((card) => {
          const CardIcon = card.icon;
          return (
            <StatCard
              key={card.label}
              label={card.label}
              value={card.value}
              sub={card.sub}
              href={card.href}
              loading={card.loading}
              tone={card.tone}
              icon={<CardIcon />}
            />
          );
        })}
        {/* وقتی لایه کمتر از چهار کارت دارد، اسکلتون نگذار — چیدمان خودش جمع می‌شود */}
      </StatGrid>

      {showChart && (
        <DashboardCharts
          data={chart}
          title="روند فروش"
          description="جمع مبلغ سفارش‌ها در ۱۲ روز گذشته"
          unit="میلیون ریال"
          loading={ordersRecent.isLoading}
          emptyMessage="سفارشی برای رسم روند یافت نشد"
        />
      )}

      <section>
        <SectionTitle>دسترسی سریع</SectionTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {modules.map((module) => {
            const ModuleIcon = module.icon;
            return (
              <CardLink key={module.title} href={module.href} className="group">
                <div className="flex items-start justify-between gap-3">
                  <span
                    aria-hidden
                    className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-alt text-ink-muted transition-colors group-hover:bg-brand-soft group-hover:text-brand-soft-ink"
                  >
                    <ModuleIcon className="size-5" />
                  </span>
                  <IconChevronEnd
                    aria-hidden
                    className="size-4 shrink-0 text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100 rtl:rotate-180"
                  />
                </div>
                <p className="mt-3 text-sm font-semibold text-ink">{module.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{module.desc}</p>
              </CardLink>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** اسکلتون داشبورد تا پیش از آماده‌شدن اولین کوئری، چیدمان خالی دیده نشود */
export function DashboardSkeleton() {
  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <div className="h-6 w-48 rounded-md bg-surface-alt" />
        <div className="h-4 w-72 rounded-md bg-surface-alt" />
      </div>
      <StatGrid>
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonCard key={index} />
        ))}
      </StatGrid>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RoleGuard>
      <DashboardInner />
    </RoleGuard>
  );
}
