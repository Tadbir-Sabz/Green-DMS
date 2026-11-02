# VisitsApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**visitsGet**](VisitsApi.md#visitsGet) | **GET** /visits | فهرست بازدیدها (برای سرپرست و مدیریت) |
| [**visitsIdGet**](VisitsApi.md#visitsIdGet) | **GET** /visits/{id} | جزئیات بازدید |
| [**visitsIdPatch**](VisitsApi.md#visitsIdPatch) | **PATCH** /visits/{id} | ثبت check-out و نتیجه بازدید (بدون سفارش/علت) |
| [**visitsPost**](VisitsApi.md#visitsPost) | **POST** /visits | ثبت بازدید (check-in با مختصات — ضدتقلب GPS) |


<a id="visitsGet"></a>
# **visitsGet**
> VisitsGet200Response visitsGet(cursor, limit, tourId, customerId)

فهرست بازدیدها (برای سرپرست و مدیریت)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = VisitsApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val tourId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val customerId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : VisitsGet200Response = apiInstance.visitsGet(cursor, limit, tourId, customerId)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling VisitsApi#visitsGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling VisitsApi#visitsGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **tourId** | **java.util.UUID**|  | [optional] |
| **customerId** | **java.util.UUID**|  | [optional] |

### Return type

[**VisitsGet200Response**](VisitsGet200Response.md)

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

<a id="visitsIdGet"></a>
# **visitsIdGet**
> Visit visitsIdGet(id)

جزئیات بازدید

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = VisitsApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : Visit = apiInstance.visitsIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling VisitsApi#visitsIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling VisitsApi#visitsIdGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**Visit**](Visit.md)

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

<a id="visitsIdPatch"></a>
# **visitsIdPatch**
> Visit visitsIdPatch(id, visit)

ثبت check-out و نتیجه بازدید (بدون سفارش/علت)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = VisitsApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val visit : Visit =  // Visit | 
try {
    val result : Visit = apiInstance.visitsIdPatch(id, visit)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling VisitsApi#visitsIdPatch")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling VisitsApi#visitsIdPatch")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |
| **visit** | [**Visit**](Visit.md)|  | |

### Return type

[**Visit**](Visit.md)

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

<a id="visitsPost"></a>
# **visitsPost**
> Visit visitsPost(visit)

ثبت بازدید (check-in با مختصات — ضدتقلب GPS)

اپ فروشنده با check-in شروع بازدید را ثبت می‌کند؛ سرور فاصله از موقعیت مشتری و دقت GPS را می‌سنجد و در صورت &#x60;is_mocked&#x60; یا فاصله زیاد، رویداد ضدتقلب ثبت می‌کند (ماژول ۶). 

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = VisitsApi()
val visit : Visit =  // Visit | 
try {
    val result : Visit = apiInstance.visitsPost(visit)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling VisitsApi#visitsPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling VisitsApi#visitsPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **visit** | [**Visit**](Visit.md)|  | |

### Return type

[**Visit**](Visit.md)

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

