/**
 * شناسنامه گزارش‌های مجاز (ضمیمه C سند) — هر گزارش یک کلید، عنوان، ماژول،
 * مجوز لازم و یک کوئری پارامتری دارد که روی PG_POOL (tenant-aware) اجرا می‌شود
 * (نه pg خام که RLS را دور می‌زد). همه کوئری‌ها company_id نشست را می‌گیرند.
 *
 * ستون‌ها (columns) برای رندر جدول در وب و ساخت CSV/XLSX در /reports/{key}?format
 * استفاده می‌شوند. مقدار هر ستون از ردیف با همان key خوانده می‌شود.
 */

export interface ReportColumn {
  key: string;
  title: string;
  /** نوع برای قالب‌بندی در خروجی (مبلغ/تاریخ/عدد/متن) */
  kind?: 'money' | 'date' | 'number' | 'text';
}

export interface ReportDescriptor {
  key: string;
  title: string;
  module: string;
  required_permission: string;
  columns: ReportColumn[];
  /**
   * کوئری گزارش. placeholderها:
   *   $1 = company_id
   *   $2 = from (date|null)
   *   $3 = to (date|null)
   * باید ستون‌هایی با همان keyهای columns برگرداند.
   */
  sql: string;
}

/** رجیستری گزارش‌ها — کلید → تعریف */
export const REPORTS: Record<string, ReportDescriptor> = {
  daily_sales: {
    key: 'daily_sales',
    title: 'فروش روزانه به تفکیک شعبه',
    module: 'sales',
    required_permission: 'reports.dashboard.view',
    columns: [
      { key: 'sale_date', title: 'تاریخ', kind: 'date' },
      { key: 'branch_code', title: 'کد شعبه' },
      { key: 'branch_name', title: 'شعبه' },
      { key: 'invoice_count', title: 'تعداد فاکتور', kind: 'number' },
      { key: 'net_sales', title: 'فروش خالص', kind: 'money' },
      { key: 'return_amount', title: 'مرجوعی', kind: 'money' },
      { key: 'collected_amount', title: 'وصولی', kind: 'money' },
      { key: 'open_invoice_amount', title: 'باز', kind: 'money' },
    ],
    sql: `select sale_date::text as sale_date, branch_code, branch_name,
                 invoice_count, net_sales::text as net_sales,
                 return_amount::text as return_amount,
                 collected_amount::text as collected_amount,
                 open_invoice_amount::text as open_invoice_amount
            from mv_daily_sales
           where company_id = $1
             and ($2::date is null or sale_date >= $2::date)
             and ($3::date is null or sale_date <= $3::date)
           order by sale_date desc, branch_code
           limit 5000`,
  },
  ar_aging: {
    key: 'ar_aging',
    title: 'تحلیل سنی مطالبات',
    module: 'finance',
    required_permission: 'ar.ledger.view',
    columns: [
      { key: 'customer_code', title: 'کد مشتری' },
      { key: 'customer_name', title: 'مشتری' },
      { key: 'total_due', title: 'کل بدهی', kind: 'money' },
      { key: 'current_amount', title: 'جاری', kind: 'money' },
      { key: 'bucket_1_30', title: '۱-۳۰ روز', kind: 'money' },
      { key: 'bucket_31_60', title: '۳۱-۶۰ روز', kind: 'money' },
      { key: 'bucket_61_90', title: '۶۱-۹۰ روز', kind: 'money' },
      { key: 'bucket_over_90', title: 'بالای ۹۰ روز', kind: 'money' },
    ],
    sql: `select customer_code, customer_name, total_due::text as total_due,
                 current_amount::text as current_amount,
                 bucket_1_30::text as bucket_1_30, bucket_31_60::text as bucket_31_60,
                 bucket_61_90::text as bucket_61_90, bucket_over_90::text as bucket_over_90
            from mv_ar_aging
           where company_id = $1
           order by total_due desc
           limit 5000`,
  },
  salesperson_performance: {
    key: 'salesperson_performance',
    title: 'کارکرد فروشندگان',
    module: 'sales',
    required_permission: 'reports.dashboard.view',
    columns: [
      { key: 'salesperson_name', title: 'فروشنده' },
      { key: 'period_label', title: 'دوره' },
      { key: 'order_count', title: 'تعداد سفارش', kind: 'number' },
      { key: 'net_sales', title: 'فروش خالص', kind: 'money' },
      { key: 'collected_amount', title: 'وصولی', kind: 'money' },
      { key: 'visit_count', title: 'بازدید', kind: 'number' },
      { key: 'visit_conversion_pct', title: 'نرخ تبدیل ٪', kind: 'number' },
    ],
    sql: `select salesperson_name, period_label, order_count,
                 net_sales::text as net_sales, collected_amount::text as collected_amount,
                 visit_count, visit_conversion_pct
            from mv_salesperson_performance
           where company_id = $1
           order by net_sales desc
           limit 5000`,
  },
  customer_exposure: {
    key: 'customer_exposure',
    title: 'سقف اعتبار و ماندهٔ مشتریان',
    module: 'finance',
    required_permission: 'ar.ledger.view',
    columns: [
      { key: 'code', title: 'کد مشتری' },
      { key: 'credit_limit', title: 'سقف اعتبار', kind: 'money' },
      { key: 'total_due', title: 'کل بدهی', kind: 'money' },
      { key: 'open_cheque_amount', title: 'چک باز', kind: 'money' },
      { key: 'available_credit', title: 'اعتبار باقی', kind: 'money' },
    ],
    // v_customer_exposure ستون company_id ندارد؛ از طریق customer→branch محدود می‌شود
    sql: `select v.code, v.credit_limit::text as credit_limit, v.total_due::text as total_due,
                 v.open_cheque_amount::text as open_cheque_amount,
                 v.available_credit::text as available_credit
            from v_customer_exposure v
            join customer c on c.id = v.customer_id
            join branch b on b.id = c.branch_id
           where b.company_id = $1
           order by v.total_due desc
           limit 5000`,
  },
  trial_balance: {
    key: 'trial_balance',
    title: 'تراز آزمایشی دفتر کل',
    module: 'finance',
    required_permission: 'gl.report.view',
    columns: [
      { key: 'account_code', title: 'کد حساب' },
      { key: 'title', title: 'شرح حساب' },
      { key: 'nature', title: 'ماهیت' },
      { key: 'debit_total', title: 'بدهکار', kind: 'money' },
      { key: 'credit_total', title: 'بستانکار', kind: 'money' },
      { key: 'balance', title: 'مانده', kind: 'money' },
    ],
    sql: `select account_code, title, nature, debit_total::text as debit_total,
                 credit_total::text as credit_total, balance::text as balance
            from v_trial_balance
           where company_id = $1
           order by account_code
           limit 5000`,
  },
};

/** کلیدهای مجاز گزارش */
export const REPORT_KEYS = Object.keys(REPORTS);
