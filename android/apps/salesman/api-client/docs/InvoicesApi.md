# InvoicesApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**invoicesGet**](InvoicesApi.md#invoicesGet) | **GET** /invoices | فهرست فاکتورهای فروش |
| [**invoicesIdGet**](InvoicesApi.md#invoicesIdGet) | **GET** /invoices/{id} | جزئیات فاکتور با اقلام و وضعیت ارسال مالیاتی |
| [**invoicesPost**](InvoicesApi.md#invoicesPost) | **POST** /invoices | صدور فاکتور از حواله تحویل‌شده |


<a id="invoicesGet"></a>
# **invoicesGet**
> InvoicesGet200Response invoicesGet(cursor, limit, customerId, status, moadianStatus)

فهرست فاکتورهای فروش

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = InvoicesApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val customerId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val status : kotlin.String = status_example // kotlin.String | 
val moadianStatus : kotlin.String = moadianStatus_example // kotlin.String | 
try {
    val result : InvoicesGet200Response = apiInstance.invoicesGet(cursor, limit, customerId, status, moadianStatus)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling InvoicesApi#invoicesGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling InvoicesApi#invoicesGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **customerId** | **java.util.UUID**|  | [optional] |
| **status** | **kotlin.String**|  | [optional] |
| **moadianStatus** | **kotlin.String**|  | [optional] |

### Return type

[**InvoicesGet200Response**](InvoicesGet200Response.md)

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

<a id="invoicesIdGet"></a>
# **invoicesIdGet**
> Invoice invoicesIdGet(id)

جزئیات فاکتور با اقلام و وضعیت ارسال مالیاتی

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = InvoicesApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : Invoice = apiInstance.invoicesIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling InvoicesApi#invoicesIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling InvoicesApi#invoicesIdGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**Invoice**](Invoice.md)

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

<a id="invoicesPost"></a>
# **invoicesPost**
> Invoice invoicesPost(invoice)

صدور فاکتور از حواله تحویل‌شده

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = InvoicesApi()
val invoice : Invoice =  // Invoice | 
try {
    val result : Invoice = apiInstance.invoicesPost(invoice)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling InvoicesApi#invoicesPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling InvoicesApi#invoicesPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **invoice** | [**Invoice**](Invoice.md)|  | |

### Return type

[**Invoice**](Invoice.md)

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

