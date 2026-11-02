# PaymentsApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**paymentsGet**](PaymentsApi.md#paymentsGet) | **GET** /payments | فهرست رسیدهای وصول (نقد/کارت/آنلاین/چک) |
| [**paymentsIdGet**](PaymentsApi.md#paymentsIdGet) | **GET** /payments/{id} | جزئیات رسید با تخصیص‌ها |
| [**paymentsPost**](PaymentsApi.md#paymentsPost) | **POST** /payments | ثبت وصول و تخصیص به فاکتورها |


<a id="paymentsGet"></a>
# **paymentsGet**
> PaymentsGet200Response paymentsGet(cursor, limit, customerId, kind)

فهرست رسیدهای وصول (نقد/کارت/آنلاین/چک)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = PaymentsApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val customerId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val kind : kotlin.String = kind_example // kotlin.String | 
try {
    val result : PaymentsGet200Response = apiInstance.paymentsGet(cursor, limit, customerId, kind)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling PaymentsApi#paymentsGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling PaymentsApi#paymentsGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **customerId** | **java.util.UUID**|  | [optional] |
| **kind** | **kotlin.String**|  | [optional] |

### Return type

[**PaymentsGet200Response**](PaymentsGet200Response.md)

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

<a id="paymentsIdGet"></a>
# **paymentsIdGet**
> PaymentReceipt paymentsIdGet(id)

جزئیات رسید با تخصیص‌ها

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = PaymentsApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : PaymentReceipt = apiInstance.paymentsIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling PaymentsApi#paymentsIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling PaymentsApi#paymentsIdGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**PaymentReceipt**](PaymentReceipt.md)

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

<a id="paymentsPost"></a>
# **paymentsPost**
> PaymentReceipt paymentsPost(paymentReceipt)

ثبت وصول و تخصیص به فاکتورها

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = PaymentsApi()
val paymentReceipt : PaymentReceipt =  // PaymentReceipt | 
try {
    val result : PaymentReceipt = apiInstance.paymentsPost(paymentReceipt)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling PaymentsApi#paymentsPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling PaymentsApi#paymentsPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **paymentReceipt** | [**PaymentReceipt**](PaymentReceipt.md)|  | |

### Return type

[**PaymentReceipt**](PaymentReceipt.md)

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

