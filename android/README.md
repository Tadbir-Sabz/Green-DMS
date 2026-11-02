# کلاینت Kotlin سامانه Green-DMS (اپ‌های اندروید)

این پوشه **اسکلت کلاینت Kotlin** برای سه اپ اندرویدی (فروشنده، موزع، فروشنده تلفنی) است که
از قرارداد مشترک `packages/contracts/openapi.yaml` تولید شده — همان سندی که وب‌اپ از آن
کلاینت TypeScript می‌گیرد؛ پس وب و اپ‌ها هیچ‌وقت از هم فاصله نمی‌گیرند.

## تولید / تولید دوباره

```bash
npm run clients:generate     # از ریشه پروژه — هر دو کلاینت (TS و Kotlin) را بازتولید می‌کند
```

- خروجی در `android/client/` است و **دستی ویرایش نشود** (با تغییر قرارداد بازتولید می‌شود).
- ابزار موردنیاز (`openapi-generator-cli` و JRE) بار اول خودکار در `tools/` دانلود می‌شود؛
  این پوشه در `.gitignore` هست.
- تولیدکننده: `openapi-generator 7.26` — ژنراتور `kotlin` با کتابخانه `jvm-okhttp4`
  و `useCoroutines=true` (متدهای `suspend` با `Dispatchers.IO`).

## ساختار

```
android/
├── README.md              ← همین فایل
└── client/                ← خروجی openapi-generator (module گرادل)
    ├── build.gradle       ← کتابخانه Kotlin/JVM خالص (بدون وابستگی به Android SDK)
    ├── settings.gradle
    ├── gradlew / gradlew.bat
    ├── docs/              ← مستندات هر مدل و endpoint
    └── src/main/kotlin/com/greendms/api/client/
        ├── apis/          ← یک Api class به ازای هر گروه tag (AuthApi, ProductsApi, …)
        ├── infrastructure/← کلاینت OkHttp، auth، serializers، ApiResponse
        └── models/        ← مدل‌های تایپ‌شده اسکیماها
```

## استفاده در اپ اندروید

۱. `android/client` را به‌عنوان module به پروژه اندروید اضافه کنید (در `settings.gradle`):
   ```groovy
   include ':green-dms-api-client'
   project(':green-dms-api-client').projectDir = file('../Green-DMS/android/client')
   ```
۲. در `build.gradle` ماژول اپ:
   ```groovy
   implementation project(':green-dms-api-client')
   ```
۳. نمونه استفاده (با توکن نشست):
   ```kotlin
   val client = ApiClient(basePath = "http://10.0.2.2:4000/api/v1")
   (client.client.auths.firstOrNull() as? ApiKeyAuth)?.apply {
       apiKey = "Bearer $accessToken"
       apiKeyPrefix = ""
   }
   val auth = AuthApi(client)
   val session = auth.authLoginPost(LoginRequest(username = "seller", password = "..."))
   ```

## نکته‌ها

- **نسخه‌بندی قرارداد:** مسیر همه منابع `/api/v1` است؛ تغییر ناسازگار فقط با نسخه جدید.
- احراز هویت: JWT کوتاه‌عمر + refresh در `/auth/refresh`؛ اپ‌ها OTP را از `/auth/otp/*` می‌گیرند.
- خطاها همه‌جا قرارداد یکسان `{code, message_fa, details, request_id}` دارند.
- صفحه‌بندی مبتنی بر cursor است (`next_cursor`, `has_more`)؛ سند‌های میدانی `client_uuid`
  یکتا می‌فرستند تا اعمال آفلاین تکراری نشود.
