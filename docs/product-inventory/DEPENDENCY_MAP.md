# نقشهٔ وابستگی و معماری — Gate 1 (TASK-21)

> هدف: مدلِ معنادارِ وابستگی (نه فهرستِ ماژول‌ها) برای تصمیمِ توالیِ Gate 2. هر رابطه با شاهد (FK/جدول/endpoint/تست) همراه است.

## ۱) لایه‌بندیِ پایه‌های مشترک

```mermaid
flowchart TB
  subgraph L0["L0 — زیرساختِ اجرا"]
    PG["PostgreSQL 16 + PostGIS<br/>RLS اجباری · هویتِ dms_app"]
    RD["Redis<br/>BullMQ · cache · throttler"]
    S3["MinIO/S3<br/>ضمیمه‌ها + sha256"]
  end
  subgraph L1["L1 — پایه‌های پلتفرم"]
    TEN["چند-مستأجری<br/>company/branch/user_scope"]
    AUTH["احراز هویت + RBAC<br/>auth/otp/refresh · permissions"]
    AUD["audit_log + triggers"]
    DOC["اسناد/ضمیمه‌ها<br/>owner-chain"]
    QUEUE["صف/کارِ پس‌زمینه<br/>job_* · retry/failure"]
    RULES["موتورِ قواعد/تایید<br/>rule* · approval_*"]
    CONTRACT["قراردادِ OpenAPI<br/>کلاینتِ TS + Kotlin"]
  end
  subgraph L2["L2 — داده‌های مرجع و master data"]
    ORG["سازمان/قلمرو/مسیر"]
    PROD["Product Master<br/>uom/category/brand/tax/packaging/batch"]
    CUST["مشتری/اعتبار"]
    PRICE["قیمت/تخفیف"]
  end
  subgraph L3["L3 — دامنه‌های عملیاتی"]
    SALES["فروش/سفارش/فاکتور"]
    INV["موجودی/انبار/خرید"]
    DIST["توزیع/POD/تور"]
    FIN["مالی/GL/صندوق/چک"]
    MOAD["Moadian/PSP/SMS"]
  end
  subgraph L4["L4 — تجربهٔ کاربری"]
    WEB["وب (Next.js)"]
    MOB["سه اپِ اندروید"]
    PORTAL["پورتالِ مشتری"]
  end
  PG --> TEN; RD --> QUEUE; S3 --> DOC
  TEN --> AUTH; AUTH --> RULES; TEN --> AUD; CONTRACT --> WEB & MOB & PORTAL
  ORG --> PROD & CUST; PROD --> PRICE; CUST --> PRICE
  PROD & CUST & PRICE --> SALES & INV
  INV --> SALES; SALES --> DIST; SALES --> FIN; INV --> FIN; DIST --> FIN
  FIN --> MOAD; SALES --> MOAD
  RULES --> SALES & FIN; QUEUE --> SALES & INV & DIST & MOAD
  SALES & INV & DIST & FIN --> WEB; SALES & DIST --> MOB
```

## ۲) ماتریسِ وابستگیِ ماژول‌ها

| ماژول/دامنه | مالکیتِ دامنه | شناسه‌های هسته | بالادست (پیش‌نیاز) | پایین‌دست (مصرف‌کننده) | وابستگیِ مشترک | ریسکِ سازگاری/مهاجرت |
|---|---|---|---|---|---|---|
| سازمان/مستأجر (A) | platform | company_id, branch_id | — | همه | TEN, RLS | تغییرِ scoping = مهاجرتِ حساس |
| کاربر/نقش/مجوز (B) | platform | user_id, role_id, permission | A | همه | AUTH, user_scope | — |
| Product Master (C) | master-data | product_id, uom_id, packaging_id | A | D,E,F,INV,H,I,J,M | tax_code, attachment('product') | تغییرِ نام/واحد نباید تاریخچه را بازنویسی کند (§۸) |
| مشتری/اعتبار (D) | sales-adjacent | customer_id, customer_credit | A | E,F,H,I | person, geofence | — |
| قیمت/تخفیف (E) | pricing | price_list_id, promotion_id | C,D | F (snapshot در خط) | rules-engine (تاییدها) | تغییرِ engine نباید اسنادِ گذشته را تغییر دهد |
| سفارش/فروش (F) | sales | sales_order_id, invoice_id | C,D,E, G(موجودی), B | H,I,J,M | RULES (approval), QUEUE | وضعیت‌های چرخه در check constraint — مهاجرت برای تغییر |
| موجودی/انبار (INV) | inventory | inventory_txn, stock_balance, batch | C, A | F,H,I | QUEUE | صحتِ تراز = منبعِ حقیقتِ موجودی؛ تعارض با stock_valuation ممنوع |
| خرید/تدارکات (INV-04) | purchasing | purchase_order_id, goods_receipt | C,INV | I (payable) | approval (PO) | — |
| توزیع/POD (H) | distribution | delivery_id, pod_id, tour_id | F,G | I (وصولی), M | DOC (POD attachments), tracking | زنجیرهٔ مالکیتِ pod→delivery→branch (TASK-14) نباید شکسته شود |
| مالی/GL (I) | finance | journal_entry, gl_account | F,INV,H | J,M | fiscal_period, account_mapping | اسنادِ حسابداری نامتغیر؛ reversal کنترل‌شده |
| Moadian/یکپارچه‌سازی (J) | integrations | moadian_submission, webhook | I,F | خارج | QUEUE (retry), integration_credential | سازگاریِ قراردادِ بیرونی |
| موبایل (K) | field-force | client_sync_receipt | قرارداد, F,D,H | — | CONTRACT, offline cache | نسخهٔ API باید با کلاینتِ تولیدی همگام بماند |
| اعلان/سند/وظیفه (L) | platform-cross | — | QUEUE, DOC | همه (آینده) | — | **مرزِ معماریِ گمشده** (G-05) |
| گزارش/BI (M) | analytics | ledger_balance_snapshot, ar_aging | I,F,G | — | — | گزارش‌ها باید با اسنادِ مبدأ reconcile شوند |

## ۳) جریان‌های canonical (§۹ نقشهٔ راه) — بلوغِ گام‌ها

وضعیت‌ها: ✅ پیاده‌سازی‌شده/تاییدشده · 🟡 جزئی · ❌ گمشده · ⬜ اثبات‌نشده (UNVERIFIED).

### ۳-۱) Order-to-Cash
```mermaid
flowchart LR
  A["اعتبارِ مشتری 🟡"] --> B["کاتالوگ/قیمت ✅"] --> C["ثبتِ سفارش ✅"] --> D["تایید/تصویب 🟡"] --> E["رزرو/برداشت 🟡"] --> F["بارگیری/ارسال ✅"] --> G["تحویل/POD ✅"] --> H["فاکتور ✅"] --> I["وصولی/تسویه 🟡"] --> J["سندِ حسابداری 🟡"] --> K["گزارش ⬜"]
```
| گام | وضعیت | شاهد/شکاف |
|---|---|---|
| اعتبار/سقف | 🟡 | `customer_credit` هست؛ اعمالِ قواعد در ثبتِ سفارش بدونِ تستِ اختصاصی |
| قیمت/کاتالوگ | ✅ | price_list/customer_price + snapshot در خط |
| سفارش | ✅ | `sales_order` + چرخهٔ وضعیت + `orders.api.test.ts` |
| تصویب | 🟡 | approval_* + rules-engine بدونِ تستِ رفتاری (G-03) |
| رزرو/برداشت | 🟡 | `stock_reservation` هست؛ picking نیست (G-12) |
| بارگیری/تحویل/POD | ✅ | vehicle_load/delivery/pod + ۹ تستِ ضمیمه |
| فاکتور | ✅ | invoice/credit_note + billing |
| وصولی | 🟡 | receipt/allocation/cheque/cash؛ موبایل ⬜ |
| حسابداری | 🟡 | journal/account_mapping؛ قواعدِ خودکارِ رویداد جزئی |
| گزارش | ⬜ | گزارش‌ها هستند؛ reconcile با مبدأ `UNVERIFIED` |

### ۳-۲) Procure-to-Stock
```mermaid
flowchart LR
  A["تامین‌کننده ✅"] --> B["درخواست/PO ✅"] --> C["دریافت/بازرسی ✅"] --> D["بچ/انقضا ✅"] --> E["قرار دادن 🟡"] --> F["فاکتورِ تامین‌کننده 🟡"] --> G["پرداخت 🟡"] --> H["مغایرتِ موجودی/حسابداری 🟡"]
```
نکته: backend این جریان از پُرترین بخش‌هاست (۱۶ مسیر + ۲ فایلِ تست) اما **UI ندارد** (G-09) و تاییدِ PO/تسویهٔ تامین‌کننده ناقص‌اند.

### ۳-۳) Return-to-Resolution
| گام | وضعیت | شاهد/شکاف |
|---|---|---|
| درخواست/دلیل | ✅ | `return_request(+line)` + `returns.api.test.ts` |
| مجوز/بازرسی | 🟡 | تاییدها وابسته به G-03 |
| بازگشت به قفسه/قرنطینه/اسقاط | 🟡 | inventory_txn با kind های مربوط؛ گردشِ کاملِ UI ⬜ |
| credit note/جایگزین | 🟡 | `credit_note(+line)` ✅ در مالی |
| تحلیل | ❌ | گزارشِ اختصاصیِ مرجوعی نیست |

### ۳-۴) Route-to-Delivery
| گام | وضعیت |
|---|---|
| قلمرو/برنامهٔ بازدید | 🟡 (route/visit/route_plan هست؛ بهینه‌سازی ساده) |
| مسیر/خودرو/بار | ✅ (vehicle/vehicle_load/waybill) |
| اجرای مسیر/GPS | ✅ (tracking/geofence) |
| POD یا شکست با کدِ دلیل | ✅ (pod + delivery_line) |
| وصولی/تحویل به صندوق | 🟡 |
| مغایرت | 🟡 (daily_treasury_close) |

### ۳-۵) Promotion-to-Settlement
| گام | وضعیت |
|---|---|
| قواعدِ کمپین | 🟡 (promotion ۹ نوع؛ engine بدونِ تستِ رفتاری) |
| eligibility/قیمت‌گذاریِ سفارش | 🟡 (promotion_id در خط) |
| جایزه/تخفیف | 🟡 |
| تصویب | 🟡 |
| تسویه با تامین‌کننده/سازنده | ❌ (G-04) |
| تحلیلِ اثربخشی | ❌ |

### ۳-۶) Period Close
| گام | وضعیت |
|---|---|
| اعتبارسنجیِ زیردفترها | 🟡 (ledger_balance_snapshot) |
| مغایرت | 🟡 |
| بازبینیِ اسناد | 🟡 (journal + تایید) |
| بستنِ دوره | 🟡 (`gl.period.close` + fiscal_period) |
| صورت‌های مالی/ممیزی | ❌/🟡 (گزارش‌های پایه؛ صورتِ استاندارد نیست) |

## ۴) مسایلِ معماری، چرخه‌ها و مرزهای گمشده

1. **چرخهٔ واقعی یافت نشد.** وابستگی‌ها عموماً به‌صورت DAG از L2 به L3 به L4 هستند. تنها کوپلینگِ دوطرفهٔ ظاهری `promotion ↔ sales_order_line` (FK + منشأِ تخفیف) است که قابلِ قبول و عمداً برای رهگیری طراحی شده.
2. **مرزِ گمشده: مرکزِ اعلان (L-01).** اکنون OTP/SMS درونِ identity-rbac جاسازی شده؛ با ورودِ جریان‌های کاری (تاییدها، تحویل، مطالبات) نیاز به bounded context مستقلِ «notification» با قالب/ترجیح/وضعیتِ تحویل/تلاشِ مجدد است (G-05). **پیشنهاد: ماژولِ جدیدِ مستقل** در نخستین نقطه‌ای که دومین مصرف‌کننده ظاهر شود.
3. **مرزِ گمشده: مرکزِ import/export (L-05).** منطقِ validation/preview/error-report نباید در ماژول‌های پراکنده تکرار شود.
4. **باید درونِ context موجود بماند (جداسازیِ بی‌دلیل ممنوع):** approvals درونِ rules-engine («workflow & rules») یک context واحد است؛ POD درونِ distribution؛ batch درونِ inventory؛ credit درونِ customer/sales-adjacent.
5. **جداسازیِ توجیه‌پذیرِ آینده:** «pricing engine» اگر قواعدِ cascade/margin/simulation اضافه شود، مرزِ روشنی از master-data دارد (مالکیتِ E در ماتریس).
6. **گلوگاه‌ها:** (الف) قراردادِ OpenAPI = نقطهٔ واحدِ شکست برای وب/موبایل/پورتال (تغییرِ آن همه‌جا را می‌شکند — حفاظتِ contract-drift لازم است)؛ (ب) `inventory_txn` = منبعِ حقیقتِ موجودی برای فروش/مالی/BI؛ (ج) owner-scopeِ ضمیمه‌ها = الگوی مالکیتی که هر feature جدیدِ فایل باید از آن بگذرد.
7. **ریسکِ منبعِ حقیقتِ دوگانه:** `stock_balance` در برابرِ جمعِ `inventory_txn`، و `ledger_balance_snapshot` در برابرِ جمعِ `journal_line` — هر دو «کشِ تراز» هستند؛ باید همیشه از مبدأ قابلِ بازسازی باشند (در P5 تستِ تطابق لازم است).
8. **وابستگی‌های عملیاتی:** Redis برای صف (بدونِ آن graceful degrade)، S3 برای ضمیمه، درگاه‌های خارجی (SMS/Moadian/PSP) با mock در دسترس‌اند؛ production بدونِ آن‌ها fail-closed است (اثبات‌شده در TASK-19).

## ۵) نتیجه‌گیریِ وابستگی برای توالی

- **هیچ مانعِ معماریِ جلویِ Product Master نیست** (همهٔ بالادست‌هایش L1/L2 ✅‌اند).
- سه وابستگیِ cross-cutting که **نباید به انتها موکول شوند** (قاعدهٔ §۷ نقشهٔ راه): تستِ رفتاریِ rules/approval (G-03، پیش‌نیازِ روانِ P3-P4)، مرکزِ اعلان (G-05، حداکثر تا P4)، و پایهٔ import انبوه (G-13، پیش‌نیازِ P1 به‌شکلِ محدود).

## ۶) وابستگیِ یکپارچگیِ هویتِ کالا (C11–C13 / Track A–B)

> این جریان یک «ماژول» در ماتریسِ §۲ نیست؛ یک لایهٔ تحلیلیِ inert روی **L2 — Product Master** است.
> **هیچ قید/مهاجرت/داده‌ای فعال نیست.** نمودار کاملِ وضعیت: `C13-STATUS-DASHBOARD.md`.

```mermaid
flowchart LR
  P1["P1 Product Master ✅<br/>۰۰۴۶/۰۰۴۷ in main"] --> C11["C11 ✅<br/>Canonical Normalization c11.1<br/>(inert)"]
  C11 --> C12["C12 ✅<br/>Shadow Identity Index + Migration Simulation c12.1<br/>(inert)"]
  C12 --> C13["C13 ✅<br/>Cross-Field Resolution c13.1<br/>(inert, در main تا d14395a)"]
  C13 --> XT["C13XT Track A ✅<br/>Cross-Type Collision c13xt.1<br/>commit 0a06445 (inert)"]
  XT --> TB["C13-B Track B 🟡<br/>Readiness + Evidence c13b.1<br/>commit f44bef3 (inert)"]
  TB -->|نیازمند| RA["⛔ BLOCKED<br/>replicaٔ ایزولهٔ مجاز<br/>+ چک‌لیست §3 امضاشده"]
  RA -->|نیازمند| OD["⛔ BLOCKED/OPEN<br/>D-C13X-1..3 + D-C12-3 + D-C11-3<br/>(OWNER-DECISION-REGISTER.md)"]
  OD -->|فقط پس از صفر HARD| EN["⬜ فعال‌سازیِ قیدها<br/>(مهاجرتِ جداگانه + rollback)"]
```

| لایه | بالادست (پیش‌نیاز) | پایین‌دست (مصرف‌کننده) | وضعیت | وضعیتِ «کامل»؟ |
| --- | --- | --- | --- | --- |
| C11 — نرمال‌سازی | P1 (schema موجود) | C12 | ✅ تکمیل + تست (inert) | بله (به‌عنوانِ تحلیل) |
| C12 — نمایهٔ سایه | C11 | C13، تصمیماتِ D-C12-* | ✅ تکمیل + تست (inert) | بله (به‌عنوانِ تحلیل) |
| C13 — بین‌میدانی | C11 + C12 | C13XT، D-C13-1 | ✅ تکمیل + تست (inert) | بله (به‌عنوانِ تحلیل) |
| C13XT — بین‌نوعی (Track A) | C13 (تحلیل مستقل از تصمیماتِ قید) | C13-B | ✅ تکمیل + تست | بله (به‌عنوانِ تحلیل) |
| C13-B — آمادگیِ دادهٔ واقعی (Track B) | C13XT + **امضای مالک + replica** | اجرای REAL_AUTHORIZED_REPLICA | 🟡 ابزار آماده؛ **اجرا BLOCKED** | **خیر** |
| فعال‌سازیِ قیدها | C13-B روی دادهٔ واقعی + تصمیماتِ مالک + صفر HARD | مهاجرت/قید/RLS | ⬜ انجام نشده | خیر |

**وابستگی‌های تصریح‌شده:**

- **داده:** همهٔ لایه‌ها فقط از `product` · `product_family` · `product_category` · `product_packaging` · `product_alias` · `product_barcode` · `company` می‌خوانند (نقشهٔ دقیقِ ستو‌ن‌ها: `TASK-PM-02-C13-B_REAL_DATA_SHADOW_READINESS.md` §۲٫۳). هیچ‌کدام تا حالا **روی دادهٔ واقعی اجرا نشده‌اند**.
- **تصمیم:** تحلیل آزاد است؛ **هر اعمالی** وابسته به حداقلِ یکی از `D-C11-3` · `D-C12-3` · `D-C13-1` · `D-C13X-1..3` است — همه باز و بدونِ تأیید.
- **ممیزی:** بازبینیِ مستقلِ Agent-2 پیش‌شرطِ بستنِ وضعیتِ UNVERIFIED است — هنوز رخ نداده.
- **CI:** jobهای static/unit باید روی شاخه سبز باشند پیش از هر ادغام — تا امروز روی این شاخه مشاهده نشده.
- **0046 drift:** `product_packaging.barcode` ↔ `product_barcode` **موجود، شناخته‌شده، اندازه‌گیری‌نشده و دست‌نخورده**؛ `POL-PACKAGING-CANON-01` فقط گزارش می‌کند.
- **RLS:** بدونِ `app.company_id` معتبر، `fn_current_company_id()` → NULL → **صفر ردیف**؛ اجرای per-company در evidence ثبت می‌شود و cross-company به‌صورتِ صریح UNVERIFIED می‌ماند مگر مسیرِ مصوبِ §۲٫۴-ب.

**ممنوعیت‌ها (معماری نه قانونِ اخلاقی):** هیچ مسیرِ تولیدی این ماژول‌ها را import نمی‌کند (گاردها در CI) · هیچ مهاجرت/قیدی توسط این جریان ساخته نمی‌شود · هیچ داده‌ای به‌وسیلهٔ این جریان تغییر نمی‌کند.
