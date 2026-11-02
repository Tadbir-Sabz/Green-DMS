# PromotionsApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**promotionsGet**](PromotionsApi.md#promotionsGet) | **GET** /promotions | فهرست تخفیف‌ها و جوایز فعال |
| [**promotionsIdGet**](PromotionsApi.md#promotionsIdGet) | **GET** /promotions/{id} | جزئیات تشویق |
| [**promotionsIdPatch**](PromotionsApi.md#promotionsIdPatch) | **PATCH** /promotions/{id} | به‌روزرسانی تشویق |
| [**promotionsPost**](PromotionsApi.md#promotionsPost) | **POST** /promotions | تعریف تخفیف/جایزه جدید |


<a id="promotionsGet"></a>
# **promotionsGet**
> PromotionsGet200Response promotionsGet(cursor, limit, isActive)

فهرست تخفیف‌ها و جوایز فعال

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = PromotionsApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val isActive : kotlin.Boolean = true // kotlin.Boolean | 
try {
    val result : PromotionsGet200Response = apiInstance.promotionsGet(cursor, limit, isActive)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling PromotionsApi#promotionsGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling PromotionsApi#promotionsGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **isActive** | **kotlin.Boolean**|  | [optional] |

### Return type

[**PromotionsGet200Response**](PromotionsGet200Response.md)

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

<a id="promotionsIdGet"></a>
# **promotionsIdGet**
> Promotion promotionsIdGet(id)

جزئیات تشویق

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = PromotionsApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : Promotion = apiInstance.promotionsIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling PromotionsApi#promotionsIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling PromotionsApi#promotionsIdGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**Promotion**](Promotion.md)

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

<a id="promotionsIdPatch"></a>
# **promotionsIdPatch**
> Promotion promotionsIdPatch(id, promotion)

به‌روزرسانی تشویق

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = PromotionsApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val promotion : Promotion =  // Promotion | 
try {
    val result : Promotion = apiInstance.promotionsIdPatch(id, promotion)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling PromotionsApi#promotionsIdPatch")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling PromotionsApi#promotionsIdPatch")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |
| **promotion** | [**Promotion**](Promotion.md)|  | |

### Return type

[**Promotion**](Promotion.md)

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

<a id="promotionsPost"></a>
# **promotionsPost**
> Promotion promotionsPost(promotion)

تعریف تخفیف/جایزه جدید

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = PromotionsApi()
val promotion : Promotion =  // Promotion | 
try {
    val result : Promotion = apiInstance.promotionsPost(promotion)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling PromotionsApi#promotionsPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling PromotionsApi#promotionsPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **promotion** | [**Promotion**](Promotion.md)|  | |

### Return type

[**Promotion**](Promotion.md)

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

