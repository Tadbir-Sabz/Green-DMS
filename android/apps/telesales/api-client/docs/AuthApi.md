# AuthApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**authLoginPost**](AuthApi.md#authLoginPost) | **POST** /auth/login | ورود با نام کاربری/رمز + ارسال کد OTP |
| [**authLogoutPost**](AuthApi.md#authLogoutPost) | **POST** /auth/logout | خروج و ابطال نشست جاری |
| [**authMeGet**](AuthApi.md#authMeGet) | **GET** /auth/me | نشست جاری — کاربر، نقش‌ها و مجوزهای قابل اتکا برای رابط کاربری |
| [**authOtpRequestPost**](AuthApi.md#authOtpRequestPost) | **POST** /auth/otp/request | درخواست کد یک‌بارمصرف پیامکی |
| [**authOtpVerifyPost**](AuthApi.md#authOtpVerifyPost) | **POST** /auth/otp/verify | تأیید کد OTP و صدور نشست |
| [**authPasswordResetPost**](AuthApi.md#authPasswordResetPost) | **POST** /auth/password-reset | بازیابی رمز عبور با کد OTP (purpose&#x3D;password_reset) |
| [**authRefreshPost**](AuthApi.md#authRefreshPost) | **POST** /auth/refresh | تازه‌سازی نشست با Refresh Token |


<a id="authLoginPost"></a>
# **authLoginPost**
> AuthSession authLoginPost(loginRequest)

ورود با نام کاربری/رمز + ارسال کد OTP

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = AuthApi()
val loginRequest : LoginRequest =  // LoginRequest | 
try {
    val result : AuthSession = apiInstance.authLoginPost(loginRequest)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling AuthApi#authLoginPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling AuthApi#authLoginPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **loginRequest** | [**LoginRequest**](LoginRequest.md)|  | |

### Return type

[**AuthSession**](AuthSession.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

<a id="authLogoutPost"></a>
# **authLogoutPost**
> authLogoutPost()

خروج و ابطال نشست جاری

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = AuthApi()
try {
    apiInstance.authLogoutPost()
} catch (e: ClientException) {
    println("4xx response calling AuthApi#authLogoutPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling AuthApi#authLogoutPost")
    e.printStackTrace()
}
```

### Parameters
This endpoint does not need any parameter.

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

<a id="authMeGet"></a>
# **authMeGet**
> SessionContext authMeGet()

نشست جاری — کاربر، نقش‌ها و مجوزهای قابل اتکا برای رابط کاربری

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = AuthApi()
try {
    val result : SessionContext = apiInstance.authMeGet()
    println(result)
} catch (e: ClientException) {
    println("4xx response calling AuthApi#authMeGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling AuthApi#authMeGet")
    e.printStackTrace()
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**SessionContext**](SessionContext.md)

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

<a id="authOtpRequestPost"></a>
# **authOtpRequestPost**
> authOtpRequestPost(authOtpRequestPostRequest)

درخواست کد یک‌بارمصرف پیامکی

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = AuthApi()
val authOtpRequestPostRequest : AuthOtpRequestPostRequest =  // AuthOtpRequestPostRequest | 
try {
    apiInstance.authOtpRequestPost(authOtpRequestPostRequest)
} catch (e: ClientException) {
    println("4xx response calling AuthApi#authOtpRequestPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling AuthApi#authOtpRequestPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **authOtpRequestPostRequest** | [**AuthOtpRequestPostRequest**](AuthOtpRequestPostRequest.md)|  | |

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

<a id="authOtpVerifyPost"></a>
# **authOtpVerifyPost**
> AuthSession authOtpVerifyPost(authOtpVerifyPostRequest)

تأیید کد OTP و صدور نشست

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = AuthApi()
val authOtpVerifyPostRequest : AuthOtpVerifyPostRequest =  // AuthOtpVerifyPostRequest | 
try {
    val result : AuthSession = apiInstance.authOtpVerifyPost(authOtpVerifyPostRequest)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling AuthApi#authOtpVerifyPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling AuthApi#authOtpVerifyPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **authOtpVerifyPostRequest** | [**AuthOtpVerifyPostRequest**](AuthOtpVerifyPostRequest.md)|  | |

### Return type

[**AuthSession**](AuthSession.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

<a id="authPasswordResetPost"></a>
# **authPasswordResetPost**
> authPasswordResetPost(passwordResetRequest)

بازیابی رمز عبور با کد OTP (purpose&#x3D;password_reset)

کد باید پیش‌تر با purpose&#x3D;password_reset درخواست شده باشد. پس از مصرفِ اتمیک کد، رمز عبور عوض می‌شود، قفل و شمارنده تلاش‌های ناموفق پاک و همه نشست‌های باز کاربر با revoked_reason&#x3D;password_reset باطل می‌شود. پاسخ برای نامِ موجود بدون کدِ معتبر و نامِ ناشناخته یکسان است تا وجود حساب لو نرود.

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = AuthApi()
val passwordResetRequest : PasswordResetRequest =  // PasswordResetRequest | 
try {
    apiInstance.authPasswordResetPost(passwordResetRequest)
} catch (e: ClientException) {
    println("4xx response calling AuthApi#authPasswordResetPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling AuthApi#authPasswordResetPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **passwordResetRequest** | [**PasswordResetRequest**](PasswordResetRequest.md)|  | |

### Return type

null (empty response body)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

<a id="authRefreshPost"></a>
# **authRefreshPost**
> AuthSession authRefreshPost(authRefreshPostRequest)

تازه‌سازی نشست با Refresh Token

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = AuthApi()
val authRefreshPostRequest : AuthRefreshPostRequest =  // AuthRefreshPostRequest | 
try {
    val result : AuthSession = apiInstance.authRefreshPost(authRefreshPostRequest)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling AuthApi#authRefreshPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling AuthApi#authRefreshPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **authRefreshPostRequest** | [**AuthRefreshPostRequest**](AuthRefreshPostRequest.md)|  | |

### Return type

[**AuthSession**](AuthSession.md)

### Authorization

No authorization required

### HTTP request headers

 - **Content-Type**: application/json
 - **Accept**: application/json

