/**
 * P3 — دروازهٔ اعتبار مشتری: منطقِ خالصِ تصمیم (بدونِ I/O).
 *
 * این فایل تنها منبعِ تعبیرِ «مشتری حقِ ثبت/تأییدِ سفارشِ فروش را دارد یا نه» است؛
 * هم مسیرِ ثبت (order.service) و هم مسیرِ تأیید و هم اندپوینتِ استثنا از آن استفاده می‌کنند.
 * جدایش از دیتابیس عمدی است تا رفتار با تست‌های واحد (بدونِ DB) اثبات شود.
 *
 * قواعد (همه از ستون‌های واقعیِ schema می‌آیند — چیزی اختراع نمی‌شود):
 *  ۱) مشتری باید `active` باشد؛ `suspended/blocked/closed` ⇒ ردِ سخت (بدونِ مسیرِ استثنا).
 *  ۲) `customer_credit.credit_hold = true` ⇒ ردِ سخت (رفعِ آن فقط با اندپوینتِ اختصاصیِ
 *     مسئولِ اعتبار و با ممیزی؛ استثنای per-order نمی‌تواند مسدودیِ اداری را دور بزند).
 *  ۳) سقف اعتبار فقط وقتی «پیکربندی‌شده» است که ردیفِ customer_credit با credit_limit > 0
 *     وجود داشته باشد؛ نبودنِ ردیف یا limit=0 یعنی بدونِ سقف (رفتارِ تاریخی حفظ شد).
 *     در آن حالت: اعتبارِ قابلِ مصرف = credit_limit + extra_limitِ معتبر − ماندهٔ فاکتورهای
 *     باز − مجموعِ سفارش‌های متعهدشدهٔ باز (approved/partially_delivered/delivered).
 *  ۴) `block_on_overdue` + قدمتِ قدیمی‌ترین فاکتورِ معوق > `max_overdue_days` ⇒ رد؛
 *     قابلِ عبور با استثنای اعتبار (تصمیم مالک/مدیر اعتبار).
 *  ۵) چک‌های دریافتیِ باز نمایش داده می‌شوند ولی در دروازهٔ سفارش شمرده نمی‌شوند؛
 *     سقفِ `max_open_cheques` در لحظهٔ ثبتِ چک اعمال می‌شود (cheque.service).
 *
 * کدهای خطای پایدار (قرارداد openapi.yaml):
 *   customer_blocked · credit_hold · credit_limit_exceeded · credit_overdue
 * دو موردِ آخر `approvable: true` هستند و مسیرِ استثنای موتورِ تأیید (`ar.credit.exception`)
 * برای آن‌ها معنا دارد؛ دو موردِ اول سخت‌گیرانه‌اند.
 */

export interface CreditGateRow {
  customer_id: string;
  branch_id: string;
  status: string;
  segment_id: string | null;
  credit_limit: number;
  /** معادلِ فعلی (پس از انقضای extra_limit_expires_on) — از دیتابیس محاسبه می‌شود */
  extra_limit: number;
  /** ماندهٔ فاکتورهای posted/partially_paid پس از کسرِ credit_noteهای ثبت‌شده */
  total_due: number;
  /** جمعِ ریالیِ سفارش‌های approved/partially_delivered/delivered (به‌جز خودِ سفارش در حالتِ exclude) */
  committed_open_orders: number;
  cheque_allowed: boolean;
  max_open_cheques: number | null;
  open_cheques_count: number;
  open_cheques_amount: number;
  /** اگر ردیفِ customer_credit نباشد false است (نبودِ پیکربندی ≠ block) */
  block_on_overdue: boolean;
  max_overdue_days: number;
  /** قدمتِ قدیمی‌ترین فاکتورِ معوقِ دارای مانده؛ ۰ یعنی معوقی نیست */
  oldest_overdue_days: number;
  overdue_invoice_count: number;
  credit_hold: boolean;
  hold_reason: string | null;
  hold_set_at: string | null;
}

export interface CreditRestriction {
  /** کدِ پایدارِ قرارداد */
  code: 'customer_blocked' | 'credit_hold' | 'credit_limit_exceeded' | 'credit_overdue';
  message_fa: string;
  /** true = می‌تواند با استثنای تأییدشدهٔ موتورِ تأیید عبور کند */
  approvable: boolean;
  details: Record<string, unknown>;
}

export interface CreditGateResult {
  row: CreditGateRow;
  /** اعتبارِ اسمیِ فعلی = limit + extra(معتبر) */
  nominal_limit: number;
  /** پس از کسرِ ماندهٔ فاکتورهای باز */
  available_credit: number;
  /** پس از کسرِ سفارش‌های متعهدشدهٔ باز */
  available_for_order: number;
  restrictions: CreditRestriction[];
}

/** جمع‌بندیِ دروازه برای یک مبلغ سفارش (بدونِ I/O) */
export function evaluateCreditGate(row: CreditGateRow, orderTotal: number): CreditGateResult {
  const nominal = round2(row.credit_limit + row.extra_limit);
  const available = round2(nominal - row.total_due);
  const availableForOrder = round2(available - row.committed_open_orders);
  const restrictions: CreditRestriction[] = [];

  if (row.status !== 'active') {
    restrictions.push({
      code: 'customer_blocked',
      message_fa: 'مشتری در وضعیت فعال نیست؛ ثبت/تأیید سفارش برای این مشتری مجاز نیست.',
      approvable: false,
      details: { status: row.status },
    });
  }
  if (row.credit_hold) {
    restrictions.push({
      code: 'credit_hold',
      message_fa: 'اعتبار مشتری به‌دستور مسدود شده است؛ فقط مسئول اعتبار می‌تواند مسدودی را رفع کند.',
      approvable: false,
      details: { hold_reason: row.hold_reason, hold_set_at: row.hold_set_at },
    });
  }
  // سقف فقط وقتی وجود دارد که credit_limit > 0 (رفتار تاریخی حفظ شد)
  if (row.credit_limit > 0 && round2(orderTotal) > availableForOrder) {
    restrictions.push({
      code: 'credit_limit_exceeded',
      approvable: true,
      message_fa: 'مبلغ سفارش از اعتبار در دسترس مشتری بیشتر است؛ نیازمند تأیید اعتبار است.',
      details: {
        order_total: round2(orderTotal),
        credit_limit: round2(row.credit_limit),
        extra_limit: round2(row.extra_limit),
        total_due: round2(row.total_due),
        committed_open_orders: round2(row.committed_open_orders),
        available_credit: available,
        available_for_order: availableForOrder,
        approval_required: true,
        approval_operation: 'ar.credit.exception',
      },
    });
  }
  if (row.block_on_overdue && row.oldest_overdue_days > row.max_overdue_days) {
    restrictions.push({
      code: 'credit_overdue',
      approvable: true,
      message_fa: 'مشتری دارای فاکتور معوق فراتر از مهلت مجاز است؛ ثبت/تأیید سفارش نیازمند تأیید اعتبار است.',
      details: {
        oldest_overdue_days: row.oldest_overdue_days,
        max_overdue_days: row.max_overdue_days,
        overdue_invoice_count: row.overdue_invoice_count,
        approval_required: true,
        approval_operation: 'ar.credit.exception',
      },
    });
  }
  return {
    row,
    nominal_limit: nominal,
    available_credit: available,
    available_for_order: availableForOrder,
    restrictions,
  };
}

export const hasHardRestriction = (r: CreditRestriction[]): boolean => r.some((x) => !x.approvable);
export const hasApprovableRestriction = (r: CreditRestriction[]): boolean => r.some((x) => x.approvable);

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
