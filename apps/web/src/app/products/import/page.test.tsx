import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ImportPage from "./page";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  canImport: true,
  isLoading: false,
}));

vi.mock("@/lib/api", () => ({
  api: { GET: mocks.get, POST: mocks.post },
  getToken: () => "token",
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    isLoading: mocks.isLoading,
    hasPermission: (permission: string) =>
      permission === "master.product.import" ? mocks.canImport : false,
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.canImport = true;
  mocks.isLoading = false;
  mocks.post.mockResolvedValue({ data: null, error: undefined });
  mocks.get.mockResolvedValue({ data: null, error: undefined });
});

describe("Persian RTL central product import boundary", () => {
  it("explains that domain membership/availability columns are not central product fields", () => {
    render(<ImportPage />);
    expect(
      screen.getByText(/عضویت، دسترسپذیری، فعالسازی یا شناسه/),
    ).toBeTruthy();
    expect(screen.getByText("domain_id")).toBeTruthy();
    expect(screen.getByText(/وضعیت عرضه در دامنه ویژگی سراسری کالا نیست/)).toBeTruthy();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("shows the permission state without issuing any request", () => {
    mocks.canImport = false;
    render(<ImportPage />);
    expect(screen.getByRole("alert").textContent).toContain("مجوز این عملیات را ندارید");
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("surfaces the server domain_property_rejected refusal instead of silently stripping the column", async () => {
    mocks.post.mockResolvedValue({
      data: null,
      error: {
        code: "domain_property_rejected",
        message_fa:
          "ویژگی عضویت یا دسترسپذیری دامنهای نمیتواند بهعنوان ویژگی سراسری کالا ارسال شود.",
      },
    });
    render(<ImportPage />);
    fireEvent.click(screen.getByRole("button", { name: "درجِ نمونه" }));
    fireEvent.click(
      screen.getByRole("button", { name: "اعتبارسنجی (بدونِ نوشتن)" }),
    );
    await screen.findByText(
      /ویژگی عضویت یا دسترسپذیری دامنهای نمیتواند بهعنوان ویژگی سراسری کالا ارسال شود/,
    );
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post.mock.calls[0][0]).toBe("/products/import/validate");
  });
});
