/**
 * برچسب فارسی مجوزها — هیچ کد خام انگلیسی در رابط کاربری نمایش داده نمی‌شود.
 *
 * ساختار کد مجوز: `ماژول.موجودیت.عمل` (گاهی `ماژول.عمل` مثل `rules.view`)؛
 * برچسب از همین سه جایگاه ساخته می‌شود:
 *   sales.order.create  →  «سفارش — ایجاد»   (گروه: «فروش»)
 *   rules.view          →  «مشاهده»           (گروه: «قواعد و تأییدات»)
 *
 * پوشش: ۱۵ ماژول، ۵۱ موجودیت و ۱۸ عملِ مجوزهای seed (مهاجرت 0022 — ۱۰۳ مجوز).
 * اگر مجوز تازه‌ای اضافه شود و برچسب نداشته باشد، به‌جای کدِ خام، برچسبِ عمومی
 * فارسی نشان داده می‌شود تا قاعده «بدون کد انگلیسی» هیچ‌وقت شکسته نشود.
 */

/** بخش اول کد = ماژول (گروه نمایش در فرم نقش) */
export const MODULE_LABEL: Record<string, string> = {
  admin: 'مدیریت سیستم',
  ap: 'حساب‌های پرداختنی',
  ar: 'حساب‌های دریافتنی',
  commission: 'پورسانت',
  gl: 'دفتر کل',
  inventory: 'انبار',
  master: 'اطلاعات پایه',
  reports: 'گزارش‌ها',
  rules: 'قواعد و تأییدات',
  sales: 'فروش',
  telesales: 'فروش تلفنی',
  tour: 'تور و مسیر',
  tracking: 'رهگیری',
  treasury: 'خزانه‌داری',
  valuation: 'ارزش‌گذاری موجودی',
};

/** بخش میانی کد = موجودیت/موضوع مجوز (خالی برای کدهای دو بخشی) */
export const ENTITY_LABEL: Record<string, string> = {
  adjust: 'اصلاح موجودی',
  approval: 'گردش تأیید',
  audit: 'لاگ ممیزی',
  backup: 'پشتیبان‌گیری',
  bank: 'بانک',
  cash: 'صندوق',
  cheque: 'چک',
  close: 'بستن روزانه',
  cogs: 'بهای تمام‌شده',
  collection: 'وصول مطالبات',
  count: 'انبارگردانی',
  credit: 'سقف اعتبار',
  customer: 'مشتری',
  customer_geo: 'موقعیت مشتری',
  dashboard: 'داشبورد',
  delivery: 'تحویل',
  exceptions: 'صف استثناها',
  geofence: 'محدوده مکانی',
  grn: 'رسید انبار',
  integration: 'یکپارچه‌سازی',
  invoice: 'فاکتور',
  journal: 'سند حسابداری',
  ledger: 'دفتر حساب مشتری',
  live: 'موقعیت زنده',
  moadian: 'مؤدیان',
  order: 'سفارش',
  payment: 'پرداخت',
  period: 'دوره مالی',
  person: 'شخص',
  petty: 'تنخواه',
  plan: 'برنامه تور',
  price: 'قیمت',
  product: 'کالا',
  promotion: 'طرح تبلیغاتی',
  purchase: 'خرید',
  receipt: 'رسید وصول',
  report: 'گزارش',
  request: 'درخواست',
  return: 'مرجوعی',
  revalue: 'ارزش‌گذاری مجدد',
  role: 'نقش‌ها',
  route: 'مسیر',
  settings: 'تنظیمات',
  settle: 'تسویه تور',
  stock: 'موجودی انبار',
  structure: 'ساختار سازمانی',
  supplier: 'تأمین‌کننده',
  target: 'هدف فروش تلفنی',
  transfer: 'انتقال انبار',
  user: 'کاربران',
  waybill: 'بارنامه',
};

/** بخش آخر کد = عمل انجام‌شونده روی موجودیت */
export const ACTION_LABEL: Record<string, string> = {
  approve: 'تأیید',
  close: 'بستن',
  convert: 'تبدیل',
  correct: 'اصلاح',
  create: 'ایجاد',
  decide: 'تصمیم‌گیری',
  export: 'خروجی گرفتن',
  issue: 'صدور',
  manage: 'مدیریت',
  match: 'تطبیق',
  post: 'ثبت',
  reconcile: 'مغایرت‌گیری',
  receive: 'دریافت',
  perform: 'انجام',
  request: 'درخواست',
  resolve: 'رسیدگی',
  submit: 'ارسال',
  update: 'ویرایش',
  view: 'مشاهده',
  void: 'ابطال',
};

/** برچسب گروه (ماژول) — برای کد ناشناخته هم فارسی می‌ماند */
export const moduleLabel = (code: string): string =>
  MODULE_LABEL[code.split('.')[0] ?? ''] ?? 'سایر';

/**
 * برچسب کامل یک مجوز بدون نمایش کد خام:
 * «موجودیت — عمل» برای کد سه‌بخشی و فقط «عمل» برای کد دوبخشی.
 * توکن ناشناخته به برچسب عمومی فارسی می‌افتد (هرگز کد انگلیسی نمایش داده نمی‌شود).
 */
export const permissionLabel = (code: string): string => {
  const parts = code.split('.').filter(Boolean);
  if (parts.length === 0) return 'مجوز بدون عنوان';

  const action = ACTION_LABEL[parts[parts.length - 1]] ?? 'عملیات';
  const entities = parts.slice(1, -1).map((token) => ENTITY_LABEL[token] ?? 'مورد');
  return entities.length ? `${entities.join(' / ')} — ${action}` : action;
};
