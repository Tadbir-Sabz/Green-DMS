import { describe, expect, it } from "vitest";
import { cn, conflictKey } from "./cn";

/**
 * آزمون‌های cn — این تابع زیربنای کل سیستم طراحی است.
 *
 * رفتار کلیدی: از میان کلاس‌های «هم‌خانواده» آخرین کلاس برنده است، و کلاس‌هایی
 * که ویژگی متفاوتی تنظیم می‌کنند (مثل اندازهٔ متن در برابر رنگ متن) هر دو
 * نگه داشته می‌شوند. اگر این قاعده بشکند، override کردن کلاس جزء از صفحه
 * (مثلاً `<Input className="border-warning" />`) به‌صورت تصادفی کار می‌کند.
 */
describe("cn — ورودی‌ها", () => {
  it("رشته‌ها را می‌پیوندد", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("مقادیر تهی و دروغین را نادیده می‌گیرد", () => {
    expect(cn(null, undefined, false, "", "a", 0)).toBe("a");
  });

  it("آبجکت شرطی را پشتیبانی می‌کند", () => {
    expect(cn({ "bg-brand": true, "text-white": false }, "p-2")).toBe("bg-brand p-2");
  });

  it("آرایهٔ تودرتو را صاف می‌کند", () => {
    expect(cn(["a", ["b", null], "c"])).toBe("a b c");
  });

  it("فاصله‌های اضافی و تکراری را حذف می‌کند", () => {
    expect(cn("  a   b ", "b")).toBe("a b");
  });
});

describe("cn — آخرین کلاس هم‌خانواده برنده است", () => {
  it("padding", () => {
    expect(cn("p-4", "p-2")).toBe("p-2");
    expect(cn("px-3", "px-2.5")).toBe("px-2.5");
  });

  it("ارتفاع و عرض", () => {
    expect(cn("h-10", "h-8.5")).toBe("h-8.5");
    expect(cn("w-full", "w-auto")).toBe("w-auto");
    expect(cn("w-full", "w-44")).toBe("w-44");
  });

  it("رنگ حاشیه در برابر رنگ حاشیه", () => {
    expect(cn("border-line", "border-warning")).toBe("border-warning");
    expect(cn("border-danger", "border-line")).toBe("border-line");
  });

  it("رنگ پس‌زمینه و رنگ متن", () => {
    expect(cn("bg-surface", "bg-brand-soft")).toBe("bg-brand-soft");
    expect(cn("text-ink", "text-danger-ink")).toBe("text-danger-ink");
  });

  it("گردی", () => {
    expect(cn("rounded-lg", "rounded-2xl")).toBe("rounded-2xl");
  });

  it("display و position", () => {
    expect(cn("hidden", "flex")).toBe("flex");
    expect(cn("relative", "absolute")).toBe("absolute");
  });

  it("جای آخرین کلاس در خروجی حفظ می‌شود", () => {
    expect(cn("flex items-center gap-2", "gap-3")).toBe("flex items-center gap-3");
    expect(cn("mt-1 mb-2", "mt-3")).toBe("mb-2 mt-3");
  });
});

describe("cn — کلاس‌های غیرهم‌خانواده هر دو می‌مانند", () => {
  it("ضخامت حاشیه در برابر رنگ حاشیه", () => {
    expect(cn("border-2", "border-line")).toBe("border-2 border-line");
  });

  it("اندازهٔ متن در برابر رنگ متن", () => {
    expect(cn("text-sm", "text-ink")).toBe("text-sm text-ink");
  });

  it("اندازهٔ دلخواه متن، اندازه است نه رنگ", () => {
    expect(conflictKey("text-[13px]")).toBe("text-size");
    expect(cn("text-sm", "text-[13px]")).toBe("text-[13px]");
    expect(cn("text-[13px]", "text-ink")).toBe("text-[13px] text-ink");
  });

  it("تراز متن در برابر رنگ متن", () => {
    expect(cn("text-start", "text-ink")).toBe("text-start text-ink");
    expect(cn("text-start", "text-end")).toBe("text-end");
  });

  it("p و px خانواده‌های جدا هستند", () => {
    expect(cn("p-4", "px-2")).toBe("p-4 px-2");
  });

  it("گردی کل در برابر گردی یک گوشه", () => {
    expect(cn("rounded-lg", "rounded-t-xl")).toBe("rounded-lg rounded-t-xl");
  });
});

describe("cn — واریانت‌ها مستقل‌اند", () => {
  it("hover یک پس‌زمینهٔ ساده را حذف نمی‌کند", () => {
    expect(cn("bg-surface", "hover:bg-brand")).toBe("bg-surface hover:bg-brand");
  });

  it(" breakpoint متفاوت، خانوادهٔ متفاوت", () => {
    expect(cn("p-2", "md:p-4")).toBe("p-2 md:p-4");
    expect(cn("md:p-4", "md:p-2")).toBe("md:p-2");
  });

  it("rtl/dark و چند واریانت پشت‌سرهم", () => {
    expect(cn("rtl:rotate-180", "rotate-90")).toBe("rtl:rotate-180 rotate-90");
    expect(cn("md:hover:bg-brand", "md:hover:bg-danger")).toBe("md:hover:bg-danger");
  });

  it("کلاس‌های با اصلاح‌گر شفافیت (/) هم‌خانواده‌اند", () => {
    expect(cn("bg-surface", "bg-surface-alt/60")).toBe("bg-surface-alt/60");
  });
});

describe("cn — سناریوی واقعی اجزای طراحی", () => {
  it("override کردن رنگ حاشیهٔ Input از صفحه", () => {
    const CONTROL = "w-full rounded-lg border border-line bg-surface text-sm text-ink focus-ring";
    // border-line و text-sm حذف می‌شوند چون border-warning و text-[13px] جای آن‌ها را می‌گیرند
    expect(cn(CONTROL, "h-8.5 px-2.5 text-[13px]", "border-line", "border-warning")).toBe(
      "w-full rounded-lg border bg-surface text-ink focus-ring h-8.5 px-2.5 text-[13px] border-warning",
    );
  });

  it("کلاس‌های ناشناس دست‌نخورده می‌مانند و تکراری به آخرین جای خودش می‌رود", () => {
    expect(cn("skeleton", "tnum", "no-scrollbar", "tnum")).toBe("skeleton no-scrollbar tnum");
  });
});
