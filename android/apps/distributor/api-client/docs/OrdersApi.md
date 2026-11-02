# OrdersApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**ordersGet**](OrdersApi.md#ordersGet) | **GET** /orders | فهرست سفارش‌های فروش |
| [**ordersIdApprovePost**](OrdersApi.md#ordersIdApprovePost) | **POST** /orders/{id}/approve | تأیید سفارش (در صورت نیاز از طریق صف approvals) |
| [**ordersIdGet**](OrdersApi.md#ordersIdGet) | **GET** /orders/{id} | جزئیات سفارش با اقلام |
| [**ordersIdPatch**](OrdersApi.md#ordersIdPatch) | **PATCH** /orders/{id} | ویرایش سفارش (فقط پیش از تأیید نهایی) |
| [**ordersPost**](OrdersApi.md#ordersPost) | **POST** /orders | ثبت سفارش فروش (اعتبارسنجی اعتبار/قیمت/قانون قبل از تأیید) |


<a id="ordersGet"></a>
# **ordersGet**
> OrdersGet200Response ordersGet(cursor, limit, customerId, tourId, status, orderDate)

فهرست سفارش‌های فروش

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = OrdersApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val customerId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val tourId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val status : kotlin.String = status_example // kotlin.String | 
val orderDate : java.time.LocalDate = 2013-10-20 // java.time.LocalDate | 
try {
    val result : OrdersGet200Response = apiInstance.ordersGet(cursor, limit, customerId, tourId, status, orderDate)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling OrdersApi#ordersGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling OrdersApi#ordersGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **customerId** | **java.util.UUID**|  | [optional] |
| **tourId** | **java.util.UUID**|  | [optional] |
| **status** | **kotlin.String**|  | [optional] |
| **orderDate** | **java.time.LocalDate**|  | [optional] |

### Return type

[**OrdersGet200Response**](OrdersGet200Response.md)

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

<a id="ordersIdApprovePost"></a>
# **ordersIdApprovePost**
> SalesOrder ordersIdApprovePost(id)

تأیید سفارش (در صورت نیاز از طریق صف approvals)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = OrdersApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : SalesOrder = apiInstance.ordersIdApprovePost(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling OrdersApi#ordersIdApprovePost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling OrdersApi#ordersIdApprovePost")
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

<a id="ordersIdGet"></a>
# **ordersIdGet**
> SalesOrder ordersIdGet(id)

جزئیات سفارش با اقلام

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = OrdersApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : SalesOrder = apiInstance.ordersIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling OrdersApi#ordersIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling OrdersApi#ordersIdGet")
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

<a id="ordersIdPatch"></a>
# **ordersIdPatch**
> SalesOrder ordersIdPatch(id, salesOrder)

ویرایش سفارش (فقط پیش از تأیید نهایی)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = OrdersApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val salesOrder : SalesOrder =  // SalesOrder | 
try {
    val result : SalesOrder = apiInstance.ordersIdPatch(id, salesOrder)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling OrdersApi#ordersIdPatch")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling OrdersApi#ordersIdPatch")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |
| **salesOrder** | [**SalesOrder**](SalesOrder.md)|  | |

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

 - **Content-Type**: application/json
 - **Accept**: application/json

<a id="ordersPost"></a>
# **ordersPost**
> SalesOrder ordersPost(salesOrder)

ثبت سفارش فروش (اعتبارسنجی اعتبار/قیمت/قانون قبل از تأیید)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = OrdersApi()
val salesOrder : SalesOrder =  // SalesOrder | 
try {
    val result : SalesOrder = apiInstance.ordersPost(salesOrder)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling OrdersApi#ordersPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling OrdersApi#ordersPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **salesOrder** | [**SalesOrder**](SalesOrder.md)|  | |

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

 - **Content-Type**: application/json
 - **Accept**: application/json

