"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Alert, EmptyState, ErrorState, SkeletonText } from "@/components/ui/Feedback";
import { Field, Input, Select } from "@/components/ui/Form";
import AdminGuard from "@/components/auth/guards";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";

/**
 * قیمت‌گذاری — سه بلوکِ متصل به موتورِ قیمتِ TASK-24 (نه رابطِ دومِ جدا):
 *   ۱) لیست‌های قیمت (GET /price-lists) — همان جدولِ پیشین
 *   ۲) شبیه‌سازی و استعلام (POST /pricing/simulate) با تجزیهٔ کاملِ قیمت،
 *      تشویق‌های اعمال/رد‌شده، هشدارهای کفِ سود و توضیحِ گام‌به‌گام
 *   ۳) سیاست‌های کفِ سود (GET /margin-policies) و تاریخچهٔ تغییرِ قیمت
 *      (GET /pricing/price-changes)
 *
 * هر بلوک با مجوزِ خودش نمایش داده می‌شود؛ چیزی که کاربر مجوزش را ندارد حتی
 * درخواست هم نمی‌شود (بدونِ ۴۰۳های بی‌مورد).
 */
type PriceList = components["schemas"]["PriceList"];
type Product = components["schemas"]["Product"];
type Customer = components["schemas"]["Customer"];
type MarginPolicy = components["schemas"]["MarginPolicy"];
type QuoteResult = components["schemas"]["QuoteResult"];
type QuoteLineResult = components["schemas"]["QuoteLineResult"];
type PriceChangeLog = components["schemas"]["PriceChangeLog"];

const KIND_FA: Record<string, string> = {
  general: "عمومی",
  wholesale: "عمده‌فروشی",
  retail: "خرده‌فروشی",
  chain: "زنجیره‌ای",
  cooperative: "تعاونی",
  channel: "کانالی",
};

const SCOPE_FA: Record<string, string> = {
  company: "سطحِ شرکت",
  category: "سطحِ دسته",
  product: "سطحِ کالا",
};

const COST_FA: Record<string, string> = {
  avg_cost: "میانگین بهای تمام‌شده",
  standard_cost: "بهای استاندارد",
  last_purchase_cost: "آخرین خرید",
};

const UNKNOWN_FA: Record<string, string> = {
  block: "مسدود",
  warn: "هشدار",
  ignore: "بی‌تأثیر",
};

const SOURCE_FA: Record<string, string> = {
  customer: "قیمت اختصاصی مشتری",
  requested_list: "لیست انتخاب‌شده",
  domain: "لیست قلمرو",
  company: "لیست سراسری شرکت",
  manual: "قیمت دستی",
  price_list: "لیست قیمت",
};

const PROMO_KIND_FA: Record<string, string> = {
  percent_line: "درصدی قلم",
  amount_line: "مبلغی قلم",
  bundle: "بسته",
  buy_x_get_y: "بخر و بگیر",
  gift_item: "هدیه",
  cash_discount: "تخفیف نقدی",
  repeat_order: "تکرار خرید",
  coupon: "کوپن",
  volume_tier: "پله‌ای حجمی",
};

const SKIP_FA: Record<string, string> = {
  coupon_required: "کوپن لازم است",
  coupon_invalid: "کوپن نامعتبر/منقضی",
  blocked_by_non_stackable: "قاعدهٔ بدون انباشت",
  exclusive_group_conflict: "تعارض در گروه انحصاری",
  zero_benefit: "مزیت صفر",
  usage_exhausted: "سقف مصرف تکمیل",
  not_applicable: "شرایط احراز نشد",
};

const todayIso = () => new Date().toISOString().slice(0, 10);

function PricesInner() {
  const { hasPermission } = useAuth();
  const canSimulate = hasPermission("pricing.simulation.run");
  const canSeeMargin = hasPermission("pricing.margin.view");
  const canSeeAudit = hasPermission("pricing.audit.view");

  const [kind, setKind] = useState("");

  const priceLists = useQuery({
    queryKey: ["price-lists"],
    queryFn: async () => {
      const res = await api.GET("/price-lists", { params: { query: { limit: 200 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as PriceList[];
    },
  });

  const products = useQuery({
    queryKey: ["products", "prices"],
    queryFn: async () => {
      const res = await api.GET("/products", { params: { query: { limit: 500 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Product[];
    },
    enabled: canSimulate,
  });

  const customers = useQuery({
    queryKey: ["customers", "prices"],
    queryFn: async () => {
      const res = await api.GET("/customers", { params: { query: { limit: 500 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Customer[];
    },
    enabled: canSimulate,
  });

  const marginPolicies = useQuery({
    queryKey: ["margin-policies"],
    queryFn: async () => {
      const res = await api.GET("/margin-policies");
      if (res.error) throw new Error(errorMessage(res.error));
      const data = res.data as unknown as { items?: MarginPolicy[] } | MarginPolicy[];
      return (Array.isArray(data) ? data : (data?.items ?? [])) as MarginPolicy[];
    },
    enabled: canSeeMargin,
  });

  const priceChanges = useQuery({
    queryKey: ["pricing-price-changes"],
    queryFn: async () => {
      const res = await api.GET("/pricing/price-changes", { params: { query: { limit: 50 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      const data = res.data as unknown as { items?: PriceChangeLog[] } | PriceChangeLog[];
      return (Array.isArray(data) ? data : (data?.items ?? [])) as PriceChangeLog[];
    },
    enabled: canSeeAudit,
  });

  // ---------------- شبیه‌سازی ----------------
  const [productId, setProductId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [qty, setQty] = useState("1");
  const [date, setDate] = useState(todayIso());
  const [coupons, setCoupons] = useState("");

  const simulate = useMutation({
    mutationFn: async (): Promise<QuoteResult> => {
      const res = await api.POST("/pricing/simulate", {
        body: {
          customer_id: customerId || null,
          pricing_date: date || null,
          apply_promotions: true,
          coupon_codes: coupons
            .split(",")
            .map((c) => c.trim())
            .filter(Boolean),
          lines: [{ product_id: productId, qty: Number(qty) }],
        },
      });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data as QuoteResult;
    },
  });

  const quote = simulate.data;
  const formError = useMemo(() => {
    if (!productId) return "کالا را انتخاب کنید.";
    if (!Number.isFinite(Number(qty)) || Number(qty) <= 0) return "تعداد باید بزرگ‌تر از صفر باشد.";
    return null;
  }, [productId, qty]);

  const all = priceLists.data ?? [];
  const items = kind ? all.filter((p) => p.kind === kind) : all;

  const listColumns: Column<PriceList>[] = [
    { key: "code", header: "کد", render: (p) => <span className="font-mono text-xs">{p.code ?? "—"}</span> },
    { key: "title", header: "عنوان", render: (p) => <span className="text-sm">{p.title ?? "—"}</span> },
    { key: "kind", header: "نوع", render: (p) => <span className="text-xs">{KIND_FA[p.kind ?? ""] ?? p.kind ?? "—"}</span> },
    { key: "currency", header: "واحد پول", render: (p) => <span className="text-xs">{p.currency ?? "IRR"}</span> },
    {
      key: "items",
      header: "اقلام",
      align: "end",
      render: (p) => <span className="text-xs">{formatNumber((p.items ?? []).length)} قلم</span>,
    },
    {
      key: "active",
      header: "وضعیت",
      render: (p) =>
        p.is_active ? (
          <span className="px-2 py-0.5 rounded-md text-xs bg-brand-soft text-brand-soft-ink">فعال</span>
        ) : (
          <span className="px-2 py-0.5 rounded-md text-xs bg-surface-alt text-ink-muted">غیرفعال</span>
        ),
    },
  ];

  const lineColumns: Column<QuoteLineResult>[] = [
    { key: "line", header: "#", width: "w-10", render: (l) => <span className="text-xs">{formatNumber(l.line_no)}</span> },
    {
      key: "product",
      header: "کالا",
      render: (l) => (
        <div className="leading-tight">
          <div className="text-sm">{l.product_name}</div>
          <div className="font-mono text-[11px] text-ink-subtle">{l.product_code}</div>
        </div>
      ),
    },
    {
      key: "source",
      header: "منبع قیمت",
      render: (l) => (
        <div className="space-y-1">
          <Badge tone="info">{SOURCE_FA[l.pricing?.scope ?? ""] ?? l.pricing?.scope ?? "—"}</Badge>
          {l.pricing?.price_list_code ? (
            <div className="font-mono text-[11px] text-ink-subtle">{l.pricing.price_list_code}</div>
          ) : null}
        </div>
      ),
    },
    { key: "qty", header: "تعداد", align: "end", render: (l) => <span className="text-xs">{formatNumber(l.qty)}</span> },
    {
      key: "unit",
      header: "قیمت واحد",
      align: "end",
      render: (l) => <span className="font-mono text-xs">{formatMoney(l.unit_price)}</span>,
    },
    {
      key: "discount",
      header: "تخفیف",
      align: "end",
      render: (l) => <span className="font-mono text-xs text-ink-muted">{formatMoney(l.discount_total)}</span>,
    },
    {
      key: "tax",
      header: "مالیات",
      align: "end",
      render: (l) => (
        <span className="text-xs">
          {formatMoney(l.tax_amount)} <span className="text-ink-subtle">({formatPercent(l.tax_rate_pct, 0)})</span>
        </span>
      ),
    },
    {
      key: "total",
      header: "مبلغ نهایی",
      align: "end",
      render: (l) => <span className="font-mono text-sm font-medium">{formatMoney(l.line_total)}</span>,
    },
    {
      key: "margin",
      header: "حاشیه سود",
      align: "end",
      render: (l) => {
        // TASK-24F · MEDIUM-3: وضعیت‌های واقعیِ موتور = ok | violation | cost_unknown |
        // exception_applied | no_policy (پیش‌تر «below_floor» چک می‌شد که هرگز تولید نمی‌شد
        // و نقضِ کفِ سود هیچ‌گاه برجسته نمی‌شد).
        const status = l.margin?.status;
        const tone =
          status === "violation"
            ? "text-danger"
            : status === "exception_applied"
              ? "text-warning-ink"
              : status === "cost_unknown" || status === "no_policy"
                ? "text-ink-subtle"
                : "text-ink";
        const hint =
          status === "violation"
            ? "نقضِ کفِ سود — ثبتِ سفارش نیازمندِ استثنای تأییدشده است"
            : status === "exception_applied"
              ? "استثنای تأییدشدهٔ کفِ سود"
              : (l.margin?.message_fa ?? undefined);
        return (
          <span className={`text-xs font-medium ${tone}`} title={hint}>
            {l.margin?.margin_pct == null ? "نامشخص" : formatPercent(l.margin.margin_pct)}
            {status === "violation" ? " ⚠" : status === "exception_applied" ? " ✓" : ""}
          </span>
        );
      },
    },
  ];

  const policyColumns: Column<MarginPolicy>[] = [
    { key: "scope", header: "دامنه", render: (p) => <span className="text-xs">{SCOPE_FA[p.scope ?? ""] ?? p.scope}</span> },
    {
      key: "min",
      header: "کف سود",
      align: "end",
      render: (p) => <span className="font-mono text-xs">{formatPercent(Number(p.min_margin_pct))}</span>,
    },
    {
      key: "basis",
      header: "مبنای بهای تمام‌شده",
      render: (p) => <span className="text-xs">{COST_FA[p.cost_basis ?? ""] ?? p.cost_basis ?? "—"}</span>,
    },
    {
      key: "unknown",
      header: "بهای نامشخص",
      render: (p) => <span className="text-xs">{UNKNOWN_FA[p.on_unknown_cost ?? ""] ?? p.on_unknown_cost ?? "—"}</span>,
    },
    { key: "priority", header: "اولویت", align: "end", render: (p) => <span className="text-xs">{formatNumber(p.priority)}</span> },
    {
      key: "active",
      header: "وضعیت",
      render: (p) => (p.is_active ? <Badge tone="success">فعال</Badge> : <Badge tone="neutral">غیرفعال</Badge>),
    },
  ];

  const changeColumns: Column<PriceChangeLog>[] = [
    {
      key: "at",
      header: "زمان",
      render: (r) => (
        <span className="font-mono text-[11px] text-ink-muted">
          {r.at ? new Date(r.at).toLocaleString("fa-IR") : "—"}
        </span>
      ),
    },
    { key: "entity", header: "موجودیت", render: (r) => <span className="text-xs">{r.entity_type ?? "—"}</span> },
    { key: "action", header: "کنش", render: (r) => <Badge tone="info">{r.action ?? "—"}</Badge> },
    {
      key: "id",
      header: "شناسه",
      render: (r) => <span className="font-mono text-[11px] text-ink-subtle">{r.entity_id ?? "—"}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">لیست‌های قیمت</h1>
          <p className="text-ink-muted text-sm">قیمت‌گذاری کالاها به تفکیک نوع مشتری؛ قیمت مشتری‌محور اولویت دارد</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            aria-label="فیلتر نوع لیست قیمت"
            className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer pe-8"
          >
            <option value="">همهٔ انواع</option>
            {Object.entries(KIND_FA).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <ExportButtons data={items} tableId="prices-table" filename="price-lists" />
        </div>
      </div>

      <div id="prices-table">
        <DataTable
          columns={listColumns}
          rows={items}
          rowKey={(p) => p.id ?? p.code ?? Math.random().toString()}
          loading={priceLists.isLoading}
          error={priceLists.error ? (priceLists.error as Error).message : null}
          emptyMessage="لیست قیمتی یافت نشد"
        />
      </div>

      {canSimulate ? (
        <Card padded={false}>
          <CardHeader
            title="شبیه‌سازی قیمت"
            description="قیمتِ نهایی، تشویق‌های واجدِ شرط، مالیات و اثر بر حاشیهٔ سود — بدونِ ثبتِ سند"
            actions={<Badge tone="neutral">فقط شبیه‌سازی؛ سندی ثبت نمی‌شود</Badge>}
          />
          <CardBody className="space-y-5">
            <form
              className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!formError) simulate.mutate();
              }}
            >
              <Field label="کالا" required htmlFor="sim-product">
                <Select
                  id="sim-product"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  required
                >
                  <option value="">انتخاب کنید…</option>
                  {(products.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="مشتری" hint="اختیاری — با انتخاب مشتری، قیمت اختصاصی و قلمرو او اعمال می‌شود" htmlFor="sim-customer">
                <Select id="sim-customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">بدون مشتری</option>
                  {(customers.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="تعداد" required htmlFor="sim-qty">
                <Input
                  id="sim-qty"
                  type="number"
                  min="0.0001"
                  step="any"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  required
                />
              </Field>
              <Field label="تاریخ قیمت‌گذاری" htmlFor="sim-date">
                <Input id="sim-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field
                label="کدهای کوپن"
                hint="چند کوپن را با کاما جدا کنید"
                htmlFor="sim-coupons"
                className="sm:col-span-2"
              >
                <Input
                  id="sim-coupons"
                  value={coupons}
                  onChange={(e) => setCoupons(e.target.value)}
                  placeholder="WELCOME10, SPRING"
                />
              </Field>
              <div className="flex items-end gap-2 lg:col-span-2">
                <Button type="submit" disabled={Boolean(formError) || simulate.isPending}>
                  {simulate.isPending ? "در حال محاسبه…" : "محاسبهٔ قیمت"}
                </Button>
                {simulate.data ? (
                  <Button type="button" variant="ghost" onClick={() => simulate.reset()}>
                    پاک‌کردن نتیجه
                  </Button>
                ) : null}
              </div>
            </form>

            {formError ? <p className="text-xs text-danger">{formError}</p> : null}
            {simulate.error ? (
              <Alert tone="danger" title="محاسبه انجام نشد">
                {(simulate.error as Error).message}
              </Alert>
            ) : null}

            {simulate.isPending ? <SkeletonText lines={3} /> : null}

            {quote ? (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {[
                    { label: "جمع قبل از تخفیف", value: formatMoney(quote.subtotal) },
                    { label: "تخفیف", value: formatMoney(quote.discount_total) },
                    { label: "مالیات", value: formatMoney(quote.tax_total) },
                    { label: "مبلغ قابل پرداخت", value: formatMoney(quote.grand_total) },
                    {
                      label: "حاشیهٔ سود",
                      value: quote.margin_pct == null ? "نامشخص" : formatPercent(quote.margin_pct),
                    },
                  ].map((s) => (
                    <div key={s.label} className="rounded-xl border border-line bg-surface-alt px-3 py-3">
                      <div className="text-[11px] text-ink-muted">{s.label}</div>
                      <div className="mt-1 font-mono text-sm font-medium text-ink">{s.value}</div>
                    </div>
                  ))}
                </div>

                {quote.margin_violations?.length ? (
                  <Alert tone="danger" title="نقض کف سود — نیازمند استثنای تأییدشده">
                    <ul className="list-disc ps-5 space-y-1">
                      {quote.margin_violations.map((v, i) => (
                        <li key={`${v.product_id}-${i}`} className="text-xs">
                          {v.message_fa}
                        </li>
                      ))}
                    </ul>
                  </Alert>
                ) : null}

                {quote.approval_required?.required ? (
                  <Alert tone="warning" title="این قیمت نیازمند تأیید است">
                    <ul className="list-disc ps-5 space-y-1">
                      {(quote.approval_required.reasons ?? []).map((r, i) => (
                        <li key={i} className="text-xs">
                          {r}
                        </li>
                      ))}
                    </ul>
                  </Alert>
                ) : null}

                {(quote.warnings ?? []).length ? (
                  <Alert tone="warning" title="هشدارهای محاسبه">
                    <ul className="list-disc ps-5 space-y-1">
                      {(quote.warnings ?? []).map((w, i) => (
                        <li key={i} className="text-xs">
                          {w}
                        </li>
                      ))}
                    </ul>
                  </Alert>
                ) : null}

                <div className="overflow-x-auto">
                  <DataTable
                    columns={lineColumns}
                    rows={quote.lines ?? []}
                    rowKey={(l) => String(l.line_no)}
                    dense
                    emptyMessage="قلمی برای محاسبه نبود"
                  />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-line p-4">
                    <h3 className="mb-2 text-sm font-semibold text-ink">تشویق‌های اعمال‌شده</h3>
                    {(quote.applied_promotions ?? []).length === 0 ? (
                      <p className="text-xs text-ink-muted">هیچ تشویقی اعمال نشد.</p>
                    ) : (
                      <ul className="space-y-2">
                        {(quote.applied_promotions ?? []).map((p) => (
                          <li key={p.promotion_id} className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-sm text-ink">
                                {p.title} <span className="font-mono text-[11px] text-ink-subtle">{p.code}</span>
                              </div>
                              <div className="text-[11px] text-ink-muted">{p.explanation_fa}</div>
                            </div>
                            <span className="font-mono text-xs">−{formatMoney(p.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="rounded-xl border border-line p-4">
                    <h3 className="mb-2 text-sm font-semibold text-ink">تشویق‌های اعمال‌نشده</h3>
                    {(quote.skipped_promotions ?? []).length === 0 ? (
                      <p className="text-xs text-ink-muted">همهٔ تشویق‌های واجدِ شرط اعمال شدند.</p>
                    ) : (
                      <ul className="space-y-2">
                        {(quote.skipped_promotions ?? []).map((p) => (
                          <li key={p.promotion_id} className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-sm text-ink">{p.code}</div>
                              <div className="text-[11px] text-ink-muted">{p.message_fa}</div>
                            </div>
                            <Badge tone="neutral">{SKIP_FA[p.reason ?? ""] ?? p.reason}</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {(quote.gift_lines ?? []).length ? (
                  <div className="rounded-xl border border-line p-4">
                    <h3 className="mb-2 text-sm font-semibold text-ink">اقلام هدیه</h3>
                    <ul className="space-y-1">
                      {(quote.gift_lines ?? []).map((g, i) => (
                        <li key={`${g.promotion_id}-${i}`} className="text-xs text-ink-muted">
                          {g.qty} عدد از کالای <span className="font-mono">{(g.product_id ?? "—").slice(0, 8)}</span> — ارزشِ
                          مرجع {formatMoney(g.value)} (تشویق {g.promotion_code})
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="rounded-xl border border-line bg-surface-alt p-4">
                  <h3 className="mb-2 text-sm font-semibold text-ink">چگونه این قیمت به دست آمد؟</h3>
                  <ol className="list-decimal ps-5 space-y-1">
                    {(quote.explanation ?? []).map((line, i) => (
                      <li key={i} className="text-xs text-ink-muted">
                        {line}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {canSeeMargin ? (
        <Card padded={false}>
          <CardHeader
            title="سیاست‌های کف سود"
            description="کفِ سود به تفکیک شرکت/دسته/کالا؛ نقضِ کف نیازمندِ استثنای تأییدشدهٔ شخص دوم است"
          />
          <CardBody>
            {marginPolicies.error ? (
              <ErrorState message={(marginPolicies.error as Error).message} onRetry={() => void marginPolicies.refetch()} />
            ) : (
              <DataTable
                columns={policyColumns}
                rows={marginPolicies.data ?? []}
                rowKey={(p) => p.id ?? `${p.scope}-${p.min_margin_pct}`}
                loading={marginPolicies.isLoading}
                emptyMessage="سیاست کف سودی تعریف نشده است"
                emptyDescription="بدون سیاست، موتور قیمت نقضِ کفِ سود اعلام نمی‌کند."
              />
            )}
          </CardBody>
        </Card>
      ) : null}

      {canSeeAudit ? (
        <Card padded={false}>
          <CardHeader
            title="تاریخچهٔ تغییر قیمت"
            description="دفتر تنها-افزودنی (append-only) — هر تغییرِ قیمت/سیاست با کنش و شناسه ثبت می‌شود"
          />
          <CardBody>
            {priceChanges.error ? (
              <ErrorState message={(priceChanges.error as Error).message} onRetry={() => void priceChanges.refetch()} />
            ) : (priceChanges.data ?? []).length === 0 && !priceChanges.isLoading ? (
              <EmptyState title="هنوز تغییری ثبت نشده است" description="با تغییر قیمت یا سیاست، ردیف‌ها اینجا ظاهر می‌شوند." />
            ) : (
              <DataTable
                columns={changeColumns}
                rows={priceChanges.data ?? []}
                rowKey={(r) => String(r.id)}
                loading={priceChanges.isLoading}
                emptyMessage="ردیفی نیست"
                dense
              />
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

export default function PricesPage() {
  return (
    <AdminGuard>
      <PricesInner />
    </AdminGuard>
  );
}
