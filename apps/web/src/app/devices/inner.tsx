"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage } from "@/lib/api";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { useToast } from "@/components/ui/Toast";
import { toPersianDateTime } from "@/lib/date";

/**
 * دستگاه‌های مجاز کاربر جاری — GET /devices، ابطال با DELETE /devices/{id}.
 * پایهٔ «کنترل دستگاه» (ضمیمه H): هر دستگاه تا تأیید با کد پیامکی
 * (is_trusted=false) مجاز به‌شمار نمی‌رود.
 */
type Device = components["schemas"]["Device"];

const APP_FA: Record<string, string> = {
  sales: "فروش",
  delivery: "توزیع",
  telesales: "فروش تلفنی",
};

export default function DevicesInner() {
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [revoking, setRevoking] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["devices", version],
    queryFn: async () => {
      const res = await api.GET("/devices", { params: { query: { limit: 200 } } });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Device[];
    },
  });

  const items = data ?? [];

  const revoke = async (d: Device) => {
    if (!d.id) return;
    setRevoking(d.id);
    const res = await api.DELETE("/devices/{id}", { params: { path: { id: d.id } } });
    setRevoking(null);
    if (res.error) {
      toast.error(errorMessage(res.error));
      return;
    }
    toast.success("دستگاه باطل شد");
    setVersion((v) => v + 1);
  };

  const columns: Column<Device>[] = [
    {
      key: "app",
      header: "نوع اپ",
      render: (d) => APP_FA[d.app_kind] ?? d.app_kind,
    },
    {
      key: "uuid",
      header: "شناسهٔ دستگاه",
      render: (d) => <span className="font-mono text-xs" dir="ltr">{d.device_uuid.slice(0, 16)}…</span>,
    },
    {
      key: "version",
      header: "نسخهٔ اپ / OS",
      render: (d) => (
        <span className="text-xs" dir="ltr">
          {d.app_version ?? "—"} / {d.os_version ?? "—"}
        </span>
      ),
    },
    {
      key: "trusted",
      header: "وضعیت",
      render: (d) => {
        if (d.revoked_at) return <span className="text-danger-ink text-xs">باطل‌شده</span>;
        return d.is_trusted ? (
          <span className="text-brand-soft-ink text-xs">مجاز</span>
        ) : (
          <span className="text-warning-ink text-xs">در انتظار تأیید پیامکی</span>
        );
      },
    },
    {
      key: "last_seen",
      header: "آخرین اتصال",
      render: (d) => <span className="text-xs">{toPersianDateTime(d.last_seen_at)}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "end",
      render: (d) =>
        d.revoked_at ? null : (
          <button
            onClick={() => revoke(d)}
            disabled={revoking === d.id}
            className="px-2.5 py-1 rounded-lg border border-danger-line text-xs text-danger-ink hover:bg-danger-soft disabled:opacity-50 focus-ring"
          >
            {revoking === d.id ? "..." : "ابطال"}
          </button>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink">مدیریت دستگاه‌ها</h1>
        <p className="text-ink-muted text-sm">
          دستگاه‌های مجاز شما برای ورود اپ میدانی؛ ابطال از راه دور
        </p>
      </div>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(d) => d.id ?? d.device_uuid}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        emptyMessage="دستگاهی ثبت نشده است"
      />
    </div>
  );
}
