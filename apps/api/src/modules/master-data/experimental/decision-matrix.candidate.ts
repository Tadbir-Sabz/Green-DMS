/**
 * TASK-PM-02-C13 — ماتریسِ تصمیم برای تصمیم‌های بازِ C11 و C12.
 *
 * ⚠️ **هیچ‌یک از این تصمیم‌ها تصویب نشده است.**
 * این ماژول گزینه‌ها، پیامدهای فنی/کسب‌وکار، ریسکِ سازگاری و شاهدِ مصنوعی را
 * مستند می‌کند و یک «پیش‌فرضِ توصیه‌شده» می‌دهد — نه یک سیاستِ نهایی. هر تصمیمی
 * که `requires_owner_approval` دارد تا امضای مالک **باز** است.
 *
 * شاهدِ هر تصمیم **اجرایی** است: تست‌های `c13-decisions.test.ts` هر گزینه را روی
 * قراردادِ نامزد اجرا می‌کنند تا ادعا با رفتارِ واقعی بسنجد.
 */

import {
  scanSpace,
  alnumSpace,
  textSpace,
  type Decision,
} from './cross-field-identity.candidate';

export interface DecisionOption {
  readonly id: string;
  readonly label_fa: string;
  /** پیامدِ فنی — چه چیزی در کد/داده عوض می‌شود */
  readonly technical_consequence_fa: string;
  /** پیامدِ کسب‌وکار — چه چیزی برای کاربر/انبار/حسابداری عوض می‌شود */
  readonly business_consequence_fa: string;
  readonly compatibility_risk: 'low' | 'medium' | 'high';
  /** گذارِ سازگاری که در صورتِ انتخابِ این گزینه لازم است */
  readonly migration_impact_fa: string;
}

export interface OpenDecision {
  readonly id: string;
  readonly topic_fa: string;
  readonly current_behavior_fa: string;
  readonly options: readonly DecisionOption[];
  readonly recommended_default: string;
  /** دلیلِ توصیه — و این‌که چرا هنوز تصمیم نیست */
  readonly recommendation_rationale_fa: string;
  readonly requires_owner_approval: boolean;
  /** تصمیمِ دیگری که به آن وابسته است */
  readonly depends_on: readonly string[];
  /** شاهدِ اجرایی — نامِ تستی که رفتار را می‌سنجد */
  readonly evidence_test: string;
  readonly affected_decision_class: readonly Decision[];
}

/**
 * تصمیم‌های باز. `recommended_default` شناسهٔ گزینهٔ توصیه‌شده است — نه مصوبه.
 */
export const OPEN_DECISIONS: readonly OpenDecision[] = [
  {
    id: 'D-C11-1',
    topic_fa: 'اعتبارسنجیِ رقمِ کنترلیِ بارکد (EAN/UPC)',
    current_behavior_fa:
      'هیچ اعتبارسنجیِ رقمِ کنترلی وجود ندارد. هر رشته‌ای که به بارکد شبیه باشد پذیرفته می‌شود و صفرِ ابتدایی حفظ می‌شود.',
    options: [
      {
        id: 'A',
        label_fa: 'بدونِ اعتبارسنجی (وضعیتِ فعلی)',
        technical_consequence_fa:
          'بارکدِ نامعتبر و اشتباهِ تایپی وارد می‌شود و در اسکن به کالایِ اشتباه می‌رسد. هیچ تغییری در کد لازم نیست.',
        business_consequence_fa:
          'خطای ورودِ بارکد فقط در عملیات کشف می‌شود؛ هزینهٔ اصلاح در انبار پرداخت می‌شود.',
        compatibility_risk: 'low',
        migration_impact_fa: 'هیچ مهاجرتی لازم نیست.',
      },
      {
        id: 'B',
        label_fa: 'اعتبارسنجی فقط برای انواعِ GS1 (EAN-8/13، UPC-A)',
        technical_consequence_fa:
          'یک تابعِ اعتبارسنجی به مسیرِ ورودِ بارکد اضافه می‌شود؛ بارکدهای داخلی/آزاد معاف می‌مانند. نیازمندِ یک ستونِ «نوعِ بارکد» یا قاعدهٔ تشخیص.',
        business_consequence_fa:
          'بارکدِ استانداردِ غلط همان لحظهٔ ورود رد می‌شود — بهترین نقطهٔ مهارِ خطا.',
        compatibility_risk: 'medium',
        migration_impact_fa:
          'بارکدهای موجود باید دسته‌بندی شوند؛ آن‌هایی که شبیهِ GS1‌اند ولی رقمِ کنترلی‌شان غلط است هشدار می‌گیرند (نه حذف).',
      },
      {
        id: 'C',
        label_fa: 'اعتبارسنجی برای همهٔ بارکدها',
        technical_consequence_fa:
          'همهٔ بارکدها باید رقمِ کنترلیِ معتبر داشته باشند. بارکدهای داخلی و قدیمی رد می‌شوند.',
        business_consequence_fa:
          'ریسکِ بالا: بارکدهای داخلیِ در گردش از کار می‌افتند و اسکن در انبار می‌شکند.',
        compatibility_risk: 'high',
        migration_impact_fa:
          'نیازمندِ مهاجرتِ داده و بازچاپِ برچسب — برگشت‌ناپذیر بدونِ backup.',
      },
    ],
    recommended_default: 'B',
    recommendation_rationale_fa:
      'گزینهٔ B خطا را در نقطهٔ ورود مهار می‌کند بدونِ آنکه بارکدهای داخلی را بشکند. ولی **آستانهٔ «شبیهِ GS1 بودن» یک قاعدهٔ کسب‌وکار است** و تا تصویبِ مالک، اعتبارسنجی فعال نمی‌شود.',
    requires_owner_approval: true,
    depends_on: ['D-C11-4'],
    evidence_test: 'c13-decisions.test.ts → D-C11-1',
    affected_decision_class: ['HARD_CONFLICT', 'NOT_COMPARABLE'],
  },
  {
    id: 'D-C11-2',
    topic_fa: 'ادغامِ «آ» با «ا» و «أ/إ» با «ا»',
    current_behavior_fa:
      'در قراردادِ نامزد **متمایز** می‌مانند. دلیل: ادغام بازگشت‌ناپذیر است و ممکن است معنایِ نام را عوض کند (آب ≠ اب).',
    options: [
      {
        id: 'A',
        label_fa: 'حفظِ تفکیک در همهٔ پروفایل‌ها (پیش‌فرضِ نامزد)',
        technical_consequence_fa:
          'کلیدهایِ متفاوت ⇒ برخوردِ کمتری گزارش می‌شود. هیچ ادغامِ ناخواسته‌ای رخ نمی‌دهد.',
        business_consequence_fa:
          'کالاهای هم‌نام که فقط در آ/ا فرق دارند جدا می‌مانند؛ ممکن است دو رکوردِ تکراری پنهان بمانند.',
        compatibility_risk: 'low',
        migration_impact_fa: 'هیچ مهاجرتی لازم نیست — همین امروز رفتارِ نامزد است.',
      },
      {
        id: 'B',
        label_fa: 'ادغام فقط در پروفایلِ SearchKey',
        technical_consequence_fa:
          'جست‌وجو بخشنده‌تر می‌شود ولی یکتایی دست‌نخورده می‌ماند. کمترین ریسک با بیشترین سودِ کاربری.',
        business_consequence_fa:
          'کاربر «آب» را با تایپِ «اب» پیدا می‌کند، ولی دو کالا اشتباهاً یکی نمی‌شوند.',
        compatibility_risk: 'low',
        migration_impact_fa:
          'فقط ایندکسِ جست‌وجو بازسازی می‌شود؛ دادهٔ هویتی دست‌نخورده می‌ماند.',
      },
      {
        id: 'C',
        label_fa: 'ادغام در همهٔ پروفایل‌ها',
        technical_consequence_fa:
          'کلیدِ هویتی عوض می‌شود. هر جایی که کلید ذخیره شده باید بازمحاسبه شود.',
        business_consequence_fa:
          'ریسکِ ادغامِ دو نامِ معنادار و متفاوت (آب/اب) — خطای برگشت‌ناپذیر.',
        compatibility_risk: 'high',
        migration_impact_fa:
          'بازمحاسبهٔ ستون‌های هویتی؛ بدونِ backup بازگشت‌ناپذیر.',
      },
    ],
    recommended_default: 'A',
    recommendation_rationale_fa:
      'تفکیک، پیش‌فرضِ ایمن است و همین امروز اجرا می‌شود. گزینهٔ B سودِ کاربری دارد ولی «بخشندگىِ جست‌وجو» یک سیاستِ کسب‌وکار است که مالک باید تعیین کند. شاهدِ دادهٔ واقعی هنوز **BLOCKED** است.',
    requires_owner_approval: true,
    depends_on: ['D-C11-6'],
    evidence_test: 'c13-decisions.test.ts → D-C11-2',
    affected_decision_class: ['SOFT_CONFLICT', 'MANUAL_REVIEW'],
  },
  {
    id: 'D-C11-3',
    topic_fa: 'حساسیتِ کدِ کالا به بزرگی/کوچکیِ حروف',
    current_behavior_fa:
      'قیدِ پایگاه‌داده حساس است (`SKU-9` ≠ `sku-9`) ولی جست‌وجو و بررسیِ برخورد با `lower()` کار می‌کنند ⇒ **دو منبعِ حقیقتِ ناسازگار**.',
    options: [
      {
        id: 'A',
        label_fa: 'یکتاییِ حساس‌نبودن به حروف (case-insensitive)',
        technical_consequence_fa:
          'قید به ایندکسِ یکتایِ `lower(code)` تغییر می‌کند. سازگار با رفتارِ فعلیِ جست‌وجو.',
        business_consequence_fa:
          '`SKU-9` و `sku-9` دیگر نمی‌توانند هم‌زمان وجود داشته باشند — که احتمالاً همان چیزی است که کاربر انتظار دارد.',
        compatibility_risk: 'medium',
        migration_impact_fa:
          'پیش از ساختِ ایندکس باید برخوردهایِ موجود حل شوند؛ وگرنه ساختِ ایندکس شکست می‌خورد.',
      },
      {
        id: 'B',
        label_fa: 'حفظِ حساسیتِ فعلی و اصلاحِ جست‌وجو',
        technical_consequence_fa:
          'جست‌وجو باید حساس شود. ریسک: کاربرانی که با حروفِ کوچک جست‌وجو می‌کنند کالا را نمی‌یابند.',
        business_consequence_fa:
          'سردرگمیِ کاربر؛ کاهشِ یافتنِ کالا.',
        compatibility_risk: 'medium',
        migration_impact_fa: 'نیازمندِ بازسازیِ ایندکسِ جست‌وجو.',
      },
    ],
    recommended_default: 'A',
    recommendation_rationale_fa:
      'A تنها گزینه‌ای است که ناسازگاریِ «دو منبعِ حقیقت» را از بین می‌برد و با انتظارِ کاربر هم‌خوان است. ولی تغییرِ قید یک تغییرِ اسکیماست و **ممنوعیتِ C13** است؛ نیازمندِ تصویبِ مالک و پنجرهٔ مهاجرتِ جداگانه.',
    requires_owner_approval: true,
    depends_on: [],
    evidence_test: 'c13-decisions.test.ts → D-C11-3',
    affected_decision_class: ['HARD_CONFLICT'],
  },
  {
    id: 'D-C11-4',
    topic_fa: 'خطِ تیره و نشانه‌گذاری در بارکد',
    current_behavior_fa:
      'در ذخیره‌سازی حذف نمی‌شود؛ قراردادِ نامزد در فضای اسکن آن را حذف می‌کند (`0-0-7` → `007`).',
    options: [
      {
        id: 'A',
        label_fa: 'حذف به‌عنوان جداکنندهٔ نمایشی (پیش‌فرضِ نامزد)',
        technical_consequence_fa:
          'بارکدهایِ یکسان با قالب‌بندیِ متفاوت یکی می‌شوند. برخوردهایِ تکراریِ واقعی آشکار می‌شوند.',
        business_consequence_fa:
          'اسکنِ «007» با برچسبِ «0-0-7» کار می‌کند — رفتارِ موردِ انتظار.',
        compatibility_risk: 'low',
        migration_impact_fa:
          'کلیدِ مقایسه تغییر می‌کند؛ مقدارِ نمایشی دست‌نخورده می‌ماند.',
      },
      {
        id: 'B',
        label_fa: 'حفظِ خطِ تیره به‌عنوان کاراکترِ معنادار',
        technical_consequence_fa:
          '`0-0-7` و `007` دو شناسهٔ متفاوت می‌مانند. برخوردِ واقعی مخفی می‌ماند.',
        business_consequence_fa:
          'ریسکِ کالایِ تکراری با برچسب‌هایِ متفاوت.',
        compatibility_risk: 'low',
        migration_impact_fa: 'هیچ تغییری لازم نیست.',
      },
    ],
    recommended_default: 'A',
    recommendation_rationale_fa:
      'خطِ تیره در عمل جداکنندهٔ خوانایی است، نه بخشی از شناسه. شاهدِ مصنوعی نشان می‌دهد A فقط برخوردهایِ واقعی را آشکار می‌کند. اما تأییدِ مالکِ انبار دربارهٔ برچسب‌هایِ موجود لازم است.',
    requires_owner_approval: true,
    depends_on: ['D-C11-1'],
    evidence_test: 'c13-decisions.test.ts → D-C11-4',
    affected_decision_class: ['HARD_CONFLICT', 'SOFT_CONFLICT'],
  },
  {
    id: 'D-C11-5',
    topic_fa: 'رفتارِ نیم‌فاصله (ZWNJ)',
    current_behavior_fa:
      'در پروفایل‌هایِ متنی به فاصله تبدیل می‌شود؛ در فضای اسکن/کد حذف می‌شود.',
    options: [
      {
        id: 'A',
        label_fa: 'یکسان‌سازی با فاصله در پروفایل‌هایِ متنی (پیش‌فرضِ نامزد)',
        technical_consequence_fa:
          '«کوکا‌زیرو» و «کوکا زیرو» در جست‌وجو یکی می‌شوند.',
        business_consequence_fa:
          'جست‌وجویِ بخشنده‌تر؛ ریسکِ ادغامِ دو نامِ عمداً متفاوت.',
        compatibility_risk: 'medium',
        migration_impact_fa: 'کلیدِ متنی بازمحاسبه می‌شود.',
      },
      {
        id: 'B',
        label_fa: 'حفظِ تفکیکِ نیم‌فاصله',
        technical_consequence_fa:
          'کلیدهایِ متفاوت؛ جست‌وجو باید دقیق‌تر تایپ شود.',
        business_consequence_fa:
          'کاربر ممکن است کالا را پیدا نکند اگر نیم‌فاصله را نداند.',
        compatibility_risk: 'low',
        migration_impact_fa: 'هیچ تغییری لازم نیست.',
      },
    ],
    recommended_default: 'A',
    recommendation_rationale_fa:
      'نیم‌فاصله در تایپِ روزمره اغلب حذف یا با فاصله جایگزین می‌شود. A جست‌وجو را واقع‌بین می‌کند ولی چون «ادغامِ نام‌هایِ عمداً متفاوت» ممکن است، تصویبِ مالک لازم است.',
    requires_owner_approval: true,
    depends_on: ['D-C11-2'],
    evidence_test: 'c13-decisions.test.ts → D-C11-5',
    affected_decision_class: ['SOFT_CONFLICT'],
  },
  {
    id: 'D-C11-6',
    topic_fa: 'نرمال‌سازیِ جست‌وجو در سمتِ وب و API',
    current_behavior_fa:
      'وب اعراب را حذف و ZWNJ را فاصله می‌کند، ولی API **اصلاً** نرمال نمی‌کند ⇒ جست‌وجو در دو طرفِ شبکه دو نتیجهٔ متفاوت می‌دهد.',
    options: [
      {
        id: 'A',
        label_fa: 'تطبیقِ هر دو طرف با پروفایلِ SearchKey (پیش‌فرضِ نامزد)',
        technical_consequence_fa:
          'یک قراردادِ واحد برای جست‌وجو در سرور و کلاینت. حذفِ نرمال‌سازِ وب به نفعِ اشتراک.',
        business_consequence_fa:
          'نتیجهٔ جست‌وجو در وب و موبایل و API یکسان می‌شود.',
        compatibility_risk: 'medium',
        migration_impact_fa:
          'کلاینت باید نسخهٔ جدید را بگیرد؛ نسخه‌های قدیمی ممکن است متفاوت behave کنند.',
      },
      {
        id: 'B',
        label_fa: 'حفظِ وضعیتِ فعلی (ناهمگون)',
        technical_consequence_fa:
          'واگرایی باقی می‌ماند؛ هر باگِ جست‌وجو باید دو بار رفع شود.',
        business_consequence_fa:
          'تجربهٔ ناهمگون و شکایتِ کاربر.',
        compatibility_risk: 'low',
        migration_impact_fa: 'هیچ تغییری لازم نیست.',
      },
    ],
    recommended_default: 'A',
    recommendation_rationale_fa:
      'A تنها گزینه‌ای است که واگراییِ سرور/کلاینت را حذف می‌کند. ولی یک تغییرِ رفتاریِ قابلِ مشاهده برای کاربر است و نیازمندِ هماهنگیِ انتشار.',
    requires_owner_approval: true,
    depends_on: ['D-C11-2', 'D-C11-5'],
    evidence_test: 'c13-decisions.test.ts → D-C11-6',
    affected_decision_class: ['SOFT_CONFLICT', 'NOT_COMPARABLE'],
  },
  // ── تصمیم‌هایِ تازهٔ C12/C13 ─────────────────────────────────────────────
  {
    id: 'D-C12-1',
    topic_fa: 'آیا «شناسهٔ یکسان در دو شرکت» هرگز باید تعارض شمرده شود؟',
    current_behavior_fa:
      'هرگز. مقدارِ پیش‌فرض `crossCompanyIsConflict = false` است و مقایسهٔ بین‌شرکتی `ALLOWED` گزارش می‌شود.',
    options: [
      {
        id: 'A',
        label_fa: 'همیشه مجاز (پیش‌فرضِ فعلی)',
        technical_consequence_fa:
          'مرزِ شرکت دست‌نخورده. هیچ هشدارِ بین‌شرکتی تولید نمی‌شود.',
        business_consequence_fa:
          'دو شرکت می‌توانند کالایِ هم‌نام و هم‌بارکد داشته باشند — که در واقعیت رایج است.',
        compatibility_risk: 'low',
        migration_impact_fa: 'هیچ تغییری لازم نیست.',
      },
      {
        id: 'B',
        label_fa: 'تعارضِ سخت با قاعدهٔ سراسریِ مصوب',
        technical_consequence_fa:
          'کلیدِ یکتاییِ سراسری لازم می‌شود؛ این یک قیدِ سراسری است که RLS را تضعیف نمی‌کند ولی مدلِ چندمستأجری را محدود می‌کند.',
        business_consequence_fa:
          'شرکت‌ها نمی‌توانند کالایِ هم‌بارکد داشته باشند — محدودیتِ سنگین و غیرمنتظره.',
        compatibility_risk: 'high',
        migration_impact_fa:
          'نیازمندِ مهاجرتِ داده و بازبینیِ همهٔ برخوردهایِ بین‌شرکتی.',
      },
    ],
    recommended_default: 'A',
    recommendation_rationale_fa:
      'A با مدلِ چندمستأجری و RLS سازگار است. B تنها با یک قاعدهٔ کسب‌وکارِ صریح (مثلاً کاتالوگِ مشترکِ گروه) معنا پیدا می‌کند و باید مالک تعیین کند.',
    requires_owner_approval: true,
    depends_on: [],
    evidence_test: 'c13-decisions.test.ts → D-C12-1',
    affected_decision_class: ['ALLOWED', 'HARD_CONFLICT'],
  },
  {
    id: 'D-C12-2',
    topic_fa: 'رسمی‌کردنِ «فضای مقایسهٔ مشترک» در قراردادِ C11',
    current_behavior_fa:
      'در C13 به‌صورتِ قراردادِ اعلانی (`c13.1`) پیاده شد، ولی قراردادِ C11 هنوز آن را به‌رسمیت نمی‌شناسد.',
    options: [
      {
        id: 'A',
        label_fa: 'افزودنِ فضاها به قراردادِ C11 به‌عنوان لایهٔ دومِ رسمی',
        technical_consequence_fa:
          'C11 پروفایل‌هایِ میدانی را نگه می‌دارد و فضاها به‌عنوانِ قراردادِ مقایسه اضافه می‌شوند. نسخه به `c11.2` می‌رود.',
        business_consequence_fa:
          'هیچ تغییرِ رفتاری برای کاربر؛ فقط رسمی‌سازیِ آنچه C13 کشف کرد.',
        compatibility_risk: 'low',
        migration_impact_fa: 'هیچ مهاجرتِ داده‌ای لازم نیست.',
      },
      {
        id: 'B',
        label_fa: 'نگه‌داشتنِ فضاها فقط در C13',
        technical_consequence_fa:
          'دو قراردادِ موازی. خطر: کسی C11 را می‌خواند و فضاها را نمی‌بیند ⇒ باگِ CF-10 تکرار می‌شود.',
        business_consequence_fa:
          'ریسکِ عملیاتیِ بازگشتِ برخوردِ پنهان.',
        compatibility_risk: 'medium',
        migration_impact_fa: 'هیچ مهاجرتی لازم نیست، ولی دانش پراکنده می‌ماند.',
      },
    ],
    recommended_default: 'A',
    recommendation_rationale_fa:
      'A ریسکِ تکرارِ CF-10 را حذف می‌کند و هیچ هزینهٔ داده‌ای ندارد. این یک تصمیمِ **معماریِ مستندات** است، نه کسب‌وکار — ولی تغییرِ نسخهٔ قرارداد باید صریح تصویب شود.',
    requires_owner_approval: true,
    depends_on: [],
    evidence_test: 'c13-decisions.test.ts → D-C12-2',
    affected_decision_class: ['HARD_CONFLICT', 'SOFT_CONFLICT', 'MANUAL_REVIEW'],
  },
  {
    id: 'D-C12-3',
    topic_fa: 'ساختِ ایندکسِ یکتاییِ سایه‌ای روی تولید',
    current_behavior_fa: 'انجام نشده. فقط شبیه‌سازی شده. هیچ قیدی ساخته نشده است.',
    options: [
      {
        id: 'A',
        label_fa: 'ساخت با `CONCURRENTLY` پس از پاک‌سازیِ برخوردها',
        technical_consequence_fa:
          'قفلِ طولانی نمی‌سازد. اگر برخوردی باقی باشد ساخت شکست می‌خورد — که خودش سیگنالِ ایمنی است.',
        business_consequence_fa:
          'تضمینِ یکتایی بدونِ قطعیِ سرویس.',
        compatibility_risk: 'medium',
        migration_impact_fa:
          'پیش‌نیاز: صفر برخوردِ HARD باقی‌مانده. برگشت‌پذیر با `DROP INDEX CONCURRENTLY`.',
      },
      {
        id: 'B',
        label_fa: 'ساختِ معمولی (بدونِ CONCURRENTLY)',
        technical_consequence_fa:
          'قفلِ جدول در طولِ ساخت ⇒ قطعیِ نوشتن.',
        business_consequence_fa:
          'ریسکِ توقفِ عملیات در ساعاتِ کاری.',
        compatibility_risk: 'high',
        migration_impact_fa: 'نیازمندِ پنجرهٔ توقفِ سرویس.',
      },
      {
        id: 'C',
        label_fa: 'ساخت نکردن (ادامهٔ وضعیتِ فعلی)',
        technical_consequence_fa: 'هیچ حفاظتی اضافه نمی‌شود.',
        business_consequence_fa: 'برخوردهایِ تازه بی‌مانع وارد می‌شوند.',
        compatibility_risk: 'medium',
        migration_impact_fa: 'هیچ تغییری لازم نیست.',
      },
    ],
    recommended_default: 'A',
    recommendation_rationale_fa:
      'A تنها گزینه‌ای است که هم ایمن است و هم برگشت‌پذیر. **ولی این یک تغییرِ تولیدی است و C13 صریحاً ممنوع کرده — پس فقط پس از تصویبِ مالک و در C14+.**',
    requires_owner_approval: true,
    depends_on: ['D-C11-3', 'D-C12-1'],
    evidence_test: 'c13-decisions.test.ts → D-C12-3',
    affected_decision_class: ['HARD_CONFLICT'],
  },
  {
    id: 'D-C13-1',
    topic_fa: 'آستانهٔ «قابلِ مقایسه بودن» برای جفت‌میدان‌هایِ متنی/شناسه‌ای',
    current_behavior_fa:
      'قراردادِ `c13.1` بarcode↔name را `NOT_COMPARABLE` و alias↔name را `SOFT_CONFLICT` تعیین کرده است. این یک انتخابِ فنی است، نه مصوبهٔ کسب‌وکار.',
    options: [
      {
        id: 'A',
        label_fa: 'حفظِ جدولِ فعلی (۱۳ قاعده با تصمیمِ صریح)',
        technical_consequence_fa:
          'رفتارِ قطعی و مستند. هر جفتِ تازه نیازمندِ یک قاعدهٔ صریح است.',
        business_consequence_fa:
          'کمترین هشدارِ کاذب؛ برخوردهایِ واقعیِ عملیاتی (alias↔barcode/code) دیده می‌شوند.',
        compatibility_risk: 'low',
        migration_impact_fa: 'هیچ تغییری لازم نیست.',
      },
      {
        id: 'B',
        label_fa: 'قابلِ مقایسه دانستنِ همهٔ جفت‌ها',
        technical_consequence_fa:
          'جدول حذف می‌شود؛ هر تجمعی گزارش می‌شود.',
        business_consequence_fa:
          'انفجارِ هشدارِ کاذب (هر نامِ عددی با هر بارکد). مالکِ داده فلج می‌شود.',
        compatibility_risk: 'high',
        migration_impact_fa: 'نیازمندِ بازطراحیِ گردشِ کارِ حلِ برخورد.',
      },
    ],
    recommended_default: 'A',
    recommendation_rationale_fa:
      'A همان «هر شباهتِ متنی تعارض نیست» را اجرا می‌کند. شاهدِ مصنوعی نشان می‌دهد B حجمِ هشدار را چند برابر می‌کند بدونِ ارزشِ تصمیم‌گیری.',
    requires_owner_approval: true,
    depends_on: ['D-C12-2'],
    evidence_test: 'c13-decisions.test.ts → D-C13-1',
    affected_decision_class: ['NOT_COMPARABLE', 'SOFT_CONFLICT', 'MANUAL_REVIEW'],
  },
  {
    id: 'D-C13X-1',
    topic_fa: 'رزروِ دوطرفهٔ دامنهٔ بارکد بینِ kindهای gs1 و internal/other (و مخزنِ قدیمی)',
    current_behavior_fa:
      'gs1_ean13/ean8/upc/itf14 یکتای جهانی‌اند (uq_product_barcode_gs1)؛ internal/other یکتای شرکتی‌اند (uq_product_barcode_internal)؛ packaging_barcode یکتای جهانی روی جدولِ خودش (uq_product_barcode). هیچ قیدی یک مقدار را هم‌زمان در دو دامنه نمی‌گیرد — جفتِ (gs1، internal) امروز آزاد است.',
    options: [
      {
        id: 'A',
        label_fa: 'رزروِ دوطرفه: gs1 → جهانی، internal/other → شرکتی، و هیچ مقداری در هر دو دامنه مجاز نیست',
        technical_consequence_fa:
          'یک جدولِ رزرو یا یک تابعِ بررسی در لایهٔ سرویس + گزارشِ شبیه‌سازیِ POL-BARCODE-XKIND-01 برای دادهٔ موجود؛ قیدِ جدید فقط پس از صفر شدنِ یافته‌ها و با تصمیمِ مالک.',
        business_consequence_fa:
          'پایانهٔ اسکن و جست‌وجوی کد هرگز بینِ «بارکدِ جهانی» و «کدِ داخلی» سردرگم نمی‌شود؛ دادهٔ متناقضِ امروز شفاف و قابلِ حل می‌شود.',
        compatibility_risk: 'medium',
        migration_impact_fa: 'نیازمندِ گزارشِ کاملِ گروه‌های متناقض و حلِ دستیِ آن‌ها پیش از هر قید؛ مشابهِ مسیرِ D-C12-3.',
      },
      {
        id: 'B',
        label_fa: 'حفظِ وضعیتِ امروز (قیدهای نوع‌محورِ فعلی)',
        technical_consequence_fa:
          'هیچ تغییری در قیدها یا کد؛ گروه‌های (gs1, internal) همچنان نامرئی می‌مانند مگر این ابزار اجرا شود.',
        business_consequence_fa:
          'ابهامِ عملیاتیِ امروز باقی می‌ماند: یک مقدار می‌تواند برای دو کالای متفاوت معنا بدهد.',
        compatibility_risk: 'low',
        migration_impact_fa: 'هیچ تغییری لازم نیست.',
      },
      {
        id: 'C',
        label_fa: 'یکتاییِ کاملِ جهانی برای همهٔ بارکدها',
        technical_consequence_fa:
          'قوی‌ترین گزینه: uq سراسری روی همهٔ kindها + مهاجرت؛ بیشترین برخورد در دادهٔ موجود.',
        business_consequence_fa:
          'ساده‌ترین قاعده برای اپراتور ولی بیشترین ریسکِ ردِ دادهٔ تاریخی و بیشترین بارِ حلِ دستی.',
        compatibility_risk: 'high',
        migration_impact_fa: 'نیازمندِ ارزیابیِ کاملِ دادهٔ موجود و پنجرهٔ مهاجرت؛ برای دامنهٔ شرکتیِ داخلی نامناسب است.',
      },
    ],
    recommended_default: 'A',
    recommendation_rationale_fa:
      'A دامنه‌های امروز را حفظ می‌کند و فقط حفرهٔ بینِ آن‌ها را می‌بندد؛ C دادهٔ تاریخی را غیرضروری بی‌اعتبار می‌کند و B حفره را باز نگه می‌دارد.',
    requires_owner_approval: true,
    depends_on: ['D-C12-3'],
    evidence_test: 'c13-cross-type-policies.test.ts → POL-BARCODE-XKIND-01',
    affected_decision_class: ['HARD_CONFLICT'],
  },
  {
    id: 'D-C13X-2',
    topic_fa: 'هم‌ارزیِ UPC-A (۱۲ رقم) و EAN-13 با صفرِ پیشوند در مقایسه و یکتایی',
    current_behavior_fa:
      'هیچ فضایی در قراردادها UPC را به EAN-13 تا نمی‌کند؛ «036000291452» (gs1_upc) و «0036000291452» (gs1_ean13) دو کلیدِ متفاوت‌اند و همان بارکدِ فیزیکی می‌تواند دو بار ثبت شود.',
    options: [
      {
        id: 'A',
        label_fa: 'تاکردنِ UPC→EAN فقط در لایهٔ مقایسه/شبیه‌سازی (همین قرارداد c13xt.1)',
        technical_consequence_fa:
          'سیاستِ POL-UPC-EAN-PAD-01 گروه‌های هم‌ارز را گزارش می‌کند؛ هیچ قید و هیچ داده‌ای تغییر نمی‌کند.',
        business_consequence_fa:
          'مالک تصویرِ واقعی از «یک بارکدِ فیزیکی با دو kind» می‌بیند و تصمیم می‌گیرد؛ ریسکِ عملیاتیِ اسکن امروز ثبت می‌شود.',
        compatibility_risk: 'low',
        migration_impact_fa: 'هیچ تغییری در داده یا قید لازم نیست؛ حلِ موارد فقط با تصمیمِ انسان.',
      },
      {
        id: 'B',
        label_fa: 'تاکردن در ذخیرهٔ داده (normalize-on-write به EAN-13)',
        technical_consequence_fa:
          '«036000291452» هنگامِ ذخیره به «0036000291452» تبدیل می‌شود؛ نیازمندِ مهاجرت و بازنویسیِ دادهٔ تاریخی.',
        business_consequence_fa:
          'یکدست‌سازیِ کامل ولی با ریسکِ تغییرِ مقادیرِ چاپ‌شده روی بسته‌بندیِ فیزیکی.',
        compatibility_risk: 'high',
        migration_impact_fa: 'نیازمندِ مهاجرتِ غیربرگشت‌پذیر و تطبیق با چاپِ بسته‌ها؛ نیازمندِ تأییدِ صریحِ مالک.',
      },
      {
        id: 'C',
        label_fa: 'حفظِ وضعیتِ امروز بدونِ هیچ هم‌ارزی',
        technical_consequence_fa:
          'هیچ تغییری؛ جفت‌های هم‌ارز همچنان نامرئی می‌مانند.',
        business_consequence_fa:
          'دو ردیف برای همان بارکدِ فیزیکی ممکن است بماند؛ اسکن بسته به kind ثبت‌شده جواب می‌دهد.',
        compatibility_risk: 'low',
        migration_impact_fa: 'هیچ تغییری لازم نیست.',
      },
    ],
    recommended_default: 'A',
    recommendation_rationale_fa:
      'A بدونِ هیچ تغییرِ داده‌ای، ابهام را مرئی می‌کند؛ B بدونِ بازبینی بسته‌بندی‌های چاپی خطرناک است و C مسئله را نادیده می‌گیرد.',
    requires_owner_approval: true,
    depends_on: ['D-C11-1'],
    evidence_test: 'c13-cross-type-policies.test.ts → POL-UPC-EAN-PAD-01',
    affected_decision_class: ['HARD_CONFLICT'],
  },
  {
    id: 'D-C13X-3',
    topic_fa: 'سازگاریِ بارکدِ بسته‌بندی (مخزنِ قدیمی) با مخزنِ کانونی product_barcode',
    current_behavior_fa:
      'مهاجرتِ ۰۰۴۶ بارکدهای product_packaging را با «on conflict do nothing» به product_barcode کپی کرد؛ ردیف‌هایی که با ردیفِ موجود برخورد کردند بی‌صدا جا افتادند. هیچ گزارش/مانیتوری drift بینِ دو مخزن را نشان نمی‌دهد.',
    options: [
      {
        id: 'A',
        label_fa: 'گزارشِ drift و حلِ دستی، سپس خاتمهٔ مخزنِ قدیمی (طبق گزینهٔ A از C12-3)',
        technical_consequence_fa:
          'POL-PACKAGING-CANON-01 سه کلاس می‌یابد: نسخهٔ کانونیِ مفقود، نسخهٔ متناقض، و drift بین‌بازنمایی؛ حلِ دستی + سپس توقفِ نوشتن در مخزنِ قدیمی.',
        business_consequence_fa:
          'تک‌منبعِ حقیقت برای بارکد؛ اسکن روی بسته‌بندی بسته به یک مخزن می‌شود.',
        compatibility_risk: 'medium',
        migration_impact_fa: 'نیازمندِ گزارشِ کاملِ drift و حلِ دستی؛ توقفِ مخزنِ قدیمی فقط با تصمیمِ مالک.',
      },
      {
        id: 'B',
        label_fa: 'همگام‌سازیِ خودکار دو مخزن (dual-write با reconciliation)',
        technical_consequence_fa:
          'لایهٔ سرویس هر دو مخزن را در تراکنش می‌نویسد + jobِ مغایرت‌گیر؛ بیشترین تغییر در مسیرِ نوشتن.',
        business_consequence_fa:
          'هیچ drift جدیدی نمی‌ماند ولی ریسکِ باگ در مسیرِ خودکار و نیاز به تستِ عمیق‌تر.',
        compatibility_risk: 'medium',
        migration_impact_fa: 'نیازمندِ تغییرات در سرویس/تراکنش و مانیتورینگ؛ پیچیده‌تر از A.',
      },
      {
        id: 'C',
        label_fa: 'حفظِ دو مخزن بدونِ هیچ همگام‌سازی',
        technical_consequence_fa:
          'هیچ تغییری؛ drift موجود و آتی باقی می‌ماند و هیچ‌کس نمی‌فهمد کدام نمایش درست است.',
        business_consequence_fa:
          'پاسخِ اسکن می‌تواند بسته به مسیر متفاوت باشد؛ ریسکِ عملیاتی ادامه دارد.',
        compatibility_risk: 'low',
        migration_impact_fa: 'هیچ تغییری لازم نیست.',
      },
    ],
    recommended_default: 'A',
    recommendation_rationale_fa:
      'A ساده‌ترین مسیرِ «گزارش ← حلِ دستی ← خاتمه» است و با درسِ C12 (هیچ اقدامِ خودکار بدونِ تصمیمِ مالک) سازگار است؛ B مسیرِ خودکار با ریسکِ بالاتر است و C مسئله را نگه می‌دارد.',
    requires_owner_approval: true,
    depends_on: ['D-C12-3'],
    evidence_test: 'c13-cross-type-policies.test.ts → POL-PACKAGING-CANON-01',
    affected_decision_class: ['HARD_CONFLICT', 'MANUAL_REVIEW'],
  },
];

/** تصمیمِ یک شناسه */
export function decisionById(id: string): OpenDecision | undefined {
  return OPEN_DECISIONS.find((d) => d.id === id);
}

/** آیا تصمیم تصویب شده است؟ — همیشه `false` تا زمانی که سندِ تصویب وجود ندارد */
export function isApproved(_id: string): boolean {
  // عمداً هیچ‌چیز «تصویب‌شده» برنمی‌گرداند: C13 هیچ امضایی دریافت نکرده است.
  return false;
}

/**
 * سنجهٔ اثرِ یک گزینه بر قرارداد — برای شاهدِ اجرایی.
 * دو مقدار را در یک فضا می‌سنجد و می‌گوید با این گزینه یکی می‌شوند یا نه.
 */
export function optionEffect(
  space: 'scan' | 'alnum' | 'text',
  a: string,
  b: string,
): { left: string | null; right: string | null; equal: boolean } {
  const f = space === 'scan' ? scanSpace : space === 'alnum' ? alnumSpace : textSpace;
  const l = f(a);
  const r = f(b);
  return {
    left: l.key,
    right: r.key,
    equal: l.ok && r.ok && l.key === r.key,
  };
}
