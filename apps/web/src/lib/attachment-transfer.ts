"use client";

import type { components } from "@dms/api-client";
import {
  API_BASE_URL,
  errorMessage,
  getToken,
  refreshAccessToken,
} from "@/lib/api";

/**
 * کلاینت خام «مرکز انتقال ضمائم» (TASK-PM-02-C4).
 *
 * چرا خام؟ صدور باینری ZIP و ورود multipform نیازمند fetch مستقیماند؛
 * openapi-fetch بدنهٔ multipart و blob را به شکلی که این صفحه لازم دارد
 * تایپ نمیکند. همچنان همان BASE_URL نسبی/همانمبدأ، همان توکن و همان
 * تازهمسازی یکبارهِ نشست بهکار میرود. هیچ company_id، domain_id، مالک،
 * storage_key، URL امضاشده یا توکن در URL/بدنه ساخته نمیشود.
 */

export type TransferOwnerType = components["schemas"]["TransferOwnerType"];
export type TransferOwnerTypeOption = components["schemas"]["TransferOwnerTypeOption"];
export type TransferOwnerRecord = components["schemas"]["TransferOwnerRecord"];
export type TransferSelection = components["schemas"]["TransferSelection"];
export type TransferExportPreview = components["schemas"]["TransferExportPreview"];
export type TransferImportPreview = components["schemas"]["TransferImportPreview"];
export type TransferMappingOverride = components["schemas"]["TransferMappingOverride"];
export type TransferHistoryItem = components["schemas"]["TransferHistoryItem"];
export type TransferOperationDetail = components["schemas"]["TransferOperationDetail"];
export type TransferCancelResult = components["schemas"]["TransferCancelResult"];

type TransferInit = Omit<RequestInit, "body"> & { body?: BodyInit | null };

async function transferFetch(path: string, init: TransferInit = {}): Promise<Response> {
  const send = (token: string | null): Promise<Response> => {
    const headers = new Headers(init.headers ?? {});
    if (token) headers.set("Authorization", `Bearer ${token}`);
    headers.set("Cache-Control", "no-store");
    return fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  };
  let res = await send(getToken());
  if (res.status === 401) {
    const ok = await refreshAccessToken({ tokenSent: getToken() });
    if (ok) res = await send(getToken());
  }
  if (!res.ok) {
    const body = await res.json().catch(() => undefined);
    throw new Error(errorMessage(body));
  }
  return res;
}

async function jsonRequest<T>(path: string, init: TransferInit & { method: "GET" | "POST" }, body?: unknown): Promise<T> {
  const headers = new Headers(init.headers ?? {});
  if (body !== undefined) headers.set("Content-Type", "application/json");
  const res = await transferFetch(path, {
    ...init,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return (await res.json()) as T;
}

export async function getTransferOwnerTypes(): Promise<{
  items: TransferOwnerTypeOption[];
  note_fa: string;
}> {
  return jsonRequest("/attachment-transfer/owner-types", { method: "GET" });
}

export async function getTransferOwners(
  entityTypes: readonly TransferOwnerType[],
  q = "",
  limit = 40,
): Promise<{ items: TransferOwnerRecord[]; note_fa: string }> {
  const search = new URLSearchParams();
  entityTypes.forEach((type) => search.append("entity_types", type));
  if (q.trim()) search.set("q", q.trim().slice(0, 100));
  search.set("limit", String(limit));
  return jsonRequest(`/attachment-transfer/owners?${search.toString()}`, { method: "GET" });
}

export async function createExportPreview(
  selections: readonly TransferSelection[],
): Promise<TransferExportPreview> {
  return jsonRequest("/attachment-transfer/exports/preview", { method: "POST" }, { selections });
}

/** دانلود همانمبدأ و مبتنی بر Authorization؛ URL امضاشدهای برنمیگردد. */
export async function downloadExportPackage(operationId: string): Promise<{ filename: string; size: number; sha256: string | null }> {
  const res = await transferFetch(
    `/attachment-transfer/exports/${encodeURIComponent(operationId)}/package`,
    { method: "GET" },
  );
  const blob = await res.blob();
  const sha = res.headers.get("X-Transfer-Package-Sha256");
  const filename = `attachments-${operationId.slice(0, 8)}.zip`;
  if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
  // هش فقط برای نمایش امن در رابط؛ کلید استوریج/endpoint/اعتبارنامه هرگز نیست.
  return { filename, size: blob.size, sha256: sha };
}

export async function createImportPreview(file: File): Promise<TransferImportPreview> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await transferFetch("/attachment-transfer/imports/preview", {
    method: "POST",
    body: fd,
  });
  return (await res.json()) as TransferImportPreview;
}

export async function getImportPreview(operationId: string): Promise<TransferImportPreview> {
  return jsonRequest(`/attachment-transfer/imports/${encodeURIComponent(operationId)}`, { method: "GET" });
}

export async function updateImportMappings(
  operationId: string,
  mappingOverrides: readonly TransferMappingOverride[],
): Promise<TransferImportPreview> {
  return jsonRequest(
    `/attachment-transfer/imports/${encodeURIComponent(operationId)}/mappings`,
    { method: "POST" },
    { mapping_overrides: mappingOverrides },
  );
}

/** بررسی واقعی دروازهٔ اجرا؛ سرور fail-closed پاسخ ۴۰۹ میدهد. هیچ اجرایی انجام نمیشود. */
export async function checkImportExecutionGate(operationId: string): Promise<string> {
  try {
    await jsonRequest(
      `/attachment-transfer/imports/${encodeURIComponent(operationId)}/execute`,
      { method: "POST" },
      {},
    );
    return "دروازهٔ اجرا بهطور غیرمنتظره باز شد؛ از ادامه خودداری کنید.";
  } catch (err) {
    return err instanceof Error ? err.message : "اجرای ورود مسدود است.";
  }
}

export async function cancelTransferOperation(operationId: string): Promise<TransferCancelResult> {
  return jsonRequest(
    `/attachment-transfer/operations/${encodeURIComponent(operationId)}/cancel`,
    { method: "POST" },
    {},
  );
}

export async function getTransferHistory(limit = 100): Promise<{
  items: TransferHistoryItem[];
  note_fa: string;
}> {
  return jsonRequest(`/attachment-transfer/operations?limit=${limit}`, { method: "GET" });
}

export async function getTransferOperationDetail(operationId: string): Promise<TransferOperationDetail> {
  return jsonRequest(`/attachment-transfer/operations/${encodeURIComponent(operationId)}`, { method: "GET" });
}

/** برچسب فارسی وضعیت فایل/عملیات — بدون ساختن معنای کسبوکاری تازه. */
export const TRANSFER_STATUS_LABELS_FA: Record<string, string> = {
  accepted: "قابل بررسی",
  rejected: "ردشده",
  duplicate: "تکراری",
  unresolved: "حلنشده",
  pending: "در انتظار سیاست",
  approved: "تأییدشده (غیرفعال)",
  completed: "تکمیلشده",
  failed: "ناموفق",
  blocked: "مسدود",
  cancelled: "لغوشده",
  preview: "پیشنمایش",
  approval: "تأیید",
  execution: "اجرا",
  download: "دانلود",
  failure: "خطا",
  cancellation: "لغو",
  export: "صدور",
  import: "ورود",
};

export function formatBytesFa(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes.toLocaleString("fa-IR")} بایت`;
  if (bytes < 1024 * 1024) return `${Number((bytes / 1024).toFixed(1)).toLocaleString("fa-IR")} کیلوبایت`;
  return `${Number((bytes / (1024 * 1024)).toFixed(1)).toLocaleString("fa-IR")} مگابایت`;
}

export function formatDateTimeFa(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" });
}
