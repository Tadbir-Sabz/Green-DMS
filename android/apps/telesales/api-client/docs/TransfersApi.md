# TransfersApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**transfersGet**](TransfersApi.md#transfersGet) | **GET** /transfers | فهرست انتقالات بین‌انباری |
| [**transfersIdGet**](TransfersApi.md#transfersIdGet) | **GET** /transfers/{id} | جزئیات انتقال |
| [**transfersPost**](TransfersApi.md#transfersPost) | **POST** /transfers | ثبت انتقال بین‌انباری (برای بارگیری خودرو) |


<a id="transfersGet"></a>
# **transfersGet**
> TransfersGet200Response transfersGet(cursor, limit)

فهرست انتقالات بین‌انباری

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = TransfersApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
try {
    val result : TransfersGet200Response = apiInstance.transfersGet(cursor, limit)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling TransfersApi#transfersGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling TransfersApi#transfersGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |

### Return type

[**TransfersGet200Response**](TransfersGet200Response.md)

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

<a id="transfersIdGet"></a>
# **transfersIdGet**
> Transfer transfersIdGet(id)

جزئیات انتقال

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = TransfersApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : Transfer = apiInstance.transfersIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling TransfersApi#transfersIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling TransfersApi#transfersIdGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**Transfer**](Transfer.md)

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

<a id="transfersPost"></a>
# **transfersPost**
> Transfer transfersPost(transfer)

ثبت انتقال بین‌انباری (برای بارگیری خودرو)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = TransfersApi()
val transfer : Transfer =  // Transfer | 
try {
    val result : Transfer = apiInstance.transfersPost(transfer)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling TransfersApi#transfersPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling TransfersApi#transfersPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **transfer** | [**Transfer**](Transfer.md)|  | |

### Return type

[**Transfer**](Transfer.md)

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

