# RolesApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**rolesGet**](RolesApi.md#rolesGet) | **GET** /roles | فهرست نقش‌ها با مجوزهایشان |
| [**rolesIdDelete**](RolesApi.md#rolesIdDelete) | **DELETE** /roles/{id} | حذف نقش (فقط اگر کاربری نداشته باشد) |
| [**rolesIdGet**](RolesApi.md#rolesIdGet) | **GET** /roles/{id} | جزئیات نقش |
| [**rolesIdPatch**](RolesApi.md#rolesIdPatch) | **PATCH** /roles/{id} | به‌روزرسانی نقش (نقش‌های سیستمی is_system قابل حذف نیستند) |
| [**rolesPost**](RolesApi.md#rolesPost) | **POST** /roles | ساخت نقش با نگاشت مجوزها |


<a id="rolesGet"></a>
# **rolesGet**
> RolesGet200Response rolesGet(cursor, limit)

فهرست نقش‌ها با مجوزهایشان

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = RolesApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
try {
    val result : RolesGet200Response = apiInstance.rolesGet(cursor, limit)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling RolesApi#rolesGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling RolesApi#rolesGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |

### Return type

[**RolesGet200Response**](RolesGet200Response.md)

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

<a id="rolesIdDelete"></a>
# **rolesIdDelete**
> rolesIdDelete(id)

حذف نقش (فقط اگر کاربری نداشته باشد)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = RolesApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    apiInstance.rolesIdDelete(id)
} catch (e: ClientException) {
    println("4xx response calling RolesApi#rolesIdDelete")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling RolesApi#rolesIdDelete")
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

<a id="rolesIdGet"></a>
# **rolesIdGet**
> Role rolesIdGet(id)

جزئیات نقش

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = RolesApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : Role = apiInstance.rolesIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling RolesApi#rolesIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling RolesApi#rolesIdGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**Role**](Role.md)

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

<a id="rolesIdPatch"></a>
# **rolesIdPatch**
> Role rolesIdPatch(id, role)

به‌روزرسانی نقش (نقش‌های سیستمی is_system قابل حذف نیستند)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = RolesApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val role : Role =  // Role | 
try {
    val result : Role = apiInstance.rolesIdPatch(id, role)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling RolesApi#rolesIdPatch")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling RolesApi#rolesIdPatch")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |
| **role** | [**Role**](Role.md)|  | |

### Return type

[**Role**](Role.md)

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

<a id="rolesPost"></a>
# **rolesPost**
> Role rolesPost(role)

ساخت نقش با نگاشت مجوزها

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = RolesApi()
val role : Role =  // Role | 
try {
    val result : Role = apiInstance.rolesPost(role)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling RolesApi#rolesPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling RolesApi#rolesPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **role** | [**Role**](Role.md)|  | |

### Return type

[**Role**](Role.md)

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

