# UsersApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**devicesGet**](UsersApi.md#devicesGet) | **GET** /devices | فهرست دستگاه‌های مجاز کاربر جاری |
| [**devicesIdDelete**](UsersApi.md#devicesIdDelete) | **DELETE** /devices/{id} | ابطال دستگاه از راه دور (گم‌شدن/فروش گوشی) |
| [**devicesPost**](UsersApi.md#devicesPost) | **POST** /devices | ثبت دستگاه کاربر جاری (پیش‌شرط فعال‌سازی با OTP) |
| [**usersGet**](UsersApi.md#usersGet) | **GET** /users | فهرست کاربران (فیلتر نقش/فعال/حوزه) |
| [**usersIdDelete**](UsersApi.md#usersIdDelete) | **DELETE** /users/{id} | غیرفعال‌سازی کاربر (حذف فیزیکی ممنوع — ممیزی) |
| [**usersIdGet**](UsersApi.md#usersIdGet) | **GET** /users/{id} | جزئیات کاربر |
| [**usersIdPatch**](UsersApi.md#usersIdPatch) | **PATCH** /users/{id} | به‌روزرسانی کاربر (نقش، فعالیت، قفل حساب) |
| [**usersPost**](UsersApi.md#usersPost) | **POST** /users | ساخت کاربر سیستم (فقط برای «کاربر سیستم»؛ فروشنده صرفاً پرسنل است) |


<a id="devicesGet"></a>
# **devicesGet**
> DevicesGet200Response devicesGet(cursor, limit)

فهرست دستگاه‌های مجاز کاربر جاری

فقط دستگاه‌های خودِ کاربرِ واردشده (از روی نشست)، بدون نیاز به مجوز جداگانه

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = UsersApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
try {
    val result : DevicesGet200Response = apiInstance.devicesGet(cursor, limit)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling UsersApi#devicesGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling UsersApi#devicesGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |

### Return type

[**DevicesGet200Response**](DevicesGet200Response.md)

### Authorization


Configure bearerAuth statically:
```kotlin
ApiClient.accessToken = ""
```
Configure bearerAuth dynamically:
```kotlin
apiInstance.accessTokenProvider = { "" }
```

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

<a id="devicesIdDelete"></a>
# **devicesIdDelete**
> devicesIdDelete(id)

ابطال دستگاه از راه دور (گم‌شدن/فروش گوشی)

دستگاه باطل می‌شود (revoked_at) و همه نشست‌های فعالِ روی همان دستگاه نیز با revoked_reason&#x3D;device_revoked ابطال می‌گردند؛ ردیف برای ممیزی می‌ماند. ابطال مجدد همان دستگاه هم 204 برمی‌گرداند (idempotent).

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = UsersApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    apiInstance.devicesIdDelete(id)
} catch (e: ClientException) {
    println("4xx response calling UsersApi#devicesIdDelete")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling UsersApi#devicesIdDelete")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

null (empty response body)

### Authorization


Configure bearerAuth statically:
```kotlin
ApiClient.accessToken = ""
```
Configure bearerAuth dynamically:
```kotlin
apiInstance.accessTokenProvider = { "" }
```

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

<a id="devicesPost"></a>
# **devicesPost**
> Device devicesPost(deviceCreate)

ثبت دستگاه کاربر جاری (پیش‌شرط فعال‌سازی با OTP)

device_uuid باید برای هر کاربر یکتا باشد. دستگاه تازه با is_trusted&#x3D;false ثبت می‌شود و تا تأیید با کد پیامکی (purpose&#x3D;device_bind روی /auth/otp/verify) دستگاه مجاز به‌شمار نمی‌رود. ثبت دوباره دستگاهِ باطل‌شدهٔ همان کاربر آن را دوباره فعال می‌کند، اما دستگاهِ متعلق به کاربر دیگر 409 می‌دهد.

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = UsersApi()
val deviceCreate : DeviceCreate =  // DeviceCreate | 
try {
    val result : Device = apiInstance.devicesPost(deviceCreate)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling UsersApi#devicesPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling UsersApi#devicesPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **deviceCreate** | [**DeviceCreate**](DeviceCreate.md)|  | |

### Return type

[**Device**](Device.md)

### Authorization


Configure bearerAuth statically:
```kotlin
ApiClient.accessToken = ""
```
Configure bearerAuth dynamically:
```kotlin
apiInstance.accessTokenProvider = { "" }
```

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

<a id="usersGet"></a>
# **usersGet**
> UsersGet200Response usersGet(cursor, limit, role, isActive)

فهرست کاربران (فیلتر نقش/فعال/حوزه)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = UsersApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val role : kotlin.String = role_example // kotlin.String | 
val isActive : kotlin.Boolean = true // kotlin.Boolean | 
try {
    val result : UsersGet200Response = apiInstance.usersGet(cursor, limit, role, isActive)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling UsersApi#usersGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling UsersApi#usersGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **role** | **kotlin.String**|  | [optional] |
| **isActive** | **kotlin.Boolean**|  | [optional] |

### Return type

[**UsersGet200Response**](UsersGet200Response.md)

### Authorization


Configure bearerAuth statically:
```kotlin
ApiClient.accessToken = ""
```
Configure bearerAuth dynamically:
```kotlin
apiInstance.accessTokenProvider = { "" }
```

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

<a id="usersIdDelete"></a>
# **usersIdDelete**
> usersIdDelete(id)

غیرفعال‌سازی کاربر (حذف فیزیکی ممنوع — ممیزی)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = UsersApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    apiInstance.usersIdDelete(id)
} catch (e: ClientException) {
    println("4xx response calling UsersApi#usersIdDelete")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling UsersApi#usersIdDelete")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

null (empty response body)

### Authorization


Configure bearerAuth statically:
```kotlin
ApiClient.accessToken = ""
```
Configure bearerAuth dynamically:
```kotlin
apiInstance.accessTokenProvider = { "" }
```

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

<a id="usersIdGet"></a>
# **usersIdGet**
> User usersIdGet(id)

جزئیات کاربر

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = UsersApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : User = apiInstance.usersIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling UsersApi#usersIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling UsersApi#usersIdGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**User**](User.md)

### Authorization


Configure bearerAuth statically:
```kotlin
ApiClient.accessToken = ""
```
Configure bearerAuth dynamically:
```kotlin
apiInstance.accessTokenProvider = { "" }
```

### HTTP request headers

 - **Content-Type**: Not defined
 - **Accept**: application/json

<a id="usersIdPatch"></a>
# **usersIdPatch**
> User usersIdPatch(id, user)

به‌روزرسانی کاربر (نقش، فعالیت، قفل حساب)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = UsersApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val user : User =  // User | 
try {
    val result : User = apiInstance.usersIdPatch(id, user)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling UsersApi#usersIdPatch")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling UsersApi#usersIdPatch")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |
| **user** | [**User**](User.md)|  | |

### Return type

[**User**](User.md)

### Authorization


Configure bearerAuth statically:
```kotlin
ApiClient.accessToken = ""
```
Configure bearerAuth dynamically:
```kotlin
apiInstance.accessTokenProvider = { "" }
```

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

<a id="usersPost"></a>
# **usersPost**
> User usersPost(user)

ساخت کاربر سیستم (فقط برای «کاربر سیستم»؛ فروشنده صرفاً پرسنل است)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = UsersApi()
val user : User =  // User | 
try {
    val result : User = apiInstance.usersPost(user)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling UsersApi#usersPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling UsersApi#usersPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **user** | [**User**](User.md)|  | |

### Return type

[**User**](User.md)

### Authorization


Configure bearerAuth statically:
```kotlin
ApiClient.accessToken = ""
```
Configure bearerAuth dynamically:
```kotlin
apiInstance.accessTokenProvider = { "" }
```

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

