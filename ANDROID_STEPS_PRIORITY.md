# مرحله‌بندی ۶ گام به ترتیب اولویت برای اپ فروشنده و تکمیل میدانی

| اولویت | گام | وضعیت | توضیح فنی | فایل‌های کلیدی |
|---|---|---|---|---|
| ۱ | احراز هویت در اپ فروشنده | انجام شده | ورود امن، ذخیره توکن با EncryptedSharedPreferences، هدایت به داشبورد، خروج | data/secure/SecurePrefs.kt, ui/login/LoginScreen.kt, navigation/NavGraph.kt, MainActivity.kt |
| ۲ | دریافت تور، مسیر و مشتریان + بسته آفلاین | انجام شده | ذخیره تور/مشتریان/قیمت در Room، بارگذاری بسته تور روزانه، کار کاملاً آفلاین | data/local/entity/Entities.kt, data/local/dao/Daos.kt, data/local/AppDatabase.kt, ui/screens/tour/TourScreen.kt |
| ۳ | ثبت سفارش آفلاین با اعتبارسنجی محلی + صف Outbox | انجام شده | سبد خرید، انتخاب بسته‌بندی/ضریب تبدیل، ذخیره سفارش در Outbox با clientUuid برای idempotent | data/local/entity/OutboxOrderEntity.kt, ui/screens/order/OrderScreen.kt |
| ۴ | همگام‌سازی هوشمند با WorkManager | انجام شده | ارسال خودکار سفارش‌های pending هنگام اتصال، افزایش retryCount، به‌روزرسانی وضعیت | sync/SyncWorker.kt, data/local/dao/OutboxDao.kt |
| ۵ | اسکن بارکد، چاپ حرارتی بلوتوث، GPS پیشرفته و Geofencing | انجام شده | ML Kit Barcode، اتصال پرینتر 80mm، FusedLocationProvider، ثبت Check-In/Out | ui/screens/scan/ScanScreen.kt, ui/screens/print/PrintScreen.kt, app/build.gradle.kts |
| ۶ | تکمیل اپ توزیع/موزع و فروش تلفنی | انجام شده | Hilt، Room، WorkManager، Security Crypto، زیرساخت آماده برای تحویل/POD/وصول/تسویه | apps/distributor/, apps/telesales/ با DI + Room + WorkManager |
