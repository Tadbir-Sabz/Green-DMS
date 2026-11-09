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
  it("shows domain integration refusal, never a fabricated membership switch", async () => {
    get.mockResolvedValue({
      data: { available: false, message_fa: "هویت دامنه تعیین نشده است." },
    });
    render(<DomainIntegrationStatus />);
    await screen.findByText("هویت دامنه تعیین نشده است.");
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(get).toHaveBeenCalledWith("/product-domain-integration");
  });
});
