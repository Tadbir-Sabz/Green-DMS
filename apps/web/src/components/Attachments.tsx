"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { components } from "@dms/api-client";
import { api, errorMessage, uploadAttachment } from "@/lib/api";
import { Button, Card, CardBody, SectionTitle, Spinner, EmptyState, ErrorState, useToast } from "@/components/ui";
import { toPersianDate } from "@/lib/date";

/**
 * اجزای بارگذاری/نمایش ضمیمه برای یک موجودیت (owner).
 * - فهرست: GET /attachments?owner_type=&owner_id= (هر مورد با URL امضاشدهٔ کوتاه‌عمر)
 * - بارگذاری: POST /attachments (multipart) از طریق uploadAttachment
 * - دانلود: GET /attachments/{id}/url سپس بازکردنِ لینک در تبِ تازه
 *
 * روی جزئیات سفارش (اسناد/POD) سوار می‌شود و برای هر موجودیتِ دیگر هم قابل استفاده است.
 * نوع/حجم پیش از ارسال سمت کلاینت هم بررسی می‌شود (تجربهٔ کاربری بهتر؛ سرور هم
 * سخت‌گیرانه بررسی می‌کند).
 */

type Attachment = components["schemas"]["Attachment"];
type OwnerType = Attachment["owner_type"];

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function formatBytes(n: number): string {
  if (n < 1024) return `${n} بایت`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} کیلوبایت`;
  return `${(n / (1024 * 1024)).toFixed(1)} مگابایت`;
}

export function Attachments({
  ownerType,
  ownerId,
  title = "ضمیمه‌ها",
  canUpload = true,
}: {
  ownerType: OwnerType;
  ownerId: string;
  title?: string;
  canUpload?: boolean;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const list = useQuery({
    queryKey: ["attachments", ownerType, ownerId],
    enabled: Boolean(ownerId),
    queryFn: async () => {
      const res = await api.GET("/attachments", {
        params: { query: { owner_type: ownerType, owner_id: ownerId } },
      });
      if (res.error) throw new Error(errorMessage(res.error));
      return (res.data?.items ?? []) as Attachment[];
    },
  });

  const upload = useMutation({
    mutationFn: (file: File) => uploadAttachment(file, ownerType, ownerId),
    onSuccess: () => {
      toast.success("ضمیمه با موفقیت بارگذاری شد");
      qc.invalidateQueries({ queryKey: ["attachments", ownerType, ownerId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const pickFile = (file: File | undefined | null) => {
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      toast.error(`نوع فایل «${file.type || "نامشخص"}» مجاز نیست (تصویر یا PDF).`);
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("حجم فایل بیش از ۸ مگابایت است.");
      return;
    }
    upload.mutate(file);
  };

  const openAttachment = async (id: string) => {
    const res = await api.GET("/attachments/{id}/url", { params: { path: { id } } });
    if (res.error || !res.data) {
      toast.error(errorMessage(res.error));
      return;
    }
    window.open(res.data.url, "_blank", "noopener,noreferrer");
  };

  const busy = upload.isPending;

  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between gap-3 mb-3">
          <SectionTitle>{title}</SectionTitle>
          {canUpload && (
            <>
              <input
                ref={inputRef}
                type="file"
                accept={ALLOWED.join(",")}
                className="hidden"
                onChange={(e) => {
                  pickFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy || !ownerId}
                onClick={() => inputRef.current?.click()}
              >
                {busy ? "در حال بارگذاری…" : "بارگذاری فایل"}
              </Button>
            </>
          )}
        </div>

        {canUpload && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pickFile(e.dataTransfer.files?.[0]);
            }}
            className={`mb-3 rounded-xl border border-dashed px-4 py-5 text-center text-[13px] transition-colors ${
              dragOver ? "border-brand bg-brand-soft/40 text-ink" : "border-line text-ink-muted"
            }`}
          >
            فایل را اینجا رها کنید یا از دکمهٔ بالا انتخاب کنید
            <span className="block mt-1 text-[11px] text-ink-subtle">
              تصویر (JPEG/PNG/WebP) یا PDF · حداکثر ۸ مگابایت
            </span>
          </div>
        )}

        {list.isLoading && (
          <div className="py-6 flex justify-center">
            <Spinner label="در حال دریافت ضمیمه‌ها" />
          </div>
        )}
        {list.isError && (
          <ErrorState compact message={errorMessage(list.error)} onRetry={() => list.refetch()} />
        )}
        {list.isSuccess && (list.data?.length ?? 0) === 0 && (
          <EmptyState compact title="ضمیمه‌ای وجود ندارد" description="فایل مرتبط با این مورد هنوز بارگذاری نشده است." />
        )}
        {list.isSuccess && (list.data?.length ?? 0) > 0 && (
          <ul className="divide-y divide-line">
            {list.data!.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink" dir="ltr">
                    {a.file_name}
                  </p>
                  <p className="text-[11px] text-ink-subtle">
                    {formatBytes(a.size_bytes)} · {a.content_type} · {toPersianDate(a.created_at)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => openAttachment(a.id)}
                >
                  دریافت
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
