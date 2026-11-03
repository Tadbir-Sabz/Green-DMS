"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { CONTROL, CONTROL_SIZES, stateClass } from "@/components/ui/Form";
import { cn } from "@/lib/cn";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { useToast } from "@/components/ui/Toast";
import { formatMoney, sumDecimal } from "@/lib/format";
import { toPersianDate } from "@/lib/date";

/**
 * خزانه‌داری (ماژول ۱۰) — دو تب:
 *  ۱) موقعیت خزانه: GET /treasury?as_of — ماندهٔ دفتری/واقعی صندوق و بانک‌ها + مغایرت.
 *  ۲) بستن‌های روزانه: GET /treasury/closes با فیلتر و تأیید (POST /treasury/closes/{id}/approve).
 *
 * ثبت بستن روزانه (POST /treasury/closes) عمداً در وب نیست: به branch_id نیاز
 * دارد و هیچ اندپوینت فهرست شعبه در قرارداد وجود ندارد؛ ثبت از اپ مالی/صندوق
 * انجام می‌شود و این تب مرور و تأیید را پوشش می‌دهد. به همین دلیل ستون شعبه
 * شناسهٔ خام (کوتاه‌شده) را نشان می‌دهد. نوع‌های union مستقیماً از اسکیمای
 * قرارداد گرفته می‌شوند تا همگام بمانند.
 */
type TreasuryPosition = components["schemas"]["TreasuryPosition"];
type TreasuryClose = components["schemas"]["TreasuryClose"];
type CloseStatus = NonNullable<TreasuryClose["status"]>;

const TABS = [
  { id: "positions", label: "موقعیت خزانه" },
  { id: "closes", label: "بستن‌های روزانه" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const CLOSE_STATUS_FA: Record<string, string> = {
  draft: "پیش‌نویس",
  closed: "بسته‌شده",
  approved: "تأییدشده",
};
const CLOSE_STATUS_TONE: Record<string, BadgeTone> = { draft: "neutral", closed: "warning", approved: "brand" };

const selectCls = cn(CONTROL, CONTROL_SIZES.md, stateClass(), "w-auto cursor-pointer pe-8");


function TabBar({ tab, onChange }: { tab: TabId; onChange: (t: TabId) => void }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-line">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`focus-ring px-4 py-2.5 text-sm rounded-t-xl border-b-2 -mb-px transition-colors ${ tab === t.id ? "border-brand text-brand-soft-ink font-semibold" : "border-transparent text-ink-muted hover:text-ink" }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------------- Positions ----------------

function PositionsPanel() {
  const [asOf, setAsOf] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["treasury", asOf],
    queryFn: async () => {
      const query: { as_of?: string } = {};
      if (asOf) query.as_of = asOf;
      const res = await api.GET("/treasury", { params: { query } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as TreasuryPosition[];
    },
  });

  const items = data ?? [];
  const totalBook = sumDecimal(items.map((r) => r.balance_book));
  const totalVariance = sumDecimal(items.map((r) => r.variance));

  const columns: Column<TreasuryPosition>[] = [
    { key: "title", header: "صندوق / حساب", render: (r) => r.title ?? "—" },
    { key: "as_of", header: "تاریخ", render: (r) => toPersianDate(r.as_of) },
    { key: "book", header: "ماندهٔ دفتری", align: "end", render: (r) => formatMoney(r.balance_book) },
    {
      key: "actual",
      header: "ماندهٔ واقعی",
      align: "end",
      render: (r) => (r.balance_actual != null ? formatMoney(r.balance_actual) : "—"),
    },
    {
      key: "variance",
      header: "مغایرت",
      align: "end",
      render: (r) => {
        const v = Number(r.variance ?? 0);
        const cls = v > 0 ? "text-danger-ink font-medium" : v < 0 ? "text-warning-ink" : "text-ink-subtle";
        return <span className={cls}>{r.variance != null ? formatMoney(r.variance) : "—"}</span>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-ink-muted text-sm">
          ماندهٔ صندوق و بانک‌ها به‌همراه مغایرت‌گیری
        </p>
        <div className="flex items-center gap-2">
          <div className="w-44">
            <JalaliDatePicker value={asOf} onChange={setAsOf} placeholder="مانده تا تاریخ..." />
          </div>
          <ExportButtons data={items} tableId="treasury-table" filename="treasury" />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm">
          <div className="text-sm text-ink-muted">جمع ماندهٔ دفتری</div>
          <div className="text-2xl font-bold text-ink mt-1">{formatMoney(totalBook)}</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm">
          <div className="text-sm text-ink-muted">جمع مغایرت باز</div>
          <div className={`text-2xl font-bold mt-1 ${totalVariance !== 0 ? "text-danger-ink" : "text-ink"}`}>
            {formatMoney(totalVariance)}
          </div>
        </div>
      </div>

      <div id="treasury-table">
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(r) => r.bank_account_id ?? r.title ?? Math.random().toString()}
          loading={isLoading}
          error={error ? (error as Error).message : null}
          emptyMessage="موقعیت خزانه‌ای برای نمایش نیست"
        />
      </div>
    </div>
  );
}

// ---------------- Daily closes ----------------

function ClosesPanel() {
  const toast = useToast();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canApprove = hasPermission("treasury.close.approve");

  const [status, setStatus] = useState<CloseStatus | "">("");
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["treasury-closes", status, from, to],
    queryFn: async () => {
      const query: { status?: CloseStatus; from?: string; to?: string } = {};
      if (status) query.status = status;
      if (from) query.from = from;
      if (to) query.to = to;
      const res = await api.GET("/treasury/closes", { params: { query } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as TreasuryClose[];
    },
  });

  const items = data ?? [];

  const approve = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.POST("/treasury/closes/{id}/approve", { params: { path: { id } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data;
    },
    onSuccess: () => {
      toast.success("بستن روزانه تأیید شد");
      void qc.invalidateQueries({ queryKey: ["treasury-closes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns: Column<TreasuryClose>[] = [
    { key: "date", header: "تاریخ", render: (c) => <span className="text-xs">{toPersianDate(c.close_date)}</span> },
    {
      key: "branch",
      header: "شعبه",
      render: (c) => (
        <span className="font-mono text-[10px] text-ink-subtle" title={c.branch_id ?? ""}>
          {c.branch_id ? `${c.branch_id.slice(0, 8)}…` : "—"}
        </span>
      ),
    },
    { key: "expected", header: "نقد مورد انتظار", align: "end", render: (c) => formatMoney(c.cash_expected) },
    { key: "counted", header: "نقد شمارش‌شده", align: "end", render: (c) => formatMoney(c.cash_counted) },
    {
      key: "variance",
      header: "مغایرت صندوق",
      align: "end",
      render: (c) => {
        const v = Number(c.cash_variance ?? 0);
        const cls = v < 0 ? "text-danger-ink font-medium" : v > 0 ? "text-brand-soft-ink" : "text-ink-subtle";
        return <span className={cls}>{formatMoney(c.cash_variance)}</span>;
      },
    },
    { key: "bank", header: "ماندهٔ بانک", align: "end", render: (c) => formatMoney(c.bank_balance) },
    {
      key: "status",
      header: "وضعیت",
      render: (c) => <Badge tone={CLOSE_STATUS_TONE[c.status ?? ""]}>{CLOSE_STATUS_FA[c.status ?? ""] ?? (c.status ?? "—")}</Badge>,
    },
    {
      key: "actions",
      header: "",
      align: "end",
      render: (c) =>
        canApprove && c.status === "closed" && c.id ? (
          <button
            onClick={() => approve.mutate(c.id as string)}
            disabled={approve.isPending}
            className="px-2.5 py-1 rounded-lg border border-brand-line text-xs text-brand-soft-ink hover:bg-brand-soft disabled:opacity-50 focus-ring"
          >
            تأیید
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs text-ink-muted mb-1">وضعیت</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as CloseStatus | "")} className={selectCls}>
              <option value="">همه</option>
              <option value="draft">پیش‌نویس</option>
              <option value="closed">بسته‌شده</option>
              <option value="approved">تأییدشده</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1">از تاریخ</label>
            <div className="w-44">
              <JalaliDatePicker value={from} onChange={setFrom} placeholder="از تاریخ..." />
            </div>
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1">تا تاریخ</label>
            <div className="w-44">
              <JalaliDatePicker value={to} onChange={setTo} placeholder="تا تاریخ..." />
            </div>
          </div>
        </div>
        <ExportButtons data={items} tableId="treasury-closes-table" filename="treasury-closes" />
      </div>

      <div id="treasury-closes-table">
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(c) => c.id ?? `${c.branch_id}-${c.close_date}`}
          loading={isLoading}
          error={error ? (error as Error).message : null}
          emptyMessage="بستن روزانه‌ای برای نمایش نیست"
          dense
        />
      </div>
    </div>
  );
}

export default function TreasuryInner() {
  const [tab, setTab] = useState<TabId>("positions");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">خزانه‌داری</h1>
        <p className="text-ink-muted text-sm">
          ماندهٔ صندوق و بانک‌ها، مغایرت‌گیری و بستن روزانهٔ خزانه
        </p>
      </div>

      <TabBar tab={tab} onChange={setTab} />

      {tab === "positions" && <PositionsPanel />}
      {tab === "closes" && <ClosesPanel />}
    </div>
  );
}
