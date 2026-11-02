export function toPersianDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch {
    return d.toLocaleDateString('fa-IR');
  }
}

/* -------------------------------------------------------------------------
 * تبدیل واقعی جلالی ↔ میلادی (الگوریتم jalaali-js، بدون وابستگی خارجی).
 * برای date-picker لازم است: Intl فقط قالب‌بندی می‌کند و نمی‌تواند ورودی
 * جلالی کاربر را به تاریخ میلادیِ قابل ارسال به API تبدیل کند.
 * ---------------------------------------------------------------------- */

/** شکستن عدد به ارقام فارسی برای نمایش در picker */
export function toPersianDigits(input: string | number): string {
  const fa = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(input).replace(/\d/g, (d) => fa[Number(d)]);
}

function div(a: number, b: number): number {
  return ~~(a / b);
}
function mod(a: number, b: number): number {
  return a - ~~(a / b) * b;
}

/** محاسبهٔ پایهٔ تقویم جلالی برای یک سال میلادی (jalaali-js jalCal) */
function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const breaks = [
    -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097,
    2192, 2262, 2324, 2394, 2456, 3178,
  ];
  const gy = jy + 621;
  let jump = -14;
  const jp = breaks[0];
  if (jy < jp || jy >= breaks[breaks.length - 1]) {
    throw new Error('invalid jalaali year ' + jy);
  }
  let leapJ = -14;
  let jumpIdx = breaks[0];
  for (let i = 1; i < breaks.length; i += 1) {
    const jm = breaks[i];
    jump = jm - jumpIdx;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jumpIdx = jm;
  }
  let n = jy - jumpIdx;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function jalToJdn(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return gregorianToJdn(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function jdnToJal(jdn: number): { jy: number; jm: number; jd: number } {
  const gy = jdnToGregorian(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = gregorianToJdn(gy, 3, r.march);
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) {
      return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

function gregorianToJdn(gy: number, gm: number, gd: number): number {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function jdnToGregorian(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

export type JalaliDate = { jy: number; jm: number; jd: number };

/** تبدیل تاریخ میلادی (Date یا رشته ISO) به جلالی */
export function gregorianToJalali(date: Date | string): JalaliDate | null {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return null;
  const jdn = gregorianToJdn(d.getFullYear(), d.getMonth() + 1, d.getDate());
  return jdnToJal(jdn);
}

/** تبدیل جلالی به شیء Date میلادی (ساعت محلی نیمه‌شب) */
export function jalaliToGregorian(jy: number, jm: number, jd: number): Date | null {
  if (!isFinite(jy) || !isFinite(jm) || !isFinite(jd)) return null;
  try {
    const jdn = jalToJdn(jy, jm, jd);
    const g = jdnToGregorian(jdn);
    const date = new Date(g.gy, g.gm - 1, g.gd);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
}

/** رشتهٔ ISO (YYYY-MM-DD) از یک تاریخ جلالی — برای ارسال به API */
export function jalaliToISO(jy: number, jm: number, jd: number): string | null {
  const d = jalaliToGregorian(jy, jm, jd);
  if (!d) return null;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** نام ماه‌های جلالی */
export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];

/** نام روزهای هفته از شنبه (چیدمان تقویم ایرانی) */
export const JALALI_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

/** تعداد روزهای هر ماه جلالی (۶ ماه اول ۳۱، ۵ ماه بعد ۳۰، اسفند ۲۹/۳۰) */
export function jalaliMonthLength(jy: number, jm: number): number {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return jalCal(jy).leap === 0 ? 30 : 29;
}

/** امروز به جلالی */
export function todayJalali(): JalaliDate {
  const now = new Date();
  return gregorianToJalali(now) ?? { jy: now.getFullYear(), jm: 1, jd: 1 };
}

/** قالب‌بندی جلالی به‌صورت ۱۴۰۳/۰۵/۱۲ (ارقام فارسی اختیاری) */
export function formatJalali(j: JalaliDate, persianDigits = true): string {
  const s = `${j.jy}/${String(j.jm).padStart(2, '0')}/${String(j.jd).padStart(2, '0')}`;
  return persianDigits ? toPersianDigits(s) : s;
}
export function toPersianDateTime(date: string | Date | null | undefined): string {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
  } catch {
    return d.toLocaleString('fa-IR');
  }
}
