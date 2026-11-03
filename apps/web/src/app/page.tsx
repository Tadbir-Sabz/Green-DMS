"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { RoleGuard } from "@/components/auth/RoleGuard";
import { useAuth } from "@/lib/auth";
import { ADMIN_ROLES, FINANCE_ROLES, SALES_ROLES, WAREHOUSE_ROLES } from "@/lib/rbac";
import DashboardCharts, { type ChartPoint } from "@/app/dashboard-charts";
import { formatMoney, formatNumber } from "@/lib/format";
import { toPersianDate } from "@/lib/date";

/**
 * داشبورد لایه‌ای (ضمیمه C.۱) — KPIهای واقعی از API، به تفکیک لایهٔ نقش:
 *
 *  - مدیرعامل/ادمین (executive): فروش امروز، فاکتورها، بدهکاری معوق، خزانه،
 *    تأییدهای در انتظار، نیروهای زنده + نمودار روند فروش
 *  - مدیر/فروشنده (sales): سفارش‌ها و فروش امروز، تورهای امروز، تأییدها،
 *    نیروهای زنده + نمودار روند فروش
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

type Card = { label: string; value: string; sub: string; loading?: boolean; href?: string };

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
        { label: "سفارشات امروز", value: formatNumber((ordersToday.data ?? []).length), sub: "ثبت‌شده تا این لحظه", loading: ordersToday.isLoading },
        { label: "فاکتورهای صادرشده", value: formatNumber(invoicesToday), sub: "امروز · ثبت/پرداخت‌شده", loading: invoices.isLoading },
        { label: "مبلغ فروش امروز", value: formatMoney(salesToday, "ریال"), sub: "جمع کل سفارش‌های امروز", loading: ordersToday.isLoading },
        { label: "بدهکاری معوق", value: formatMoney(overdue, "ریال"), sub: "سررسید گذشته (از AR)", loading: ar.isLoading, href: "/ar" },
        { label: "موقعیت خزانه", value: formatMoney(cash, "ریال"), sub: "ماندهٔ دفتری صندوق/بانک", loading: treasury.isLoading, href: "/treasury" },
        { label: "تأییدهای در انتظار", value: formatNumber((approvals.data ?? []).length), sub: "نیازمند تصمیم", loading: approvals.isLoading, href: "/approvals" },
        { label: "نیروهای میدانی زنده", value: formatNumber((tracking.data ?? []).length), sub: "روی خط در لحظه", loading: tracking.isLoading, href: "/tracking" },
      ];
    }
    if (layer === "sales") {
      const t = tours.data ?? [];
      const activeTours = t.filter((x) => x.status === "active").length;
      return [
        { label: "سفارشات امروز", value: formatNumber((ordersToday.data ?? []).length), sub: "ثبت‌شده تا این لحظه", loading: ordersToday.isLoading, href: "/orders" },
        { label: "مبلغ فروش امروز", value: formatMoney(salesToday, "ریال"), sub: "جمع کل سفارش‌های امروز", loading: ordersToday.isLoading },
        { label: "تورهای امروز", value: formatNumber(t.length), sub: `${formatNumber(activeTours)} تور در حال اجرا`, loading: tours.isLoading, href: "/tours" },
        { label: "تأییدهای در انتظار", value: formatNumber((approvals.data ?? []).length), sub: "نیازمند تصمیم", loading: approvals.isLoading, href: "/approvals" },
        { label: "نیروهای میدانی زنده", value: formatNumber((tracking.data ?? []).length), sub: "روی خط در لحظه", loading: tracking.isLoading, href: "/tracking" },
      ];
    }
    if (layer === "finance") {
      const overdue = (ar.data ?? []).reduce((acc, r) => acc + Math.max(0, num(r.total) - num(r.current)), 0);
      const cash = (treasury.data ?? []).reduce((acc, t) => acc + num(t.balance_book), 0);
      const unhealthy = (integrations.data ?? []).filter((s) => s.healthy === false).length;
      return [
        { label: "بدهکاری معوق", value: formatMoney(overdue, "ریال"), sub: "سررسید گذشته (از AR)", loading: ar.isLoading, href: "/ar" },
        { label: "موقعیت خزانه", value: formatMoney(cash, "ریال"), sub: "ماندهٔ دفتری صندوق/بانک", loading: treasury.isLoading, href: "/treasury" },
        { label: "تأییدهای در انتظار", value: formatNumber((approvals.data ?? []).length), sub: "نیازمند تصمیم", loading: approvals.isLoading, href: "/approvals" },
        { label: "یکپارچه‌سازی نارسانا", value: formatNumber(unhealthy), sub: "سرویس بیرونی با خطا", loading: integrations.isLoading, href: "/integrations" },
      ];
    }
    // warehouse
    const critical = (stock.data ?? []).filter((s) => num(s.qty_available) <= 0).length;
    const openCounts = (stocktakes.data ?? []).filter((c) => OPEN_STOCKTAKE_STATUSES.has(c.status ?? "")).length;
    const inTransit = (transfers.data ?? []).filter((t) => t.status === "in_transit").length;
    const pendingDeliveries = (deliveries.data ?? []).filter((d) => PENDING_DELIVERY_STATUSES.has(d.status ?? "")).length;
    return [
      { label: "موجودی بحرانی", value: formatNumber(critical), sub: "کالای با موجودی صفر", loading: stock.isLoading, href: "/warehouses" },
      { label: "انبارگردانی باز", value: formatNumber(openCounts), sub: "پیش‌نویس/شمارش/بازبینی", loading: stocktakes.isLoading, href: "/stock-count" },
      { label: "انتقال در جریان", value: formatNumber(inTransit), sub: "بین انباری در راه", loading: transfers.isLoading, href: "/transfers" },
      { label: "تحویل معوق", value: formatNumber(pendingDeliveries), sub: "برنامه‌ریزی/ارسال/جزئی", loading: deliveries.isLoading, href: "/issues" },
    ];
  }, [layer, ordersToday.data, invoices.data, ar.data, treasury.data, approvals.data, tracking.data, tours.data, integrations.data, stock.data, stocktakes.data, transfers.data, deliveries.data, salesToday, today]);

  const showChart = layer === "executive" || layer === "sales";

  const modules = [
    { title: "سفارشات فروش", desc: "مدیریت چرخهٔ سفارش تا فاکتور", href: "/orders" },
    { title: "مشتریان", desc: "پروفایل، اعتبار، مسیر و تاریخچه", href: "/customers" },
    { title: "تورهای فروش", desc: "برنامه‌ریزی، اجرا و تسویهٔ تور", href: "/tours" },
    { title: "رهگیری زنده", desc: "نقشهٔ زندهٔ نیروهای میدانی", href: "/tracking" },
    { title: "انبار و موجودی", desc: "رسید، حواله، انتقال و انبارگردانی", href: "/warehouses" },
    { title: "موتور قوانین", desc: "سقف اعتبار، تخفیف و تأیید خودکار", href: "/rules" },
    { title: "حساب‌های دریافتنی", desc: "بدهکاری، سررسید، وصول", href: "/ar" },
    { title: "خزانه‌داری", desc: "صندوق، بانک، چک‌ها", href: "/treasury" },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">داشبورد اجرایی</h1>
          <p className="text-ink-muted mt-1 text-sm">
            نمای لایهٔ «{LAYER_FA[layer]}» — عملکرد فروش و پخش مویرگی
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <div className="flex items-center gap-1 bg-surface-alt rounded-xl p-1">
              {(Object.keys(LAYER_FA) as Layer[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLayer(l)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${ layer === l ? "bg-surface text-brand-soft-ink shadow-sm" : "text-ink-muted hover:text-ink" }`}
                >
                  {LAYER_FA[l]}
                </button>
              ))}
            </div>
          )}
          <div className="text-sm text-ink-muted">{toPersianDate(today)}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((k) => {
          const inner = (
            <>
              <div className="text-sm text-ink-muted">{k.label}</div>
              <div className="text-2xl font-bold text-ink mt-2">
                {k.loading ? <span className="text-ink-subtle">…</span> : k.value}
              </div>
              <div className="text-xs text-ink-subtle mt-2">{k.sub}</div>
            </>
          );
          const cls = "bg-surface rounded-2xl border border-line p-5 shadow-sm";
          return k.href ? (
            <Link key={k.label} href={k.href} className={`${cls} hover:shadow-md hover:-translate-y-0.5 transition-all`}>
              {inner}
            </Link>
          ) : (
            <div key={k.label} className={cls}>
              {inner}
            </div>
          );
        })}
      </div>

      {showChart && (
        <DashboardCharts
          data={chart}
          title="روند فروش"
          unit="میلیون ریال"
          loading={ordersRecent.isLoading}
          emptyMessage="سفارشی برای رسم روند یافت نشد"
        />
      )}

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-ink">دسترسی سریع</h2>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
          {modules.map((m) => (
            <Link
              key={m.title}
              href={m.href}
              className="bg-surface rounded-2xl border border-line p-5 hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div className="font-semibold text-ink">{m.title}</div>
              <div className="text-sm text-ink-muted mt-1">{m.desc}</div>
            </Link>
          ))}
        </div>
      </div>
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
