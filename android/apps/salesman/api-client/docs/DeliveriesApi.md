# DeliveriesApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**deliveriesGet**](DeliveriesApi.md#deliveriesGet) | **GET** /deliveries | پیگیری توزیع — وضعیت حواله‌های هر تور/موزع |
| [**deliveriesIdGet**](DeliveriesApi.md#deliveriesIdGet) | **GET** /deliveries/{id} | جزئیات تحویل (POD با عکس و امضا) |
| [**deliveriesIdPatch**](DeliveriesApi.md#deliveriesIdPatch) | **PATCH** /deliveries/{id} | ثبت تحویل (جزئی/کامل) با POD |


<a id="deliveriesGet"></a>
# **deliveriesGet**
> DeliveriesGet200Response deliveriesGet(cursor, limit, tourId, status)

پیگیری توزیع — وضعیت حواله‌های هر تور/موزع

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = DeliveriesApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val tourId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val status : kotlin.String = status_example // kotlin.String | 
try {
    val result : DeliveriesGet200Response = apiInstance.deliveriesGet(cursor, limit, tourId, status)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling DeliveriesApi#deliveriesGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling DeliveriesApi#deliveriesGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **tourId** | **java.util.UUID**|  | [optional] |
| **status** | **kotlin.String**|  | [optional] [enum: planned, dispatched, delivered, partial, failed, cancelled] |

### Return type

[**DeliveriesGet200Response**](DeliveriesGet200Response.md)

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

<a id="deliveriesIdGet"></a>
# **deliveriesIdGet**
> Delivery deliveriesIdGet(id)

جزئیات تحویل (POD با عکس و امضا)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = DeliveriesApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : Delivery = apiInstance.deliveriesIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling DeliveriesApi#deliveriesIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling DeliveriesApi#deliveriesIdGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**Delivery**](Delivery.md)

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

<a id="deliveriesIdPatch"></a>
# **deliveriesIdPatch**
> Delivery deliveriesIdPatch(id, delivery)

ثبت تحویل (جزئی/کامل) با POD

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = DeliveriesApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val delivery : Delivery =  // Delivery | 
try {
    val result : Delivery = apiInstance.deliveriesIdPatch(id, delivery)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling DeliveriesApi#deliveriesIdPatch")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling DeliveriesApi#deliveriesIdPatch")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |
| **delivery** | [**Delivery**](Delivery.md)|  | |

### Return type

[**Delivery**](Delivery.md)

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

