# ArApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**arCustomerIdStatementGet**](ArApi.md#arCustomerIdStatementGet) | **GET** /ar/{customerId}/statement | صورتحساب دوره‌ای مشتری (صدور و ارسال پیامکی/پورتال) |
| [**arGet**](ArApi.md#arGet) | **GET** /ar | دفتر بدهکاری مشتریان و تحلیل سنی |


<a id="arCustomerIdStatementGet"></a>
# **arCustomerIdStatementGet**
> CustomerStatement arCustomerIdStatementGet(customerId, from, to)

صورتحساب دوره‌ای مشتری (صدور و ارسال پیامکی/پورتال)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ArApi()
val customerId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val from : java.time.LocalDate = 2013-10-20 // java.time.LocalDate | 
val to : java.time.LocalDate = 2013-10-20 // java.time.LocalDate | 
try {
    val result : CustomerStatement = apiInstance.arCustomerIdStatementGet(customerId, from, to)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ArApi#arCustomerIdStatementGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ArApi#arCustomerIdStatementGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **customerId** | **java.util.UUID**|  | |
| **from** | **java.time.LocalDate**|  | [optional] |
| **to** | **java.time.LocalDate**|  | [optional] |

### Return type

[**CustomerStatement**](CustomerStatement.md)

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

<a id="arGet"></a>
# **arGet**
> ArGet200Response arGet(cursor, limit, asOf, branchId)

دفتر بدهکاری مشتریان و تحلیل سنی

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ArApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val asOf : java.time.LocalDate = 2013-10-20 // java.time.LocalDate | 
val branchId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : ArGet200Response = apiInstance.arGet(cursor, limit, asOf, branchId)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ArApi#arGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ArApi#arGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **asOf** | **java.time.LocalDate**|  | [optional] |
| **branchId** | **java.util.UUID**|  | [optional] |

### Return type

[**ArGet200Response**](ArGet200Response.md)

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

