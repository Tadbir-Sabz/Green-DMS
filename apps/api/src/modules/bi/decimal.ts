/**
 * حسابِ «اعشاریِ دقیق» بر پایهٔ BigInt — بدونِ هیچ وابستگیِ خارجی.
 *
 * چرا: مقادیرِ مالی در Postgres از نوعِ numeric هستند و ریپوزیتوری آن‌ها را با ::text
 * بی‌کم‌وکاست به لایهٔ خدمت می‌دهد. تبدیلِ آن رشته‌ها به Number (IEEE-754 double)
 * برای مبالغِ بزرگِ ریالی دقیق نیست: double فقط ۵۳ بیتِ مان티س دارد، یعنی از
 * ۲^۵۳ ≈ ۹٫۰۰۷×۱۰^۱۵ به بعد ارقامِ صحیح از دست می‌روند و جمعِ چند مقدارِ بزرگ
 * می‌تواند آخرین رقم‌ها را تغییر دهد. این ماژول همان رشته‌ها را به اعدادِ
 * مقیاس‌ثابتِ BigInt تبدیل می‌کند تا جمع/تقسیم/گردکردن «دقیق» بماند.
 *
 * قاعدهٔ گردکردن: دقیقاً همانِ round() پیشین در bi.service — یعنی
 * Math.round(x) = floor(x + 0.5) (نیمه به‌بالا، به سمتِ +∞). این ماژول آن قاعده را
 * «بدونِ تغییر» رویِ حسابِ دقیق بازتولید می‌کند؛ نه یک قاعدهٔ گردکردنِ تازه.
 */

/** رقم‌هایِ اعشارِ داخلیِ محاسبات (دقتِ میانی، پیش از گردکردنِ خروجی). */
export const INTERNAL_SCALE = 8;
const FACTOR = 10n ** BigInt(INTERNAL_SCALE);

/** عددِ مقیاس‌ثابت: مقدارِ واقعی × 10^INTERNAL_SCALE */
export type Fixed = bigint;

const PLAIN_DECIMAL = /^([+-]?)(\d*)(?:\.(\d*))?$/;

/**
 * تبدیلِ رشته/عددِ ورودی به Fixed. رشته‌هایِ numericِ پستگرس (مثل «1234567.89»
 * یا «-0.50» یا «.5») پذیرفته می‌شوند. ورودیِ نامعتبر → null (نه پرتاب)،
 * تا مسیرِ گزارش‌گیری با دادهٔ ناقص از کار نیفتد.
 */
export function toFixed(value: string | number | bigint | null | undefined): Fixed | null {
  if (value === null || value === undefined) return null;

  if (typeof value === 'bigint') return value * FACTOR;

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return parseDecimalString(String(value));
  }

  return parseDecimalString(String(value).trim());
}

function parseDecimalString(text: string): Fixed | null {
  const m = PLAIN_DECIMAL.exec(text);
  if (!m) return null;
  const [, sign, intPart, fracPart = ''] = m;
  if (!intPart && !fracPart) return null;

  const digits = (intPart || '0') + fracPart.slice(0, INTERNAL_SCALE).padEnd(INTERNAL_SCALE, '0');
  // اگر اعشارِ ورودی بیش از INTERNAL_SCALE رقم داشت، باقی را برای گردکردنِ دقیق نگه می‌داریم.
  const extra = fracPart.slice(INTERNAL_SCALE);
  let scaled = BigInt(digits);
  if (extra && Number(extra[0]) >= 5) scaled += 1n; // گردکردنِ نیمه‌به‌بالا در مرزِ دقتِ میانی
  return sign === '-' ? -scaled : scaled;
}

/** تقسیمِ کف (floor) — چون تقسیمِ BigInt در JS به سمتِ صفر گِرد می‌شود، نه کف. */
function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b;
  const r = a % b;
  return r !== 0n && (a < 0n) !== (b < 0n) ? q - 1n : q;
}

/**
 * گردکردنِ Fixed به `digits` رقمِ اعشار با قاعدهٔ floor(x + 0.5)
 * (همان Math.round در JS: نیمه به سمتِ +∞).
 */
export function roundToDigits(x: Fixed, digits: number): bigint {
  const drop = BigInt(INTERNAL_SCALE - digits);
  if (drop <= 0n) return x * 10n ** -drop;
  const factor = 10n ** drop;
  const half = factor / 2n; // factor ≥ ۱۰ چون digits < INTERNAL_SCALE
  return floorDiv(x + half, factor);
}

/** قالب‌بندیِ دقیق به رشتهٔ اعشارِ ثابت (مثل toFixed ولی بدونِ خطایِ شناور). */
export function formatFixed(x: Fixed, digits: number): string {
  const rounded = roundToDigits(x, digits);
  const negative = rounded < 0n;
  const abs = negative ? -rounded : rounded;
  const factor = 10n ** BigInt(digits);
  const intPart = abs / factor;
  const fracPart = (abs % factor).toString().padStart(digits, '0');
  const body = digits > 0 ? `${intPart}.${fracPart}` : `${intPart}`;
  // «-0.00» در خروجیِ مالی گمراه‌کننده است؛ صفرِ منفی همان صفر گزارش می‌شود.
  return negative && rounded !== 0n ? `-${body}` : body;
}

/** عددِ گردشده (برای درصدها که دامنهٔ کوچک و امنِ شناور دارند). */
export function roundToNumber(x: Fixed, digits: number): number {
  const rounded = roundToDigits(x, digits);
  return Number(rounded) / 10 ** digits;
}

/** جمعِ دقیقِ Fixedها. */
export function sumFixed(values: Iterable<Fixed>): Fixed {
  let acc = 0n;
  for (const v of values) acc += v;
  return acc;
}

/**
 * تقسیمِ «دقیقِ» گردشده: floor(num/den + 0.5) بدونِ هیچ برشِ میانی.
 *
 * چرا مستقیم تقسیم نمی‌کنیم: تقسیمِ BigInt به سمتِ صفر می‌بُرد، پس اگر ابتدا تقسیم و
 * سپس گرد کنیم، باقیِ کسر از دست می‌رود و در مرزهایِ نیمه (مثلِ ۰٫۱۲۵) نتیجه می‌تواند
 * یک واحدِ آخرین رقم با قاعدهٔ round() پیشین تفاوت کند. اینجا گردکردن جبری و دقیق است:
 * floor(x + 1/2) = floor((2·num + den) / (2·den)) برای den > 0.
 */
function divRoundHalfUp(num: bigint, den: bigint): bigint {
  if (den === 0n) throw new Error('division by zero');
  const n = den < 0n ? -num : num;
  const d = den < 0n ? -den : den;
  return floorDiv(2n * n + d, 2n * d);
}

/**
 * نسبتِ درصدیِ دقیق: part / whole × 100 گردشده به `digits` رقم.
 * اگر مخرج صفر/نامعتبر باشد → ۰ (همان رفتارِ پیشین، بدونِ NaN/Infinity).
 */
export function ratioPct(part: Fixed, whole: Fixed, digits: number): number {
  if (whole === 0n) return 0;
  const q = divRoundHalfUp(part * 100n * 10n ** BigInt(digits), whole);
  return Number(q) / 10 ** digits;
}

/**
 * تقسیمِ دقیق با `digits` رقمِ اعشار — برای نرخ‌هایی مثلِ
 * collection_rate = collected / gross که خروجیِ اعشاری (نه درصدی) دارند.
 * مخرجِ صفر → null (همان قراردادِ پیشین: نرخِ بی‌معنا گزارش نمی‌شود).
 */
export function divideFixed(num: Fixed, den: Fixed, digits: number): number | null {
  if (den === 0n) return null;
  const q = divRoundHalfUp(num * 10n ** BigInt(digits), den);
  return Number(q) / 10 ** digits;
}
