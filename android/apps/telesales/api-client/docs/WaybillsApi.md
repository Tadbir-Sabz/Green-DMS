# WaybillsApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**waybillsGet**](WaybillsApi.md#waybillsGet) | **GET** /waybills | فهرست حواله‌ها |
| [**waybillsIdGet**](WaybillsApi.md#waybillsIdGet) | **GET** /waybills/{id} | جزئیات حواله |
| [**waybillsPost**](WaybillsApi.md#waybillsPost) | **POST** /waybills | صدور حواله انبار برای سفارش تأییدشده |


<a id="waybillsGet"></a>
# **waybillsGet**
> WaybillsGet200Response waybillsGet(cursor, limit, orderId, status)

فهرست حواله‌ها

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = WaybillsApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val orderId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val status : kotlin.String = status_example // kotlin.String | 
try {
    val result : WaybillsGet200Response = apiInstance.waybillsGet(cursor, limit, orderId, status)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling WaybillsApi#waybillsGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling WaybillsApi#waybillsGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **orderId** | **java.util.UUID**|  | [optional] |
| **status** | **kotlin.String**|  | [optional] |

### Return type

[**WaybillsGet200Response**](WaybillsGet200Response.md)

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

<a id="waybillsIdGet"></a>
# **waybillsIdGet**
> Waybill waybillsIdGet(id)

جزئیات حواله

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = WaybillsApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : Waybill = apiInstance.waybillsIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling WaybillsApi#waybillsIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling WaybillsApi#waybillsIdGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**Waybill**](Waybill.md)

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

<a id="waybillsPost"></a>
# **waybillsPost**
> Waybill waybillsPost(waybill)

صدور حواله انبار برای سفارش تأییدشده

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = WaybillsApi()
val waybill : Waybill =  // Waybill | 
try {
    val result : Waybill = apiInstance.waybillsPost(waybill)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling WaybillsApi#waybillsPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling WaybillsApi#waybillsPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **waybill** | [**Waybill**](Waybill.md)|  | |

### Return type

[**Waybill**](Waybill.md)

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

