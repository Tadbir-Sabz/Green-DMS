# ApprovalsApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**approvalsGet**](ApprovalsApi.md#approvalsGet) | **GET** /approvals | صف تأیید کاربر جاری (سفارش/مرجوعی/اصلاحیه مبلغ‌محور) |
| [**approvalsIdDecisionPost**](ApprovalsApi.md#approvalsIdDecisionPost) | **POST** /approvals/{id}/decision | تصمیم تأییدکننده (تأیید/رد با توضیح) |


<a id="approvalsGet"></a>
# **approvalsGet**
> ApprovalsGet200Response approvalsGet(cursor, limit, entityType)

صف تأیید کاربر جاری (سفارش/مرجوعی/اصلاحیه مبلغ‌محور)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ApprovalsApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val entityType : kotlin.String = entityType_example // kotlin.String | 
try {
    val result : ApprovalsGet200Response = apiInstance.approvalsGet(cursor, limit, entityType)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ApprovalsApi#approvalsGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ApprovalsApi#approvalsGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **entityType** | **kotlin.String**|  | [optional] |

### Return type

[**ApprovalsGet200Response**](ApprovalsGet200Response.md)

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

<a id="approvalsIdDecisionPost"></a>
# **approvalsIdDecisionPost**
> ApprovalRequest approvalsIdDecisionPost(id, approvalsIdDecisionPostRequest)

تصمیم تأییدکننده (تأیید/رد با توضیح)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = ApprovalsApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val approvalsIdDecisionPostRequest : ApprovalsIdDecisionPostRequest =  // ApprovalsIdDecisionPostRequest | 
try {
    val result : ApprovalRequest = apiInstance.approvalsIdDecisionPost(id, approvalsIdDecisionPostRequest)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling ApprovalsApi#approvalsIdDecisionPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling ApprovalsApi#approvalsIdDecisionPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |
| **approvalsIdDecisionPostRequest** | [**ApprovalsIdDecisionPostRequest**](ApprovalsIdDecisionPostRequest.md)|  | |

### Return type

[**ApprovalRequest**](ApprovalRequest.md)

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

