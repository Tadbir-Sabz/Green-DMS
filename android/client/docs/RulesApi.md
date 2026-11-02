# RulesApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**rulesGet**](RulesApi.md#rulesGet) | **GET** /rules | فهرست قوانین و کنترل‌ها |
| [**rulesIdGet**](RulesApi.md#rulesIdGet) | **GET** /rules/{id} | جزئیات قاعده |
| [**rulesIdPatch**](RulesApi.md#rulesIdPatch) | **PATCH** /rules/{id} | به‌روزرسانی قاعده |
| [**rulesPost**](RulesApi.md#rulesPost) | **POST** /rules | تعریف قاعده (اثر مسدود/هشدار + پیام فارسی) |


<a id="rulesGet"></a>
# **rulesGet**
> RulesGet200Response rulesGet(cursor, limit, entity, event, isActive)

فهرست قوانین و کنترل‌ها

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = RulesApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val entity : kotlin.String = entity_example // kotlin.String | 
val event : kotlin.String = event_example // kotlin.String | 
val isActive : kotlin.Boolean = true // kotlin.Boolean | 
try {
    val result : RulesGet200Response = apiInstance.rulesGet(cursor, limit, entity, event, isActive)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling RulesApi#rulesGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling RulesApi#rulesGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **entity** | **kotlin.String**|  | [optional] |
| **event** | **kotlin.String**|  | [optional] |
| **isActive** | **kotlin.Boolean**|  | [optional] |

### Return type

[**RulesGet200Response**](RulesGet200Response.md)

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

<a id="rulesIdGet"></a>
# **rulesIdGet**
> Rule rulesIdGet(id)

جزئیات قاعده

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = RulesApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : Rule = apiInstance.rulesIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling RulesApi#rulesIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling RulesApi#rulesIdGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**Rule**](Rule.md)

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

<a id="rulesIdPatch"></a>
# **rulesIdPatch**
> Rule rulesIdPatch(id, rule)

به‌روزرسانی قاعده

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = RulesApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val rule : Rule =  // Rule | 
try {
    val result : Rule = apiInstance.rulesIdPatch(id, rule)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling RulesApi#rulesIdPatch")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling RulesApi#rulesIdPatch")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |
| **rule** | [**Rule**](Rule.md)|  | |

### Return type

[**Rule**](Rule.md)

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

<a id="rulesPost"></a>
# **rulesPost**
> Rule rulesPost(rule)

تعریف قاعده (اثر مسدود/هشدار + پیام فارسی)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = RulesApi()
val rule : Rule =  // Rule | 
try {
    val result : Rule = apiInstance.rulesPost(rule)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling RulesApi#rulesPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling RulesApi#rulesPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **rule** | [**Rule**](Rule.md)|  | |

### Return type

[**Rule**](Rule.md)

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

