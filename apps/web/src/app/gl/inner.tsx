"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { JalaliDatePicker } from "@/components/ui/JalaliDatePicker";
import { ExportButtons } from "@/components/reports/ExportButtons";
import { useToast } from "@/components/ui/Toast";
import { formatMoney, sumDecimal } from "@/lib/format";
import { toPersianDate, toPersianDateTime, todayJalali, JALALI_MONTHS } from "@/lib/date";

/**
 * دفتر کل (ماژول ۹) — چهار نما روی اندپوینت‌های واقعی /gl:
 *   تراز آزمایشی (GET /gl/trial-balance از v_trial_balance)،
 *   اسناد (GET /gl/journals + جزئیات GET /gl/journals/{id} با سطرها)،
 *   کدینگ حساب‌ها (GET /gl/accounts)،
 *   دوره‌های مالی (GET /gl/periods) با ساخت (POST /gl/periods) و بستن
 *   (POST /gl/periods/{id}/close) دوره.
 *
 * ثبت سند دستی عمداً در وب نیست: journal_entry به branch_id نیاز دارد و هیچ
 * اندپوینت فهرست شعبه در قرارداد وجود ندارد؛ اسناد یا خودکار (نگاشت رویداد)
 * ساخته می‌شوند یا از اپ مالی. این صفحه مرور/گزارش و مدیریت دوره را پوشش می‌دهد.
 * نوع‌های union مستقیماً از اسکیمای قرارداد گرفته می‌شوند تا همگام بمانند.
 */
type GlAccount = components["schemas"]["GlAccount"];
type FiscalPeriod = components["schemas"]["FiscalPeriod"];
type JournalEntry = components["schemas"]["JournalEntry"];
type TrialBalanceRow = components["schemas"]["TrialBalanceRow"];

type JournalStatus = NonNullable<JournalEntry["status"]>;
type JournalSourceType = NonNullable<JournalEntry["source_type"]>;
type AccountNature = NonNullable<GlAccount["nature"]>;
type AccountType = NonNullable<GlAccount["account_type"]>;
type PeriodStatus = NonNullable<FiscalPeriod["status"]>;

const TABS = [
  { id: "trial-balance", label: "تراز آزمایشی" },
  { id: "journals", label: "اسناد حسابداری" },
  { id: "accounts", label: "کدینگ حساب‌ها" },
  { id: "periods", label: "دوره‌های مالی" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const JOURNAL_STATUS_FA: Record<string, string> = {
  draft: "پیش‌نویس",
  posted: "صادرشده",
  voided: "باطل‌شده",
};
const JOURNAL_STATUS_COLOR: Record<string, string> = {
  draft: "bg-surface-alt text-ink-muted",
  posted: "bg-brand-soft text-brand-soft-ink",
  voided: "bg-danger-soft text-danger-ink",
};
const SOURCE_TYPE_FA: Record<string, string> = {
  invoice: "فاکتور فروش",
  credit_note: "اعتبارنامه",
  receipt: "رسید وصول",
  payment_voucher: "سند پرداخت",
  goods_receipt: "رسید انبار",
  supplier_invoice: "فاکتور خرید",
  value_document: "سند ارزش‌گذاری",
  cash_txn: "تراکنش نقدی",
  cheque: "چک",
  payroll: "حقوق و دستمزد",
  manual: "سند دستی",
  opening: "افتتاحیه",
  closing: "اختتامیه",
  recurring: "ادواری",
};
const PERIOD_STATUS_FA: Record<string, string> = { open: "باز", closed: "بسته", locked: "قفل‌شده" };
const PERIOD_STATUS_COLOR: Record<string, string> = {
  open: "bg-brand-soft text-brand-soft-ink",
  closed: "bg-surface-alt text-ink-muted",
  locked: "bg-warning-soft text-warning-ink",
};
const NATURE_FA: Record<string, string> = { debit: "بدهکار", credit: "بستانکار" };
const ACCOUNT_TYPE_FA: Record<string, string> = {
  asset: "دارایی",
  liability: "بدهی",
  equity: "سرمایه",
  revenue: "درآمد",
  expense: "هزینه",
  contra: "کاهنده",
};
const CONTROL_TYPE_FA: Record<string, string> = {
  ar: "دریافتنی",
  ap: "پرداختنی",
  inventory: "موجودی",
  cash: "صندوق",
  bank: "بانک",
  tax: "مالیات",
  cheque_in_hand: "چک نزد صندوق",
  cogs: "بهای تمام‌شده",
  none: "—",
};

const CURRENT_JY = todayJalali().jy;
const YEAR_OPTIONS = [CURRENT_JY - 1, CURRENT_JY, CURRENT_JY + 1];
const PERIOD_OPTIONS = Array.from({ length: 12 }, (_, i) => i + 1);

const selectCls =
  "px-3 py-2 rounded-xl border border-line-strong bg-surface text-sm text-ink";
const inputCls =
  "w-full px-3 py-2 rounded-xl border border-line-strong bg-surface text-sm text-ink";

function Badge({ text, color }: { text: string; color?: string }) {
  return (
    <span className={`px-2 py-0.5 rounded-md text-xs ${color ?? "bg-surface-alt text-ink-muted"}`}>
      {text}
    </span>
  );
}

function TabBar({ tab, onChange }: { tab: TabId; onChange: (t: TabId) => void }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-line">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-4 py-2.5 text-sm rounded-t-xl border-b-2 -mb-px transition-colors ${ tab === t.id ? "border-brand text-brand-soft-ink font-semibold" : "border-transparent text-ink-muted hover:text-ink" }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ---------------- Trial balance ----------------

function TrialBalancePanel() {
  const [fiscalYear, setFiscalYear] = useState<string>(String(CURRENT_JY));
  const [periodNo, setPeriodNo] = useState<string>("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["gl-trial-balance", fiscalYear, periodNo],
    queryFn: async () => {
      const query: { fiscal_year?: number; period_no?: number } = {};
      if (fiscalYear) query.fiscal_year = Number(fiscalYear);
      if (periodNo) query.period_no = Number(periodNo);
      const res = await api.GET("/gl/trial-balance", { params: { query } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as TrialBalanceRow[];
    },
  });

  const items = data ?? [];
  const totalDebit = sumDecimal(items.map((r) => r.debit_total));
  const totalCredit = sumDecimal(items.map((r) => r.credit_total));
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005;

  const columns: Column<TrialBalanceRow>[] = [
    { key: "code", header: "کد حساب", render: (r) => <span className="font-mono text-xs">{r.account_code ?? "—"}</span> },
    { key: "title", header: "شرح حساب", render: (r) => r.title ?? "—" },
    {
      key: "nature",
      header: "ماهیت",
      render: (r) => <Badge text={NATURE_FA[r.nature ?? ""] ?? (r.nature ?? "—")} />,
    },
    { key: "debit", header: "جمع بدهکار", align: "end", render: (r) => formatMoney(r.debit_total) },
    { key: "credit", header: "جمع بستانکار", align: "end", render: (r) => formatMoney(r.credit_total) },
    {
      key: "balance",
      header: "مانده",
      align: "end",
      render: (r) => (
        <span className={`font-medium ${Number(r.balance) < 0 ? "text-danger-ink" : ""}`}>{formatMoney(r.balance)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-ink-muted mb-1">سال مالی</label>
            <select value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} className={selectCls}>
              <option value="">همه</option>
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1">دوره</label>
            <select value={periodNo} onChange={(e) => setPeriodNo(e.target.value)} className={selectCls}>
              <option value="">کل سال</option>
              {PERIOD_OPTIONS.map((p) => (
                <option key={p} value={p}>{JALALI_MONTHS[p - 1]}</option>
              ))}
            </select>
          </div>
        </div>
        <ExportButtons data={items} tableId="gl-tb-table" filename="gl-trial-balance" />
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm">
          <div className="text-sm text-ink-muted">جمع بدهکار</div>
          <div className="text-xl font-bold text-ink mt-1">{formatMoney(totalDebit)}</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm">
          <div className="text-sm text-ink-muted">جمع بستانکار</div>
          <div className="text-xl font-bold text-ink mt-1">{formatMoney(totalCredit)}</div>
        </div>
        <div className="bg-surface border border-line rounded-2xl p-4 shadow-sm">
          <div className="text-sm text-ink-muted">وضعیت تراز</div>
          <div className={`text-xl font-bold mt-1 ${balanced ? "text-brand-soft-ink" : "text-danger-ink"}`}>
            {balanced ? "متوازن ✓" : "ناتراز"}
          </div>
        </div>
      </div>

      <div id="gl-tb-table">
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(r) => `${r.fiscal_year}-${r.period_no}-${r.account_code}`}
          loading={isLoading}
          error={error ? (error as Error).message : null}
          emptyMessage="ردیفی برای نمایش نیست"
          dense
        />
      </div>
    </div>
  );
}

// ---------------- Journals ----------------

function JournalsPanel() {
  const [status, setStatus] = useState<JournalStatus | "">("");
  const [sourceType, setSourceType] = useState<JournalSourceType | "">("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["gl-journals", status, sourceType],
    queryFn: async () => {
      const query: { status?: JournalStatus; source_type?: JournalSourceType; limit?: number } = { limit: 100 };
      if (status) query.status = status;
      if (sourceType) query.source_type = sourceType;
      const res = await api.GET("/gl/journals", { params: { query } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as JournalEntry[];
    },
  });

  const detail = useQuery({
    queryKey: ["gl-journal", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const res = await api.GET("/gl/journals/{id}", { params: { path: { id: selectedId as string } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data as JournalEntry;
    },
  });

  const items = data ?? [];
  const entry = detail.data;

  const columns: Column<JournalEntry>[] = [
    { key: "doc", header: "شماره سند", render: (j) => <span className="font-mono text-xs text-brand-soft-ink">{j.doc_number ?? "—"}</span> },
    { key: "date", header: "تاریخ", render: (j) => <span className="text-xs">{toPersianDate(j.entry_date)}</span> },
    { key: "desc", header: "شرح", render: (j) => <span className="text-xs">{j.description ?? "—"}</span> },
    { key: "source", header: "منبع", render: (j) => <span className="text-xs">{SOURCE_TYPE_FA[j.source_type ?? ""] ?? (j.source_type ?? "—")}</span> },
    { key: "total", header: "مبلغ", align: "end", render: (j) => <span className="font-medium">{formatMoney(j.total_debit)}</span> },
    {
      key: "status",
      header: "وضعیت",
      render: (j) => <Badge text={JOURNAL_STATUS_FA[j.status ?? ""] ?? (j.status ?? "—")} color={JOURNAL_STATUS_COLOR[j.status ?? ""]} />,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-ink-muted mb-1">وضعیت</label>
          <select value={status} onChange={(e) => setStatus(e.target.value as JournalStatus | "")} className={selectCls}>
            <option value="">همه</option>
            {(Object.keys(JOURNAL_STATUS_FA) as JournalStatus[]).map((s) => (
              <option key={s} value={s}>{JOURNAL_STATUS_FA[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-ink-muted mb-1">منبع سند</label>
          <select value={sourceType} onChange={(e) => setSourceType(e.target.value as JournalSourceType | "")} className={selectCls}>
            <option value="">همه</option>
            {(Object.keys(SOURCE_TYPE_FA) as JournalSourceType[]).map((s) => (
              <option key={s} value={s}>{SOURCE_TYPE_FA[s]}</option>
            ))}
          </select>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(j) => j.id ?? j.doc_number ?? Math.random().toString()}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        emptyMessage="سندی ثبت نشده است"
        onRowClick={(j) => j.id && setSelectedId(j.id)}
        dense
      />

      <Modal open={!!selectedId} onClose={() => setSelectedId(null)} title="جزئیات سند حسابداری" wide>
        {detail.isLoading && <div className="text-sm text-ink-muted py-6 text-center">در حال بارگذاری...</div>}
        {detail.error && <div className="text-sm text-danger-ink py-6 text-center">{(detail.error as Error).message}</div>}
        {entry && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div><span className="text-ink-muted">شماره سند:</span> <span className="font-mono">{entry.doc_number ?? "—"}</span></div>
              <div><span className="text-ink-muted">تاریخ:</span> {toPersianDate(entry.entry_date)}</div>
              <div><span className="text-ink-muted">منبع:</span> {SOURCE_TYPE_FA[entry.source_type ?? ""] ?? (entry.source_type ?? "—")}</div>
              <div><span className="text-ink-muted">وضعیت:</span> <Badge text={JOURNAL_STATUS_FA[entry.status ?? ""] ?? (entry.status ?? "—")} color={JOURNAL_STATUS_COLOR[entry.status ?? ""]} /></div>
              <div><span className="text-ink-muted">صادرشده در:</span> {toPersianDateTime(entry.posted_at)}</div>
              <div className="sm:col-span-2"><span className="text-ink-muted">شرح:</span> {entry.description ?? "—"}</div>
            </div>
            <div className="overflow-x-auto border border-line rounded-xl">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt text-ink-muted">
                  <tr>
                    <th className="p-2 text-start font-semibold">کد</th>
                    <th className="p-2 text-start font-semibold">حساب</th>
                    <th className="p-2 text-start font-semibold">شرح</th>
                    <th className="p-2 text-end font-semibold">بدهکار</th>
                    <th className="p-2 text-end font-semibold">بستانکار</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {(entry.lines ?? []).map((l) => (
                    <tr key={l.id ?? l.line_no}>
                      <td className="p-2 font-mono text-xs">{l.account_code ?? "—"}</td>
                      <td className="p-2">{l.account_title ?? "—"}</td>
                      <td className="p-2 text-xs text-ink-muted">{l.description ?? "—"}</td>
                      <td className="p-2 text-end">{Number(l.debit) > 0 ? formatMoney(l.debit) : "—"}</td>
                      <td className="p-2 text-end">{Number(l.credit) > 0 ? formatMoney(l.credit) : "—"}</td>
                    </tr>
                  ))}
                  <tr className="bg-surface-alt font-semibold">
                    <td className="p-2" colSpan={3}>جمع</td>
                    <td className="p-2 text-end">{formatMoney(entry.total_debit)}</td>
                    <td className="p-2 text-end">{formatMoney(entry.total_credit)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ---------------- Accounts ----------------

function AccountsPanel() {
  const [nature, setNature] = useState<AccountNature | "">("");
  const [accountType, setAccountType] = useState<AccountType | "">("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["gl-accounts", nature, accountType],
    queryFn: async () => {
      const query: { nature?: AccountNature; account_type?: AccountType; limit?: number } = { limit: 500 };
      if (nature) query.nature = nature;
      if (accountType) query.account_type = accountType;
      const res = await api.GET("/gl/accounts", { params: { query } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as GlAccount[];
    },
  });

  const items = data ?? [];

  const columns: Column<GlAccount>[] = [
    { key: "code", header: "کد", render: (a) => <span className="font-mono text-xs">{a.code ?? "—"}</span> },
    {
      key: "title",
      header: "عنوان حساب",
      render: (a) => (
        <span style={{ paddingInlineStart: `${((a.level ?? 1) - 1) * 14}px` }} className="inline-block">
          {a.title ?? "—"}
        </span>
      ),
    },
    { key: "level", header: "سطح", align: "center", render: (a) => <span className="text-xs">{a.level ?? "—"}</span> },
    { key: "nature", header: "ماهیت", render: (a) => <Badge text={NATURE_FA[a.nature ?? ""] ?? (a.nature ?? "—")} /> },
    { key: "type", header: "نوع", render: (a) => <span className="text-xs">{ACCOUNT_TYPE_FA[a.account_type ?? ""] ?? (a.account_type ?? "—")}</span> },
    { key: "control", header: "نقش کنترلی", render: (a) => <span className="text-xs">{CONTROL_TYPE_FA[a.control_type ?? "none"] ?? "—"}</span> },
    {
      key: "postable",
      header: "ثبت‌پذیر",
      align: "center",
      render: (a) => (a.is_postable ? <span className="text-brand-soft-ink text-xs">بله</span> : <span className="text-ink-subtle text-xs">خیر</span>),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-ink-muted mb-1">ماهیت</label>
            <select value={nature} onChange={(e) => setNature(e.target.value as AccountNature | "")} className={selectCls}>
              <option value="">همه</option>
              <option value="debit">بدهکار</option>
              <option value="credit">بستانکار</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-ink-muted mb-1">نوع حساب</label>
            <select value={accountType} onChange={(e) => setAccountType(e.target.value as AccountType | "")} className={selectCls}>
              <option value="">همه</option>
              {(Object.keys(ACCOUNT_TYPE_FA) as AccountType[]).map((t) => (
                <option key={t} value={t}>{ACCOUNT_TYPE_FA[t]}</option>
              ))}
            </select>
          </div>
        </div>
        <ExportButtons data={items} tableId="gl-accounts-table" filename="gl-accounts" />
      </div>

      <div id="gl-accounts-table">
        <DataTable
          columns={columns}
          rows={items}
          rowKey={(a) => a.id ?? a.code ?? Math.random().toString()}
          loading={isLoading}
          error={error ? (error as Error).message : null}
          emptyMessage="حسابی تعریف نشده است"
          dense
        />
      </div>
    </div>
  );
}

// ---------------- Periods ----------------

function PeriodsPanel() {
  const toast = useToast();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission("gl.period.close");

  const [fiscalYear, setFiscalYear] = useState<string>(String(CURRENT_JY));
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ fiscal_year: String(CURRENT_JY), period_no: "1", start_date: "", end_date: "" });
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["gl-periods", fiscalYear],
    queryFn: async () => {
      const query: { fiscal_year?: number } = {};
      if (fiscalYear) query.fiscal_year = Number(fiscalYear);
      const res = await api.GET("/gl/periods", { params: { query } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as FiscalPeriod[];
    },
  });

  const items = data ?? [];

  const create = useMutation({
    mutationFn: async () => {
      if (!form.start_date || !form.end_date) throw new Error("تاریخ شروع و پایان دوره را انتخاب کنید.");
      const res = await api.POST("/gl/periods", {
        body: {
          fiscal_year: Number(form.fiscal_year),
          period_no: Number(form.period_no),
          start_date: form.start_date,
          end_date: form.end_date,
        },
      });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data;
    },
    onSuccess: () => {
      toast.success("دورهٔ مالی ساخته شد");
      setShowCreate(false);
      setFormError(null);
      void qc.invalidateQueries({ queryKey: ["gl-periods"] });
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const close = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.POST("/gl/periods/{id}/close", { params: { path: { id } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return res.data;
    },
    onSuccess: () => {
      toast.success("دوره بسته شد");
      void qc.invalidateQueries({ queryKey: ["gl-periods"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const columns: Column<FiscalPeriod>[] = [
    { key: "year", header: "سال مالی", render: (p) => <span className="font-mono text-xs">{p.fiscal_year ?? "—"}</span> },
    { key: "no", header: "دوره", align: "center", render: (p) => <span className="text-xs">{JALALI_MONTHS[(p.period_no ?? 1) - 1] ?? p.period_no}</span> },
    { key: "start", header: "از تاریخ", render: (p) => <span className="text-xs">{toPersianDate(p.start_date)}</span> },
    { key: "end", header: "تا تاریخ", render: (p) => <span className="text-xs">{toPersianDate(p.end_date)}</span> },
    { key: "status", header: "وضعیت", render: (p) => <Badge text={PERIOD_STATUS_FA[p.status ?? ""] ?? (p.status ?? "—")} color={PERIOD_STATUS_COLOR[p.status ?? ""]} /> },
    { key: "closed", header: "بسته‌شده در", render: (p) => <span className="text-xs">{p.closed_at ? toPersianDateTime(p.closed_at) : "—"}</span> },
    {
      key: "actions",
      header: "",
      align: "end",
      render: (p) =>
        canManage && p.status === "open" && p.id ? (
          <button
            onClick={() => close.mutate(p.id as string)}
            disabled={close.isPending}
            className="px-2.5 py-1 rounded-lg border border-warning-line text-xs text-warning-ink hover:bg-warning-soft disabled:opacity-50"
          >
            بستن دوره
          </button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label className="block text-xs text-ink-muted mb-1">سال مالی</label>
          <select value={fiscalYear} onChange={(e) => setFiscalYear(e.target.value)} className={selectCls}>
            <option value="">همه</option>
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        {canManage && (
          <button
            onClick={() => { setShowCreate((v) => !v); setFormError(null); }}
            className="px-4 py-2 rounded-xl bg-brand text-white hover:bg-brand-hover text-sm"
          >
            {showCreate ? "بستن فرم" : "دورهٔ جدید"}
          </button>
        )}
      </div>

      {showCreate && canManage && (
        <div className="bg-surface border border-line rounded-2xl p-5 space-y-4">
          <div className="font-semibold text-ink">ساخت دورهٔ مالی</div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs text-ink-muted mb-1">سال مالی *</label>
              <select value={form.fiscal_year} onChange={(e) => setForm({ ...form, fiscal_year: e.target.value })} className={inputCls}>
                {YEAR_OPTIONS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-muted mb-1">دوره *</label>
              <select value={form.period_no} onChange={(e) => setForm({ ...form, period_no: e.target.value })} className={inputCls}>
                {PERIOD_OPTIONS.map((p) => (
                  <option key={p} value={p}>{JALALI_MONTHS[p - 1]} ({p})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-ink-muted mb-1">از تاریخ *</label>
              <JalaliDatePicker value={form.start_date || null} onChange={(iso) => setForm({ ...form, start_date: iso ?? "" })} placeholder="شروع دوره" />
            </div>
            <div>
              <label className="block text-xs text-ink-muted mb-1">تا تاریخ *</label>
              <JalaliDatePicker value={form.end_date || null} onChange={(iso) => setForm({ ...form, end_date: iso ?? "" })} placeholder="پایان دوره" />
            </div>
          </div>
          {formError && <div className="text-sm text-danger-ink bg-danger-soft border border-danger-line rounded-lg px-3 py-2">{formError}</div>}
          <div className="flex gap-2">
            <button onClick={() => create.mutate()} disabled={create.isPending} className="px-4 py-2 rounded-xl bg-brand text-white hover:bg-brand-hover disabled:opacity-50 text-sm">
              {create.isPending ? "در حال ساخت..." : "ذخیره"}
            </button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-xl border border-line hover:bg-surface-hover text-sm">
              انصراف
            </button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(p) => p.id ?? `${p.fiscal_year}-${p.period_no}`}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        emptyMessage="دوره‌ای تعریف نشده است"
        dense
      />
    </div>
  );
}

export default function GLInner() {
  const [tab, setTab] = useState<TabId>("trial-balance");
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">دفتر کل</h1>
        <p className="text-ink-muted text-sm">
          کدینگ حساب‌ها، اسناد حسابداری، دوره‌های مالی و تراز آزمایشی
        </p>
      </div>

      <TabBar tab={tab} onChange={setTab} />

      {tab === "trial-balance" && <TrialBalancePanel />}
      {tab === "journals" && <JournalsPanel />}
      {tab === "accounts" && <AccountsPanel />}
      {tab === "periods" && <PeriodsPanel />}
    </div>
  );
}
