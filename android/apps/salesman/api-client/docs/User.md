
# User

## Properties
| Name | Type | Description | Notes |
| ------------ | ------------- | ------------- | ------------- |
| **username** | **kotlin.String** |  |  |
| **id** | [**java.util.UUID**](java.util.UUID.md) |  |  [optional] [readonly] |
| **staffId** | [**java.util.UUID**](java.util.UUID.md) | نسبت به پرسنل، در صورت وجود |  [optional] |
| **roleIds** | [**kotlin.collections.List&lt;java.util.UUID&gt;**](java.util.UUID.md) |  |  [optional] |
| **isActive** | **kotlin.Boolean** |  |  [optional] |
| **lockedUntil** | [**java.time.OffsetDateTime**](java.time.OffsetDateTime.md) |  |  [optional] [readonly] |
| **lastLoginAt** | [**java.time.OffsetDateTime**](java.time.OffsetDateTime.md) |  |  [optional] [readonly] |
| **createdAt** | [**java.time.OffsetDateTime**](java.time.OffsetDateTime.md) |  |  [optional] [readonly] |
| **password** | **kotlin.String** | رمز عبور؛ هش آن ذخیره می‌شود و در پاسخ هرگز برنمی‌گردد |  [optional] |
| **accessLevel** | [**inline**](#AccessLevel) | سطح دسترسی کاربر (check app_user_access_level — مهاجرت 0004 §۱.۴) |  [optional] |
| **isLocked** | **kotlin.Boolean** | قفل دستی توسط مدیر: در GET /users وضعیت فعلی قفل را می‌دهد و در POST/PATCH دستور قفل (true) یا باز کردن قفل و صفر کردن شمارنده تلاش (false) است  |  [optional] |
| **personCode** | **kotlin.String** | کد شخص تازه — فقط وقتی staff_id داده نشده باشد (پیش‌فرض USR-نام کاربری) |  [optional] |
| **firstName** | **kotlin.String** | نام شخص تازه — فقط وقتی staff_id داده نشده باشد |  [optional] |
| **lastName** | **kotlin.String** | نام خانوادگی شخص تازه — فقط وقتی staff_id داده نشده باشد |  [optional] |


<a id="AccessLevel"></a>
## Enum: access_level
| Name | Value |
| ---- | ----- |
| accessLevel | web, field_sales, field_delivery, field_telesales, scope_only, none |



