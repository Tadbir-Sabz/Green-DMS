# RoutesApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**routesGet**](RoutesApi.md#routesGet) | **GET** /routes | فهرست مسیرهای پیمایشی (ترتیب بازدید هفتگی) |
| [**routesIdGet**](RoutesApi.md#routesIdGet) | **GET** /routes/{id} | جزئیات مسیر با ترتیب مشتریان |
| [**routesIdPatch**](RoutesApi.md#routesIdPatch) | **PATCH** /routes/{id} | به‌روزرسانی مسیر و ترتیب مشتریان |
| [**routesPost**](RoutesApi.md#routesPost) | **POST** /routes | تعریف مسیر فروش |


<a id="routesGet"></a>
# **routesGet**
> RoutesGet200Response routesGet(cursor, limit, areaId)

فهرست مسیرهای پیمایشی (ترتیب بازدید هفتگی)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = RoutesApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val areaId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : RoutesGet200Response = apiInstance.routesGet(cursor, limit, areaId)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling RoutesApi#routesGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling RoutesApi#routesGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **areaId** | **java.util.UUID**|  | [optional] |

### Return type

[**RoutesGet200Response**](RoutesGet200Response.md)

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

<a id="routesIdGet"></a>
# **routesIdGet**
> Route routesIdGet(id)

جزئیات مسیر با ترتیب مشتریان

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = RoutesApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : Route = apiInstance.routesIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling RoutesApi#routesIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling RoutesApi#routesIdGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**Route**](Route.md)

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

<a id="routesIdPatch"></a>
# **routesIdPatch**
> Route routesIdPatch(id, route)

به‌روزرسانی مسیر و ترتیب مشتریان

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = RoutesApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val route : Route =  // Route | 
try {
    val result : Route = apiInstance.routesIdPatch(id, route)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling RoutesApi#routesIdPatch")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling RoutesApi#routesIdPatch")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |
| **route** | [**Route**](Route.md)|  | |

### Return type

[**Route**](Route.md)

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

<a id="routesPost"></a>
# **routesPost**
> Route routesPost(route)

تعریف مسیر فروش

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = RoutesApi()
val route : Route =  // Route | 
try {
    val result : Route = apiInstance.routesPost(route)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling RoutesApi#routesPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling RoutesApi#routesPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **route** | [**Route**](Route.md)|  | |

### Return type

[**Route**](Route.md)

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

