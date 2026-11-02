# StocktakesApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**stocktakesGet**](StocktakesApi.md#stocktakesGet) | **GET** /stocktakes | فهرست سند انبارگردانی |
| [**stocktakesIdGet**](StocktakesApi.md#stocktakesIdGet) | **GET** /stocktakes/{id} | جزئیات انبارگردانی با اقلام و مغایرت‌ها |
| [**stocktakesIdPatch**](StocktakesApi.md#stocktakesIdPatch) | **PATCH** /stocktakes/{id} | ثبت شمارش اقلام |
| [**stocktakesIdSubmitPost**](StocktakesApi.md#stocktakesIdSubmitPost) | **POST** /stocktakes/{id}/submit | پایان انبارگردانی و اعمال مغایرت‌ها (نیازمند تأیید) |
| [**stocktakesPost**](StocktakesApi.md#stocktakesPost) | **POST** /stocktakes | شروع انبارگردانی برای انبار |


<a id="stocktakesGet"></a>
# **stocktakesGet**
> StocktakesGet200Response stocktakesGet(cursor, limit, status)

فهرست سند انبارگردانی

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = StocktakesApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val status : kotlin.String = status_example // kotlin.String | 
try {
    val result : StocktakesGet200Response = apiInstance.stocktakesGet(cursor, limit, status)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling StocktakesApi#stocktakesGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling StocktakesApi#stocktakesGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **status** | **kotlin.String**|  | [optional] |

### Return type

[**StocktakesGet200Response**](StocktakesGet200Response.md)

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

<a id="stocktakesIdGet"></a>
# **stocktakesIdGet**
> StockTake stocktakesIdGet(id)

جزئیات انبارگردانی با اقلام و مغایرت‌ها

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = StocktakesApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : StockTake = apiInstance.stocktakesIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling StocktakesApi#stocktakesIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling StocktakesApi#stocktakesIdGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**StockTake**](StockTake.md)

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

<a id="stocktakesIdPatch"></a>
# **stocktakesIdPatch**
> StockTake stocktakesIdPatch(id, stockTake)

ثبت شمارش اقلام

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = StocktakesApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val stockTake : StockTake =  // StockTake | 
try {
    val result : StockTake = apiInstance.stocktakesIdPatch(id, stockTake)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling StocktakesApi#stocktakesIdPatch")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling StocktakesApi#stocktakesIdPatch")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |
| **stockTake** | [**StockTake**](StockTake.md)|  | |

### Return type

[**StockTake**](StockTake.md)

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

<a id="stocktakesIdSubmitPost"></a>
# **stocktakesIdSubmitPost**
> StockTake stocktakesIdSubmitPost(id)

پایان انبارگردانی و اعمال مغایرت‌ها (نیازمند تأیید)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = StocktakesApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : StockTake = apiInstance.stocktakesIdSubmitPost(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling StocktakesApi#stocktakesIdSubmitPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling StocktakesApi#stocktakesIdSubmitPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**StockTake**](StockTake.md)

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

<a id="stocktakesPost"></a>
# **stocktakesPost**
> StockTake stocktakesPost(stockTake)

شروع انبارگردانی برای انبار

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = StocktakesApi()
val stockTake : StockTake =  // StockTake | 
try {
    val result : StockTake = apiInstance.stocktakesPost(stockTake)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling StocktakesApi#stocktakesPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling StocktakesApi#stocktakesPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **stockTake** | [**StockTake**](StockTake.md)|  | |

### Return type

[**StockTake**](StockTake.md)

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

