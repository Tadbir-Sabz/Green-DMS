import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  ProductMediaTab,
  productMediaFileError,
  productMediaSizeLabel,
} from "./product-media";

const get = vi.hoisted(() => vi.fn());
const upload = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({
  api: { GET: get },
  uploadProductMedia: upload,
}));

afterEach(cleanup);
beforeEach(() => {
  get.mockReset();
  upload.mockReset();
});

const emptyView = {
  product_id: "p1",
  product_code: "P-1",
  product_name: "کالای تست",
  items: [],
  primary_image: null,
  counts: { images: 0, documents: 0, total: 0 },
  primary_image_rule: "first_image_by_created_at",
  primary_image_label_fa: "اصلی (خودکار)",
  primary_image_note_fa:
    "تصویرِ اصلی بهصورت خودکار قدیمیترین تصویرِ این کالاست؛ با حذف آن، تصویرِ بعدی بهصورت خودکار اصلی میشود.",
  message_fa: "صرفاً کاتالوگ مرکزی؛ هیچ وضعیت دامنهای نشان داده نمیشود.",
};

const item = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  owner_type: "product",
  owner_id: "p1",
  file_name: "نمای-اصلی.png",
  content_type: "image/png",
  size_bytes: 2048,
  sha256: "a".repeat(64),
  url: "https://storage.local/signed/m1",
  created_at: "2026-11-11T09:00:00.000Z",
  kind: "image",
  kind_label_fa: "تصویر",
  is_primary: true,
  primary_label_fa: "اصلی (خودکار)",
  ...over,
});

const fullView = {
  ...emptyView,
  items: [
    item(),
    item({
      id: "m2",
      file_name: "کاتالوگ.pdf",
      content_type: "application/pdf",
      kind: "document",
      kind_label_fa: "سند",
      is_primary: false,
      primary_label_fa: null,
    }),
  ],
  primary_image: item(),
  counts: { images: 1, documents: 1, total: 2 },
};

const respond = (view: unknown) => {
  get.mockImplementation(async (path: string) => {
    if (path === "/products/{id}/media") return { data: view };
    if (path === "/products/{id}/media/{mediaId}/url") {
      return { data: { url: "https://storage.local/fresh", expires_in: 300 } };
    }
    return { data: undefined, error: { message_fa: "مسیر ناشناخته" } };
  });
};

describe("connected Persian RTL product media tab", () => {
  it("renders an empty state and read-only hint without offering upload", async () => {
    respond(emptyView);
    render(<ProductMediaTab productId="p1" canUpload={false} />);
    await screen.findByText("هنوز تصویر یا سندی برای این کالا ثبت نشده است.");
    expect(get).toHaveBeenCalledWith("/products/{id}/media", {
      params: { path: { id: "p1" } },
    });
    expect(screen.getByText(/۰ تصویر/)).toBeTruthy();
    expect(screen.getByText(/این نشست فقط اجازهٔ مشاهده/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "بارگذاری فایل" })).toBeNull();
    expect(screen.getByRole("region", { name: "تصاویر و اسناد کالا" }).getAttribute("dir")).toBeNull();
  });

  it("shows the approved automatic primary label, image and document cards", async () => {
    respond(fullView);
    render(<ProductMediaTab productId="p1" canUpload={false} />);
    await screen.findByText("اصلی (خودکار)");
    expect(screen.getByAltText("تصویر کالا: نمای-اصلی.png")).toBeTruthy();
    expect(screen.getByText("کاتالوگ.pdf")).toBeTruthy();
    expect(screen.getByRole("button", { name: "دانلود سند" })).toBeTruthy();
    expect(screen.getByText(fullView.primary_image_note_fa)).toBeTruthy();
  });

  it("rejects an unsupported file locally before calling the API", async () => {
    respond(emptyView);
    render(<ProductMediaTab productId="p1" canUpload />);
    await screen.findByText("هنوز تصویر یا سندی برای این کالا ثبت نشده است.");
    const input = screen.getByLabelText("افزودن تصویر یا سند") as HTMLInputElement;
    const bad = new File(["x"], "بد.exe", { type: "application/octet-stream" });
    fireEvent.change(input, { target: { files: [bad] } });
    expect(screen.getByRole("alert").textContent).toContain("فقط تصویر");
    fireEvent.click(screen.getByRole("button", { name: "بارگذاری فایل" }));
    expect(upload).not.toHaveBeenCalled();
  });

  it("uploads a selected image with no client owner fields, then reloads the list", async () => {
    respond(emptyView);
    upload.mockResolvedValue(item());
    render(<ProductMediaTab productId="p1" canUpload />);
    await screen.findByText("هنوز تصویر یا سندی برای این کالا ثبت نشده است.");
    const input = screen.getByLabelText("افزودن تصویر یا سند") as HTMLInputElement;
    const png = new File([new Uint8Array([1, 2, 3])], "نمای-اصلی.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [png] } });
    fireEvent.click(screen.getByRole("button", { name: "بارگذاری فایل" }));
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload.mock.calls[0][0]).toBe(png);
    expect(upload.mock.calls[0][1]).toBe("p1");
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await screen.findByRole("status");
    expect(screen.getByRole("status").textContent).toContain("اصلی (خودکار)");
  });

  it("surfaces a structured server error from upload as a Persian alert", async () => {
    respond(emptyView);
    upload.mockRejectedValue(new Error("نوع فایل مجاز نیست."));
    render(<ProductMediaTab productId="p1" canUpload />);
    await screen.findByText("هنوز تصویر یا سندی برای این کالا ثبت نشده است.");
    const input = screen.getByLabelText("افزودن تصویر یا سند") as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array([1])], "a.png", { type: "image/png" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "بارگذاری فایل" }));
    await screen.findByText("نوع فایل مجاز نیست.");
    expect(screen.getByRole("alert").textContent).toContain("نوع فایل مجاز نیست");
  });

  it("refreshes an expired signed URL through the product-scoped URL route", async () => {
    respond(fullView);
    render(<ProductMediaTab productId="p1" canUpload={false} />);
    await screen.findByText("اصلی (خودکار)");
    fireEvent.click(screen.getByRole("button", { name: "پیوند تازه / دانلود" }));
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/products/{id}/media/{mediaId}/url", {
        params: { path: { id: "p1", mediaId: "m1" } },
      }),
    );
  });
});

describe("product media formatting and file guards", () => {
  it("formats sizes with Persian digits and validates type/size", () => {
    expect(productMediaSizeLabel(512)).toContain("بایت");
    expect(productMediaSizeLabel(2048)).toContain("کیلوبایت");
    expect(productMediaSizeLabel(8 * 1024 * 1024)).toContain("مگابایت");
    expect(productMediaSizeLabel(-1)).toBe("—");
    expect(productMediaFileError(new File(["x"], "a.pdf", { type: "application/pdf" }))).toBeNull();
    expect(productMediaFileError(new File(["x"], "a.txt", { type: "text/plain" }))).not.toBeNull();
    const oversized = { type: "image/png", size: 9 * 1024 * 1024 } as unknown as File;
    expect(productMediaFileError(oversized)).toContain("۸ مگابایت");
  });
});
