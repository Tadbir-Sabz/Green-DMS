# ChequesApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**chequesGet**](ChequesApi.md#chequesGet) | **GET** /cheques | فهرست چک‌های دریافتی/پرداختی و سررسیدها |
| [**chequesIdGet**](ChequesApi.md#chequesIdGet) | **GET** /cheques/{id} | جزئیات چک |
| [**chequesIdPatch**](ChequesApi.md#chequesIdPatch) | **PATCH** /cheques/{id} | تعیین تکلیف چک (وصول/برگشت/واگذاری به بانک) |
| [**chequesPost**](ChequesApi.md#chequesPost) | **POST** /cheques | ثبت چک (دریافت از مشتری یا صدور برای تأمین‌کننده) |


<a id="chequesGet"></a>
# **chequesGet**
> ChequesGet200Response chequesGet(cursor, limit, direction, status, dueFrom, dueTo)

فهرست چک‌های دریافتی/پرداختی و سررسیدها

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ChequesApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val direction : kotlin.String = direction_example // kotlin.String | 
val status : kotlin.String = status_example // kotlin.String | 
val dueFrom : java.time.LocalDate = 2013-10-20 // java.time.LocalDate | 
val dueTo : java.time.LocalDate = 2013-10-20 // java.time.LocalDate | 
try {
    val result : ChequesGet200Response = apiInstance.chequesGet(cursor, limit, direction, status, dueFrom, dueTo)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ChequesApi#chequesGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ChequesApi#chequesGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **direction** | **kotlin.String**|  | [optional] [enum: received, issued] |
| **status** | **kotlin.String**|  | [optional] [enum: pending, cleared, bounced, returned] |
| **dueFrom** | **java.time.LocalDate**|  | [optional] |
| **dueTo** | **java.time.LocalDate**|  | [optional] |

### Return type

[**ChequesGet200Response**](ChequesGet200Response.md)

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

<a id="chequesIdGet"></a>
# **chequesIdGet**
> Cheque chequesIdGet(id)

جزئیات چک

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ChequesApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : Cheque = apiInstance.chequesIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ChequesApi#chequesIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ChequesApi#chequesIdGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**Cheque**](Cheque.md)

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

<a id="chequesIdPatch"></a>
# **chequesIdPatch**
> Cheque chequesIdPatch(id, cheque)

تعیین تکلیف چک (وصول/برگشت/واگذاری به بانک)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ChequesApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val cheque : Cheque =  // Cheque | 
try {
    val result : Cheque = apiInstance.chequesIdPatch(id, cheque)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ChequesApi#chequesIdPatch")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ChequesApi#chequesIdPatch")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |
| **cheque** | [**Cheque**](Cheque.md)|  | |

### Return type

[**Cheque**](Cheque.md)

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

<a id="chequesPost"></a>
# **chequesPost**
> Cheque chequesPost(cheque)

ثبت چک (دریافت از مشتری یا صدور برای تأمین‌کننده)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ChequesApi()
val cheque : Cheque =  // Cheque | 
try {
    val result : Cheque = apiInstance.chequesPost(cheque)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ChequesApi#chequesPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ChequesApi#chequesPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cheque** | [**Cheque**](Cheque.md)|  | |

### Return type

[**Cheque**](Cheque.md)

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

