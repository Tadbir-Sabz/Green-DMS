# معماریِ تأیید (Approval Architecture) — وضعیت پس از TASK-24X

این سند قراردادِ معماریِ تأیید را ثبت می‌کند: چه چیزی تضمین می‌شود، چه چیزی
تضمین نمی‌شود، و کجاها باید پیش از «حل‌شده» دانستنِ G-03 همچنان دیده بماند.

> **G-03 به‌طورِ کامل حل‌شده اعلام نمی‌شود.** وضعیت در سطحِ *قابلیت* ثبت شده
> است، نه در سطحِ «گزارشِ باگ بسته شد».

## ۱) اصلِ حاکم: fail-closed

هیچ عملیاتِ حساسی بدونِ یک مسیرِ تأییدِ مشخص و قابلِ ارزیابی انجام نمی‌شود.
نبودِ پیکربندی یعنی «مجاز نیست»، نه «بدونِ تأیید مجاز است».

پیش از TASK-24X، اتصالِ استثنای کفِ سود به موتورِ تأیید **اختیاری** بود:

```ts
if (chainId) { /* ساختِ درخواستِ تأیید */ }   // ← پیش از TASK-24X
```

نتیجه: شرکتی که هیچ زنجیره‌ای برای `pricing.margin_exception` نداشت، استثنا را با
`approval_request_id = null` ثبت می‌کرد؛ و چون `decideMarginException` بررسیِ
تأیید را فقط «وقتی شناسه موجود باشد» انجام می‌داد، همان درخواست با یک مجوزِ
تک‌نفره `approved` می‌شد. یعنی کفِ سودِ شرکت با یک تصمیمِ منفرد دور زده می‌شد —
نقضِ صریحِ جداسازیِ وظایف.

## ۲) قابلیت‌ها و وضعیتشان

| قابلیت | وضعیت | کجا اعمال می‌شود |
| --- | --- | --- |
| نبودِ زنجیره ⇒ عدمِ ثبتِ استثنا | ✅ پیاده‌شده | `createMarginException` → `409 approval_chain_required` |
| زنجیرهٔ بی‌گام ⇒ عدمِ ثبت | ✅ پیاده‌شده | `409 approval_chain_empty` |
| موتورِ تأییدِ در دسترس‌نبودن ⇒ عدمِ ثبت | ✅ پیاده‌شده | `409 approval_engine_unavailable` |
| شکستِ ساخت/اتصالِ درخواستِ تأیید ⇒ لغوِ استثنا | ✅ پیاده‌شده | `abandonMarginException` + `409 approval_request_failed` / `approval_link_failed` |
| استثنای بدونِ `approval_request_id` قابلِ تأیید نیست | ✅ پیاده‌شده | `409 approval_request_missing` |
| استثنا فقط با گردشِ تأییدِ `approved` تأیید می‌شود | ✅ پیاده‌شده | `decideMarginException` → `409 approval_pending` |
| ممنوعیتِ خودتأییدی (استثنا) | ✅ پیاده‌شده | `403 second_person_required` |
| ممنوعیتِ خودتأییدی (گردشِ تأیید) | ✅ پیاده‌شده | `403 self_approval_forbidden` |
| مجازبودنِ تصمیم‌گیرنده بر اساسِ نقش/کارمندِ مرحله | ✅ پیاده‌شده | `403 approver_not_authorized` |
| باندِ مبلغ در زمانِ تصمیم بازاعتبارسنجی می‌شود | ✅ پیاده‌شده | `409 amount_band_mismatch` (فقط پیش از نخستین تصمیم) |
| یکتاییِ تصمیم در هر مرحله | ✅ پیاده‌شده | مهاجرت ۰۰۵۱ + `409 duplicate_decision` |
| گام از وضعیتِ درخواست خوانده می‌شود، نه از بدنه | ✅ پیاده‌شده | `stepNo = req.current_step` |
| جداسازیِ شرکت | ✅ پیاده‌شده | همهٔ queryها با `company_id` محدود می‌شوند |
| جداسازیِ قلمروی عملیاتی | ⚠️ **جزئی** | زنجیره در سطحِ شرکت است؛ قلمرو در گام‌ها مدل نشده |
| تحویلِ اعلان/اطلاع‌رسانی به تأییدکننده | ❌ **وجود ندارد** | — |
| انقضای خودکارِ درخواستِ تأییدِ رهاشده | ❌ **وجود ندارد** | ردیف‌های `pending` بی‌پایان می‌مانند |
| تفکیل/نمایندگی (delegation) | ❌ **وجود ندارد** | — |

## ۳) چرخهٔ استثنای کفِ سود

```
POST /pricing/margin-exceptions
  ├─ policy/product/customer در همان شرکت؟            → 400
  ├─ زنجیرهٔ فعالِ pricing.margin_exception هست؟        → 409 approval_chain_required
  ├─ زنجیره گام دارد؟                                   → 409 approval_chain_empty
  ├─ موتورِ تأیید در دسترس است؟                          → 409 approval_engine_unavailable
  ├─ درجِ استثنا (status = pending)
  ├─ ساختِ approval_request + اتصال                      → 409 approval_request_failed / approval_link_failed
  └─ ثبت در دفترِ تغییرِ قیمت (create)

POST /pricing/margin-exceptions/{id}/decision
  ├─ status = pending؟                                  → 409 not_pending
  ├─ تصمیم‌گیرنده ≠ درخواست‌دهنده؟                        → 403 second_person_required
  ├─ approval_request_id موجود است؟                     → 409 approval_request_missing
  ├─ گردشِ تأیید status = approved؟                      → 409 approval_pending
  └─ ثبتِ تصمیمِ شرطی (expected: pending)                → 409 decision_conflict
```

## ۴) چرخهٔ گردشِ تأیید

```
POST /approvals/{id}/decision   (قرارداد: decision = approve | reject)
  ├─ status = pending؟                                  → 409 not_pending
  ├─ گامِ جاری از req.current_step (نه از بدنه)
  ├─ زنجیره گام دارد؟                                    → 409 approval_chain_empty
  ├─ گام در زنجیره وجود دارد؟                            → 409 invalid_step
  ├─ باندِ مبلغ با گامِ ورودی می‌خواند؟ (فقط بارِ اول)     → 409 amount_band_mismatch
  ├─ تصمیم‌گیرنده ≠ درخواست‌دهنده؟                        → 403 self_approval_forbidden
  ├─ تصمیم‌گیرنده نقش/کارمندِ مرحله است؟                  → 403 approver_not_authorized
  └─ درجِ تصمیم (یکتا: approval_request_id, step_no)     → 409 duplicate_decision
```

## ۵) مدلِ داده

- `approval_chain(company_id, code, entity)` — `entity` مثلِ `pricing.margin_exception`
- `approval_step_def(approval_chain_id, step_no, approver_role_id, approver_staff_id, min_amount, max_amount)`
- `approval_request(company_id, approval_chain_id, entity_type, entity_id, requested_by, current_step, status, amount)`
- `approval_decision(approval_request_id, step_no, decided_by, decision, comment)` — یکتا روی `(approval_request_id, step_no)` (مهاجرت ۰۰۵۱؛ پیش‌تر تصمیمِ دوگانه ممکن بود)
- `margin_exception(approval_request_id, ...)` — `NOT NULL` منطقی است: کد اجازهٔ ثبتِ ردیفِ بدونِ گردش را نمی‌دهد

## ۶) آنچه هنوز باید دیده بماند (G-03)

1. **بدونِ اعلان:** تأییدکننده از وجودِ درخواست باخبر نمی‌شود؛ گردش ممکن است
   بی‌پایان `pending` بماند. تا زمانی که اعلان/فهرستِ کارِ تأییدکننده وجود نداشته
   باشد، «کاراییِ» گردش تضمین نمی‌شود.
2. **بدونِ انقضا:** درخواستِ رهاشده هرگز منقضی نمی‌شود؛ پس یک استثنای کهنه
   می‌تواند ماه‌ها بعد تأیید شود. اعتبارِ `valid_until` استثنا این را جبران نمی‌کند،
   چون تصمیم را نمی‌بندد.
3. **قلمرو در زنجیره مدل نشده:** زنجیره در سطحِ شرکت است. اگر شرکتی بخواهد
   گردشِ تأییدِ متفاوت برای قلمروهای مختلف داشته باشد، مدلِ فعلی آن را نمی‌دهد.
4. **بدونِ تفکیل:** مرخصی/جانشینیِ تأییدکننده باعثِ توقفِ گردش می‌شود.
5. **استثناهای تاریخی:** ردیف‌هایی که پیش از TASK-24X با `approval_request_id = null`
   ساخته شده‌اند قابلِ تأیید نیستند (`approval_request_missing`) و باید لغو و دوباره
   ثبت شوند. **هیچ داده‌ای به‌طورِ خودکار پاک یا ادغام نشد.**

## ۷) مرزِ اعتماد

- پرچم‌های مجوز **هرگز** از بدنهٔ درخواست خوانده نمی‌شوند؛ از نشست می‌آیند
  (`@CurrentUser`, `PermissionsGuard`).
- `apply_promotions` از ورودیِ کلاینتِ سفارش حذف شد؛ منبعِ معتبر
  `pricing_settings.apply_promotions_on_orders` است.
- `requested_by` از نشست گرفته می‌شود، نه از بدنه، تا «شخصِ اول» جعل‌شدنی نباشد.
