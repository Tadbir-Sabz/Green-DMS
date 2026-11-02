# PersonsApi

All URIs are relative to *http://localhost:4000/api/v1*

| Method | HTTP request | Description |
| ------------- | ------------- | ------------- |
| [**personsGet**](PersonsApi.md#personsGet) | **GET** /persons | فهرست اشخاص (حقیقی/حقوقی) با جست‌وجوی کد/نام/شناسه ملی |
| [**personsIdGet**](PersonsApi.md#personsIdGet) | **GET** /persons/{id} | جزئیات شخص |
| [**personsIdPatch**](PersonsApi.md#personsIdPatch) | **PATCH** /persons/{id} | به‌روزرسانی شخص (نام بر اساس legal_type الزامی می‌ماند) |
| [**personsPost**](PersonsApi.md#personsPost) | **POST** /persons | ثبت شخص جدید |


<a id="personsGet"></a>
# **personsGet**
> PersonsGet200Response personsGet(cursor, limit, q, legalType)

فهرست اشخاص (حقیقی/حقوقی) با جست‌وجوی کد/نام/شناسه ملی

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = PersonsApi()
val cursor : kotlin.String = cursor_example // kotlin.String | مقدار `next_cursor` صفحه قبلی
val limit : kotlin.Int = 56 // kotlin.Int | اندازه صفحه
val q : kotlin.String = q_example // kotlin.String | جست‌وجوی فازی نام/کد
val legalType : kotlin.String = legalType_example // kotlin.String | 
try {
    val result : PersonsGet200Response = apiInstance.personsGet(cursor, limit, q, legalType)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling PersonsApi#personsGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling PersonsApi#personsGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **cursor** | **kotlin.String**| مقدار &#x60;next_cursor&#x60; صفحه قبلی | [optional] |
| **limit** | **kotlin.Int**| اندازه صفحه | [optional] [default to 50] |
| **q** | **kotlin.String**| جست‌وجوی فازی نام/کد | [optional] |
| **legalType** | **kotlin.String**|  | [optional] [enum: natural, legal] |

### Return type

[**PersonsGet200Response**](PersonsGet200Response.md)

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

<a id="personsIdGet"></a>
# **personsIdGet**
> Person personsIdGet(id)

جزئیات شخص

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = PersonsApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
try {
    val result : Person = apiInstance.personsIdGet(id)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling PersonsApi#personsIdGet")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling PersonsApi#personsIdGet")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |

### Return type

[**Person**](Person.md)

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

<a id="personsIdPatch"></a>
# **personsIdPatch**
> Person personsIdPatch(id, person)

به‌روزرسانی شخص (نام بر اساس legal_type الزامی می‌ماند)

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = PersonsApi()
val id : java.util.UUID = 38400000-8cf0-11bd-b23e-10b96e4ef00d // java.util.UUID | 
val person : Person =  // Person | 
try {
    val result : Person = apiInstance.personsIdPatch(id, person)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling PersonsApi#personsIdPatch")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling PersonsApi#personsIdPatch")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **id** | **java.util.UUID**|  | |
| **person** | [**Person**](Person.md)|  | |

### Return type

[**Person**](Person.md)

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

<a id="personsPost"></a>
# **personsPost**
> Person personsPost(person)

ثبت شخص جدید

### Example
```kotlin
// Import classes:
//import com.greendms.api.client.infrastructure.*
//import com.greendms.api.client.models.*

val apiInstance = PersonsApi()
val person : Person =  // Person | 
try {
    val result : Person = apiInstance.personsPost(person)
    println(result)
} catch (e: ClientException) {
    println("4xx response calling PersonsApi#personsPost")
    e.printStackTrace()
} catch (e: ServerException) {
    println("5xx response calling PersonsApi#personsPost")
    e.printStackTrace()
}
```

### Parameters
| Name | Type | Description  | Notes |
| ------------- | ------------- | ------------- | ------------- |
| **person** | [**Person**](Person.md)|  | |

### Return type

[**Person**](Person.md)

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

