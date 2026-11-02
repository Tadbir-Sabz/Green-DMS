# DefaultApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**invoicePostedPost**](DefaultApi.md#invoicePostedPost) | **POST** /invoicePosted | صدور قطعی فاکتور |
| [**orderStatusChangedPost**](DefaultApi.md#orderStatusChangedPost) | **POST** /orderStatusChanged | تغییر وضعیت سفارش |
| [**paymentReceivedPost**](DefaultApi.md#paymentReceivedPost) | **POST** /paymentReceived | ثبت وصول |


<a id="invoicePostedPost"></a>
# **invoicePostedPost**
> invoicePostedPost(invoicePostedPostRequest)

صدور قطعی فاکتور

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = DefaultApi()
val invoicePostedPostRequest : InvoicePostedPostRequest =  // InvoicePostedPostRequest | 
try {
    apiInstance.invoicePostedPost(invoicePostedPostRequest)
} catch (e: ClientException) {
    println("4xx response calling DefaultApi#invoicePostedPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling DefaultApi#invoicePostedPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **invoicePostedPostRequest** | [**InvoicePostedPostRequest**](InvoicePostedPostRequest.md)|  | [optional] |

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

 - **Content-Type**: application/json
 - **Accept**: Not defined

<a id="orderStatusChangedPost"></a>
# **orderStatusChangedPost**
> orderStatusChangedPost(orderStatusChangedPostRequest)

تغییر وضعیت سفارش

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = DefaultApi()
val orderStatusChangedPostRequest : OrderStatusChangedPostRequest =  // OrderStatusChangedPostRequest | 
try {
    apiInstance.orderStatusChangedPost(orderStatusChangedPostRequest)
} catch (e: ClientException) {
    println("4xx response calling DefaultApi#orderStatusChangedPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling DefaultApi#orderStatusChangedPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **orderStatusChangedPostRequest** | [**OrderStatusChangedPostRequest**](OrderStatusChangedPostRequest.md)|  | [optional] |

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

 - **Content-Type**: application/json
 - **Accept**: Not defined

<a id="paymentReceivedPost"></a>
# **paymentReceivedPost**
> paymentReceivedPost(paymentReceivedPostRequest)

ثبت وصول

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = DefaultApi()
val paymentReceivedPostRequest : PaymentReceivedPostRequest =  // PaymentReceivedPostRequest | 
try {
    apiInstance.paymentReceivedPost(paymentReceivedPostRequest)
} catch (e: ClientException) {
    println("4xx response calling DefaultApi#paymentReceivedPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling DefaultApi#paymentReceivedPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **paymentReceivedPostRequest** | [**PaymentReceivedPostRequest**](PaymentReceivedPostRequest.md)|  | [optional] |

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

 - **Content-Type**: application/json
 - **Accept**: Not defined

