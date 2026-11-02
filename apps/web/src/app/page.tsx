"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { RoleGuard } from "@/components/auth/RoleGuard";
import DashboardCharts, { type ChartPoint } from "@/app/dashboard-charts";
import { formatMoney, formatNumber } from "@/lib/format";
import { toPersianDate } from "@/lib/date";

/**
 * داشبورد اجرایی — KPIهای واقعی از API (نه مقادیر سخت‌کدشدهٔ «۰» پیشین).
 *
 * منابع داده (همگی تایپ‌شده از قرارداد):
 *  - GET /orders?order_date=<امروز>  → تعداد و مبلغ فروش امروز
 *  - GET /orders (اخیر)              → روند فروش برای نمودار (سطل‌بندی بر پایهٔ تاریخ)
 *  - GET /invoices                   → فاکتورهای صادرشدهٔ امروز (وضعیت ثبت/پرداخت‌شده)
 *  - GET /ar                         → بدهکاری معوق (سررسید گذشته = total − current)
 *  - GET /treasury                   → موقعیت خزانه (جمع ماندهٔ دفتری)
 *  - GET /rules-engine/approvals     → تأییدهای در انتظار
 *  - GET /tracking/live              → نیروهای میدانی روی خط
 *
 * دسترسی: فقط ورود لازم است (RoleGuard بدون نقش) — AppShell نشست را bootstrap می‌کند.
 */
type SalesOrder = components["schemas"]["SalesOrder"];
type Invoice = components["schemas"]["Invoice"];
type ArAgingRow = components["schemas"]["ArAgingRow"];
type TreasuryPosition = components["schemas"]["TreasuryPosition"];
type ApprovalRequest = components["schemas"]["ApprovalRequest"];
type LiveLocation = components["schemas"]["LiveLocation"];

const ISSUED_INVOICE_STATUSES = new Set(["posted", "partially_paid", "paid"]);

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function num(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function DashboardInner() {
  const today = todayISO();

  const ordersToday = useQuery({
    queryKey: ["dash-orders-today", today],
    queryFn: async () => {
      const res = await api.GET("/orders", { params: { query: { order_date: today, limit: 200 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as SalesOrder[];
    },
  });

  const ordersRecent = useQuery({
    queryKey: ["dash-orders-recent"],
    queryFn: async () => {
      const res = await api.GET("/orders", { params: { query: { limit: 500 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as SalesOrder[];
    },
  });

  const invoices = useQuery({
    queryKey: ["dash-invoices", today],
    queryFn: async () => {
      const res = await api.GET("/invoices", { params: { query: { limit: 200 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Invoice[];
    },
  });

  const ar = useQuery({
    queryKey: ["dash-ar"],
    queryFn: async () => {
      const res = await api.GET("/ar", { params: { query: { limit: 200 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as ArAgingRow[];
    },
  });

  const treasury = useQuery({
    queryKey: ["dash-treasury"],
    queryFn: async () => {
      const res = await api.GET("/treasury");
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as TreasuryPosition[];
    },
  });

  const approvals = useQuery({
    queryKey: ["dash-approvals"],
    queryFn: async () => {
      // /rules-engine/approvals یک «آرایهٔ خام» با تنها پارامتر status برمی‌گرداند
      const res = await api.GET("/rules-engine/approvals", { params: { query: { status: "pending" } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data ?? []) as ApprovalRequest[];
    },
  });

  const tracking = useQuery({
    queryKey: ["dash-tracking"],
    queryFn: async () => {
      const res = await api.GET("/tracking/live");
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data ?? []) as LiveLocation[];
    },
  });

  const kpi = useMemo(() => {
    const orders = ordersToday.data ?? [];
    const ordersCount = orders.length;
    const salesToday = orders.reduce((acc, o) => acc + num(o.grand_total), 0);

    const inv = invoices.data ?? [];
    const invoicesToday = inv.filter(
      (i) => i.invoice_date === today && ISSUED_INVOICE_STATUSES.has(i.status ?? ""),
    ).length;

    const overdue = (ar.data ?? []).reduce(
      (acc, r) => acc + Math.max(0, num(r.total) - num(r.current)),
      0,
    );

    const cash = (treasury.data ?? []).reduce((acc, t) => acc + num(t.balance_book), 0);
    const pendingApprovals = (approvals.data ?? []).filter((a) => a.status === "pending").length;
    const liveStaff = (tracking.data ?? []).length;

    return { ordersCount, salesToday, invoicesToday, overdue, cash, pendingApprovals, liveStaff };
  }, [ordersToday.data, invoices.data, ar.data, treasury.data, approvals.data, tracking.data, today]);

  // روند فروش: سطل‌بندی سفارش‌های اخیر بر پایهٔ تاریخ سفارش (میلیون ریال)، ۱۲ نقطهٔ آخر
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

  const cards = [
    { label: "سفارشات امروز", value: formatNumber(kpi.ordersCount), sub: "ثبت‌شده تا این لحظه", loading: ordersToday.isLoading },
    { label: "فاکتورهای صادرشده", value: formatNumber(kpi.invoicesToday), sub: "امروز · ثبت/پرداخت‌شده", loading: invoices.isLoading },
    { label: "مبلغ فروش امروز", value: formatMoney(kpi.salesToday, "ریال"), sub: "جمع کل سفارش‌های امروز", loading: ordersToday.isLoading },
    { label: "بدهکاری معوق", value: formatMoney(kpi.overdue, "ریال"), sub: "سررسید گذشته (از AR)", loading: ar.isLoading },
  ];

  const secondary = [
    { label: "موقعیت خزانه", value: formatMoney(kpi.cash, "ریال"), sub: "ماندهٔ دفتری صندوق/بانک", href: "/treasury", loading: treasury.isLoading },
    { label: "تأییدهای در انتظار", value: formatNumber(kpi.pendingApprovals), sub: "نیازمند تصمیم", href: "/approvals", loading: approvals.isLoading },
    { label: "نیروهای میدانی زنده", value: formatNumber(kpi.liveStaff), sub: "روی خط در لحظه", href: "/tracking", loading: tracking.isLoading },
  ];

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
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">داشبورد اجرایی</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">نمای کلی عملکرد فروش و پخش مویرگی</p>
        </div>
        <div className="text-sm text-slate-500 dark:text-slate-400">{toPersianDate(today)}</div>
      </div>

      <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((k) => (
          <div key={k.label} className="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-[#1f2937] p-5 shadow-sm">
            <div className="text-sm text-slate-500 dark:text-slate-400">{k.label}</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-2">
              {k.loading ? <span className="text-slate-300 dark:text-slate-600">…</span> : k.value}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-2">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {secondary.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-[#1f2937] p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
          >
            <div className="text-sm text-slate-500 dark:text-slate-400">{s.label}</div>
            <div className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">
              {s.loading ? <span className="text-slate-300 dark:text-slate-600">…</span> : s.value}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{s.sub}</div>
          </Link>
        ))}
      </div>

      <DashboardCharts
        data={chart}
        title="روند فروش"
        unit="میلیون ریال"
        loading={ordersRecent.isLoading}
        emptyMessage="سفارشی برای رسم روند یافت نشد"
      />

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">دسترسی سریع</h2>
        </div>
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-4">
          {modules.map((m) => (
            <Link
              key={m.title}
              href={m.href}
              className="bg-white dark:bg-[#111827] rounded-2xl border border-slate-200 dark:border-[#1f2937] p-5 hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <div className="font-semibold text-slate-900 dark:text-slate-100">{m.title}</div>
              <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">{m.desc}</div>
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
