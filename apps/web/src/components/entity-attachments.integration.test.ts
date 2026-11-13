import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * TASK-PM-02-C3 — شاهد REAL wiring (نه اسکرینشات ساختگی): پنج صفحهٔ مدیریت
 * واقعی باید همان جزء مشترک را با `ownerType` درست سوار کرده باشند. این تست
 * منبع را میخواند تا ادعای «چند موجودیت سرتاسری» صرفاً ادعا نباشد.
 */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string =>
  readFileSync(path.resolve(HERE, rel), "utf8");

const PAGES: { rel: string; ownerType: string; hook: string }[] = [
  { rel: "../app/orders/[id]/page.tsx", ownerType: "sales_order", hook: "Attachments" },
  { rel: "../app/invoices/page.tsx", ownerType: "invoice", hook: "EntityAttachmentLauncher" },
  { rel: "../app/returns/page.tsx", ownerType: "return_request", hook: "EntityAttachments" },
  { rel: "../app/stock-count/page.tsx", ownerType: "stock_count", hook: "EntityAttachmentLauncher" },
  { rel: "../app/gl/inner.tsx", ownerType: "journal_entry", hook: "EntityAttachments" },
];

describe("TASK-PM-02-C3 — اتصال واقعی پنج ماژول به قابلیت مشترک ضمائم", () => {
  it("هر صفحه دقیقاً همان ownerType مصوب خود را به جزء مشترک میدهد", () => {
    for (const p of PAGES) {
      const src = read(p.rel);
      expect(src, p.rel).toContain(p.hook);
      expect(src, `${p.rel} missing ownerType`).toContain(`ownerType="${p.ownerType}"`);
      // صفحهٔ سفارش از نگهدارندهٔ سازگاری `Attachments` و بقیه مستقیم از
      // جزء مشترک استفاده میکنند؛ هر دو به یک پیادهسازی ختم میشوند.
      expect(
        src.includes("@/components/EntityAttachments") || src.includes("@/components/Attachments"),
        `${p.rel} must import the shared component`,
      ).toBe(true);
    }
    // صفحهٔ جزئیات سفارش از نگهدارندهٔ سازگاری `Attachments` استفاده میکند.
    expect(read("../app/orders/[id]/page.tsx")).toContain('from "@/components/Attachments"');
  });

  it("نگهدارندهٔ قدیمی فقط به جزء مشترک واگذار میکند (بدون تکرار منطق)", () => {
    const wrapper = read("./Attachments.tsx");
    const wrapperCode = wrapper.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(wrapperCode).toContain("EntityAttachments");
    expect(wrapperCode).not.toContain("useMutation");
    expect(wrapperCode).not.toContain("uploadAttachment");
    expect(wrapperCode).not.toContain("fetch(");
  });

  it("ناوبری واحد، مرکز اسناد و مسیرهای پنج ماژول", () => {
    const nav = read("../lib/navigation.ts");
    expect(nav).toContain("/attachments-center");
    expect(nav).toContain("مرکز اسناد و ضمائم");
    const hub = read("../app/attachments-center/page.tsx");
    for (const href of ["/orders", "/invoices", "/returns", "/stock-count", "/gl"]) {
      expect(hub, `hub missing ${href}`).toContain(`href: "${href}"`);
    }
  });

  it("آپلود پیشرفت واقعی XHR دارد و هیچ فیلد مالکیتی ارسال نمیکند", () => {
    const apiLib = read("../lib/api.ts");
    expect(apiLib).toContain("xhr.upload.onprogress");
    expect(apiLib).toContain("/entity-attachments/${encodeURIComponent(ownerType)}");
    const fn = apiLib.slice(apiLib.indexOf("export async function uploadEntityAttachment"));
    expect(fn.slice(0, fn.indexOf("export type UploadedProductMedia"))).not.toContain("fd.append('owner_type'");
  });

  it("هیچ کنترل حذف/بایگانی/انتخاب تصویر اصلی/نگهداشت ساخته نشده است", () => {
    const component = read("./EntityAttachments.tsx");
    // توضیحات بالای فایل این ممنوعیتها را نام میبرند؛ فقط کد اجرایی سنجیده شود.
    const code = component.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const forbidden of ["حذف ضمیمه", "بایگانی", "انتخاب تصویر اصلی", "سیاست نگهداشت:", "is_primary", "sort_order", "DELETE"]) {
      expect(code, `forbidden control: ${forbidden}`).not.toContain(forbidden);
    }
    // فقط دکمههای واقعی: تازهسازی، بارگذاری، پیوند تازه، دانلود
    expect(component).toContain("دانلود / پیشنمایش");
    expect(component).toContain("پیوند تازه");
    expect(component).toContain("<ProgressBar");
    // جزء ProgressBar کتابخانهٔ UI خودش role استاندارد progressbar دارد.
    expect(read("./ui/Feedback.tsx")).toContain('role="progressbar"');
  });
});
