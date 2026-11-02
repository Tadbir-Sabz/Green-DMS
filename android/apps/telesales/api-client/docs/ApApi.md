# ApApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**apGet**](ApApi.md#apGet) | **GET** /ap | دفتر بدهکاری تأمین‌کنندگان و سنی پرداختنی |


<a id="apGet"></a>
# **apGet**
> ApGet200Response apGet(cursor, limit, supplierPersonId)

دفتر بدهکاری تأمین‌کنندگان و سنی پرداختنی

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ApApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val supplierPersonId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : ApGet200Response = apiInstance.apGet(cursor, limit, supplierPersonId)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ApApi#apGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ApApi#apGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **supplierPersonId** | **java.util.UUID**|  | [optional] |

### Return type

[**ApGet200Response**](ApGet200Response.md)

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

