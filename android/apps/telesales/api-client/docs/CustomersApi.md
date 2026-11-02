# CustomersApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**customersGet**](CustomersApi.md#customersGet) | **GET** /customers | فهرست مشتریان (فیلتر مسیر/حوزه/فروشنده/کانال + جست‌وجو) |
| [**customersIdGet**](CustomersApi.md#customersIdGet) | **GET** /customers/{id} | جزئیات مشتری (با مانده اعتبار) |
| [**customersIdLocationPut**](CustomersApi.md#customersIdLocationPut) | **PUT** /customers/{id}/location | ثبت/تصحیح موقعیت جغرافیایی مشتری توسط فروشنده در نقشه |
| [**customersIdPatch**](CustomersApi.md#customersIdPatch) | **PATCH** /customers/{id} | به‌روزرسانی مشتری (مسیر، لیست قیمت، شرایط تسویه) |
| [**customersPost**](CustomersApi.md#customersPost) | **POST** /customers | ثبت مشتری جدید |


<a id="customersGet"></a>
# **customersGet**
> CustomersGet200Response customersGet(cursor, limit, q, routeId, areaId, salespersonId, channel, hasLocation)

فهرست مشتریان (فیلتر مسیر/حوزه/فروشنده/کانال + جست‌وجو)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = CustomersApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val q : kotlin.String = q_example // kotlin.String | 
val routeId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val areaId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val salespersonId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val channel : kotlin.String = channel_example // kotlin.String | 
val hasLocation : kotlin.Boolean = true // kotlin.Boolean | فقط دارای موقعیت ثبت‌شده
try {
    val result : CustomersGet200Response = apiInstance.customersGet(cursor, limit, q, routeId, areaId, salespersonId, channel, hasLocation)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling CustomersApi#customersGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling CustomersApi#customersGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **q** | **kotlin.String**|  | [optional] |
| **routeId** | **java.util.UUID**|  | [optional] |
| **areaId** | **java.util.UUID**|  | [optional] |
| **salespersonId** | **java.util.UUID**|  | [optional] |
| **channel** | **kotlin.String**|  | [optional] |
| **hasLocation** | **kotlin.Boolean**| فقط دارای موقعیت ثبت‌شده | [optional] |

### Return type

[**CustomersGet200Response**](CustomersGet200Response.md)

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

<a id="customersIdGet"></a>
# **customersIdGet**
> Customer customersIdGet(id)

جزئیات مشتری (با مانده اعتبار)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = CustomersApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : Customer = apiInstance.customersIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling CustomersApi#customersIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling CustomersApi#customersIdGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**Customer**](Customer.md)

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

<a id="customersIdLocationPut"></a>
# **customersIdLocationPut**
> Customer customersIdLocationPut(id, customersIdLocationPutRequest)

ثبت/تصحیح موقعیت جغرافیایی مشتری توسط فروشنده در نقشه

مختصات از GPS دستگاه گرفته می‌شود؛ سرور منبع (gps/network/mock) و دقت را ثبت می‌کند تا گزارش ضدتقلب ممکن باشد. 

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = CustomersApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val customersIdLocationPutRequest : CustomersIdLocationPutRequest =  // CustomersIdLocationPutRequest | 
try {
    val result : Customer = apiInstance.customersIdLocationPut(id, customersIdLocationPutRequest)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling CustomersApi#customersIdLocationPut")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling CustomersApi#customersIdLocationPut")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |
| **customersIdLocationPutRequest** | [**CustomersIdLocationPutRequest**](CustomersIdLocationPutRequest.md)|  | |

### Return type

[**Customer**](Customer.md)

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

<a id="customersIdPatch"></a>
# **customersIdPatch**
> Customer customersIdPatch(id, customer)

به‌روزرسانی مشتری (مسیر، لیست قیمت، شرایط تسویه)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = CustomersApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val customer : Customer =  // Customer | 
try {
    val result : Customer = apiInstance.customersIdPatch(id, customer)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling CustomersApi#customersIdPatch")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling CustomersApi#customersIdPatch")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |
| **customer** | [**Customer**](Customer.md)|  | |

### Return type

[**Customer**](Customer.md)

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

<a id="customersPost"></a>
# **customersPost**
> Customer customersPost(customer)

ثبت مشتری جدید

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = CustomersApi()
val customer : Customer =  // Customer | 
try {
    val result : Customer = apiInstance.customersPost(customer)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling CustomersApi#customersPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling CustomersApi#customersPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **customer** | [**Customer**](Customer.md)|  | |

### Return type

[**Customer**](Customer.md)

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

