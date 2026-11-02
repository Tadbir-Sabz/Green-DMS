# AreasApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**areasGet**](AreasApi.md#areasGet) | **GET** /areas | فهرست حوزه‌های فروش (سلسله‌مراتبی) |
| [**areasIdGet**](AreasApi.md#areasIdGet) | **GET** /areas/{id} | جزئیات حوزه |
| [**areasIdPatch**](AreasApi.md#areasIdPatch) | **PATCH** /areas/{id} | به‌روزرسانی حوزه |
| [**areasPost**](AreasApi.md#areasPost) | **POST** /areas | تعریف حوزه فروش |


<a id="areasGet"></a>
# **areasGet**
> AreasGet200Response areasGet(cursor, limit, parentAreaId)

فهرست حوزه‌های فروش (سلسله‌مراتبی)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = AreasApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val parentAreaId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : AreasGet200Response = apiInstance.areasGet(cursor, limit, parentAreaId)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling AreasApi#areasGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling AreasApi#areasGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **parentAreaId** | **java.util.UUID**|  | [optional] |

### Return type

[**AreasGet200Response**](AreasGet200Response.md)

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

<a id="areasIdGet"></a>
# **areasIdGet**
> Area areasIdGet(id)

جزئیات حوزه

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = AreasApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : Area = apiInstance.areasIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling AreasApi#areasIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling AreasApi#areasIdGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**Area**](Area.md)

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

<a id="areasIdPatch"></a>
# **areasIdPatch**
> Area areasIdPatch(id, area)

به‌روزرسانی حوزه

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = AreasApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val area : Area =  // Area | 
try {
    val result : Area = apiInstance.areasIdPatch(id, area)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling AreasApi#areasIdPatch")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling AreasApi#areasIdPatch")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |
| **area** | [**Area**](Area.md)|  | |

### Return type

[**Area**](Area.md)

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

<a id="areasPost"></a>
# **areasPost**
> Area areasPost(area)

تعریف حوزه فروش

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = AreasApi()
val area : Area =  // Area | 
try {
    val result : Area = apiInstance.areasPost(area)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling AreasApi#areasPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling AreasApi#areasPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **area** | [**Area**](Area.md)|  | |

### Return type

[**Area**](Area.md)

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

