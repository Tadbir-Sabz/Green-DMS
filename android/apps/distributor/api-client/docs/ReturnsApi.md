# ReturnsApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**returnsGet**](ReturnsApi.md#returnsGet) | **GET** /returns | فهرست درخواست‌های مرجوعی |
| [**returnsIdApprovePost**](ReturnsApi.md#returnsIdApprovePost) | **POST** /returns/{id}/approve | تأیید مرجوعی (توسط مدیر/سرپرست طبق زنجیره تأیید) |
| [**returnsIdGet**](ReturnsApi.md#returnsIdGet) | **GET** /returns/{id} | جزئیات مرجوعی با اقلام و تعیین تکلیف کالا |
| [**returnsIdReceivePost**](ReturnsApi.md#returnsIdReceivePost) | **POST** /returns/{id}/receive | ثبت نهایی مرجوعی (تحویل کالا به انبار + تعیین تکلیف) |
| [**returnsPost**](ReturnsApi.md#returnsPost) | **POST** /returns | ثبت درخواست مرجوعی توسط فروشنده/مشتری |


<a id="returnsGet"></a>
# **returnsGet**
> ReturnsGet200Response returnsGet(cursor, limit, customerId, status)

فهرست درخواست‌های مرجوعی

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ReturnsApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val customerId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val status : kotlin.String = status_example // kotlin.String | 
try {
    val result : ReturnsGet200Response = apiInstance.returnsGet(cursor, limit, customerId, status)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ReturnsApi#returnsGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ReturnsApi#returnsGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **customerId** | **java.util.UUID**|  | [optional] |
| **status** | **kotlin.String**|  | [optional] [enum: draft, submitted, approved, partially_approved, rejected, posted, closed] |

### Return type

[**ReturnsGet200Response**](ReturnsGet200Response.md)

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

<a id="returnsIdApprovePost"></a>
# **returnsIdApprovePost**
> ReturnRequest returnsIdApprovePost(id)

تأیید مرجوعی (توسط مدیر/سرپرست طبق زنجیره تأیید)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ReturnsApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : ReturnRequest = apiInstance.returnsIdApprovePost(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ReturnsApi#returnsIdApprovePost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ReturnsApi#returnsIdApprovePost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**ReturnRequest**](ReturnRequest.md)

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

<a id="returnsIdGet"></a>
# **returnsIdGet**
> ReturnRequest returnsIdGet(id)

جزئیات مرجوعی با اقلام و تعیین تکلیف کالا

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ReturnsApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : ReturnRequest = apiInstance.returnsIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ReturnsApi#returnsIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ReturnsApi#returnsIdGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**ReturnRequest**](ReturnRequest.md)

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

<a id="returnsIdReceivePost"></a>
# **returnsIdReceivePost**
> ReturnRequest returnsIdReceivePost(id, returnsIdReceivePostRequest)

ثبت نهایی مرجوعی (تحویل کالا به انبار + تعیین تکلیف)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ReturnsApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val returnsIdReceivePostRequest : ReturnsIdReceivePostRequest =  // ReturnsIdReceivePostRequest | 
try {
    val result : ReturnRequest = apiInstance.returnsIdReceivePost(id, returnsIdReceivePostRequest)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ReturnsApi#returnsIdReceivePost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ReturnsApi#returnsIdReceivePost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |
| **returnsIdReceivePostRequest** | [**ReturnsIdReceivePostRequest**](ReturnsIdReceivePostRequest.md)|  | |

### Return type

[**ReturnRequest**](ReturnRequest.md)

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

<a id="returnsPost"></a>
# **returnsPost**
> ReturnRequest returnsPost(returnRequest)

ثبت درخواست مرجوعی توسط فروشنده/مشتری

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ReturnsApi()
val returnRequest : ReturnRequest =  // ReturnRequest | 
try {
    val result : ReturnRequest = apiInstance.returnsPost(returnRequest)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ReturnsApi#returnsPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ReturnsApi#returnsPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **returnRequest** | [**ReturnRequest**](ReturnRequest.md)|  | |

### Return type

[**ReturnRequest**](ReturnRequest.md)

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

