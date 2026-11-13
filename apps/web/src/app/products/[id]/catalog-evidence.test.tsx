import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { CatalogHistory, DomainIntegrationStatus } from "./catalog-evidence";
const get = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ api: { GET: get } }));
afterEach(cleanup);
beforeEach(() => get.mockReset());

const domainScope = {
  product_id: "p1",
  scope: "central",
  central_status: "active",
  central_status_label_fa: "فعال (مرکزی)",
  domain_context: "unresolved",
  domain_membership: "unresolved",
  domain_availability: "unresolved",
  available: false,
  state: "domain_identity_unresolved",
  central_status_is_domain_availability: false,
  message_fa:
    "وضعیت مرکزی کالا، وضعیت عرضه در دامنه نیست. تا تصویب هویت دامنه هیچ عضویتی قابل تعیین نیست.",
  decision_document:
    "docs/product-inventory/TASK-PM-01B_DOMAIN_OWNER_DECISIONS.md",
  decision_document_url:
    "https://github.com/Tadbir-Sabz/Green-DMS/blob/arena/be5eaff3-green-dms/docs/product-inventory/TASK-PM-01B_DOMAIN_OWNER_DECISIONS.md",
  owner_decisions: [
    { id: "PM-B1", title: "Domain identifier and ownership" },
    { id: "PM-B2", title: "Domain lifecycle" },
    { id: "PM-B3", title: "Domain listing permissions" },
    { id: "PM-B4", title: "Central versus domain authority" },
    { id: "PM-B5", title: "Membership creation" },
    { id: "PM-B6", title: "Absent product visibility" },
    { id: "PM-B7", title: "Historical retention" },
    { id: "PM-B8", title: "Cross-domain visibility" },
  ],
};

describe("connected Persian catalog evidence", () => {
  it("renders empty history without inventing old events", async () => {
    get.mockResolvedValue({
      data: { items: [], next_cursor: null, has_more: false },
    });
    render(<CatalogHistory productId="p1" />);
    await screen.findByText("هنوز تغییری در تاریخچه جدید ثبت نشده است.");
    expect(get).toHaveBeenCalledWith("/products/{id}/history", {
      params: { path: { id: "p1" }, query: { limit: 30 } },
    });
  });
  it("loads older events with the server cursor and exposes before/after", async () => {
    get
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: "2",
              action: "UPDATE",
              entity_type: "product",
              actor_user_id: "actor",
              at: "2026-11-07T00:00:00Z",
              before_data: { name: "قبل" },
              after_data: { name: "بعد" },
            },
          ],
          next_cursor: "2",
          has_more: true,
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: "1",
              action: "INSERT",
              entity_type: "product",
              at: "2026-11-06T00:00:00Z",
              after_data: { name: "قبل" },
            },
          ],
          next_cursor: null,
          has_more: false,
        },
      });
    render(<CatalogHistory productId="p1" />);
    fireEvent.click(
      await screen.findByRole("button", { name: "رویدادهای قدیمی‌تر" }),
    );
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(get.mock.calls[1][1].params.query).toEqual({
      limit: 30,
      before: "2",
    });
    await screen.findByText("ایجاد · کالا");
    expect(screen.getAllByText("مشاهده داده قبل و بعد")).toHaveLength(2);
  });
  it("surfaces network failure and allows retry", async () => {
    get
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        data: { items: [], next_cursor: null, has_more: false },
      });
    render(<CatalogHistory productId="p1" />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "تازه‌سازی" }));
    await screen.findByText("هنوز تغییری در تاریخچه جدید ثبت نشده است.");
  });
  it("renders central status separately from unresolved domain availability, without fake controls", async () => {
    get.mockResolvedValue({ data: domainScope });
    render(<DomainIntegrationStatus productId="p1" />);
    await screen.findByText("فعال (مرکزی)");
    expect(get).toHaveBeenCalledWith("/products/{id}/domain-scope", {
      params: { path: { id: "p1" } },
    });
    expect(screen.getByText("تعیین نشده")).toBeTruthy();
    expect(screen.getByText(/وضعیت مرکزی کالا، وضعیت عرضه در دامنه نیست/)).toBeTruthy();
    expect(screen.getByText(/فعال بودن مرکزی بهمعنای عرضه در تمام دامنهها نیست/)).toBeTruthy();
    expect(screen.getAllByText("8").length).toBeGreaterThan(0);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByText("دامنه الف")).toBeNull();
  });

  it("keeps domain availability unresolved even when the central lifecycle is blocked", async () => {
    get.mockResolvedValue({
      data: { ...domainScope, central_status: "blocked", central_status_label_fa: "مسدود (مرکزی)" },
    });
    render(<DomainIntegrationStatus productId="p1" />);
    await screen.findByText("مسدود (مرکزی)");
    expect(screen.getByText("تعیین نشده")).toBeTruthy();
    expect(screen.queryByText(/غیرقابلعرضه/)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("surfaces an API error and retries the same authorized endpoint", async () => {
    get
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ data: domainScope });
    render(<DomainIntegrationStatus productId="p1" />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
    await screen.findByText("فعال (مرکزی)");
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(get.mock.calls[1][0]).toBe("/products/{id}/domain-scope");
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("shows an empty state without inventing domain data when the payload is missing", async () => {
    get.mockResolvedValue({ data: null, error: undefined });
    render(<DomainIntegrationStatus productId="p1" />);
    await screen.findByText("پاسخ معتبری دریافت نشد؛ هیچ وضعیت دامنهای فرض نمیشود.");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText("فعال (مرکزی)")).toBeNull();
  });
});
