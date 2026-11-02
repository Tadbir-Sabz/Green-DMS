# StockApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**stockAdjustmentsPost**](StockApi.md#stockAdjustmentsPost) | **POST** /stock/adjustments | اصلاحیه موجودی (با دلیل و مجوز کنترلی) |
| [**stockGet**](StockApi.md#stockGet) | **GET** /stock | موجودی انبار (فیلتر انبار/کالا/بچ؛ موجودی قابل رزرو) |


<a id="stockAdjustmentsPost"></a>
# **stockAdjustmentsPost**
> StockAdjustment stockAdjustmentsPost(stockAdjustment)

اصلاحیه موجودی (با دلیل و مجوز کنترلی)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = StockApi()
val stockAdjustment : StockAdjustment =  // StockAdjustment | 
try {
    val result : StockAdjustment = apiInstance.stockAdjustmentsPost(stockAdjustment)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling StockApi#stockAdjustmentsPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling StockApi#stockAdjustmentsPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **stockAdjustment** | [**StockAdjustment**](StockAdjustment.md)|  | |

### Return type

[**StockAdjustment**](StockAdjustment.md)

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

<a id="stockGet"></a>
# **stockGet**
> StockGet200Response stockGet(cursor, limit, warehouseId, productId, batchId)

موجودی انبار (فیلتر انبار/کالا/بچ؛ موجودی قابل رزرو)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = StockApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val warehouseId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val productId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val batchId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : StockGet200Response = apiInstance.stockGet(cursor, limit, warehouseId, productId, batchId)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling StockApi#stockGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling StockApi#stockGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **warehouseId** | **java.util.UUID**|  | [optional] |
| **productId** | **java.util.UUID**|  | [optional] |
| **batchId** | **java.util.UUID**|  | [optional] |

### Return type

[**StockGet200Response**](StockGet200Response.md)

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

