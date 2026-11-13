import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  ENTITY_ATTACHMENT_MAX_BYTES,
  EntityAttachments,
  EntityAttachmentLauncher,
  entityAttachmentFileError,
  entityAttachmentSizeLabel,
  type EntityAttachmentOwnerType,
} from "./EntityAttachments";
import { Attachments } from "./Attachments";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  upload: vi.fn(),
  open: vi.fn(),
  canUploadPermission: true,
}));

vi.mock("@/lib/api", () => ({
  api: { GET: mocks.get },
  uploadEntityAttachment: mocks.upload,
  errorMessage: (e: unknown) =>
    (e as { message_fa?: string; message?: string } | undefined)?.message_fa ??
    (e as { message?: string } | undefined)?.message ??
    "خطای ناشناختهای رخ داد.",
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: null,
    isLoading: false,
    hasPermission: (permission: string) =>
      permission === "attachment.upload" ? mocks.canUploadPermission : true,
    hasRole: () => false,
    refresh: async () => null,
    setUser: () => undefined,
    logout: async () => undefined,
  }),
}));

const ITEM = {
  id: "11111111-1111-4111-8111-111111111111",
  owner_type: "invoice",
  owner_id: "22222222-2222-4222-8222-222222222222",
  file_name: "فاکتور-اصلی.pdf",
  content_type: "application/pdf",
  size_bytes: 2048,
  sha256: "a".repeat(64),
  url: "https://storage.local/signed?key=old",
  created_at: "2026-01-01T10:00:00.000Z",
  kind: "document",
  kind_label_fa: "سند",
};

const view = (ownerType: EntityAttachmentOwnerType, ownerId: string, items: unknown[] = []) => ({
  data: {
    owner_type: ownerType,
    owner_id: ownerId,
    owner_label_fa: "فاکتور فروش",
    module_path: "/invoices",
    items,
    counts: {
      images: items.filter((i) => (i as { kind: string }).kind === "image").length,
      documents: items.filter((i) => (i as { kind: string }).kind === "document").length,
      total: items.length,
    },
    note_fa: "حذف، بایگانی، انتخاب تصویر اصلی و سیاست نگهداشت تعریف نشدهاند.",
    message_fa: "هیچ ورودی دامنهای پذیرفته نمیشود.",
  },
  error: undefined,
});

const OWNER_ID = "22222222-2222-4222-8222-222222222222";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.canUploadPermission = true;
  mocks.get.mockImplementation(async () => view("invoice", OWNER_ID));
  mocks.upload.mockResolvedValue({ ...ITEM, file_name: "تازه.png", content_type: "image/png", kind: "image", kind_label_fa: "تصویر" });
  window.open = mocks.open;
});

describe("TASK-PM-02-C3 — جزء مشترک ضمائم سازمانی", () => {
  it("قواعد خالص حجم و نوع فایل", () => {
    expect(entityAttachmentSizeLabel(512)).toContain("بایت");
    expect(entityAttachmentSizeLabel(2048)).toContain("کیلوبایت");
    expect(entityAttachmentSizeLabel(2 * 1024 * 1024)).toContain("مگابایت");
    expect(entityAttachmentFileError(new File(["x"], "a.png", { type: "image/png" }))).toBeNull();
    expect(entityAttachmentFileError(new File(["x"], "a.txt", { type: "text/plain" }))).toContain("PDF");
    expect(entityAttachmentFileError(new File([new Uint8Array(ENTITY_ATTACHMENT_MAX_BYTES + 1)], "a.png", { type: "image/png" }))).toContain("۸ مگابایت");
  });

  it("حالت خالی، برچسب موجودیت، شمارش و نبود کنترلهای تعریفنشده", async () => {
    render(<EntityAttachments ownerType="invoice" ownerId={OWNER_ID} canUpload />);
    await screen.findByText("ضمیمهای ثبت نشده است");
    expect(screen.getByRole("heading", { name: /اسناد و ضمائم فاکتور فروش/ })).toBeTruthy();
    expect(screen.getByText(/۰ تصویر/)).toBeTruthy();
    expect(screen.getByText(/تعریف نشدهاند/)).toBeTruthy();
    expect((screen.getByRole("link", { name: /باز کردن صفحه/ }) as HTMLAnchorElement).getAttribute("href")).toBe("/invoices");
    const labels = Array.from(document.querySelectorAll("button")).map((b) => b.textContent ?? "");
    expect(labels.some((l) => /حذف|بایگانی|اصلی|نگهداشت/.test(l))).toBe(false);
  });

  it("همهٔ پنج موجودیت UI از همان مسیر مالکمحور استفاده میکنند", async () => {
    const types: EntityAttachmentOwnerType[] = [
      "invoice",
      "sales_order",
      "return_request",
      "stock_count",
      "journal_entry",
    ];
    for (const ownerType of types) {
      mocks.get.mockImplementation(async () => view(ownerType, OWNER_ID));
      const { unmount } = render(<EntityAttachments ownerType={ownerType} ownerId={OWNER_ID} canUpload={false} />);
      await waitFor(() => expect(mocks.get).toHaveBeenCalled());
      const [path, opts] = mocks.get.mock.calls.at(-1) as [string, { params: { path: Record<string, string> } }];
      expect(path).toBe("/entity-attachments/{ownerType}/{ownerId}");
      expect(opts.params.path).toEqual({ ownerType, ownerId: OWNER_ID });
      expect(document.body.textContent).toContain("این نشست فقط اجازهٔ مشاهده");
      unmount();
      cleanup();
    }
  });

  it("خطا، پیام فارسی و تلاش دوباره واقعی", async () => {
    mocks.get
      .mockRejectedValueOnce(new Error("network down"))
      .mockImplementation(async () => view("invoice", OWNER_ID));
    render(<EntityAttachments ownerType="invoice" ownerId={OWNER_ID} canUpload={false} />);
    await screen.findByRole("alert");
    expect(screen.getAllByText(/ارتباط با سرور/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /تلاش دوباره/ }));
    await screen.findByText("ضمیمهای ثبت نشده است");
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it("فهرست فایلها با نوع/حجم/تاریخ و پیوند تازهٔ امضاشده", async () => {
    mocks.get.mockImplementation(async (path: string) => {
      if (path.includes("/url")) return { data: { url: "https://storage.local/signed?key=fresh", expires_in: 300 }, error: undefined };
      return view("invoice", OWNER_ID, [ITEM]);
    });
    render(<EntityAttachments ownerType="invoice" ownerId={OWNER_ID} canUpload={false} />);
    await screen.findByText("فاکتور-اصلی.pdf");
    expect(screen.getByText("سند", { exact: true })).toBeTruthy();
    expect(screen.getByText(/کیلوبایت/)).toBeTruthy();
    expect(screen.getByText(/application\/pdf/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /دانلود فاکتور-اصلی.pdf/ }));
    await waitFor(() => expect(mocks.open).toHaveBeenCalledWith("https://storage.local/signed?key=fresh", "_blank", "noopener,noreferrer"));
    const [, opts] = mocks.get.mock.calls.at(-1) as [string, { params: { path: Record<string, string> } }];
    expect(opts.params.path.attachmentId).toBe(ITEM.id);
  });

  it("بارگذاری با پیشرفت واقعی، بازخورد موفقیت و تازهسازی فهرست", async () => {
    let resolveUpload: (v: unknown) => void = () => undefined;
    const pending = new Promise((resolve) => { resolveUpload = resolve; });
    mocks.upload.mockImplementation(
      async (_file: File, _type: string, _id: string, onProgress?: (n: number) => void) => {
        onProgress?.(42);
        await pending;
        onProgress?.(100);
        return { ...ITEM, file_name: "تازه.png", content_type: "image/png", size_bytes: 33, kind: "image", kind_label_fa: "تصویر" };
      },
    );
    render(<EntityAttachments ownerType="invoice" ownerId={OWNER_ID} canUpload />);
    await screen.findByText("ضمیمهای ثبت نشده است");
    const file = new File(["x"], "تازه.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("انتخاب فایل ضمیمه"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "بارگذاری فایل" }));
    await waitFor(() => expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("42"));
    expect(screen.getByText(/۴۲ درصد/)).toBeTruthy();
    resolveUpload(undefined);
    await screen.findByText(/ثبت شد/);
    await waitFor(() => expect(mocks.get.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(mocks.upload.mock.calls[0][1]).toBe("invoice");
    expect(mocks.upload.mock.calls[0][2]).toBe(OWNER_ID);
    expect(mocks.upload.mock.calls[0][0]).toBe(file);
  });

  it("خطای بارگذاری فارسی نمایش داده میشود و دکمهٔ آپلود دوباره فعال است", async () => {
    mocks.upload.mockRejectedValueOnce(new Error("نوع فایل مجاز نیست."));
    render(<EntityAttachments ownerType="invoice" ownerId={OWNER_ID} canUpload />);
    await screen.findByText("ضمیمهای ثبت نشده است");
    fireEvent.change(screen.getByLabelText("انتخاب فایل ضمیمه"), {
      target: { files: [new File(["x"], "تازه.png", { type: "image/png" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "بارگذاری فایل" }));
    await screen.findByRole("alert");
    expect(screen.getByText("نوع فایل مجاز نیست.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "بارگذاری فایل" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("راهانداز ردیفی دیالوگ را با همان مالک باز میکند", async () => {
    render(
      <EntityAttachmentLauncher ownerType="return_request" ownerId={OWNER_ID} label="مرجوعی ۱۲" />,
    );
    const button = screen.getByRole("button", { name: "ضمائم مرجوعی ۱۲" });
    fireEvent.click(button);
    await screen.findByRole("dialog");
    await waitFor(() => expect(mocks.get).toHaveBeenCalled());
    const [, opts] = mocks.get.mock.calls[0] as [string, { params: { path: Record<string, string> } }];
    expect(opts.params.path.ownerType).toBe("return_request");
    expect(opts.params.path.ownerId).toBe(OWNER_ID);
  });

  it("نگهدارندهٔ سازگاری، مجوز نوشتن را از نشست میگیرد و کنترل غیرفعال نمیسازد", async () => {
    mocks.canUploadPermission = false;
    render(<Attachments ownerType="sales_order" ownerId={OWNER_ID} />);
    await screen.findByText("ضمیمهای ثبت نشده است");
    expect(screen.getByText("این نشست فقط اجازهٔ مشاهده و دریافت ضمائم را دارد.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "بارگذاری فایل" })).toBeNull();
    const [path, opts] = mocks.get.mock.calls.at(-1) as [string, { params: { path: Record<string, string> } }];
    expect(path).toBe("/entity-attachments/{ownerType}/{ownerId}");
    expect(opts.params.path).toEqual({ ownerType: "sales_order", ownerId: OWNER_ID });
  });
});
