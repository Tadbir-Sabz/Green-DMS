# مرحله‌بندی ۶ گام به ترتیب اولویت برای اپ فروشنده و تکمیل میدانی

> ⚠️ **واقعیت فعلی (بررسی‌شده):** هیچ‌یک از سه اپ اندروید
> (`android/apps/salesman`، `distributor`، `telesales`) در حال حاضر **build نمی‌شوند**.
> بنابراین وضعیت هیچ گامی «انجام شده» نیست. جدول زیر وضعیت *واقعی* را نشان می‌دهد،
> نه وضعیت آرزویی. پیش از هر ادعای تکمیل، باید خطاهای build زیر رفع شوند.

## موانع build (باید اول رفع شوند)

- `android/apps/salesman/app/src/main/AndroidManifest.xml` با `<provider>` شروع می‌شود
  و **هیچ ریشهٔ `<manifest>`** ندارد → manifest نامعتبر و app غیرقابل build.
- مجوزهای `INTERNET`/`CAMERA`/`LOCATION`/`BLUETOOTH` در manifest نیستند.
- بلوک deps در `app/build.gradle.kts` (~خط ۵۶) خراب است.
- importها به `org.openapitools.client.*` ارجاع دارند ولی کلاینت تولیدشده در
  `com.greendms.api.client.*` است → import های مرده.
- `NavGraph.kt` به `ui.login.LoginScreen` و `data.secure.SecurePrefs` ارجاع می‌دهد که
  **این فایل‌ها وجود ندارند** (مرجع مرده).
- `baseUrl` باید `10.0.2.2:4000` باشد (امولاتور → میزبان ماشین).
- app توزیع‌کننده namespace/applicationId اشتباه دارد؛ `android:name=".GreenDmsApp"` و
  `gradlew` غایب؛ چهار کپی کلاینت اندروید باید در یک ماژول مشترک ادغام شوند.

## وضعیت گام‌ها

| اولویت | گام | وضعیت واقعی | مانع / کار باقی‌مانده | فایل‌های کلیدی |
|---|---|---|---|---|
| ۱ | احراز هویت در اپ فروشنده | ❌ ناقص | app build نمی‌شود؛ `LoginScreen.kt` و `SecurePrefs.kt` وجود ندارند (NavGraph مرجع مرده دارد)؛ توکن secure ذخیره نمی‌شود | navigation/NavGraph.kt, MainActivity.kt (LoginScreen/SecurePrefs غایب) |
| ۲ | دریافت تور، مسیر و مشتریان + بستهٔ آفلاین | ❌ ناقص | موجودیت‌های Room تعریف شده‌اند ولی `saveTours/saveCustomers/savePacks` هرگز صدا زده نمی‌شوند؛ بستهٔ تور واقعاً ذخیره نمی‌شود | data/local/entity/Entities.kt, data/local/dao/Daos.kt, data/local/AppDatabase.kt |
| ۳ | ثبت سفارش آفلاین + صف Outbox | ❌ ناقص | سمت سرور هیچ کد outbox ندارد (فقط `client_uuid` روی sales_order با 409)؛ سبد خرید/تبدیل بسته‌بندی/اعتبارسنجی محلی در اپ پیاده نشده؛ سفارش hardcode «demo» است | data/local/entity/OutboxOrderEntity.kt, ui/screens/order/OrderScreen.kt |
| ۴ | همگام‌سازی هوشمند با WorkManager | ❌ ناقص | `SyncWorker` هرگز POST نمی‌کند (فقط `markOrder(…,"sent")`)؛ retry/backoff، network constraint، دوره‌ای و حل تضاد واقعی نیست | sync/SyncWorker.kt, data/local/dao/OutboxDao.kt |
| ۵ | بارکد، چاپ حرارتی، GPS و Geofencing | ❌ ناقص | به‌دلیل خرابی build قابل اجرا نیست؛ GPS/geofence و check-in/out ماندگار و چاپ ۸۰mm با دادهٔ واقعی (`orderJson` null است) پیاده نشده | ui/screens/scan/, ui/screens/print/, app/build.gradle.kts |
| ۶ | اپ توزیع/موزع و فروش تلفنی | ❌ ناقص | ~۶۰ خط در ۳ فایل با دکمه‌های no-op؛ POD/وصول/تسویه و سفارش تلفنی + اعتبارسنجی واقعی نیست؛ namespace/applicationId اشتباه | apps/distributor/, apps/telesales/ |

## سایر کارهای انتشار (release)

آیکون launcher، `buildTypes.release` + signing + ProGuard، تست‌های unit/instrumented
(در حال حاضر صفر)، گزارش crash، و رشته‌های فارسی — همه باقی‌مانده‌اند.

---

**یادداشت:** وضعیت‌های بالا بر اساس بررسی واقعی کد (نه ادعا) به‌روزرسانی شده‌اند.
تا زمانی که موانع build رفع نشوند، هیچ گامی «انجام شده» محسوب نمی‌شود.
