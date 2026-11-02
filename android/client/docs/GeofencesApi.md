# GeofencesApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**geofencesGet**](GeofencesApi.md#geofencesGet) | **GET** /geofences | فهرست محدوده‌های جغرافیایی کار |
| [**geofencesIdDelete**](GeofencesApi.md#geofencesIdDelete) | **DELETE** /geofences/{id} | حذف محدوده |
| [**geofencesIdGet**](GeofencesApi.md#geofencesIdGet) | **GET** /geofences/{id} | جزئیات محدوده |
| [**geofencesIdPatch**](GeofencesApi.md#geofencesIdPatch) | **PATCH** /geofences/{id} | ویرایش محدوده (ویرایش polygon در نقشه) |
| [**geofencesPost**](GeofencesApi.md#geofencesPost) | **POST** /geofences | تعریف محدوده (چندضلعی) برای حوزه/مشتری/انبار |


<a id="geofencesGet"></a>
# **geofencesGet**
> GeofencesGet200Response geofencesGet(cursor, limit, isActive)

فهرست محدوده‌های جغرافیایی کار

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = GeofencesApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val isActive : kotlin.Boolean = true // kotlin.Boolean | 
try {
    val result : GeofencesGet200Response = apiInstance.geofencesGet(cursor, limit, isActive)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling GeofencesApi#geofencesGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling GeofencesApi#geofencesGet")
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

[**GeofencesGet200Response**](GeofencesGet200Response.md)

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

<a id="geofencesIdDelete"></a>
# **geofencesIdDelete**
> geofencesIdDelete(id)

حذف محدوده

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = GeofencesApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    apiInstance.geofencesIdDelete(id)
} catch (e: ClientException) {
    println("4xx response calling GeofencesApi#geofencesIdDelete")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling GeofencesApi#geofencesIdDelete")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

null (empty response body)

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

<a id="geofencesIdGet"></a>
# **geofencesIdGet**
> Geofence geofencesIdGet(id)

جزئیات محدوده

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = GeofencesApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : Geofence = apiInstance.geofencesIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling GeofencesApi#geofencesIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling GeofencesApi#geofencesIdGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**Geofence**](Geofence.md)

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

<a id="geofencesIdPatch"></a>
# **geofencesIdPatch**
> Geofence geofencesIdPatch(id, geofence)

ویرایش محدوده (ویرایش polygon در نقشه)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = GeofencesApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val geofence : Geofence =  // Geofence | 
try {
    val result : Geofence = apiInstance.geofencesIdPatch(id, geofence)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling GeofencesApi#geofencesIdPatch")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling GeofencesApi#geofencesIdPatch")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |
| **geofence** | [**Geofence**](Geofence.md)|  | |

### Return type

[**Geofence**](Geofence.md)

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

<a id="geofencesPost"></a>
# **geofencesPost**
> Geofence geofencesPost(geofence)

تعریف محدوده (چندضلعی) برای حوزه/مشتری/انبار

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = GeofencesApi()
val geofence : Geofence =  // Geofence | 
try {
    val result : Geofence = apiInstance.geofencesPost(geofence)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling GeofencesApi#geofencesPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling GeofencesApi#geofencesPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **geofence** | [**Geofence**](Geofence.md)|  | |

### Return type

[**Geofence**](Geofence.md)

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

