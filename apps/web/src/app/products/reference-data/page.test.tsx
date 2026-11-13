import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ReferenceDataPage from "./page";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  canWrite: false,
  canView: true,
}));

vi.mock("@/lib/api", () => ({
  api: { GET: mocks.get, POST: mocks.post, PATCH: mocks.patch, DELETE: mocks.delete },
  getToken: () => "token",
}));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    isLoading: false,
    hasPermission: (permission: string) =>
      permission === "master.product.view" ? mocks.canView : mocks.canWrite,
  }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/AppShell", () => ({ AppLoader: () => <div>در حال بارگذاری…</div> }));

const BRAND = {
  id: "b1", code: "GR", name: "برند سبز", name_latin: "Green",
  is_active: true, product_count: 0,
};
const UNIT = {
  id: "u1", code: "kg", title: "کیلوگرم", symbol: "kg", title_latin: "Kilogram",
  decimal_places: 2, is_active: true, product_count: 0, packaging_count: 0,
};
const CATS = [
  { id: "root", code: "ROOT", name: "ریشه C2", parent_id: null, is_active: true, product_count: 1, child_count: 1 },
  { id: "child", code: "CHILD", name: "فرزند C2", parent_id: "root", is_active: true, product_count: 0, child_count: 0 },
  { id: "target", code: "TARGET", name: "دسته مقصد", parent_id: null, is_active: true, product_count: 0, child_count: 0 },
];
const EVENT = {
  id: "a1", action: "create", entity_type: "brand", entity_id: "b1",
  actor_user_id: "actor1", at: "2026-11-07T10:00:00.000Z",
  before_data: null, after_data: { name: "برند سبز" },
};

const okGet = async (path: string) => {
  if (path === "/reference-data/brands") return { data: { items: [BRAND], total: 1, limit: 20, offset: 0 } };
  if (path === "/reference-data/units") return { data: { items: [UNIT], total: 1, limit: 20, offset: 0 } };
  if (path === "/reference-data/categories") return { data: { items: CATS, total: CATS.length, limit: 200, offset: 0 } };
  if (path === "/reference-data/history") return { data: { items: [EVENT], total: 1, limit: 20, offset: 0 } };
  if (path === "/reference-data/brands/{id}") return { data: { ...BRAND, usage_count: 0, products: [] } };
  if (path === "/reference-data/units/{id}") return { data: { ...UNIT, usage_count: 0, products: [] } };
  if (path === "/reference-data/categories/{id}") return { data: { ...CATS[0], ancestors: [], children: [], products: [] } };
  return { data: { items: [], total: 0, limit: 20, offset: 0 } };
};

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.canWrite = false;
  mocks.canView = true;
  mocks.get.mockImplementation(okGet);
  mocks.post.mockResolvedValue({ data: { ...BRAND, id: "b-new" } });
  mocks.patch.mockResolvedValue({ data: BRAND });
  mocks.delete.mockResolvedValue({ data: { deleted: true, message_fa: "حذف شد." } });
});

describe("TASK-PM-02-C2 — صفحهٔ مدیریت دادههای مرجع", () => {
  it("نشست فقطخواندنی، فهرست و جزئیات را میبیند ولی کنترلهای نوشتن را نمیبیند", async () => {
    render(<ReferenceDataPage />);
    await screen.findByText("برند سبز");
    expect(screen.queryByRole("button", { name: "ثبت برند" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ویرایش" })).toBeNull();
    expect(screen.queryByRole("button", { name: "حذف" })).toBeNull();
    expect(screen.getByRole("button", { name: "جزئیات" })).toBeTruthy();
    expect(screen.getByText(/این نشست فقط دسترسی خواندن/)).toBeTruthy();
  });

  it("نبود مجوز مشاهده، پیام صریح و فارسی میدهد", async () => {
    mocks.canView = false;
    render(<ReferenceDataPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("مجوز مشاهدهٔ دادههای مرجع را ندارید.");
  });

  it("ساخت برند از فرم، قرارداد POST و پیام موفقیت را بهکار میاندازد", async () => {
    mocks.canWrite = true;
    render(<ReferenceDataPage />);
    await screen.findByLabelText(/کد \(لاتین\)/);
    fireEvent.change(screen.getByLabelText(/کد \(لاتین\)/), { target: { value: "NEW" } });
    fireEvent.change(screen.getByLabelText("نام *"), { target: { value: "برند تازه" } });
    fireEvent.click(screen.getByRole("button", { name: "ثبت برند" }));
    await waitFor(() =>
      expect(mocks.post).toHaveBeenCalledWith(
        "/reference-data/brands",
        expect.objectContaining({
          body: expect.objectContaining({ code: "NEW", name: "برند تازه", is_active: true }),
        }),
      ),
    );
    await screen.findByText("برند جدید ثبت شد.");
  });

  it("حذف برند نیازمند تأیید صریح است و سپس DELETE صدا زده میشود", async () => {
    mocks.canWrite = true;
    render(<ReferenceDataPage />);
    await screen.findByText("برند سبز");
    fireEvent.click(screen.getByRole("button", { name: "حذف" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/قابل بازگشت نیست/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "تأیید حذف" }));
    await waitFor(() =>
      expect(mocks.delete).toHaveBeenCalledWith(
        "/reference-data/brands/{id}",
        expect.objectContaining({ params: { path: { id: "b1" } } }),
      ),
    );
    await screen.findByText("برند حذف شد.");
  });

  it("دقت اعشار واحد خارج از ۰..۴ پیش از ارسال به سرور رد میشود (D3)", async () => {
    mocks.canWrite = true;
    render(<ReferenceDataPage />);
    fireEvent.click(screen.getByRole("tab", { name: "واحدهای اندازهگیری" }));
    await screen.findByText("کیلوگرم");
    fireEvent.change(screen.getByLabelText(/کد \(لاتین کوچک\)/), { target: { value: "lt" } });
    fireEvent.change(screen.getByLabelText("عنوان *"), { target: { value: "لیتر" } });
    fireEvent.change(screen.getByLabelText("دقت اعشار (۰..۴)"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "ثبت واحد" }));
    expect(await screen.findByText(/دقت اعشار باید عدد صحیح بین ۰ و ۴/)).toBeTruthy();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("سلسلهمراتب RTL و حذف امن با انتساب اجباری وابستگان کار میکند", async () => {
    mocks.canWrite = true;
    render(<ReferenceDataPage />);
    fireEvent.click(screen.getByRole("tab", { name: "دستهبندیها" }));
    await screen.findByText(/فهرست درختی دستهبندیها/);
    expect(screen.getAllByText("ریشه C2").length).toBeGreaterThan(0);
    expect(screen.getByText(/سطح ۱/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "حذف با انتساب…" }));
    const dialog = await screen.findByRole("dialog");
    const target = within(dialog).getByLabelText(/انتقال زیردستهها/);
    expect(
      (within(dialog).getByRole("button", { name: "تأیید حذف" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(target, { target: { value: "target" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "تأیید حذف" }));
    await waitFor(() =>
      expect(mocks.delete).toHaveBeenCalledWith(
        "/reference-data/categories/{id}",
        expect.objectContaining({
          params: expect.objectContaining({ query: { reassign_to: "target" } }),
        }),
      ),
    );
    await screen.findByText("دستهبندی با انتساب ایمن وابستگان حذف شد.");
  });

  it("تاریخچهٔ ممیزی قابل فیلتر است و تبها با کلید جهتدار جابهجا میشوند", async () => {
    render(<ReferenceDataPage />);
    const tablist = screen.getByRole("tablist");
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "واحدهای اندازهگیری" }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("tab", { name: "تاریخچهٔ تغییرات" }));
    await screen.findByText("ایجاد");
    expect(screen.getAllByText("برند").length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("نوع موجودیت"), { target: { value: "uom" } });
    await waitFor(() =>
      expect(mocks.get).toHaveBeenCalledWith(
        "/reference-data/history",
        expect.objectContaining({
          params: expect.objectContaining({
            query: expect.objectContaining({ entity_type: "uom" }),
          }),
        }),
      ),
    );
  });
});
