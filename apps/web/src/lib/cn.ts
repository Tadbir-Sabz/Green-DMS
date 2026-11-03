/**
 * ترکیب کلاس‌های Tailwind بدون وابستگی خارجی (بدون clsx/tailwind-merge).
 *
 * چرا فقط «چسباندن رشته‌ها» کافی نیست: وقتی صفحه‌ای به یک جزء کلاس جایگزین
 * می‌دهد — مثلاً `<Input className="border-warning" />` — رشتهٔ پایهٔ جزء
 * شامل `border-line` است و هر دو کلاس در خروجی می‌مانند. آن‌وقت برنده را
 * «ترتیب تعریف در CSS تولیدشده» تعیین می‌کند، نه ترتیب کلاس‌ها در HTML؛
 * یعنی رفتاری تصادفی و وابسته به ترتیب توکن‌ها در @theme.
 *
 * این پیاده‌سازی همان قاعدهٔ tailwind-merge را برای خانواده‌های پرکاربرد
 * اعمال می‌کند: از میان کلاس‌های هم‌خانواده، «آخرین» کلاس برنده است و جای
 * خودش را در خروجی حفظ می‌کند. کلاس‌های ناشناس دست‌نخورده می‌مانند (فقط
 * تکراری حذف می‌شود)، پس هیچ رفتار موجودی نمی‌شکند.
 *
 * واریانت‌ها (`hover:`، `md:`، `rtl:` …) بخشی از کلید هستند؛ بنابراین
 * `hover:bg-brand` هرگز `bg-surface` ساده را حذف نمی‌کند.
 */

export type ClassValue =
  | string
  | number
  | null
  | undefined
  | false
  | ClassValue[]
  | Record<string, unknown>;

/** نام توکن‌های رنگِ سیستم طراحی (globals.css) — برای تفکیک رنگ از اندازه */
const COLOR_TOKENS = new Set([
  "transparent", "current", "inherit", "white", "black",
  "canvas", "surface", "surface-alt", "surface-hover", "surface-sunken", "surface-glass",
  "line", "line-strong",
  "ink", "ink-muted", "ink-subtle", "ink-inverse",
  "brand", "brand-hover", "brand-active", "brand-ink", "brand-soft", "brand-soft-ink",
  "brand-soft-hover", "brand-line",
  "success", "success-soft", "success-ink", "success-line",
  "warning", "warning-soft", "warning-ink", "warning-line",
  "danger", "danger-soft", "danger-ink", "danger-line",
  "info", "info-soft", "info-ink", "info-line",
  "neutral-soft", "neutral-ink",
  "on-danger", "on-success", "on-warning", "on-info", "ring",
]);

const NAMED_PALETTES =
  /^(red|blue|green|gray|slate|zinc|neutral|stone|amber|yellow|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|orange)-\d{2,3}$/;

const TEXT_SIZES = /^(xs|sm|base|lg|xl|[2-9]xl)$/;
/** مقدار دلخواشی که «اندازهٔ متن» است نه رنگ: text-[13px]، text-[1.2rem] */
const ARBITRARY_LENGTH = /^\[\d*\.?\d+(px|rem|em|%|ch|vw)\]$/;
const FONT_WEIGHTS = /^(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/;
const DISPLAY =
  /^(block|inline-block|inline|flex|inline-flex|grid|inline-grid|flow-root|table|table-row|table-cell|contents|list-item|hidden)$/;
const POSITION = /^(static|fixed|absolute|relative|sticky)$/;
/** گوشه/ضلع: t r b l x y s e ss se es ee */
const EDGE = "(t|r|b|l|x|y|s|e|ss|se|es|ee)";

/** آیا این مقدار یک رنگ است؟ (اختیاراً با /opacity یا مقدار دلخواه کروشه‌ای) */
function isColorValue(value: string): boolean {
  const base = value.split("/")[0];
  return (
    COLOR_TOKENS.has(base) || base.startsWith("[") || NAMED_PALETTES.test(base)
  );
}

type Rule = [RegExp, (m: RegExpMatchArray) => string];

/**
 * جدول قواعد، به ترتیب اولویت. هر قاعده «خانوادهٔ تعارض» را برمی‌گرداند؛
 * دو کلاس با خانوادهٔ یکسان همدیگر را خنثی می‌کنند و آخرین می‌ماند.
 */
const RULES: Rule[] = [
  // عرض/ارتفاع (پیشوندهای دومسمی باید پیش از تک‌سمی بررسی شوند)
  [/^(w|min-w|max-w|h|min-h|max-h)-/, (m) => m[1]],
  // فاصله‌ها
  [/^(px|py|pt|pb|ps|pe|pl|pr|p|mx|my|mt|mb|ms|me|ml|mr|m)-/, (m) => m[1]],
  [/^(gap-x|gap-y|gap|space-x|space-y)-/, (m) => m[1]],
  [/^(inset-x|inset-y|inset|top|bottom|start|end)-/, (m) => m[1]],
  // حاشیه: ضخامت در برابر رنگ
  [/^border$/, () => "border-width"],
  [/^border-(\d+)$/, () => "border-width"],
  [new RegExp(`^border-${EDGE}(-\\d+)?$`), (m) => `border-width:${m[1]}`],
  [/^border-(.+)$/, (m) => (isColorValue(m[1]) ? "border-color" : `border:${m[1]}`)],
  // گردی
  [/^rounded$/, () => "radius"],
  [/^rounded-(\d?xl|sm|md|lg|full|none|\[[^\]]+\])$/, () => "radius"],
  [new RegExp(`^rounded-${EDGE}-(\\d?xl|sm|md|lg|full|none|\\[[^\\]]+\\])$`), (m) => `radius:${m[1]}`],
  // تایپوگرافی — تراز، اندازه و رنگ سه خانوادهٔ جدا هستند
  [/^text-(start|end|center|left|right|justify)$/, () => "text-align"],
  [/^text-(.+)$/, (m) => {
    const value = m[1].split("/")[0];
    return TEXT_SIZES.test(value) || ARBITRARY_LENGTH.test(value) ? "text-size" : "text-color";
  }],
  [/^font-(.+)$/, (m) => (FONT_WEIGHTS.test(m[1]) ? "font-weight" : "font-family")],
  [/^leading-/, () => "leading"],
  [/^tracking-/, () => "tracking"],
  // رنگ‌ها
  [/^(bg|fill|stroke|from|via|to|ring|outline|divide|accent|caret|decoration|placeholder)-(.+)$/, (m) => `${m[1]}-color`],
  // چیدمان
  [/^(flex-col|flex-row|flex-wrap|flex-nowrap|flex)-/, (m) => m[1]],
  [/^(grid-cols|grid-rows|col-span|row-span|col-start|row-start)-/, (m) => m[1]],
  [/^(items|justify|self|content|place|order|basis|grow|shrink)-?/, (m) => m[1]],
  // متفرقه
  [/^(z|opacity|shadow|cursor|aspect|columns)-?/, (m) => m[1]],
  [/^(absolute|relative|fixed|sticky|static)$/, () => "position"],
];

/** کلید «هم‌خانواده» یک کلاس (بدون واریانت). */
export function conflictKey(utility: string): string {
  const u = utility.startsWith("!") ? utility.slice(1) : utility;
  if (DISPLAY.test(u)) return "display";
  if (POSITION.test(u)) return "position";
  for (const [pattern, key] of RULES) {
    const match = u.match(pattern);
    if (match) return key(match);
  }
  return u;
}

/** جداسازی واریانت‌ها از خودِ کلاس: `md:hover:bg-brand` → «md:hover:» + «bg-brand» */
function splitVariants(token: string): { variants: string; utility: string } {
  const index = token.lastIndexOf(":");
  if (index === -1) return { variants: "", utility: token };
  return { variants: token.slice(0, index + 1), utility: token.slice(index + 1) };
}

export function cn(...inputs: ClassValue[]): string {
  const tokens: string[] = [];

  const walk = (value: ClassValue): void => {
    if (!value) return;
    if (typeof value === "string") {
      for (const token of value.trim().split(/\s+/)) if (token) tokens.push(token);
      return;
    }
    if (typeof value === "number") {
      tokens.push(String(value));
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value === "object") {
      for (const [key, active] of Object.entries(value)) if (active) walk(key);
    }
  };

  for (const input of inputs) walk(input);

  // از انتها به ابتدا: آخرین کلاس هر خانواده برنده است و جای خود را نگه می‌دارد
  const seen = new Set<string>();
  const kept: string[] = [];
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    const { variants, utility } = splitVariants(token);
    const key = `${variants}${conflictKey(utility)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(token);
  }
  kept.reverse();

  return kept.join(" ");
}
