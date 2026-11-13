"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import type { components } from "@dms/api-client";
import { api, uploadProductMedia } from "@/lib/api";
import { toPersianDateTime } from "@/lib/date";
import {
  btnGhost,
  btnPrimary,
  errorCls,
  faError,
  inputCls,
  okCls,
  panelCls,
  warnCls,
} from "../products-lib";

/**
 * تب «تصاویر و اسناد کالا» (TASK-PM-02-C1) — نخستین UX محصولمحور برای ضمائم
 * (باقیماندهٔ صریح G-06 / یادداشت M4). از مسیر محصولمحور سرور استفاده میکند،
 * نه `/attachments` عمومی: مالک و شرکت فقط از نشانی کالا و نشست میآیند.
 *
 * قرارداد مصوب §B4: تصویرِ اصلی بهصورت خودکار قدیمیترین تصویر است و UI برچسب
 * «اصلی (خودکار)» را دقیقاً همانطور که سرور فرستاده نشان میدهد؛ هیچ دکمهٔ
 * «انتخاب تصویر اصلی»، `sort_order` یا `is_primary` ذخیرهشده وجود ندارد.
 * حذف ضمیمه هم وجود ندارد چون مسیر حذف مصوبی تعریف نشده است.
 */

type ProductMediaView = components["schemas"]["ProductMediaView"];
type ProductMediaItem = components["schemas"]["ProductMediaItem"];

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_FILE_BYTES = 8 * 1024 * 1024;

export function productMediaSizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes.toLocaleString("fa-IR")} بایت`;
  if (bytes < 1024 * 1024) return `${Number((bytes / 1024).toFixed(1)).toLocaleString("fa-IR")} کیلوبایت`;
  return `${Number((bytes / (1024 * 1024)).toFixed(1)).toLocaleString("fa-IR")} مگابایت`;
}

/** اعتبارسنجی سمت مرورگر فقط برای بازخورد سریع؛ سرور مرجع قطعی است. */
export function productMediaFileError(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return "فقط تصویر JPEG/PNG/WebP یا سند PDF پذیرفته میشود.";
  }
  if (file.size > MAX_FILE_BYTES) {
    return "حجم فایل بیش از ۸ مگابایت است.";
  }
  if (file.size === 0) return "فایل خالی است.";
  return null;
}

export function ProductMediaTab({
  productId,
  canUpload,
}: {
  productId: string;
  canUpload: boolean;
}) {
  const [view, setView] = useState<ProductMediaView | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<File | null>(null);
  const [freshUrls, setFreshUrls] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const { data, error: err } = await api.GET("/products/{id}/media", {
        params: { path: { id: productId } },
      });
      if (err || !data) {
        setError(faError(err));
        return;
      }
      setView(data as ProductMediaView);
      setFreshUrls({});
    } catch {
      setError("ارتباط با سرور برقرار نشد. دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** URL امضاشده کوتاهعمر است؛ هنگام انقضا پیوند تازه از همان کالا گرفته میشود. */
  const freshUrl = useCallback(
    async (item: ProductMediaItem): Promise<string | null> => {
      try {
        const { data, error: err } = await api.GET("/products/{id}/media/{mediaId}/url", {
          params: { path: { id: productId, mediaId: item.id } },
        });
        if (err || !data?.url) {
          setError(faError(err));
          return null;
        }
        setFreshUrls((old) => ({ ...old, [item.id]: data.url }));
        return data.url;
      } catch {
        setError("دریافت پیوند دانلود ممکن نشد. دوباره تلاش کنید.");
        return null;
      }
    },
    [productId],
  );

  const onSelect = (event: ChangeEvent<HTMLInputElement>) => {
    setNotice("");
    setError("");
    const file = event.target.files?.[0] ?? null;
    setSelected(file);
    if (file) {
      const invalid = productMediaFileError(file);
      if (invalid) setError(invalid);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected) {
      setError("ابتدا یک فایل انتخاب کنید.");
      return;
    }
    const invalid = productMediaFileError(selected);
    if (invalid) {
      setError(invalid);
      return;
    }
    setUploading(true);
    setError("");
    setNotice("");
    try {
      const created = await uploadProductMedia(selected, productId);
      setNotice(
        created.is_primary
          ? `«${created.file_name}» ثبت شد و بهعنوان تصویرِ ${created.primary_label_fa} کالا قرار گرفت.`
          : `«${created.file_name}» بهعنوان ${created.kind_label_fa} کالا ثبت شد.`,
      );
      setSelected(null);
      if (fileInput.current) fileInput.current.value = "";
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "بارگذاری فایل ناموفق بود.");
    } finally {
      setUploading(false);
    }
  };

  const images = (view?.items ?? []).filter((i) => i.kind === "image");
  const documents = (view?.items ?? []).filter((i) => i.kind === "document");

  return (
    <section className={panelCls} aria-label="تصاویر و اسناد کالا" aria-busy={busy || uploading}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">تصاویر و اسناد کالا</h2>
          <p className="mt-1 text-xs text-ink-subtle">
            {view
              ? `${view.counts.images.toLocaleString("fa-IR")} تصویر · ${view.counts.documents.toLocaleString("fa-IR")} سند`
              : "در حال دریافت فهرست…"}
          </p>
        </div>
        <button type="button" className={btnGhost} disabled={busy || uploading} onClick={() => void load()}>
          تازهسازی
        </button>
      </div>

      {view && <p className={`mb-4 ${warnCls}`}>{view.primary_image_note_fa}</p>}
      {view && <p className="mb-4 text-xs text-ink-muted">{view.message_fa}</p>}

      {error && <p role="alert" className={`mb-4 ${errorCls}`}>{error}</p>}
      {notice && <p role="status" className={`mb-4 ${okCls}`}>{notice}</p>}

      {canUpload && (
        <form onSubmit={(e) => void onSubmit(e)} className="mb-6 rounded-xl border border-line bg-surface-alt p-4">
          <label htmlFor="product-media-file" className="mb-2 block text-sm font-medium">
            افزودن تصویر یا سند
          </label>
          <p className="mb-3 text-xs text-ink-muted">
            JPEG، PNG، WebP یا PDF تا ۸ مگابایت. مالک فایل بهصورت خودکار همین کالا و شرکت شماست.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              id="product-media-file"
              ref={fileInput}
              type="file"
              accept={ACCEPTED_TYPES.join(",")}
              onChange={onSelect}
              disabled={uploading}
              className={`${inputCls} max-w-sm cursor-pointer file:ms-0 file:me-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-surface file:px-3 file:py-1 file:text-sm`}
            />
            <button type="submit" className={btnPrimary} disabled={uploading || !selected}>
              {uploading ? "در حال بارگذاری…" : "بارگذاری فایل"}
            </button>
          </div>
          {selected && (
            <p className="mt-2 text-xs text-ink-muted" dir="auto">
              فایل انتخابشده: <bdi>{selected.name}</bdi> · {productMediaSizeLabel(selected.size)}
            </p>
          )}
        </form>
      )}

      {!canUpload && (
        <p className="mb-4 text-sm text-ink-muted">
          این نشست فقط اجازهٔ مشاهده و دریافت تصاویر/اسناد کالا را دارد.
        </p>
      )}

      {view && view.counts.total === 0 && !busy && (
        <p className="py-6 text-center text-ink-muted">هنوز تصویر یا سندی برای این کالا ثبت نشده است.</p>
      )}

      {images.length > 0 && (
        <div className="mb-6">
          <h3 className="mb-3 text-sm font-medium">تصاویر</h3>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((item) => (
              <li key={item.id} className="overflow-hidden rounded-xl border border-line bg-surface">
                <div className="relative aspect-video bg-surface-sunken">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={freshUrls[item.id] ?? item.url}
                    alt={`تصویر کالا: ${item.file_name}`}
                    className="h-full w-full object-contain"
                    onError={() => void freshUrl(item)}
                  />
                  {item.is_primary && item.primary_label_fa && (
                    <span className="absolute top-2 start-2 rounded-full bg-info px-2 py-0.5 text-xs text-on-info">
                      {item.primary_label_fa}
                    </span>
                  )}
                </div>
                <div className="space-y-1 p-3">
                  <p className="truncate text-sm" dir="auto" title={item.file_name}>
                    <bdi>{item.file_name}</bdi>
                  </p>
                  <p className="text-xs text-ink-muted">
                    {item.kind_label_fa} · {productMediaSizeLabel(item.size_bytes)} ·{" "}
                    {toPersianDateTime(item.created_at)}
                  </p>
                  <button type="button" className={btnGhost} onClick={() => void freshUrl(item)}>
                    پیوند تازه / دانلود
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {documents.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-medium">اسناد</h3>
          <ul className="space-y-2">
            {documents.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm" dir="auto" title={item.file_name}>
                    <bdi>{item.file_name}</bdi>
                  </p>
                  <p className="text-xs text-ink-muted">
                    {item.kind_label_fa} · {productMediaSizeLabel(item.size_bytes)} ·{" "}
                    {toPersianDateTime(item.created_at)}
                  </p>
                </div>
                <button
                  type="button"
                  className={btnGhost}
                  onClick={async () => {
                    const url = await freshUrl(item);
                    if (url) window.open(url, "_blank", "noopener,noreferrer");
                  }}
                >
                  دانلود سند
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
