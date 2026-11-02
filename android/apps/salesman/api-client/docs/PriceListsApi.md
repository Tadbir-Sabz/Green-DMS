# PriceListsApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**priceListsGet**](PriceListsApi.md#priceListsGet) | **GET** /price-lists | فهرست لیست‌های قیمت |
| [**priceListsIdGet**](PriceListsApi.md#priceListsIdGet) | **GET** /price-lists/{id} | جزئیات لیست قیمت با اقلامش |
| [**priceListsIdPatch**](PriceListsApi.md#priceListsIdPatch) | **PATCH** /price-lists/{id} | به‌روزرسانی لیست قیمت و اقلام آن |
| [**priceListsPost**](PriceListsApi.md#priceListsPost) | **POST** /price-lists | ساخت لیست قیمت |


<a id="priceListsGet"></a>
# **priceListsGet**
> PriceListsGet200Response priceListsGet(cursor, limit)

فهرست لیست‌های قیمت

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = PriceListsApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
try {
    val result : PriceListsGet200Response = apiInstance.priceListsGet(cursor, limit)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling PriceListsApi#priceListsGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling PriceListsApi#priceListsGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |

### Return type

[**PriceListsGet200Response**](PriceListsGet200Response.md)

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

<a id="priceListsIdGet"></a>
# **priceListsIdGet**
> PriceList priceListsIdGet(id)

جزئیات لیست قیمت با اقلامش

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = PriceListsApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : PriceList = apiInstance.priceListsIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling PriceListsApi#priceListsIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling PriceListsApi#priceListsIdGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**PriceList**](PriceList.md)

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

<a id="priceListsIdPatch"></a>
# **priceListsIdPatch**
> PriceList priceListsIdPatch(id, priceList)

به‌روزرسانی لیست قیمت و اقلام آن

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = PriceListsApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val priceList : PriceList =  // PriceList | 
try {
    val result : PriceList = apiInstance.priceListsIdPatch(id, priceList)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling PriceListsApi#priceListsIdPatch")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling PriceListsApi#priceListsIdPatch")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |
| **priceList** | [**PriceList**](PriceList.md)|  | |

### Return type

[**PriceList**](PriceList.md)

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

<a id="priceListsPost"></a>
# **priceListsPost**
> PriceList priceListsPost(priceList)

ساخت لیست قیمت

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = PriceListsApi()
val priceList : PriceList =  // PriceList | 
try {
    val result : PriceList = apiInstance.priceListsPost(priceList)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling PriceListsApi#priceListsPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling PriceListsApi#priceListsPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **priceList** | [**PriceList**](PriceList.md)|  | |

### Return type

[**PriceList**](PriceList.md)

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

