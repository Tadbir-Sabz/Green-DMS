"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import Link from "next/link";
import type { components } from "@dms/api-client";
import { api, errorMessage, uploadEntityAttachment } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toPersianDateTime } from "@/lib/date";
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  Modal,
  ProgressBar,
  SectionTitle,
  Spinner,
} from "@/components/ui";

/**
 * جزء **مشترک** ضمائم سازمانی (TASK-PM-02-C3) — تنها پیادهسازی UI ضمائم
 * عملیاتی. همان جزء در صفحهٔ جزئیات سفارش، فاکتورها، مرجوعیها، انبارگردانی و
 * اسناد حسابداری سوار میشود؛ هیچ صفحهای منطق آپلود/فهرست/دانلود را تکرار
 * نمیکند.
 *
 * - فهرست: GET /entity-attachments/{ownerType}/{ownerId}
 * - آپلود: POST همان مسیر (multipart؛ فقط file) با پیشرفت واقعی بایتها
 * - دانلود: GET …/{attachmentId}/url ⇒ URL امضاشدهٔ تازه، سپس بازکردن/نمایش
 *
 * مالک و شرکت فقط از مسیر و نشست سرور میآیند. کنترل حذف، بایگانی، انتخاب
 * تصویر اصلی و سیاست نگهداشت عمداً وجود ندارد (هیچ رفتار مصوبی پشتشان نیست).
 * حالتهای بارگذاری/خالی/خطا/تلاش مجدد، شمارشها، نوع/حجم/تاریخ و پیامهای
 * فارسی همگی واقعیاند؛ چپ/راست با کلاسهای منطقی (start/end) و `dir="auto"`
 * برای نام فایل، RTL-firstاند.
 */

export type EntityAttachmentOwnerType = components["schemas"]["EntityAttachmentOwnerType"];
export type EntityAttachmentView = components["schemas"]["EntityAttachmentView"];
export type EntityAttachmentItem = components["schemas"]["EntityAttachmentItem"];

export const ENTITY_ATTACHMENT_ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
export const ENTITY_ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;

/** برچسب قابلخواندن حجم، با ارقام فارسی و بدون وابستگی به `Intl` مرورگر. */
export function entityAttachmentSizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${Number(bytes).toLocaleString("fa-IR")} بایت`;
  if (bytes < 1024 * 1024) {
    return `${Number((bytes / 1024).toFixed(1)).toLocaleString("fa-IR")} کیلوبایت`;
  }
  return `${Number((bytes / (1024 * 1024)).toFixed(1)).toLocaleString("fa-IR")} مگابایت`;
}

/** اعتبارسنجی سمت مرورگر فقط برای بازخورد سریع؛ سرور مرجع قطعی است. */
export function entityAttachmentFileError(file: File): string | null {
  if (!(ENTITY_ATTACHMENT_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return "فقط تصویر JPEG/PNG/WebP یا سند PDF پذیرفته میشود.";
  }
  if (file.size === 0) return "فایل خالی است.";
  if (file.size > ENTITY_ATTACHMENT_MAX_BYTES) return "حجم فایل بیش از ۸ مگابایت است.";
  return null;
}

export function EntityAttachments({
  ownerType,
  ownerId,
  title,
  canUpload,
  showNavigation = true,
}: {
  ownerType: EntityAttachmentOwnerType;
  ownerId: string;
  title?: string;
  /** عدم ارسال ⇒ از مجوز `attachment.upload` نشست گرفته میشود */
  canUpload?: boolean;
  showNavigation?: boolean;
}) {
  const auth = useAuth();
  const mayUpload = canUpload ?? auth.hasPermission("attachment.upload");
  const [view, setView] = useState<EntityAttachmentView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [freshUrls, setFreshUrls] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    setError("");
    try {
      const { data, error: err } = await api.GET("/entity-attachments/{ownerType}/{ownerId}", {
        params: { path: { ownerType, ownerId } },
      });
      if (err || !data) {
        setError(errorMessage(err));
        setView(null);
        return;
      }
      setView(data as EntityAttachmentView);
      setFreshUrls({});
    } catch {
      setError("ارتباط با سرور برقرار نشد. دوباره تلاش کنید.");
      setView(null);
    } finally {
      setLoading(false);
    }
  }, [ownerType, ownerId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** URL امضاشده کوتاهعمر است؛ هنگام انقضا پیوند تازه از همان رکورد گرفته میشود. */
  const freshUrl = useCallback(
    async (item: EntityAttachmentItem): Promise<string | null> => {
      try {
        const { data, error: err } = await api.GET(
          "/entity-attachments/{ownerType}/{ownerId}/{attachmentId}/url",
          { params: { path: { ownerType, ownerId, attachmentId: item.id } } },
        );
        if (err || !data?.url) {
          setError(errorMessage(err));
          return null;
        }
        setFreshUrls((old) => ({ ...old, [item.id]: data.url }));
        return data.url;
      } catch {
        setError("دریافت پیوند دانلود ممکن نشد. دوباره تلاش کنید.");
        return null;
      }
    },
    [ownerType, ownerId],
  );

  const onSelect = (event: ChangeEvent<HTMLInputElement>) => {
    setNotice("");
    setError("");
    const file = event.target.files?.[0] ?? null;
    setSelected(file);
    if (file) {
      const invalid = entityAttachmentFileError(file);
      if (invalid) setError(invalid);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) {
      setError("ابتدا یک فایل انتخاب کنید.");
      return;
    }
    const invalid = entityAttachmentFileError(selected);
    if (invalid) {
      setError(invalid);
      return;
    }
    setProgress(0);
    setError("");
    setNotice("");
    try {
      const created = await uploadEntityAttachment(selected, ownerType, ownerId, setProgress);
      setNotice(`«${created.file_name}» بهعنوان ${created.kind_label_fa} این ${view?.owner_label_fa ?? "رکورد"} ثبت شد.`);
      setSelected(null);
      if (fileInput.current) fileInput.current.value = "";
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "بارگذاری فایل ناموفق بود.");
    } finally {
      setProgress(null);
    }
  };

  const uploading = progress !== null;
  const heading = title ?? `اسناد و ضمائم ${view?.owner_label_fa ?? ""}`.trim();
  const items = view?.items ?? [];
  const counts = view?.counts ?? { images: 0, documents: 0, total: 0 };

  return (
    <Card>
      <CardBody>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <SectionTitle>{heading}</SectionTitle>
            <p className="mt-1 text-xs text-ink-subtle">
              {loading
                ? "در حال دریافت فهرست…"
                : `${Number(counts.images).toLocaleString("fa-IR")} تصویر · ${Number(counts.documents).toLocaleString("fa-IR")} سند · ${Number(counts.total).toLocaleString("fa-IR")} مورد`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {showNavigation && view?.module_path && (
              <Link
                href={view.module_path}
                className="rounded-lg px-3 py-1.5 text-[13px] text-brand-soft-ink hover:bg-brand-soft focus-ring"
              >
                باز کردن صفحهٔ {view.owner_label_fa}
              </Link>
            )}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={loading || uploading}
              onClick={() => void load()}
              aria-label="تازهسازی فهرست ضمائم"
            >
              تازهسازی
            </Button>
          </div>
        </div>

        {view && <p className="mb-2 text-xs text-ink-muted">{view.note_fa}</p>}
        {view && <p className="mb-4 text-xs text-ink-subtle">{view.message_fa}</p>}

        {/* خطای شکست بارگذاری فهرست را `ErrorState` (همراه دکمهٔ تلاش دوباره)
            نشان میدهد؛ این هشدار فقط خطاهای عملیات روی فهرست موجود است تا
            پیام تکراری و چند `role="alert"` سردرگمکننده ساخته نشود. */}
        {error && view && (
          <p role="alert" className="mb-4 rounded-lg border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-ink">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="mb-4 rounded-lg border border-success-line bg-success-soft px-3 py-2 text-sm text-success-ink">
            {notice}
          </p>
        )}

        {mayUpload && (
          <form
            onSubmit={(e) => void onSubmit(e)}
            className="mb-5 rounded-xl border border-line bg-surface-alt p-4"
            aria-label="افزودن ضمیمه"
          >
            <label htmlFor={`entity-attachment-file-${ownerType}-${ownerId}`} className="mb-2 block text-sm font-medium text-ink">
              افزودن تصویر یا سند
            </label>
            <p className="mb-3 text-xs text-ink-muted">
              JPEG، PNG، WebP یا PDF تا ۸ مگابایت. مالک فایل بهصورت خودکار همین رکورد و شرکت شماست.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <input
                id={`entity-attachment-file-${ownerType}-${ownerId}`}
                ref={fileInput}
                type="file"
                accept={ENTITY_ATTACHMENT_ACCEPTED_TYPES.join(",")}
                onChange={onSelect}
                disabled={uploading}
                aria-label="انتخاب فایل ضمیمه"
                className="max-w-sm cursor-pointer rounded-lg border border-line bg-surface px-2 py-1.5 text-[13px] text-ink file:ms-0 file:me-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-surface-alt file:px-3 file:py-1 file:text-sm"
              />
              {/* خطا دکمه را قفل نمیکند: همان فایل باید بدون انتخاب دوباره قابل
                  تلاش مجدد باشد (retry واقعی، نه کنترل تزئینی). */}
              <Button type="submit" variant="primary" size="sm" disabled={uploading || !selected}>
                {uploading ? "در حال بارگذاری…" : "بارگذاری فایل"}
              </Button>
            </div>
            {selected && (
              <p className="mt-2 text-xs text-ink-muted" dir="auto">
                فایل انتخابشده: <bdi>{selected.name}</bdi> · {entityAttachmentSizeLabel(selected.size)} · {selected.type || "نوع نامشخص"}
              </p>
            )}
            {uploading && (
              <div className="mt-3">
                <ProgressBar value={progress ?? 0} label="پیشرفت بارگذاری فایل" />
                <p className="mt-1 text-xs text-ink-muted" role="status">
                  {Number(progress ?? 0).toLocaleString("fa-IR")} درصد بارگذاری شد
                </p>
              </div>
            )}
          </form>
        )}
        {!mayUpload && (
          <p className="mb-4 text-sm text-ink-muted">
            این نشست فقط اجازهٔ مشاهده و دریافت ضمائم را دارد.
          </p>
        )}

        {loading && (
          <div className="flex justify-center py-6">
            <Spinner label="در حال دریافت ضمائم" />
          </div>
        )}
        {!loading && !view && (
          <ErrorState compact message={error} onRetry={() => void load()} />
        )}
        {!loading && view && items.length === 0 && (
          <EmptyState
            compact
            title="ضمیمهای ثبت نشده است"
            description="نخستین تصویر یا سند این رکورد را از بخش بالا بارگذاری کنید."
          />
        )}
        {!loading && view && items.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="فهرست ضمائم">
            {items.map((item) => (
              <li
                key={item.id}
                className="overflow-hidden rounded-xl border border-line bg-surface"
              >
                {item.kind === "image" && (
                  <div className="relative aspect-video bg-surface-sunken">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={freshUrls[item.id] ?? item.url}
                      alt={`تصویر ضمیمه: ${item.file_name}`}
                      className="h-full w-full object-contain"
                      onError={() => void freshUrl(item)}
                    />
                  </div>
                )}
                <div className="space-y-1.5 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium text-ink" dir="auto" title={item.file_name}>
                      <bdi>{item.file_name}</bdi>
                    </p>
                    <Badge tone={item.kind === "image" ? "info" : "neutral"}>{item.kind_label_fa}</Badge>
                  </div>
                  <p className="text-[11px] text-ink-subtle">
                    {entityAttachmentSizeLabel(item.size_bytes)} · {item.content_type} · {toPersianDateTime(item.created_at)}
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={`دریافت پیوند تازه برای ${item.file_name}`}
                      onClick={() => void freshUrl(item)}
                    >
                      پیوند تازه
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      aria-label={`دانلود ${item.file_name}`}
                      onClick={async () => {
                        const url = await freshUrl(item);
                        if (url) window.open(url, "_blank", "noopener,noreferrer");
                      }}
                    >
                      دانلود / پیشنمایش
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * راهانداز ردیفی صفحههای فهرستی: یک دکمهٔ واقعی + دیالوگ دسترسپذیر حاوی همان
 * جزء مشترک. مالک دقیقاً از شناسهٔ ردیف میآید (نه ورودی آزاد کاربر).
 */
export function EntityAttachmentLauncher({
  ownerType,
  ownerId,
  label,
  buttonLabel = "ضمائم",
}: {
  ownerType: EntityAttachmentOwnerType;
  ownerId: string;
  label: string;
  buttonLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={!ownerId}
        aria-label={`ضمائم ${label}`}
        onClick={() => setOpen(true)}
      >
        {buttonLabel}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={`اسناد و ضمائم · ${label}`} size="lg">
        {open && (
          <EntityAttachments
            ownerType={ownerType}
            ownerId={ownerId}
            showNavigation={false}
          />
        )}
      </Modal>
    </>
  );
}
