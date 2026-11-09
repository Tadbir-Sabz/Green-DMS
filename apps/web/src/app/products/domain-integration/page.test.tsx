import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import DomainIntegrationPage from "./page";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  isLoading: false,
  canView: true,
  canWrite: false,
}));

vi.mock("@/lib/api", () => ({ api: { GET: mocks.get } }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    isLoading: mocks.isLoading,
    hasPermission: (permission: string) =>
      permission === "master.product.view"
        ? mocks.canView
        : permission === "master.product.update"
          ? mocks.canWrite
          : false,
  }),
}));

const status = {
  available: false,
  authority_registered: false,
  code: "domain_identity_unresolved",
  message_fa: "هویت دامنه عملیاتی و مرز اختیار آن تعریف نشده است.",
  decision_document:
    "docs/product-inventory/TASK-PM-01B_DOMAIN_OWNER_DECISIONS.md",
  decision_document_url:
    "https://github.com/Tadbir-Sabz/Green-DMS/blob/arena/be5eaff3-green-dms/docs/product-inventory/TASK-PM-01B_DOMAIN_OWNER_DECISIONS.md",
  owner_decisions: [
    { id: "PM-B1", title: "Domain identifier and ownership" },
    { id: "PM-B8", title: "Cross-domain product detail and history visibility" },
  ],
  technical_contract: [
    "stable company-scoped identity and lifecycle",
    "server-side actor-to-domain authorization resolution",
  ],
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.isLoading = false;
  mocks.canView = true;
  mocks.canWrite = false;
  mocks.get.mockResolvedValue({ data: status });
});

describe("Persian RTL operational-domain integration decision screen", () => {
  it("loads the real contract and shows all blocked workflows without fake domain controls", async () => {
    render(<DomainIntegrationPage />);
    await screen.findByText("شناسه و مالکیت دامنه");
    expect(mocks.get).toHaveBeenCalledWith("/product-domain-integration");
    expect(screen.getByRole("heading", { name: "اتصال کاتالوگ به دامنه عملیاتی" })).toBeTruthy();
    expect(screen.getAllByText("مسدود")).toHaveLength(5);
    expect(screen.getByRole("link", { name: "سند تصمیمهای مالک" })).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText("دامنه الف")).toBeNull();
    expect(screen.getAllByText(/فعال بودن مرکزی/).length).toBeGreaterThan(0);
  });

  it("shows a permission state and sends no domain request without view permission", async () => {
    mocks.canView = false;
    render(<DomainIntegrationPage />);
    await screen.findByText("دسترسی به وضعیت اتصال مجاز نیست");
    expect(mocks.get).not.toHaveBeenCalled();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("shows a session-loading state without issuing a request", async () => {
    mocks.isLoading = true;
    render(<DomainIntegrationPage />);
    await screen.findByText("در حال بررسی مجوز نشست…");
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("shows an actionable error and retries through the same API contract", async () => {
    mocks.get.mockRejectedValueOnce(new Error("offline"));
    mocks.get.mockResolvedValueOnce({ data: status });
    render(<DomainIntegrationPage />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
    await screen.findByText("شناسه و مالکیت دامنه");
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("shows an empty state rather than inventing decisions or technical readiness", async () => {
    mocks.get.mockResolvedValue({
      data: { ...status, owner_decisions: [], technical_contract: [] },
    });
    render(<DomainIntegrationPage />);
    await screen.findByText("فهرست تصمیمها در پاسخ سرور خالی است.");
    expect(screen.getByText("فهرست پیشنیازهای فنی در پاسخ سرور خالی است.")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
