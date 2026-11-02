# ReportsApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**reportsGet**](ReportsApi.md#reportsGet) | **GET** /reports | فهرست گزارش‌های مجاز کاربر (ضمیمه C) |
| [**reportsKeyGet**](ReportsApi.md#reportsKeyGet) | **GET** /reports/{key} | اجرای گزارش با پارامترهای فیلتر |


<a id="reportsGet"></a>
# **reportsGet**
> ReportsGet200Response reportsGet()

فهرست گزارش‌های مجاز کاربر (ضمیمه C)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ReportsApi()
try {
    val result : ReportsGet200Response = apiInstance.reportsGet()
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ReportsApi#reportsGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ReportsApi#reportsGet")
    e.printStackTrace()
}
```

### Parameters
This endpoint does not need any parameter.

### Return type

[**ReportsGet200Response**](ReportsGet200Response.md)

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

<a id="reportsKeyGet"></a>
# **reportsKeyGet**
> ReportsKeyGet200Response reportsKeyGet(key, from, to, format)

اجرای گزارش با پارامترهای فیلتر

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ReportsApi()
val key : kotlin.String = key_example // kotlin.String | 
val from : java.time.LocalDate = 2013-10-20 // java.time.LocalDate | 
val to : java.time.LocalDate = 2013-10-20 // java.time.LocalDate | 
val format : kotlin.String = format_example // kotlin.String | 
try {
    val result : ReportsKeyGet200Response = apiInstance.reportsKeyGet(key, from, to, format)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ReportsApi#reportsKeyGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ReportsApi#reportsKeyGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **key** | **kotlin.String**|  | |
| **from** | **java.time.LocalDate**|  | [optional] |
| **to** | **java.time.LocalDate**|  | [optional] |
| **format** | **kotlin.String**|  | [optional] [default to Format.json] [enum: json, csv, xlsx] |

### Return type

[**ReportsKeyGet200Response**](ReportsKeyGet200Response.md)

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

