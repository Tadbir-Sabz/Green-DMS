import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import CatalogHistoryPage from "./page";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  canView: true,
  isLoading: false,
}));

vi.mock("@/lib/api", () => ({ api: { GET: mocks.get } }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    isLoading: mocks.isLoading,
    hasPermission: (permission: string) =>
      permission === "master.product.view" ? mocks.canView : false,
  }),
}));

const productId = "00000000-0000-4000-8000-000000000003";
const familyEvent = {
  id: "20",
  product_id: null,
  entity_type: "product_family",
  entity_id: "00000000-0000-4000-8000-000000000004",
  action: "UPDATE",
  actor_user_id: null,
  at: "2026-11-07T10:00:00Z",
  before_data: { name: "پیشین" },
  after_data: { name: "تازه" },
};
const productEvent = {
  id: "10",
  product_id: productId,
  entity_type: "product",
  entity_id: productId,
  action: "INSERT",
  actor_user_id: "00000000-0000-4000-8000-000000000005",
  at: "2026-11-07T09:00:00Z",
  before_data: null,
  after_data: { code: "P-1", name: "کالای مرکزی" },
};
const emptyPage = { items: [], has_more: false, next_cursor: null };

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.canView = true;
  mocks.isLoading = false;
  mocks.get.mockResolvedValue({ data: emptyPage });
});

describe("Persian RTL company-wide central catalog history", () => {
  it("loads central events, links product evidence and exposes no domain controls", async () => {
    mocks.get.mockResolvedValue({
      data: { ...emptyPage, items: [familyEvent, productEvent] },
    });
    render(<CatalogHistoryPage />);
    expect(await screen.findByText("ویرایش · خانواده کالا")).toBeTruthy();
    expect(mocks.get).toHaveBeenCalledWith("/product-catalog/history", {
      params: { query: { limit: 30 } },
    });
    expect(
      screen.getByRole("link", { name: "مشاهده کالا" }).getAttribute("href"),
    ).toBe(`/products/${productId}`);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("option", { name: /دامنه/ })).toBeNull();
    expect(screen.getAllByText("مشاهده داده قبل و بعد")).toHaveLength(2);
  });

  it("applies the typed central entity and product filters through the real API contract", async () => {
    render(<CatalogHistoryPage />);
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("نوع رویداد"), {
      target: { value: "product_family" },
    });
    fireEvent.change(screen.getByLabelText(/شناسه کالا/), {
      target: { value: productId },
    });
    fireEvent.click(screen.getByRole("button", { name: "اعمال فیلتر" }));
    await waitFor(() =>
      expect(mocks.get).toHaveBeenLastCalledWith("/product-catalog/history", {
        params: {
          query: {
            limit: 30,
            entity_type: "product_family",
            product_id: productId,
          },
        },
      }),
    );
  });

  it("loads older events with the server cursor and never invents data", async () => {
    mocks.get
      .mockResolvedValueOnce({
        data: { items: [familyEvent], has_more: true, next_cursor: "20" },
      })
      .mockResolvedValueOnce({
        data: { items: [productEvent], has_more: false, next_cursor: null },
      });
    render(<CatalogHistoryPage />);
    fireEvent.click(
      await screen.findByRole("button", { name: "رویدادهای قدیمیتر" }),
    );
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
    expect(mocks.get.mock.calls[1][1].params.query).toEqual({
      limit: 30,
      before: "20",
    });
    expect(await screen.findByText("ایجاد · کالا")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "رویدادهای قدیمیتر" })).toBeNull();
  });

  it("surfaces a network error and retries through the same contract", async () => {
    mocks.get
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ data: emptyPage });
    render(<CatalogHistoryPage />);
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره" }));
    await screen.findByText(/هیچ رویداد کاتالوگ مرکزی/);
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
  });

  it("sends no request without view permission", async () => {
    mocks.canView = false;
    render(<CatalogHistoryPage />);
    expect(
      await screen.findByText("دسترسی به تاریخچه کاتالوگ مجاز نیست"),
    ).toBeTruthy();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("waits for session authorization without issuing a request", async () => {
    mocks.isLoading = true;
    render(<CatalogHistoryPage />);
    expect(
      await screen.findByText("در حال بررسی مجوز نشست…"),
    ).toBeTruthy();
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
