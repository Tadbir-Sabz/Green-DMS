# RequestsApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**requestsGet**](RequestsApi.md#requestsGet) | **GET** /requests | فهرست درخواست‌های مشتری (پرتال/تلفنی/میدانی) |
| [**requestsIdConvertPost**](RequestsApi.md#requestsIdConvertPost) | **POST** /requests/{id}/convert | تبدیل درخواست تأییدشده به سفارش فروش |
| [**requestsIdGet**](RequestsApi.md#requestsIdGet) | **GET** /requests/{id} | جزئیات درخواست |
| [**requestsIdPatch**](RequestsApi.md#requestsIdPatch) | **PATCH** /requests/{id} | به‌روزرسانی درخواست |
| [**requestsPost**](RequestsApi.md#requestsPost) | **POST** /requests | ثبت درخواست مشتری (همگام‌سازی آفلاین با client_uuid امن است) |


<a id="requestsGet"></a>
# **requestsGet**
> RequestsGet200Response requestsGet(cursor, limit, customerId, status, channel)

فهرست درخواست‌های مشتری (پرتال/تلفنی/میدانی)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = RequestsApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val customerId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val status : kotlin.String = status_example // kotlin.String | 
val channel : kotlin.String = channel_example // kotlin.String | 
try {
    val result : RequestsGet200Response = apiInstance.requestsGet(cursor, limit, customerId, status, channel)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling RequestsApi#requestsGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling RequestsApi#requestsGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **customerId** | **java.util.UUID**|  | [optional] |
| **status** | **kotlin.String**|  | [optional] |
| **channel** | **kotlin.String**|  | [optional] [enum: field, telesale, portal, walk_in] |

### Return type

[**RequestsGet200Response**](RequestsGet200Response.md)

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

<a id="requestsIdConvertPost"></a>
# **requestsIdConvertPost**
> SalesOrder requestsIdConvertPost(id)

تبدیل درخواست تأییدشده به سفارش فروش

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = RequestsApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : SalesOrder = apiInstance.requestsIdConvertPost(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling RequestsApi#requestsIdConvertPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling RequestsApi#requestsIdConvertPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**SalesOrder**](SalesOrder.md)

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

<a id="requestsIdGet"></a>
# **requestsIdGet**
> CustomerRequest requestsIdGet(id)

جزئیات درخواست

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = RequestsApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : CustomerRequest = apiInstance.requestsIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling RequestsApi#requestsIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling RequestsApi#requestsIdGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**CustomerRequest**](CustomerRequest.md)

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

<a id="requestsIdPatch"></a>
# **requestsIdPatch**
> CustomerRequest requestsIdPatch(id, customerRequest)

به‌روزرسانی درخواست

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = RequestsApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val customerRequest : CustomerRequest =  // CustomerRequest | 
try {
    val result : CustomerRequest = apiInstance.requestsIdPatch(id, customerRequest)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling RequestsApi#requestsIdPatch")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling RequestsApi#requestsIdPatch")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |
| **customerRequest** | [**CustomerRequest**](CustomerRequest.md)|  | |

### Return type

[**CustomerRequest**](CustomerRequest.md)

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

<a id="requestsPost"></a>
# **requestsPost**
> CustomerRequest requestsPost(customerRequest)

ثبت درخواست مشتری (همگام‌سازی آفلاین با client_uuid امن است)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = RequestsApi()
val customerRequest : CustomerRequest =  // CustomerRequest | 
try {
    val result : CustomerRequest = apiInstance.requestsPost(customerRequest)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling RequestsApi#requestsPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling RequestsApi#requestsPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **customerRequest** | [**CustomerRequest**](CustomerRequest.md)|  | |

### Return type

[**CustomerRequest**](CustomerRequest.md)

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

