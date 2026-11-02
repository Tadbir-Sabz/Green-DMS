# TreasuryApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**treasuryGet**](TreasuryApi.md#treasuryGet) | **GET** /treasury | مانده صندوق و بانک‌ها + مغایرت‌گیری (روزانه/دوره‌ای) |


<a id="treasuryGet"></a>
# **treasuryGet**
> TreasuryGet200Response treasuryGet(asOf, bankAccountId)

مانده صندوق و بانک‌ها + مغایرت‌گیری (روزانه/دوره‌ای)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = TreasuryApi()
val asOf : java.time.LocalDate = 2013-10-20 // java.time.LocalDate | 
val bankAccountId : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : TreasuryGet200Response = apiInstance.treasuryGet(asOf, bankAccountId)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling TreasuryApi#treasuryGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling TreasuryApi#treasuryGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **asOf** | **java.time.LocalDate**|  | [optional] |
| **bankAccountId** | **java.util.UUID**|  | [optional] |

### Return type

[**TreasuryGet200Response**](TreasuryGet200Response.md)

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

