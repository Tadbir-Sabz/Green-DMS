import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ReferenceSelectors, type ReferenceSelection } from "./reference-selectors";

const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { GET: mocks.get } }));

const cat = (id: string, code: string, name: string, parent_id: string | null = null, is_active = true) => ({
  id, code, name, parent_id, is_active, product_count: 0, child_count: 0,
});
const unit = (id: string, code: string, title: string, is_active = true) => ({
  id, code, title, decimal_places: 2, symbol: "kg", title_latin: "Kg", is_active,
});
const brand = (id: string, code: string, name: string, is_active = true) => ({
  id, code, name, name_latin: "Green", is_active, product_count: 0,
});
const list = (items: unknown[]) => ({ data: { items, total: items.length, limit: 200, offset: 0 } });

const ok = (path: string) => {
  if (path === "/reference-data/categories") return list([cat("c1", "ROOT", "ریشه"), cat("c2", "CHILD", "فرزند", "c1")]);
  if (path === "/reference-data/units") return list([unit("u1", "kg", "کیلوگرم"), unit("u2", "old", "واحد قدیمی", false)]);
  if (path === "/reference-data/brands") return list([brand("b1", "GR", "برند سبز"), brand("b2", "OLD", "برند قدیمی", false)]);
  return list([]);
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockImplementation(async (path: string) => ok(path));
});

describe("TASK-PM-02-C2 — انتخابگرهای مرجع فرم کالا", () => {
  it("حالت ساخت فقط مراجع فعال را میگیرد و پیشفرضهای نخستین گروه/واحد را تنظیم میکند", async () => {
    const onChange = vi.fn();
    render(
      <ReferenceSelectors
        mode="create"
        value={{ category_id: "", base_uom_id: "", brand_id: "" }}
        onChange={onChange}
      />,
    );
    await screen.findByLabelText("برند");
    const calls = mocks.get.mock.calls as [string, { params?: { query?: Record<string, unknown> } }][];
    expect(calls).toHaveLength(3);
    for (const [path, opts] of calls) {
      expect(path).toMatch(/^\/reference-data\/(categories|units|brands)$/);
      expect(opts?.params?.query?.is_active).toBe(true);
      expect(opts?.params?.query?.limit).toBe(200);
    }
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ category_id: "c1", base_uom_id: "u1", brand_id: "" }),
      ),
    );
    expect((screen.getByLabelText("گروه کالا") as HTMLSelectElement).value).toBe("c1");
    expect(screen.getByText(/فقط مراجع فعال قابلانتخاباند/)).toBeTruthy();
  });

  it("حالت ویرایش مقدار تاریخی غیرفعال را نشان میدهد ولی گزینههای غیرفعال دیگر را قفل میکند", async () => {
    const onChange = vi.fn();
    const value: ReferenceSelection = { category_id: "c2", base_uom_id: "u2", brand_id: "b2" };
    render(<ReferenceSelectors mode="edit" value={value} onChange={onChange} />);
    const brandSelect = (await screen.findByLabelText("برند")) as HTMLSelectElement;
    const calls = mocks.get.mock.calls as [string, { params?: { query?: Record<string, unknown> } }][];
    for (const [, opts] of calls) expect(opts?.params?.query?.is_active).toBeUndefined();
    const options = Array.from(brandSelect.options);
    expect(brandSelect.value).toBe("b2");
    expect(options.find((o) => o.value === "b2")?.disabled).toBe(false);
    expect(options.find((o) => o.value === "b2")?.textContent).toContain("غیرفعال");
    expect(options.find((o) => o.value === "b1")?.disabled).toBe(false);
    const unitSelect = screen.getByLabelText("واحد پایه") as HTMLSelectElement;
    expect(Array.from(unitSelect.options).find((o) => o.value === "u1")?.disabled).toBe(false);
    expect(Array.from(unitSelect.options).find((o) => o.value === "u2")?.textContent).toContain("غیرفعال");
  });

  it("خطا، تلاش مجدد و پیوند مدیریت، همگی عملیاند", async () => {
    mocks.get.mockImplementation(async () => { throw new Error("network down"); });
    render(
      <ReferenceSelectors
        mode="create"
        value={{ category_id: "c1", base_uom_id: "u1", brand_id: "" }}
        onChange={vi.fn()}
      />,
    );
    await screen.findByRole("alert");
    expect(screen.getByText(/ارتباط با سرور/)).toBeTruthy();
    expect(
      (screen.getByRole("link", { name: "مدیریت دادههای مرجع" }) as HTMLAnchorElement).getAttribute("href"),
    ).toContain("/products/reference-data");
    const before = mocks.get.mock.calls.length;
    mocks.get.mockImplementation(async (path: string) => ok(path));
    fireEvent.click(screen.getByRole("button", { name: "تلاش مجدد" }));
    await waitFor(() => expect(mocks.get.mock.calls.length).toBeGreaterThan(before));
    await screen.findByLabelText("برند");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("نبود گروه/واحد فعال، حالت خالی و راهنمای ثبت را نشان میدهد", async () => {
    mocks.get.mockImplementation(async () => list([]));
    render(
      <ReferenceSelectors
        mode="create"
        value={{ category_id: "", base_uom_id: "", brand_id: "" }}
        onChange={vi.fn()}
      />,
    );
    await screen.findByText("— گروه فعالی ثبت نشده —");
    expect(screen.getByText("— واحد فعالی ثبت نشده —")).toBeTruthy();
    expect(screen.getByRole("link", { name: "از اینجا ثبت کنید" })).toBeTruthy();
  });
});
