import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AttachmentTransferCenter } from "./AttachmentTransferCenter";

const mocks = vi.hoisted(() => ({
  getTransferOwnerTypes: vi.fn(),
  getTransferOwners: vi.fn(),
  createExportPreview: vi.fn(),
  downloadExportPackage: vi.fn(),
  createImportPreview: vi.fn(),
  getImportPreview: vi.fn(),
  updateImportMappings: vi.fn(),
  checkImportExecutionGate: vi.fn(),
  cancelTransferOperation: vi.fn(),
  getTransferHistory: vi.fn(),
  getTransferOperationDetail: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { username: "c4_admin", roles: [], permissions: ["*"] },
    isLoading: false,
    hasPermission: () => true,
    hasRole: () => false,
    refresh: async () => null,
    setUser: () => undefined,
    logout: async () => undefined,
  }),
}));

vi.mock("@/lib/attachment-transfer", () => ({
  TRANSFER_STATUS_LABELS_FA: {
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
  },
  formatBytesFa: (bytes: number) => `${bytes.toLocaleString("fa-IR")} بایت`,
  formatDateTimeFa: (value: string | null) => (value ? "۱۴۰۵/۰۸/۱۶ ۱۰:۰۰" : "—"),
  getTransferOwnerTypes: mocks.getTransferOwnerTypes,
  getTransferOwners: mocks.getTransferOwners,
  createExportPreview: mocks.createExportPreview,
  downloadExportPackage: mocks.downloadExportPackage,
  createImportPreview: mocks.createImportPreview,
  getImportPreview: mocks.getImportPreview,
  updateImportMappings: mocks.updateImportMappings,
  checkImportExecutionGate: mocks.checkImportExecutionGate,
  cancelTransferOperation: mocks.cancelTransferOperation,
  getTransferHistory: mocks.getTransferHistory,
  getTransferOperationDetail: mocks.getTransferOperationDetail,
}));

const COMPANY = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";
const OWNER_A = "33333333-3333-4333-8333-333333333333";
const OWNER_B = "44444444-4444-4444-8444-444444444444";
const ATTACHMENT_A = "55555555-5555-4555-8555-555555555555";
const OP = "77777777-7777-4777-8777-777777777777";
const SHA = "a".repeat(64);
const PATH = `files/0001-${SHA.slice(0, 12)}.png`;

const OWNER_TYPES = [
  "product", "invoice", "sales_order", "return_request", "stock_count", "journal_entry", "receipt", "pod",
].map((owner_type) => ({
  owner_type,
  label_fa: owner_type === "invoice" ? "فاکتور فروش" : owner_type,
  module_path: "/invoices",
  backend_supported: true,
  ui_module: "operational_entity",
  note_fa: "مالکیت مصوب",
}));

const OWNERS = [
  {
    owner_type: "invoice",
    owner_id: OWNER_A,
    reference: "INV-1",
    title_fa: "فاکتور نمونه",
    label_fa: "فاکتور فروش",
    module_path: "/invoices",
    attachment_count: 1,
  },
  {
    owner_type: "invoice",
    owner_id: OWNER_B,
    reference: "INV-2",
    title_fa: "فاکتور جایگزین",
    label_fa: "فاکتور فروش",
    module_path: "/invoices",
    attachment_count: 0,
  },
];

const EXPORT_PREVIEW = {
  operation_id: OP,
  operation_type: "export",
  phase: "preview",
  execution_status: "completed",
  created_at: "2026-11-07T10:00:00.000Z",
  expires_at: "2026-11-07T10:15:00.000Z",
  entity_types: ["invoice"],
  selections: [{ owner_type: "invoice", owner_id: OWNER_A }],
  file_count: 1,
  total_bytes: 2048,
  estimated_package_size_bytes: 4096,
  rejected_count: 0,
  rejected_files: [],
  manifest: {
    schema: "green-dms.attachment-transfer/1",
    operation_id: OP,
    created_at: "2026-11-07T10:00:00.000Z",
    entity_types: ["invoice"],
    file_count: 1,
    total_bytes: 2048,
    files: [{
      path: PATH,
      attachment_id: ATTACHMENT_A,
      owner_type: "invoice",
      owner_id: OWNER_A,
      file_name: "عکس.png",
      content_type: "image/png",
      size_bytes: 2048,
      sha256: SHA,
      crc32: 12345,
      exported_at: "2026-11-07T10:00:00.000Z",
    }],
    checksums: {
      schema: "green-dms.attachment-transfer/1",
      manifest_sha256: "b".repeat(64),
      package_sha256: "c".repeat(64),
      total_bytes: 2048,
      file_count: 1,
    },
  },
  downloads_available: true,
  note_fa: "فقط ضمائم",
};

const IMPORT_PREVIEW = {
  operation_id: OP,
  operation_type: "import",
  phase: "preview",
  execution_status: "blocked",
  status: "approval_blocked",
  created_at: "2026-11-07T10:00:00.000Z",
  expires_at: "2026-11-07T10:15:00.000Z",
  version: 1,
  entity_types: ["invoice"],
  file_count: 1,
  total_bytes: 2048,
  package_sha256: "d".repeat(64),
  manifest_sha256: "e".repeat(64),
  mapping_sha256: "f".repeat(64),
  preview_sha256: "1".repeat(64),
  items: [{
    path: PATH,
    attachment_id: ATTACHMENT_A,
    owner_type: "invoice",
    owner_id: OWNER_A,
    file_name: "عکس.png",
    content_type: "image/png",
    size_bytes: 2048,
    sha256: SHA,
    status: "unresolved",
    reason_code: "owner_not_found",
    message_fa: "رکورد مالک در شرکت شما یافت نشد؛ هیچ رکورد تازهای ساخته نمیشود.",
  }],
  counts: { accepted: 0, rejected: 0, duplicate: 0, unresolved: 1 },
  manifest: EXPORT_PREVIEW.manifest,
  approval: {
    status: "blocked",
    reason_code: "approval_policy_missing",
    message_fa: "اجرای ورود نیازمند گردش تأیید دونفرهٔ مصوب است.",
    operation: "attachment.import.execute",
    mechanism: "submitForApproval → consumeApprovedBinding",
    fingerprint_supported: false,
    required_dependency_fa: "سیاست و اثرانگشت مصوب لازم است.",
    initiator_user_id: USER,
    approver_user_id: null,
    approved_at: null,
    approved_package_sha256: null,
    approved_mapping_sha256: null,
    approved_preview_sha256: null,
    current_package_sha256: "d".repeat(64),
    current_mapping_sha256: "f".repeat(64),
    current_preview_sha256: "1".repeat(64),
    approval_invalidated: false,
    self_approval_forbidden: true,
  },
  execution: { allowed: false, reason_code: "approval_policy_missing", message_fa: "اجرا مسدود است." },
  note_fa: "فقط ضمائم",
};

const HISTORY_ITEM = {
  operation_id: OP,
  operation_type: "import",
  phase: "cancellation",
  execution_status: "cancelled",
  initiator_user_id: USER,
  initiator_label: "اپراتور تست",
  approver_user_id: null,
  approver_label: "—",
  package_schema: "green-dms.attachment-transfer/1",
  package_sha256: "d".repeat(64),
  manifest_sha256: "e".repeat(64),
  total_bytes: 2048,
  estimated_package_size_bytes: 4096,
  entity_types: ["invoice"],
  file_count: 1,
  accepted_count: 0,
  rejected_count: 0,
  duplicate_count: 0,
  unresolved_count: 1,
  created_at: "2026-11-07T10:00:00.000Z",
  completed_at: "2026-11-07T10:05:00.000Z",
  safe_failure: { code: "approval_required", message_fa: "تأیید مستقل شخص دوم ثبت نشده است." },
  events: [
    { event_id: "1", action: "attachment_transfer.preview", phase: "preview", status: "blocked", at: "2026-11-07T10:00:00.000Z", actor_user_id: USER, actor_label: "اپراتور تست", safe_failure: null },
    { event_id: "2", action: "attachment_transfer.cancellation", phase: "cancellation", status: "cancelled", at: "2026-11-07T10:05:00.000Z", actor_user_id: USER, actor_label: "اپراتور تست", safe_failure: null },
  ],
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.getTransferOwnerTypes.mockResolvedValue({ items: OWNER_TYPES, note_fa: "فقط ضمائم" });
  mocks.getTransferOwners.mockResolvedValue({ items: OWNERS, note_fa: "فقط ضمائم" });
  mocks.createExportPreview.mockResolvedValue(EXPORT_PREVIEW);
  mocks.downloadExportPackage.mockResolvedValue({ filename: `attachments-${OP.slice(0, 8)}.zip`, size: 4096, sha256: "c".repeat(64) });
  mocks.createImportPreview.mockResolvedValue(IMPORT_PREVIEW);
  mocks.getImportPreview.mockResolvedValue(IMPORT_PREVIEW);
  mocks.updateImportMappings.mockResolvedValue({
    ...IMPORT_PREVIEW,
    version: 2,
    phase: "approval",
    mapping_sha256: "2".repeat(64),
    preview_sha256: "3".repeat(64),
    approval: { ...IMPORT_PREVIEW.approval, approval_invalidated: true, current_mapping_sha256: "2".repeat(64), current_preview_sha256: "3".repeat(64) },
  });
  mocks.checkImportExecutionGate.mockResolvedValue("اجرای ورود مسدود است: تأیید مستقل شخص دوم ثبت نشده است.");
  mocks.cancelTransferOperation.mockResolvedValue({ operation_id: OP, status: "cancelled", note_fa: "پیشنمایش لغو شد؛ سابقه حفظ شد." });
  mocks.getTransferHistory.mockResolvedValue({ items: [HISTORY_ITEM], note_fa: "بدون اطلاعات زیرساخت" });
  mocks.getTransferOperationDetail.mockResolvedValue({ ...HISTORY_ITEM, manifest: EXPORT_PREVIEW.manifest, note_fa: "فقط ضمائم" });
});

describe("TASK-PM-02-C4 — مرکز انتقال ضمائم (RTL و کنترلهای واقعی)", () => {
  it("صدور: انواع/رکوردها، جستوجو، پیشنمایش،manifest و دانلود امن", async () => {
    render(<AttachmentTransferCenter />);
    await screen.findByText("فاکتور نمونه");
    expect(screen.getByText(/تنها هشت نوع مالک مصوب/)).toBeTruthy();

    const search = screen.getByLabelText("جستوجوی شماره/عنوان رکورد") as HTMLInputElement;
    fireEvent.change(search, { target: { value: "INV" } });
    await waitFor(() => expect(search.value).toBe("INV"));
    fireEvent.click(screen.getByRole("button", { name: "جستوجو" }));
    await waitFor(() => expect(mocks.getTransferOwners.mock.calls.some((call) => call[1] === "INV")).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "پاک کردن" }));
    await screen.findByText("فاکتور نمونه");

    fireEvent.click(screen.getByRole("checkbox", { name: /انتخاب فاکتور فروش INV-1/ }));
    fireEvent.click(screen.getByRole("button", { name: /پیشنمایش و ساخت/ }));
    await screen.findByText("۳. محتوای بسته و اندازهٔ تخمینی");
    expect(screen.getByText("عکس.png")).toBeTruthy();
    expect(screen.getByText("اندازهٔ تخمینی بسته")).toBeTruthy();
    expect(screen.getByText(/۴٬۰۹۶|4,096|4096/)).toBeTruthy();
    expect(mocks.createExportPreview).toHaveBeenCalledWith([{ owner_type: "invoice", owner_id: OWNER_A }]);

    fireEvent.click(screen.getByRole("button", { name: "دانلود امن بستهٔ ZIP" }));
    await waitFor(() => expect(mocks.downloadExportPackage).toHaveBeenCalledWith(OP));
    expect(await screen.findByText(/بسته «attachments-/)).toBeTruthy();
    expect(screen.getByText(/بدون URL امضاشده/)).toBeTruthy();
  });

  it("ورود: پیشنمایش امن، نگاشت، بیاعتباری تأیید، دروازهٔ اجرا و لغو", async () => {
    render(<AttachmentTransferCenter />);
    await screen.findByText("مرکز انتقال ضمائم چندموجودیتی");
    fireEvent.click(screen.getByRole("tab", { name: "مرکز ورود" }));

    const file = new File(["zip"], "attachments.zip", { type: "application/zip" });
    fireEvent.change(screen.getByLabelText("فایل بستهٔ ZIP"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "بارگذاری و پیشنمایش" }));
    await screen.findByText("۳. بازرسیmanifest و نتیجهٔ کامل فایلها");
    expect(screen.getByText(/تأیید دونفره: مسدود/)).toBeTruthy();
    expect(screen.getByText(/FINGERPRINT_FIELDS/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /اجرای ورود/ })).toBeNull();
    expect(mocks.createImportPreview).toHaveBeenCalledWith(file);

    const mappingSelect = screen.getByLabelText("رکورد مالک موجود") as HTMLSelectElement;
    fireEvent.change(mappingSelect, { target: { value: OWNER_B } });
    await waitFor(() => expect(mappingSelect.value).toBe(OWNER_B));
    fireEvent.click(screen.getByRole("button", { name: "اعمال نگاشت و پیشنمایش تازه" }));
    await waitFor(() => expect(mocks.updateImportMappings).toHaveBeenCalledWith(OP, [{ path: PATH, owner_id: OWNER_B }]));
    expect(await screen.findByText(/تأیید پیشین بیاعتبار است/)).toBeTruthy();
    expect(screen.getByText("بله")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "بررسی دروازهٔ اجرا" }));
    await waitFor(() => expect(mocks.checkImportExecutionGate).toHaveBeenCalledWith(OP));
    expect(await screen.findByText(/تأیید مستقل شخص دوم/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "بازخوانی پیشنمایش" }));
    await waitFor(() => expect(mocks.getImportPreview).toHaveBeenCalledWith(OP));
    fireEvent.click(screen.getByRole("button", { name: "لغو پیشنمایش" }));
    await waitFor(() => expect(mocks.cancelTransferOperation).toHaveBeenCalledWith(OP));
    expect(await screen.findByText(/پیشنمایش لغو شد/)).toBeTruthy();
  });

  it("خطا و تلاش دوباره در بارگذاری بسته", async () => {
    mocks.createImportPreview
      .mockRejectedValueOnce(new Error("امضای بسته همخوانی ندارد."))
      .mockResolvedValueOnce(IMPORT_PREVIEW);
    render(<AttachmentTransferCenter />);
    fireEvent.click(screen.getByRole("tab", { name: "مرکز ورود" }));
    const file = new File(["zip"], "attachments.zip", { type: "application/zip" });
    fireEvent.change(screen.getByLabelText("فایل بستهٔ ZIP"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "بارگذاری و پیشنمایش" }));
    expect(await screen.findByText("امضای بسته همخوانی ندارد.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
    expect(await screen.findByText(/بسته بازرسی/)).toBeTruthy();
    expect(mocks.createImportPreview).toHaveBeenCalledTimes(2);
  });

  it("تاریخچه: حالت خالی، خطا/تلاش دوباره، جزئیات و خطای امن", async () => {
    mocks.getTransferHistory
      .mockResolvedValueOnce({ items: [], note_fa: "خالی" })
      .mockRejectedValueOnce(new Error("تاریخچه در دسترس نیست."))
      .mockResolvedValueOnce({ items: [HISTORY_ITEM], note_fa: "بدون اطلاعات زیرساخت" });
    render(<AttachmentTransferCenter />);
    fireEvent.click(screen.getByRole("tab", { name: "تاریخچه و ممیزی" }));
    expect(await screen.findByText("عملیاتی ثبت نشده است")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "تازهمسازی" }));
    expect(await screen.findByText("تاریخچه در دسترس نیست.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
    expect(await screen.findByText("اپراتور تست")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "نمایش" }));
    expect(await screen.findByText(/تأیید مستقل شخص دوم/)).toBeTruthy();
    expect(screen.getByText("رویدادهای ممیزی")).toBeTruthy();
    expect(screen.getByText(/بدون کلید استوریج و URL/)).toBeTruthy();
    expect(mocks.getTransferOperationDetail).toHaveBeenCalledWith(OP);
  });

  it("مرزها: مالکهای نامجاز، Receipt/POD و G-13 صریحاً مستنداند", async () => {
    render(<AttachmentTransferCenter />);
    await screen.findByText("مرزها و وابستگیها");
    const text = document.body.textContent ?? "";
    expect(text).toContain("برند، دستهبندی، انبار، واحد اندازهگیری");
    expect(text).toContain("صفحهای کاربری");
    expect(text).toContain("G-13");
    expect(text).toContain("C1");
    expect(text).toContain("C2");
    expect(text).toContain("C3");
  });
});
