"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EntityAttachmentLauncher } from "@/components/EntityAttachments";
import { WarehouseGuard } from "@/components/auth/guards";
import { useToast } from "@/components/ui/Toast";
import { formatNumber } from "@/lib/format";

/**
 * انبارگردانی — GET /stocktakes?status (تایپ‌شده از قرارداد).
 * چرخهٔ سند: draft → counting → review → approved → posted.
 * دکمهٔ «پایان شمارش» POST /stocktakes/{id}/submit را صدا می‌زند (اعمال مغایرت‌ها).
 * دکمهٔ «انبارگردانی جدید» به /stock-count/new (POST /stocktakes) می‌برد.
 */
type StockTake = components["schemas"]["StockTake"];
type Warehouse = { id: string; code: string; name: string };

const STATUS_FA: Record<string, string> = {
  draft: "پیش‌نویس",
  counting: "شمارش",
  review: "بازبینی",
  approved: "تأیید شده",
  posted: "ثبت شده",
  voided: "باطل‌شده",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-surface-alt text-ink-muted",
  counting: "bg-warning-soft text-warning-ink",
  review: "bg-info-soft text-info-ink",
  approved: "bg-info-soft text-info-ink",
  posted: "bg-brand-soft text-brand-soft-ink",
  voided: "bg-danger-soft text-danger-ink",
};

function StockCountInner() {
  const toast = useToast();
  const [status, setStatus] = useState("");
  const [version, setVersion] = useState(0);
  const [submitting, setSubmitting] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["stocktakes", status, version],
    queryFn: async () => {
      const query: { status?: string; limit?: number } = { limit: 200 };
      if (status) query.status = status;
      const res = await api.GET("/stocktakes", { params: { query } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as StockTake[];
    },
  });

  const warehouses = useQuery({
    queryKey: ["warehouses-lookup"],
    queryFn: async () => {
      const res = await api.GET("/warehouses", { params: { query: { limit: 200 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Warehouse[];
    },
  });

  const whName = (id?: string) =>
    (warehouses.data ?? []).find((w) => w.id === id)?.name ?? (id ? id.slice(0, 8) : "—");

  const items = data ?? [];

  const submit = async (s: StockTake) => {
    if (!s.id) return;
    setSubmitting(s.id);
    const res = await api.POST("/stocktakes/{id}/submit", { params: { path: { id: s.id } } });
    setSubmitting(null);
    if (res.error) {
      toast.error(errorMessage(res.error));
      return;
    }
    toast.success("مغایرت‌ها اعمال و سند ثبت شد");
    setVersion((v) => v + 1);
  };

  // فقط اسناد در حال شمارش/بازبینی قابل پایان دادن‌اند
  const canSubmit = (s: StockTake) => s.status === "counting" || s.status === "review" || s.status === "draft";

  const columns: Column<StockTake>[] = [
    { key: "id", header: "شناسهٔ سند", render: (s) => <span className="font-mono text-xs">{s.id?.slice(0, 8) ?? "—"}</span> },
    { key: "warehouse", header: "انبار", render: (s) => whName(s.warehouse_id) },
    {
      key: "lines",
      header: "اقلام",
      align: "end",
      render: (s) => <span className="text-xs">{formatNumber((s.lines ?? []).length)} قلم</span>,
    },
    {
      key: "status",
      header: "وضعیت",
      render: (s) => (
        <span className={`px-2 py-0.5 rounded-md text-xs ${STATUS_COLOR[s.status ?? ""] ?? ""}`}>
          {STATUS_FA[s.status ?? ""] ?? s.status}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "end",
      render: (s) => (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {/* TASK-PM-02-C3: برگههای شمارش و شواهد تصویری همین سند */}
          {s.id && (
            <EntityAttachmentLauncher
              ownerType="stock_count"
              ownerId={s.id}
              label={`سند انبارگردانی ${s.id.slice(0, 8)}`}
            />
          )}
          {canSubmit(s) && (
            <button
              onClick={() => submit(s)}
              disabled={submitting === s.id}
              className="px-2.5 py-1 rounded-lg bg-brand hover:bg-brand-hover disabled:opacity-50 text-brand-ink text-xs focus-ring"
            >
              {submitting === s.id ? "..." : "پایان شمارش"}
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">انبارگردانی</h1>
          <p className="text-ink-muted text-sm">شمارش واقعی در برابر موجودی سیستم و اعمال مغایرت</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full h-10 px-3 text-sm rounded-lg border border-line bg-surface text-ink transition-[border-color,box-shadow,background-color] duration-150 placeholder:text-ink-subtle hover:border-line-strong focus-ring disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer pe-8"
          >
            <option value="">همهٔ وضعیت‌ها</option>
            {Object.entries(STATUS_FA).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <Link href="/stock-count/new" className="px-3 py-2 rounded-xl bg-brand hover:bg-brand-hover text-brand-ink text-sm font-medium">
            انبارگردانی جدید
          </Link>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(s) => s.id ?? Math.random().toString()}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        emptyMessage="سند انبارگردانی یافت نشد"
      />
    </div>
  );
}

export default function StockCountPage() {
  return (
    <WarehouseGuard>
      <StockCountInner />
    </WarehouseGuard>
  );
}
